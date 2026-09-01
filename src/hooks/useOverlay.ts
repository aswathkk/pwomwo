import { useEffect, useRef } from 'react'

/**
 * Escape to close, focus trapped inside, focus restored on unmount.
 *
 * The initial focus and the restore-on-unmount run exactly once, on mount.
 * Tying them to the `onClose` identity instead would rebuild the trap on every
 * re-render, which closes an open `<select>` popup and blurs whatever the user
 * is typing into.
 */
export function useOverlay<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null)
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    const container = ref.current
    if (!container) return
    const previous = document.activeElement as HTMLElement | null
    const selector =
      'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
    const focusables = () => [...container.querySelectorAll<HTMLElement>(selector)]

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      const first = items[0]
      const last = items.at(-1)
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    container.addEventListener('keydown', onKey)
    queueMicrotask(() => {
      // Focus the dialog itself rather than its first control: Tab still walks
      // into the content, but nothing is pre-selected, so no control lights up
      // its focus ring (or its tooltip) the instant the overlay opens.
      if (container.contains(document.activeElement)) return
      container.tabIndex = -1
      container.focus({ preventScroll: true })
    })
    return () => {
      container.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
    // Mount-only: `close` is a ref, so the trap never needs rebuilding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return ref
}
