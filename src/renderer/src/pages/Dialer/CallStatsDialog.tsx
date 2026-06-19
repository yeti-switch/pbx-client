import { Fragment, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { callStatsStore } from '@/softphone/callStats'
import type { StatsEntry } from '@/softphone/types'

interface CallStatsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  eventId: string | null
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') {
    return Number.isInteger(v) ? String(v) : v.toFixed(6).replace(/\.?0+$/, '')
  }
  return String(v)
}

function entryFields(entry: StatsEntry): [string, unknown][] {
  return Object.entries(entry).filter(([k]) => k !== 'id' && k !== 'type')
}

function CallStatsDialog({ open, onOpenChange, eventId }: CallStatsDialogProps): React.JSX.Element {
  const [entries, setEntries] = useState<StatsEntry[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [collectedAt, setCollectedAt] = useState('')

  useEffect(() => {
    if (!open || !eventId) return
    let cancelled = false
    setEntries([])
    setExpanded(new Set())
    setCollectedAt('')
    void callStatsStore.get(eventId).then((record) => {
      if (cancelled || !record) return
      const sorted = [...record.entries].sort(
        (a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id)
      )
      setEntries(sorted)
      setExpanded(new Set(sorted.map((e) => e.id)))
      setCollectedAt(format(new Date(record.collectedAt), 'HH:mm:ss'))
    })
    return () => {
      cancelled = true
    }
  }, [open, eventId])

  const toggleExpanded = (id: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Media statistics</DialogTitle>
        </DialogHeader>

        {!entries.length ? (
          <div className="flex flex-1 items-center justify-center py-8 text-sm text-muted-foreground">
            No statistics recorded for this call.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto font-mono text-[11px] leading-relaxed">
            {entries.map((entry) => (
              <div key={entry.id} className="border-b border-border/40">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-muted/40"
                  onClick={() => toggleExpanded(entry.id)}
                >
                  <span className="shrink-0 text-[10px]">{expanded.has(entry.id) ? '▾' : '▸'}</span>
                  <span className="font-semibold text-primary">{entry.type}</span>
                  <span className="text-muted-foreground">{entry.id}</span>
                </button>
                {expanded.has(entry.id) && (
                  <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 gap-y-0.5 px-6 pb-2">
                    {entryFields(entry).map(([k, v]) => (
                      <Fragment key={k}>
                        <span className="truncate text-muted-foreground">{k}</span>
                        <span className="break-all">{formatValue(v)}</span>
                      </Fragment>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {collectedAt && (
          <div className="shrink-0 border-t border-border pt-2 text-[10px] text-muted-foreground">
            Collected at: {collectedAt}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default CallStatsDialog
