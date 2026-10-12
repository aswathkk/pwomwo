import { memo, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from 'react'
import { ArrowSquareOutIcon, DotsSixIcon, MusicNotesIcon } from '@phosphor-icons/react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Icons, ICON_WEIGHT } from './primitives'
import { get, put } from '../db'
import { parseYouTubeLink, type YouTubeSource } from '../youtube'
import { loadYouTubeAPI, youtubeErrorMessage, type YouTubePlayer } from '../pwa/youtube-player'

const SAVED_LINK = 'youtube-music-v1'

function useFloatingPanel() {
  const panel = useRef<HTMLElement>(null)
  const drag = useRef<{ id: number; offsetX: number; offsetY: number } | null>(null)

  const moveTo = (x: number, y: number) => {
    const element = panel.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    const left = Math.max(12, Math.min(x, document.documentElement.clientWidth - rect.width - 12))
    const top = Math.max(12, Math.min(y, window.innerHeight - rect.height - 12))
    Object.assign(element.style, { left: `${left}px`, top: `${top}px`, right: 'auto', bottom: 'auto' })
  }

  useLayoutEffect(() => {
    const element = panel.current
    if (!element) return
    const keepOnScreen = () => {
      const rect = element.getBoundingClientRect()
      moveTo(rect.left, rect.top)
    }
    keepOnScreen()
    // A loaded player or an error message can also change the panel's height.
    const observer = new ResizeObserver(keepOnScreen)
    observer.observe(element)
    window.addEventListener('resize', keepOnScreen)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', keepOnScreen)
    }
  }, [])

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || event.button !== 0 || !panel.current) return
    const rect = panel.current.getBoundingClientRect()
    drag.current = { id: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top }
    event.currentTarget.setPointerCapture(event.pointerId)
    panel.current.dataset['dragging'] = 'true'
  }
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const active = drag.current
    if (!active || active.id !== event.pointerId) return
    moveTo(event.clientX - active.offsetX, event.clientY - active.offsetY)
  }
  const stopDragging = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag.current?.id !== event.pointerId) return
    drag.current = null
    if (panel.current) delete panel.current.dataset['dragging']
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
    if (!direction || !panel.current) return
    event.preventDefault()
    const rect = panel.current.getBoundingClientRect()
    const step = event.shiftKey ? 40 : 10
    moveTo(rect.left + direction[0]! * step, rect.top + direction[1]! * step)
  }

  return { panel, handleProps: { onPointerDown, onPointerMove, onPointerUp: stopDragging, onPointerCancel: stopDragging, onLostPointerCapture: stopDragging, onKeyDown } }
}

function Player({ source, suspended }: { source: YouTubeSource; suspended: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const player = useRef<YouTubePlayer | null>(null)
  const blocked = useRef(suspended)
  const [status, setStatus] = useState('Loading YouTube…')
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    blocked.current = suspended
    if (suspended) player.current?.pauseVideo()
  }, [suspended])

  useEffect(() => {
    const container = host.current
    if (!container) return
    let disposed = false
    let visible = true
    let ready = false
    let instance: YouTubePlayer | null = null
    const mustPause = () => blocked.current || document.hidden || !visible
    const pauseIfHidden = () => {
      if (ready && mustPause()) instance?.pauseVideo()
    }
    const observer = new IntersectionObserver(([entry]) => {
      visible = (entry?.intersectionRatio ?? 0) >= 0.5
      pauseIfHidden()
    }, { threshold: [0, 0.5] })
    observer.observe(container)
    document.addEventListener('visibilitychange', pauseIfHidden)
    setStatus('Loading YouTube…')
    setFailed(false)

    void loadYouTubeAPI().then((api) => {
      if (disposed) return
      // YouTube replaces its target. Give it a child React does not own.
      const target = document.createElement('div')
      container.replaceChildren(target)
      instance = new api.Player(target, {
        width: '100%',
        height: '100%',
        videoId: source.videoId,
        playerVars: {
          origin: window.location.origin,
          playsinline: 1,
          autoplay: 0,
          ...(source.playlistId ? { listType: 'playlist', list: source.playlistId } : {}),
        },
        events: {
          onReady: (event) => {
            if (disposed) return
            ready = true
            player.current = event.target
            event.target.getIframe().title = 'YouTube music player'
            setStatus('Press play in the YouTube player. Music pauses when you pause the timer.')
            pauseIfHidden()
          },
          onError: (event) => {
            if (disposed) return
            setFailed(true)
            setStatus(youtubeErrorMessage(event.data))
          },
          onStateChange: (event) => {
            if (disposed) return
            if (event.data === 1) pauseIfHidden()
          },
        },
      })
      instance.getIframe().title = 'YouTube music player'
      instance.getIframe().referrerPolicy = 'strict-origin-when-cross-origin'
    }).catch(() => {
      if (disposed) return
      setFailed(true)
      setStatus('YouTube could not load. Check your connection and try again.')
    })

    return () => {
      disposed = true
      observer.disconnect()
      document.removeEventListener('visibilitychange', pauseIfHidden)
      player.current = null
      instance?.destroy()
      container.replaceChildren()
    }
  }, [source.url, attempt])

  return (
    <>
      <div ref={host} className="music-player" />
      <p role="status" className={`music-status ${failed ? 'text-bad' : 'text-ink-tertiary'}`}>
        {status}
      </p>
      {failed ? (
        <Button variant="secondary" size="sm" onClick={() => setAttempt((value) => value + 1)}>
          Retry player
        </Button>
      ) : null}
      <a href={source.url} target="_blank" rel="noopener" className="music-external">
        Open on YouTube <ArrowSquareOutIcon size={14} weight={ICON_WEIGHT} aria-hidden />
      </a>
    </>
  )
}

