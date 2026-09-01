/** Keeps the phone's screen on while a timer runs, if the user asked for it. */
export class WakeLock {
  private sentinel: WakeLockSentinel | null = null
  private wanted = false

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.wanted) void this.acquire()
    })
  }

  async request(): Promise<void> {
    this.wanted = true
    await this.acquire()
  }

  private async acquire(): Promise<void> {
    if (this.sentinel || !('wakeLock' in navigator)) return
    try {
      this.sentinel = await navigator.wakeLock.request('screen')
      this.sentinel.addEventListener('release', () => {
        this.sentinel = null
      })
    } catch {
      // Denied or unsupported: not worth telling the user about.
    }
  }

  async release(): Promise<void> {
    this.wanted = false
    try {
      await this.sentinel?.release()
    } catch {
      /* already gone */
    }
    this.sentinel = null
  }
}
