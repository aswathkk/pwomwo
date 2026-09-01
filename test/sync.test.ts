import { beforeEach, describe, expect, test } from 'bun:test'
import { clear, getAll, put } from '../src/db'
import { SyncManager } from '../src/sync/protocol'
import type { PeerRecord, PeerStatus } from '../src/types'
import { base45Decode, base45Encode } from '../src/sync/codec'
import { compactSdp, deserializeCompact, expandSdp, serializeCompact } from '../src/sync/sdp'
import { decodePairing, encodePairing, PREFIX } from '../src/sync/envelope'
import { NAMESPACE_MARINARA, fnv1a, uuidv5 } from '../src/util'

const OFFER = [
  'v=0',
  'o=- 4611731400430051336 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'a=extmap-allow-mixed',
  'a=msid-semantic: WMS',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  'a=candidate:1 1 udp 2113937151 1e2b3c4d.local 54321 typ host generation 0',
  'a=candidate:2 1 udp 1677729535 203.0.113.7 54322 typ srflx raddr 0.0.0.0 rport 0',
  'a=candidate:3 1 tcp 1518280447 1e2b3c4d.local 9 typ host tcptype active',
  'a=ice-ufrag:F7gI',
  'a=ice-pwd:x9k2mQ0vN4pR8tW1yZ3aB5c',
  'a=ice-options:trickle',
  'a=fingerprint:sha-256 AB:CD:EF:01:23:45:67:89',
  'a=setup:actpass',
  'a=mid:0',
  'a=sctp-port:5000',
  'a=max-message-size:262144',
].join('\r\n')

describe('base45', () => {
  test('round-trips both even and odd byte lengths', () => {
    for (const length of [0, 1, 2, 3, 16, 255]) {
      const bytes = new Uint8Array(length).map((_, i) => (i * 37 + 11) % 256)
      expect([...base45Decode(base45Encode(bytes))]).toEqual([...bytes])
    }
  })

  test('rejects a character outside the alphabet', () => {
    expect(() => base45Decode('abc')).toThrow()
  })
})

describe('SDP compaction', () => {
  const compact = compactSdp(OFFER)

  test('keeps only what the far side cannot reconstruct', () => {
    expect(compact.ufrag).toBe('F7gI')
    expect(compact.pwd).toBe('x9k2mQ0vN4pR8tW1yZ3aB5c')
    expect(compact.fingerprint).toBe('sha-256 AB:CD:EF:01:23:45:67:89')
    expect(compact.setup).toBe('actpass')
  })

  test('drops TCP candidates and keeps host and srflx', () => {
    expect(compact.candidates).toHaveLength(2)
    expect(compact.candidates.some((c) => c.includes('tcp'))).toBe(false)
    expect(compact.candidates.some((c) => c.includes('typ srflx'))).toBe(true)
  })

  test('expansion restores every line the ICE agent needs', () => {
    const rebuilt = expandSdp(compact, 'offer')
    for (const needle of [
      'a=ice-ufrag:F7gI',
      'a=ice-pwd:x9k2mQ0vN4pR8tW1yZ3aB5c',
      'a=fingerprint:sha-256 AB:CD:EF:01:23:45:67:89',
      'a=setup:actpass',
      'a=sctp-port:5000',
      'a=max-message-size:262144',
      'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    ]) {
      expect(rebuilt).toContain(needle)
    }
    expect(rebuilt.match(/a=candidate:/g)).toHaveLength(2)
  })

  test('the compact form survives its own serialisation', () => {
    expect(deserializeCompact(serializeCompact(compact))).toEqual(compact)
  })
})

describe('pairing envelope', () => {
  const payload = {
    role: 'offer' as const,
    deviceId: 'dev_8f3a1c',
    name: 'Laptop',
    publicKey: 'ab'.repeat(65),
    fingerprint: 'f'.repeat(32),
    sdp: OFFER,
  }

  test('round-trips through compression and Base45', async () => {
    const code = await encodePairing(payload)
    const back = await decodePairing(code)
    expect(back.role).toBe('offer')
    expect(back.deviceId).toBe(payload.deviceId)
    expect(back.name).toBe('Laptop')
    expect(back.publicKey).toBe(payload.publicKey)
    expect(back.sdp).toContain('a=ice-ufrag:F7gI')
  })

  test('is prefixed and stays inside a scannable QR budget', async () => {
    const code = await encodePairing(payload)
    expect(code.startsWith(PREFIX)).toBe(true)
    // PRD §7.4 expects 350 to 900 characters for a data-channel-only session.
    expect(code.length).toBeLessThan(900)
  })

  test('rejects a QR that is not ours', async () => {
    await expect(decodePairing('https://example.com')).rejects.toThrow(/not a pwomwo pairing code/)
  })
})

describe('identity helpers', () => {
  test('uuidv5 is deterministic and correctly versioned', async () => {
    const a = await uuidv5(NAMESPACE_MARINARA, '29803975:1500')
    const b = await uuidv5(NAMESPACE_MARINARA, '29803975:1500')
    const c = await uuidv5(NAMESPACE_MARINARA, '29803976:1500')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a[14]).toBe('5')
    expect('89ab').toContain(a[19]!)
  })

  test('fnv1a is stable and unsigned', () => {
    expect(fnv1a('abc')).toBe(fnv1a('abc'))
    expect(fnv1a('abc')).toBeGreaterThanOrEqual(0)
    expect(fnv1a('abc')).not.toBe(fnv1a('abd'))
  })
})

describe('remembered peers', () => {
  const host = (onPeersChanged: (peers: PeerStatus[]) => void) =>
    ({
      identity: { deviceId: 'dev_self' } as never,
      repo: {} as never,
      stunEnabled: () => false,
      getTimerDoc: () => ({}) as never,
      applyTimerDoc: () => {},
      onPeersChanged,
      toast: () => {},
      confirmClear: async () => false,
      clearHistoryLocally: async () => {},
    }) as never

  const record = (deviceId: string, name: string, lastConnected: number): PeerRecord => ({
    deviceId,
    name,
    fingerprint: `fp_${deviceId}`,
    lastConnected,
  })

  beforeEach(async () => {
    await clear('peers')
  })

  test('a pairing survives a reload as an offline device', async () => {
    await put('peers', record('dev_a', 'Phone', 1_700_000_000_000))
    await put('peers', record('dev_b', 'Laptop', 1_700_000_100_000))

    let published: PeerStatus[] = []
    const sync = new SyncManager(host((peers) => (published = peers)))
    await sync.loadRemembered()

    const statuses = sync.statuses()
    expect(statuses).toHaveLength(2)
    expect(statuses.every((p) => p.state === 'offline')).toBe(true)
    expect(statuses.map((p) => p.name).sort()).toEqual(['Laptop', 'Phone'])
    expect(statuses.find((p) => p.deviceId === 'dev_a')?.lastSyncAt).toBe(1_700_000_000_000)
    // The UI has to be told, or the toolbar stays empty until something else moves.
    expect(published).toEqual(statuses)
  })

  test('forgetting a device drops it from the restored list', async () => {
    await put('peers', record('dev_a', 'Phone', 1))
    const sync = new SyncManager(host(() => {}))
    await sync.loadRemembered()
    await sync.forget('dev_a')
    expect(sync.statuses()).toHaveLength(0)
    expect(await getAll<PeerRecord>('peers')).toHaveLength(0)
  })
})
