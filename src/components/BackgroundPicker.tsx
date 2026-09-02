import { useRef, type KeyboardEvent } from 'react'
import { CheckIcon } from '@phosphor-icons/react'
import { useReducedMotion } from 'motion/react'
import { BACKGROUNDS, backgroundDef } from '../backgrounds'
import type { ThemeName } from '../types'
import { cls } from './primitives'

/**
 * Backgrounds as swatches rather than a dropdown: the choice is entirely
 * visual, and four words in a list say nothing about what you are picking.
 * The tile is a still of the real layer, and choosing one paints it behind the
 * dialog straight away, so the preview is the background itself.
 */
export function BackgroundPicker({
  value,
  onChange,
}: {
  value: ThemeName
  onChange: (next: ThemeName) => void
}) {
  const tiles = useRef<(HTMLButtonElement | null)[]>([])
  const reduceMotion = useReducedMotion()
  const selected = backgroundDef(value)

  // A radio group moves the selection with the arrow keys, not just the focus,
  // and holds a single tab stop. Anything less and a keyboard lands on four
  // separate buttons that happen to look related.
  const onKeyDown = (event: KeyboardEvent) => {
    const index = BACKGROUNDS.findIndex((b) => b.id === value)
    const last = BACKGROUNDS.length - 1
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
    const def = BACKGROUNDS[next]
    if (!def) return
    onChange(def.id)
    tiles.current[next]?.focus()
  }

  return (
    <div className="px-0.5 py-1">
      <div className="text-[14px] font-medium">Background</div>
      <p className={`${cls.hint} mt-1`}>
        Minimal dark is used automatically when you ask to save data. Your choice stays on this
        device; settings do not sync.
      </p>

      <div
        role="radiogroup"
        aria-label="Background"
        onKeyDown={onKeyDown}
        className="mt-3.5 grid grid-cols-2 gap-3 sm:grid-cols-3"
      >
        {BACKGROUNDS.map((def, i) => {
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
                className="relative block h-16 w-full sm:h-18"
                style={{ background: def.swatch }}
              >
                {def.animated ? (
                  <span className="absolute top-1.5 left-1.5 rounded bg-black/55 px-1.5 py-px text-[10px] font-medium text-white/90">
                    Animated
                  </span>
                ) : null}
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
        {selected?.animated && reduceMotion
          ? ' Your system asks for reduced motion, so it will hold still.'
          : ''}
      </p>
    </div>
  )
}
