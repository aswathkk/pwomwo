import { useCallback, useState } from 'react'
import { resolveConfirm } from '../ui/dialog-store'
import { usePendingConfirm } from '../hooks/useStore'
import { useOverlay } from '../hooks/useOverlay'
import { cls } from './primitives'

export function ConfirmHost() {
  const pending = usePendingConfirm()
  if (!pending) return null
  // Keyed so a replaced question resets its checkbox rather than inheriting one.
  return <ConfirmDialog key={pending.id} {...pending} />
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger,
  checkbox,
}: {
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  checkbox?: string
}) {
  const [checked, setChecked] = useState(false)
  const cancel = useCallback(() => resolveConfirm({ confirmed: false, checked: false }), [])
  const ref = useOverlay<HTMLDivElement>(cancel)

  return (
    <div
      className="fixed inset-0 z-90 flex items-center justify-center bg-scrim backdrop-blur-[2px] p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cancel()
      }}
    >
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="flex w-[min(440px,100%)] flex-col gap-3.5 rounded-3xl border border-white/9 bg-modal p-6 shadow-[0_30px_80px_rgb(0_0_0/0.6)]"
      >
        <h2 className="text-[16px] font-semibold">{title}</h2>
        {body ? <p className="text-[13px] leading-relaxed text-ink-muted">{body}</p> : null}
        {checkbox ? (
          <label className="flex items-center gap-2.5 py-1 coarse:py-2.5 text-[12.5px] text-ink-secondary">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="h-4 w-4 coarse:h-5.5 coarse:w-5.5 accent-accent"
            />
            {checkbox}
          </label>
        ) : null}
        <div className="mt-1 flex justify-end gap-2.5">
          <button type="button" className={cls.button} onClick={cancel}>
            {cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            className={danger ? cls.buttonDanger : cls.buttonPrimary}
            onClick={() => resolveConfirm({ confirmed: true, checked })}
          >
            {confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
