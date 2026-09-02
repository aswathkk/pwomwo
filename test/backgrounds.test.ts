import { describe, expect, test } from 'bun:test'
import { BACKGROUNDS, backgroundDef, isTheme } from '../src/backgrounds'
import { defaultSettings, validate } from '../src/settings'

describe('background catalogue', () => {
  test('ids are unique and resolvable', () => {
    const ids = BACKGROUNDS.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const b of BACKGROUNDS) {
      expect(isTheme(b.id)).toBe(true)
      expect(backgroundDef(b.id)).toBe(b)
    }
  })

  test('every entry is presentable', () => {
    for (const b of BACKGROUNDS) {
      expect(b.label.length).toBeGreaterThan(0)
      expect(b.hint.length).toBeGreaterThan(0)
      expect(b.swatch.length).toBeGreaterThan(0)
    }
  })

  test('the two backgrounds that shipped first are still there', () => {
    // Their ids are persisted values: dropping one resets those devices.
    expect(isTheme('scene')).toBe(true)
    expect(isTheme('minimal')).toBe(true)
  })

  test('rejects anything not in the catalogue', () => {
    expect(isTheme('neon')).toBe(false)
    expect(isTheme('')).toBe(false)
    expect(isTheme(undefined)).toBe(false)
    expect(isTheme(7)).toBe(false)
  })
})

describe('theme setting', () => {
  test('keeps a known background', () => {
    for (const b of BACKGROUNDS) expect(validate({ theme: b.id }).theme).toBe(b.id)
  })

  test('falls back to the scene for anything else', () => {
    expect(validate({ theme: 'neon' as never }).theme).toBe('scene')
    expect(validate({ theme: undefined as never }).theme).toBe('scene')
  })

  test('the default is a background that exists', () => {
    expect(isTheme(defaultSettings().theme)).toBe(true)
  })
})
