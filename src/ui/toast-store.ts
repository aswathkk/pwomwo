export type Tone = 'info' | 'good' | 'warn' | 'bad'

export interface ToastItem {
  id: number
  message: string
  tone: Tone
  action?: { label: string; run: () => void }
}

const HOLD_MS = 3000

let items: ToastItem[] = []
let nextId = 1
const listeners = new Set<() => void>()

function emit(): void {
  for (const fn of listeners) fn()
}

export function subscribeToasts(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getToasts(): ToastItem[] {
  return items
}

export function dismissToast(id: number): void {
  items = items.filter((t) => t.id !== id)
  emit()
}

/** Bottom-centre, three seconds, never blocking (PRD UI-11). */
export function toast(
  message: string,
  tone: Tone = 'info',
  action?: { label: string; run: () => void },
): void {
  const id = nextId++
  items = [...items, { id, message, tone, ...(action ? { action } : {}) }]
  emit()
  // An actionable toast stays until it is used or dismissed.
  if (!action) setTimeout(() => dismissToast(id), HOLD_MS)
}
