/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  UserAgent,
  UserAgentState,
  Registerer,
  RegistererState,
  Inviter,
  Invitation,
  SessionState,
  type Session,
  type UserAgentOptions,
  type Core
} from 'sip.js'
import type { ActiveCall, CallEvent, CallEventState, LatencySample, StatsEntry } from './types'
import { phoneFromUri } from './types'
import { useSoftphoneStore } from './store'
import { useConfigStore } from './configStore'
import { useSipLogStore } from './sipLogStore'
import { useAudioDevicesStore } from './audioDevicesStore'
import { useRecordingsStore } from './recordings'
import { callStatsStore } from './callStats'
import { desktop } from './desktop'
import { sdhPool } from './sdhPool'

type UserAgentCore = Core.UserAgentCore

// ─── Live SIP state (non-reactive, engine-owned) ───────────────────────────
let ua: UserAgent | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
const registerers: Registerer[] = []
const regByCore = new Map<UserAgentCore, Registerer>()
let registererStates: RegistererState[] = []

const sessions = new Map<string, Session>()
const audioEls = new Map<string, HTMLAudioElement>()
const ringbacks = new Map<string, { stop(): void }>()
const recordingContexts = new Map<
  string,
  { recorder: MediaRecorder; chunks: Blob[]; ctx: AudioContext; eventId: string }
>()

// ─── Helpers ───────────────────────────────────────────────────────────────
const now = (): string => new Date().toISOString()
const randomId = (): string => Math.random().toString(36).slice(2, 10)
const store = (): ReturnType<typeof useSoftphoneStore.getState> => useSoftphoneStore.getState()

function normaliseUri(input: string, domain: string): string {
  if (input.startsWith('sip:') || input.startsWith('sips:')) return input
  return `sip:${input}@${domain}`
}

function domainFromEndpoint(endpoint: string): string {
  try {
    return new URL(endpoint).hostname
  } catch {
    return endpoint.split(':')[0].replace(/^wss?:\/\//, '')
  }
}

/**
 * SIP domain for the request-URI / AOR (REGISTER + INVITE). Uses the explicitly
 * configured domain, falling back to the first wss endpoint's hostname.
 */
function sipDomain(): string {
  const config = useConfigStore.getState()
  return config.domain.trim() || domainFromEndpoint(config.wssEndpoints[0] ?? '')
}

/**
 * SDP modifier that drops ICE candidate lines whose transport is TCP, so only
 * UDP candidates are offered/answered. (The browser still gathers TCP host
 * candidates internally — there's no standard API to disable that — but they're
 * never put on the wire.) Applied to outbound invites, answers and re-invites.
 */
function stripTcpCandidates(
  description: RTCSessionDescriptionInit
): Promise<RTCSessionDescriptionInit> {
  if (description.sdp) {
    description.sdp = description.sdp
      .split(/\r?\n/)
      .filter((line) => {
        const m = line.match(/^a=candidate:\S+ \d+ (\w+)/i)
        return !(m && m[1].toLowerCase() === 'tcp')
      })
      .join('\r\n')
  }
  return Promise.resolve(description)
}

/**
 * SDP modifier that keeps ONLY server-reflexive (srflx) ICE candidates — drops
 * host and relay. Enabled via the "ICE srflx only" WebRTC setting.
 */
function stripToSrflxOnly(
  description: RTCSessionDescriptionInit
): Promise<RTCSessionDescriptionInit> {
  if (description.sdp) {
    description.sdp = description.sdp
      .split(/\r?\n/)
      .filter((line) => !line.startsWith('a=candidate:') || /\btyp srflx\b/.test(line))
      .join('\r\n')
  }
  return Promise.resolve(description)
}

/** SDP modifiers to apply per call, based on current config. */
function sdpModifiers(): Array<
  (d: RTCSessionDescriptionInit) => Promise<RTCSessionDescriptionInit>
> {
  // srflx-only is a superset of TCP-strip (it removes everything non-srflx).
  return useConfigStore.getState().iceSrflxOnly ? [stripToSrflxOnly] : [stripTcpCandidates]
}

function deriveRegistrationState(): void {
  let state: RegistererState | null = null
  if (registererStates.length > 0) {
    state = registererStates.some((s) => s === RegistererState.Registered)
      ? RegistererState.Registered
      : RegistererState.Unregistered
  }
  useSoftphoneStore.setState({ registrationState: state })
}

// ─── Ringback tone (US standard: 440+480 Hz, 2s on / 4s off) ───────────────
function startRingback(): { stop(): void } {
  const ctx = new AudioContext()
  const tone = (freq: number): OscillatorNode => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = freq
    gain.gain.value = 0.08
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    return osc
  }
  let osc1: OscillatorNode | null = null
  let osc2: OscillatorNode | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = false
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
    stop() {
      stopped = true
      if (timer) clearTimeout(timer)
      osc1?.stop()
      osc2?.stop()
      ctx.close().catch(() => {})
    }
  }
}

