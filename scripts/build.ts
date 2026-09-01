/**
 * Production build: bundle the app, copy `public/`, then emit a service worker
 * whose precache list is generated from what was actually written, so the app
 * shell is complete offline and never stale by omission.
 */
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import tailwind from 'bun-plugin-tailwind'

const ROOT = join(import.meta.dir, '..')
const DIST = join(ROOT, 'dist')

await rm(DIST, { recursive: true, force: true })
await mkdir(DIST, { recursive: true })

const result = await Bun.build({
  entrypoints: [join(ROOT, 'index.html')],
  outdir: DIST,
  target: 'browser',
  minify: true,
  sourcemap: 'linked',
  splitting: true,
  // Without this React ships its development build, warnings and all.
  define: { 'process.env.NODE_ENV': '"production"', __PROD__: 'true' },
  naming: { chunk: '[name]-[hash].[ext]', asset: '[name]-[hash].[ext]' },
  plugins: [tailwind],
  // Manifest and icons ship verbatim from `public/`; the bundler must not
  // try to resolve, hash or inline them.
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

await cp(join(ROOT, 'public'), DIST, { recursive: true })

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map((e) => {
      const full = join(dir, e.name)
      return e.isDirectory() ? walk(full) : Promise.resolve([full])
    }),
  )
  return files.flat()
}

const precache = (await walk(DIST))
  .map((f) => '/' + relative(DIST, f).split('\\').join('/'))
  .filter((p) => !p.endsWith('.map') && p !== '/sw.js')
  .sort()

const revision = Bun.hash(precache.join('|')).toString(36)
const template = await Bun.file(join(ROOT, 'src/pwa/sw-template.js')).text()
await writeFile(
  join(DIST, 'sw.js'),
  template
    .replace('__PRECACHE__', JSON.stringify(precache, null, 2))
    .replace('__REVISION__', JSON.stringify(revision)),
)

const bytes = (await walk(DIST))
  .filter((f) => f.endsWith('.js'))
  .reduce((n, f) => n + Bun.file(f).size, 0)
console.log(`built ${precache.length} files, ${(bytes / 1024).toFixed(1)} KB of JS`)
