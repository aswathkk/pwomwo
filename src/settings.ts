import type { Settings, WeekStart } from './types'
import { isTheme } from './backgrounds'
import { isClockStyle } from './clocks'
import { get, put } from './db'
import { DEFAULT_BPM, isTimerSound, MAX_BPM, MIN_BPM, TIMER_SOUND_NONE } from './pwa/timer-sound'
import { clamp } from './util'

/** The defaults are also read in tests and workers, where there is no DOM. */
function userAgent(): string {
  return typeof navigator === 'undefined' ? '' : navigator.userAgent
}

function prefersReducedData(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-data: reduce)').matches
}

function guessDeviceName(): string {
  const ua = userAgent()
  if (/iPad|Tablet/i.test(ua)) return 'Tablet'
  if (/Mobi|Android|iPhone/i.test(ua)) return 'Phone'
  if (/Mac/i.test(ua)) return 'Mac'
  if (/Windows/i.test(ua)) return 'PC'
  return 'Laptop'
}

function localeWeekStart(): WeekStart {
  // `Intl.Locale#getWeekInfo` is not everywhere yet; en-US/en-IN style locales
  // that start on Sunday are the common case Marinara assumed.
  try {
    const language = typeof navigator === 'undefined' ? 'en-US' : navigator.language
    const loc = new Intl.Locale(language) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number }
      weekInfo?: { firstDay: number }
    }
    const info = loc.getWeekInfo?.() ?? loc.weekInfo
    if (info) return info.firstDay === 7 ? 0 : ((info.firstDay === 1 ? 1 : 0) as WeekStart)
  } catch {
    /* fall through */
  }
  return 0
}

export function defaultSettings(): Settings {
  const mobile = /Mobi|Android|iPhone|iPad/i.test(userAgent())
  return {
    notificationsEnabled: false,
    keepScreenAwake: mobile,
    weekStart: localeWeekStart(),
    theme: prefersReducedData() ? 'minimal' : 'scene',
    clockStyle: 'plain',
    focusMin: 25,
    shortBreakMin: 5,
    longBreakMin: 15,
    sequenceEnabled: true,
    longBreakEvery: 4,
    autoStartBreaks: false,
    autoStartFocus: false,
    soundEnabled: true,
    soundName: 'bell',
    volume: 0.8,
    timerSound: TIMER_SOUND_NONE,
    timerSoundBpm: DEFAULT_BPM,
    timerSoundVolume: 0.5,
    deviceName: guessDeviceName(),
    stunEnabled: true,
    idleHideControls: true,
  }
}

/** Coerce anything read back from disk (or typed into a field) into range. */
export function validate(s: Partial<Settings>): Settings {
  const d = defaultSettings()
  const merged = { ...d, ...s }
  return {
    ...merged,
    focusMin: clamp(Math.round(merged.focusMin) || d.focusMin, 1, 180),
    shortBreakMin: clamp(Math.round(merged.shortBreakMin) || d.shortBreakMin, 1, 180),
    longBreakMin: clamp(Math.round(merged.longBreakMin) || d.longBreakMin, 1, 180),
    longBreakEvery: clamp(Math.round(merged.longBreakEvery) || d.longBreakEvery, 2, 8),
    volume: clamp(merged.volume, 0, 1),
    timerSound: isTimerSound(merged.timerSound) ? merged.timerSound : TIMER_SOUND_NONE,
    timerSoundBpm: clamp(Math.round(merged.timerSoundBpm) || d.timerSoundBpm, MIN_BPM, MAX_BPM),
    timerSoundVolume: clamp(merged.timerSoundVolume, 0, 1),
    weekStart: (merged.weekStart === 1 ? 1 : 0) as WeekStart,
    theme: isTheme(merged.theme) ? merged.theme : 'scene',
    clockStyle: isClockStyle(merged.clockStyle) ? merged.clockStyle : 'plain',
    deviceName: String(merged.deviceName || d.deviceName).slice(0, 32),
  }
}

export async function loadSettings(): Promise<Settings> {
  const stored = await get<Partial<Settings>>('settings', 'app')
  return validate(stored ?? {})
}

export async function saveSettings(s: Settings): Promise<void> {
  await put('settings', validate(s), 'app')
}

export function durationMinutes(s: Settings, phase: 'focus' | 'shortBreak' | 'longBreak'): number {
  return phase === 'focus' ? s.focusMin : phase === 'shortBreak' ? s.shortBreakMin : s.longBreakMin
}
