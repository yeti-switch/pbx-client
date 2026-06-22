import { describe, it, expect } from 'vitest'
import { stripTcpCandidates, stripToSrflxOnly } from './sdpModifiers'

const SDP = [
  'v=0',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111',
  'a=candidate:1 1 udp 2122129151 10.0.0.1 60335 typ host generation 0',
  'a=candidate:2 1 tcp 1518149375 10.0.0.1 9 typ host tcptype active generation 0',
  'a=candidate:3 1 udp 1685724927 46.19.210.34 17858 typ srflx raddr 10.0.0.1 rport 60335',
  'a=candidate:4 1 udp 41885439 1.2.3.4 50000 typ relay raddr 46.19.210.34 rport 17858',
  'a=end-of-candidates'
].join('\r\n')

const candidates = (sdp: string): string[] =>
  sdp.split(/\r?\n/).filter((l) => l.startsWith('a=candidate:'))

describe('stripTcpCandidates', () => {
  it('removes only tcp candidate lines, keeps udp/srflx/relay', async () => {
    const { sdp } = await stripTcpCandidates({ type: 'offer', sdp: SDP })
    const lines = candidates(sdp!)
    expect(lines).toHaveLength(3)
    expect(lines.some((l) => / tcp /.test(l))).toBe(false)
    expect(lines.some((l) => /typ srflx/.test(l))).toBe(true)
    expect(lines.some((l) => /typ relay/.test(l))).toBe(true)
  })

  it('leaves non-candidate lines intact', async () => {
    const { sdp } = await stripTcpCandidates({ type: 'offer', sdp: SDP })
    expect(sdp).toContain('m=audio')
    expect(sdp).toContain('a=end-of-candidates')
  })

  it('is a no-op when there is no sdp', async () => {
    const out = await stripTcpCandidates({ type: 'offer' })
    expect(out.sdp).toBeUndefined()
  })
})

describe('stripToSrflxOnly', () => {
  it('keeps only srflx candidates, drops host/tcp/relay', async () => {
    const { sdp } = await stripToSrflxOnly({ type: 'answer', sdp: SDP })
    const lines = candidates(sdp!)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('typ srflx')
  })

  it('keeps non-candidate lines', async () => {
    const { sdp } = await stripToSrflxOnly({ type: 'answer', sdp: SDP })
    expect(sdp).toContain('m=audio')
  })
})
