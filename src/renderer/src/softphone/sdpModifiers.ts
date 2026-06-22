/**
 * Pure SDP modifier functions (no DOM / no app deps) used as
 * sip.js SessionDescriptionHandlerModifiers. Kept standalone so they're unit-testable.
 */

/**
 * Drop ICE candidate lines whose transport is TCP, so only UDP candidates are
 * offered/answered. (The browser still gathers TCP host candidates internally —
 * there's no standard API to disable that — but they're never put on the wire.)
 */
export function stripTcpCandidates(
  description: RTCSessionDescriptionInit
): Promise<RTCSessionDescriptionInit> {
  if (description.sdp) {
    description.sdp = description.sdp
      .split(/\r?\n/)
      .filter((line) => {
        const m = line.match(/^a=candidate:\S+ \d+ (\w+)/i)
        return !(m && m[1].toLowerCase() === 'tcp')
      })
      .join('\r\n')
  }
  return Promise.resolve(description)
}

/**
 * Keep ONLY server-reflexive (srflx) ICE candidates — drop host and relay.
 * Enabled via the "ICE srflx only" WebRTC setting.
 */
export function stripToSrflxOnly(
  description: RTCSessionDescriptionInit
): Promise<RTCSessionDescriptionInit> {
  if (description.sdp) {
    description.sdp = description.sdp
      .split(/\r?\n/)
      .filter((line) => !line.startsWith('a=candidate:') || /\btyp srflx\b/.test(line))
      .join('\r\n')
  }
  return Promise.resolve(description)
}
