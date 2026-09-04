import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { useReducedMotion } from 'motion/react'
import type { ClockStyleName } from '../clocks'
import { clamp } from '../util'

/**
 * The countdown, in whichever face the settings ask for. Everything here is
 * driven by CSS: the store publishes a new `clock` string once a second, and
 * an animation that had to be advanced per frame from React would re-render
 * the whole page 60 times a second to do it.
 *
 * The faces are deliberately unaware of the timer — they are handed a
 * formatted string and two numbers — so the zen-view transform in
 * `TimerStage` can keep measuring one box regardless of which one is on
 * screen.
 *
 * Nothing here takes a pointer. The clock is the biggest thing on the page,
 * zen view scales it out over the controls, and a face that accepted clicks
 * would swallow the ones meant for the buttons underneath it.
 */

/** Tabular figures matter most: without them the clock's width changes with
    its digits, and the zen transform is measured from that width. */
const FACE = 'tabular pointer-events-none leading-none whitespace-nowrap select-none'
const BOLD = 'font-bold tracking-[-0.03em]'
const SHADOW = 'text-shadow-[0_4px_40px_rgb(0_0_0/0.35)]'

/**
 * `ui-serif` first, so each platform contributes its own text serif rather
 * than everyone getting Times. No new font file: the app self-hosts one
 * family, and a second download for one clock face is not worth 50 KB.
 * Italic and old-style figures are what keep this from reading as the bold
 * face in a different hat; upright lining serifs at this size did.
 */
const SERIF: CSSProperties = {
  fontFamily: 'ui-serif, Georgia, "Times New Roman", serif',
  fontStyle: 'italic',
  fontVariantNumeric: 'oldstyle-nums tabular-nums',
}

export function Clock({
  style,
  clock,
  remainingMs,
  durationMs,
  running,
}: {
  style: ClockStyleName
  /** Already formatted: `24:59`, or `1:00:00` once an hour is on the clock. */
  clock: string
  remainingMs: number
  durationMs: number
  running: boolean
}) {
  const reduce = !!useReducedMotion()
  const elapsed = durationMs > 0 ? clamp(1 - remainingMs / durationMs, 0, 1) : 0

  switch (style) {
    case 'serif':
      return (
        /* The trailing padding is for the italic: its last glyph overhangs
           its advance width, and the zen transform is measured from the box,
           so without it the corner of a 7 leaves the screen at full size. */
        <div
          className={`${FACE} pr-[0.1em] font-normal tracking-[-0.01em] text-shadow-[0_3px_30px_rgb(0_0_0/0.32)]`}
          style={SERIF}
        >
          {/* Per digit, not per clock: cross-fading the whole string every
              second is a flicker, and only the digits that changed have
              anything to cross-fade. The layered copies are hidden from
              assistive tech, which gets one plain string instead. */}
          <span className="sr-only">{clock}</span>
          <span aria-hidden className="flex items-baseline">
            {[...clock].map((char, i) => (
              <Fading key={i} char={char} reduce={reduce} />
            ))}
          </span>
        </div>
      )

    case 'outline':
      return (
        <div className={`${FACE} ${BOLD}`}>
          <Outline elapsed={elapsed}>{clock}</Outline>
        </div>
      )

    case 'dots':
      return (
        <div className={`${FACE} ${BOLD}`}>
          <Dots clock={clock} remainingMs={remainingMs} durationMs={durationMs} />
        </div>
      )

    case 'segment':
      return (
        <div className={FACE}>
          <span className="sr-only">{clock}</span>
          <span aria-hidden className="flex items-baseline">
            {[...clock].map((char, i) =>
              char === ':' ? (
                <SegmentColon key={i} blink={running && !reduce} />
              ) : (
                <SegmentDigit key={i} char={char} />
              ),
            )}
          </span>
        </div>
      )

    case 'dial':
      return (
        <div className={`${FACE} ${BOLD} ${SHADOW}`}>
          <Dial elapsed={elapsed} clock={clock} />
        </div>
      )

    case 'flip':
      return (
        <div className={FACE}>
          <span className="sr-only">{clock}</span>
          {/* Cards carry their own margins and padding, which a phone has no
              room for on top of a clock already sized to most of its width:
              the face gives that back out of the type size, so it occupies
              about the same footprint as the others. */}
          <span aria-hidden className={`flex items-baseline text-[0.82em] ${BOLD}`}>
            {[...clock].map((char, i) => (
              <Flap key={i} char={char} reduce={reduce} />
            ))}
          </span>
        </div>
      )

    default:
      return <div className={`${FACE} ${BOLD} ${SHADOW}`}>{clock}</div>
  }
}

