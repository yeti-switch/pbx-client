import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC, type AppStatus, type SipConfig } from '../shared/ipc'

// Custom APIs for renderer — the softphone bridge surface.
const api = {
  config: {
    get: (): Promise<SipConfig> => ipcRenderer.invoke(IPC.configGet),
    set: (cfg: SipConfig): Promise<void> => ipcRenderer.invoke(IPC.configSet, cfg),
    path: (): Promise<string> => ipcRenderer.invoke(IPC.configPath),
    onChanged: (cb: (cfg: SipConfig) => void): (() => void) => {
      const listener = (_e: unknown, cfg: SipConfig): void => cb(cfg)
      ipcRenderer.on(IPC.configChanged, listener)
      return () => ipcRenderer.removeListener(IPC.configChanged, listener)
    }
  },
  tray: {
    setStatus: (status: AppStatus): void => ipcRenderer.send(IPC.appSetStatus, status)
  },
  notifications: {
    showIncoming: (callId: string, label: string): void =>
      ipcRenderer.send(IPC.notifyIncoming, { callId, label }),
    clearIncoming: (callId: string): void => ipcRenderer.send(IPC.clearIncoming, callId),
    /** Fired when the user accepts an incoming-call notification. */
    onAnswer: (cb: (callId: string) => void): (() => void) => {
      const listener = (_e: unknown, callId: string): void => cb(callId)
      ipcRenderer.on(IPC.answerCall, listener)
      return () => ipcRenderer.removeListener(IPC.answerCall, listener)
    }
  }
}

export type PbxApi = typeof api

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
