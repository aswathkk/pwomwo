export interface ConfirmOptions {
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  /** Renders an extra opt-in checkbox; its value comes back in the result. */
  checkbox?: string
}

export interface ConfirmResult {
  confirmed: boolean
  checked: boolean
}

export interface PendingConfirm extends ConfirmOptions {
  id: number
  resolve: (result: ConfirmResult) => void
}

let pending: PendingConfirm | null = null
let nextId = 1
const listeners = new Set<() => void>()

function emit(): void {
  for (const fn of listeners) fn()
}

export function subscribeDialog(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getPendingConfirm(): PendingConfirm | null {
  return pending
}

export function resolveConfirm(result: ConfirmResult): void {
  const current = pending
  pending = null
  emit()
  current?.resolve(result)
}

/**
 * Promise-based so the timer logic can ask a question without knowing that a
 * React tree exists; `ConfirmHost` renders whatever is pending.
 */
export function confirmDialog(options: ConfirmOptions): Promise<ConfirmResult> {
  // A second question replaces the first rather than stacking dialogs.
  pending?.resolve({ confirmed: false, checked: false })
  return new Promise<ConfirmResult>((resolve) => {
    pending = { ...options, id: nextId++, resolve }
    emit()
  })
}
