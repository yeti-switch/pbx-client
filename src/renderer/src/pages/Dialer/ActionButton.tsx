import { cn } from '@/lib/utils'

interface ActionButtonProps {
  label: string
  variant?: 'default' | 'destructive' | 'success'
  active?: boolean
  disabled?: boolean
  onClick?: () => void
  children?: React.ReactNode
}

function ActionButton({
  label,
  variant,
  active,
  disabled,
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
        'flex flex-col items-center gap-1 rounded-2xl px-4 py-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        buttonClass
      )}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
      <span>{label}</span>
    </button>
  )
}

export default ActionButton
