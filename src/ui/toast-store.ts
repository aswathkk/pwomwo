import { createElement } from 'react'
import { toast as sonnerToast } from 'sonner'

export type Tone = 'info' | 'good' | 'warn' | 'bad'

/** The coloured dot that stands in for an icon, one per tone. */
const DOT: Record<Tone, string> = {
  info: 'bg-accent',
  good: 'bg-good',
  warn: 'bg-warn',
  bad: 'bg-bad',
}

const HOLD_MS = 3000

/**
 * Thin adapter over sonner, so non-React code (the store, the sync protocol,
 * the service-worker glue) can raise a toast without knowing a React tree
 * exists. The `<Toaster />` in App renders whatever lands here.
 *
 * Bottom-centre, three seconds, never blocking (PRD UI-11). An actionable
 * toast stays until it is used or dismissed.
 */
export function toast(
  message: string,
  tone: Tone = 'info',
  action?: { label: string; run: () => void },
): void {
  const id = sonnerToast(message, {
    // sonner pauses its own timers while the tab is hidden, which would pile
    // up stale toasts in a background tab; the wall-clock timeout below keeps
    // the old three-second contract (PRD UI-11), so let sonner never expire.
    duration: Infinity,
    icon: createElement('span', {
      'aria-hidden': true,
      className: `h-1.75 w-1.75 shrink-0 rounded-full ${DOT[tone]}`,
    }),
    ...(action ? { action: { label: action.label, onClick: action.run } } : {}),
  })
  if (!action) setTimeout(() => sonnerToast.dismiss(id), HOLD_MS)
}
