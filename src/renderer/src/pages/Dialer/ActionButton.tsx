import { cn } from '@/lib/utils'

interface ActionButtonProps {
  label: string
  variant?: 'default' | 'destructive' | 'success'
  active?: boolean
  disabled?: boolean
  compact?: boolean
  onClick?: () => void
  children?: React.ReactNode
}

function ActionButton({
  label,
  variant,
  active,
  disabled,
  compact,
  onClick,
  children
}: ActionButtonProps): React.JSX.Element {
  const buttonClass =
    variant === 'destructive'
      ? 'bg-red-600 text-white hover:bg-red-700'
      : variant === 'success'
        ? 'bg-green-600 text-white hover:bg-green-700'
        : active
          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
          : 'bg-muted text-foreground hover:bg-accent'

  return (
    <button
      type="button"
      className={cn(
        'flex flex-col items-center gap-1 rounded-2xl font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        compact ? 'w-full rounded-xl px-1 py-2 text-[10px] leading-tight' : 'px-4 py-3 text-xs',
        buttonClass
      )}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
      <span className={cn('text-center', compact && 'leading-tight')}>{label}</span>
    </button>
  )
}

export default ActionButton
