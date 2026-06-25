/**
 * Shared IPC contract between main, preload and renderer.
 */

export interface SipConfig {
  /** SIP auth user (the user part registered at the endpoint). */
  username: string
  /** SIP auth password. */
  password: string
  /**
   * SIP domain used in the request-URI / AOR for REGISTER and INVITE
   * (i.e. the domain in `sip:user@domain`). Independent of the wss transport
   * host. When blank, falls back to the hostname of the first wss endpoint.
   */
  domain: string
  /**
   * RFC 5626 +sip.instance UUID. Generated and persisted on first run; can be
   * regenerated or overridden with a customer-provided value. Bare UUID (no
   * "urn:uuid:" prefix).
   */
  instanceId: string
  /** One or more wss:// SIP endpoints (transport only). */
  wssEndpoints: string[]
  /** Optional ICE servers for WebRTC. */
  iceServers: RTCIceServer[]
  /**
   * When true, strip all ICE candidates except server-reflexive (srflx) from
   * offers/answers — useful when only the public path matters and host/relay
   * candidates just add noise/latency. (Risky if STUN yields no srflx.)
   */
  iceSrflxOnly: boolean
  /**
   * Advanced: value passed to Chromium's `--force-fieldtrials` at startup (e.g.
   * `WebRTC-IceFieldTrials/initial_select_dampening:100/`). Applied in the main
   * process before the app starts — GLOBAL and requires an app restart to take
   * effect. Leave blank for defaults.
   */
  webrtcFieldTrials: string
  /** Id of the ringtone played on incoming calls (see RINGTONES). */
  ringtone: string
  /**
   * Ordered list of ENABLED audio codec names (rtpmap subtype, e.g. "opus",
   * "G722", "PCMU", "PCMA"), highest priority first. Codecs not listed are
   * disabled (removed from offers/answers). Empty = browser default (no change).
   * Auxiliary codecs (telephone-event/CN/RED) are always preserved.
   */
  audioCodecs: string[]
  /**
   * Phone.Systems provisioning. Non-null when the client is provisioned (a
   * "mobile_applications" resource was created on the backend). While set, the
   * SIP credentials above are backend-managed and treated as read-only.
   */
  provisioning: ProvisioningInfo | null
}

export type PhoneSystemsEnv = 'production' | 'staging' | 'sandbox'

/** Details of the provisioned Phone.Systems application (shown in Settings). */
export interface ProvisioningInfo {
  environment: PhoneSystemsEnv
  /** The mobile_applications resource id (also used as the SIP +sip.instance). */
  applicationUuid: string
  /** Bearer/raw access token for authenticated Phone.Systems API calls. */
  accessToken: string
  ownerId: number | null
  /** Owner/contact display name for the status card (best-effort). */
  ownerName: string | null
  /** ISO timestamp of when the client was provisioned. */
  connectedAt: string
}

/** Result of a connect/disconnect provisioning request. */
export interface ProvisioningResult {
  ok: boolean
  error?: string
}

export const DEFAULT_SIP_CONFIG: SipConfig = {
  username: '',
  password: '',
  domain: '',
  instanceId: '',
  wssEndpoints: [],
  iceServers: [],
  iceSrflxOnly: false,
  webrtcFieldTrials: '',
  ringtone: 'classic',
  audioCodecs: [],
  provisioning: null
}

/** Softphone status the renderer pushes to the main process (drives the tray). */
export interface AppStatus {
  registered: boolean
  inCall: boolean
  incoming: boolean
  /** Human-readable detail for the tray tooltip. */
  detail: string
}

export interface IncomingCallPayload {
  callId: string
  label: string
}

/** App/runtime info for the About section. */
export interface AppInfo {
  version: string
  electron: string
  chrome: string
  node: string
  /** Epoch ms when the app process started (for uptime). */
  startedAt: number
}

/** IPC channel names — keep renderer/main in sync. */
export const IPC = {
  configGet: 'config:get',
  configSet: 'config:set',
  configChanged: 'config:changed',
  configPath: 'config:path',
  // Tray / status
  appSetStatus: 'app:set-status',
  // Native notifications (shown from the main process)
  notifyIncoming: 'app:notify-incoming',
  clearIncoming: 'app:clear-incoming',
  // main → renderer: user accepted/rejected the incoming-call notification
  answerCall: 'call:answer',
  rejectCall: 'call:reject',
  // App/runtime info (About section)
  appInfo: 'app:info',
  // Phone.Systems provisioning (handled in the main process)
  provisioningConnect: 'provisioning:connect',
  provisioningDisconnect: 'provisioning:disconnect'
} as const
