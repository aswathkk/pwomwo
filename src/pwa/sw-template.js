/* eslint-disable no-undef */
/**
 * App-shell service worker. The precache list and revision are injected at
 * build time from what was actually emitted, so a release caches the whole
 * shell or fails loudly instead of caching half of it.
 */
const REVISION = __REVISION__
const PRECACHE = __PRECACHE__
const CACHE = `pwomwo-${REVISION}`

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  // The page asks for this only after the user accepts the update toast.
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Navigations fall back to the cached shell so the app opens offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html').then((r) => r || Response.error())),
    )
    return
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        }),
    ),
  )
})

/** Tapping a phase-end notification focuses the running app rather than opening a second one. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const existing = clientList[0]
      if (existing) {
        await existing.focus()
        existing.postMessage({ type: 'notification-action', action: event.action })
        return
      }
      await self.clients.openWindow('/')
    })(),
  )
})