function attachAudio(session: Session, audioEl: HTMLAudioElement): void {
  const sdh = (session as any).sessionDescriptionHandler
  if (!sdh) return
  const receiver = sdh.peerConnection
    ?.getReceivers()
    ?.find((r: RTCRtpReceiver) => r.track?.kind === 'audio')
  const stream: MediaStream | undefined =
    sdh.remoteMediaStream ?? (receiver?.track ? new MediaStream([receiver.track]) : undefined)
  if (stream) {
    audioEl.srcObject = stream
    audioEl.play().catch(() => {})
  }
}

function pcOf(callId: string): RTCPeerConnection | undefined {
  const session = sessions.get(callId)
  return (session as any)?.sessionDescriptionHandler?.peerConnection as
    | RTCPeerConnection
    | undefined
}

// ─── Recording ─────────────────────────────────────────────────────────────
function startRecording(callId: string, eventId: string): void {
  const call = store().activeCalls[callId]
  if (!call || call.recording) return
  const pc = pcOf(callId)
  if (!pc) return

  const audioCtx = new AudioContext()
  const dest = audioCtx.createMediaStreamDestination()

  const remoteTracks = pc
    .getReceivers()
    .map((r) => r.track)
    .filter((t): t is MediaStreamTrack => t?.kind === 'audio')
  if (remoteTracks.length) {
    audioCtx.createMediaStreamSource(new MediaStream(remoteTracks)).connect(dest)
  }
  const localTracks = pc
    .getSenders()
    .map((s) => s.track)
    .filter((t): t is MediaStreamTrack => t?.kind === 'audio')
  if (localTracks.length) {
    audioCtx.createMediaStreamSource(new MediaStream(localTracks)).connect(dest)
  }

  const recorder = new MediaRecorder(dest.stream)
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }
  recordingContexts.set(callId, { recorder, chunks, ctx: audioCtx, eventId })
  recorder.start(1000)
  store().patchActiveCall(callId, { recording: true })
}

function stopRecording(callId: string, eventId: string, contactPhone: string): void {
  const context = recordingContexts.get(callId)
  if (!context) return
  const { recorder, chunks, ctx } = context
  const call = store().activeCalls[callId]
  recorder.onstop = async () => {
    const blob = new Blob(chunks, { type: recorder.mimeType })
    await useRecordingsStore.getState().save({
      id: randomId(),
      callEventId: eventId,
      contactPhone,
      blob,
      createdAt: Date.now()
    })
    ctx.close().catch(() => {})
    recordingContexts.delete(callId)
    if (call) store().patchActiveCall(callId, { recording: false })
  }
  if (recorder.state !== 'inactive') recorder.stop()
}

function collectAndSaveStats(callId: string, eventId: string): void {
  const pc = pcOf(callId)
  if (!pc) return
  pc.getStats()
    .then((report) => {
      const entries: StatsEntry[] = []
      report.forEach((stat) => entries.push(stat as StatsEntry))
      return callStatsStore.save({ eventId, collectedAt: now(), entries })
    })
    .catch(() => {})
}

