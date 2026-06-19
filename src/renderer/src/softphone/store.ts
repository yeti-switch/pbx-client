import { create } from 'zustand'
import {
  type ActiveCall,
  type CallEvent,
  type Contact,
  type LatencySample,
  type RegistererState,
  type RegistrationFlow
} from './types'
import { sipEngine } from './sipEngine'

/**
 * Softphone store — reactive state for the UI. The live sip.js objects live in
 * sipEngine; the engine drives this store via setState and the engine-facing
 * mutators below (upsertContact / addCallEvent / setActiveCall / …).
 */

const LS_CONTACTS = 'softphone:contacts'
const LS_HISTORY = 'softphone:call-history'
const LS_RECORD_DEFAULT = 'softphone:record-by-default'
const LS_DIAL_HISTORY = 'softphone:dial-history'
const DIAL_HISTORY_MAX = 100

function loadDialHistory(): string[] {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_DIAL_HISTORY) ?? '[]')
    return Array.isArray(arr) ? (arr as string[]) : []
  } catch {
    return []
  }
}

function loadContacts(): Contact[] {
  try {
    return JSON.parse(localStorage.getItem(LS_CONTACTS) ?? '[]') as Contact[]
  } catch {
    return []
  }
}
function loadHistory(): Record<string, CallEvent[]> {
  try {
    return JSON.parse(localStorage.getItem(LS_HISTORY) ?? '{}') as Record<string, CallEvent[]>
  } catch {
    return {}
  }
}
const saveContacts = (c: Contact[]): void => localStorage.setItem(LS_CONTACTS, JSON.stringify(c))
const saveHistory = (h: Record<string, CallEvent[]>): void =>
  localStorage.setItem(LS_HISTORY, JSON.stringify(h))

interface SoftphoneState {
  registrationState: RegistererState | null
  registrationFlows: RegistrationFlow[]
  lastCallError: string | null
  recordByDefault: boolean
  activeCalls: Record<string, ActiveCall>
  contacts: Contact[]
  callHistory: Record<string, CallEvent[]>
  /** Numbers dialed, most-recent first (for ↑/↓ navigation in the dialpad). */
  dialHistory: string[]
  selectedPhone: string | null

  // UI actions (delegate to the SIP engine)
  init: () => Promise<void>
  destroy: () => Promise<void>
  makeCall: (number: string) => void
  answer: (id: string) => void
  hangup: (id: string) => void
  toggleMute: (id: string) => void
  toggleHold: (id: string) => void
  toggleRecording: (id: string) => void
  reregister: () => void
  applyInputDeviceToActiveCalls: () => void
  applyOutputDeviceToActiveCalls: () => void
  getCrlfLatencyHistory: (index: number) => LatencySample[]
  getCallStats: (callId: string) => Promise<RTCStatsReport | null>

  // Pure-state UI actions
  selectContact: (phone: string) => void
  setRecordByDefault: (v: boolean) => void
  updateContact: (phone: string, patch: { displayName?: string; phone?: string }) => void
  /** Record an outbound-dialed number into the dial history. */
  recordDial: (number: string) => void

  // Engine-facing mutators
  setActiveCall: (call: ActiveCall) => void
  patchActiveCall: (id: string, patch: Partial<ActiveCall>) => void
  removeActiveCall: (id: string) => void
  upsertContact: (phone: string, displayName?: string) => void
  addCallEvent: (phone: string, event: CallEvent) => void
  updateCallEvent: (phone: string, eventId: string, patch: Partial<CallEvent>) => void
}

