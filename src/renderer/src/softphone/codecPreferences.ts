/**
 * Audio codec priority / enable-disable via the native
 * `RTCRtpTransceiver.setCodecPreferences()` — no SDP munging.
 *
 * `preferred` is the ordered list of ENABLED rtpmap subtypes (e.g.
 * "opus","G722","PCMU","PCMA"), highest priority first. Codecs not listed are
 * disabled (omitted from the offer/answer). Auxiliary codecs
 * (telephone-event/CN/RED) are always kept, else DTMF / FEC break.
 */

const AUX = new Set(['telephone-event', 'cn', 'red'])

const subtype = (c: RTCRtpCodec): string => c.mimeType.replace(/^audio\//i, '').toLowerCase()

/** List the selectable voice codecs supported by this build, in default order. */
export function availableVoiceCodecs(): string[] {
  const caps = RTCRtpSender.getCapabilities?.('audio')?.codecs ?? []
  const seen = new Set<string>()
  const out: string[] = []
  for (const c of caps) {
    const name = c.mimeType.replace(/^audio\//i, '')
    if (AUX.has(name.toLowerCase())) continue
    if (seen.has(name)) continue
    seen.add(name)
    out.push(name)
  }
  return out
}

/**
 * Apply codec preferences to every audio transceiver of `pc`. Must be called
 * before createOffer/createAnswer. No-op when `preferred` is empty (browser default).
 */
export function applyCodecPreferences(pc: RTCPeerConnection, preferred: string[]): void {
  if (!preferred.length) return
  const caps = RTCRtpSender.getCapabilities?.('audio')?.codecs ?? []
  if (!caps.length) return

  const order = preferred.map((c) => c.toLowerCase())
  const voice = caps
    .filter((c) => !AUX.has(subtype(c)) && order.includes(subtype(c)))
    .sort((a, b) => order.indexOf(subtype(a)) - order.indexOf(subtype(b)))
  const aux = caps.filter((c) => AUX.has(subtype(c)))
  const ordered = [...voice, ...aux]
  if (!ordered.length) return

  for (const t of pc.getTransceivers()) {
    try {
      t.setCodecPreferences(ordered) // throws on non-audio transceivers — ignored
    } catch {
      /* not an audio transceiver / stopped */
    }
  }
}
