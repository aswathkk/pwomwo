import { useCallback, useEffect, useRef, useState } from 'react'
import { store } from '../store'
import { useAppState } from '../hooks/useStore'
import { renderQr, scanQr, type Scanner } from '../sync/qr'
import { peekRole } from '../sync/envelope'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cls, Icons, Spinner } from './primitives'

/**
 * One handshake with two halves, where the only thing the user has to get
 * right is which screen to be looking at. So every heading names the device it
 * is talking about, in the same two words throughout: *this device* and *your
 * other device*. The protocol's own vocabulary — offer, answer, handshake,
 * negotiation — never reaches the surface; there is only ever "a code".
 *
 * Showing both halves on both devices at once, as this used to, is how a
 * device ended up being handed a code for a pairing it had never started, and
 * how opening the camera silently took away the code the other device was
 * still trying to scan. Possession of the QR is the authorisation, so the code
 * on screen has to survive every step that follows it (PRD §4.5.2).
 */
type Step =
  | 'choose'
  | 'showOffer'
  | 'scanAnswer'
  | 'scanOffer'
  | 'showAnswer'
  | 'connecting'
  | 'connected'
  | 'failed'

const SCANNING: ReadonlySet<Step> = new Set<Step>(['scanOffer', 'scanAnswer'])
/** Both codes are in by now, so a link still not up is a genuine failure. */
const PAIRING_DEADLINE_MS = 25_000
/** Whichever way a code gets in, the sentence has to match what is on screen. */
const READ_A_CODE = {
  on: 'Point this camera at it.',
  off: 'This device has no camera, so paste the code instead.',
} as const
const STEP_OF: Partial<Record<Step, string>> = {
  showOffer: 'Step 1 of 2',
  scanAnswer: 'Step 2 of 2',
  scanOffer: 'Step 1 of 2',
  showAnswer: 'Step 2 of 2',
}

