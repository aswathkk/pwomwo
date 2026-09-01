/**
 * Turning an SDP into something that fits comfortably in a QR code.
 *
 * A data-channel-only offer is mostly boilerplate that both sides already know,
 * so we drop everything constant, deflate the remainder and encode it in
 * Base45. The alphanumeric QR mode packs 2 characters into 11 bits, which is
 * appreciably denser than base64 in byte mode (PRD §7.4).
 */

const B45 =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'

export function base45Encode(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  for (; i + 1 < bytes.length; i += 2) {
    const v = bytes[i]! * 256 + bytes[i + 1]!
    out += B45[v % 45]! + B45[Math.floor(v / 45) % 45]! + B45[Math.floor(v / 45 / 45)]!
  }
  if (i < bytes.length) {
    const v = bytes[i]!
    out += B45[v % 45]! + B45[Math.floor(v / 45)]!
  }
  return out
}

export function base45Decode(text: string): Uint8Array {
  const vals = [...text].map((c) => {
    const v = B45.indexOf(c)
    if (v < 0) throw new Error(`invalid character in code: ${c}`)
    return v
  })
  const out: number[] = []
  let i = 0
  for (; i + 2 < vals.length; i += 3) {
    const v = vals[i]! + vals[i + 1]! * 45 + vals[i + 2]! * 45 * 45
    if (v > 0xffff) throw new Error('invalid code')
    out.push(v >> 8, v & 0xff)
  }
  if (vals.length - i === 2) out.push(vals[i]! + vals[i + 1]! * 45)
  else if (vals.length - i !== 0) throw new Error('invalid code length')
  return new Uint8Array(out)
}

async function through(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  const reader = stream.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const size = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(size)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}

function blobStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new Blob([bytes as BlobPart]).stream() as unknown as ReadableStream<Uint8Array>
}

type ByteTransform = ReadableWritablePair<Uint8Array, Uint8Array>

export async function deflate(text: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(text)
  if (typeof CompressionStream === 'undefined') return bytes
  return through(blobStream(bytes).pipeThrough(new CompressionStream('deflate-raw') as unknown as ByteTransform))
}

export async function inflate(bytes: Uint8Array): Promise<string> {
  if (typeof DecompressionStream === 'undefined') return new TextDecoder().decode(bytes)
  const out = await through(
    blobStream(bytes).pipeThrough(new DecompressionStream('deflate-raw') as unknown as ByteTransform),
  )
  return new TextDecoder().decode(out)
}
