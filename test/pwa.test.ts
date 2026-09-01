import { describe, expect, test } from 'bun:test'

/**
 * The service worker is the one piece that cannot use a bundler-rewritten
 * relative URL: it resolves everything itself. These run the real template the
 * way `scripts/build.ts` ships it, once at a domain root and once under the
 * /<repo>/ base a GitHub Pages project site serves from.
 */
const PRECACHE = ['index.html', 'index-abc123.js', 'icons/icon-192.png', 'manifest.webmanifest']

async function runSw(url: string) {
  const template = await Bun.file(new URL('../src/pwa/sw-template.js', import.meta.url)).text()
  const source = template
    .replace('__PRECACHE__', JSON.stringify(PRECACHE))
    .replace('__REVISION__', JSON.stringify('testrev'))

  const listeners: Record<string, (event: unknown) => unknown> = {}
  const cached: string[] = []
  const opened: string[] = []
  const matched: string[] = []

  const self = {
    location: new URL(url),
    addEventListener: (type: string, fn: (event: unknown) => unknown) => (listeners[type] = fn),
    registration: { scope: url.replace(/sw\.js$/, '') },
    clients: {
      claim: async () => {},
      matchAll: async () => [],
      openWindow: async (u: string) => void opened.push(u),
    },
  }
  const caches = {
    open: async () => ({ addAll: async (u: string[]) => void cached.push(...u), put: async () => {} }),
    keys: async () => [],
    delete: async () => {},
    match: async (k: string) => void matched.push(k),
  }

  new Function('self', 'caches', source)(self, caches)
  const waitUntil = (p: unknown) => p
  await listeners.install!({ waitUntil })
  await listeners.notificationclick!({ notification: { close() {} }, action: '', waitUntil })
  return { cached, opened }
}

describe('service worker base path', () => {
  test('resolves against its own URL under a project base path', async () => {
    const { cached, opened } = await runSw('https://example.github.io/pwomwo/sw.js')
    expect(cached).toEqual([
      'https://example.github.io/pwomwo/index.html',
      'https://example.github.io/pwomwo/index-abc123.js',
      'https://example.github.io/pwomwo/icons/icon-192.png',
      'https://example.github.io/pwomwo/manifest.webmanifest',
    ])
    // The bug this guards: a leading slash would hoist these to the domain root.
    expect(cached.some((u) => u === 'https://example.github.io/index.html')).toBe(false)
    expect(opened).toEqual(['https://example.github.io/pwomwo/'])
  })

  test('still resolves when the app owns the domain root', async () => {
    const { cached, opened } = await runSw('https://pwomwo.example/sw.js')
    expect(cached[0]).toBe('https://pwomwo.example/index.html')
    expect(opened).toEqual(['https://pwomwo.example/'])
  })
})
