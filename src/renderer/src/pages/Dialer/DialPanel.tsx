import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import {
  Check,
  RefreshCw,
  Settings,
  ScrollText,
  TriangleAlert,
  ShieldCheck,
  AudioLines
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { RegistererState, type ActiveCall } from '@/softphone/types'
import ActiveCallScreen from './ActiveCallScreen'
import DialPad, { type DialPadHandle } from './DialPad'
import AudioDevicesDialog from './AudioDevicesDialog'
import PermissionsDialog from './PermissionsDialog'

export interface DialPanelHandle {
  prefill: (number: string) => void
}

interface DialPanelProps {
  activeCalls: ActiveCall[]
  registrationState: RegistererState | null
  lastCallError: string | null
  recordByDefault: boolean
  isAnyRecording: boolean
  onDial: (number: string) => void
  onAnswer: (id: string) => void
  onHangup: (id: string) => void
  onToggleMute: (id: string) => void
  onToggleHold: (id: string) => void
  onToggleRecording: (id: string) => void
  onToggleRecordDefault: (value: boolean) => void
  onReregister: () => void
  onToggleLogs: () => void
}

function regLabel(state: RegistererState | null): string {
  switch (state) {
    case RegistererState.Registered:
      return 'Registered'
    case RegistererState.Unregistered:
      return 'Unregistered'
    default:
      return 'Not registered'
  }
}

const DialPanel = forwardRef<DialPanelHandle, DialPanelProps>(function DialPanel(props, ref) {
  const {
    activeCalls,
    registrationState,
    lastCallError,
    recordByDefault,
    isAnyRecording,
    onDial,
    onAnswer,
    onHangup,
    onToggleMute,
    onToggleHold,
    onToggleRecording,
    onToggleRecordDefault,
    onReregister,
    onToggleLogs
  } = props

  const dialPadRef = useRef<DialPadHandle>(null)
  const [audioDevicesOpen, setAudioDevicesOpen] = useState(false)
  const [permissionsOpen, setPermissionsOpen] = useState(false)

  useImperativeHandle(ref, () => ({ prefill: (n) => dialPadRef.current?.setNumber(n) }), [])

  return (
    <div className="flex h-full flex-col">
      {/* Header with registration status */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <span className="text-sm font-semibold">{activeCalls.length ? 'Active' : 'Dialpad'}</span>
        <div className="flex items-center gap-2">
          {/* REC indicator */}
          {(isAnyRecording || recordByDefault) && (
            <div className="flex items-center gap-1">
              <span
                className={cn(
                  'size-2 rounded-full bg-red-500',
                  isAnyRecording ? 'animate-pulse' : 'opacity-40'
                )}
              />
              <span
                className={cn(
                  'text-xs font-semibold text-red-500',
                  !isAnyRecording && 'opacity-40'
                )}
              >
                REC
              </span>
            </div>
          )}
          {registrationState !== RegistererState.Registered && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <TriangleAlert className="size-4 cursor-default text-yellow-500" />
                </TooltipTrigger>
                <TooltipContent className="max-w-48 text-center">
                  {regLabel(registrationState)}. Check SIP logs for details.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Settings className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onToggleRecordDefault(!recordByDefault)}>
                <Check
                  className={cn(
                    'size-4 transition-opacity',
                    recordByDefault ? 'opacity-100' : 'opacity-0'
                  )}
                />
                Record by default
                <DropdownMenuShortcut>⌥R</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onReregister()}>
                <RefreshCw className="size-4" />
                Re-register
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onToggleLogs()}>
                <ScrollText className="size-4" />
                Logs
                <DropdownMenuShortcut>⌃⇧L</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setAudioDevicesOpen(true)}>
                <AudioLines className="size-4" />
                Audio devices
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setPermissionsOpen(true)}>
                <ShieldCheck className="size-4" />
                Check permissions
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <AudioDevicesDialog open={audioDevicesOpen} onOpenChange={setAudioDevicesOpen} />
      <PermissionsDialog open={permissionsOpen} onOpenChange={setPermissionsOpen} />

      {/* Body */}
      <div className="flex flex-1 flex-col justify-center gap-4 overflow-y-auto p-4">
        {activeCalls.map((call) => (
          <ActiveCallScreen
            key={call.id}
            call={call}
            onAnswer={onAnswer}
            onHangup={onHangup}
            onToggleMute={onToggleMute}
            onToggleHold={onToggleHold}
            onToggleRecording={onToggleRecording}
          />
        ))}

        {activeCalls.length > 0 && <hr className="border-border" />}

        {lastCallError && activeCalls.length === 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
            <span className="font-medium">{lastCallError}</span>
          </div>
        )}

        <DialPad ref={dialPadRef} onDial={onDial} />
      </div>
    </div>
  )
})

export default DialPanel
