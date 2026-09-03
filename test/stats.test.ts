import { describe, expect, test } from 'bun:test'
import { computeStats } from '../src/history/stats'
import { dayKey } from '../src/util'
import type { SessionRecord } from '../src/types'

/** Builds a record that ended at a given local wall-clock time in +00:00. */
function record(iso: string, id = iso, tzOffsetMin = 0): SessionRecord {
  const endedAt = Date.parse(iso)
  return {
    id,
    endedAt,
    startedAt: endedAt - 1_500_000,
    durationSec: 1500,
    tzOffsetMin,
    deviceId: 'dev_test',
    source: 'timer',
  }
}

const NOW = new Date('2026-09-01T12:00:00.000Z')

describe('computeStats', () => {
  test('an empty history yields four zero counters and no first record', () => {
    const stats = computeStats([], { now: NOW, weekStart: 0, bucket: 30 })
    expect(stats.total).toBe(0)
    expect(stats.blocks.map((b) => b.n)).toEqual([0, 0, 0, 0])
    expect(stats.firstRecordAt).toBeNull()
  })

  test('the four blocks are Today, This Week, the month name, and Total', () => {
    const stats = computeStats([record('2026-09-01T09:30:00Z')], {
      now: NOW,
      weekStart: 0,
      bucket: 30,
    })
    expect(stats.blocks.map((b) => b.label)).toEqual(['Today', 'This Week', 'September', 'Total'])
    expect(stats.blocks[3]!.n).toBe(1)
  })

  test('the week counter follows the configured week start', () => {
    // 30 Aug 2026 is a Sunday; 31 Aug is the Monday after it.
    const records = [record('2026-08-30T10:00:00Z'), record('2026-08-31T10:00:00Z')]
    const sunday = computeStats(records, { now: NOW, weekStart: 0, bucket: 30 })
    const monday = computeStats(records, { now: NOW, weekStart: 1, bucket: 30 })
    expect(sunday.blocks[1]!.n).toBe(2)
    expect(monday.blocks[1]!.n).toBe(1)
  })

  test('the daily distribution has one bucket per slice of the day', () => {
    for (const bucket of [15, 30, 60, 120] as const) {
      const stats = computeStats([], { now: NOW, weekStart: 0, bucket })
      expect(stats.daily.length).toBe(1440 / bucket)
    }
  })

  test('a record is bucketed by the local time where it was recorded', () => {
    // 06:00 UTC in a +05:30 zone (offset -330) is 11:30 local -> bucket 23.
    const shifted: SessionRecord = { ...record('2026-09-01T06:00:00Z'), tzOffsetMin: -330 }
    const stats = computeStats([shifted], { now: NOW, weekStart: 0, bucket: 30 })
    expect(stats.daily[23]!.count).toBe(1)
    expect(stats.daily.reduce((n, b) => n + b.count, 0)).toBe(1)
  })

  test('the weekly distribution is ordered from the configured week start', () => {
    const stats = computeStats([], { now: NOW, weekStart: 1, bucket: 30 })
    expect(stats.weekly.map((b) => b.label)).toEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ])
  })

  test('the heatmap is a whole number of week columns covering ~9 months', () => {
    const stats = computeStats([record('2026-08-30T10:00:00Z')], {
      now: NOW,
      weekStart: 0,
      bucket: 30,
    })
    expect(stats.heatCells.length % 7).toBe(0)
    expect(stats.heatCells.length / 7).toBeGreaterThanOrEqual(39)
    expect(stats.heatTotal).toBe(1)
    expect(stats.heatTitle).toContain('in the last 9 months')
  })

  test('a heatmap cell holds the recording device’s own day, not this device’s', () => {
    // Four sessions on the evening of Sun 30 Aug 2026 in IST (UTC+5:30). Read
    // with the viewing device's offset instead of the record's, they slid onto
    // the 31st.
    const ist = [0, 1, 2, 3].map((i) =>
      record(`2026-08-30T${14 + i}:30:00Z`, `ist-${i}`, -330),
    )
    const tz = process.env.TZ
    try {
      for (const zone of ['Asia/Kolkata', 'UTC', 'America/Los_Angeles']) {
        process.env.TZ = zone
        const stats = computeStats(ist, { now: NOW, weekStart: 0, bucket: 30 })
        const on = (key: string) =>
          stats.heatCells.find((c) => c.date && dayKey(c.date) === key)?.count ?? 0
        expect(on('2026-08-30')).toBe(4)
        expect(on('2026-08-31')).toBe(0)
      }
    } finally {
      process.env.TZ = tz
    }
  })

  test('averages divide the total by elapsed days, never by zero', () => {
    const stats = computeStats([record('2026-09-01T09:00:00Z')], {
      now: NOW,
      weekStart: 0,
      bucket: 30,
    })
    expect(stats.blocks[0]!.avg).toBe('1.00 avg / day')
  })
})
