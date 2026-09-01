import type { SessionRecord } from '../types'
import { NAMESPACE_MARINARA, isoInOffset, uuidv5 } from '../util'

/** ── Marinara run-length encoding (Appendix A) ─────────────────────────── */

export function rleDecode(flat: number[]): number[] {
  const out: number[] = []
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const count = flat[i]!
    const value = flat[i + 1]!
    if (!Number.isFinite(count) || count < 0 || count > 1e7) throw new Error('bad run length')
    for (let k = 0; k < count; k++) out.push(value)
  }
  return out
}

export function rleEncode(values: number[]): number[] {
  const out: number[] = []
  let i = 0
  while (i < values.length) {
    let j = i
    while (j < values.length && values[j] === values[i]) j++
    out.push(j - i, values[i]!)
    i = j
  }
  return out
}

export interface MarinaraHistory {
  version: number
  pomodoros: number[]
  durations: number[]
  timezones: number[]
}

/** ── Native export format (PRD §5.2) ───────────────────────────────────── */

/**
 * A session as written to the file. `startedAt` and `source` are left out
 * whenever they are exactly reconstructible, which is almost always: a run is
 * recorded as `endedAt - durationSec * 1000`, and anything the timer recorded
 * is `'timer'`. Writing them out again costs roughly a fifth of the file.
 */
export type ExportedSession = Omit<SessionRecord, 'startedAt' | 'source'> &
  Partial<Pick<SessionRecord, 'startedAt' | 'source'>>

export interface NativeExport {
  app: 'pwomwo'
  format: 2
  exportedAt: string
  device: { id: string; name: string }
  sessions: ExportedSession[]
  marinara: MarinaraHistory
}

/** The `startedAt` a record without one must have had. */
function impliedStart(s: { endedAt: number; durationSec: number }): number {
  return s.endedAt - s.durationSec * 1000
}

function forExport(s: SessionRecord): ExportedSession {
  const out: ExportedSession = {
    id: s.id,
    endedAt: s.endedAt,
    durationSec: s.durationSec,
    tzOffsetMin: s.tzOffsetMin,
    deviceId: s.deviceId,
  }
  if (s.startedAt !== impliedStart(s)) out.startedAt = s.startedAt
  if (s.source !== 'timer') out.source = s.source
  return out
}

export function toMarinara(sessions: SessionRecord[]): MarinaraHistory {
  const sorted = [...sessions].sort((a, b) => a.endedAt - b.endedAt)
  return {
    version: 1,
    pomodoros: sorted.map((s) => Math.floor(s.endedAt / 60_000)),
    durations: rleEncode(sorted.map((s) => s.durationSec)),
    timezones: rleEncode(sorted.map((s) => s.tzOffsetMin)),
  }
}

export function buildExport(
  sessions: SessionRecord[],
  device: { id: string; name: string },
  now = new Date(),
): NativeExport {
  const sorted = [...sessions].sort((a, b) => a.endedAt - b.endedAt)
  return {
    app: 'pwomwo',
    format: 2,
    exportedAt: isoInOffset(now.getTime(), now.getTimezoneOffset()),
    device,
    sessions: sorted.map(forExport),
    marinara: toMarinara(sorted),
  }
}

/** Marinara's exact six columns, so existing spreadsheets keep working. */
export function toCsv(sessions: SessionRecord[]): string {
  const head =
    'End (ISO 8601),End Date,End Time,End Timestamp,End Timezone,Duration (Seconds)'
  const rows = [...sessions]
    .sort((a, b) => a.endedAt - b.endedAt)
    .map((s) => {
      const iso = isoInOffset(s.endedAt, s.tzOffsetMin)
      const [date, rest] = iso.split('T')
      const time = rest!.slice(0, 8)
      return [
        iso,
        date,
        time,
        String(Math.floor(s.endedAt / 1000)),
        String(-s.tzOffsetMin),
        String(s.durationSec),
      ].join(',')
    })
  return [head, ...rows].join('\n') + '\n'
}

/** ── Import ────────────────────────────────────────────────────────────── */

export class ImportError extends Error {}

