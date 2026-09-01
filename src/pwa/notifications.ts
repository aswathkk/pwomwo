/**
 * Local notifications only. There is no push server by design, so a phase can
 * only announce itself while the app is open. The copy in Settings says so
 * rather than letting the user discover it the hard way (PRD PWA-4/PWA-5).
 */

const STALE_MS = 60_000

export function notificationsSupported(): boolean {
  return typeof Notification !== 'undefined'
}

export function permission(): NotificationPermission {
  return notificationsSupported() ? Notification.permission : 'denied'
}

/** Only ever called from the settings toggle, never on load. */
export async function requestPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return 'denied'
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

export interface PhaseNotification {
  title: string
  body: string
  action?: { title: string; id: string }
  endedAt: number
}

export async function notifyPhaseEnd(n: PhaseNotification): Promise<void> {
  if (permission() !== 'granted') return
  // A phone that was asleep should not spray stale alerts when it wakes.
  if (Date.now() - n.endedAt > STALE_MS) return

  // `actions` and `renotify` are real but not yet in lib.dom's typings.
  const options: NotificationOptions & {
    actions?: { action: string; title: string }[]
    renotify?: boolean
  } = {
    body: n.body,
    tag: 'pwomwo-phase',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-badge-96.png',
    renotify: true,
  }
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) {
      // `showNotification` is the only path that works on an installed iOS PWA.
      if (n.action) options.actions = [{ action: n.action.id, title: n.action.title }]
      await reg.showNotification(n.title, options)
      return
    }
  } catch {
    /* fall through to the constructor */
  }
  try {
    new Notification(n.title, options)
  } catch {
    /* some browsers forbid the constructor entirely; nothing more to try */
  }
}
