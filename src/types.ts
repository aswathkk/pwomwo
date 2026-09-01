/** Phases of the pomodoro cycle. */
export type Phase = 'focus' | 'shortBreak' | 'longBreak'

/** Timer lifecycle. `completed` is transient: the UI arms the next phase from it. */
export type TimerStatus = 'idle' | 'running' | 'paused' | 'completed'

/**
 * The whole timer, as a single versioned document (PRD §4.5.3). It is replaced
 * atomically, replicated verbatim to peers, and persisted so a reload resumes.
 */
export interface TimerDoc {
  type: 'timer.state'
  /** Lamport clock, bumped on every local change. */
  version: number
  /** Sender's wall clock at the time of the change (ms). */
  updatedAt: number
  /** deviceId of whoever made the change. */
  updatedBy: string
  /** Stable for the life of one focus/break run; seeds the history record id. */
  sessionId: string
  phase: Phase
  status: TimerStatus
  durationMs: number
  /** ms epoch, in *local* time once offset-corrected; null unless running. */
  endsAt: number | null
  /** ms left; set when paused or idle. */
  remainingMs: number | null
  /** Focus sessions completed in the current cycle. */
  cycleIndex: number
  cycleLength: number
}

/** One completed focus session. Immutable once written (PRD HIS-1). */
export interface SessionRecord {
  id: string
  startedAt: number
  endedAt: number
  durationSec: number
  /** `Date.prototype.getTimezoneOffset()` at completion, in minutes *west* of UTC. */
  tzOffsetMin: number
  deviceId: string
  source: 'timer' | 'import'
}

export interface Tombstone {
  id: string
  deletedAt: number
}

export type ThemeName = 'scene' | 'minimal'
export type WeekStart = 0 | 1

export interface Settings {
  notificationsEnabled: boolean
  keepScreenAwake: boolean
  weekStart: WeekStart
  theme: ThemeName
  focusMin: number
  shortBreakMin: number
  longBreakMin: number
  sequenceEnabled: boolean
  longBreakEvery: number
  autoStartBreaks: boolean
  autoStartFocus: boolean
  soundEnabled: boolean
  soundName: string
  volume: number
  /** `'none'`, or an id from `TIMER_SOUNDS`: what plays while focus runs. */
  timerSound: string
  /** Tempo of a periodic beat, in beats per minute. Ignored by ambient beds. */
  timerSoundBpm: number
  timerSoundVolume: number
  deviceName: string
  stunEnabled: boolean
  /** Zen view: while a timer runs, everything but the clock fades out and the
      clock grows to fill the screen until the next pointer or key press. */
  idleHideControls: boolean
}

export interface Identity {
  id: 'self'
  deviceId: string
  name: string
  keyPair: CryptoKeyPair
  publicKeyRaw: ArrayBuffer
  fingerprint: string
  createdAt: number
}

export interface PeerRecord {
  deviceId: string
  name: string
  fingerprint: string
  lastConnected: number
}

export type ConnectionState = 'offline' | 'connecting' | 'connected'

export interface PeerStatus {
  deviceId: string
  name: string
  state: ConnectionState
  lastSyncAt: number | null
}
