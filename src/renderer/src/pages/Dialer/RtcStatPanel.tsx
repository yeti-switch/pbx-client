/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Link2 } from 'lucide-react'
import { useSoftphoneStore } from '@/softphone/store'
import { phoneFromUri } from '@/softphone/types'

interface Row {
  label: string
  value: string
}

interface StreamCard {
  key: string
  direction: 'outbound' | 'inbound'
  kind: string
  codec?: string
  codecDetail?: string
  localTitle: string
  remoteTitle: string
  local: Row[]
  remote: Row[]
}

interface PairCard {
  key: string
  nominated: boolean
  state: string
  local: string
  remote: string
  rows: Row[]
}

interface CallCard {
  callId: string
  label: string
  pairs: PairCard[]
  streams: StreamCard[]
}

type PrevBytes = Record<string, { bytes: number; ts: number }>

function fmtBytes(n?: number): string {
  if (typeof n !== 'number') return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}
const fmtMs = (s?: number): string => (typeof s === 'number' ? `${(s * 1000).toFixed(1)} ms` : '—')
const fmtNum = (n?: number): string => (typeof n === 'number' ? String(n) : '—')

/** Parse one call's RTCStatsReport into outbound/inbound stream-pair cards. */
function buildStreams(report: RTCStatsReport, callId: string, prev: PrevBytes): StreamCard[] {
  const byId = new Map<string, any>()
  report.forEach((s: any) => byId.set(s.id, s))

  const codecOf = (codecId?: string): { short?: string; detail?: string } => {
    const c = codecId ? byId.get(codecId) : undefined
    if (!c) return {}
    const short = `${String(c.mimeType ?? '').replace(/^(audio|video)\//, '')}/${c.clockRate ?? '?'}${
      c.channels ? '/' + c.channels : ''
    }`
    const detail = [c.payloadType !== undefined ? `pt ${c.payloadType}` : null, c.sdpFmtpLine]
      .filter(Boolean)
      .join('  ')
    return { short, detail }
  }

  const bitrate = (id: string, bytes?: number, ts?: number): string => {
    if (typeof bytes !== 'number' || typeof ts !== 'number') return '—'
    const k = `${callId}:${id}`
    const p = prev[k]
    prev[k] = { bytes, ts }
    if (!p || ts <= p.ts) return '—'
    const kbps = ((bytes - p.bytes) * 8) / 1000 / ((ts - p.ts) / 1000)
    return `${Math.max(0, kbps).toFixed(1)} kbps`
  }

  const outbound: StreamCard[] = []
  const inbound: StreamCard[] = []

  report.forEach((s: any) => {
    if (s.type === 'outbound-rtp') {
      const rem = s.remoteId ? byId.get(s.remoteId) : undefined // remote-inbound-rtp
      const { short, detail } = codecOf(s.codecId)
      outbound.push({
        key: s.id,
        direction: 'outbound',
        kind: s.kind ?? '?',
        codec: short,
        codecDetail: detail,
        localTitle: 'We send (outbound-rtp)',
        remoteTitle: 'Peer receives (remote-inbound-rtp)',
        local: [
          { label: 'ssrc', value: fmtNum(s.ssrc) },
          { label: 'packets', value: fmtNum(s.packetsSent) },
          { label: 'bytes', value: fmtBytes(s.bytesSent) },
          { label: 'bitrate', value: bitrate(s.id, s.bytesSent, s.timestamp) },
          { label: 'retransmit', value: fmtNum(s.retransmittedPacketsSent) },
          { label: 'nack', value: fmtNum(s.nackCount) }
        ],
        remote: rem
          ? [
              { label: 'pkts lost', value: fmtNum(rem.packetsLost) },
              {
                label: 'frac lost',
                value: typeof rem.fractionLost === 'number' ? rem.fractionLost.toFixed(3) : '—'
              },
              { label: 'jitter', value: fmtMs(rem.jitter) },
              { label: 'RTT', value: fmtMs(rem.roundTripTime) }
            ]
          : []
      })
    }
    if (s.type === 'inbound-rtp') {
      const rem = s.remoteId ? byId.get(s.remoteId) : undefined // remote-outbound-rtp
      const { short, detail } = codecOf(s.codecId)
      inbound.push({
        key: s.id,
        direction: 'inbound',
        kind: s.kind ?? '?',
        codec: short,
        codecDetail: detail,
        localTitle: 'We receive (inbound-rtp)',
        remoteTitle: 'Peer sends (remote-outbound-rtp)',
        local: [
          { label: 'ssrc', value: fmtNum(s.ssrc) },
          { label: 'packets', value: fmtNum(s.packetsReceived) },
          { label: 'bytes', value: fmtBytes(s.bytesReceived) },
          { label: 'bitrate', value: bitrate(s.id, s.bytesReceived, s.timestamp) },
          { label: 'pkts lost', value: fmtNum(s.packetsLost) },
          { label: 'jitter', value: fmtMs(s.jitter) }
        ],
        remote: rem
          ? [
              { label: 'packets', value: fmtNum(rem.packetsSent) },
              { label: 'bytes', value: fmtBytes(rem.bytesSent) }
            ]
          : []
      })
    }
  })

  return [...outbound, ...inbound]
}

