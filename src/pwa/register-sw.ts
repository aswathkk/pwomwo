/**
 * Registers the service worker in production only, and surfaces an update as a
 * prompt rather than swapping the app out underneath a running timer.
 */
export interface SwHooks {
  onUpdateReady: (apply: () => void) => void
  onNotificationAction: (action: string) => void
}

export function registerServiceWorker(hooks: SwHooks): void {
  if (!('serviceWorker' in navigator)) return
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return
  // `__PROD__` is substituted by the build; `typeof` keeps this safe in dev,
  // where the identifier does not exist.
  if (typeof __PROD__ === 'undefined' || !__PROD__) return

  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as { type?: string; action?: string } | null
    if (data?.type === 'notification-action' && data.action) hooks.onNotificationAction(data.action)
  })

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js').then((registration) => {
      const watch = (worker: ServiceWorker | null) => {
        if (!worker) return
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            hooks.onUpdateReady(() => {
              worker.postMessage({ type: 'SKIP_WAITING' })
              location.reload()
            })
          }
        })
      }
      watch(registration.waiting)
      registration.addEventListener('updatefound', () => watch(registration.installing))
    })
  })
}