/**
 * The value this cell held before the current one, and a counter that changes
 * with it. State rather than a ref: a ref written during render is lost to
 * StrictMode's double render, and the counter is what re-keys an element so
 * its CSS animation starts again — a class that never changes never replays.
 */
function useChange(value: string): { prev: string | undefined; seq: number } {
  const [state, setState] = useState<{ cur: string; prev?: string; seq: number }>({
    cur: value,
    seq: 0,
  })
  // Adjusting state during render: React discards this pass and re-runs it
  // with the new state before committing anything, so nothing flashes.
  if (state.cur !== value) setState({ cur: value, prev: state.cur, seq: state.seq + 1 })
  return { prev: state.prev, seq: state.seq }
}

/**
 * One digit, cross-fading with the one it replaced.
 *
 * Every digit sits in a cell one `ch` wide — the advance of the font's own
 * zero, its widest figure — because the platform serifs ignore
 * `tabular-nums` in italic: a 1 is two thirds the width of a 0, and a clock
 * whose width changes every second walks its neighbours sideways. A fixed
 * cell is also what lets the two copies land on top of each other.
 */
const CELL = 'inline-block w-[1ch] text-center'

function Fading({ char, reduce }: { char: string; reduce: boolean }) {
  const { prev, seq } = useChange(char)
  if (char === ':') return <span>:</span>
  if (reduce || prev === undefined || prev === ':') return <span className={CELL}>{char}</span>
  return (
    <span className={`relative ${CELL}`}>
      <span key={seq} className="animate-digit-fade-in block">
        {char}
      </span>
      <span key={`out-${seq}`} className="animate-digit-fade-out absolute inset-0">
        {prev}
      </span>
    </span>
  )
}

/**
 * Hollow numerals with the phase's progress as a water line: a solid copy of
 * the same string sits over the outline, clipped to the bottom `elapsed` of
 * its height, and the clip moves up a hair a second. The outline is drawn on
 * the glyph edge, so the solid copy covers its inner half wherever it has
 * risen and the silhouette stays one width top to bottom.
 *
 * A third copy in the accent, clipped to a band a few hundredths of an em
 * either side of that line, is the meniscus: it is what makes the fill read
 * as a level rising through the glyphs rather than as two textures meeting.
 * At rest it is a hairline along the very bottom of the digits.
 *
 * No drop shadow on this one: a shadow is cast by the glyph's whole shape and
 * would show through the hollow as a smear.
 */
function Outline({ elapsed, children }: { elapsed: number; children: ReactNode }) {
  const line = ((1 - elapsed) * 100).toFixed(2)
  const filled = (elapsed * 100).toFixed(2)
  return (
    <span className="relative inline-block">
      <span
        className="block"
        style={{ WebkitTextStroke: '0.032em currentColor', WebkitTextFillColor: 'transparent' }}
      >
        {children}
      </span>
      <span
        aria-hidden
        className="absolute inset-0 transition-[clip-path] duration-1000 ease-linear"
        style={{ clipPath: `inset(${line}% 0 0 0)` }}
      >
        {children}
      </span>
      <span
        aria-hidden
        className="absolute inset-0 text-accent-bright transition-[clip-path] duration-1000 ease-linear"
        style={{ clipPath: `inset(calc(${line}% - 0.025em) 0 calc(${filled}% - 0.025em) 0)` }}
      >
        {children}
      </span>
    </span>
  )
}

