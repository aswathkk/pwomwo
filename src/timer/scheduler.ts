/**
 * Drives the countdown off the wall clock, never off a decrementing counter, so
 * a throttled or sleeping tab shows the right time and completes at the right
 * moment (PRD TMR-3). While the page is visible we ride
 * `requestAnimationFrame`; when it is hidden we fall back to a worker
 * interval, which browsers throttle far less aggressively than a page timer.
 */

const WORKER_SRC = `let id=null;onmessage=(e)=>{if(e.data==='start'){if(id===null)id=setInterval(()=>postMessage('tick'),1000)}else if(e.data==='stop'){clearInterval(id);id=null}}`

export class Scheduler {
  private rafId: number | null = null
  private worker: Worker | null = null
  private workerUrl: string | null = null
  private running = false
  private readonly onTick: () => void
  private readonly onVisibility = () => {
    // Coming back from a background tab: settle the display immediately, then
    // pick whichever ticking strategy suits the new visibility.
    this.onTick()
    if (this.running) this.applyMode()
  }

  constructor(onTick: () => void) {
    this.onTick = onTick
  }

  start(): void {
    if (this.running) return
    this.running = true
    document.addEventListener('visibilitychange', this.onVisibility)
    window.addEventListener('focus', this.onVisibility)
    window.addEventListener('pageshow', this.onVisibility)
    this.applyMode()
  }

  stop(): void {
    if (!this.running) return
    this.running = false
    document.removeEventListener('visibilitychange', this.onVisibility)
    window.removeEventListener('focus', this.onVisibility)
    window.removeEventListener('pageshow', this.onVisibility)
    this.stopRaf()
    this.stopWorker()
  }

  private applyMode(): void {
    if (document.visibilityState === 'visible') {
      this.stopWorker()
      this.startRaf()
    } else {
      this.stopRaf()
      this.startWorker()
    }
  }

  private startRaf(): void {
    if (this.rafId !== null) return
    let last = 0
    const loop = (t: number) => {
      this.rafId = requestAnimationFrame(loop)
      // 500 ms is enough to keep the seconds honest without repainting at 60 Hz.
      if (t - last < 250) return
      last = t
      this.onTick()
    }
    this.rafId = requestAnimationFrame(loop)
  }

  private stopRaf(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    this.rafId = null
  }

  private startWorker(): void {
    if (this.worker) return
    try {
      this.workerUrl = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }))
      this.worker = new Worker(this.workerUrl)
      this.worker.onmessage = () => this.onTick()
      this.worker.postMessage('start')
    } catch {
      // No worker (strict CSP, ancient browser): a plain interval still lands
      // completion within the ~60 s budget the PRD allows for hidden tabs.
      this.worker = null
      const id = window.setInterval(() => this.onTick(), 1000)
      this.fallbackInterval = id
    }
  }

  private fallbackInterval: number | null = null

  private stopWorker(): void {
    if (this.worker) {
      this.worker.postMessage('stop')
      this.worker.terminate()
      this.worker = null
    }
    if (this.workerUrl) {
      URL.revokeObjectURL(this.workerUrl)
      this.workerUrl = null
    }
    if (this.fallbackInterval !== null) {
      clearInterval(this.fallbackInterval)
      this.fallbackInterval = null
    }
  }
}
