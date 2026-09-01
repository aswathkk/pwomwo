import { describe, expect, test } from 'bun:test'
import {
  advanceAfterCompletion,
  initialDoc,
  isComplete,
  nextPhase,
  pause,
  remaining,
  reset,
  shouldApply,
  skip,
  start,
  switchPhase,
  type TimerContext,
} from '../src/timer/state'
import { defaultSettings, validate } from '../src/settings'
import type { Settings, TimerDoc } from '../src/types'

const settings: Settings = validate({
  ...defaultSettings(),
  focusMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  sequenceEnabled: true,
  longBreakEvery: 4,
})

const T0 = 1_788_240_000_000
const ctx = (now = T0, over: Partial<Settings> = {}): TimerContext => ({
  deviceId: 'dev_a',
  settings: { ...settings, ...over },
  now,
})

describe('timer transitions', () => {
  test('starts armed at the full focus duration', () => {
    const doc = initialDoc(ctx())
    expect(doc.phase).toBe('focus')
    expect(doc.status).toBe('idle')
    expect(doc.durationMs).toBe(25 * 60_000)
    expect(remaining(doc, T0)).toBe(25 * 60_000)
  })

  test('start sets an endsAt against the wall clock, not a counter', () => {
    const running = start(initialDoc(ctx()), ctx())
    expect(running.status).toBe('running')
    expect(running.endsAt).toBe(T0 + 25 * 60_000)
    // Three minutes of a throttled tab later, the remaining time is still right.
    expect(remaining(running, T0 + 180_000)).toBe(25 * 60_000 - 180_000)
  })

  test('pause freezes what is left and resume keeps the same session id', () => {
    const running = start(initialDoc(ctx()), ctx())
    const paused = pause(running, ctx(T0 + 60_000))
    expect(paused.status).toBe('paused')
    expect(paused.remainingMs).toBe(24 * 60_000)
    expect(paused.endsAt).toBeNull()

    const resumed = start(paused, ctx(T0 + 120_000))
    expect(resumed.sessionId).toBe(running.sessionId)
    expect(resumed.endsAt).toBe(T0 + 120_000 + 24 * 60_000)
  })

  test('a fresh start gets a fresh session id', () => {
    const first = start(initialDoc(ctx()), ctx())
    const second = start(reset(first, ctx()), ctx())
    expect(second.sessionId).not.toBe(first.sessionId)
  })

  test('reset returns to the full duration for the current phase', () => {
    const running = start(switchPhase(initialDoc(ctx()), 'shortBreak', ctx()), ctx())
    const back = reset(running, ctx(T0 + 10_000))
    expect(back.status).toBe('idle')
    expect(back.durationMs).toBe(5 * 60_000)
  })

  test('completion is detected the moment the wall clock passes endsAt', () => {
    const running = start(initialDoc(ctx()), ctx())
    expect(isComplete(running, T0 + 25 * 60_000 - 1)).toBe(false)
    expect(isComplete(running, T0 + 25 * 60_000)).toBe(true)
  })
})

describe('sequence mode', () => {
  test('focus is followed by a short break until the long break is due', () => {
    let doc = initialDoc(ctx())
    expect(nextPhase({ ...doc, cycleIndex: 0 }, settings)).toEqual({
      phase: 'shortBreak',
      cycleIndex: 1,
    })
    doc = { ...doc, cycleIndex: 3 }
    expect(nextPhase(doc, settings)).toEqual({ phase: 'longBreak', cycleIndex: 4 })
  })

  test('the fourth completion arms the long break and the cycle resets after it', () => {
    let doc: TimerDoc = { ...initialDoc(ctx()), cycleIndex: 3 }
    doc = advanceAfterCompletion(start(doc, ctx()), ctx())
    expect(doc.phase).toBe('longBreak')
    expect(doc.cycleIndex).toBe(4)

    doc = advanceAfterCompletion(start(doc, ctx()), ctx())
    expect(doc.phase).toBe('focus')
    expect(doc.cycleIndex).toBe(0)
  })

  test('a short break returns to focus without advancing the cycle', () => {
    const doc: TimerDoc = { ...initialDoc(ctx()), phase: 'shortBreak', cycleIndex: 2 }
    expect(nextPhase(doc, settings)).toEqual({ phase: 'focus', cycleIndex: 2 })
  })

  test('with the sequence off, a phase does not advance on its own', () => {
    const off = { ...settings, sequenceEnabled: false }
    const doc = initialDoc(ctx(T0, off))
    expect(nextPhase(doc, off)).toEqual({ phase: 'focus', cycleIndex: 0 })
  })

  test('skip arms the next phase without recording anything', () => {
    const doc = skip(start(initialDoc(ctx()), ctx()), ctx())
    expect(doc.phase).toBe('shortBreak')
    expect(doc.status).toBe('idle')
  })
})

describe('convergence', () => {
  const base = initialDoc(ctx())
  const at = (over: Partial<TimerDoc>): TimerDoc => ({ ...base, ...over })

  test('a higher version always wins', () => {
    expect(shouldApply(at({ version: 4 }), at({ version: 5 }))).toBe(true)
    expect(shouldApply(at({ version: 5 }), at({ version: 4 }))).toBe(false)
  })

  test('an equal version breaks on the later wall clock', () => {
    expect(shouldApply(at({ version: 5, updatedAt: 10 }), at({ version: 5, updatedAt: 11 }))).toBe(true)
    expect(shouldApply(at({ version: 5, updatedAt: 11 }), at({ version: 5, updatedAt: 10 }))).toBe(false)
  })

  test('a full tie breaks on deviceId, so every device agrees', () => {
    const local = at({ version: 5, updatedAt: 10, updatedBy: 'dev_a' })
    const remote = at({ version: 5, updatedAt: 10, updatedBy: 'dev_b' })
    expect(shouldApply(local, remote)).toBe(true)
    expect(shouldApply(remote, local)).toBe(false)
  })
})

describe('settings validation', () => {
  test('clamps durations into the supported range', () => {
    const s = validate({ focusMin: 0, shortBreakMin: 999, longBreakEvery: 42, volume: 5 })
    expect(s.focusMin).toBe(25)
    expect(s.shortBreakMin).toBe(180)
    expect(s.longBreakEvery).toBe(8)
    expect(s.volume).toBe(1)
  })
})
