import type { Identity, Phase, PeerStatus, SessionRecord, Settings, TimerDoc } from './types'
import { get } from './db'
import { HistoryRepo } from './history/repo'
import { defaultSettings, durationMinutes, loadSettings, saveSettings } from './settings'
import { Scheduler } from './timer/scheduler'
import {
  advanceAfterCompletion,
  initialDoc,
  isComplete,
  pause,
  remaining,
  reset,
  shouldApply,
  skip,
  start,
  switchPhase,
  type TimerContext,
} from './timer/state'
import { SyncManager } from './sync/protocol'
import { loadIdentity, renameIdentity } from './sync/identity'
import { notifyPhaseEnd, permission } from './pwa/notifications'
import { WakeLock } from './pwa/wakelock'
import { setBadge } from './pwa/badge'
import { playSound, type SoundName } from './pwa/sound'
import { startTimerSound, stopTimerSound, TIMER_SOUND_NONE } from './pwa/timer-sound'
import { toast, type Tone } from './ui/toast-store'
import { confirmDialog } from './ui/dialog-store'
import { formatClock, uuidv5 } from './util'

export const PHASE_LABEL: Record<Phase, string> = {
  focus: 'Focus',
  shortBreak: 'Short break',
  longBreak: 'Long break',
}

const SESSION_NAMESPACE = '3f0a5c21-9d7e-4c1b-8f6a-2b4d9e0c7a15'

/**
 * A snapshot is what React renders from. It is replaced wholesale on every
 * change so `useSyncExternalStore` can compare by identity, and it carries
 * `tick` so the countdown re-renders even when nothing structural moved.
 */
export interface Snapshot {
  settings: Settings
  doc: TimerDoc
  peers: PeerStatus[]
  remainingMs: number
  historyVersion: number
  ready: boolean
  tick: number
}

/**
 * The one place that owns mutable state. Everything here is framework-agnostic:
 * views subscribe, call methods, and re-render. Sync failures are contained so
 * nothing the peer layer throws can reach the timer (PRD reliability).
 */
export class Store {
  readonly repo = new HistoryRepo()
  settings: Settings = defaultSettings()
  identity: Identity | null = null
  sync: SyncManager | null = null
  doc: TimerDoc

  private peers: PeerStatus[] = []
  private ready = false
  private historyVersion = 0
  private tickCount = 0
  /** The second the UI is currently showing, so idle ticks stay silent. */
  private renderedSecond = -1
  private snapshot: Snapshot
  private readonly listeners = new Set<() => void>()
  private readonly scheduler = new Scheduler(() => this.tick())
  private readonly wakeLock = new WakeLock()
  private completing = false

  constructor() {
    this.doc = initialDoc(this.ctx())
    this.snapshot = this.buildSnapshot()
  }

  /** ── Lifecycle ──────────────────────────────────────────────────────── */

  async init(): Promise<void> {
    try {
      await this.load()
    } catch (err) {
      // Storage can be unavailable (private windows, blocked site data). The
      // timer still works in memory, so reveal the UI rather than stranding
      // the user on an empty scene.
      console.error('[pwomwo] could not restore saved state', err)
      toast('Saved history and settings could not be loaded on this device', 'bad')
    } finally {
      this.ready = true
      this.applySideEffects()
      this.publish()
    }
  }

  private async load(): Promise<void> {
    this.settings = await loadSettings()
    this.identity = await loadIdentity(this.settings.deviceName)
    if (this.identity.name !== this.settings.deviceName) {
      this.identity = await renameIdentity(this.identity, this.settings.deviceName)
    }
    await this.repo.load()
    this.repo.onChange(() => {
      this.historyVersion++
      this.publish()
    })

    const stored = await get<TimerDoc>('timer', 'current')
    if (stored?.type === 'timer.state') this.doc = stored
    else this.doc = initialDoc(this.ctx())

    this.sync = new SyncManager({
      identity: () => this.identity!,
      repo: this.repo,
      stunEnabled: () => this.settings.stunEnabled,
      getTimerDoc: () => this.doc,
      applyTimerDoc: (doc) => this.applyRemote(doc),
      onPeersChanged: (peers) => {
        this.peers = peers
        this.publish()
      },
      toast: (message, tone) => toast(message, tone),
      confirmClear: async (peerName) =>
        (
          await confirmDialog({
            title: `${peerName} wants to clear history here too`,
            body: 'This permanently deletes every session stored on this device.',
            confirmLabel: 'Clear on this device',
            danger: true,
          })
        ).confirmed,
      clearHistoryLocally: async () => {
        await this.repo.clearAll()
        toast('History cleared', 'warn')
      },
    })
    // Before any link exists, so a device paired in an earlier session shows up
    // as offline rather than as nothing at all.
    await this.sync.loadRemembered()

    this.scheduler.start()
  }

  /** ── React glue ─────────────────────────────────────────────────────── */

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = (): Snapshot => this.snapshot

  private buildSnapshot(): Snapshot {
    return {
      settings: this.settings,
      doc: this.doc,
      peers: this.peers,
      remainingMs: remaining(this.doc, Date.now()),
      historyVersion: this.historyVersion,
      ready: this.ready,
      tick: this.tickCount,
    }
  }

