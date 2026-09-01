import { dismissToast } from '../ui/toast-store'
import { useToasts } from '../hooks/useStore'

const TONE_DOT = {
  info: 'bg-accent',
  good: 'bg-good',
  warn: 'bg-warn',
  bad: 'bg-bad',
} as const

export function Toasts() {
  const toasts = useToasts()
  if (toasts.length === 0) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-[calc(1.75rem+var(--safe-b))] left-1/2 z-80 flex -translate-x-1/2 flex-col items-center gap-2.5"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="animate-toast-in pointer-events-auto flex max-w-[min(92vw,480px)] items-center gap-2.5 rounded-full border border-white/12 bg-toast px-5 py-2.5 text-[13.5px] font-medium shadow-[0_8px_28px_rgb(0_0_0/0.5)]"
        >
          <span aria-hidden className={`h-1.75 w-1.75 shrink-0 rounded-full ${TONE_DOT[t.tone]}`} />
          <span>{t.message}</span>
          {t.action ? (
            <button
              type="button"
              className="ml-1 text-[13px] font-semibold text-accent"
              onClick={() => {
                dismissToast(t.id)
                t.action?.run()
              }}
            >
              {t.action.label}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  )
}