/** Succeeded (and/or nominated) ICE candidate pairs for a call. */
function buildPairs(report: RTCStatsReport): PairCard[] {
  const byId = new Map<string, any>()
  report.forEach((s: any) => byId.set(s.id, s))
  const fmtCand = (c: any): string =>
    c
      ? `${c.candidateType ?? '?'} ${c.protocol ?? ''} ${c.address ?? c.ip ?? ''}${
          c.port ? ':' + c.port : ''
        }${c.relayProtocol ? ' (' + c.relayProtocol + ')' : ''}`.trim()
      : '—'

  const pairs: PairCard[] = []
  report.forEach((s: any) => {
    if (s.type === 'candidate-pair' && (s.state === 'succeeded' || s.nominated)) {
      pairs.push({
        key: s.id,
        nominated: !!s.nominated,
        state: s.state ?? '?',
        local: fmtCand(byId.get(s.localCandidateId)),
        remote: fmtCand(byId.get(s.remoteCandidateId)),
        rows: [
          { label: 'RTT', value: fmtMs(s.currentRoundTripTime) },
          {
            label: 'avail out',
            value:
              typeof s.availableOutgoingBitrate === 'number'
                ? `${(s.availableOutgoingBitrate / 1000).toFixed(0)} kbps`
                : '—'
          },
          { label: 'bytes ↑', value: fmtBytes(s.bytesSent) },
          { label: 'bytes ↓', value: fmtBytes(s.bytesReceived) }
        ]
      })
    }
  })
  return pairs.sort((a, b) => Number(b.nominated) - Number(a.nominated))
}

