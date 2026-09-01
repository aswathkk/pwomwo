import type { Identity, PeerRecord, PeerStatus, SessionRecord, TimerDoc } from '../types'
import type { HistoryRepo } from '../history/repo'
import { PeerLink, type LinkState } from './peer'
import { decodePairing, type PairingPayload } from './envelope'
import { fingerprintOfHex, publicKeyHex, sign, verify } from './identity'
import { put } from '../db'
import { APP_VERSION } from '../version'

const MAX_PEERS = 3
const HEARTBEAT_MS = 5000
const PING_MS = 30_000
const RECORDS_PER_MESSAGE = 40
const SKEW_WARN_MS = 30_000

export interface SyncHost {
  identity: Identity
  repo: HistoryRepo
  stunEnabled: () => boolean
  getTimerDoc: () => TimerDoc
  applyTimerDoc: (doc: TimerDoc) => void
  onPeersChanged: (peers: PeerStatus[]) => void
  toast: (message: string, tone?: 'info' | 'good' | 'warn' | 'bad') => void
  confirmClear: (peerName: string) => Promise<boolean>
  clearHistoryLocally: () => Promise<void>
}

interface Envelope {
  v: 1
  id?: string
  sentAt: number
  type: string
  [key: string]: unknown
}

/**
 * Owns the mesh. Every device is a full replica: the timer converges by
 * last-writer-wins on a Lamport clock, history by union of a grow-only set.
 */
export class SyncManager {
  private readonly links = new Set<PeerLink>()
  private pending: PeerLink | null = null
  private heartbeat: number | null = null
  private pinger: number | null = null
  private skewWarned = false

  constructor(private readonly host: SyncHost) {}

  get peerCount(): number {
    return [...this.links].filter((l) => l.linkState === 'connected').length
  }

  statuses(): PeerStatus[] {
    return [...this.links].map((l) => ({
      deviceId: l.peerId,
      name: l.peerName,
      state:
        l.linkState === 'connected' ? 'connected' : l.linkState === 'connecting' ? 'connecting' : 'offline',
      lastSyncAt: l.lastSyncAt,
    }))
  }

  /** ── Pairing ────────────────────────────────────────────────────────── */

  async createOffer(): Promise<string> {
    if (this.links.size >= MAX_PEERS) {
      throw new Error(`You can pair up to ${MAX_PEERS} devices. Forget one first.`)
    }
    this.pending?.close()
    const link = this.newLink()
    this.pending = link
    return link.makeOffer(this.host.identity, publicKeyHex(this.host.identity))
  }

  /** Device B: consume A's offer and produce the answer code to show back. */
  async acceptOfferCode(code: string): Promise<string> {
    const payload = await decodePairing(code)
    if (payload.role !== 'offer') throw new Error('That is an answer code. Scan the offer first.')
    await this.verifyCodeIntegrity(payload)
    const link = this.newLink()
    this.pending = link
    this.remember(link, payload)
    return link.acceptOffer(payload, this.host.identity, publicKeyHex(this.host.identity))
  }

  /** Device A: consume B's answer and complete the connection. */
  async acceptAnswerCode(code: string): Promise<void> {
    const payload = await decodePairing(code)
    if (payload.role !== 'answer') throw new Error('That is an offer code. This device has already made an offer.')
    const link = this.pending
    if (!link) throw new Error('Start a pairing on this device first.')
    await this.verifyCodeIntegrity(payload)
    this.remember(link, payload)
    await link.acceptAnswer(payload)
  }

  /**
   * The fingerprint in the code must match the public key beside it. This is
   * the one moment a tampered QR could bind a device the user did not choose.
   */
  private async verifyCodeIntegrity(payload: PairingPayload): Promise<void> {
    if (!payload.publicKey) return
    const derived = await fingerprintOfHex(payload.publicKey)
    if (derived !== payload.fingerprint) {
      throw new Error('That pairing code failed its own integrity check.')
    }
  }

  private remember(link: PeerLink, payload: PairingPayload): void {
    link.peerId = payload.deviceId
    link.peerName = payload.name.slice(0, 32)
    link.peerFingerprint = payload.fingerprint
  }

  private newLink(): PeerLink {
    const link = new PeerLink(this.host.stunEnabled(), {
      onState: (l, s) => this.onLinkState(l, s),
      onMessage: (l, m) => void this.onMessage(l, m as unknown as Envelope),
    })
    this.links.add(link)
    this.host.onPeersChanged(this.statuses())
    return link
  }

