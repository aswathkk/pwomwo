/**
 * `qrcode` and `jsqr` are pulled in on demand: pairing is a once-in-a-while
 * screen, and neither belongs in the bundle that has to paint a countdown.
 */

/**
 * Error-correction M at >= 260 px, per PRD SYN-1. That is enough redundancy for
 * a phone camera pointed at a laptop screen without inflating the module count.
 */
export async function renderQr(canvas: HTMLCanvasElement, text: string, size = 260): Promise<void> {
  const { default: QRCode } = await import('qrcode')
  await QRCode.toCanvas(canvas, text, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: size,
    color: { dark: '#17131f', light: '#ffffff' },
  })
}

export interface Scanner {
  stop: () => void
}

async function nativeDetector(): Promise<BarcodeDetector | null> {
  try {
    if (typeof BarcodeDetector === 'undefined') return null
    const formats = await BarcodeDetector.getSupportedFormats()
    if (!formats.includes('qr_code')) return null
    return new BarcodeDetector({ formats: ['qr_code'] })
  } catch {
    return null
  }
}

/**
 * Camera permission is requested here and nowhere else, so it only ever
 * happens because the user tapped *Scan* (PRD PWA-8).
 */
export async function scanQr(
  video: HTMLVideoElement,
  onResult: (text: string) => void,
  onUnavailable: () => void,
): Promise<Scanner> {
  let stopped = false
  let stream: MediaStream | null = null
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    })
  } catch {
    // Missing hardware and a refused permission are the same fact to the user;
    // the step's own heading says what to do instead.
    onUnavailable()
    return { stop: () => undefined }
  }
  video.srcObject = stream
  video.setAttribute('playsinline', 'true')
  await video.play().catch(() => undefined)

  const detector = await nativeDetector()
  const decode = detector ? null : (await import('jsqr')).default
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })

  const stop = () => {
    stopped = true
    stream?.getTracks().forEach((t) => t.stop())
    video.srcObject = null
  }

  const tick = async () => {
    if (stopped) return
    if (video.readyState >= 2) {
      try {
        if (detector) {
          const found = await detector.detect(video)
          if (found[0]?.rawValue) {
            onResult(found[0].rawValue)
            stop()
            return
          }
        } else if (ctx && decode) {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          ctx.drawImage(video, 0, 0)
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const found = decode(data.data, data.width, data.height, { inversionAttempts: 'dontInvert' })
          if (found?.data) {
            onResult(found.data)
            stop()
            return
          }
        }
      } catch {
        // A dropped frame is normal; keep looking.
      }
    }
    requestAnimationFrame(() => void tick())
  }
  void tick()

  return { stop }
}
