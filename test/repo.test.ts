import { beforeEach, describe, expect, test } from 'bun:test'
import { HistoryRepo } from '../src/history/repo'
import { clear } from '../src/db'
import type { SessionRecord } from '../src/types'

function record(id: string, iso: string, tzOffsetMin = 0): SessionRecord {
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

let repo: HistoryRepo

beforeEach(async () => {
  await clear('sessions')
  await clear('tombstones')
  repo = new HistoryRepo()
  await repo.load()
})

describe('history as a grow-only set', () => {
  test('merging is a union, so the same record twice adds nothing', async () => {
    const one = record('a', '2026-09-01T09:00:00Z')
    expect(await repo.merge([one])).toEqual({ added: 1, skipped: 0 })
    expect(await repo.merge([one])).toEqual({ added: 0, skipped: 1 })
    expect(repo.size).toBe(1)
  })

  test('records come back in end-time order however they arrived', async () => {
    await repo.merge([
      record('c', '2026-09-01T11:00:00Z'),
      record('a', '2026-09-01T09:00:00Z'),
      record('b', '2026-09-01T10:00:00Z'),
    ])
    expect(repo.all().map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  test('two devices that met once converge on the union of both sets', async () => {
    // Device A recorded two sessions offline, device B recorded one.
    const laptop = [record('a1', '2026-09-01T09:00:00Z'), record('a2', '2026-09-01T10:00:00Z')]
    const phone = [record('b1', '2026-09-01T11:00:00Z')]
    await repo.merge(laptop)

    // Reconnecting, B hands over what A never saw.
    await repo.merge(phone)
    expect(repo.size).toBe(3)
    expect(repo.all().map((r) => r.id)).toEqual(['a1', 'a2', 'b1'])
  })
})

describe('day digests', () => {
  test('groups by the local day where the record was made', async () => {
    // 23:30 UTC in a +05:30 zone is 05:00 the next morning, locally.
    await repo.merge([record('a', '2026-08-31T23:30:00Z', -330)])
    expect(Object.keys(repo.digest())).toEqual(['2026-09-01'])
  })

  test('two devices holding the same day agree on its hash', async () => {
    const day = [record('a', '2026-09-01T09:00:00Z'), record('b', '2026-09-01T10:00:00Z')]
    await repo.merge(day)
    const mine = repo.digest()

    await clear('sessions')
    const other = new HistoryRepo()
    await other.load()
    // Same records, opposite arrival order. The digest must not care.
    await other.merge([day[1]!, day[0]!])

    expect(other.digest()).toEqual(mine)
    expect(mine['2026-09-01']!.count).toBe(2)
  })

  test('a day that differs by one record produces a different hash', async () => {
    await repo.merge([record('a', '2026-09-01T09:00:00Z')])
    const before = repo.digest()['2026-09-01']!.hash
    await repo.merge([record('b', '2026-09-01T10:00:00Z')])
    expect(repo.digest()['2026-09-01']!.hash).not.toBe(before)
  })

  test('only the requested days are handed over', async () => {
    await repo.merge([
      record('a', '2026-09-01T09:00:00Z'),
      record('b', '2026-09-02T09:00:00Z'),
    ])
    expect(repo.recordsForDays(['2026-09-02']).map((r) => r.id)).toEqual(['b'])
  })
})

describe('clearing', () => {
  test('leaves tombstones so a peer cannot resurrect what was deleted', async () => {
    const one = record('a', '2026-09-01T09:00:00Z')
    await repo.merge([one])
    expect(await repo.clearAll()).toBe(1)
    expect(repo.size).toBe(0)

    // A peer that missed the clear re-offers the record; it must not come back.
    expect(await repo.merge([one])).toEqual({ added: 0, skipped: 1 })
    expect(repo.size).toBe(0)
  })
})
