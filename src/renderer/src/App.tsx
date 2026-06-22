import { cn } from '@/lib/utils'
import { useNavStore } from '@/lib/nav'
import NavRail from './components/NavRail'
import DialerPage from './pages/Dialer/DialerPage'
import SettingsPage from './pages/Settings/SettingsPage'

function App(): React.JSX.Element {
  const active = useNavStore((s) => s.active)
  const setActive = useNavStore((s) => s.setActive)

  return (
    <div className="flex h-full w-full overflow-hidden bg-sidebar">
      <NavRail active={active} onSelect={setActive} />
      {/* Inset content panel: floats on the sidebar background. No left margin —
          the rail's own icon padding (~8px) already provides the left gap, so all
          four sides read as equal. */}
      <main className="my-2 mr-2 min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-background shadow-sm">
        {/* Keep the dialer mounted so the SIP connection / active calls survive tab switches. */}
        <div className={cn('h-full', active !== 'dialer' && 'hidden')}>
          <DialerPage />
        </div>
        {active === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}

export default App