async function fromMarinaraRows(
  rows: { endMinutes: number; durationSec: number; tzOffsetMin: number }[],
): Promise<SessionRecord[]> {
  return Promise.all(
    rows.map(async (r) => {
      const endedAt = r.endMinutes * 60_000
      const id = await uuidv5(NAMESPACE_MARINARA, `${r.endMinutes}:${r.durationSec}`)
      return {
        id,
        endedAt,
        startedAt: endedAt - r.durationSec * 1000,
        durationSec: r.durationSec,
        tzOffsetMin: r.tzOffsetMin,
        deviceId: 'import',
        source: 'import' as const,
      }
    }),
  )
}

function parseMarinaraJson(data: MarinaraHistory): Promise<SessionRecord[]> {
  const pomodoros = data.pomodoros ?? []
  if (!Array.isArray(pomodoros)) throw new ImportError('pomodoros must be an array')
  if (pomodoros.length === 0) return Promise.resolve([])
  const durations = rleDecode(data.durations ?? [])
  const timezones = rleDecode(data.timezones ?? [])
  if (durations.length !== pomodoros.length || timezones.length !== pomodoros.length) {
    throw new ImportError(
      'durations and timezones do not line up with pomodoros, so the file looks truncated',
    )
  }
  return fromMarinaraRows(
    pomodoros.map((endMinutes, i) => ({
      endMinutes,
      durationSec: durations[i]!,
      tzOffsetMin: timezones[i]!,
    })),
  )
}

function parseCsv(text: string): Promise<SessionRecord[]> {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return Promise.resolve([])
  const head = lines[0]!.toLowerCase()
  if (!head.includes('end timestamp') || !head.includes('duration')) {
    throw new ImportError('not a Marinara CSV. Expected an "End Timestamp" column.')
  }
  const cols = lines[0]!.split(',').map((c) => c.trim().toLowerCase())
  const iTs = cols.indexOf('end timestamp')
  const iTz = cols.indexOf('end timezone')
  const iDur = cols.findIndex((c) => c.startsWith('duration'))
  const rows = lines.slice(1).filter(Boolean).map((line) => {
    const parts = line.split(',')
    const ts = Number(parts[iTs])
    const durationSec = Number(parts[iDur])
    // The CSV stores minutes *east* of UTC; getTimezoneOffset() is the negation.
    const tzOffsetMin = -Number(parts[iTz] ?? 0)
    if (!Number.isFinite(ts) || !Number.isFinite(durationSec)) {
      throw new ImportError(`unreadable row: ${line.slice(0, 60)}`)
    }
    return { endMinutes: Math.floor(ts / 60), durationSec, tzOffsetMin }
  })
  return fromMarinaraRows(rows)
}

function isNative(v: unknown): v is NativeExport {
  return (
    typeof v === 'object' &&
    v !== null &&
    Array.isArray((v as NativeExport).sessions) &&
    (v as NativeExport).app === 'pwomwo'
  )
}

/**
 * Accepts the native JSON, a Marinara `history.json`, or a Marinara CSV, and
 * always produces records whose ids are stable across re-imports (PRD HIS-10).
 */
export async function parseImport(text: string, filename = ''): Promise<SessionRecord[]> {
  const trimmed = text.trim()
  if (!trimmed) throw new ImportError('the file is empty')

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let data: unknown
    try {
      data = JSON.parse(trimmed)
    } catch {
      throw new ImportError('that is not valid JSON')
    }
    if (isNative(data)) {
      // Format 1 wrote every field; format 2 leaves out the reconstructible ones.
      return data.sessions.map((s) => ({
        ...s,
        startedAt: s.startedAt ?? impliedStart(s),
        source: 'import' as const,
      }))
    }
    if (typeof data === 'object' && data !== null && 'pomodoros' in data) {
      return parseMarinaraJson(data as MarinaraHistory)
    }
    throw new ImportError('unrecognised JSON. Expected a pwomwo or Marinara export.')
  }

  if (filename.toLowerCase().endsWith('.csv') || trimmed.toLowerCase().startsWith('end (')) {
    return parseCsv(trimmed)
  }
  throw new ImportError('unrecognised file. Expected a JSON or CSV export.')
}

/** Trigger a download without leaving the page. */
export function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
