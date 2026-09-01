/**
 * SDP compaction for data-channel-only sessions.
 *
 * Everything except the handful of lines below is identical for every offer a
 * browser produces for a single negotiated data channel, so we transmit only
 * the variable parts and rebuild the rest on arrival.
 */

export interface CompactSdp {
  ufrag: string
  pwd: string
  fingerprint: string
  setup: string
  sctpPort: string
  maxMessageSize: string
  candidates: string[]
}

const KEEP_CANDIDATE = /^a=candidate:.* (?:host|srflx) /

export function compactSdp(sdp: string): CompactSdp {
  const line = (re: RegExp): string => {
    const m = sdp.match(re)
    return m?.[1]?.trim() ?? ''
  }
  // Only the UDP host and server-reflexive candidates are useful without a
  // relay, and dropping the rest is what keeps the QR payload small.
  const candidates = sdp
    .split(/\r?\n/)
    .filter((l) => KEEP_CANDIDATE.test(l) && !/ tcp /i.test(l))
    .map((l) => l.replace(/^a=candidate:/, '').trim())
  return {
    ufrag: line(/^a=ice-ufrag:(.*)$/m),
    pwd: line(/^a=ice-pwd:(.*)$/m),
    fingerprint: line(/^a=fingerprint:(.*)$/m),
    setup: line(/^a=setup:(.*)$/m) || 'actpass',
    sctpPort: line(/^a=sctp-port:(.*)$/m) || '5000',
    maxMessageSize: line(/^a=max-message-size:(.*)$/m) || '262144',
    candidates,
  }
}

export function expandSdp(c: CompactSdp, type: 'offer' | 'answer'): string {
  const lines = [
    'v=0',
    'o=- 4611731400430051336 2 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    'a=group:BUNDLE 0',
    'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 0.0.0.0',
    ...c.candidates.map((x) => `a=candidate:${x}`),
    'a=ice-options:trickle',
    `a=ice-ufrag:${c.ufrag}`,
    `a=ice-pwd:${c.pwd}`,
    `a=fingerprint:${c.fingerprint}`,
    `a=setup:${c.setup || (type === 'offer' ? 'actpass' : 'active')}`,
    'a=mid:0',
    `a=sctp-port:${c.sctpPort}`,
    `a=max-message-size:${c.maxMessageSize}`,
  ]
  return lines.join('\r\n') + '\r\n'
}

/** Field order is fixed so the wire form stays as short as possible. */
export function serializeCompact(c: CompactSdp): string {
  return [
    c.ufrag,
    c.pwd,
    c.fingerprint,
    c.setup,
    c.sctpPort,
    c.maxMessageSize,
    ...c.candidates,
  ].join('\n')
}

export function deserializeCompact(s: string): CompactSdp {
  const parts = s.split('\n')
  if (parts.length < 6) throw new Error('That code is incomplete. Scan it again.')
  return {
    ufrag: parts[0]!,
    pwd: parts[1]!,
    fingerprint: parts[2]!,
    setup: parts[3]!,
    sctpPort: parts[4]!,
    maxMessageSize: parts[5]!,
    candidates: parts.slice(6).filter(Boolean),
  }
}
