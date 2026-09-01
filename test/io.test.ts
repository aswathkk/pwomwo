import { describe, expect, test } from 'bun:test'
import {
  buildExport,
  ImportError,
  parseImport,
  rleDecode,
  rleEncode,
  toCsv,
  toMarinara,
} from '../src/history/io'
import type { SessionRecord } from '../src/types'

const SESSIONS: SessionRecord[] = [
  {
    id: 'a',
    startedAt: Date.parse('2026-09-01T04:35:00Z'),
    endedAt: Date.parse('2026-09-01T05:00:00Z'),
    durationSec: 1500,
    tzOffsetMin: -330,
    deviceId: 'dev_1',
    source: 'timer',
  },
  {
    id: 'b',
    startedAt: Date.parse('2026-09-01T05:35:00Z'),
    endedAt: Date.parse('2026-09-01T06:00:00Z'),
    durationSec: 1500,
    tzOffsetMin: -330,
    deviceId: 'dev_1',
    source: 'timer',
  },
]

describe('Marinara run-length encoding', () => {
  test('round-trips', () => {
    const values = [1500, 1500, 1500, 900, 900, 1500]
    expect(rleDecode(rleEncode(values))).toEqual(values)
  })

  test('decodes the documented flat pair form', () => {
    expect(rleDecode([3, 1500])).toEqual([1500, 1500, 1500])
  })

  test('rejects a nonsense run length rather than allocating forever', () => {
    expect(() => rleDecode([1e9, 1])).toThrow()
  })
})

describe('CSV export', () => {
  test('writes Marinara’s six columns in order', () => {
    const [head] = toCsv(SESSIONS).split('\n')
    expect(head).toBe(
      'End (ISO 8601),End Date,End Time,End Timestamp,End Timezone,Duration (Seconds)',
    )
  })

  test('renders the ISO string in the record’s own offset and timezone east of UTC', () => {
    const row = toCsv([SESSIONS[0]!]).split('\n')[1]!.split(',')
    expect(row[0]).toBe('2026-09-01T10:30:00.000+05:30')
    expect(row[1]).toBe('2026-09-01')
    expect(row[2]).toBe('10:30:00')
    expect(row[4]).toBe('330')
    expect(row[5]).toBe('1500')
  })

  test('rows are sorted by end time', () => {
    const rows = toCsv([SESSIONS[1]!, SESSIONS[0]!]).trim().split('\n').slice(1)
    expect(rows[0]).toContain('10:30:00')
  })
})

describe('native export', () => {
  test('embeds the same data in Marinara’s own format', () => {
    const exported = buildExport(SESSIONS, { id: 'dev_1', name: 'Laptop' })
    expect(exported.app).toBe('pwomwo')
    expect(exported.marinara).toEqual(toMarinara(SESSIONS))
    expect(exported.marinara.pomodoros).toEqual([
      Math.floor(SESSIONS[0]!.endedAt / 60_000),
      Math.floor(SESSIONS[1]!.endedAt / 60_000),
    ])
    expect(exported.marinara.durations).toEqual([2, 1500])
  })
})

describe('import', () => {
  test('reads a Marinara history.json and derives stable ids', async () => {
    const file = JSON.stringify({
      version: 1,
      pomodoros: [29803975, 29804007],
      durations: [2, 1500],
      timezones: [2, -330],
    })
    const first = await parseImport(file, 'history.json')
    const second = await parseImport(file, 'history.json')
    expect(first).toHaveLength(2)
    expect(first.map((r) => r.id)).toEqual(second.map((r) => r.id))
    expect(first[0]!.durationSec).toBe(1500)
    expect(first[0]!.endedAt).toBe(29803975 * 60_000)
    expect(first[0]!.source).toBe('import')
  })

  test('tolerates an empty Marinara history', async () => {
    expect(await parseImport('{"version":1,"pomodoros":[]}', 'history.json')).toEqual([])
  })

  test('rejects a file whose run lengths do not line up', async () => {
    await expect(
      parseImport('{"version":1,"pomodoros":[1,2,3],"durations":[1,1500],"timezones":[3,0]}'),
    ).rejects.toThrow(ImportError)
  })

  test('reads a Marinara CSV, negating the east-of-UTC timezone column', async () => {
    const csv = [
      'End (ISO 8601),End Date,End Time,End Timestamp,End Timezone,Duration (Seconds)',
      '2026-09-01T10:25:00.000+05:30,2026-09-01,10:25:00,1788238500,330,1500',
    ].join('\n')
    const [row] = await parseImport(csv, 'history.csv')
    expect(row!.tzOffsetMin).toBe(-330)
    expect(row!.durationSec).toBe(1500)
    expect(row!.endedAt).toBe(1788238500 * 1000)
  })

  test('round-trips our own export', async () => {
    const exported = JSON.stringify(buildExport(SESSIONS, { id: 'dev_1', name: 'Laptop' }))
    const parsed = await parseImport(exported, 'pwomwo_history.json')
    expect(parsed.map((r) => r.id)).toEqual(['a', 'b'])
    // Left out of the file, rebuilt on the way back in.
    expect(exported).not.toContain('startedAt')
    expect(parsed.map((r) => r.startedAt)).toEqual(SESSIONS.map((s) => s.startedAt))
  })

  test('keeps a startedAt that the duration does not imply', async () => {
    const paused: SessionRecord = { ...SESSIONS[0]!, startedAt: SESSIONS[0]!.startedAt - 600_000 }
    const exported = JSON.stringify(buildExport([paused], { id: 'dev_1', name: 'Laptop' }))
    expect(exported).toContain('startedAt')
    const parsed = await parseImport(exported, 'pwomwo_history.json')
    expect(parsed[0]!.startedAt).toBe(paused.startedAt)
  })

  test('still reads a format 1 file, which spelled every field out', async () => {
    const v1 = JSON.stringify({
      app: 'pwomwo',
      format: 1,
      exportedAt: '2026-09-01T10:00:00+05:30',
      device: { id: 'dev_1', name: 'Laptop' },
      sessions: SESSIONS,
      marinara: toMarinara(SESSIONS),
    })
    const parsed = await parseImport(v1, 'pwomwo_history.json')
    expect(parsed.map((r) => r.startedAt)).toEqual(SESSIONS.map((s) => s.startedAt))
  })

  test('refuses unreadable input with a readable error', async () => {
    await expect(parseImport('   ')).rejects.toThrow(ImportError)
    await expect(parseImport('{oops')).rejects.toThrow(ImportError)
    await expect(parseImport('{"hello":1}')).rejects.toThrow(ImportError)
  })
})
