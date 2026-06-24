import { create } from 'zustand'
import { DEFAULT_SIP_CONFIG, type SipConfig, type ProvisioningResult } from '@shared/ipc'

interface ConfigState extends SipConfig {
  loaded: boolean
  /** Whether at least one wss endpoint is configured. */
  configured: () => boolean
  /** Whether the client is provisioned via Phone.Systems (SIP creds backend-managed). */
  isProvisioned: () => boolean
  load: () => Promise<void>
  save: (cfg: SipConfig) => Promise<void>
  /** Apply a config received from the main process (e.g. config:changed). */
  apply: (cfg: SipConfig) => void
  /** Provision the client with a Phone.Systems token (creates the backend app). */
  connectPhoneSystems: (token: string) => Promise<ProvisioningResult>
  /** Disconnect the client from Phone.Systems (deactivates the backend app). */
  disconnectPhoneSystems: () => Promise<ProvisioningResult>
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  ...DEFAULT_SIP_CONFIG,
  loaded: false,
  configured: () => get().wssEndpoints.length > 0,
  isProvisioned: () => get().provisioning != null,
  load: async () => {
    const cfg = await window.api.config.get()
    set({ ...cfg, loaded: true })
  },
  save: async (cfg) => {
    await window.api.config.set(cfg)
    set({ ...cfg })
  },
  apply: (cfg) => set({ ...cfg }),
  // The main process updates + broadcasts config on success (→ apply()).
  connectPhoneSystems: (token) => window.api.provisioning.connect(token),
  disconnectPhoneSystems: () => window.api.provisioning.disconnect()
}))

// Push updates from the main process into the store.
window.api.config.onChanged((cfg) => useConfigStore.getState().apply(cfg))
