import { useMemo } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  type ChartData,
  type ChartOptions
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { cn } from '@/lib/utils'
import type { LatencySample } from '@/softphone/types'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler)

function rttColor(ms: number): string {
  if (ms < 50) return 'text-green-600 dark:text-green-400'
  if (ms < 150) return 'text-amber-500 dark:text-amber-400'
  return 'text-red-500 dark:text-red-400'
}

function timeLabel(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const OPTIONS: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: { legend: { display: false }, tooltip: { enabled: false } },
  scales: {
    x: {
      ticks: {
        font: { size: 9, family: 'monospace' },
        color: 'rgba(128,128,128,0.7)',
        maxTicksLimit: 5
      },
      grid: { display: false }
    },
    y: {
      beginAtZero: true,
      ticks: {
        font: { size: 9, family: 'monospace' },
        color: 'rgba(128,128,128,0.7)',
        maxTicksLimit: 4
      },
      grid: { color: 'rgba(128,128,128,0.15)' }
    }
  }
}

function CrlfLatencyChart({ samples }: { samples: LatencySample[] }): React.JSX.Element {
  const lastRtt = useMemo<number | null>(() => {
    const last = samples[samples.length - 1]
    if (last === undefined) return null
    if (last.rttMs !== null) return last.rttMs
    const prev = samples[samples.length - 2]
    return prev && prev.rttMs !== null ? prev.rttMs : null
  }, [samples])

  const data = useMemo<ChartData<'line'>>(
    () => ({
      labels: samples.map((s) => timeLabel(s.timestamp)),
      datasets: [
        {
          data: samples.map((s) => s.rttMs ?? null),
          borderColor: 'rgb(34,197,94)',
          backgroundColor: 'rgba(34,197,94,0.1)',
          borderWidth: 1.5,
          pointRadius: 0,
          fill: true,
          spanGaps: false,
          tension: 0.25
        },
        {
          // Timeout markers (red dots where rtt is null)
          data: samples.map((s) => (s.rttMs === null ? 0 : null)),
          borderColor: 'rgb(239,68,68)',
          backgroundColor: 'rgb(239,68,68)',
          borderWidth: 0,
          pointRadius: 3,
          showLine: false
        }
      ]
    }),
    [samples]
  )

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          CRLF RTT
        </span>
        {lastRtt !== null ? (
          <span className={cn('font-mono text-xs', rttColor(lastRtt))}>
            {lastRtt.toFixed(1)} ms
          </span>
        ) : samples.length > 0 ? (
          <span className="text-xs text-red-500">timeout</span>
        ) : (
          <span className="text-[10px] text-muted-foreground">waiting…</span>
        )}
      </div>
      <div className="h-[72px] w-full">
        {samples.length > 0 && <Line data={data} options={OPTIONS} />}
      </div>
    </div>
  )
}

export default CrlfLatencyChart
