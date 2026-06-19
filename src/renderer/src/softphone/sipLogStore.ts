import { create } from 'zustand'
import type { LogLevel, SipLogEntry } from './types'

const MAX_ENTRIES = 500
let seq = 0

interface SipLogState {
  entries: SipLogEntry[]
  append: (level: LogLevel, category: string, label: string | undefined, content: string) => void
  clear: () => void
}

export const useSipLogStore = create<SipLogState>((set) => ({
  entries: [],
  append: (level, category, label, content) =>
    set((s) => {
      const next = [
        ...s.entries,
        { id: (seq += 1), level, category, label, content, timestamp: new Date().toISOString() }
      ]
      return { entries: next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next }
    }),
  clear: () => set({ entries: [] })
}))
