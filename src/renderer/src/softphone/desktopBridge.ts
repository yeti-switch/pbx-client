import type { AppStatus } from '@shared/ipc'
import { useSoftphoneStore } from './store'
import { RegistererState, SessionState, phoneFromUri } from './types'
import { desktop } from './desktop'

function computeStatus(state: ReturnType<typeof useSoftphoneStore.getState>): AppStatus {
  const calls = Object.values(state.activeCalls)
  const incomingCall = calls.find(
    (c) =>
      c.direction === 'inbound' &&
      (c.state === SessionState.Initial || c.state === SessionState.Establishing)
  )
  const inCall = calls.some((c) => c.state === SessionState.Established)
  const registered = state.registrationState === RegistererState.Registered

  let detail = registered ? 'Registered' : 'Not registered'
  if (incomingCall) {
    detail = `Incoming call from ${incomingCall.displayName ?? phoneFromUri(incomingCall.remoteUri)}`
  } else if (inCall) {
    detail = 'In call'
  }
  return { registered, inCall, incoming: Boolean(incomingCall), detail }
}

/**
 * Bridges the softphone store to the OS desktop integration:
 *  - pushes status to the tray whenever it changes
 *  - answers a call when the user clicks the incoming-call notification
 * Call once at startup.
 */
export function initDesktopBridge(): void {
  let lastKey = ''
  const push = (): void => {
    const status = computeStatus(useSoftphoneStore.getState())
    const key = JSON.stringify(status)
    if (key !== lastKey) {
      lastKey = key
      desktop.setStatus(status)
    }
  }
  push()
  useSoftphoneStore.subscribe(push)
  desktop.onAnswer((callId) => useSoftphoneStore.getState().answer(callId))
  desktop.onReject((callId) => useSoftphoneStore.getState().hangup(callId))
}
