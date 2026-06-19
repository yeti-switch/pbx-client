/* eslint-disable @typescript-eslint/no-explicit-any */
import { Web, Invitation } from 'sip.js'
import type {
  BodyAndContentType,
  Session,
  SessionDescriptionHandler,
  SessionDescriptionHandlerModifier,
  SessionDescriptionHandlerOptions,
  UserAgent
} from 'sip.js'
import { useSipLogStore } from './sipLogStore'
import { useAudioDevicesStore } from './audioDevicesStore'

/**
 * Pool of pre-warmed SessionDescriptionHandlers.
 *
 * Each pooled SDH (a PrewarmSessionDescriptionHandler) owns its own
 * RTCPeerConnection and FULLY pre-gathers ICE candidates ahead of the call via a
 * `sendrecv` audio transceiver with no track (no getUserMedia / no device
 * access) — leaving the PC in "have-local-offer" with a complete offer. When a
 * call is placed, the SDH's overridden getDescription attaches the mic with
 * replaceTrack (no SDP change) and returns the already-gathered offer verbatim —
 * no new offer, no re-gather, no call-time ICE wait.
 *
 * Wired in as UserAgentOptions.sessionDescriptionHandlerFactory. If the pool is
 * empty it transparently falls back to sip.js's default factory (which gathers
 * at call time), so calls always work.
 *
 * Concurrency-safe: each call pops a distinct SDH (its own PC). Pre-gathered
 * candidates go stale on network changes, so the pool is flushed + refilled on
 * online/offline, topped up when the window is shown, and on a TTL.
 */

type SdhConfig = {
  iceGatheringTimeout?: number
  peerConnectionConfiguration?: RTCConfiguration
}

interface PooledSdh {
  sdh: SessionDescriptionHandler
  expiresAt: number
}

const TARGET_SIZE = 1
const TTL_MS = 30_000
const SWEEP_MS = 10_000

const defaultFactory = Web.defaultSessionDescriptionHandlerFactory()
const mediaStreamFactory = Web.defaultMediaStreamFactory()

let ua: UserAgent | null = null
let config: SdhConfig | null = null
let offererPool: PooledSdh[] = [] // outbound: pre-gathered offer SDHs
let answererPool: PooledSdh[] = [] // inbound: stable PCs with prefetched ICE pool
let sweepTimer: ReturnType<typeof setInterval> | null = null
let listenersAttached = false
let seq = 0

const log = (msg: string): void =>
  useSipLogStore.getState().append('debug', 'sdh-pool', undefined, msg)

/**
 * Pre-gather ICE candidates on a pooled SDH's peer connection — no mic / no
 * device access (a `sendrecv` audio transceiver with NO track anchors the
 * transport and makes the offer the right shape for the eventual call).
 * Logged so gathering is visible. Leaves the PC in "have-local-offer".
 *
 * Using `sendrecv` (not recvonly) is what lets the call reuse the offer verbatim:
 * at call time we only `replaceTrack` the mic onto the existing sender (which
 * does NOT change the SDP or restart ICE), so no new offer / no re-gather.
 */
function preGather(sdh: SessionDescriptionHandler, id: number): void {
  const pc = (sdh as any).peerConnection as RTCPeerConnection | undefined
  if (!pc) return
  const t0 = Date.now()
  let candidates = 0
  let settleTimer: ReturnType<typeof setTimeout> | null = null
  let done = false
  let resolveReady: () => void = () => {}
  // Resolves when candidates have settled (NOT when iceGatheringState hits
  // 'complete' — that can lag indefinitely on dead/virtual interfaces).
  ;(sdh as any).__prewarmReady = new Promise<void>((r) => {
    resolveReady = r
  })
  const settle = (reason: string): void => {
    if (done) return
    done = true
    if (settleTimer) clearTimeout(settleTimer)
    log(`pre-gather #${id}: ${reason} — ${candidates} candidates in ${Date.now() - t0}ms`)
    resolveReady()
  }
  pc.addEventListener('icecandidate', (e) => {
    if (e.candidate) {
      candidates += 1
      if (settleTimer) clearTimeout(settleTimer)
      settleTimer = setTimeout(() => settle('settled (idle 250ms)'), 250)
    } else {
      settle('end-of-candidates')
    }
  })
  // Hard cap so a flow with no candidates at all can't hang the SDH forever.
  setTimeout(() => settle('settle cap (3s)'), 3000)
  pc.addTransceiver('audio', { direction: 'sendrecv' })
  pc.createOffer()
    .then((offer) => pc.setLocalDescription(offer))
    .then(() => log(`pre-gather #${id}: started (sendrecv, no mic/track)`))
    .catch((err) => log(`pre-gather #${id}: failed — ${String(err)}`))
}

