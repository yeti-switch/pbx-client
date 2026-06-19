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
}

export const DEFAULT_SIP_CONFIG: SipConfig = {
  username: '',
  password: '',
  domain: '',
  instanceId: '',
  wssEndpoints: [],
  iceServers: []
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
  // main → renderer: user accepted the incoming-call notification
  answerCall: 'call:answer'
} as const