export function PairingDialog({ onClose }: { onClose: () => void }) {
  const state = useAppState()
  const [step, setStep] = useState<Step>('choose')
  const [offerCode, setOfferCode] = useState('')
  const [answerCode, setAnswerCode] = useState('')
  const [pasted, setPasted] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** Set when the camera is refused or missing, so the step leads with paste. */
  const [cameraOff, setCameraOff] = useState(false)

  const qrCanvas = useRef<HTMLCanvasElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const scanner = useRef<Scanner | null>(null)
  /** Bumped whenever an attempt is abandoned, so a stale wait cannot land. */
  const attempt = useRef(0)

  const showing = step === 'showOffer' ? offerCode : step === 'showAnswer' ? answerCode : ''
  const partner = [...state.peers].reverse().find((p) => p.state === 'connected')

  /**
   * `deadline` is null while the other device has yet to be shown anything: the
   * step is gated on a person walking between two screens, and no clock should
   * run against that. Once both codes are in, a stalled connection is a real
   * failure and worth calling after a few seconds.
   */
  const watch = useCallback(async (deadline: number | null) => {
    const mine = attempt.current
    const ok = (await store.sync?.waitForPairing(deadline)) ?? false
    if (attempt.current !== mine) return
    setStep(ok ? 'connected' : 'failed')
  }, [])

  /** One place decides what a code means, so pasting and scanning agree. */
  const consume = useCallback(
    async (raw: string) => {
      setBusy(true)
      setError(null)
      try {
        const sync = store.sync
        if (!sync) throw new Error('Sync is still starting up. Try again in a moment.')
        // The code itself says which half of the handshake it carries; reading
        // it from the step the user happens to be on gets it wrong the moment
        // they paste something into the other one.
        if ((await peekRole(raw)) === 'offer') {
          setAnswerCode(await sync.acceptOfferCode(raw))
          setStep('showAnswer')
          setPasted('')
          void watch(null)
        } else {
          await sync.acceptAnswerCode(raw)
          setStep('connecting')
          setPasted('')
          void watch(PAIRING_DEADLINE_MS)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'That code could not be read.')
      } finally {
        setBusy(false)
      }
    },
    [watch],
  )

  const startOffer = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const sync = store.sync
      if (!sync) throw new Error('Sync is still starting up. Try again in a moment.')
      attempt.current++
      setOfferCode(await sync.createOffer())
      setStep('showOffer')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pairing could not be started.')
    } finally {
      setBusy(false)
    }
  }, [])

  const goTo = useCallback((next: Step) => {
    setError(null)
    setStep(next)
  }, [])

  const restart = useCallback(() => {
    attempt.current++
    setStep('choose')
    setError(null)
    setPasted('')
    setOfferCode('')
    setAnswerCode('')
    setCameraOff(false)
  }, [])

  // The camera is tied to the step, so it is requested only when the user is
  // on a step that scans, and released the instant they leave it.
  useEffect(() => {
    if (!SCANNING.has(step)) return
    let cancelled = false
    setCameraOff(false)
    void (async () => {
      const el = video.current
      if (!el) return
      const started = await scanQr(
        el,
        (text) => void consume(text),
        // A missing camera is not an error: it is the case the paste field is
        // there for, so it takes the viewfinder away and rewords the step.
        () => setCameraOff(true),
      )
      if (cancelled) started.stop()
      else scanner.current = started
    })()
    return () => {
      cancelled = true
      scanner.current?.stop()
      scanner.current = null
    }
  }, [step, consume])

  useEffect(() => {
    if (!showing || !qrCanvas.current) return
    void renderQr(qrCanvas.current, showing, 248)
  }, [showing])

  const back = step === 'scanAnswer' ? 'showOffer' : step === 'scanOffer' ? 'choose' : null
  const scanProps = {
    video,
    cameraOff,
    value: pasted,
    busy,
    onChange: setPasted,
    onSubmit: () => void consume(pasted.trim()),
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className="scroll-region z-70 gap-5 overflow-y-auto bg-sheet px-4.5 pt-6 pb-[calc(1.5rem+var(--safe-b))] sm:max-h-[min(720px,calc(100dvh-2rem))] sm:w-124 sm:px-8 sm:py-8"
      >
        <DialogHeader className="justify-start gap-3">
          {back ? (
            <Button variant="soft" size="icon" aria-label="Back" onClick={() => goTo(back)}>
              {Icons.back}
            </Button>
          ) : null}
          <div className="min-w-0 flex-1">
            <DialogTitle>Pair a device</DialogTitle>
            {STEP_OF[step] ? (
              <p className="mt-1 text-[11.5px] text-ink-muted">{STEP_OF[step]}</p>
            ) : null}
          </div>
          <DialogClose asChild>
            <Button variant="soft" size="icon" aria-label="Close">
              {Icons.close}
            </Button>
          </DialogClose>
        </DialogHeader>

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-bad/40 bg-bad/8 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-bad"
          >
            {error}
          </p>
        ) : null}

        {/* Each step replaces the last, so the new heading has to be announced
            rather than left for a screen reader to stumble back into. */}
        <div className="flex flex-col gap-5" aria-live="polite">
          {step === 'choose' ? (
            <>
              <Lead
                title="Open pwomwo on both devices"
                hint="One device shows a code, the other scans it. Nothing is sent to a server, and it works on the same Wi-Fi with the internet off."
              />
              <Choice
                title="Show a code"
                hint="Start here. Your other device will scan this screen."
                disabled={busy}
                onClick={() => void startOffer()}
              />
              <Choice
                title="Scan a code"
                hint="Your other device is already showing one."
                disabled={busy}
                onClick={() => goTo('scanOffer')}
              />
            </>
          ) : null}

          {step === 'showOffer' ? (
            <>
              <Lead
                title="Scan this screen with your other device"
                hint="Open pwomwo there, start pairing, and choose Scan a code. Your other device shows a code back once it has scanned this one."
              />
              <Qr canvas={qrCanvas} />
              <CodeRow label="No camera on that device? Send it this code instead." code={offerCode} />
              <Button onClick={() => goTo('scanAnswer')}>Next, scan its code</Button>
            </>
          ) : null}

          {step === 'scanAnswer' ? (
            <>
              <Lead
                title={`${cameraOff ? 'Enter' : 'Scan'} the code your other device shows back`}
                hint={`${READ_A_CODE[cameraOff ? 'off' : 'on']} That is the last step.`}
              />
              <Scan {...scanProps} />
              <Button
                variant="secondary"
                className="self-start"
                onClick={() => goTo('showOffer')}
              >
                Show my code again
              </Button>
            </>
          ) : null}

          {step === 'scanOffer' ? (
            <>
              <Lead
                title={`${cameraOff ? 'Enter' : 'Scan'} the code on your other device`}
                hint={`${READ_A_CODE[cameraOff ? 'off' : 'on']} If that device is not showing a code yet, choose Show a code there first.`}
              />
              <Scan {...scanProps} />
            </>
          ) : null}

          {step === 'showAnswer' ? (
            <>
              <Lead
                title="Take this screen back to your other device"
                hint="Scan it there to finish. That device is waiting for this code."
              />
              <Qr canvas={qrCanvas} />
              <CodeRow label="No camera on that device? Send it this code instead." code={answerCode} />
              <Status>Waiting for your other device</Status>
            </>
          ) : null}

          {step === 'connecting' ? (
            <>
              <Lead title="Connecting" hint="Both codes are in. This takes a few seconds." />
              <Status>Linking the two devices</Status>
            </>
          ) : null}

          {step === 'connected' ? (
            <>
              <div className="flex items-center gap-2.5 text-good">
                {Icons.paired}
                <h3 className="text-[17px] font-semibold">
                  Paired with {partner?.name ?? 'your other device'}
                </h3>
              </div>
              <p className={cls.hint}>
                Both devices now share the timer and your history. Either one can start, pause and skip.
              </p>
              <Button variant="secondary" className="self-start" onClick={restart}>
                Pair another device
              </Button>
            </>
          ) : null}

          {step === 'failed' ? (
            <>
              <Lead
                title="No connection"
                hint="Both codes went through, but the two devices could not reach each other. There is no relay server to fall back on, so it is usually one of these."
              />
              <ul className="flex flex-col gap-2 text-[12.5px] leading-relaxed text-ink-muted">
                <Reason>Put both devices on the same Wi-Fi. That always works.</Reason>
                <Reason>On different networks, turn on the STUN lookup in Settings, under Sync.</Reason>
                <Reason>Codes go stale. Start over to get a fresh one.</Reason>
              </ul>
              <Button onClick={restart}>Start over</Button>
            </>
          ) : null}
        </div>

        <footer className="flex justify-end">
          <Button variant={step === 'connected' ? 'default' : 'secondary'} onClick={onClose}>
            {step === 'connected' ? 'Done' : 'Close'}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  )
}

