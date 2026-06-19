import { create } from 'zustand'
import type { Recording } from './types'

/**
 * Recordings store. In-memory (object URLs held in memory) — survives within a
 * session but not across restarts. Persisting to IndexedDB is a later refinement.
 */
interface RecordingsState {
  version: number
  items: Recording[]
  save: (rec: Recording) => Promise<void>
  getByContact: (phone: string) => Promise<Recording[]>
  remove: (id: string) => Promise<void>
}

export const useRecordingsStore = create<RecordingsState>((set, get) => ({
  version: 0,
  items: [],
  save: async (rec) => set((s) => ({ items: [...s.items, rec], version: s.version + 1 })),
  getByContact: async (phone) => get().items.filter((r) => r.contactPhone === phone),
  remove: async (id) =>
    set((s) => ({ items: s.items.filter((r) => r.id !== id), version: s.version + 1 }))
}))
