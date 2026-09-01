import { base45Decode, base45Encode, deflate, inflate } from './codec'
import { compactSdp, deserializeCompact, expandSdp, serializeCompact } from './sdp'

/** The `FT1:` prefix lets a scanner reject QR codes that are not ours. */
export const PREFIX = 'FT1:'

/** ASCII unit separator. No field we pack can contain one. */
const SEP = '\u001f'

export interface PairingPayload {
  role: 'offer' | 'answer'
  deviceId: string
  name: string
  publicKey: string
  fingerprint: string
  sdp: string
}

export async function encodePairing(p: PairingPayload): Promise<string> {
  const body = [
    p.role,
    p.deviceId,
    p.name,
    p.publicKey,
    p.fingerprint,
    serializeCompact(compactSdp(p.sdp)),
  ].join(SEP)
  return PREFIX + base45Encode(await deflate(body))
}

/**
 * Which half of the handshake a code carries. The payload is compressed, so
 * the role cannot be sniffed from the text and has to be decoded.
 */
export async function peekRole(code: string): Promise<'offer' | 'answer'> {
  return (await decodePairing(code)).role
}

export async function decodePairing(code: string): Promise<PairingPayload> {
  const trimmed = code.trim()
  if (!trimmed.startsWith(PREFIX)) throw new Error('That code is not a pwomwo pairing code.')
  const body = await inflate(base45Decode(trimmed.slice(PREFIX.length)))
  const [role, deviceId, name, publicKey, fingerprint, compact] = body.split(SEP)
  if (!role || !deviceId || !compact) throw new Error('That code is incomplete. Scan it again.')
  if (role !== 'offer' && role !== 'answer') throw new Error('That code is not one pwomwo can use.')
  return {
    role,
    deviceId,
    name: (name || 'Device').slice(0, 32),
    publicKey: publicKey ?? '',
    fingerprint: fingerprint ?? '',
    sdp: expandSdp(deserializeCompact(compact), role),
  }
}
