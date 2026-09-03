import { useLayoutEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import type { Phase, Settings, TimerDoc } from '../types'
import { store } from '../store'
import { formatClock } from '../util'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { chromeFade, Icons, Key } from './primitives'

/** How much of the viewport the clock claims once it is alone on the screen. */
const ZEN_WIDTH = 0.92
const ZEN_HEIGHT = 0.74

/**
 * The transform that carries the clock from where it sits in the layout to the
 * middle of an empty screen, as large as it will go. Driving this with one
 * `transform` keeps the whole move on the compositor: growing `font-size`
 * instead would relayout the text on every frame of a 700ms animation.
 *
 * `box` is the clock's untransformed layout box, which is why the transform
 * lives on a child of it and not on the box itself.
 */
function zenTransform(box: DOMRect): string {
  const scale = Math.max(
    1,
    Math.min((innerWidth * ZEN_WIDTH) / box.width, (innerHeight * ZEN_HEIGHT) / box.height),
  )
  const dx = innerWidth / 2 - (box.left + box.width / 2)
  const dy = innerHeight / 2 - (box.top + box.height / 2)
  return `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0) scale(${scale.toFixed(3)})`
}

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
  chromeHidden,
  onOpenSettings,
}: {
  doc: TimerDoc
  settings: Settings
  remainingMs: number
  announcement: string
  chromeHidden: boolean
  onOpenSettings: () => void
}) {
  const primary = doc.status === 'running' ? 'pause' : doc.status === 'paused' ? 'resume' : 'start'
  const clock = formatClock(remainingMs)
  const fade = chromeFade(chromeHidden)

  const box = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  const [zen, setZen] = useState('')

  // The chrome also fades on its own in fullscreen, which is an older setting
  // than this one, so a hidden chrome is not on its own a zen view: without
  // the setting the fullscreen fade would grow the clock for someone who
  // turned zen view off.
  //
  // Re-measured when the clock loses a digit (10:00 → 9:59), because the box it
  // has to fill into changes shape at that moment.
  const zenEnabled = chromeHidden && settings.idleHideControls
  useLayoutEffect(() => {
    if (!zenEnabled || reduceMotion) {
      setZen('')
      return
    }
    const measure = () => {
      const rect = box.current?.getBoundingClientRect()
      if (rect?.width && rect.height) setZen(zenTransform(rect))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [zenEnabled, reduceMotion, clock.length])

  return (
    /* Portrait stacks phase, clock, controls, hint. A landscape phone has no
       room for that stack, so the same four blocks become two columns: the
       clock on the left, everything that is a control on the right. */
    <main className="flex flex-1 flex-col items-center justify-center gap-5 px-[calc(1rem+var(--safe-l))] pr-[calc(1rem+var(--safe-r))] sm:gap-6.5 landscape-short:grid landscape-short:grid-cols-[auto_auto] landscape-short:place-content-center landscape-short:place-items-center landscape-short:gap-x-7 landscape-short:gap-y-2.5">
      <div
        className={`flex flex-col items-center gap-3 landscape-short:col-start-2 landscape-short:row-start-1 ${fade}`}
      >
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
                {/* A landscape phone is wide enough for `sm`, but the row
                    now shares that width with the clock, so it keeps the
                    abbreviated labels a portrait phone uses. */}
                <span className="sm:hidden landscape-short:inline">{p.short}</span>
                <span className="hidden sm:inline landscape-short:hidden">{p.label}</span>
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

      {/* The outer box holds the place in the layout, so it still measures the
          clock's real position while the inner one is scaled away from it. */}
      <div
        ref={box}
        className="landscape-short:col-start-1 landscape-short:row-span-3 landscape-short:row-start-1"
      >
        <div
          className="text-count tabular leading-none font-bold tracking-[-0.03em] whitespace-nowrap select-none transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] text-shadow-[0_4px_40px_rgb(0_0_0/0.35)]"
          style={zen ? { transform: zen } : undefined}
        >
          {clock}
        </div>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <div
        className={`flex flex-wrap items-center justify-center gap-2.5 sm:gap-3.5 landscape-short:col-start-2 landscape-short:row-start-2 ${fade}`}
      >
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

      <p
        className={`text-center text-[13px] text-ink-muted landscape-short:col-start-2 landscape-short:row-start-3 ${fade}`}
      >
        {hintFor(doc, settings)}
      </p>
    </main>
  )
}
