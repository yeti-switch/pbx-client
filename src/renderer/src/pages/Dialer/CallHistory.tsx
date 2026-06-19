import { useEffect, useMemo, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import {
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  Pencil,
  Trash2,
  MoreHorizontal,
  Info,
  Download,
  Activity
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type { CallEvent, Contact, Recording } from '@/softphone/types'
import { useSoftphoneStore } from '@/softphone/store'
import { useRecordingsStore } from '@/softphone/recordings'
import { callStatsStore } from '@/softphone/callStats'
import StateBadge from './StateBadge'
import CallStatsDialog from './CallStatsDialog'

interface CallHistoryProps {
  selectedPhone: string | null
  events: CallEvent[]
  contact: Contact | null
  onCall: (phone: string) => void
}

function formatDateTime(iso: string): string {
  return format(parseISO(iso), 'dd MMM HH:mm')
}

function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function CallHistory({
  selectedPhone,
  events,
  contact,
  onCall
}: CallHistoryProps): React.JSX.Element {
  const updateContact = useSoftphoneStore((s) => s.updateContact)
  const recordingsVersion = useRecordingsStore((s) => s.version)
  const getByContact = useRecordingsStore((s) => s.getByContact)
  const removeRecording = useRecordingsStore((s) => s.remove)

  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')

  const [statsOpen, setStatsOpen] = useState(false)
  const [statsEventId, setStatsEventId] = useState<string | null>(null)
  const [statsAvailableFor, setStatsAvailableFor] = useState<Set<string>>(new Set())

  const [recordings, setRecordings] = useState<Recording[]>([])

  const listRef = useRef<HTMLDivElement>(null)
  const sortedEvents = useMemo(() => [...events].reverse(), [events])

  // Which events have stored stats
  useEffect(() => {
    let cancelled = false
    void Promise.all(
      events.map(async (ev) => ((await callStatsStore.has(ev.id)) ? ev.id : null))
    ).then((ids) => {
      if (!cancelled) setStatsAvailableFor(new Set(ids.filter((x): x is string => x !== null)))
    })
    return () => {
      cancelled = true
    }
  }, [events])

  // Recordings for the selected contact
  useEffect(() => {
    let cancelled = false
    if (!selectedPhone) {
      setRecordings([])
      return
    }
    void getByContact(selectedPhone).then((r) => {
      if (!cancelled) setRecordings(r)
    })
    return () => {
      cancelled = true
    }
  }, [selectedPhone, recordingsVersion, getByContact])

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [sortedEvents])

  const contactLabel = contact ? contact.displayName || contact.phone : ''

  const openEdit = (): void => {
    setEditName(contact?.displayName ?? '')
    setEditPhone(contact?.phone ?? selectedPhone ?? '')
    setEditOpen(true)
  }

  const saveEdit = (): void => {
    if (!selectedPhone) return
    updateContact(selectedPhone, {
      displayName: editName.trim() || undefined,
      phone: editPhone.trim() || undefined
    })
    setEditOpen(false)
  }

  const recordingForEvent = (eventId: string): Recording | undefined =>
    recordings.find((r) => r.callEventId === eventId)

  const downloadRecording = (rec: Recording): void => {
    const url = URL.createObjectURL(rec.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `call-${rec.createdAt}.webm`
    a.click()
    URL.revokeObjectURL(url)
  }

  const deleteRecording = (rec: Recording): void => {
    void removeRecording(rec.id)
    setRecordings((prev) => prev.filter((r) => r.id !== rec.id))
  }

  return (
    <div className="flex h-full flex-col border-r border-border">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <Phone className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {contactLabel || 'Call history'}
        </span>
        {selectedPhone && (
          <>
            <button
              type="button"
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Call"
              onClick={() => onCall(selectedPhone)}
            >
              <PhoneCall className="size-4" />
            </button>
            <button
              type="button"
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Edit contact"
              onClick={openEdit}
            >
              <Pencil className="size-4" />
            </button>
          </>
        )}
      </div>

      {/* Edit contact dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit contact</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Display name</label>
              <input
                value={editName}
                type="text"
                placeholder="e.g. Alice Johnson"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Phone number</label>
              <input
                value={editPhone}
                type="text"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                onChange={(e) => setEditPhone(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
              />
            </div>
          </div>
          <DialogFooter>
            <button
              type="button"
              className="rounded-md border border-border px-4 py-2 text-sm transition-colors hover:bg-muted"
              onClick={() => setEditOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90"
              onClick={saveEdit}
            >
              Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!selectedPhone ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Select a contact to see call history</p>
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">No call history</p>
        </div>
      ) : (
        <div
          ref={listRef}
          className="thin-scroll flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3"
        >
          {sortedEvents.map((event) => {
            const rec = recordingForEvent(event.id)
            return (
              <div
                key={event.id}
                className={cn(
                  'group flex items-end gap-1',
                  event.direction === 'outbound' ? 'flex-row-reverse' : 'flex-row'
                )}
              >
                {/* Bubble */}
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-3 py-2',
                    event.direction === 'outbound'
                      ? 'rounded-tr-sm bg-primary/15 text-foreground'
                      : 'rounded-tl-sm bg-muted/60 text-foreground'
                  )}
                >
                  <div className="flex items-center gap-2">
                    {event.direction === 'outbound' ? (
                      <PhoneOutgoing className="size-3 shrink-0 opacity-70" />
                    ) : (
                      <PhoneIncoming className="size-3 shrink-0 opacity-70" />
                    )}
                    <StateBadge state={event.state} />
                    {event.durationSeconds != null && (
                      <span className="text-xs opacity-70">
                        {formatDuration(event.durationSeconds)}
                      </span>
                    )}
                  </div>
                  {event.failReason && (
                    <p className="mt-0.5 text-xs font-medium text-red-400">{event.failReason}</p>
                  )}
                  {rec && (
                    <audio
                      src={URL.createObjectURL(rec.blob)}
                      controls
                      className="mt-1.5 h-7 w-44"
                    />
                  )}
                  <p className="mt-1 text-[10px] opacity-50">{formatDateTime(event.startedAt)}</p>
                </div>

                {/* Details menu — visible on hover */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="mb-1 flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                    >
                      <MoreHorizontal className="size-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-48">
                    {statsAvailableFor.has(event.id) && (
                      <DropdownMenuItem
                        onSelect={() => {
                          setStatsEventId(event.id)
                          setStatsOpen(true)
                        }}
                      >
                        <Activity className="mr-2 size-3.5" />
                        Media stats
                      </DropdownMenuItem>
                    )}
                    {rec && (
                      <>
                        <DropdownMenuItem onSelect={() => downloadRecording(rec)}>
                          <Download className="mr-2 size-3.5" />
                          Download recording
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => deleteRecording(rec)}
                        >
                          <Trash2 className="mr-2 size-3.5" />
                          Delete recording
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuItem disabled>
                      <Info className="mr-2 size-3.5" />
                      {formatDateTime(event.startedAt)}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )
          })}
        </div>
      )}

      <CallStatsDialog open={statsOpen} onOpenChange={setStatsOpen} eventId={statsEventId} />
    </div>
  )
}

export default CallHistory
