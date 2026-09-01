/**
 * Development server. Bun bundles `index.html` (and everything it imports)
 * in-process with hot reload; anything under `public/` is served verbatim so
 * the manifest, icons and service worker behave exactly as they will in
 * production.
 */
import { file } from 'bun'
import { join } from 'node:path'
import index from '../index.html'

const PUBLIC = join(import.meta.dir, '..', 'public')
const PORT = Number(process.env['PORT'] ?? 3000)

const server = Bun.serve({
  port: PORT,
  development: { hmr: true, console: true },
  routes: {
    '/': index,
    '/index.html': index,
  },
  async fetch(request) {
    const { pathname } = new URL(request.url)
    const asset = file(join(PUBLIC, pathname))
    if (await asset.exists()) return new Response(asset)
    // Single-page app: unknown paths fall back to the shell.
    return new Response(null, { status: 404 })
  },
})

console.log(`pwomwo dev server on ${server.url}`)
