import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import {
  ArrowCounterClockwiseIcon,
  ArrowLeftIcon,
  ArrowsOutIcon,
  ChartBarIcon,
  CheckCircleIcon,
  PlusIcon,
  SkipForwardIcon,
  SlidersHorizontalIcon,
  XIcon,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'

/** Renders a keyboard shortcut inside a tooltip. */
export function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="ml-1.5 rounded border border-white/15 bg-white/8 px-1 py-px font-mono text-[10px] text-ink-tertiary">
      {children}
    </kbd>
  )
}

/** Shared text styles with no shadcn equivalent. */
export const cls = {
  sectionTitle: 'text-[14px] font-semibold text-ink-secondary',
  hint: 'text-[12px] leading-relaxed text-ink-muted',
  card: 'rounded-xl border border-white/8 bg-white/4 p-4',
}

/**
 * Everything that leaves the screen in zen view dissolves on the same curve,
 * and stops taking taps the moment it starts to go: an invisible control that
 * still reacts is worse than one that is simply gone.
 */
export function chromeFade(hidden: boolean): string {
  return `transition-opacity duration-500 ease-out ${
    hidden ? 'pointer-events-none opacity-0' : 'opacity-100'
  }`
}

/**
 * Roving focus and arrow-key selection for a grid of radio tiles. Both of the
 * pickers in settings choose by eye rather than by name, so both are radio
 * grids: one tab stop, and the arrows move the *selection*, not just the
 * focus. Anything less leaves a keyboard on half a dozen buttons that merely
 * look related.
 */
export function useRadioTiles<T extends string>(
  ids: readonly T[],
  value: T,
  onChange: (next: T) => void,
) {
  const tiles = useRef<(HTMLButtonElement | null)[]>([])

  const onKeyDown = (event: KeyboardEvent) => {
    const index = ids.indexOf(value)
    const last = ids.length - 1
    let next = index
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = index >= last ? 0 : index + 1
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        next = index <= 0 ? last : index - 1
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = last
        break
      default:
        return
    }
    event.preventDefault()
    const id = ids[next]
    if (id === undefined) return
    onChange(id)
    tiles.current[next]?.focus()
  }

  return { tiles, onKeyDown }
}

export function Dot({ tone }: { tone: 'good' | 'warn' | 'off' }) {
  const color =
    tone === 'good'
      ? 'bg-good shadow-[0_0_8px_rgb(127_224_168/0.8)]'
      : tone === 'warn'
        ? 'bg-warn'
        : 'bg-white/35'
  return <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${color}`} />
}

export function Stepper({
  value,
  min,
  max,
  suffix,
  onChange,
  label,
}: {
  value: number
  min: number
  max: number
  suffix: string
  onChange: (next: number) => void
  label: string
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-white/6 p-[3px]">
      <Button
        variant="soft"
        size="icon"
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        className="coarse:h-11 coarse:w-11 h-7 w-7 bg-transparent text-[15px] text-white hover:bg-white/10 disabled:opacity-30"
      >
        −
      </Button>
      <span className="tabular min-w-18 text-center text-[14px] font-semibold">
        {value} {suffix}
      </span>
      <Button
        variant="soft"
        size="icon"
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className="coarse:h-11 coarse:w-11 h-7 w-7 bg-transparent text-[15px] text-white hover:bg-white/10 disabled:opacity-30"
      >
        +
      </Button>
    </div>
  )
}

export function Row({
  label,
  hint,
  children,
}: {
  label: ReactNode
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-0.5 py-1">
      <div className="min-w-0">
        <div className="text-[14px] font-medium">{label}</div>
        {hint ? <div className={`mt-0.5 max-w-[46ch] ${cls.hint}`}>{hint}</div> : null}
      </div>
      {children}
    </div>
  )
}

export function Section({ title, extra, children }: { title: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className={cls.sectionTitle}>{title}</h3>
        {extra}
      </div>
      {children}
    </section>
  )
}

/**
 * One icon family at one weight, so stroke weight and optical size agree
 * everywhere in the toolbar.
 */
export const ICON_WEIGHT = 'bold' as const

export const Icons = {
  history: <ChartBarIcon size={17} weight={ICON_WEIGHT} aria-hidden />,
  settings: <SlidersHorizontalIcon size={17} weight={ICON_WEIGHT} aria-hidden />,
  fullscreen: <ArrowsOutIcon size={17} weight={ICON_WEIGHT} aria-hidden />,
  reset: <ArrowCounterClockwiseIcon size={18} weight={ICON_WEIGHT} aria-hidden />,
  skip: <SkipForwardIcon size={17} weight={ICON_WEIGHT} aria-hidden />,
  close: <XIcon size={15} weight={ICON_WEIGHT} aria-hidden />,
  add: <PlusIcon size={13} weight={ICON_WEIGHT} aria-hidden />,
  back: <ArrowLeftIcon size={15} weight={ICON_WEIGHT} aria-hidden />,
  paired: <CheckCircleIcon size={22} weight={ICON_WEIGHT} aria-hidden />,
}

export function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-accent/25 border-t-accent"
    />
  )
}