export const useSoftphoneStore = create<SoftphoneState>((set) => ({
  registrationState: null,
  registrationFlows: [],
  lastCallError: null,
  recordByDefault: localStorage.getItem(LS_RECORD_DEFAULT) === 'true',
  activeCalls: {},
  contacts: loadContacts(),
  callHistory: loadHistory(),
  dialHistory: loadDialHistory(),
  selectedPhone: null,

  // ── Delegated to the engine ──
  init: () => sipEngine.init(),
  destroy: () => sipEngine.destroy(),
  makeCall: (number) => sipEngine.makeCall(number),
  answer: (id) => sipEngine.answer(id),
  hangup: (id) => sipEngine.hangup(id),
  toggleMute: (id) => sipEngine.toggleMute(id),
  toggleHold: (id) => sipEngine.toggleHold(id),
  toggleRecording: (id) => sipEngine.toggleRecording(id),
  reregister: () => {
    void sipEngine.reregister().catch(() => undefined)
  },
  applyInputDeviceToActiveCalls: () => void sipEngine.applyInputDeviceToActiveCalls(),
  applyOutputDeviceToActiveCalls: () => void sipEngine.applyOutputDeviceToActiveCalls(),
  getCrlfLatencyHistory: (index) => sipEngine.getCrlfLatencyHistory(index),
  getCallStats: (callId) => sipEngine.getCallStats(callId),

  // ── Pure state ──
  selectContact: (phone) => set({ selectedPhone: phone }),

  recordDial: (number) =>
    set((s) => {
      const n = number.trim()
      if (!n) return {}
      // Most-recent first, de-duplicated, capped.
      const dialHistory = [n, ...s.dialHistory.filter((x) => x !== n)].slice(0, DIAL_HISTORY_MAX)
      localStorage.setItem(LS_DIAL_HISTORY, JSON.stringify(dialHistory))
      return { dialHistory }
    }),

  setRecordByDefault: (v) => {
    localStorage.setItem(LS_RECORD_DEFAULT, String(v))
    set({ recordByDefault: v })
  },

  updateContact: (phone, patch) =>
    set((s) => {
      const newPhone = patch.phone && patch.phone !== phone ? patch.phone : phone
      const contacts = s.contacts.map((c) =>
        c.phone === phone
          ? { ...c, phone: newPhone, displayName: patch.displayName ?? c.displayName }
          : c
      )
      const callHistory = { ...s.callHistory }
      if (newPhone !== phone && callHistory[phone]) {
        callHistory[newPhone] = callHistory[phone]
        delete callHistory[phone]
      }
      saveContacts(contacts)
      saveHistory(callHistory)
      return {
        contacts,
        callHistory,
        selectedPhone: s.selectedPhone === phone ? newPhone : s.selectedPhone
      }
    }),

  // ── Engine-facing mutators ──
  setActiveCall: (call) => set((s) => ({ activeCalls: { ...s.activeCalls, [call.id]: call } })),

  patchActiveCall: (id, patch) =>
    set((s) => {
      const c = s.activeCalls[id]
      if (!c) return {}
      return { activeCalls: { ...s.activeCalls, [id]: { ...c, ...patch } } }
    }),

  removeActiveCall: (id) =>
    set((s) => {
      if (!s.activeCalls[id]) return {}
      const rest = { ...s.activeCalls }
      delete rest[id]
      return { activeCalls: rest }
    }),

  upsertContact: (phone, displayName) =>
    set((s) => {
      const ts = new Date().toISOString()
      let contacts: Contact[]
      const existing = s.contacts.find((c) => c.phone === phone)
      if (existing) {
        contacts = s.contacts.map((c) =>
          c.phone === phone
            ? { ...c, lastCallAt: ts, displayName: c.displayName || displayName }
            : c
        )
      } else {
        contacts = [{ phone, displayName, lastCallAt: ts }, ...s.contacts]
      }
      contacts.sort((a, b) => b.lastCallAt.localeCompare(a.lastCallAt))
      saveContacts(contacts)
      return {
        contacts,
        selectedPhone: s.selectedPhone ?? contacts[0]?.phone ?? null
      }
    }),

  addCallEvent: (phone, event) =>
    set((s) => {
      const existing = s.callHistory[phone] ?? []
      const events = [event, ...existing].slice(0, 200)
      const callHistory = { ...s.callHistory, [phone]: events }
      saveHistory(callHistory)
      return { callHistory }
    }),

  updateCallEvent: (phone, eventId, patch) =>
    set((s) => {
      const events = s.callHistory[phone]
      if (!events) return {}
      const updated = events.map((e) => (e.id === eventId ? { ...e, ...patch } : e))
      const callHistory = { ...s.callHistory, [phone]: updated }
      saveHistory(callHistory)
      return { callHistory }
    })
}))

// Persist the live sessions' bye on unload (best-effort).
window.addEventListener('beforeunload', () => {
  void useSoftphoneStore.getState().destroy()
})
