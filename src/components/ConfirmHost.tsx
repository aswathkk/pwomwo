import { useState } from 'react'
import { resolveConfirm } from '../ui/dialog-store'
import { usePendingConfirm } from '../hooks/useStore'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Checkbox } from '@/components/ui/checkbox'

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

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        // Escape or an outside click; a second resolve after a button click is
        // a no-op because the store has already cleared the pending question.
        if (!open) resolveConfirm({ confirmed: false, checked: false })
      }}
    >
      {/* Without a body there is no description to point at. */}
      <AlertDialogContent {...(body ? {} : { 'aria-describedby': undefined })}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {body ? <AlertDialogDescription>{body}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        {checkbox ? (
          <label className="coarse:py-2.5 flex items-center gap-2.5 py-1 text-[12.5px] text-ink-secondary">
            <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} />
            {checkbox}
          </label>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => resolveConfirm({ confirmed: false, checked: false })}>
            {cancelLabel ?? 'Cancel'}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={danger ? 'destructive' : 'default'}
            onClick={() => resolveConfirm({ confirmed: true, checked })}
          >
            {confirmLabel ?? 'Confirm'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
