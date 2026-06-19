/**
 * Softphone domain types. The call/registration state enums come straight from
 * the sip.js fork so the engine, store and UI all share one type.
 */
import { SessionState, RegistererState } from 'sip.js'

export { SessionState, RegistererState }

export type LogLevel = 'debug' | 'log' | 'warn' | 'error'

export type CallDirection = 'inbound' | 'outbound'

export type CallEventState = 'connecting' | 'active' | 'ended' | 'failed' | 'missed'

export interface CallEvent {
  id: string
  callId?: string
  direction: CallDirection
  startedAt: string
  connectedAt?: string
  endedAt?: string
  durationSeconds?: number
  state: CallEventState
  failReason?: string
}

export interface Contact {
  phone: string
  displayName?: string
  lastCallAt: string
}

export interface RegistrationFlow {
  endpoint: string
  state: RegistererState
  contacts: string[]
  lastRegisteredAt: string | null
}

export interface ActiveCall {
  id: string
  direction: CallDirection
  remoteUri: string
  displayName?: string
  state: SessionState
  startedAt: string
  connectedAt?: string
  muted: boolean
  held: boolean
  holdPending: boolean
  recording: boolean
  provisionalStatus?: string
}

export interface LatencySample {
  timestamp: number
  rttMs: number | null
}

export interface SipLogEntry {
  id: number
  level: LogLevel
  category: string
  label: string | undefined
  content: string
  timestamp: string
}

export interface AudioDevice {
  deviceId: string
  label: string
}

export interface StatsEntry {
  id: string
  type: string
  [key: string]: unknown
}

export interface Recording {
  id: string
  callEventId: string
  contactPhone: string
  blob: Blob
  createdAt: number
}

export function phoneFromUri(uri: string): string {
  const match = uri.match(/^sips?:([^@]+)(?:@.*)?$/)
  return match ? match[1] : uri
}
