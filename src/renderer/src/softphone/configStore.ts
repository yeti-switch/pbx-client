import { create } from 'zustand'
import { DEFAULT_SIP_CONFIG, type SipConfig } from '@shared/ipc'

interface ConfigState extends SipConfig {
  loaded: boolean
  /** Whether at least one wss endpoint is configured. */
  configured: () => boolean
  load: () => Promise<void>
  save: (cfg: SipConfig) => Promise<void>
  /** Apply a config received from the main process (e.g. config:changed). */
  apply: (cfg: SipConfig) => void
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  ...DEFAULT_SIP_CONFIG,
  loaded: false,
  configured: () => get().wssEndpoints.length > 0,
  load: async () => {
    const cfg = await window.api.config.get()
    set({ ...cfg, loaded: true })
  },
  save: async (cfg) => {
    await window.api.config.set(cfg)
    set({ ...cfg })
  },
  apply: (cfg) => set({ ...cfg })
}))

// Push updates from the main process into the store.
window.api.config.onChanged((cfg) => useConfigStore.getState().apply(cfg))