/**
 * SDH that accepts a pre-gathered peer connection.
 *
 * The pre-gathered PC already holds a complete `sendrecv` offer + candidates and
 * sits in "have-local-offer". The stock getDescription would re-run
 * updateDirection/createOffer/setLocalDescription (which both reject that state
 * AND restart ICE). Instead, for the prepared case we DON'T create a new offer:
 * we just attach the mic via `replaceTrack` (no SDP change, no re-gather) and
 * return the already-set localDescription (with modifiers applied). Anything not
 * in the prepared state (re-INVITE / hold / fallback) uses the stock path.
 */
class PrewarmSessionDescriptionHandler extends Web.SessionDescriptionHandler {
  public getDescription(
    options?: SessionDescriptionHandlerOptions,
    modifiers?: Array<SessionDescriptionHandlerModifier>
  ): Promise<BodyAndContentType> {
    const pc = this.peerConnection
    if (!pc || pc.signalingState !== 'have-local-offer' || !pc.localDescription) {
      return super.getDescription(options, modifiers)
    }
    log('reusing pre-gathered offer — attaching mic via replaceTrack (no re-gather)')
    const inputId = useAudioDevicesStore.getState().selectedInputId
    // Soft deviceId (not `exact`) so a stale/missing device falls back to default
    // instead of throwing OverconstrainedError.
    const audio: MediaTrackConstraints | boolean =
      inputId && inputId !== 'default' ? { deviceId: inputId } : true
    const ready = (this as any).__prewarmReady as Promise<void> | undefined
    return navigator.mediaDevices
      .getUserMedia({ audio, video: false })
      .then(async (stream) => {
        const track = stream.getAudioTracks()[0]
        // The pre-gathered sendrecv transceiver's sender has no track yet.
        const sender = pc.getSenders().find((s) => !s.track) ?? pc.getSenders()[0]
        if (sender && track) await sender.replaceTrack(track) // no SDP/ICE change
        // Wait for candidates to have SETTLED during pre-warm (not for
        // iceGatheringState 'complete', which can never come). For a warm pooled
        // SDH this is already resolved → instant; localDescription holds the
        // gathered candidates, so we reuse it verbatim.
        if (ready) await ready
        const ld = pc.localDescription as RTCSessionDescription
        const desc = await this.applyModifiers({ type: ld.type, sdp: ld.sdp }, modifiers)
        return { body: desc.sdp ?? ld.sdp, contentType: 'application/sdp' }
      })
      .catch((err: unknown) => {
        // sip.js swallows the message; surface the real cause here.
        const e = err as { name?: string; message?: string }
        log(`reuse getDescription failed: ${e?.name ?? ''} ${e?.message ?? String(err)}`)
        throw err instanceof Error ? err : new Error(`${e?.name ?? 'Error'}: ${e?.message ?? ''}`)
      })
  }
}

// ─── Inbound: ringback early-media answerer ─────────────────────────────────

/** Generated ringback tone (US: 440+480 Hz, 2s on / 4s off) as a MediaStream. */
function createRingback(): { stream: MediaStream; stop: () => void } {
  const ctx = new AudioContext()
  const dest = ctx.createMediaStreamDestination()
  let osc1: OscillatorNode | null = null
  let osc2: OscillatorNode | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = false
  const tone = (freq: number): OscillatorNode => {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = freq
    g.gain.value = 0.2
    o.connect(g)
    g.connect(dest)
    o.start()
    return o
  }
  const ring = (): void => {
    if (stopped) return
    osc1 = tone(440)
    osc2 = tone(480)
    timer = setTimeout(() => {
      osc1?.stop()
      osc1 = null
      osc2?.stop()
      osc2 = null
      if (!stopped) timer = setTimeout(ring, 4000)
    }, 2000)
  }
  ring()
  return {
    stream: dest.stream,
    stop: () => {
      stopped = true
      if (timer) clearTimeout(timer)
      osc1?.stop()
      osc2?.stop()
      ctx.close().catch(() => {})
    }
  }
}

/** Resolve when ICE candidates have settled (250ms idle / end / cap) — NOT on
 * iceGatheringState 'complete' (which can lag indefinitely). */
