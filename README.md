# pwomwo

A local-first focus timer. It has the full-screen countdown of a study timer,
the history and statistics page of the Marinara Pomodoro Assistant, and live
sync between your own devices over WebRTC. There is no account, no backend, and
no third-party sync service.

Everything is stored in IndexedDB on the device that recorded it. The only
network traffic is this site's own assets, an optional public STUN lookup, and
the paired device itself.

## Running it

```bash
bun install
bun run dev
```

| Script | What it does |
| --- | --- |
| `bun run dev` | Dev server with hot reload on `http://localhost:3000` (`PORT=…` to change) |
| `bun run build` | Typechecks, bundles to `dist/`, and generates the service worker |
| `bun run preview` | Serves `dist/` on `http://localhost:4173`. Use it to exercise install and offline |
| `bun test` | Unit tests for the stats, merge, RLE and SDP-compaction logic |
| `bun run typecheck` | `tsc --noEmit` |

## Deploying

Service workers, cameras, notifications, wake lock and WebRTC all require a
secure context, so serve the site over HTTPS. The build is otherwise
undemanding: it is static files, and it writes no absolute URLs, so `dist/` runs
from a domain root or from a subpath without being rebuilt for either.

GitHub Pages is already wired up. `.github/workflows/deploy.yml` typechecks,
runs the tests, builds, and publishes `dist/` on every push to `main`. It needs
one setting in the repository: under Settings then Pages, set the source to
GitHub Actions. The site is then served at `https://<user>.github.io/<repo>/`,
and the service worker takes its scope from that path.

## How it fits together

```
src/
  timer/      state machine + wall-clock scheduler
  history/    IndexedDB repository, stats, import/export
  sync/       identity, SDP compaction, QR pairing, peer protocol
  pwa/        service worker, notifications, wake lock, badge, alert and timer sounds
  components/ React views
  store.ts    the single owner of mutable state
```

### The timer is a versioned document

`TimerDoc` (`src/types.ts`) holds the whole timer: phase, status, duration,
`endsAt`, and a Lamport `version`. Time is measured against the wall clock,
never by decrementing a counter, so a throttled or sleeping tab shows the right
time and completes at the right moment. While the page is visible the scheduler
rides `requestAnimationFrame`; when it is hidden it falls back to a worker
interval, which browsers throttle far less than a page timer.

Replication is last-writer-wins: higher `version` wins, ties break on wall clock,
then on `deviceId` so every device reaches the same answer.

### History is a grow-only set

Only completed *focus* sessions are recorded, which is what Marinara does. A
record is immutable and keyed by an id derived from the session id, so whichever
device notices the end first wins and the others collapse into it rather than
double-counting.

Merging is a union. On connect, each side sends a digest of `day → {count, hash}`
and only the days that differ are exchanged. Clearing leaves 30-day tombstones so
a peer that missed the clear cannot resurrect the records.

Marinara `history.json` (run-length encoded) and `history.csv` both import, and
ids for imported rows are derived deterministically from `endedAt` + duration, so
re-importing the same file adds nothing.

### Pairing without a signaling server

Two devices exchange one offer and one answer, carried by QR code. The SDP is
stripped to the handful of lines the far side cannot reconstruct, deflated, and
Base45-encoded; a real offer lands around 700 characters, which scans reliably at
error-correction level M.

Each device holds a non-extractable ECDSA P-256 key. After connecting, both sides
sign the pair of DTLS fingerprints and verify the other's signature against the
public key that came in the QR, so a code that was tampered with in transit
cannot complete the handshake.

There is deliberately no TURN relay, because running one would mean running a
server. Devices on the same Wi-Fi always work, most home NATs work via STUN, and
the UI says so when a connection cannot be made.

## Deliberate limits

There is no Web Push, so a notification can only fire while the app is open. On
iOS the app must be installed to the Home Screen, and a suspended phone alerts
when you next open it, while a paired laptop alerts on time.

A reload ends a connection. With nothing to rendezvous through, a page reload
means a fresh QR exchange. Nothing is lost: history merges on the next pairing.

Settings do not sync. Each device keeps its own durations, sounds and
notification preferences.

## Backgrounds

Six, per device, under Settings then General: a sky that re-tints with the time
of day, a flat dark, true black for OLED, and three animated shaders. The
shaders are ported from [React Bits](https://reactbits.dev/backgrounds) (MIT +
Commons Clause). They load only when chosen, stop rendering while the tab is
hidden, and hold a single still frame under `prefers-reduced-motion`.

## Assets

Space Grotesk (SIL OFL) is self-hosted in `src/fonts` so the app has no
third-party origin. The backgrounds are CSS, or a shader compiled at runtime,
and the alert chimes are synthesised with the Web Audio API rather than shipped
as files.

The app mark is Phosphor `Timer` at `bold`, the same family and weight as every
icon in the UI, drawn over the dusk gradient. `public/icons/*.svg` are the
sources; the PNGs beside them exist only because Android notification badges and
iOS home screens will not take an SVG. Re-render them with:

```bash
cd public/icons \
  && rsvg-convert -w 192 -h 192 icon.svg -o icon-192.png \
  && rsvg-convert -w 512 -h 512 icon.svg -o icon-512.png \
  && rsvg-convert -w 512 -h 512 icon-maskable.svg -o icon-maskable-512.png \
  && rsvg-convert -w 96 -h 96 icon-badge.svg -o icon-badge-96.png \
  && rsvg-convert -w 180 -h 180 icon-maskable.svg -o apple-touch-icon-180.png
```

`icon.svg` is the favicon and the manifest's `any` icon. `icon-maskable.svg`
keeps the mark inside the 40%-radius safe circle Android masks to, and also
feeds the iOS home-screen icon, which needs an opaque square. `icon-badge.svg`
is white on transparent because Android flattens a notification badge to a
silhouette.
