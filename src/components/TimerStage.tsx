import type { Phase, Settings, TimerDoc } from '../types'
import { store } from '../store'
import { formatClock } from '../util'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Icons, Key } from './primitives'

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
        {/* `manual`: arrow keys only move focus. Automatic activation would
            switch the phase (and discard a paused session) on mere browsing. */}
        <Tabs
          value={doc.phase}
          onValueChange={(next) => void store.selectPhase(next as Phase)}
          activationMode="manual"
        >
          <TabsList aria-label="Timer phase">
            {PHASES.map((p) => (
              <TabsTrigger
                key={p.id}
                value={p.id}
                // Radix swallows same-value selection, but re-picking the
                // current phase while it runs is the restart affordance.
                onClick={() => {
                  if (p.id === doc.phase) void store.selectPhase(p.id)
                }}
              >
                <span className="sm:hidden">{p.short}</span>
                <span className="hidden sm:inline">{p.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

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

      <div className="text-count tabular leading-none font-bold tracking-[-0.03em] whitespace-nowrap text-shadow-[0_4px_40px_rgb(0_0_0/0.35)]">
        {formatClock(remainingMs)}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3.5">
        <Button
          size="xl"
          className="shadow-[0_6px_24px_rgb(0_0_0/0.25)] hover:-translate-y-px"
          onClick={store.toggle}
        >
          {primary}
        </Button>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xl"
              aria-label="Reset the timer"
              onClick={() => void store.resetTimer()}
            >
              {Icons.reset}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Back to {Math.round(doc.durationMs / 60_000)}:00. Nothing is recorded.
            <Key>R</Key>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xl"
              aria-label="Skip to the next phase"
              onClick={store.skipPhase}
            >
              {Icons.skip}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Jump to the next phase without recording
            <Key>N</Key>
          </TooltipContent>
        </Tooltip>

        <Button
          variant="ghost"
          size="icon-xl"
          aria-label="Settings"
          title="Settings"
          onClick={onOpenSettings}
        >
          {Icons.settings}
        </Button>
      </div>

      <p className="text-center text-[13px] text-ink-muted">{hintFor(doc, settings)}</p>
    </main>
  )
}