function awaitGatherSettled(pc: RTCPeerConnection, timeout: number): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise<void>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let done = false
    const finish = (): void => {
      if (done) return
      done = true
      if (timer) clearTimeout(timer)
      pc.removeEventListener('icecandidate', onCand)
      pc.removeEventListener('icegatheringstatechange', onState)
      resolve()
    }
    const onCand = (e: RTCPeerConnectionIceEvent): void => {
      if (!e.candidate) finish()
      else {
        if (timer) clearTimeout(timer)
        timer = setTimeout(finish, 250)
      }
    }
    const onState = (): void => {
      if (pc.iceGatheringState === 'complete') finish()
    }
    pc.addEventListener('icecandidate', onCand)
    pc.addEventListener('icegatheringstatechange', onState)
    setTimeout(finish, timeout) // hard cap
  })
}

/**
 * Inbound SDH: builds the early-media (183) answer with a generated **ringback**
 * track instead of the mic (so the caller hears ringing during ringing and we
 * never open the mic before answer), and resolves ICE on candidate-settle.
 * On answer, `attachRealMic()` swaps the ringback for the real mic via
 * replaceTrack (no SDP change / no re-gather).
 */
class AnswererSessionDescriptionHandler extends Web.SessionDescriptionHandler {
  private ringback?: { stream: MediaStream; stop: () => void }

  protected getLocalMediaStream(): Promise<void> {
    if (!this.peerConnection) return Promise.reject(new Error('Peer connection closed.'))
    if (this.ringback) return Promise.resolve()
    log('answerer: using generated ringback as early-media (no mic)')
    this.ringback = createRingback()
    return this.setLocalMediaStream(this.ringback.stream)
  }

  protected waitForIceGatheringComplete(restart = false, timeout = 0): Promise<void> {
    const pc = this.peerConnection
    if (!pc) return Promise.resolve()
    if (!restart && pc.iceGatheringState === 'complete') return Promise.resolve()
    return awaitGatherSettled(pc, timeout || 1000)
  }

  /** Swap the ringback track for the real mic when the user answers. */
  async attachRealMic(): Promise<void> {
    const pc = this.peerConnection
    if (!pc) return
    const inputId = useAudioDevicesStore.getState().selectedInputId
    const audio: MediaTrackConstraints | boolean =
      inputId && inputId !== 'default' ? { deviceId: inputId } : true
    const stream = await navigator.mediaDevices.getUserMedia({ audio, video: false })
    const mic = stream.getAudioTracks()[0]
    const sender = pc.getSenders().find((s) => s.track?.kind === 'audio') ?? pc.getSenders()[0]
    if (sender && mic) await sender.replaceTrack(mic)
    this.ringback?.stop()
    this.ringback = undefined
    log('answerer: swapped ringback → real mic')
  }

  close(): void {
    this.ringback?.stop()
    this.ringback = undefined
    super.close()
  }
}

function buildAnswererSdh(id: number): SessionDescriptionHandler | null {
  if (!ua || !config) return null
  const logger = ua.getLogger('sip.SessionDescriptionHandler', `answerer#${id}`)
  return new AnswererSessionDescriptionHandler(logger, mediaStreamFactory, {
    iceGatheringTimeout: config.iceGatheringTimeout,
    // Pre-fetch a candidate pool while the PC sits idle in the pool (stable),
    // so the answer's candidates are ready and the 183 goes out faster.
    peerConnectionConfiguration: {
      ...config.peerConnectionConfiguration,
      iceCandidatePoolSize: 1
    }
  })
}

function spawnAnswerer(): void {
  const id = (seq += 1)
  const sdh = buildAnswererSdh(id)
  if (!sdh) return
  // No pre-offer — staying in "stable" lets iceCandidatePoolSize prefetch the
  // candidate pool, which the answer adopts at call time.
  answererPool.push({ sdh, expiresAt: Date.now() + TTL_MS })
  log(`pool refill: spawned answerer#${id} (answerer pool size ${answererPool.length})`)
}

function buildSdh(id: number): SessionDescriptionHandler | null {
  if (!ua || !config) return null
  try {
    // Tag the logger so every internal sip.js line from a pooled SDH is clearly
    // attributable (e.g. "prewarm#5") and never confused with the live call.
    const logger = ua.getLogger('sip.SessionDescriptionHandler', `prewarm#${id}`)
    return new PrewarmSessionDescriptionHandler(logger, mediaStreamFactory, {
      iceGatheringTimeout: config.iceGatheringTimeout,
      peerConnectionConfiguration: config.peerConnectionConfiguration
    })
  } catch {
    return null
  }
}

