import type { Phase, Settings, TimerDoc } from '../types'
import { durationMinutes } from '../settings'
import { uuid } from '../util'

export interface TimerContext {
  deviceId: string
  settings: Settings
  now: number
}

export function armed(phase: Phase, ctx: TimerContext, version: number, cycleIndex: number): TimerDoc {
  const durationMs = durationMinutes(ctx.settings, phase) * 60_000
  return {
    type: 'timer.state',
    version,
    updatedAt: ctx.now,
    updatedBy: ctx.deviceId,
    sessionId: uuid(),
    phase,
    status: 'idle',
    durationMs,
    endsAt: null,
    remainingMs: durationMs,
    cycleIndex,
    cycleLength: ctx.settings.longBreakEvery,
  }
}

export function initialDoc(ctx: TimerContext): TimerDoc {
  return armed('focus', ctx, 1, 0)
}

/** ms left right now, whatever the status. */
export function remaining(doc: TimerDoc, now: number): number {
  if (doc.status === 'running' && doc.endsAt != null) return Math.max(0, doc.endsAt - now)
  return Math.max(0, doc.remainingMs ?? doc.durationMs)
}

export function isComplete(doc: TimerDoc, now: number): boolean {
  return doc.status === 'running' && doc.endsAt != null && now >= doc.endsAt
}

function bump(doc: TimerDoc, ctx: TimerContext, patch: Partial<TimerDoc>): TimerDoc {
  return {
    ...doc,
    ...patch,
    version: doc.version + 1,
    updatedAt: ctx.now,
    updatedBy: ctx.deviceId,
  }
}

export function start(doc: TimerDoc, ctx: TimerContext): TimerDoc {
  if (doc.status === 'running') return doc
  const left = remaining(doc, ctx.now) || doc.durationMs
  return bump(doc, ctx, {
    status: 'running',
    endsAt: ctx.now + left,
    remainingMs: null,
    // A fresh run gets a fresh session id; resuming a pause keeps the old one.
    sessionId: doc.status === 'paused' ? doc.sessionId : uuid(),
  })
}

export function pause(doc: TimerDoc, ctx: TimerContext): TimerDoc {
  if (doc.status !== 'running') return doc
  return bump(doc, ctx, {
    status: 'paused',
    remainingMs: remaining(doc, ctx.now),
    endsAt: null,
  })
}

export function reset(doc: TimerDoc, ctx: TimerContext): TimerDoc {
  return bump(doc, ctx, {
    status: 'idle',
    durationMs: durationMinutes(ctx.settings, doc.phase) * 60_000,
    remainingMs: durationMinutes(ctx.settings, doc.phase) * 60_000,
    endsAt: null,
    sessionId: uuid(),
  })
}

export function switchPhase(doc: TimerDoc, phase: Phase, ctx: TimerContext): TimerDoc {
  const durationMs = durationMinutes(ctx.settings, phase) * 60_000
  return bump(doc, ctx, {
    phase,
    status: 'idle',
    durationMs,
    remainingMs: durationMs,
    endsAt: null,
    sessionId: uuid(),
  })
}

/** The phase that follows `doc` once it completes, honouring sequence mode. */
export function nextPhase(doc: TimerDoc, settings: Settings): { phase: Phase; cycleIndex: number } {
  if (!settings.sequenceEnabled) return { phase: doc.phase, cycleIndex: doc.cycleIndex }
  if (doc.phase === 'focus') {
    const done = doc.cycleIndex + 1
    if (done >= settings.longBreakEvery) return { phase: 'longBreak', cycleIndex: done }
    return { phase: 'shortBreak', cycleIndex: done }
  }
  // After a long break the cycle starts over; after a short break we carry on.
  return { phase: 'focus', cycleIndex: doc.phase === 'longBreak' ? 0 : doc.cycleIndex }
}

/** Skip forward without recording anything. */
export function skip(doc: TimerDoc, ctx: TimerContext): TimerDoc {
  const { phase, cycleIndex } = nextPhase(doc, ctx.settings)
  const durationMs = durationMinutes(ctx.settings, phase) * 60_000
  return bump(doc, ctx, {
    phase,
    cycleIndex,
    status: 'idle',
    durationMs,
    remainingMs: durationMs,
    endsAt: null,
    sessionId: uuid(),
  })
}

/** Move a finished run on to the next armed phase. */
export function advanceAfterCompletion(doc: TimerDoc, ctx: TimerContext): TimerDoc {
  const { phase, cycleIndex } = nextPhase(doc, ctx.settings)
  const durationMs = durationMinutes(ctx.settings, phase) * 60_000
  return bump(doc, ctx, {
    phase,
    cycleIndex,
    status: 'idle',
    durationMs,
    remainingMs: durationMs,
    endsAt: null,
    sessionId: uuid(),
  })
}

/**
 * Convergence rule (PRD SYN-12): higher version wins; ties break on wall clock,
 * then on deviceId so every device lands on the same answer.
 */
export function shouldApply(local: TimerDoc, incoming: TimerDoc): boolean {
  if (incoming.version !== local.version) return incoming.version > local.version
  if (incoming.updatedAt !== local.updatedAt) return incoming.updatedAt > local.updatedAt
  return incoming.updatedBy > local.updatedBy
}
