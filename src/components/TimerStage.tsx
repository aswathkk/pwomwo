import type { Phase, Settings, TimerDoc } from '../types'
import { store } from '../store'
import { formatClock } from '../util'
import { cls, Icons, Key, Tooltip } from './primitives'

const PHASES: { id: Phase; label: string; short: string }[] = [
  { id: 'focus', label: 'focus', short: 'focus' },
  { id: 'shortBreak', label: 'short break', short: 'short' },
  { id: 'longBreak', label: 'long break', short: 'long' },
]

function hintFor(doc: TimerDoc, settings: Settings): string {
  if (!settings.sequenceEnabled) return doc.phase === 'focus' ? 'focus' : 'break'
  if (doc.phase === 'focus') {
    const n = Math.min(doc.cycleIndex + 1, settings.longBreakEvery)
    const tail = doc.cycleIndex + 2 >= settings.longBreakEvery ? ', long break after next' : ''
    return `session ${n} of ${settings.longBreakEvery}${tail}`
  }
  return doc.phase === 'longBreak' ? 'long break, cycle resets after this' : 'short break, next up focus'
}

export function TimerStage({
  doc,
  settings,
  remainingMs,
  announcement,
  onOpenSettings,
}: {
  doc: TimerDoc
  settings: Settings
  remainingMs: number
  announcement: string
  onOpenSettings: () => void
}) {
  const primary = doc.status === 'running' ? 'pause' : doc.status === 'paused' ? 'resume' : 'start'

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 px-4 sm:gap-6.5">
      <div className="flex flex-col items-center gap-3">
        <div
          role="tablist"
          aria-label="Timer phase"
          className="no-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-full border border-white/14 bg-white/12 p-1 backdrop-blur-md"
        >
          {PHASES.map((p) => {
            const selected = p.id === doc.phase
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => void store.selectPhase(p.id)}
                className={`h-9 coarse:h-11 rounded-full px-3.5 text-[13px] whitespace-nowrap transition sm:h-10 sm:px-5.5 sm:text-[15px] ${
                  selected ? 'bg-white font-semibold text-ink' : 'font-medium text-ink-secondary hover:bg-white/14'
                }`}
              >
                <span className="sm:hidden">{p.short}</span>
                <span className="hidden sm:inline">{p.label}</span>
              </button>
            )
          })}
        </div>

        {settings.sequenceEnabled ? (
          <div
            className="flex gap-1.75"
            aria-label={`Session ${Math.min(doc.cycleIndex + 1, settings.longBreakEvery)} of ${settings.longBreakEvery} in this cycle`}
          >
            {Array.from({ length: settings.longBreakEvery }, (_, i) => (
              <span
                key={i}
                aria-hidden
                className={`h-1.5 w-1.5 rounded-full ${i < doc.cycleIndex ? 'bg-accent' : 'bg-white/30'}`}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="text-count leading-none font-bold tracking-[-0.03em] whitespace-nowrap tabular text-shadow-[0_4px_40px_rgb(0_0_0/0.35)]">
        {formatClock(remainingMs)}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3.5">
        <button type="button" className={cls.primaryButton} onClick={store.toggle}>
          {primary}
        </button>

        <Tooltip
          label={
            <>
              Back to {Math.round(doc.durationMs / 60_000)}:00. Nothing is recorded.
              <Key>R</Key>
            </>
          }
        >
          <button
            type="button"
            className={cls.ghostButton}
            aria-label="Reset the timer"
            onClick={() => void store.resetTimer()}
          >
            {Icons.reset}
          </button>
        </Tooltip>

        <Tooltip
          label={
            <>
              Jump to the next phase without recording
              <Key>N</Key>
            </>
          }
        >
          <button
            type="button"
            className={cls.ghostButton}
            aria-label="Skip to the next phase"
            onClick={store.skipPhase}
          >
            {Icons.skip}
          </button>
        </Tooltip>

        <button
          type="button"
          className={cls.ghostButton}
          aria-label="Settings"
          title="Settings"
          onClick={onOpenSettings}
        >
          {Icons.settings}
        </button>
      </div>

      <p className="text-center text-[13px] text-ink-muted">{hintFor(doc, settings)}</p>
    </main>
  )
}
