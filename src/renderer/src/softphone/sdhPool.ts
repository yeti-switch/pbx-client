/* eslint-disable @typescript-eslint/no-explicit-any */
import { Web } from 'sip.js'
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
let pool: PooledSdh[] = []
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
  pool.push({ sdh, expiresAt: Date.now() + TTL_MS })
  log(`pool refill: spawned SDH prewarm#${id} (pool size ${pool.length})`)
}

function maintain(): void {
  if (!ua || !config) return
  const now = Date.now()
  // Drop expired entries.
  const before = pool.length
  pool = pool.filter((e) => {
    if (e.expiresAt <= now) {
      closeSdh(e.sdh)
      return false
    }
    return true
  })
  const dropped = before - pool.length
  if (dropped > 0) log(`maintain: dropped ${dropped} expired (TTL ${TTL_MS}ms), refilling`)
  // Top up to target.
  while (pool.length < TARGET_SIZE) spawnWarm()
}

function flush(): void {
  pool.forEach((e) => closeSdh(e.sdh))
  pool = []
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
   * SessionDescriptionHandlerFactory: serve a pre-warmed SDH if available,
   * otherwise fall back to sip.js's default (on-demand) factory.
   */
  factory(session: Session, options?: object): SessionDescriptionHandler {
    const now = Date.now()
    let entry = pool.shift()
    // Skip/close any expired entries.
    while (entry && entry.expiresAt <= now) {
      closeSdh(entry.sdh)
      entry = pool.shift()
    }
    queueMicrotask(maintain) // replenish
    if (entry) {
      log('served pre-warmed SDH — reusing pre-gathered candidates (no call-time ICE wait)')
      return entry.sdh
    }
    log('pool empty — building fresh on-demand SDH (ICE gathers at call time)')
    return defaultFactory(session, options as any)
  }
}