/**
 * The phase as its minutes: one dot each, read left to right and top to
 * bottom. The spent ones are dimmed, the current one drains with the seconds
 * (a conic gradient on a registered property, so the drain is a one-second
 * linear transition rather than a jump), and the count stays underneath at a
 * size that has to be looked for. This is the face for someone who wants to
 * stop reading seconds off the wall.
 */
function Dots({
  clock,
  remainingMs,
  durationMs,
}: {
  clock: string
  remainingMs: number
  durationMs: number
}) {
  // Past an hour a dot is five minutes: 180 of them is a wall, not a face.
  const unitMs = durationMs > 60 * 60_000 ? 5 * 60_000 : 60_000
  const total = Math.max(1, Math.ceil(durationMs / unitMs))
  const left = clamp(remainingMs / unitMs, 0, total)
  const whole = Math.floor(left)
  const frac = left - whole
  // The dot being drained sits just before the whole ones; with nothing to
  // drain (idle, or exactly on a minute) every remaining dot is whole.
  const current = frac > 0 ? total - whole - 1 : -1
  const spent = frac > 0 ? current : total - whole
  const dot = total <= 10 ? '0.26em' : '0.18em'

  return (
    <div className="flex flex-col items-center gap-[0.2em]">
      <div
        aria-hidden
        className="grid gap-[0.1em]"
        style={{ gridTemplateColumns: `repeat(${Math.min(total, 10)}, ${dot})` }}
      >
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`aspect-square rounded-full ${
              i < spent
                ? 'bg-white/22'
                : i === current
                  ? 'dot-draining'
                  : 'bg-white shadow-[0_2px_10px_rgb(0_0_0/0.3)]'
            }`}
            style={i === current ? ({ '--dot-frac': frac } as CSSProperties) : undefined}
          />
        ))}
      </div>
      <span className="block text-[0.3em] font-medium tracking-[0.03em] text-ink-secondary">
        {clock}
      </span>
    </div>
  )
}

/**
 * A seven-segment digit, drawn rather than typed, with the geometry of the
 * real thing: each segment is a hexagon with mitred ends, the seven of them
 * meet at 45° corners with a hair of air between, and the whole digit leans
 * the eight degrees a calculator's does.
 *
 * The unlit segments are not hidden. They are held as faint outlines with a
 * whisper of fill, which is the character of the display — you can see where
 * the missing strokes would be — without the grey smudge a translucent fill
 * on its own left over a bright sky. A lit segment is a solid copy on top,
 * faded in: opacity is one of the few transitions the reduced-motion rules
 * keep, so the display still lights rather than snapping for someone who
 * asked for less movement.
 *
 * Lettered the way the datasheets do: `a` across the top, then clockwise,
 * with `g` across the middle.
 */
const SEG_W = 60
const SEG_H = 100
const SEG_T = 10
/** Air between segment tips, on each side. */
const SEG_GAP = 1.6
const SEG_LEAN = 8

function hseg(x0: number, x1: number, yc: number): string {
  const t = SEG_T / 2
  return `${x0},${yc} ${x0 + t},${yc - t} ${x1 - t},${yc - t} ${x1},${yc} ${x1 - t},${yc + t} ${x0 + t},${yc + t}`
}

function vseg(y0: number, y1: number, xc: number): string {
  const t = SEG_T / 2
  return `${xc},${y0} ${xc + t},${y0 + t} ${xc + t},${y1 - t} ${xc},${y1} ${xc - t},${y1 - t} ${xc - t},${y0 + t}`
}

const SEG_POINTS: Record<string, string> = (() => {
  const t = SEG_T / 2
  const g = SEG_GAP
  return {
    a: hseg(t + g, SEG_W - t - g, t),
    g: hseg(t + g, SEG_W - t - g, SEG_H / 2),
    d: hseg(t + g, SEG_W - t - g, SEG_H - t),
    f: vseg(t + g, SEG_H / 2 - g, t),
    b: vseg(t + g, SEG_H / 2 - g, SEG_W - t),
    e: vseg(SEG_H / 2 + g, SEG_H - t - g, t),
    c: vseg(SEG_H / 2 + g, SEG_H - t - g, SEG_W - t),
  }
})()

