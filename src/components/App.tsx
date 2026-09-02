import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { store } from '../store'
import { applyThemeColor } from '../backgrounds'
import type { ThemeName } from '../types'
import { useAppState } from '../hooks/useStore'
import { Scene } from './Scene'
import { TopBar } from './TopBar'
import { TimerStage } from './TimerStage'
import { SettingsModal } from './SettingsModal'
// History pulls in the charting library; keep it out of first paint.
const HistoryPanel = lazy(() => import('./HistoryPanel').then((m) => ({ default: m.HistoryPanel })))
// Pairing pulls in the QR encoder and scanner; keep them out of first paint.
const PairingDialog = lazy(() =>
  import('./PairingDialog').then((m) => ({ default: m.PairingDialog })),
)
import { ConfirmHost } from './ConfirmHost'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { chromeFade, Icons } from './primitives'

export type Overlay = 'none' | 'history' | 'settings' | 'pairing'

/** How long the chrome waits, after the last input, before fading out again. */
const FULLSCREEN_HIDE_MS = 3000
const IDLE_HIDE_MS = 3500
/** A held pointer keeps the controls up, but not forever: a `pointerup` can go
    missing (capture, a cancelled touch, a tab switch mid-press) and without a
    backstop the chrome would stay on screen for the rest of the session. */
const HELD_HIDE_MS = 8000

function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen()
  else void document.documentElement.requestFullscreen().catch(() => undefined)
}

export function App() {
  const state = useAppState()
  const [overlay, setOverlay] = useState<Overlay>('none')
  const [chromeHidden, setChromeHidden] = useState(false)
  const [settingsTab, setSettingsTab] = useState('timers')
  // Set while the settings dialog has a background selected that has not been
  // saved yet, so the choice is previewed full-screen instead of in a swatch.
  const [previewTheme, setPreviewTheme] = useState<ThemeName | null>(null)

  const close = useCallback(() => setOverlay('none'), [])
  const openSettingsAt = useCallback((tab: string) => {
    setSettingsTab(tab)
    setOverlay('settings')
  }, [])

  // Chrome fades in fullscreen, and in zen view while a timer runs (PRD UI-6/13).
  useEffect(() => {
    let timer: number | undefined

    // Fullscreen is read per event rather than captured: it changes without a
    // React render, and a stale value here would strand the chrome on screen.
    const armed = () =>
      overlay === 'none' &&
      (document.fullscreenElement !== null ||
        (store.settings.idleHideControls && state.doc.status === 'running'))

    const hideIn = (ms: number) => {
      window.clearTimeout(timer)
      if (armed()) timer = window.setTimeout(() => setChromeHidden(true), ms)
    }
    const reveal = (ms: number) => {
      setChromeHidden(false)
      hideIn(ms)
    }

    const idleDelay = () =>
      document.fullscreenElement !== null ? FULLSCREEN_HIDE_MS : IDLE_HIDE_MS
    const onMove = () => reveal(idleDelay())
    // Held down: the controls stay put for as long as the finger or button is,
    // up to the backstop. Letting go starts the same idle countdown a resting
    // cursor gets, which is long enough to still aim at something.
    const onPress = () => reveal(HELD_HIDE_MS)
    const onRelease = () => reveal(idleDelay())

    reveal(idleDelay())
    const passive = { passive: true } as const
    window.addEventListener('pointermove', onMove, passive)
    window.addEventListener('keydown', onMove, passive)
    window.addEventListener('pointerdown', onPress, passive)
    window.addEventListener('pointerup', onRelease, passive)
    window.addEventListener('pointercancel', onRelease, passive)
    document.addEventListener('fullscreenchange', onMove)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('keydown', onMove)
      window.removeEventListener('pointerdown', onPress)
      window.removeEventListener('pointerup', onRelease)
      window.removeEventListener('pointercancel', onRelease)
      document.removeEventListener('fullscreenchange', onMove)
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
  const theme = previewTheme ?? settings.theme

  // The one writer of the background's DOM hooks: `body[data-theme]` (which
  // the OLED surface overrides key off) and the browser UI colour. Held back
  // until the saved settings land, for the same reason the scene is.
  useEffect(() => {
    if (!state.ready) return
    document.body.dataset['theme'] = theme
    applyThemeColor(theme)
  }, [theme, state.ready])

  const elapsed = doc.durationMs > 0 ? 1 - remainingMs / doc.durationMs : 0
  const fade = chromeFade(chromeHidden)

  return (
    <TooltipProvider>
      {/* The saved background arrives with the rest of the settings, out of
          IndexedDB, so there is nothing truthful to paint before that: the
          default sky ahead of it is a wrong-state flash like any other, and on
          the two black backgrounds it is a screen of light where the whole
          point was to have none. Until then the page is `--color-ground`. */}
      {state.ready ? <Scene theme={theme} isBreak={doc.phase !== 'focus'} /> : null}

      {/* `store.init()` reads the persisted timer from IndexedDB. Painting the
          default 25:00 first and snapping to the real value a moment later is a
          visible wrong-state flash, so the page stays bare until it lands. */}
      <div
        className={`fixed inset-0 flex flex-col transition-opacity duration-300 ${
          state.ready ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className={fade}>
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
          chromeHidden={chromeHidden}
          onOpenSettings={() => openSettingsAt('timers')}
        />

        <div
          className={`flex items-end justify-end pr-[calc(1.125rem+var(--safe-r))] pb-[calc(1rem+var(--safe-b))] pl-[calc(1.125rem+var(--safe-l))] sm:pr-[calc(2rem+var(--safe-r))] sm:pb-[calc(1.375rem+var(--safe-b))] sm:pl-[calc(2rem+var(--safe-l))] landscape-short:pb-[calc(0.625rem+var(--safe-b))] ${fade}`}
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

        <div aria-hidden className={`fixed inset-x-0 bottom-0 h-[3px] bg-white/10 ${fade}`}>
          <div
            className="h-full bg-accent shadow-[0_0_10px_rgb(255_160_110/0.8)] transition-[width] duration-400 ease-linear"
            style={{ width: `${Math.max(0, Math.min(1, elapsed)) * 100}%` }}
          />
        </div>
      </div>

      {overlay === 'history' ? (
        <Suspense fallback={null}>
          <HistoryPanel onClose={close} onOpenSettings={openSettingsAt} />
        </Suspense>
      ) : null}
      {overlay === 'settings' ? (
        <SettingsModal
          initialTab={settingsTab}
          onClose={close}
          onPair={() => setOverlay('pairing')}
          onPreviewTheme={setPreviewTheme}
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
