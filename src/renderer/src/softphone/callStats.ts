import type { StatsEntry } from './types'

export interface CallStatsRecord {
  entries: StatsEntry[]
  collectedAt: string
}

/**
 * Call-stats store — keeps the final RTCStatsReport snapshot per completed call.
 * In-memory for the session (mirrors yeti-client's API).
 */
const records = new Map<string, CallStatsRecord>()

export const callStatsStore = {
  has: async (eventId: string): Promise<boolean> => records.has(eventId),
  get: async (eventId: string): Promise<CallStatsRecord | null> => records.get(eventId) ?? null,
  save: async (record: {
    eventId: string
    collectedAt: string
    entries: StatsEntry[]
  }): Promise<void> => {
    records.set(record.eventId, { entries: record.entries, collectedAt: record.collectedAt })
  }
}