function closeSdh(sdh: SessionDescriptionHandler): void {
  try {
    sdh.close()
  } catch {
    /* ignore */
  }
}

function spawnWarm(): void {
  const id = (seq += 1)
  const sdh = buildSdh(id)
  if (!sdh) return
  preGather(sdh, id)
  offererPool.push({ sdh, expiresAt: Date.now() + TTL_MS })
  log(`pool refill: spawned SDH prewarm#${id} (offerer pool size ${offererPool.length})`)
}

function dropExpired(p: PooledSdh[]): PooledSdh[] {
  const now = Date.now()
  return p.filter((e) => {
    if (e.expiresAt <= now) {
      closeSdh(e.sdh)
      return false
    }
    return true
  })
}

function maintain(): void {
  if (!ua || !config) return
  offererPool = dropExpired(offererPool)
  answererPool = dropExpired(answererPool)
  while (offererPool.length < TARGET_SIZE) spawnWarm()
  while (answererPool.length < TARGET_SIZE) spawnAnswerer()
}

function flush(): void {
  offererPool.forEach((e) => closeSdh(e.sdh))
  answererPool.forEach((e) => closeSdh(e.sdh))
  offererPool = []
  answererPool = []
}

function onNetworkChange(): void {
  log('network changed — refreshing pre-warmed SDH pool')
  flush()
  maintain()
}

function onVisible(): void {
  // setInterval is throttled/paused while the window is hidden (tray), so the
  // pool can lapse. Top it back up when the window is shown again.
  if (document.visibilityState === 'visible') {
    log('window shown — topping up pre-warmed SDH pool')
    maintain()
  }
}

function attachListeners(): void {
  if (listenersAttached) return
  // Only true network changes invalidate gathered candidates. (devicechange
  // fires on getUserMedia and is unrelated to ICE — do not refresh on it.)
  window.addEventListener('online', onNetworkChange)
  window.addEventListener('offline', onNetworkChange)
  document.addEventListener('visibilitychange', onVisible)
  listenersAttached = true
}

function detachListeners(): void {
  if (!listenersAttached) return
  window.removeEventListener('online', onNetworkChange)
  window.removeEventListener('offline', onNetworkChange)
  document.removeEventListener('visibilitychange', onVisible)
  listenersAttached = false
}

export const sdhPool = {
  /** Start the pool for a UserAgent with the given SDH config. */
  start(userAgent: UserAgent, sdhConfig: SdhConfig): void {
    ua = userAgent
    config = sdhConfig
    log(`pool start (target ${TARGET_SIZE}, TTL ${TTL_MS}ms, sweep ${SWEEP_MS}ms)`)
    flush()
    maintain()
    attachListeners()
    if (!sweepTimer) sweepTimer = setInterval(maintain, SWEEP_MS)
  },

  /** Tear down the pool (engine destroy / config change). */
  stop(): void {
    if (sweepTimer) {
      clearInterval(sweepTimer)
      sweepTimer = null
    }
    detachListeners()
    flush()
    ua = null
    config = null
  },

  /**
   * SessionDescriptionHandlerFactory:
   * - OUTBOUND (Inviter): serve a pre-gathered offerer SDH (reuse offer, no wait).
   * - INBOUND (Invitation): serve a stable answerer SDH whose candidate pool was
   *   pre-fetched (iceCandidatePoolSize) so the 183 answer is built faster.
   * Both fall back to a freshly built SDH when their pool is empty.
   */
  factory(session: Session, options?: object): SessionDescriptionHandler {
    const now = Date.now()
    const take = (p: PooledSdh[]): PooledSdh | undefined => {
      let entry = p.shift()
      while (entry && entry.expiresAt <= now) {
        closeSdh(entry.sdh)
        entry = p.shift()
      }
      queueMicrotask(maintain) // replenish
      return entry
    }

    if (session instanceof Invitation) {
      const entry = take(answererPool)
      if (entry) {
        log('inbound call — served pre-warmed answerer SDH (prefetched ICE pool)')
        return entry.sdh
      }
      const fresh = buildAnswererSdh((seq += 1))
      log(`inbound call — ${fresh ? 'fresh answerer SDH' : 'default SDH (pool not started)'}`)
      return fresh ?? defaultFactory(session, options as any)
    }

    const entry = take(offererPool)
    if (entry) {
      log('outbound call — served pre-warmed offerer SDH (reusing pre-gathered offer)')
      return entry.sdh
    }
    log('outbound call — pool empty, fresh on-demand SDH (ICE gathers at call time)')
    return defaultFactory(session, options as any)
  }
}
