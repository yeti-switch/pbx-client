import { useEffect, useMemo, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { useSoftphoneStore } from '@/softphone/store'
import { useConfigStore } from '@/softphone/configStore'
import { phoneFromUri, type ActiveCall } from '@/softphone/types'
import ContactList from './ContactList'
import CallHistory from './CallHistory'
import DialPanel, { type DialPanelHandle } from './DialPanel'
import SipLog from './SipLog'

function SoftPhone(): React.JSX.Element {
  const store = useSoftphoneStore()
  const {
    contacts,
    activeCalls,
    selectedPhone,
    callHistory,
    registrationState,
    lastCallError,
    recordByDefault
  } = store

  const config = useConfigStore()
  const dialPanelRef = useRef<DialPanelHandle>(null)
  const [logOpen, setLogOpen] = useState(false)

  // Load persisted SIP config once on mount.
  useEffect(() => {
    void config.load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // (Re)start the SIP engine whenever the effective config changes.
  const configKey = JSON.stringify({
    u: config.username,
    p: config.password,
    e: config.wssEndpoints,
    i: config.iceServers
  })
  useEffect(() => {
    if (!config.loaded || config.wssEndpoints.length === 0) return
    void store.init()
    return () => {
      void store.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.loaded, configKey])

  const selectedContact = useMemo(
    () => contacts.find((c) => c.phone === selectedPhone) ?? null,
    [contacts, selectedPhone]
  )
  const selectedContactHistory = useMemo(
    () => (selectedPhone ? (callHistory[selectedPhone] ?? []) : []),
    [selectedPhone, callHistory]
  )
  const activeCallsForContact = useMemo<ActiveCall[]>(
    () =>
      selectedPhone
        ? Object.values(activeCalls).filter((c) => phoneFromUri(c.remoteUri) === selectedPhone)
        : [],
    [activeCalls, selectedPhone]
  )
  const isAnyRecording = useMemo(
    () => Object.values(activeCalls).some((c) => c.recording),
    [activeCalls]
  )

  // Keyboard shortcuts (match yeti-client)
  useEffect(() => {
    const onKeydown = (e: KeyboardEvent): void => {
      if (e.ctrlKey && e.shiftKey && e.key === 'L') {
        e.preventDefault()
        setLogOpen((v) => !v)
      }
      if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key === 'r') {
        e.preventDefault()
        store.setRecordByDefault(!store.recordByDefault)
      }
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [store])

  if (config.loaded && config.wssEndpoints.length === 0) {
    return (
      <Card className="flex h-full flex-col items-center justify-center gap-0 overflow-hidden py-0">
        <p className="px-6 text-center text-sm text-muted-foreground">
          No SIP endpoint configured. Add your SIP credentials and a wss:// endpoint in Settings.
        </p>
      </Card>
    )
  }

  return (
    <Card className="flex h-full flex-col gap-0 overflow-hidden py-0">
      <div className="flex min-h-0 flex-1">
        {/* Left+center: contacts+history OR sip log */}
        <div className="flex min-w-0 flex-1 flex-col">
          {!logOpen ? (
            <div className="flex min-h-0 flex-1">
              <div className="w-64 shrink-0">
                <ContactList
                  contacts={contacts}
                  activeCalls={activeCalls}
                  selectedPhone={selectedPhone}
                  onSelect={store.selectContact}
                />
              </div>
              <div className="min-w-0 flex-1">
                <CallHistory
                  selectedPhone={selectedPhone}
                  events={selectedContactHistory}
                  contact={selectedContact}
                  onCall={store.makeCall}
                />
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 border-r border-border">
              <SipLog onClose={() => setLogOpen(false)} />
            </div>
          )}
        </div>

        {/* Right: Dialer — always visible */}
        <div className="w-72 shrink-0">
          <DialPanel
            ref={dialPanelRef}
            activeCalls={activeCallsForContact}
            registrationState={registrationState}
            lastCallError={lastCallError}
            recordByDefault={recordByDefault}
            isAnyRecording={isAnyRecording}
            onDial={store.makeCall}
            onAnswer={store.answer}
            onHangup={store.hangup}
            onToggleMute={store.toggleMute}
            onToggleHold={store.toggleHold}
            onToggleRecording={store.toggleRecording}
            onToggleRecordDefault={store.setRecordByDefault}
            onReregister={store.reregister}
            onToggleLogs={() => setLogOpen((v) => !v)}
          />
        </div>
      </div>
    </Card>
  )
}

export default SoftPhone
