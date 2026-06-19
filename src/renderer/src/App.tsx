import { useState } from 'react'
import { cn } from '@/lib/utils'
import NavRail, { type NavItemId } from './components/NavRail'
import DialerPage from './pages/Dialer/DialerPage'
import SettingsPage from './pages/Settings/SettingsPage'

function App(): React.JSX.Element {
  const [active, setActive] = useState<NavItemId>('dialer')

  return (
    <div className="flex h-full w-full overflow-hidden">
      <NavRail active={active} onSelect={setActive} />
      <main className="min-w-0 flex-1 overflow-hidden">
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
