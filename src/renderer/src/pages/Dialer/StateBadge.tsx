import { cn } from '@/lib/utils'
import type { CallEventState } from '@/softphone/types'

const LABELS: Record<CallEventState, string> = {
  active: 'Active',
  connecting: 'Connecting',
  ended: 'Ended',
  failed: 'Failed',
  missed: 'Missed'
}

const CLASSES: Record<CallEventState, string> = {
  active: 'bg-green-500/20 text-green-700 dark:text-green-400',
  connecting: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  ended: 'bg-muted-foreground/20 text-muted-foreground',
  failed: 'bg-red-500/20 text-red-700 dark:text-red-400',
  missed: 'bg-orange-500/20 text-orange-700 dark:text-orange-400'
}

function StateBadge({ state }: { state: CallEventState }): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium',
        CLASSES[state]
      )}
    >
      {LABELS[state]}
    </span>
  )
}

export default StateBadge
