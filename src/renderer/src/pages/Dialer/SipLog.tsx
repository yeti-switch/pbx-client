import { useEffect, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Eraser, X, Copy, Check, Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  RegistererState,
  type LatencySample,
  type LogLevel,
  type SipLogEntry
} from '@/softphone/types'
import { useSipLogStore } from '@/softphone/sipLogStore'
import { useSoftphoneStore } from '@/softphone/store'
import CrlfLatencyChart from './CrlfLatencyChart'
import RtcStatPanel from './RtcStatPanel'

type Tab = 'log' | 'status' | 'rtcstat'
const TABS: { key: Tab; label: string }[] = [
  { key: 'log', label: 'Log' },
  { key: 'status', label: 'Status' },
  { key: 'rtcstat', label: 'RTCStat' }
]

const LS_FONT_SIZE = 'softphone:log-font-size'

function formatTime(iso: string): string {
  return format(parseISO(iso), 'HH:mm:ss.SSS')
}

function levelClass(level: LogLevel): string {
  switch (level) {
    case 'error':
      return 'text-red-500 dark:text-red-400'
    case 'warn':
      return 'text-amber-500 dark:text-amber-400'
    case 'debug':
      return 'text-slate-400 dark:text-slate-500'
    default:
      return 'text-blue-500 dark:text-blue-400'
  }
}

function rowClass(level: LogLevel): string {
  switch (level) {
    case 'error':
      return 'bg-red-500/8 dark:bg-red-500/10'
    case 'warn':
      return 'bg-amber-500/8 dark:bg-amber-500/10'
    case 'debug':
      return 'opacity-60'
    default:
      return 'bg-blue-500/5 dark:bg-blue-500/8'
  }
}

function splitContent(entry: SipLogEntry): [string, string] {
  const full = entry.label ? `${entry.label} ${entry.content}` : entry.content
  const idx = full.search(/\r?\n/)
  if (idx === -1) return [full, '']
  return [full.slice(0, idx).trim(), full.slice(idx).trim()]
}

function stateLabel(state: RegistererState): string {
  switch (state) {
    case RegistererState.Registered:
      return 'Registered'
    case RegistererState.Unregistered:
      return 'Unregistered'
    case RegistererState.Terminated:
      return 'Terminated'
    default:
      return 'Unknown'
  }
}

