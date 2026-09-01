import { useCallback, useEffect, useRef, useState } from 'react'
import { store } from '../store'
import { useAppState } from '../hooks/useStore'
import { useOverlay } from '../hooks/useOverlay'
import { renderQr, scanQr, type Scanner } from '../sync/qr'
import { peekRole } from '../sync/envelope'
import { cls, Dot, Spinner, Icons } from './primitives'

type Mode = 'choose' | 'offering' | 'scanning' | 'answering'

/**
 * The whole handshake, in the order the user physically performs it: this
 * device shows a code, the other scans it and shows an answer, this device
 * scans that back. There is no server to rendezvous through, so possession of
 * the QR is the authorisation (PRD §4.5.2).
 */
export function PairingDialog({ onClose }: { onClose: () => void }) {
  const state = useAppState()
  const ref = useOverlay<HTMLDivElement>(onClose)
  const [mode, setMode] = useState<Mode>('choose')
  const [code, setCode] = useState('')
  const [pasted, setPasted] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const qrCanvas = useRef<HTMLCanvasElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const scanner = useRef<Scanner | null>(null)

  const connected = state.peers.some((p) => p.state === 'connected')

  useEffect(() => () => scanner.current?.stop(), [])

  useEffect(() => {
    if (!code || !qrCanvas.current) return
    void renderQr(qrCanvas.current, code, 260)
  }, [code, mode])

  const startOffer = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      setMode('offering')
      setCode(await (store.sync?.createOffer() ?? Promise.reject(new Error('not ready'))))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start pairing.')
      setMode('choose')
    } finally {
      setBusy(false)
    }
  }, [])

  const consume = useCallback(async (raw: string) => {
    setBusy(true)
    setError(null)
    try {
      const sync = store.sync
      if (!sync) throw new Error('not ready')
      // The code itself says which half of the handshake it is; guessing from
      // the UI mode gets it wrong the moment someone pastes instead of scans.
      if ((await peekRole(raw)) === 'offer') {
        const answer = await sync.acceptOfferCode(raw)
        scanner.current?.stop()
        setCode(answer)
        setMode('answering')
      } else {
        await sync.acceptAnswerCode(raw)
        scanner.current?.stop()
        store.notify('Pairing completed', 'good')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code could not be read.')
    } finally {
      setBusy(false)
      setPasted('')
    }
  }, [])

  const startScan = useCallback(async () => {
    setMode('scanning')
    setError(null)
    // The camera is only requested here, because the user tapped Scan.
    queueMicrotask(async () => {
      if (!video.current) return
      scanner.current = await scanQr(
        video.current,
        (text) => void consume(text),
        (message) => setError(message),
      )
    })
  }, [consume])

  return (
    <div
      className="fixed inset-0 z-70 flex items-end justify-center bg-scrim backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Pair a device"
        className="scroll-region flex max-h-[92dvh] w-full flex-col gap-6 overflow-y-auto rounded-t-3xl border border-white/9 bg-sheet px-4.5 pt-6 pb-[calc(1.5rem+var(--safe-b))] shadow-[0_30px_80px_rgb(0_0_0/0.6)] sm:max-h-[min(680px,calc(100dvh-2rem))] sm:w-260 sm:rounded-3xl sm:px-11 sm:py-9"
      >
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[19px] font-semibold">Pair a device</h2>
          <p className="text-[12px] text-ink-muted">
            No account, no server, end to end encrypted. Works on the same Wi-Fi with the internet off.
          </p>
          <button
            type="button"
            className={`${cls.closeButton} sm:hidden`}
            aria-label="Close pairing"
            onClick={onClose}
          >
            {Icons.close}
          </button>
        </header>

        {error ? (
          <p role="alert" className="rounded-lg border border-bad/40 bg-bad/8 px-3.5 py-2.5 text-[12.5px] text-bad">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-6 lg:flex-row">
          <Column step="STEP 1, ON THIS DEVICE" lead="Show a code for your other device to scan">
            {mode === 'offering' || mode === 'answering' ? (
              <>
                <div className="self-center rounded-xl bg-white p-3">
                  <canvas ref={qrCanvas} width={260} height={260} className="block rounded" />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={code}
                    aria-label="Pairing code"
                    className="h-9 coarse:h-11 min-w-0 flex-1 rounded-lg border border-white/10 bg-white/6 px-3 font-mono text-[11px] text-ink-muted"
                  />
                  <button
                    type="button"
                    className={cls.outlinePill}
                    onClick={() => {
                      void navigator.clipboard?.writeText(code)
                      store.notify('Code copied')
                    }}
                  >
                    Copy code
                  </button>
                </div>
                {mode === 'offering' ? (
                  <p className="flex items-center gap-2.5 text-[12px] text-ink-muted">
                    <Spinner /> waiting for your other device…
                  </p>
                ) : (
                  <p className="text-[12px] text-ink-muted">
                    Show this answer to the device that made the offer.
                  </p>
                )}
              </>
            ) : (
              <button
                type="button"
                className={cls.outlinePill}
                disabled={busy}
                onClick={() => void startOffer()}
              >
                Show my code
              </button>
            )}
          </Column>

          <Column step="STEP 2, ON THE OTHER DEVICE" lead="Scan the code, then show its answer back here">
            {mode === 'scanning' ? (
              <div className="relative flex h-40 items-center justify-center overflow-hidden rounded-xl border-[1.5px] border-dashed border-white/20 bg-black font-mono text-[11px] text-ink-muted">
                <video ref={video} muted playsInline className="h-full w-full object-cover" />
                <Corner className="top-2.5 left-2.5 border-t-2 border-l-2" />
                <Corner className="top-2.5 right-2.5 border-t-2 border-r-2" />
                <Corner className="bottom-2.5 left-2.5 border-b-2 border-l-2" />
                <Corner className="right-2.5 bottom-2.5 border-r-2 border-b-2" />
              </div>
            ) : (
              <button type="button" className={cls.outlinePill} onClick={() => void startScan()}>
                Scan a code
              </button>
            )}

            <label className="text-[12px] text-ink-muted" htmlFor="paste-code">
              No camera? Paste the code instead. Any channel you already have works.
            </label>
            <div className="flex items-center gap-2">
              <input
                id="paste-code"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder="FT1:…"
                className="h-9 coarse:h-11 min-w-0 flex-1 rounded-lg border border-white/10 bg-white/6 px-3 font-mono text-[11px] text-ink-tertiary"
              />
              <button
                type="button"
                className={cls.outlinePill}
                disabled={!pasted.trim() || busy}
                onClick={() => void consume(pasted.trim())}
              >
                Use code
              </button>
            </div>
          </Column>

          <Column step={connected ? 'STEP 3, CONNECTED' : 'STEP 3, ONCE CONNECTED'} done={connected} lead="">
            <div className="flex items-center gap-2.5">
              <Dot tone={connected ? 'good' : 'off'} />
              <span className="text-[15px] font-semibold">
                {connected
                  ? `Connected to ${state.peers.find((p) => p.state === 'connected')?.name ?? 'device'}`
                  : 'Not connected yet'}
              </span>
            </div>
            <p className="text-[12px] leading-relaxed text-ink-muted">
              Timer state mirrors within a second; history merges with no duplicates. Either device can
              control the timer.
            </p>
            <div className="flex flex-col gap-2 text-[11.5px] text-ink-muted">
              <span className="flex items-center gap-2">
                <Dot tone="off" /> grey, not paired
              </span>
              <span className="flex items-center gap-2">
                <Dot tone="warn" /> amber, connecting
              </span>
              <span className="flex items-center gap-2">
                <Dot tone="good" /> green, connected
              </span>
            </div>
          </Column>
        </div>

        <footer className="flex justify-end">
          <button type="button" className={cls.button} onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  )
}

function Column({
  step,
  lead,
  done,
  children,
}: {
  step: string
  lead: string
  done?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-1 flex-col gap-3.5 rounded-xl border border-white/8 bg-white/4 p-5.5">
      <h3 className={`text-[12px] font-semibold tracking-[0.1em] ${done ? 'text-good' : 'text-accent'}`}>
        {step}
      </h3>
      {lead ? <p className="text-[13px] text-ink-tertiary">{lead}</p> : null}
      {children}
    </section>
  )
}

function Corner({ className }: { className: string }) {
  return <span aria-hidden className={`pointer-events-none absolute h-3.5 w-3.5 border-accent ${className}`} />
}
