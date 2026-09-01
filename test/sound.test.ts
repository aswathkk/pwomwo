import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_BPM,
  isTimerSound,
  MAX_BPM,
  MIN_BPM,
  TIMER_SOUND_NONE,
  TIMER_SOUNDS,
  timerSoundKind,
} from '../src/pwa/timer-sound'
import { defaultSettings, validate } from '../src/settings'

describe('timer sound catalogue', () => {
  test('offers both families and unique ids', () => {
    const ids = TIMER_SOUNDS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).not.toContain(TIMER_SOUND_NONE)
    expect(TIMER_SOUNDS.some((s) => s.kind === 'periodic')).toBe(true)
    expect(TIMER_SOUNDS.some((s) => s.kind === 'ambient')).toBe(true)
  })

  test('resolves kinds by id', () => {
    expect(timerSoundKind('stopwatch')).toBe('periodic')
    expect(timerSoundKind('rain')).toBe('ambient')
    expect(timerSoundKind(TIMER_SOUND_NONE)).toBeNull()
    expect(isTimerSound('nope')).toBe(false)
  })
})

describe('timer sound settings', () => {
  test('default to silence', () => {
    const d = defaultSettings()
    expect(d.timerSound).toBe(TIMER_SOUND_NONE)
    expect(d.timerSoundBpm).toBe(DEFAULT_BPM)
  })

  test('drop a sound id that no longer exists', () => {
    // A file exported by a future build, or a preset that has been retired.
    expect(validate({ timerSound: 'gramophone' }).timerSound).toBe(TIMER_SOUND_NONE)
    expect(validate({ timerSound: 'wood-block' }).timerSound).toBe('wood-block')
  })

  test('clamp tempo and volume into range', () => {
    expect(validate({ timerSoundBpm: 5 }).timerSoundBpm).toBe(MIN_BPM)
    expect(validate({ timerSoundBpm: 9000 }).timerSoundBpm).toBe(MAX_BPM)
    expect(validate({ timerSoundBpm: 0 }).timerSoundBpm).toBe(DEFAULT_BPM)
    expect(validate({ timerSoundVolume: 4 }).timerSoundVolume).toBe(1)
    expect(validate({ timerSoundVolume: -1 }).timerSoundVolume).toBe(0)
  })
})
