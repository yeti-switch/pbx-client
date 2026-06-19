import { Phone, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

export type NavItemId = 'dialer' | 'settings'

interface NavRailProps {
  active: NavItemId
  onSelect: (id: NavItemId) => void
}

type NavItem = { id: NavItemId; label: string; icon: typeof Phone }

const TOP_ITEMS: NavItem[] = [{ id: 'dialer', label: 'Dialer', icon: Phone }]
const BOTTOM_ITEMS: NavItem[] = [{ id: 'settings', label: 'Settings', icon: Settings }]

function RailButton({
  item,
  active,
  onSelect
}: {
  item: NavItem
  active: boolean
  onSelect: (id: NavItemId) => void
}): React.JSX.Element {
  const Icon = item.icon
  return (
    <button
      type="button"
      title={item.label}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      onClick={() => onSelect(item.id)}
      className={cn(
        'flex size-10 items-center justify-center rounded-lg transition-colors',
        active
          ? 'bg-sidebar-primary text-sidebar-primary-foreground'
          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
      )}
    >
      <Icon className="size-5" />
    </button>
  )
}

/** Always-collapsed left vertical menu (icon-only rail). */
function NavRail({ active, onSelect }: NavRailProps): React.JSX.Element {
  return (
    <nav className="flex h-full w-14 shrink-0 flex-col items-center gap-1 border-r border-border bg-sidebar py-3">
      {TOP_ITEMS.map((item) => (
        <RailButton key={item.id} item={item} active={active === item.id} onSelect={onSelect} />
      ))}
      <div className="flex-1" />
      {BOTTOM_ITEMS.map((item) => (
        <RailButton key={item.id} item={item} active={active === item.id} onSelect={onSelect} />
      ))}
    </nav>
  )
}

export default NavRail