  private onLinkState(link: PeerLink, state: LinkState): void {
    if (state === 'connected') {
      if (this.pending === link) this.pending = null
      void this.sayHello(link)
      this.ensureTimers()
    }
    if (state === 'closed') {
      this.links.delete(link)
      if (this.pending === link) this.pending = null
      if (link.verified) this.host.toast(`${link.peerName} disconnected`, 'warn')
      if (this.links.size === 0) this.stopTimers()
    }
    this.host.onPeersChanged(this.statuses())
  }

  /** ── Handshake ──────────────────────────────────────────────────────── */

  private async sayHello(link: PeerLink): Promise<void> {
    const pair = await link.fingerprintPair()
    link.send({
      v: 1,
      type: 'hello',
      sentAt: Date.now(),
      deviceId: this.host.identity.deviceId,
      name: this.host.identity.name,
      publicKey: publicKeyHex(this.host.identity),
      signature: await sign(this.host.identity, pair),
      appVersion: APP_VERSION,
      capabilities: ['timer', 'history'],
    })
    link.send({ v: 1, type: 'ping', sentAt: Date.now() })
  }

  private async onMessage(link: PeerLink, msg: Envelope): Promise<void> {
    switch (msg.type) {
      case 'hello':
        return this.onHello(link, msg)
      case 'ping':
        link.send({ v: 1, type: 'pong', sentAt: Date.now(), echo: msg.sentAt })
        return
      case 'pong': {
        const echo = Number(msg['echo'])
        if (Number.isFinite(echo)) {
          link.noteRoundTrip(echo, msg.sentAt, Date.now())
          if (!this.skewWarned && Math.abs(link.clockOffsetMs) > SKEW_WARN_MS) {
            this.skewWarned = true
            this.host.toast(
              `Your devices' clocks differ by ${Math.round(Math.abs(link.clockOffsetMs) / 1000)} s`,
              'warn',
            )
          }
        }
        return
      }
      case 'timer.state':
        return this.onTimerState(link, msg)
      case 'history.digest':
        return this.onDigest(link, msg)
      case 'history.request':
        return this.onRequest(link, msg)
      case 'history.records':
        return this.onRecords(link, msg)
      case 'history.add':
        return this.onRecords(link, { ...msg, records: [msg['record']] })
      case 'history.clearRequest':
        return this.onClearRequest(link)
      case 'history.clearAck':
        this.host.toast(`${link.peerName} cleared its history`, 'info')
        return
      case 'sdp.restart': {
        const answer = await link.applyRestartOffer(String(msg['sdp'] ?? ''))
        if (answer) link.send({ v: 1, type: 'sdp.restartAnswer', sdp: answer, sentAt: Date.now() })
        return
      }
      case 'sdp.restartAnswer':
        return link.applyRestartAnswer(String(msg['sdp'] ?? ''))
      case 'bye':
        link.close()
        return
      default:
        // Unknown types are ignored so a newer peer can add messages freely.
        return
    }
  }

  private async onHello(link: PeerLink, msg: Envelope): Promise<void> {
    const publicKey = String(msg['publicKey'] ?? '')
    const signature = String(msg['signature'] ?? '')
    link.peerId = String(msg['deviceId'] ?? link.peerId)
    // A peer controls this string; keep it to a name-sized budget.
    link.peerName = String(msg['name'] ?? link.peerName).slice(0, 32)

    // Both sides sign the same pair of DTLS fingerprints, in their own order.
    const pair = await link.fingerprintPair()
    const [local, remote] = pair.split('|')
    const theirView = `${remote}|${local}`
    const ok =
      (await verify(publicKey, theirView, signature)) || (await verify(publicKey, pair, signature))

    if (!ok || (link.peerFingerprint && (await fingerprintOfHex(publicKey)) !== link.peerFingerprint)) {
      this.host.toast('Device identity did not match, so it was disconnected', 'bad')
      link.close()
      return
    }
    link.verified = true
    link.peerFingerprint = await fingerprintOfHex(publicKey)
    link.lastSyncAt = Date.now()

    const record: PeerRecord = {
      deviceId: link.peerId,
      name: link.peerName,
      fingerprint: link.peerFingerprint,
      lastConnected: Date.now(),
    }
    await put('peers', record)

    this.host.toast(`${link.peerName} connected`, 'good')
    this.host.onPeersChanged(this.statuses())

    // Initial sync: exchange day digests, then only the days that differ.
    link.send({ v: 1, type: 'history.digest', sentAt: Date.now(), digest: this.host.repo.digest() })
    link.send({ v: 1, type: 'timer.state', sentAt: Date.now(), doc: this.host.getTimerDoc() })
  }

  /** ── Timer replication ──────────────────────────────────────────────── */

