/** Serves the production build, for checking the offline and install flows. */
import { file } from 'bun'
import { join } from 'node:path'

const DIST = join(import.meta.dir, '..', 'dist')
const PORT = Number(process.env['PORT'] ?? 4173)

const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    const { pathname } = new URL(request.url)
    for (const candidate of [pathname, `${pathname}/index.html`, '/index.html']) {
      const asset = file(join(DIST, candidate))
      if (await asset.exists()) {
        return new Response(asset, {
          headers: candidate === '/sw.js' ? { 'cache-control': 'no-cache' } : {},
        })
      }
    }
    return new Response('not found', { status: 404 })
  },
})

console.log(`pwomwo preview on ${server.url}`)
