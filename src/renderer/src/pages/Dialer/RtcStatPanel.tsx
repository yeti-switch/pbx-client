import { useSoftphoneStore } from '@/softphone/store'
import { phoneFromUri } from '@/softphone/types'

/**
 * Live WebRTC stats panel (shown in the SIP log's "RTCStat" tab).
 *
 * Phase 2 placeholder: lists active calls and shows that live stats become
 * available once a real RTCPeerConnection exists. Phase 3 polls
 * store.getCallStats(callId) on an interval and renders the RTCStatsReport.
 */
function RtcStatPanel(): React.JSX.Element {
  const activeCalls = useSoftphoneStore((s) => s.activeCalls)
  const calls = Object.values(activeCalls)

  if (calls.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-3 text-xs text-muted-foreground">
        No active calls — live WebRTC stats appear here during a call.
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
      {calls.map((call) => (
        <div
          key={call.id}
          className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground"
        >
          <div className="font-mono text-foreground">{phoneFromUri(call.remoteUri)}</div>
          <div className="mt-1">Collecting live stats… (available in Phase 3)</div>
        </div>
      ))}
    </div>
  )
}

export default RtcStatPanel
