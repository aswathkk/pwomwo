import type { Identity } from '../types'
import { decodePairing, encodePairing, type PairingPayload } from './envelope'

const CHANNEL_LABEL = 'focus-sync'
const GATHER_TIMEOUT_MS = 3000
const MAX_MESSAGE_BYTES = 16 * 1024

export type LinkState = 'connecting' | 'connected' | 'closed'

export interface LinkEvents {
  onState: (link: PeerLink, state: LinkState) => void
  onMessage: (link: PeerLink, message: Record<string, unknown>) => void
}

/**
 * One direct connection to one other device. The data channel is created with
 * `negotiated: true, id: 0` on both sides so the answerer never has to wait for
 * an `ondatachannel` announcement. That is one fewer round trip in a handshake
 * the user is physically carrying between screens.
 */
export class PeerLink {
  readonly pc: RTCPeerConnection
  readonly channel: RTCDataChannel
  /** Filled in once `hello` arrives. */
  peerId = ''
  peerName = 'Device'
  peerFingerprint = ''
  verified = false
  lastSyncAt: number | null = null
  /** Peer clock minus ours, in ms; median of recent round trips (PRD SYN-13). */
  clockOffsetMs = 0
  private readonly offsets: number[] = []
  private missedHeartbeats = 0
  private state: LinkState = 'connecting'
  private restarting = false

  constructor(
    stunEnabled: boolean,
    private readonly events: LinkEvents,
  ) {
    this.pc = new RTCPeerConnection({
      iceServers: stunEnabled ? [{ urls: 'stun:stun.l.google.com:19302' }] : [],
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    })
    this.channel = this.pc.createDataChannel(CHANNEL_LABEL, {
      ordered: true,
      negotiated: true,
      id: 0,
    })
    this.channel.onopen = () => this.setState('connected')
    this.channel.onclose = () => this.setState('closed')
    this.channel.onerror = () => this.setState('closed')
    this.channel.onmessage = (e) => {
      try {
        const parsed = JSON.parse(String(e.data)) as Record<string, unknown>
        this.missedHeartbeats = 0
        this.events.onMessage(this, parsed)
      } catch {
        // A malformed frame must never take the timer down with it.
      }
    }
    this.pc.oniceconnectionstatechange = () => {
      const s = this.pc.iceConnectionState
      if (s === 'failed') this.tryRestart()
      if (s === 'disconnected') setTimeout(() => this.tryRestart(), 3000)
      if (s === 'closed') this.setState('closed')
    }
  }

  private setState(state: LinkState): void {
    if (this.state === state) return
    this.state = state
    this.events.onState(this, state)
  }

  get linkState(): LinkState {
    return this.state
  }

  /** Non-trickle ICE: one complete description is all a QR can carry. */
  private async gathered(): Promise<string> {
    if (this.pc.iceGatheringState !== 'complete') {
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer)
          this.pc.removeEventListener('icegatheringstatechange', check)
          resolve()
        }
        const check = () => {
          if (this.pc.iceGatheringState === 'complete') done()
        }
        const timer = setTimeout(done, GATHER_TIMEOUT_MS)
        this.pc.addEventListener('icegatheringstatechange', check)
        check()
      })
    }
    return this.pc.localDescription?.sdp ?? ''
  }

  async makeOffer(identity: Identity, publicKey: string): Promise<string> {
    const offer = await this.pc.createOffer()
    await this.pc.setLocalDescription(offer)
    return encodePairing({
      role: 'offer',
      deviceId: identity.deviceId,
      name: identity.name,
      publicKey,
      fingerprint: identity.fingerprint,
      sdp: await this.gathered(),
    })
  }

  async acceptOffer(
    payload: PairingPayload,
    identity: Identity,
    publicKey: string,
  ): Promise<string> {
    await this.pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp })
    const answer = await this.pc.createAnswer()
    await this.pc.setLocalDescription(answer)
    return encodePairing({
      role: 'answer',
      deviceId: identity.deviceId,
      name: identity.name,
      publicKey,
      fingerprint: identity.fingerprint,
      sdp: await this.gathered(),
    })
  }

  async acceptAnswer(payload: PairingPayload): Promise<void> {
    await this.pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp })
  }

  send(message: Record<string, unknown>): boolean {
    if (this.channel.readyState !== 'open') return false
    const text = JSON.stringify(message)
    if (text.length > MAX_MESSAGE_BYTES) {
      // Callers batch before they reach this point; anything left over is a bug
      // rather than a runtime condition, so drop it loudly but harmlessly.
      console.warn('[sync] dropping oversized message', message['type'])
      return false
    }
    this.channel.send(text)
    return true
  }

  noteRoundTrip(sentAt: number, peerTime: number, receivedAt: number): void {
    const rtt = receivedAt - sentAt
    this.offsets.push(peerTime - (sentAt + rtt / 2))
    while (this.offsets.length > 5) this.offsets.shift()
    const sorted = [...this.offsets].sort((a, b) => a - b)
    this.clockOffsetMs = sorted[Math.floor(sorted.length / 2)] ?? 0
  }

  /** Peer timestamps are converted into our clock; ours are never adjusted. */
  toLocalTime(peerTimestamp: number): number {
    return peerTimestamp - this.clockOffsetMs
  }

  missHeartbeat(): number {
    return ++this.missedHeartbeats
  }

  /** The DTLS fingerprint pair both sides sign, proving they hold their key. */
  async fingerprintPair(): Promise<string> {
    const local = this.pc.localDescription?.sdp.match(/^a=fingerprint:(.*)$/m)?.[1]?.trim() ?? ''
    const remote = this.pc.remoteDescription?.sdp.match(/^a=fingerprint:(.*)$/m)?.[1]?.trim() ?? ''
    return `${local}|${remote}`
  }

  private async tryRestart(): Promise<void> {
    if (this.restarting || this.state === 'closed') return
    if (this.pc.iceConnectionState === 'connected' || this.pc.iceConnectionState === 'completed') return
    this.restarting = true
    try {
      // An ICE restart survives a network change or a brief sleep. If the
      // channel has already closed there is nothing to negotiate over and the
      // user has to re-pair, because there is no server to rendezvous through.
      if (this.channel.readyState === 'open') {
        this.pc.restartIce()
        const offer = await this.pc.createOffer({ iceRestart: true })
        await this.pc.setLocalDescription(offer)
        this.send({ v: 1, type: 'sdp.restart', sdp: this.pc.localDescription?.sdp, sentAt: Date.now() })
      } else {
        this.close()
      }
    } catch {
      this.close()
    } finally {
      this.restarting = false
    }
  }

  async applyRestartOffer(sdp: string): Promise<string | null> {
    try {
      await this.pc.setRemoteDescription({ type: 'offer', sdp })
      const answer = await this.pc.createAnswer()
      await this.pc.setLocalDescription(answer)
      return this.pc.localDescription?.sdp ?? null
    } catch {
      return null
    }
  }

  async applyRestartAnswer(sdp: string): Promise<void> {
    try {
      await this.pc.setRemoteDescription({ type: 'answer', sdp })
    } catch {
      /* the heartbeat will notice if this did not take */
    }
  }

  close(): void {
    try {
      this.send({ v: 1, type: 'bye', sentAt: Date.now() })
      this.channel.close()
    } catch {
      /* already gone */
    }
    this.pc.close()
    this.setState('closed')
  }
}

export { decodePairing }
