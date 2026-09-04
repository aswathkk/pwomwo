import { describe, expect, test } from 'bun:test'
import { CLOCK_STYLES, clockStyleDef, isClockStyle } from '../src/clocks'
import { defaultSettings, validate } from '../src/settings'

describe('clock face catalogue', () => {
  test('ids are unique and resolvable', () => {
    const ids = CLOCK_STYLES.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const c of CLOCK_STYLES) {
      expect(isClockStyle(c.id)).toBe(true)
      expect(clockStyleDef(c.id)).toBe(c)
    }
  })

  test('every entry is presentable', () => {
    for (const c of CLOCK_STYLES) {
      expect(c.label.length).toBeGreaterThan(0)
      expect(c.hint.length).toBeGreaterThan(0)
    }
  })

  test('the face that shipped first is still there, and still still', () => {
    // Its id is a persisted value, and it is the fallback for anything else.
    expect(isClockStyle('plain')).toBe(true)
    expect(clockStyleDef('plain')?.animated).toBe(false)
  })

  test('rejects anything not in the catalogue', () => {
    expect(isClockStyle('neon')).toBe(false)
    expect(isClockStyle('')).toBe(false)
    expect(isClockStyle(undefined)).toBe(false)
    expect(isClockStyle(7)).toBe(false)
  })
})

describe('clockStyle setting', () => {
  test('keeps a known face', () => {
    for (const c of CLOCK_STYLES) expect(validate({ clockStyle: c.id }).clockStyle).toBe(c.id)
  })

  test('falls back to plain for anything else', () => {
    expect(validate({ clockStyle: 'neon' as never }).clockStyle).toBe('plain')
    expect(validate({ clockStyle: undefined as never }).clockStyle).toBe('plain')
  })

  test('the default is a face that exists', () => {
    expect(isClockStyle(defaultSettings().clockStyle)).toBe(true)
  })
})
