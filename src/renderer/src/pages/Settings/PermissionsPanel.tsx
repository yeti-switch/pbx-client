import { useCallback, useEffect, useState } from 'react'
import { Mic, Bell, CheckCircle2, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type PermState = 'unknown' | 'prompt' | 'granted' | 'denied'
type PermKey = 'microphone' | 'notifications'

interface PermEntry {
  key: PermKey
  label: string
  icon: LucideIcon
  state: PermState
  requesting: boolean
}

const INITIAL: PermEntry[] = [
  { key: 'microphone', label: 'Microphone', icon: Mic, state: 'unknown', requesting: false },
  { key: 'notifications', label: 'Notifications', icon: Bell, state: 'unknown', requesting: false }
]

function stateLabel(state: PermState): string {
  switch (state) {
    case 'granted':
      return 'Granted'
    case 'denied':
      return 'Denied'
    case 'prompt':
      return 'Not requested'
    default:
      return 'Unknown'
  }
}

function stateColor(state: PermState): string {
  switch (state) {
    case 'granted':
      return 'text-green-600 dark:text-green-400'
    case 'denied':
      return 'text-red-500 dark:text-red-400'
    default:
      return 'text-muted-foreground'
  }
}

/** Microphone + notification permission status with inline "Allow" requests. */
function PermissionsPanel(): React.JSX.Element {
  const [permissions, setPermissions] = useState<PermEntry[]>(INITIAL)

  const patch = useCallback((key: PermKey, p: Partial<PermEntry>): void => {
    setPermissions((prev) => prev.map((e) => (e.key === key ? { ...e, ...p } : e)))
  }, [])

  const queryStates = useCallback(async (): Promise<void> => {
    try {
      const micStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName })
      patch('microphone', { state: micStatus.state as PermState })
      micStatus.onchange = () => patch('microphone', { state: micStatus.state as PermState })
    } catch {
      patch('microphone', { state: 'unknown' })
    }
    if ('Notification' in window) {
      patch('notifications', {
        state:
          Notification.permission === 'default' ? 'prompt' : (Notification.permission as PermState)
      })
    } else {
      patch('notifications', { state: 'denied' })
    }
  }, [patch])

  useEffect(() => {
    void queryStates()
  }, [queryStates])

  const request = async (key: PermKey): Promise<void> => {
    patch(key, { requesting: true })
    try {
      if (key === 'microphone') {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((t) => t.stop())
        patch('microphone', { state: 'granted' })
      } else {
        const result = await Notification.requestPermission()
        patch('notifications', { state: result === 'default' ? 'prompt' : (result as PermState) })
      }
    } catch {
      if (key === 'microphone') patch('microphone', { state: 'denied' })
    } finally {
      patch(key, { requesting: false })
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {permissions.map((perm) => {
        const Icon = perm.icon
        return (
          <div
            key={perm.key}
            className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5"
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{perm.label}</p>
              <p className={cn('text-xs', stateColor(perm.state))}>{stateLabel(perm.state)}</p>
            </div>
            {perm.state !== 'granted' ? (
              <button
                type="button"
                className="shrink-0 rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                disabled={perm.requesting || perm.state === 'denied'}
                onClick={() => request(perm.key)}
              >
                {perm.state === 'denied' ? 'Denied' : 'Allow'}
              </button>
            ) : (
              <CheckCircle2 className="size-4 shrink-0 text-green-500" />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default PermissionsPanel