/** Keep the embed independent of the store's per-second countdown updates. */
export const MusicPanel = memo(function MusicPanel({ onClose, suspended }: {
  onClose: () => void
  suspended: boolean
}) {
  const [draft, setDraft] = useState('')
  const [source, setSource] = useState<YouTubeSource | null>(null)
  const [error, setError] = useState('')
  const [online, setOnline] = useState(() => navigator.onLine)
  const edited = useRef(false)
  const { panel, handleProps } = useFloatingPanel()

  useEffect(() => {
    let disposed = false
    void get<string>('settings', SAVED_LINK).then((saved) => {
      if (disposed || edited.current || typeof saved !== 'string') return
      const parsed = parseYouTubeLink(saved)
      if (parsed) {
        setDraft(parsed.url)
        setSource(parsed)
      }
    }).catch(() => { /* Music still works if local storage is unavailable. */ })
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      disposed = true
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  const load = (event: FormEvent) => {
    event.preventDefault()
    edited.current = true
    const parsed = parseYouTubeLink(draft)
    if (!parsed) {
      setError('Paste a YouTube video or playlist link, including links from YouTube Music.')
      return
    }
    setError('')
    setSource(parsed)
    void put('settings', parsed.url, SAVED_LINK).catch(() => {
      setError('Music is loaded, but this browser could not save the link for next time.')
    })
  }

  return (
    <aside ref={panel} id="music-panel" aria-labelledby="music-heading" className="music-panel" data-timer-shortcuts="off">
      <div className="flex items-center justify-between gap-3">
        <h2 id="music-heading" aria-label="Music for focus" className="min-w-0 flex-1 text-[15px] font-semibold">
          <button type="button" className="music-drag-handle" aria-label="Move Music for focus" aria-describedby="music-move-hint" title="Drag to move" {...handleProps}>
            <DotsSixIcon size={18} weight={ICON_WEIGHT} className="text-ink-tertiary" aria-hidden />
            <MusicNotesIcon size={19} weight={ICON_WEIGHT} className="text-accent" aria-hidden />
            Music for focus
          </button>
        </h2>
        <Button variant="soft" size="icon" aria-label="Close music and stop playback" onClick={onClose}>
          {Icons.close}
        </Button>
      </div>
      <p id="music-move-hint" className="sr-only">Drag to move, or use arrow keys. Hold Shift for larger steps.</p>

      <div className="music-panel-content">
        <form onSubmit={load} className="mt-4">
          <label htmlFor="youtube-link" className="mb-2 block text-[12px] font-medium text-ink-secondary">
            YouTube video or playlist link
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="youtube-link"
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste a YouTube link"
              value={draft}
              aria-invalid={!!error}
              aria-describedby={error ? 'youtube-link-error' : 'youtube-link-hint'}
              onChange={(event) => {
                edited.current = true
                setDraft(event.target.value)
                setError('')
              }}
            />
            <Button type="submit" size="sm" disabled={!draft.trim()}>Load music</Button>
          </div>
          {error ? <p id="youtube-link-error" role="alert" className="mt-2 text-[12px] text-bad">{error}</p> : null}
          <p id="youtube-link-hint" className="mt-2 text-[11px] leading-relaxed text-ink-tertiary">
            Streams from YouTube. Needs internet and may include ads.
          </p>
        </form>

        <div className="mt-4">
          {!online ? (
            <div className="music-empty" role="status">
              <MusicNotesIcon size={28} weight={ICON_WEIGHT} aria-hidden />
              <p>You’re offline.</p>
              <span>Reconnect to play YouTube music. Your timer still works.</span>
            </div>
          ) : source ? (
            <Player key={source.url} source={source} suspended={suspended} />
          ) : (
            <div className="music-empty">
              <MusicNotesIcon size={28} weight={ICON_WEIGHT} aria-hidden />
              <p>A soundtrack for your session.</p>
              <span>Add a favorite video or playlist, then press play.</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
})
