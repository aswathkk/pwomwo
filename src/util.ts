/** Crypto-quality UUID v4, with a fallback for the (rare) browser without it. */
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  b[6] = (b[6]! & 0x0f) | 0x40
  b[8] = (b[8]! & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0'))
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h
    .slice(8, 10)
    .join('')}-${h.slice(10).join('')}`
}

/** Namespace for Marinara imports, so the same row always yields the same id. */
export const NAMESPACE_MARINARA = '8f2b1c64-5f3e-4c8a-9a2b-6d1e7c0f4a31'

async function sha1(bytes: Uint8Array): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest('SHA-1', bytes as BufferSource)
  return new Uint8Array(buf)
}

function parseUuid(u: string): Uint8Array {
  const hex = u.replace(/-/g, '')
  const out = new Uint8Array(16)
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

/**
 * RFC 4122 v5 (SHA-1, name-based). Imports need *deterministic* ids so that
 * re-importing a file, or importing the same export on two devices, merges to
 * nothing rather than duplicating (PRD §5.3).
 */
export async function uuidv5(namespace: string, name: string): Promise<string> {
  const ns = parseUuid(namespace)
  const nameBytes = new TextEncoder().encode(name)
  const buf = new Uint8Array(ns.length + nameBytes.length)
  buf.set(ns, 0)
  buf.set(nameBytes, ns.length)
  const hash = await sha1(buf)
  const b = hash.slice(0, 16)
  b[6] = (b[6]! & 0x0f) | 0x50
  b[8] = (b[8]! & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0'))
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h
    .slice(8, 10)
    .join('')}-${h.slice(10).join('')}`
}

/** FNV-1a over a string, as an unsigned 32-bit number. Used for day hashes. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

/** `MM:SS`, or `H:MM:SS` once an hour or more is on the clock (PRD UI-3). */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/** Local `YYYY-MM-DD` for a Date, without the UTC shift `toISOString()` adds. */
export function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * The wall-clock moment a session ended, as seen *where it was recorded*.
 * Charts bucket by this so travelling doesn't smear the distribution (PRD §7.5).
 */
export function localDateOfRecord(endedAt: number, tzOffsetMin: number): Date {
  return new Date(endedAt - tzOffsetMin * 60_000)
}

export function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function startOfWeek(d: Date, weekStart: 0 | 1): Date {
  const x = startOfDay(d)
  const diff = (x.getDay() - weekStart + 7) % 7
  x.setDate(x.getDate() - diff)
  return x
}

export function startOfMonth(d: Date): Date {
  const x = startOfDay(d)
  x.setDate(1)
  return x
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** `+05:30` style offset for a `tzOffsetMin` as returned by `getTimezoneOffset()`. */
export function offsetString(tzOffsetMin: number): string {
  const east = -tzOffsetMin
  const sign = east < 0 ? '-' : '+'
  const abs = Math.abs(east)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

/** ISO 8601 rendered in the record's own offset, as Marinara's CSV does. */
export function isoInOffset(endedAt: number, tzOffsetMin: number): string {
  const shifted = new Date(endedAt - tzOffsetMin * 60_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}` +
    `T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(
      shifted.getUTCSeconds(),
    )}.${String(shifted.getUTCMilliseconds()).padStart(3, '0')}${offsetString(tzOffsetMin)}`
  )
}
