import type { AppStatus } from '@shared/ipc'

/** Thin wrapper over the preload bridge for desktop integration (tray + notifications). */
export const desktop = {
  setStatus: (status: AppStatus): void => window.api.tray.setStatus(status),
  notifyIncoming: (callId: string, label: string): void =>
    window.api.notifications.showIncoming(callId, label),
  clearIncoming: (callId: string): void => window.api.notifications.clearIncoming(callId),
  onAnswer: (cb: (callId: string) => void): (() => void) => window.api.notifications.onAnswer(cb)
}
