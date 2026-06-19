import { useEffect } from 'react'
import { Mic, Volume2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useAudioDevicesStore } from '@/softphone/audioDevicesStore'
import { useSoftphoneStore } from '@/softphone/store'

interface AudioDevicesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function AudioDevicesDialog({ open, onOpenChange }: AudioDevicesDialogProps): React.JSX.Element {
  const store = useAudioDevicesStore()
  const applyInput = useSoftphoneStore((s) => s.applyInputDeviceToActiveCalls)
  const applyOutput = useSoftphoneStore((s) => s.applyOutputDeviceToActiveCalls)

  // Re-enumerate whenever the dialog opens
  useEffect(() => {
    if (open) void store.enumerate()
  }, [open, store])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Audio devices</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Microphone */}
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Mic className="size-3.5 text-muted-foreground" />
              Microphone
            </label>
            <select
              value={store.selectedInputId}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              onChange={(e) => {
                store.selectInput(e.target.value)
                applyInput()
              }}
            >
              {store.inputs.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
              {store.inputs.length === 0 && (
                <option value="default" disabled>
                  No devices found
                </option>
              )}
            </select>
          </div>

          {/* Speaker */}
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Volume2 className="size-3.5 text-muted-foreground" />
              Speaker
              {!store.sinkIdSupported && (
                <span className="text-xs font-normal text-muted-foreground">(not supported)</span>
              )}
            </label>
            <select
              value={store.selectedOutputId}
              disabled={!store.sinkIdSupported}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              onChange={(e) => {
                store.selectOutput(e.target.value)
                applyOutput()
              }}
            >
              {store.outputs.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
              {store.outputs.length === 0 && (
                <option value="default" disabled>
                  No devices found
                </option>
              )}
            </select>
          </div>

          {store.inputs.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Grant microphone permission first to see device names.
            </p>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90"
            onClick={() => onOpenChange(false)}
          >
            Save
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default AudioDevicesDialog