function Lead({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-[15px] leading-snug font-semibold text-balance">{title}</h3>
      <p className={cls.hint}>{hint}</p>
    </div>
  )
}

function Choice({
  title,
  hint,
  disabled,
  onClick,
}: {
  title: string
  hint: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-xl border border-white/10 bg-white/4 p-4 text-left transition hover:border-accent/50 hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="block text-[14px] font-semibold">{title}</span>
      <span className={`mt-1 block ${cls.hint}`}>{hint}</span>
    </button>
  )
}

/** The one line that says the app is still working and who has to act next. */
function Status({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="flex items-center gap-2.5 text-[12.5px] text-ink-muted">
      <Spinner /> {children}…
    </p>
  )
}

function Qr({ canvas }: { canvas: React.RefObject<HTMLCanvasElement | null> }) {
  return (
    <div className="self-center rounded-xl bg-white p-3">
      <canvas ref={canvas} width={248} height={248} className="block rounded" />
    </div>
  )
}

function CodeRow({ label, code }: { label: string; code: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className={cls.hint}>{label}</span>
      <div className="flex items-center gap-2">
        <Input
          readOnly
          value={code}
          aria-label="Pairing code"
          className="flex-1 font-mono text-[11px] font-normal text-ink-muted"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void navigator.clipboard?.writeText(code)
            store.notify('Code copied')
          }}
        >
          Copy
        </Button>
      </div>
    </div>
  )
}

/**
 * Camera first, with the paste field under it as the stated fallback. When
 * there is no camera the viewfinder goes away rather than sitting there as an
 * empty black box, and paste stops introducing itself as second best.
 */
function Scan({
  video,
  cameraOff,
  value,
  busy,
  onChange,
  onSubmit,
}: {
  video: React.RefObject<HTMLVideoElement | null>
  cameraOff: boolean
  value: string
  busy: boolean
  onChange: (next: string) => void
  onSubmit: () => void
}) {
  return (
    <>
      <div className={cameraOff ? 'hidden' : 'relative h-52 overflow-hidden rounded-xl bg-black'}>
        <video ref={video} muted playsInline className="h-full w-full object-cover" />
        <Corner className="top-2.5 left-2.5 border-t-2 border-l-2" />
        <Corner className="top-2.5 right-2.5 border-t-2 border-r-2" />
        <Corner className="bottom-2.5 left-2.5 border-b-2 border-l-2" />
        <Corner className="right-2.5 bottom-2.5 border-r-2 border-b-2" />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-[13px] font-medium" htmlFor="paste-code">
          {cameraOff ? 'Paste the code' : 'Or paste the code'}
        </label>
        <p id="paste-code-hint" className={cls.hint}>
          Send it over any channel you already have between the two devices.
        </p>
        <div className="flex items-center gap-2">
          <Input
            id="paste-code"
            aria-describedby="paste-code-hint"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="FT1:…"
            className="flex-1 font-mono text-[11px] font-normal text-ink-tertiary"
          />
          <Button variant="outline" size="sm" disabled={!value.trim() || busy} onClick={onSubmit}>
            Use code
          </Button>
        </div>
      </div>
    </>
  )
}

function Reason({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span aria-hidden className="mt-1.75 h-1 w-1 shrink-0 rounded-full bg-white/35" />
      <span>{children}</span>
    </li>
  )
}

function Corner({ className }: { className: string }) {
  return <span aria-hidden className={`pointer-events-none absolute h-3.5 w-3.5 border-accent ${className}`} />
}