const SEG_LIT: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abdeg',
  '3': 'abcdg',
  '4': 'bcfg',
  '5': 'acdfg',
  '6': 'acdefg',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
}

/** Shears about the digit's middle, so the lean overhangs equally at the top
    and the bottom instead of pushing the whole digit sideways. */
const SEG_SKEW = `translate(${(Math.tan((SEG_LEAN * Math.PI) / 180) * SEG_H) / 2} 0) skewX(-${SEG_LEAN})`

function SegmentDigit({ char }: { char: string }) {
  const lit = SEG_LIT[char] ?? ''
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${SEG_W} ${SEG_H}`}
      className="mx-[0.045em] inline-block h-[0.78em] w-[0.47em] overflow-visible"
      fill="currentColor"
    >
      <g transform={SEG_SKEW}>
        {Object.entries(SEG_POINTS).map(([id, points]) => (
          <g key={id}>
            <polygon
              points={points}
              fillOpacity={0.05}
              stroke="currentColor"
              strokeOpacity={0.24}
              strokeWidth={1.2}
              strokeLinejoin="round"
            />
            <polygon
              points={points}
              className="transition-opacity duration-200 ease-out"
              opacity={lit.includes(id) ? 1 : 0}
              style={{ filter: 'drop-shadow(0 0 2px rgb(255 255 255 / 0.5))' }}
            />
          </g>
        ))}
      </g>
    </svg>
  )
}

function SegmentColon({ blink }: { blink: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox={`0 0 16 ${SEG_H}`}
      className={`mx-[0.03em] inline-block h-[0.78em] w-[0.15em] overflow-visible ${
        blink ? 'animate-lcd-colon' : ''
      }`}
      fill="currentColor"
    >
      <g transform={SEG_SKEW}>
        <rect x={2} y={30} width={12} height={11} rx={2} />
        <rect x={2} y={59} width={12} height={11} rx={2} />
      </g>
    </svg>
  )
}

/**
 * A split-flap card. Four layers, all of them the same box so their halves
 * meet on the same seam:
 *
 *   static top      the new digit's top half, in place from the start
 *   static bottom   the old digit's bottom half, waiting to be covered
 *   falling leaf    the old digit's top half, rotating down out of sight
 *   rising leaf     the new digit's bottom half, swinging up behind it
 *
 * Both leaves rest at the *end* of their animation, so a browser that runs no
 * animations at all still lands on the new digit rather than the old one.
 *
 * This is the one face that is not translucent, and it has to be: every layer
 * carries the card's own opaque face so that the one on top *hides* the one
 * under it. Over a see-through card the old bottom half stays legible through
 * the new one, and the clock reads as two digits at once. The face is a shade
 * lighter than the app's panels so the cards read as objects on any
 * background, the true-black one included.
 */
const CARD = 'bg-[#171522] bg-gradient-to-b from-white/12 to-white/0'

function Flap({ char, reduce }: { char: string; reduce: boolean }) {
  const { prev, seq } = useChange(char)
  if (char === ':') return <span className="px-[0.04em] opacity-70">:</span>

  const flipping = prev !== undefined && prev !== ':' && !reduce
  return (
    <span
      className={`relative mx-[0.022em] inline-block overflow-hidden rounded-[0.08em] shadow-[0_0.06em_0.3em_rgb(0_0_0/0.4)] [perspective:14em] ${CARD}`}
    >
      {/* Nothing but a sizer: every visible layer is absolute, so one of them
          has to hold the card open. */}
      <span className="invisible block px-[0.08em]">{char}</span>
      <Half edge="top">{char}</Half>
      <Half edge="bottom">{flipping ? prev : char}</Half>
      {flipping ? (
        <>
          <Half key={`fall-${seq}`} edge="top" className="animate-flap-fall origin-bottom">
            {prev}
          </Half>
          <Half key={`rise-${seq}`} edge="bottom" className="animate-flap-rise origin-top">
            {char}
          </Half>
        </>
      ) : null}
      <span
        aria-hidden
        className="absolute inset-x-0 top-1/2 h-px -translate-y-[0.5px] bg-black/50"
      />
    </span>
  )
}

function Half({
  edge,
  className = '',
  children,
}: {
  edge: 'top' | 'bottom'
  className?: string
  children: ReactNode
}) {
  const clip = edge === 'top' ? '[clip-path:inset(0_0_50%_0)]' : '[clip-path:inset(50%_0_0_0)]'
  return (
    <span
      className={`absolute inset-0 grid place-items-center [backface-visibility:hidden] ${clip} ${CARD} ${className}`}
    >
      {children}
    </span>
  )
}

/**
 * The phase as an instrument: a ticked rim, the elapsed arc sweeping round it,
 * a marker riding the head of that arc, and the count in the middle at a size
 * the circle can hold.
 *
 * The dial is square and sized from the digits it has to enclose, measured at
 * runtime — `1em` is the type size, not the width of five glyphs, so no static
 * geometry fits both `24:59` and `1:00:00`. `offsetWidth`, not
 * `getBoundingClientRect`: zen view scales an ancestor, and the measurement
 * has to stay in layout pixels or the circle stops being one.
 *
 * The first measurement is taken in a layout effect, before anything is
 * painted. A ResizeObserver alone delivers its first size a frame after
 * mount, and that frame is the dial at the digits' own size — with every
 * control below it a few hundred pixels higher than it is about to be.
 */
const TICKS = 12

function Dial({ elapsed, clock }: { elapsed: number; clock: string }) {
  const digits = useRef<HTMLSpanElement>(null)
  const [side, setSide] = useState(0)

  const measure = () => {
    const el = digits.current
    // The circle has to clear the digits' *diagonal*, plus room for the rim
    // and enough air that the count is not touching the ring at its sides.
    if (el?.offsetWidth) setSide(Math.round(Math.hypot(el.offsetWidth, el.offsetHeight) * 1.32))
  }

  // The figures are tabular, so the width only moves when the count gains or
  // loses a digit; measuring on every tick would force a layout a second.
  useLayoutEffect(measure, [clock.length])

  // Everything else that changes the size — the viewport, and with it the
  // type size — arrives after mount, and the observer's timing is fine then.
  useEffect(() => {
    const el = digits.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const stroke = Math.max(2, side * 0.019)
  const tick = side * 0.05
  const c = side / 2
  const r = c - stroke / 2 - tick - side * 0.02

  return (
    <div
      className="relative grid place-items-center"
      style={side ? { width: side, height: side } : undefined}
    >
      {side > 0 && r > 0 ? (
        <svg aria-hidden className="absolute inset-0" viewBox={`0 0 ${side} ${side}`}>
          <g stroke="currentColor" strokeLinecap="round">
            {Array.from({ length: TICKS }, (_, i) => (
              <line
                key={i}
                x1={c}
                y1={stroke}
                x2={c}
                y2={stroke + tick}
                strokeWidth={i % 3 === 0 ? stroke * 0.9 : stroke * 0.55}
                opacity={i % 3 === 0 ? 0.5 : 0.24}
                transform={`rotate(${(i * 360) / TICKS} ${c} ${c})`}
              />
            ))}
          </g>
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke="rgb(255 255 255 / 0.13)"
            strokeWidth={stroke}
          />
          {/* `pathLength` normalises the circle to 1, so the dash maths is the
              fraction itself. Rotated so the arc starts at twelve. */}
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={stroke}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={1 - elapsed}
            transform={`rotate(-90 ${c} ${c})`}
            className="transition-[stroke-dashoffset] duration-1000 ease-linear"
          />
          {/* The marker rides the head of the arc. Rotating a group is smooth
              and cheap; animating cx/cy is neither. */}
          <g
            className="transition-transform duration-1000 ease-linear"
            style={{ transform: `rotate(${elapsed * 360}deg)`, transformOrigin: 'center' }}
          >
            <circle cx={c} cy={c - r} r={stroke * 1.15} fill="var(--color-accent-bright)" />
          </g>
        </svg>
      ) : null}
      <span ref={digits} className="block text-[0.58em] tracking-[-0.02em]">
        {clock}
      </span>
    </div>
  )
}
