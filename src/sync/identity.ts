import type { Identity } from '../types'
import { get, put } from '../db'
import { uuid } from '../util'

const ALG = { name: 'ECDSA', namedCurve: 'P-256' } as const
const SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Short, human-comparable fingerprint of the public key. */
async function fingerprintOf(publicKeyRaw: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', publicKeyRaw)
  return toHex(digest).slice(0, 32)
}

/**
 * A device's long-lived identity. The private key is generated non-extractable
 * and stored as a `CryptoKey`. IndexedDB can hold those directly, so the raw
 * key material never exists in JS (PRD SYN-2).
 */
export async function loadIdentity(deviceName: string): Promise<Identity> {
  const existing = await get<Identity>('identity', 'self')
  if (existing) return existing

  const keyPair = await crypto.subtle.generateKey(ALG, false, ['sign', 'verify'])
  const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey)
  const identity: Identity = {
    id: 'self',
    deviceId: `dev_${uuid().replace(/-/g, '').slice(0, 12)}`,
    name: deviceName,
    keyPair,
    publicKeyRaw,
    fingerprint: await fingerprintOf(publicKeyRaw),
    createdAt: Date.now(),
  }
  await put('identity', identity)
  return identity
}

export async function renameIdentity(identity: Identity, name: string): Promise<Identity> {
  const next = { ...identity, name }
  await put('identity', next)
  return next
}

export function publicKeyHex(identity: Identity): string {
  return toHex(identity.publicKeyRaw)
}

export async function sign(identity: Identity, message: string): Promise<string> {
  const sig = await crypto.subtle.sign(SIGN, identity.keyPair.privateKey, new TextEncoder().encode(message))
  return toHex(sig)
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

export async function verify(
  publicKeyHexStr: string,
  message: string,
  signatureHex: string,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey('raw', fromHex(publicKeyHexStr) as BufferSource, ALG, false, [
      'verify',
    ])
    return await crypto.subtle.verify(
      SIGN,
      key,
      fromHex(signatureHex) as BufferSource,
      new TextEncoder().encode(message) as BufferSource,
    )
  } catch {
    return false
  }
}

export async function fingerprintOfHex(publicKeyHexStr: string): Promise<string> {
  return fingerprintOf(fromHex(publicKeyHexStr).buffer as ArrayBuffer)
}
