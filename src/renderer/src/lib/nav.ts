import { create } from 'zustand'

export type NavItemId = 'dialer' | 'settings'

interface NavState {
  active: NavItemId
  setActive: (id: NavItemId) => void
}

/** Which top-level page is shown. A store (not local state) so non-React code
 * (e.g. the SIP engine on an incoming call) can navigate too. */
export const useNavStore = create<NavState>((set) => ({
  active: 'dialer',
  setActive: (id) => set({ active: id })
}))