// ─── Session wiring ─────────────────────────────────────────────────────────
function wireSession(
  callId: string,
  remoteUri: string,
  displayName: string | undefined,
  eventId: string
): void {
  const session = sessions.get(callId)
  if (!session) return
  const phone = phoneFromUri(remoteUri)

  session.stateChange.addListener((newState: SessionState) => {
    store().patchActiveCall(callId, { state: newState })

    if (newState === SessionState.Established) {
      desktop.clearIncoming(callId)
      const connectedAt = now()
      store().patchActiveCall(callId, { connectedAt })
      store().updateCallEvent(phone, eventId, { connectedAt, state: 'active' })

      const audioEl = document.createElement('audio')
      audioEl.autoplay = true
      audioEls.set(callId, audioEl)
      attachAudio(session, audioEl)
      void useAudioDevicesStore.getState().applySinkId(audioEl)

      if (store().recordByDefault) startRecording(callId, eventId)
    }

    if (newState === SessionState.Terminated || newState === SessionState.Terminating) {
      desktop.clearIncoming(callId)
      const call = store().activeCalls[callId]
      const endedAt = now()
      const durationSeconds = call?.connectedAt
        ? Math.round((Date.now() - new Date(call.connectedAt).getTime()) / 1000)
        : undefined
      let finalState: CallEventState = 'ended'
      if (!call?.connectedAt) finalState = call?.direction === 'inbound' ? 'missed' : 'failed'
      store().updateCallEvent(phone, eventId, { endedAt, durationSeconds, state: finalState })
      store().upsertContact(phone, displayName)

      if (newState === SessionState.Terminated) {
        collectAndSaveStats(callId, eventId)
        if (call?.recording) stopRecording(callId, eventId, phone)
        const audioEl = audioEls.get(callId)
        if (audioEl) {
          audioEl.srcObject = null
          audioEl.remove()
          audioEls.delete(callId)
        }
        ringbacks.get(callId)?.stop()
        ringbacks.delete(callId)
        sessions.delete(callId)
        store().removeActiveCall(callId)
      }
    }
  })
}

