import { create } from 'zustand'
import type { AudioDevice } from './types'

const LS_INPUT = 'softphone:audio-input'
const LS_OUTPUT = 'softphone:audio-output'

const sinkIdSupported =
  typeof HTMLAudioElement !== 'undefined' && 'setSinkId' in HTMLAudioElement.prototype

interface AudioDevicesState {
  inputs: AudioDevice[]
  outputs: AudioDevice[]
  selectedInputId: string
  selectedOutputId: string
  sinkIdSupported: boolean
  enumerate: () => Promise<void>
  selectInput: (id: string) => void
  selectOutput: (id: string) => void
  applySinkId: (el: HTMLAudioElement) => Promise<void>
}

export const useAudioDevicesStore = create<AudioDevicesState>((set, get) => ({
  inputs: [],
  outputs: [],
  selectedInputId: localStorage.getItem(LS_INPUT) ?? 'default',
  selectedOutputId: localStorage.getItem(LS_OUTPUT) ?? 'default',
  sinkIdSupported,
  enumerate: async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      set({
        inputs: devices
          .filter((d) => d.kind === 'audioinput')
          .map((d) => ({
            deviceId: d.deviceId,
            label: d.label || `Microphone (${d.deviceId.slice(0, 8)})`
          })),
        outputs: devices
          .filter((d) => d.kind === 'audiooutput')
          .map((d) => ({
            deviceId: d.deviceId,
            label: d.label || `Speaker (${d.deviceId.slice(0, 8)})`
          }))
      })
    } catch {
      // permission not granted yet
    }
  },
  selectInput: (id) => {
    localStorage.setItem(LS_INPUT, id)
    set({ selectedInputId: id })
  },
  selectOutput: (id) => {
    localStorage.setItem(LS_OUTPUT, id)
    set({ selectedOutputId: id })
  },
  applySinkId: async (el) => {
    if (!get().sinkIdSupported) return
    try {
      await (el as HTMLAudioElement & { setSinkId(id: string): Promise<void> }).setSinkId(
        get().selectedOutputId
      )
    } catch {
      // deviceId may no longer be valid
    }
  }
}))

if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
  navigator.mediaDevices.addEventListener('devicechange', () => {
    void useAudioDevicesStore.getState().enumerate()
  })
}