  private publish(): void {
    this.snapshot = this.buildSnapshot()
    for (const fn of this.listeners) fn()
  }

  private ctx(): TimerContext {
    return {
      deviceId: this.identity?.deviceId ?? 'local',
      settings: this.settings,
      now: Date.now(),
    }
  }

  /** ── Derived ────────────────────────────────────────────────────────── */

  get remainingMs(): number {
    return remaining(this.doc, Date.now())
  }

  get elapsedFraction(): number {
    if (this.doc.durationMs <= 0) return 0
    return 1 - this.remainingMs / this.doc.durationMs
  }

  get phaseLabel(): string {
    return PHASE_LABEL[this.doc.phase]
  }

  get announcement(): string {
    const minutes = Math.ceil(this.remainingMs / 60_000)
    if (this.doc.status === 'idle') return `${this.phaseLabel} ready, ${minutes} minutes`
    if (this.doc.status === 'paused') return `Paused, ${minutes} minutes left`
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} left of ${this.phaseLabel.toLowerCase()}`
  }

  /** ── Commands ───────────────────────────────────────────────────────── */

  private commit(next: TimerDoc, broadcast = true): void {
    if (next === this.doc) return
    this.doc = next
    void HistoryRepo.saveTimer(next)
    if (broadcast) this.safely(() => this.sync?.broadcastTimer(next))
    this.renderedSecond = Math.ceil(this.remainingMs / 1000)
    this.applySideEffects()
    this.publish()
  }

  toggle = (): void => {
    this.commit(
      this.doc.status === 'running' ? pause(this.doc, this.ctx()) : start(this.doc, this.ctx()),
    )
  }

  resetTimer = async (): Promise<void> => {
    // A reset focus session is discarded, so it is the one reset worth querying.
    if (this.doc.status === 'running' && this.doc.phase === 'focus') {
      const { confirmed } = await confirmDialog({
        title: 'Discard the running focus session?',
        body: 'It will not be recorded in your history.',
        confirmLabel: 'Discard',
        danger: true,
      })
      if (!confirmed) return
    }
    this.commit(reset(this.doc, this.ctx()))
  }

  selectPhase = async (phase: Phase): Promise<void> => {
    if (phase === this.doc.phase && this.doc.status !== 'running') return
    if (this.doc.status === 'running') {
      const { confirmed } = await confirmDialog({
        title: `Discard the running ${PHASE_LABEL[this.doc.phase].toLowerCase()} session?`,
        body: 'The time already spent will not be recorded.',
        confirmLabel: 'Switch',
        danger: true,
      })
      if (!confirmed) return
    }
    this.commit(switchPhase(this.doc, phase, this.ctx()))
  }

  skipPhase = (): void => {
    this.commit(skip(this.doc, this.ctx()))
  }

  resetCycle = (): void => {
    this.commit({
      ...this.doc,
      cycleIndex: 0,
      version: this.doc.version + 1,
      updatedAt: Date.now(),
      updatedBy: this.ctx().deviceId,
    })
  }

  /** ── Settings ───────────────────────────────────────────────────────── */

  updateSettings = async (next: Settings): Promise<void> => {
    const previous = this.settings
    this.settings = next
    await saveSettings(next)
    if (this.identity && next.deviceName !== previous.deviceName) {
      this.identity = await renameIdentity(this.identity, next.deviceName)
      this.safely(() => this.sync?.broadcastProfile())
    }
    // A duration change re-arms an idle timer but never disturbs a running one.
    if (this.doc.status === 'idle') {
      const durationMs = durationMinutes(next, this.doc.phase) * 60_000
      if (durationMs !== this.doc.durationMs || next.longBreakEvery !== this.doc.cycleLength) {
        this.commit({
          ...this.doc,
          durationMs,
          remainingMs: durationMs,
          cycleLength: next.longBreakEvery,
          version: this.doc.version + 1,
          updatedAt: Date.now(),
          updatedBy: this.ctx().deviceId,
        })
        return
      }
    }
    this.applySideEffects()
    this.publish()
  }

  /** ── History actions ────────────────────────────────────────────────── */

  async importRecords(records: SessionRecord[]): Promise<{ added: number; skipped: number }> {
    const result = await this.repo.merge(records)
    if (result.added > 0) this.safely(() => this.sync?.broadcastImported(records))
    return result
  }

  async clearHistory(alsoOnPeers: boolean): Promise<number> {
    const removed = await this.repo.clearAll()
    if (alsoOnPeers) this.safely(() => this.sync?.requestClearOnPeers())
    return removed
  }

  /** ── Sync ───────────────────────────────────────────────────────────── */

  private applyRemote(incoming: TimerDoc): void {
    if (!shouldApply(this.doc, incoming)) {
      // Still take the clock forward so our next local change wins cleanly.
      this.doc = { ...this.doc, version: Math.max(this.doc.version, incoming.version) }
      return
    }
    this.commit({ ...incoming, version: Math.max(this.doc.version, incoming.version) }, false)
  }

  private safely(fn: () => void): void {
    try {
      fn()
    } catch (err) {
      console.warn('[sync] contained failure', err)
    }
  }

  /** ── Ticking and completion ─────────────────────────────────────────── */

  private tick(): void {
    if (isComplete(this.doc, Date.now()) && !this.completing) void this.complete()

    // The scheduler fires several times a second so completion lands promptly,
    // but the display only ever changes once a second. Re-rendering on every
    // fire is wasted work and, worse, steals focus from anything the user is
    // interacting with inside an overlay.
    const second = Math.ceil(this.remainingMs / 1000)
    if (second === this.renderedSecond) return
    this.renderedSecond = second

    this.updateTitle()
    this.tickCount++
    this.publish()
  }

  private async complete(): Promise<void> {
    this.completing = true
    const finished = this.doc
    try {
      if (finished.phase === 'focus') await this.record(finished)
      if (this.settings.soundEnabled) {
        playSound(this.settings.soundName as SoundName, this.settings.volume)
      }

      const next = advanceAfterCompletion(finished, this.ctx())
      if (this.settings.notificationsEnabled && permission() === 'granted') {
        void notifyPhaseEnd(
          finished.phase === 'focus'
            ? {
                title: 'Focus complete',
                body: `Nice one. Time for a ${durationMinutes(
                  this.settings,
                  next.phase,
                )} minute break.`,
                action: { title: 'Start break', id: 'start' },
                endedAt: finished.endsAt ?? Date.now(),
              }
            : {
                title: 'Break over',
                body: `Ready for focus session ${Math.min(
                  next.cycleIndex + 1,
                  this.settings.longBreakEvery,
                )} of ${this.settings.longBreakEvery}.`,
                action: { title: 'Start focus', id: 'start' },
                endedAt: finished.endsAt ?? Date.now(),
              },
        )
      }

      const autoStart =
        (next.phase === 'focus' && this.settings.autoStartFocus) ||
        (next.phase !== 'focus' && this.settings.autoStartBreaks)
      this.commit(autoStart ? start(next, this.ctx()) : next)
    } finally {
      this.completing = false
    }
  }

  /**
   * The id is derived from the session id, so whichever device notices the end
   * first wins and every other device's copy collapses into it (PRD SYN-14).
   */
  private async record(finished: TimerDoc): Promise<void> {
    const endedAt = finished.endsAt ?? Date.now()
    const record: SessionRecord = {
      id: await uuidv5(SESSION_NAMESPACE, finished.sessionId),
      startedAt: endedAt - finished.durationMs,
      endedAt,
      durationSec: Math.round(finished.durationMs / 1000),
      tzOffsetMin: new Date(endedAt).getTimezoneOffset(),
      deviceId: this.identity?.deviceId ?? 'local',
      source: 'timer',
    }
    if (!(await this.repo.add(record))) return
    this.safely(() => this.sync?.broadcastRecord(record))

    const late = Date.now() - endedAt
    toast(
      late > 60_000
        ? `Session recorded, ${Math.round(late / 60_000)} min after it finished`
        : 'Session recorded',
      'info',
    )
  }

  /** Called when a notification action button is used. */
  startFromNotification = (): void => {
    if (this.doc.status !== 'running') this.commit(start(this.doc, this.ctx()))
  }

  /** ── Ambient side effects ───────────────────────────────────────────── */

  private applySideEffects(): void {
    const body = document.body
    body.dataset['phase'] = this.doc.phase
    body.dataset['status'] = this.doc.status
    // `data-theme` is not set here: the shell owns it, so that previewing a
    // background in settings can override the saved one without this being
    // able to stamp back over it on the next tick.

    if (this.doc.status === 'running' && this.settings.keepScreenAwake) void this.wakeLock.request()
    else void this.wakeLock.release()

    this.syncTimerSound()

    setBadge(this.doc.status === 'running' ? Math.ceil(this.remainingMs / 60_000) : null)
    this.updateTitle()
  }

  /**
   * The bed that plays *during* a session. Focus only, as in Marinara: a break
   * is meant to sound like one. Starting is idempotent, so changing the volume
   * mid-session re-levels the loop instead of restarting it.
   */
  syncTimerSound(): void {
    const { timerSound, timerSoundVolume, timerSoundBpm } = this.settings
    const wanted =
      this.doc.status === 'running' && this.doc.phase === 'focus' && timerSound !== TIMER_SOUND_NONE
    if (wanted) startTimerSound(timerSound, timerSoundVolume, timerSoundBpm)
    else stopTimerSound()
  }

  private updateTitle(): void {
    const label = this.doc.phase === 'focus' ? 'Focus' : 'Break'
    if (this.doc.status === 'running') document.title = `${formatClock(this.remainingMs)} · ${label}`
    else if (this.doc.status === 'paused')
      document.title = `⏸ ${formatClock(this.remainingMs)} · ${label}`
    else document.title = 'pwomwo, focus timer'
  }

  notify(message: string, tone: Tone = 'info'): void {
    toast(message, tone)
  }
}

export const store = new Store()