// ─── Public engine API (called by the store's actions) ─────────────────────
export const sipEngine = {
  async init(): Promise<void> {
    if (ua) return
    const config = useConfigStore.getState()
    const endpoints = config.wssEndpoints
    if (endpoints.length === 0) return

    const domain = sipDomain()
    const audioDevices = useAudioDevicesStore.getState()

    // Contact transport param: match the endpoint scheme (wss:// → transport=wss,
    // ws:// → transport=ws). sip.js defaults to "ws" regardless.
    const contactTransport = endpoints[0].trim().toLowerCase().startsWith('wss') ? 'wss' : 'ws'

    const sdhFactoryOptions = {
      peerConnectionConfiguration: {
        iceServers: config.iceServers
        // (iceCandidatePoolSize intentionally unset — it could keep the ICE agent
        // gathering to maintain the pool and suppress the 'complete' transition.)
      },
      // Cap how long we wait for ICE gathering before sending the SDP. Default
      // is 5000ms; host candidates are gathered almost instantly, so a short
      // cap makes call setup snappy. (Do NOT use 0 — that disables the cap and
      // waits indefinitely for gathering to fully complete.)
      iceGatheringTimeout: 1000,
      constraints: {
        audio:
          audioDevices.selectedInputId && audioDevices.selectedInputId !== 'default'
            ? { deviceId: { exact: audioDevices.selectedInputId } }
            : true,
        video: false
      }
    }

    const options: UserAgentOptions = {
      uri: UserAgent.makeURI(`sip:${config.username}@${domain}`),
      authorizationUsername: config.username,
      authorizationPassword: config.password,
      contactParams: { transport: contactTransport },
      transportOptions: {
        server: endpoints[0],
        keepAliveInterval: 30,
        keepAliveDebounce: 10,
        keepAliveHistorySize: 60
      } as any,
      resolveServers: async () => endpoints,
      // Custom factory serves pre-warmed (pre-gathered) SDHs from a pool, with
      // transparent fallback to the default on-demand SDH when the pool is empty.
      sessionDescriptionHandlerFactory: sdhPool.factory,
      sessionDescriptionHandlerFactoryOptions: sdhFactoryOptions,
      delegate: {
        onInvite(invitation: Invitation) {
          const { from } = invitation.request
          const remoteUri = from.uri.toString()
          const phone = phoneFromUri(remoteUri)
          const displayName = from.displayName || undefined

          store().upsertContact(phone, displayName)

          const eventId = randomId()
          const call: ActiveCall = {
            id: invitation.id,
            direction: 'inbound',
            remoteUri,
            displayName,
            state: invitation.state,
            startedAt: now(),
            muted: false,
            held: false,
            holdPending: false,
            recording: false
          }
          sessions.set(call.id, invitation)
          store().setActiveCall(call)
          store().addCallEvent(phone, {
            id: eventId,
            callId: call.id,
            direction: 'inbound',
            startedAt: now(),
            state: 'connecting'
          })
          wireSession(call.id, remoteUri, displayName, eventId)
          useSoftphoneStore.setState({ selectedPhone: phone })
          desktop.notifyIncoming(call.id, displayName ?? phone)
          // Send 183 early-media (generated ringback) so the answer is built and
          // ICE connects DURING ringing → audio is ~instant when the user answers.
          // Pass the SDP modifiers so the early answer is TCP-stripped too.
          void invitation
            .progress({ statusCode: 183, sessionDescriptionHandlerModifiers: sdpModifiers() })
            .catch((e) =>
              useSipLogStore
                .getState()
                .append('warn', 'invitation', undefined, `183 early-media failed: ${String(e)}`)
            )
        }
      },
      userAgentString: 'pbx-client',
      logBuiltinEnabled: false,
      logLevel: 'debug',
      logConnector: (level, category, label, content) =>
        useSipLogStore.getState().append(level as any, category, label, content)
    }

    ua = new UserAgent(options)
    try {
      await ua.start()
    } catch (e) {
      useSipLogStore
        .getState()
        .append('error', 'transport', undefined, `Connection failed: ${String(e)}`)
      ua = null
      useSoftphoneStore.setState({ registrationState: null, registrationFlows: [] })
      return
    }

    // Start pre-warming SDHs now that the UA (logger) and config exist.
    sdhPool.start(ua, sdhFactoryOptions)

    // Bare UUID for +sip.instance (sip.js validates against its `uuid` grammar and
    // wraps it as <urn:uuid:…>). Use the persisted/custom value; fall back to a
    // generated one if it's missing or malformed.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const configuredInstanceId = config.instanceId.trim().toLowerCase()
    let instanceId = configuredInstanceId
    if (!UUID_RE.test(configuredInstanceId)) {
      if (configuredInstanceId) {
        useSipLogStore
          .getState()
          .append(
            'warn',
            'registerer',
            undefined,
            'Configured instance id is not a valid UUID; using a generated one'
          )
      }
      instanceId = globalThis.crypto.randomUUID()
    }
    registerers.length = 0
    regByCore.clear()
    const cores = (ua as any).userAgentCores as UserAgentCore[]
    registererStates = cores.map(() => RegistererState.Unregistered)
    useSoftphoneStore.setState({
      registrationFlows: endpoints.map((ep) => ({
        endpoint: ep,
        state: RegistererState.Unregistered,
        contacts: [],
        lastRegisteredAt: null
      }))
    })
    deriveRegistrationState()

    try {
      cores.forEach((core, i) => {
        const reg = new Registerer(ua!, { regId: i + 1, instanceId, userAgentCore: core } as any)
        reg.stateChange.addListener((state: RegistererState) => {
          registererStates[i] = state
          deriveRegistrationState()
          const flows = [...store().registrationFlows]
          flows[i] = {
            ...flows[i],
            state,
            contacts: state === RegistererState.Registered ? reg.contacts : [],
            lastRegisteredAt:
              state === RegistererState.Registered ? now() : flows[i].lastRegisteredAt
          }
          useSoftphoneStore.setState({ registrationFlows: flows })
        })
        registerers.push(reg)
        regByCore.set(core, reg)
      })
    } catch (e) {
      // Surface setup failures instead of silently leaving zero registerers.
      useSipLogStore
        .getState()
        .append('error', 'registerer', undefined, `Registerer setup failed: ${String(e)}`)
      return
    }

    const prevOnConnect = ua.delegate?.onConnect
    const prevOnDisconnect = ua.delegate?.onDisconnect
    ua.delegate = {
      ...ua.delegate,
      onConnect: (core?: UserAgentCore) => {
        prevOnConnect?.(core as any)
        if (reconnectTimer) {
          clearTimeout(reconnectTimer)
          reconnectTimer = null
        }
        const reg = core ? regByCore.get(core) : undefined
        if (reg) {
          if (reg.state !== RegistererState.Terminated) reg.register().catch(() => {})
        } else {
          // No/unmatched core (e.g. single transport) → (re)register every flow.
          registerers.forEach((r) => {
            if (r.state !== RegistererState.Terminated) r.register().catch(() => {})
          })
        }
      },
      onDisconnect: (error?: Error, core?: UserAgentCore) => {
        prevOnDisconnect?.(error as any, core as any)
        if (!error || ua?.state === UserAgentState.Stopped) return
        if (reconnectTimer) clearTimeout(reconnectTimer)
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null
          ua?.reconnect().catch(() => {})
        }, 4000)
      }
    } as any

    // ua.start() has resolved (first transport connected), so send the initial
    // REGISTER on every flow now. Flows whose transport connects later will be
    // (re)registered by the onConnect handler above.
    registerers.forEach((r) => r.register().catch(() => {}))
  },

  async destroy(): Promise<void> {
    sdhPool.stop()
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    try {
      await Promise.allSettled(
        Array.from(sessions.values()).map((s) => (s as any).bye?.() ?? Promise.resolve())
      )
      await Promise.allSettled(registerers.map((r) => r.unregister()))
      registerers.length = 0
      regByCore.clear()
      if (ua) {
        await ua.stop()
        ua = null
      }
    } finally {
      registererStates = []
      sessions.clear()
      useSoftphoneStore.setState({
        registrationState: null,
        registrationFlows: [],
        activeCalls: {}
      })
    }
  },

  makeCall(input: string): void {
    if (!ua) return
    const phone = input.trim()
    if (!phone) return
    const domain = sipDomain()
    const target = UserAgent.makeURI(normaliseUri(phone, domain))
    if (!target) return

    useSoftphoneStore.setState({ lastCallError: null })
    store().upsertContact(phone)
    store().recordDial(phone)

    const eventId = randomId()
    const inviter = new Inviter(ua, target, {
      sessionDescriptionHandlerModifiers: sdpModifiers(),
      sessionDescriptionHandlerModifiersReInvite: sdpModifiers()
    })
    const call: ActiveCall = {
      id: inviter.id,
      direction: 'outbound',
      remoteUri: normaliseUri(phone, domain),
      state: inviter.state,
      startedAt: now(),
      muted: false,
      held: false,
      holdPending: false,
      recording: false
    }
    sessions.set(call.id, inviter)
    store().setActiveCall(call)
    store().addCallEvent(phone, {
      id: eventId,
      callId: call.id,
      direction: 'outbound',
      startedAt: now(),
      state: 'connecting'
    })

    let ringback: { stop(): void } | null = null
    inviter.stateChange.addListener((state: SessionState) => {
      if (
        state === SessionState.Established ||
        state === SessionState.Terminated ||
        state === SessionState.Terminating
      ) {
        ringback?.stop()
        ringback = null
        ringbacks.delete(call.id)
      }
    })

    wireSession(call.id, call.remoteUri, undefined, eventId)

    inviter
      .invite({
        requestDelegate: {
          onTrying(response) {
            const { statusCode, reasonPhrase } = response.message
            store().patchActiveCall(call.id, {
              provisionalStatus:
                statusCode && reasonPhrase ? `${statusCode} ${reasonPhrase}` : undefined
            })
          },
          onProgress(response) {
            const { statusCode, reasonPhrase } = response.message
            store().patchActiveCall(call.id, {
              provisionalStatus:
                statusCode && reasonPhrase ? `${statusCode} ${reasonPhrase}` : undefined
            })
            if (statusCode === 180 && !ringback) {
              ringback = startRingback()
              ringbacks.set(call.id, ringback)
            }
            if (statusCode === 183 && ringback) {
              ringback.stop()
              ringback = null
              ringbacks.delete(call.id)
            }
          },
          onReject(response) {
            ringback?.stop()
            ringback = null
            ringbacks.delete(call.id)
            const code = response.message.statusCode ?? ''
            const reason = response.message.reasonPhrase ?? 'Call rejected'
            const msg = code ? `${code} ${reason}` : reason
            useSoftphoneStore.setState({ lastCallError: msg })
            store().updateCallEvent(phone, eventId, { failReason: msg })
          },
          onAccept() {
            ringback?.stop()
            ringback = null
            ringbacks.delete(call.id)
          }
        }
      })
      .catch(() => {})

    useSoftphoneStore.setState({ selectedPhone: phone })
  },

  answer(callId: string): void {
    const call = store().activeCalls[callId]
    const session = sessions.get(callId)
    if (!call || call.direction !== 'inbound' || !session) return
    ;(session as Invitation)
      .accept({ sessionDescriptionHandlerModifiers: sdpModifiers() })
      .then(() => {
        // Swap the early-media ringback for the real mic (replaceTrack — no SDP
        // change). No-op for the plain SDH fallback (no attachRealMic method).
        const sdh = (session as any).sessionDescriptionHandler
        return sdh && typeof sdh.attachRealMic === 'function' ? sdh.attachRealMic() : undefined
      })
      .catch(() => {})
  },

  hangup(callId: string): void {
    const call = store().activeCalls[callId]
    const session = sessions.get(callId)
    if (!call || !session) return
    if (session.state === SessionState.Initial || session.state === SessionState.Establishing) {
      if (call.direction === 'inbound') (session as Invitation).reject().catch(() => {})
      else (session as Inviter).cancel().catch(() => {})
    } else if (session.state === SessionState.Established) {
      session.bye().catch(() => {})
    }
  },

  toggleMute(callId: string): void {
    const call = store().activeCalls[callId]
    const pc = pcOf(callId)
    if (!call || !pc) return
    const newMuted = !call.muted
    pc.getSenders().forEach((sender) => {
      if (sender.track?.kind === 'audio') sender.track.enabled = !newMuted
    })
    store().patchActiveCall(callId, { muted: newMuted })
  },

  toggleHold(callId: string): void {
    const call = store().activeCalls[callId]
    const session = sessions.get(callId)
    if (!call || !session || session.state !== SessionState.Established || call.holdPending) return
    const hold = !call.held
    store().patchActiveCall(callId, { holdPending: true })
    ;(session as any).sessionDescriptionHandlerOptionsReInvite = { hold }
    session
      .invite({
        sessionDescriptionHandlerModifiers: sdpModifiers(),
        requestDelegate: {
          onAccept: () => store().patchActiveCall(callId, { held: hold, holdPending: false }),
          onReject: () => {
            ;(session as any).sessionDescriptionHandlerOptionsReInvite = { hold: !hold }
            store().patchActiveCall(callId, { holdPending: false })
          }
        }
      })
      .catch(() => store().patchActiveCall(callId, { holdPending: false }))
  },

  toggleRecording(callId: string): void {
    const call = store().activeCalls[callId]
    if (!call) return
    const phone = phoneFromUri(call.remoteUri)
    const events = store().callHistory[phone] ?? []
    const eventId = events.find((e) => e.state === 'active' || e.state === 'connecting')?.id ?? ''
    if (call.recording) stopRecording(callId, eventId, phone)
    else startRecording(callId, eventId)
  },

  async reregister(): Promise<void> {
    const log = useSipLogStore.getState().append
    // Engine never came up (e.g. config just entered) → start it.
    if (!ua) {
      await this.init()
      return
    }
    // Initial start failed before registerers were created → rebuild from scratch.
    if (registerers.length === 0) {
      log('log', 'registerer', undefined, 'Re-register: restarting SIP connection')
      await this.destroy()
      await this.init()
      return
    }
    // Reconnect any dropped transports first so REGISTER has something to send on.
    const cores = (ua as any).userAgentCores as UserAgentCore[]
    if (cores.some((c) => !(c.transport as any)?.isConnected?.())) {
      await ua.reconnect().catch(() => {})
    }
    log('log', 'registerer', undefined, `Re-registering ${registerers.length} flow(s)`)
    const results = await Promise.allSettled(registerers.map((r) => r.register()))
    const failed = results.filter((r) => r.status === 'rejected').length
    if (failed) {
      log(
        'warn',
        'registerer',
        undefined,
        `Re-register: ${failed}/${registerers.length} flow(s) could not be sent`
      )
    }
  },

  async applyInputDeviceToActiveCalls(): Promise<void> {
    const deviceId = useAudioDevicesStore.getState().selectedInputId
    const constraints =
      deviceId && deviceId !== 'default'
        ? { audio: { deviceId: { exact: deviceId } } }
        : { audio: true }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints)
    } catch {
      return
    }
    const [track] = stream.getAudioTracks()
    await Promise.all(
      Array.from(sessions.keys()).map(async (callId) => {
        const pc = pcOf(callId)
        if (!pc) return
        await Promise.all(
          pc
            .getSenders()
            .filter((s) => s.track?.kind === 'audio')
            .map((s) => s.replaceTrack(track))
        )
      })
    )
  },

  async applyOutputDeviceToActiveCalls(): Promise<void> {
    const audioDevices = useAudioDevicesStore.getState()
    await Promise.all(Array.from(audioEls.values()).map((el) => audioDevices.applySinkId(el)))
  },

  getCrlfLatencyHistory(index: number): LatencySample[] {
    return ((ua as any)?.transportCrlfLatencyHistories?.[index] ?? []) as LatencySample[]
  },

  async getCallStats(callId: string): Promise<RTCStatsReport | null> {
    const pc = pcOf(callId)
    return pc ? pc.getStats() : null
  }
}

// Helper used by callHistory state — re-export for convenience.
export type { CallEvent }