function stateClass(state: RegistererState): string {
  switch (state) {
    case RegistererState.Registered:
      return 'bg-green-500/15 text-green-700 dark:text-green-400'
    case RegistererState.Terminated:
      return 'bg-red-500/15 text-red-700 dark:text-red-400'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function SipLog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const entries = useSipLogStore((s) => s.entries)
  const clearLog = useSipLogStore((s) => s.clear)
  const registrationFlows = useSoftphoneStore((s) => s.registrationFlows)
  const getCrlfLatencyHistory = useSoftphoneStore((s) => s.getCrlfLatencyHistory)

  const [activeTab, setActiveTab] = useState<Tab>('log')
  const [autoScroll, setAutoScroll] = useState(true)
  const [copied, setCopied] = useState(false)
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem(LS_FONT_SIZE)) || 12)
  const [tick, setTick] = useState(() => Date.now())
  const [latencyHistories, setLatencyHistories] = useState<LatencySample[][]>([])

  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    localStorage.setItem(LS_FONT_SIZE, String(fontSize))
  }, [fontSize])

  // Poll latency every second so charts stay live
  useEffect(() => {
    const poll = (): void => {
      setTick(Date.now())
      setLatencyHistories(registrationFlows.map((_, i) => [...getCrlfLatencyHistory(i)]))
    }
    poll()
    const timer = setInterval(poll, 1000)
    return () => clearInterval(timer)
  }, [registrationFlows, getCrlfLatencyHistory])

  // Auto-scroll the log
  useEffect(() => {
    if (autoScroll && activeTab === 'log' && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [entries.length, autoScroll, activeTab])

  const copyAll = (): void => {
    const text = entries
      .map((e) => {
        const full = e.label ? `${e.label} ${e.content}` : e.content
        return `[${formatTime(e.timestamp)}] ${e.level.toUpperCase().padEnd(5)} ${e.category} ${full}`
      })
      .join('\n')
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const secondsAgo = (iso: string): number => Math.floor((tick - new Date(iso).getTime()) / 1000)

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        {/* Tabs */}
        <div className="flex items-center gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={cn(
                'rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wider transition-colors',
                activeTab === tab.key
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Actions (log tab only) */}
        {activeTab === 'log' && (
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer select-none items-center gap-1 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="size-3"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
              />
              auto-scroll
            </label>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Decrease font size"
                onClick={() => setFontSize((v) => Math.max(9, v - 1))}
              >
                <Minus className="size-3" />
              </button>
              <span className="w-7 text-center text-xs tabular-nums text-muted-foreground">
                {fontSize}px
              </span>
              <button
                type="button"
                className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Increase font size"
                onClick={() => setFontSize((v) => Math.min(20, v + 1))}
              >
                <Plus className="size-3" />
              </button>
            </div>
            <button
              type="button"
              className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Copy all"
              onClick={copyAll}
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </button>
            <button
              type="button"
              className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Clear"
              onClick={() => clearLog()}
            >
              <Eraser className="size-3.5" />
            </button>
          </div>
        )}

        <button
          type="button"
          className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={onClose}
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Log tab */}
      {activeTab === 'log' && (
        <div
          ref={logRef}
          className="flex-1 overflow-y-auto font-mono leading-relaxed"
          style={{ fontSize: `${fontSize}px` }}
        >
          {entries.map((entry) => {
            const [first, rest] = splitContent(entry)
            return (
              <div
                key={entry.id}
                className={cn('border-b border-border/40 px-3', rowClass(entry.level))}
              >
                <div className="flex gap-2">
                  <span className="shrink-0 text-muted-foreground">
                    {formatTime(entry.timestamp)}
                  </span>
                  <span className={cn('w-10 shrink-0 font-semibold', levelClass(entry.level))}>
                    {entry.level.toUpperCase()}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{entry.category}</span>
                  <span className="min-w-0 break-all">{first}</span>
                </div>
                {rest && <pre className="mt-0.5 whitespace-pre-wrap break-all pl-4">{rest}</pre>}
              </div>
            )
          })}
          {entries.length === 0 && (
            <div className="p-3 text-xs text-muted-foreground">No log entries yet.</div>
          )}
        </div>
      )}

      {/* Status tab */}
      {activeTab === 'status' && (
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
          {registrationFlows.length === 0 && (
            <div className="text-xs text-muted-foreground">Not connected.</div>
          )}
          {registrationFlows.map((flow, i) => (
            <div
              key={flow.endpoint}
              className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                    Flow {i + 1}
                  </span>
                  <span className="truncate font-mono text-xs text-foreground">
                    {flow.endpoint}
                  </span>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    stateClass(flow.state)
                  )}
                >
                  {stateLabel(flow.state)}
                </span>
              </div>

              {flow.lastRegisteredAt && (
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span>Last registered:</span>
                  <span className="font-mono">{formatTime(flow.lastRegisteredAt)}</span>
                  <span className="text-muted-foreground/60">
                    ({secondsAgo(flow.lastRegisteredAt)}s ago)
                  </span>
                </div>
              )}

              <div className="border-t border-border/50 pt-2">
                <CrlfLatencyChart samples={latencyHistories[i] ?? []} />
              </div>

              {flow.contacts.length > 0 && (
                <div className="flex flex-col gap-1 border-t border-border/50 pt-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Registered contacts (200 OK)
                  </span>
                  {flow.contacts.map((contact, ci) => (
                    <div key={ci} className="break-all font-mono text-[10px] text-foreground/80">
                      {contact}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* RTCStat tab */}
      {activeTab === 'rtcstat' && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <RtcStatPanel />
        </div>
      )}
    </div>
  )
}

export default SipLog