function PairBlock({ pair }: { pair: PairCard }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-2.5 text-[11px]">
      <div className="mb-2 flex items-center gap-1.5">
        <Link2 className="size-3.5 text-amber-600 dark:text-amber-400" />
        <span className="font-semibold text-foreground">ICE pair</span>
        {pair.nominated && (
          <span className="rounded bg-green-600/15 px-1 text-[9px] font-semibold uppercase text-green-600 dark:text-green-400">
            nominated
          </span>
        )}
        <span className="text-muted-foreground">{pair.state}</span>
      </div>
      <div className="mb-2 flex flex-col gap-0.5 font-mono text-[10px]">
        <div className="flex gap-2">
          <span className="w-12 shrink-0 text-muted-foreground">local</span>
          <span className="truncate text-foreground">{pair.local}</span>
        </div>
        <div className="flex gap-2">
          <span className="w-12 shrink-0 text-muted-foreground">remote</span>
          <span className="truncate text-foreground">{pair.remote}</span>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 font-mono">
        {pair.rows.map((r) => (
          <div key={r.label} className="flex flex-col">
            <span className="text-[9px] uppercase text-muted-foreground">{r.label}</span>
            <span className="truncate text-foreground">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StreamBlock({ stream }: { stream: StreamCard }): React.JSX.Element {
  const Arrow = stream.direction === 'outbound' ? ArrowUpRight : ArrowDownLeft
  const arrowColor =
    stream.direction === 'outbound'
      ? 'text-blue-600 dark:text-blue-400'
      : 'text-green-600 dark:text-green-400'
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-2.5 text-[11px]">
      <div className="mb-2 flex items-center gap-1.5">
        <Arrow className={`size-3.5 ${arrowColor}`} />
        <span className="font-semibold capitalize text-foreground">
          {stream.direction} · {stream.kind}
        </span>
        {stream.codec && <span className="font-mono text-muted-foreground">{stream.codec}</span>}
      </div>
      {stream.codecDetail && (
        <div className="mb-2 truncate font-mono text-[10px] text-muted-foreground">
          {stream.codecDetail}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <StatList title={stream.localTitle} rows={stream.local} />
        <StatList title={stream.remoteTitle} rows={stream.remote} />
      </div>
    </div>
  )
}

function StatList({ title, rows }: { title: string; rows: Row[] }): React.JSX.Element {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      {rows.length === 0 ? (
        <div className="text-[10px] italic text-muted-foreground">awaiting RTCP…</div>
      ) : (
        <div className="flex flex-col gap-0.5 font-mono">
          {rows.map((r) => (
            <div key={r.label} className="flex items-baseline justify-between gap-2">
              <span className="text-muted-foreground">{r.label}</span>
              <span className="truncate text-foreground">{r.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Live WebRTC stats (SIP log's "RTCStat" tab). One card per active call; inside,
 * a card per RTP stream pair mirroring the WebRTC stats model:
 *  - outbound-rtp  ⟷ remote-inbound-rtp  (we send / peer receives)
 *  - inbound-rtp   ⟷ remote-outbound-rtp (we receive / peer sends)
 * Polled once per second.
 */
function RtcStatPanel(): React.JSX.Element {
  const activeCalls = useSoftphoneStore((s) => s.activeCalls)
  const getCallStats = useSoftphoneStore((s) => s.getCallStats)
  const calls = Object.values(activeCalls)
  const [cards, setCards] = useState<CallCard[]>([])
  const prevRef = useRef<PrevBytes>({})

  useEffect(() => {
    let cancelled = false
    const poll = async (): Promise<void> => {
      const live = Object.values(useSoftphoneStore.getState().activeCalls)
      const ids = new Set(live.map((c) => c.id))
      // Drop bitrate bookkeeping for ended calls.
      for (const k of Object.keys(prevRef.current)) {
        if (!ids.has(k.split(':')[0])) delete prevRef.current[k]
      }
      const next = await Promise.all(
        live.map(async (c): Promise<CallCard> => {
          const report = await getCallStats(c.id).catch(() => null)
          return {
            callId: c.id,
            label: c.displayName || phoneFromUri(c.remoteUri),
            pairs: report ? buildPairs(report) : [],
            streams: report ? buildStreams(report, c.id, prevRef.current) : []
          }
        })
      )
      if (!cancelled) setCards(next)
    }
    void poll()
    const timer = setInterval(poll, 1000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [getCallStats])

  if (calls.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-3 text-xs text-muted-foreground">
        No active calls — live WebRTC stats appear here during a call.
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
      {cards.map((call) => (
        <div key={call.callId} className="rounded-xl border border-border bg-card p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-full bg-green-500" />
            <span className="font-mono text-sm font-semibold text-foreground">{call.label}</span>
          </div>
          {call.pairs.length === 0 && call.streams.length === 0 ? (
            <div className="text-xs text-muted-foreground">Collecting…</div>
          ) : (
            <div className="flex flex-col gap-2">
              {call.pairs.map((p) => (
                <PairBlock key={p.key} pair={p} />
              ))}
              {call.streams.map((s) => (
                <StreamBlock key={s.key} stream={s} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default RtcStatPanel
