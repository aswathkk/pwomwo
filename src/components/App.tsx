import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { store } from '../store'
import { useAppState } from '../hooks/useStore'
import { Scene } from './Scene'
import { TopBar } from './TopBar'
import { TimerStage } from './TimerStage'
import { HistoryPanel } from './HistoryPanel'
import { SettingsModal } from './SettingsModal'
// Pairing pulls in the QR encoder and scanner; keep them out of first paint.
const PairingDialog = lazy(() =>
  import('./PairingDialog').then((m) => ({ default: m.PairingDialog })),
)
import { ConfirmHost } from './ConfirmHost'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Icons } from './primitives'

export type Overlay = 'none' | 'history' | 'settings' | 'pairing'

const FULLSCREEN_HIDE_MS = 3000
const IDLE_HIDE_MS = 10_000

function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen()
  else void document.documentElement.requestFullscreen().catch(() => undefined)
}

export function App() {
  const state = useAppState()
  const [overlay, setOverlay] = useState<Overlay>('none')
  const [chromeHidden, setChromeHidden] = useState(false)
  const [settingsTab, setSettingsTab] = useState('timers')

  const close = useCallback(() => setOverlay('none'), [])
  const openSettingsAt = useCallback((tab: string) => {
    setSettingsTab(tab)
    setOverlay('settings')
  }, [])

  // Chrome fades in fullscreen, and optionally while a timer runs (PRD UI-6/13).
  useEffect(() => {
    let timer: number | undefined
    const schedule = () => {
      window.clearTimeout(timer)
      setChromeHidden(false)
      const fullscreen = document.fullscreenElement !== null
      const idleHide = store.settings.idleHideControls && state.doc.status === 'running'
      if (overlay !== 'none' || (!fullscreen && !idleHide)) return
      timer = window.setTimeout(
        () => setChromeHidden(true),
        fullscreen ? FULLSCREEN_HIDE_MS : IDLE_HIDE_MS,
      )
    }
    schedule()
    const events = ['pointermove', 'pointerdown', 'keydown', 'touchstart'] as const
    for (const e of events) window.addEventListener(e, schedule, { passive: true })
    document.addEventListener('fullscreenchange', schedule)
    return () => {
      window.clearTimeout(timer)
      for (const e of events) window.removeEventListener(e, schedule)
      document.removeEventListener('fullscreenchange', schedule)
    }
  }, [overlay, state.doc.status, state.settings.idleHideControls])

  // Desktop shortcuts, ignored in fields and while an overlay is open (TMR-10).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable || /^(input|select|textarea)$/i.test(target?.tagName ?? '')) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (overlay !== 'none') return

      switch (event.key) {
        case ' ':
          event.preventDefault()
          store.toggle()
          break
        case 'r':
        case 'R':
          void store.resetTimer()
          break
        case '1':
          void store.selectPhase('focus')
          break
        case '2':
          void store.selectPhase('shortBreak')
          break
        case '3':
          void store.selectPhase('longBreak')
          break
        case 'n':
        case 'N':
          store.skipPhase()
          break
        case 'f':
        case 'F':
          toggleFullscreen()
          break
        case ',':
          openSettingsAt('timers')
          break
        case 'h':
        case 'H':
          setOverlay('history')
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [overlay, openSettingsAt])

  const { doc, settings, remainingMs } = state
  const elapsed = doc.durationMs > 0 ? 1 - remainingMs / doc.durationMs : 0
  const fade = chromeHidden ? 'pointer-events-none opacity-0' : 'opacity-100'

  return (
    <TooltipProvider>
      <Scene theme={settings.theme} isBreak={doc.phase !== 'focus'} />

      {/* `store.init()` reads the persisted timer from IndexedDB. Painting the
          default 25:00 first and snapping to the real value a moment later is a
          visible wrong-state flash, so the scene shows alone until it lands. */}
      <div
        className={`fixed inset-0 flex flex-col transition-opacity duration-300 ${
          state.ready ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className={`transition-opacity duration-300 ${fade}`}>
          <TopBar
            peers={state.peers}
            chromeHidden={chromeHidden}
            onOpenHistory={() => setOverlay('history')}
            onOpenPairing={() => setOverlay('pairing')}
          />
        </div>

        <TimerStage
          doc={doc}
          settings={settings}
          remainingMs={remainingMs}
          announcement={store.announcement}
          onOpenSettings={() => openSettingsAt('timers')}
        />

        <div
          className={`flex items-end justify-end px-4.5 pb-[calc(1rem+var(--safe-b))] transition-opacity duration-300 sm:px-8 sm:pb-[calc(1.375rem+var(--safe-b))] ${fade}`}
        >
          <Button
            variant="ghost"
            size="icon-xl"
            className="rounded-lg border-none"
            aria-label="Toggle fullscreen"
            title="Fullscreen"
            onClick={toggleFullscreen}
          >
            {Icons.fullscreen}
          </Button>
        </div>

        <div aria-hidden className="fixed inset-x-0 bottom-0 h-[3px] bg-white/10">
          <div
            className="h-full bg-accent shadow-[0_0_10px_rgb(255_160_110/0.8)] transition-[width] duration-400 ease-linear"
            style={{ width: `${Math.max(0, Math.min(1, elapsed)) * 100}%` }}
          />
        </div>
      </div>

      {overlay === 'history' ? (
        <HistoryPanel onClose={close} onOpenSettings={openSettingsAt} />
      ) : null}
      {overlay === 'settings' ? (
        <SettingsModal
          initialTab={settingsTab}
          onClose={close}
          onPair={() => setOverlay('pairing')}
        />
      ) : null}
      {overlay === 'pairing' ? (
        <Suspense fallback={null}>
          <PairingDialog onClose={close} />
        </Suspense>
      ) : null}

      <Toaster />
      <ConfirmHost />
    </TooltipProvider>
  )
}
