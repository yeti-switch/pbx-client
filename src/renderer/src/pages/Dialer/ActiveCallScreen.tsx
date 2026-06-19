import { useEffect, useState } from 'react'
import { Phone, PhoneOff, Mic, MicOff, PauseCircle, CircleDot, CircleStop } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SessionState, phoneFromUri, type ActiveCall } from '@/softphone/types'
import { useSoftphoneStore } from '@/softphone/store'
import ActionButton from './ActionButton'

interface ActiveCallScreenProps {
  call: ActiveCall
  onAnswer: (id: string) => void
  onHangup: (id: string) => void
  onToggleMute: (id: string) => void
  onToggleHold: (id: string) => void
  onToggleRecording: (id: string) => void
}

function ActiveCallScreen({
  call,
  onAnswer,
  onHangup,
  onToggleMute,
  onToggleHold,
  onToggleRecording
}: ActiveCallScreenProps): React.JSX.Element {
  const contacts = useSoftphoneStore((s) => s.contacts)
  const phone = phoneFromUri(call.remoteUri)
  const contact = contacts.find((c) => c.phone === phone)
  const displayLabel = call.displayName || contact?.displayName || phone

  const isRinging =
    call.direction === 'inbound' &&
    (call.state === SessionState.Initial || call.state === SessionState.Establishing)

  const statusLabel = ((): string => {
    switch (call.state) {
      case SessionState.Initial:
        return call.direction === 'inbound' ? 'Incoming' : 'Calling'
      case SessionState.Establishing:
        return 'Connecting'
      case SessionState.Established:
        return call.held ? 'On hold' : 'Active'
      default:
        return ''
    }
  })()

  const statusColor =
    call.state === SessionState.Established
      ? call.held
        ? 'text-yellow-600 dark:text-yellow-400'
        : 'text-green-600 dark:text-green-400'
      : 'text-muted-foreground'

  // Live elapsed timer
  const [elapsed, setElapsed] = useState('0:00')
  useEffect(() => {
    if (!call.connectedAt) return
    const update = (): void => {
      const s = Math.floor((Date.now() - new Date(call.connectedAt!).getTime()) / 1000)
      setElapsed(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)
    }
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [call.connectedAt])

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      {/* Remote party */}
      <div className="flex flex-col items-center gap-1">
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Phone className="size-8" />
        </div>
        <span className="text-lg font-semibold">{displayLabel}</span>
        <span className="text-xs text-muted-foreground">{phone}</span>
      </div>

      {/* Status / duration */}
      <div className="flex flex-col items-center gap-1">
        <span className={cn('text-sm font-medium', statusColor)}>{statusLabel}</span>
        {call.provisionalStatus && !call.connectedAt && (
          <span className="text-xs text-muted-foreground">{call.provisionalStatus}</span>
        )}
        {call.connectedAt && (
          <span className="font-mono text-xs text-muted-foreground">{elapsed}</span>
        )}
      </div>

      {isRinging ? (
        <div className="flex gap-6">
          <ActionButton variant="destructive" label="Reject" onClick={() => onHangup(call.id)}>
            <PhoneOff className="size-5" />
          </ActionButton>
          <ActionButton variant="success" label="Answer" onClick={() => onAnswer(call.id)}>
            <Phone className="size-5" />
          </ActionButton>
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-3">
          <ActionButton
            label={call.muted ? 'Unmute' : 'Mute'}
            active={call.muted}
            onClick={() => onToggleMute(call.id)}
          >
            {call.muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
          </ActionButton>

          <ActionButton
            label={call.held ? 'Unhold' : 'Hold'}
            active={call.held}
            disabled={call.holdPending}
            onClick={() => onToggleHold(call.id)}
          >
            <PauseCircle className="size-5" />
          </ActionButton>

          <ActionButton
            label={call.recording ? 'Stop recording' : 'Start recording'}
            active={call.recording}
            onClick={() => onToggleRecording(call.id)}
          >
            {call.recording ? (
              <CircleStop className="size-5 text-red-500" />
            ) : (
              <CircleDot className="size-5" />
            )}
          </ActionButton>

          <ActionButton variant="destructive" label="Hang up" onClick={() => onHangup(call.id)}>
            <PhoneOff className="size-5" />
          </ActionButton>
        </div>
      )}
    </div>
  )
}

export default ActiveCallScreen
