import { Toaster as Sonner, type ToasterProps } from 'sonner'

/**
 * Bottom-centre, pill-shaped, above the safe area — the shape the hand-rolled
 * toast stack had (PRD UI-11). The app is dark-only, so the theme is fixed
 * rather than read from `next-themes`. Tone dots are painted by the adapter in
 * `src/ui/toast-store.ts`; sonner's own icons are disabled.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      position="bottom-center"
      visibleToasts={4}
      gap={10}
      // Back onto the layer ladder: toasts sit at 80, below the confirm
      // dialog (90), instead of sonner's default 999999999.
      style={{ zIndex: 80 }}
      offset={{ bottom: 'calc(1.75rem + var(--safe-b))' }}
      mobileOffset={{ bottom: 'calc(1.75rem + var(--safe-b))' }}
      icons={{ success: null, info: null, warning: null, error: null }}
      toastOptions={{
        // Lifetimes are wall-clock timers in src/ui/toast-store.ts, not
        // sonner durations (sonner pauses its timers in hidden tabs).
        unstyled: true,
        classNames: {
          toast:
            'animate-toast-in pointer-events-auto flex w-max max-w-[min(92vw,480px)] items-center gap-2.5 rounded-full border border-white/12 bg-toast px-5 py-2.5 text-[13.5px] font-medium text-white shadow-[0_8px_28px_rgb(0_0_0/0.5)]',
          title: 'font-medium',
          actionButton: 'ml-1 shrink-0 text-[13px] font-semibold text-accent',
        },
      }}
      className="flex flex-col items-center"
      {...props}
    />
  )
}

export { Toaster }
