import { useEffect, useState } from 'react'
import { CheckIcon } from '@phosphor-icons/react'
import { useReducedMotion } from 'motion/react'
import { CLOCK_STYLES, clockStyleDef } from '../clocks'
import type { ClockStyleName } from '../types'
import { formatClock } from '../util'
import { Clock } from './Clock'
import { cls, useRadioTiles } from './primitives'

/** A twenty-second stretch of a 25-minute phase, so the sample runs its
    digits through a carry (12:30 → 12:29) and the dial sits about half round. */
const SAMPLE_TOTAL_MS = 25 * 60_000
const SAMPLE_START_MS = (12 * 60 + 34) * 1000
const SAMPLE_TICKS = 20

/**
 * Clock faces as tiles, and each tile counts down: half of what separates
 * these faces is what they do when a digit changes, so a still of one says
 * only half of it. The tile runs the real face at a small type size rather
 * than a picture of it, so it cannot drift from what the timer will do.
 *
 * The tile sits on its own dusk wash rather than the dialog's surface: two of
 * the faces are dark objects, and on a near-black panel they were invisible.
 */
const TILE_WASH = 'linear-gradient(170deg, #2f2747 0%, #241d38 55%, #46344a 100%)'

export function ClockStylePicker({
  value,
  onChange,
}: {
  value: ClockStyleName
  onChange: (next: ClockStyleName) => void
}) {
  const reduceMotion = useReducedMotion()
  const selected = clockStyleDef(value)
  const { tiles, onKeyDown } = useRadioTiles(
    CLOCK_STYLES.map((c) => c.id),
    value,
    onChange,
  )

  // One interval, shared by every tile, and only while the dialog is open.
  // Nothing moves under reduced motion, so nothing needs to tick either.
  const [ticks, setTicks] = useState(0)
  useEffect(() => {
    if (reduceMotion) return
    const id = setInterval(() => setTicks((n) => (n + 1) % SAMPLE_TICKS), 1000)
    return () => clearInterval(id)
  }, [reduceMotion])

  const remainingMs = SAMPLE_START_MS - ticks * 1000
  const sample = formatClock(remainingMs)

  return (
    <div className="px-0.5 py-1">
      <div className="text-[14px] font-medium">Clock face</div>
      <p className={`${cls.hint} mt-1`}>
        How the countdown itself is drawn. Like the background, this stays on this device.
      </p>

      <div
        role="radiogroup"
        aria-label="Clock face"
        onKeyDown={onKeyDown}
        className="mt-3.5 grid grid-cols-2 gap-3 sm:grid-cols-3"
      >
        {CLOCK_STYLES.map((def, i) => {
          const isOn = def.id === value
          return (
            <button
              key={def.id}
              ref={(el) => {
                tiles.current[i] = el
              }}
              type="button"
              role="radio"
              aria-checked={isOn}
              aria-label={def.label}
              tabIndex={isOn ? 0 : -1}
              onClick={() => onChange(def.id)}
              className={`overflow-hidden rounded-xl border text-left transition-colors ${
                isOn
                  ? 'border-accent/60 ring-2 ring-accent'
                  : 'border-white/10 hover:border-white/30'
              }`}
            >
              <span
                aria-hidden
                className="relative grid h-18 w-full place-items-center overflow-hidden sm:h-20"
                style={{ background: TILE_WASH }}
              >
                <span className="text-[21px]">
                  <Clock
                    style={def.id}
                    clock={sample}
                    remainingMs={remainingMs}
                    durationMs={SAMPLE_TOTAL_MS}
                    running
                  />
                </span>
                {/* The ring carries the same message, but colour alone should
                    never be the only thing that does. */}
                {isOn ? (
                  <span className="absolute right-1.5 bottom-1.5 grid h-5 w-5 place-items-center rounded-full bg-accent text-ink">
                    <CheckIcon size={12} weight="bold" />
                  </span>
                ) : null}
              </span>
              <span className="block px-2.5 py-2 text-[12px] font-medium">{def.label}</span>
            </button>
          )
        })}
      </div>

      <p className={`${cls.hint} mt-2.5`} aria-live="polite">
        {selected?.hint}
        {reduceMotion && value !== 'plain'
          ? ' Your system asks for reduced motion, so this face changes without moving.'
          : ''}
      </p>
    </div>
  )
}
