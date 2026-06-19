import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { format, isToday, isYesterday, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import { phoneFromUri, type ActiveCall, type Contact } from '@/softphone/types'

interface ContactListProps {
  contacts: Contact[]
  activeCalls: Record<string, ActiveCall>
  selectedPhone: string | null
  onSelect: (phone: string) => void
}

function formatDate(iso: string): string {
  const d = parseISO(iso)
  if (isToday(d)) return format(d, 'HH:mm')
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'dd MMM')
}

function ContactList({
  contacts,
  activeCalls,
  selectedPhone,
  onSelect
}: ContactListProps): React.JSX.Element {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    if (!query) return contacts
    const q = query.toLowerCase()
    return contacts.filter(
      (c) => (c.displayName ?? '').toLowerCase().includes(q) || c.phone.toLowerCase().includes(q)
    )
  }, [contacts, query])

  const hasActiveCall = (phone: string): boolean =>
    Object.values(activeCalls).some((c) => phoneFromUri(c.remoteUri) === phone)

  return (
    <div className="flex h-full flex-col border-r border-border">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          value={query}
          type="text"
          placeholder="Search contacts"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            type="button"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => setQuery('')}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <div className="thin-scroll flex-1 overflow-y-auto">
        {contacts.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">No contacts yet</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">No contacts found</p>
        ) : (
          filtered.map((contact) => (
            <button
              key={contact.phone}
              type="button"
              className={cn(
                'flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-accent',
                selectedPhone === contact.phone && 'bg-accent'
              )}
              onClick={() => onSelect(contact.phone)}
            >
              <div className="flex min-w-0 items-center gap-2">
                {hasActiveCall(contact.phone) && (
                  <span className="size-2 shrink-0 animate-pulse rounded-full bg-green-500" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-medium leading-tight">
                  {contact.displayName || contact.phone}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground/60">
                  {formatDate(contact.lastCallAt)}
                </span>
              </div>
              <span className="truncate text-xs text-muted-foreground">{contact.phone}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

export default ContactList
