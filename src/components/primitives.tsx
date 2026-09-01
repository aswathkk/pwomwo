import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
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

/**
 * A hover/focus label for controls whose face does not carry their meaning:
 * icon-only buttons, and the one destructive action whose scope is worth
 * spelling out. Controls with a readable label do not get one.
 *
 * The bubble is portalled to `document.body` and positioned from the trigger's
 * rect: several triggers live inside scroll containers (the settings body, the
 * history panel), and an absolutely-positioned child would be clipped by them.
 * It is `aria-hidden` because the trigger already carries an `aria-label`, and
 * announcing both would read the control twice.
 */
const EDGE = 8
/** Long enough that passing over a control never flashes a bubble. */
const OPEN_DELAY_MS = 650
/** Move between neighbouring controls inside this window and it opens at once. */
const GRACE_MS = 400

let lastClosedAt = 0

export function Tooltip({
  label,
  side = 'bottom',
  children,
}: {
  label: ReactNode
  side?: 'top' | 'bottom'
  children: ReactNode
}) {
  const trigger = useRef<HTMLSpanElement>(null)
  const bubble = useRef<HTMLSpanElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const open = useRef(false)
  const [rect, setRect] = useState<DOMRect | null>(null)

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])

  const show = useCallback(
    (immediate: boolean) => {
      clear()
      const reveal = () => {
        if (!trigger.current) return
        open.current = true
        setRect(trigger.current.getBoundingClientRect())
      }
      if (immediate || Date.now() - lastClosedAt < GRACE_MS) reveal()
      else timer.current = setTimeout(reveal, OPEN_DELAY_MS)
    },
    [clear],
  )

  const hide = useCallback(() => {
    clear()
    if (open.current) {
      open.current = false
      lastClosedAt = Date.now()
    }
    setRect(null)
  }, [clear])

  useEffect(() => clear, [clear])

  useLayoutEffect(() => {
    const el = bubble.current
    if (!rect || !el) return
    const { width, height } = el.getBoundingClientRect()
    // Keep the bubble on screen however close to an edge the trigger sits.
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - width / 2, EDGE),
      window.innerWidth - width - EDGE,
    )
    const wantsAbove = side === 'top' || rect.bottom + height + 10 > window.innerHeight
    const top = wantsAbove ? rect.top - height - 8 : rect.bottom + 8
    el.style.left = `${left}px`
    el.style.top = `${Math.max(EDGE, top)}px`
    el.style.opacity = '1'
  }, [rect, side])

  return (
    <>
      <span
        ref={trigger}
        className="inline-flex"
        // Touch taps must not leave a bubble stranded over the UI.
        onPointerEnter={(e) => {
          if (e.pointerType !== 'touch') show(false)
        }}
        onPointerLeave={hide}
        onPointerDown={hide}
        // Keyboard focus is deliberate, so there is nothing to wait for.
        onFocusCapture={() => show(true)}
        onBlurCapture={hide}
      >
        {children}
      </span>
      {rect
        ? createPortal(
            <span
              ref={bubble}
              aria-hidden
              className="pointer-events-none fixed z-100 max-w-[min(20rem,calc(100vw-1rem))] rounded-lg border border-white/12 bg-raised px-2.5 py-1.5 text-[11.5px] leading-tight font-medium text-ink-secondary opacity-0 shadow-[0_8px_24px_rgb(0_0_0/0.5)] backdrop-blur-md transition-opacity duration-100"
              style={{ top: -9999, left: -9999 }}
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </>
  )
}

/** Renders a keyboard shortcut inside a tooltip. */
export function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="ml-1.5 rounded border border-white/15 bg-white/8 px-1 py-px font-mono text-[10px] text-ink-tertiary">
      {children}
    </kbd>
  )
}

/** Shared class strings, so the mock's button language stays in one place. */
export const cls = {
  iconButton:
    'flex h-10 w-10 coarse:h-11 coarse:w-11 items-center justify-center rounded-full border-[1.5px] border-white/35 bg-white/8 text-white backdrop-blur-sm transition hover:bg-white/18',
  ghostButton:
    'flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-white/35 bg-transparent text-lg text-white transition hover:bg-white/15',
  primaryButton:
    'h-14 min-w-30 sm:min-w-35 rounded-full bg-white px-6 sm:px-8 text-[17px] font-semibold text-ink shadow-[0_6px_24px_rgb(0_0_0/0.25)] transition hover:-translate-y-px',
  button:
    'h-9.5 coarse:h-11 rounded-full bg-white/9 px-5 text-[13px] font-medium text-ink-secondary transition hover:bg-white/16 disabled:cursor-not-allowed disabled:opacity-40',
  buttonPrimary:
    'h-9.5 coarse:h-11 rounded-full bg-white px-5.5 text-[13px] font-semibold text-ink transition hover:bg-accent-wash',
  buttonDanger:
    'h-9.5 coarse:h-11 rounded-full border-[1.5px] border-bad/60 px-4.5 text-[13px] font-medium text-bad transition hover:bg-bad/12',
  outlinePillDanger:
    'h-8.5 coarse:h-11 shrink-0 rounded-full border-[1.5px] border-bad/60 px-4 text-[12.5px] font-medium whitespace-nowrap text-bad transition hover:bg-bad/12 disabled:cursor-not-allowed disabled:opacity-40',
  outlinePill:
    'h-8.5 coarse:h-11 shrink-0 rounded-full border-[1.5px] border-white/30 px-4 text-[12.5px] font-medium whitespace-nowrap text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40',
  closeButton:
    'flex h-8.5 w-8.5 coarse:h-11 coarse:w-11 items-center justify-center rounded-lg bg-white/8 text-ink-tertiary transition hover:bg-white/16',
  sectionTitle: 'text-[14px] font-semibold text-ink-secondary',
  hint: 'text-[12px] leading-relaxed text-ink-muted',
  card: 'rounded-xl border border-white/8 bg-white/4 p-4',
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

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`tap-pad relative h-6.25 w-10.5 shrink-0 rounded-full transition ${
        checked ? 'bg-accent' : 'bg-white/14'
      }`}
    >
      <span
        className={`absolute top-[3px] h-4.75 w-4.75 rounded-full transition-all ${
          checked ? 'left-[20px] bg-ink' : 'left-[3px] bg-white'
        }`}
      />
    </button>
  )
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
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        className="h-7 w-7 coarse:h-11 coarse:w-11 rounded-lg text-[15px] text-white transition hover:bg-white/10 disabled:opacity-30"
      >
        −
      </button>
      <span className="min-w-18 text-center text-[14px] font-semibold tabular">
        {value} {suffix}
      </span>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className="h-7 w-7 coarse:h-11 coarse:w-11 rounded-lg text-[15px] text-white transition hover:bg-white/10 disabled:opacity-30"
      >
        +
      </button>
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