  private onTimerState(link: PeerLink, msg: Envelope): void {
    const doc = msg['doc'] as TimerDoc | undefined
    if (!doc || doc.type !== 'timer.state') return
    // Convert the peer's wall clock into ours before anything reads `endsAt`.
    const corrected: TimerDoc = {
      ...doc,
      endsAt: doc.endsAt == null ? null : link.toLocalTime(doc.endsAt),
      updatedAt: link.toLocalTime(doc.updatedAt),
    }
    this.host.applyTimerDoc(corrected)
  }

  broadcastTimer(doc: TimerDoc): void {
    for (const link of this.links) {
      if (link.verified) link.send({ v: 1, type: 'timer.state', sentAt: Date.now(), doc })
    }
  }

  /** ── History reconciliation ─────────────────────────────────────────── */

  private onDigest(link: PeerLink, msg: Envelope): void {
    const theirs = (msg['digest'] ?? {}) as Record<string, { count: number; hash: number }>
    const mine = this.host.repo.digest()
    const days = new Set([...Object.keys(theirs), ...Object.keys(mine)])
    const wanted: string[] = []
    const offer: string[] = []
    for (const day of days) {
      const a = mine[day]
      const b = theirs[day]
      if (!b || a?.hash !== b.hash || a?.count !== b.count) {
        if (b) wanted.push(day)
        if (a) offer.push(day)
      }
    }
    if (wanted.length) link.send({ v: 1, type: 'history.request', sentAt: Date.now(), days: wanted })
    if (offer.length) this.sendRecords(link, this.host.repo.recordsForDays(offer))
  }

  private onRequest(link: PeerLink, msg: Envelope): void {
    const days = (msg['days'] ?? []) as string[]
    this.sendRecords(link, this.host.repo.recordsForDays(days))
  }

  private sendRecords(link: PeerLink, records: SessionRecord[]): void {
    for (let i = 0; i < records.length; i += RECORDS_PER_MESSAGE) {
      link.send({
        v: 1,
        type: 'history.records',
        sentAt: Date.now(),
        records: records.slice(i, i + RECORDS_PER_MESSAGE),
      })
    }
  }

  private async onRecords(link: PeerLink, msg: Envelope): Promise<void> {
    const records = ((msg['records'] ?? []) as SessionRecord[]).filter(
      (r) => r && typeof r.id === 'string' && Number.isFinite(r.endedAt),
    )
    if (!records.length) return
    const { added } = await this.host.repo.merge(records)
    link.lastSyncAt = Date.now()
    if (added > 0) this.host.onPeersChanged(this.statuses())
  }

  broadcastRecord(record: SessionRecord): void {
    for (const link of this.links) {
      if (link.verified) link.send({ v: 1, type: 'history.add', sentAt: Date.now(), record })
    }
  }

  /** Imports arrive in batches so no single frame goes near the 16 KB cap. */
  broadcastImported(records: SessionRecord[]): void {
    for (const link of this.links) {
      if (link.verified) this.sendRecords(link, records)
    }
  }

  requestClearOnPeers(): void {
    for (const link of this.links) {
      if (link.verified) link.send({ v: 1, type: 'history.clearRequest', sentAt: Date.now() })
    }
  }

  private async onClearRequest(link: PeerLink): Promise<void> {
    const ok = await this.host.confirmClear(link.peerName)
    if (!ok) return
    await this.host.clearHistoryLocally()
    link.send({ v: 1, type: 'history.clearAck', sentAt: Date.now() })
  }

  /** ── Keep-alive ─────────────────────────────────────────────────────── */

  private ensureTimers(): void {
    if (this.heartbeat === null) {
      this.heartbeat = window.setInterval(() => {
        const doc = this.host.getTimerDoc()
        for (const link of this.links) {
          if (!link.verified) continue
          if (link.missHeartbeat() > 3 && link.linkState !== 'connected') link.close()
          link.send({ v: 1, type: 'timer.state', sentAt: Date.now(), doc })
        }
      }, HEARTBEAT_MS)
    }
    if (this.pinger === null) {
      this.pinger = window.setInterval(() => {
        for (const link of this.links) {
          if (link.verified) link.send({ v: 1, type: 'ping', sentAt: Date.now() })
        }
      }, PING_MS)
    }
  }

  private stopTimers(): void {
    if (this.heartbeat !== null) clearInterval(this.heartbeat)
    if (this.pinger !== null) clearInterval(this.pinger)
    this.heartbeat = null
    this.pinger = null
  }

  async forget(deviceId: string): Promise<void> {
    for (const link of [...this.links]) {
      if (link.peerId === deviceId) link.close()
    }
    const { del } = await import('../db')
    await del('peers', deviceId)
    this.host.onPeersChanged(this.statuses())
  }

  closeAll(): void {
    for (const link of [...this.links]) link.close()
    this.stopTimers()
  }
}
