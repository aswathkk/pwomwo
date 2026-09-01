/**
 * The sound that plays *while* a session runs, as opposed to the chime at the
 * end of one: either a periodic beat at a chosen tempo, or a continuous
 * ambient bed.
 *
 * Both are synthesised into a single seamless loop buffer and handed to the
 * audio thread, so the beat never depends on a JS timer. A throttled
 * background tab keeps time exactly as well as a foreground one, the CPU cost
 * is one buffer read, and nothing has to be downloaded or precached.
 */

import { audioContext } from './sound'
import { clamp } from '../util'

export type TimerSoundKind = 'periodic' | 'ambient'

export interface TimerSoundDef {
  id: string
  label: string
  kind: TimerSoundKind
}

/** The id that means "play nothing"; kept out of the catalogue on purpose. */
export const TIMER_SOUND_NONE = 'none'
export const MIN_BPM = 20
export const MAX_BPM = 240
export const DEFAULT_BPM = 60

/** Loops fade in and out over this long, so start/stop never clicks. */
const FADE = 0.35
/** Keeps the bed under the end-of-phase chime even at matching volumes. */
const HEADROOM = 0.9

/** ── Noise sources ──────────────────────────────────────────────────── */

function white(n: number): Float32Array {
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = Math.random() * 2 - 1
  return out
}

/** Paul Kellet's economy pink filter: three poles, flat enough by ear. */
function pink(n: number): Float32Array {
  const out = new Float32Array(n)
  let b0 = 0
  let b1 = 0
  let b2 = 0
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1
    b0 = 0.99765 * b0 + w * 0.099046
    b1 = 0.963 * b1 + w * 0.2965164
    b2 = 0.57 * b2 + w * 1.0526913
    out[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25
  }
  return out
}

function brown(n: number): Float32Array {
  const out = new Float32Array(n)
  let last = 0
  for (let i = 0; i < n; i++) {
    // The 0.998 leak is what keeps the random walk from wandering onto DC.
    last = (last + (Math.random() * 2 - 1) * 0.02) * 0.998
    out[i] = last * 7
  }
  return out
}

function add(buf: Float32Array, at: number, value: number): void {
  if (at < 0 || at >= buf.length) return
  buf[at] = (buf[at] ?? 0) + value
}

/** Hiss with individual drops struck over it. */
function rainNoise(n: number, sr: number): Float32Array {
  const out = white(n)
  for (let i = 0; i < n; i++) out[i] = (out[i] ?? 0) * 0.45
  const drops = Math.round((n / sr) * 30)
  for (let d = 0; d < drops; d++) {
    const at = Math.floor(Math.random() * n)
    const freq = 1200 + Math.random() * 2200
    const decay = sr * (0.004 + Math.random() * 0.008)
    const peak = 0.12 + Math.random() * 0.22
    const step = (2 * Math.PI * freq) / sr
    for (let i = 0; i < decay * 5 && at + i < n; i++) {
      add(out, at + i, Math.sin(step * i) * peak * Math.exp(-i / decay))
    }
  }
  return out
}

/** A low roar with sparse crackles struck over it. */
function fireNoise(n: number, sr: number): Float32Array {
  const out = brown(n)
  for (let i = 0; i < n; i++) out[i] = (out[i] ?? 0) * 0.7
  const crackles = Math.round((n / sr) * 9)
  for (let c = 0; c < crackles; c++) {
    const at = Math.floor(Math.random() * n)
    const len = Math.floor(sr * (0.004 + Math.random() * 0.018))
    const peak = 0.2 + Math.random() * 0.45
    for (let i = 0; i < len && at + i < n; i++) {
      add(out, at + i, (Math.random() * 2 - 1) * peak * Math.exp(-i / (len * 0.3)))
    }
  }
  return out
}

/** ── Buffers ────────────────────────────────────────────────────────── */

/**
 * Every buffer leaves here at the same peak, which is what makes one volume
 * slider mean the same thing across a metronome and a brown noise bed — and
 * what keeps the raw noise generators, which happily wander past full scale,
 * from clipping the output.
 */
function normalize(out: Float32Array, target = 0.9): void {
  let peak = 0
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i] ?? 0))
  if (peak <= 0) return
  const scale = target / peak
  for (let i = 0; i < out.length; i++) out[i] = (out[i] ?? 0) * scale
}

/**
 * Renders `seconds` of `fill` into a buffer whose end joins its own start
 * without a click: the tail is generated past the loop point and crossfaded
 * back over the head.
 */
function loopBuffer(
  ac: AudioContext,
  seconds: number,
  fill: (n: number, sr: number) => Float32Array,
): AudioBuffer {
  const sr = ac.sampleRate
  const n = Math.max(1, Math.round(seconds * sr))
  const fade = Math.min(n >> 1, Math.round(0.3 * sr))
  const raw = fill(n + fade, sr)
  const buf = ac.createBuffer(1, n, sr)
  const out = buf.getChannelData(0)
  out.set(raw.subarray(0, n))
  for (let i = 0; i < fade; i++) {
    const t = i / fade
    out[i] = (out[i] ?? 0) * t + (raw[n + i] ?? 0) * (1 - t)
  }
  normalize(out)
  return buf
}

/** ── The rig each preset builds into ────────────────────────────────── */

interface Rig {
  ac: AudioContext
  out: AudioNode
  /** Registers a source so the engine can stop it again. */
  add: <T extends AudioScheduledSourceNode>(node: T) => T
}

/**
 * Synthesis is deterministic-enough noise: a rebuilt buffer sounds the same as
 * the one it replaces. So each loop is rendered once and reused — every
 * pause→resume used to re-run megabytes of Float32 synthesis on the main
 * thread inside the tap handler. An AudioBuffer can back any number of source
 * nodes, so sharing is safe.
 */
const bufferCache = new Map<string, AudioBuffer>()

function cached(key: string, make: () => AudioBuffer): AudioBuffer {
  let buf = bufferCache.get(key)
  if (!buf) {
    buf = make()
    bufferCache.set(key, buf)
  }
  return buf
}

function noise(
  rig: Rig,
  seconds: number,
  fill: (n: number, sr: number) => Float32Array,
): AudioBufferSourceNode {
  const src = rig.ac.createBufferSource()
  src.buffer = cached(`${fill.name}:${seconds}`, () => loopBuffer(rig.ac, seconds, fill))
  src.loop = true
  return rig.add(src)
}

function biquad(ac: AudioContext, type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
  const node = ac.createBiquadFilter()
  node.type = type
  node.frequency.value = freq
  node.Q.value = q
  return node
}

function level(ac: AudioContext, value: number): GainNode {
  const node = ac.createGain()
  node.gain.value = value
  return node
}

/** A slow sine that moves `param` around whatever value it already holds. */
function sweep(rig: Rig, rate: number, depth: number, param: AudioParam): void {
  const osc = rig.ac.createOscillator()
  osc.frequency.value = rate
  const amount = level(rig.ac, depth)
  osc.connect(amount).connect(param)
  rig.add(osc)
}

/** ── Ambient beds ───────────────────────────────────────────────────── */

interface AmbientDef extends TimerSoundDef {
  kind: 'ambient'
  build: (rig: Rig) => void
}

const AMBIENT: AmbientDef[] = [
  {
    id: 'brown-noise',
    label: 'Brown noise',
    kind: 'ambient',
    build: (rig) => {
      noise(rig, 6, brown)
        .connect(biquad(rig.ac, 'lowpass', 1100))
        .connect(level(rig.ac, 0.95))
        .connect(rig.out)
    },
  },
  {
    id: 'pink-noise',
    label: 'Pink noise',
    kind: 'ambient',
    build: (rig) => {
      noise(rig, 6, pink)
        .connect(biquad(rig.ac, 'lowpass', 6000))
        .connect(level(rig.ac, 0.55))
        .connect(rig.out)
    },
  },
  {
    id: 'white-noise',
    label: 'White noise',
    kind: 'ambient',
    build: (rig) => {
      noise(rig, 6, white)
        .connect(biquad(rig.ac, 'lowpass', 9000))
        .connect(level(rig.ac, 0.3))
        .connect(rig.out)
    },
  },
  {
    id: 'rain',
    label: 'Rain',
    kind: 'ambient',
    build: (rig) => {
      noise(rig, 10, rainNoise)
        .connect(biquad(rig.ac, 'highpass', 450))
        .connect(biquad(rig.ac, 'lowpass', 7000))
        .connect(level(rig.ac, 0.65))
        .connect(rig.out)
      // The rumble underneath is what stops it sounding like plain hiss.
      noise(rig, 8, brown)
        .connect(biquad(rig.ac, 'lowpass', 320))
        .connect(level(rig.ac, 0.35))
        .connect(rig.out)
    },
  },
  {
    id: 'waves',
    label: 'Ocean waves',
    kind: 'ambient',
    build: (rig) => {
      // One swell every eight seconds or so, body and foam breathing together.
      const body = level(rig.ac, 0.5)
      sweep(rig, 0.12, 0.35, body.gain)
      noise(rig, 8, brown).connect(biquad(rig.ac, 'lowpass', 650)).connect(body).connect(rig.out)

      const foam = level(rig.ac, 0.14)
      sweep(rig, 0.12, 0.11, foam.gain)
      noise(rig, 6, white)
        .connect(biquad(rig.ac, 'bandpass', 2200, 0.5))
        .connect(foam)
        .connect(rig.out)
    },
  },
  {
    id: 'stream',
    label: 'Stream',
    kind: 'ambient',
    build: (rig) => {
      const bubbles = biquad(rig.ac, 'bandpass', 1500, 0.55)
      sweep(rig, 0.3, 280, bubbles.frequency)
      noise(rig, 6, white).connect(bubbles).connect(level(rig.ac, 0.5)).connect(rig.out)
      noise(rig, 6, brown)
        .connect(biquad(rig.ac, 'lowpass', 480))
        .connect(level(rig.ac, 0.4))
        .connect(rig.out)
    },
  },
  {
    id: 'wind',
    label: 'Wind',
    kind: 'ambient',
    build: (rig) => {
      const gust = biquad(rig.ac, 'bandpass', 480, 1.4)
      sweep(rig, 0.07, 300, gust.frequency)
      const body = level(rig.ac, 0.75)
      sweep(rig, 0.05, 0.25, body.gain)
      noise(rig, 8, brown).connect(gust).connect(body).connect(rig.out)

      const hiss = level(rig.ac, 0.09)
      sweep(rig, 0.06, 0.06, hiss.gain)
      noise(rig, 6, white).connect(biquad(rig.ac, 'lowpass', 1500)).connect(hiss).connect(rig.out)
    },
  },
  {
    id: 'fire',
    label: 'Fireplace',
    kind: 'ambient',
    build: (rig) => {
      noise(rig, 12, fireNoise)
        .connect(biquad(rig.ac, 'lowpass', 1700))
        .connect(level(rig.ac, 0.85))
        .connect(rig.out)
    },
  },
]

/** ── Periodic beats ─────────────────────────────────────────────────── */

/** One struck tone inside a pattern. */
interface Voice {
  /** Offset from the start of the pattern, in beats. */
  at: number
  freq: number
  /** Exponential decay constant, in seconds. */
  decay: number
  gain: number
  type: 'sine' | 'square' | 'triangle'
  /** How much of the strike is noise rather than tone (0..1). */
  grit?: number
}

interface PeriodicDef extends TimerSoundDef {
  kind: 'periodic'
  /** Pattern length, in beats. Two gives a tick-tock. */
  beats: number
  voices: Voice[]
}

const PERIODIC: PeriodicDef[] = [
  {
    id: 'stopwatch',
    label: 'Stopwatch',
    kind: 'periodic',
    beats: 2,
    voices: [
      { at: 0, freq: 2600, decay: 0.006, gain: 0.9, type: 'sine', grit: 0.85 },
      { at: 1, freq: 2100, decay: 0.006, gain: 0.75, type: 'sine', grit: 0.85 },
    ],
  },
  {
    id: 'wristwatch',
    label: 'Wristwatch',
    kind: 'periodic',
    beats: 2,
    voices: [
      { at: 0, freq: 4200, decay: 0.003, gain: 0.6, type: 'sine', grit: 0.95 },
      { at: 1, freq: 3600, decay: 0.003, gain: 0.5, type: 'sine', grit: 0.95 },
    ],
  },
  {
    id: 'wall-clock',
    label: 'Wall clock',
    kind: 'periodic',
    beats: 2,
    voices: [
      { at: 0, freq: 900, decay: 0.018, gain: 0.8, type: 'sine', grit: 0.5 },
      { at: 0, freq: 220, decay: 0.03, gain: 0.4, type: 'sine' },
      { at: 1, freq: 760, decay: 0.018, gain: 0.7, type: 'sine', grit: 0.5 },
      { at: 1, freq: 190, decay: 0.03, gain: 0.35, type: 'sine' },
    ],
  },
  {
    id: 'metronome',
    label: 'Metronome',
    kind: 'periodic',
    beats: 4,
    voices: [
      { at: 0, freq: 2000, decay: 0.012, gain: 0.95, type: 'square', grit: 0.3 },
      { at: 1, freq: 1400, decay: 0.01, gain: 0.6, type: 'square', grit: 0.3 },
      { at: 2, freq: 1400, decay: 0.01, gain: 0.6, type: 'square', grit: 0.3 },
      { at: 3, freq: 1400, decay: 0.01, gain: 0.6, type: 'square', grit: 0.3 },
    ],
  },
  {
    id: 'wood-block',
    label: 'Wood block',
    kind: 'periodic',
    beats: 1,
    voices: [
      { at: 0, freq: 900, decay: 0.02, gain: 0.8, type: 'triangle', grit: 0.2 },
      { at: 0, freq: 430, decay: 0.03, gain: 0.5, type: 'triangle' },
    ],
  },
  {
    id: 'heartbeat',
    label: 'Heartbeat',
    kind: 'periodic',
    beats: 2,
    voices: [
      { at: 0, freq: 62, decay: 0.075, gain: 1, type: 'sine' },
      { at: 0.34, freq: 48, decay: 0.09, gain: 0.7, type: 'sine' },
    ],
  },
  {
    id: 'ping',
    label: 'Ping',
    kind: 'periodic',
    beats: 1,
    voices: [
      { at: 0, freq: 1245, decay: 0.07, gain: 0.7, type: 'sine' },
      { at: 0, freq: 1868, decay: 0.035, gain: 0.25, type: 'sine' },
    ],
  },
]

function wave(type: Voice['type'], phase: number): number {
  switch (type) {
    case 'square':
      return Math.sin(phase) >= 0 ? 1 : -1
    case 'triangle':
      return (2 / Math.PI) * Math.asin(Math.sin(phase))
    default:
      return Math.sin(phase)
  }
}

/**
 * One whole pattern, exactly as long as `beats` at `bpm`, so looping it *is*
 * the metronome. Tails wrap around the loop point rather than being cut, which
 * keeps slow decays (the heartbeat, say) seamless at fast tempos.
 */
function periodicBuffer(ac: AudioContext, def: PeriodicDef, bpm: number): AudioBuffer {
  const sr = ac.sampleRate
  const beat = 60 / bpm
  const n = Math.max(1, Math.round(def.beats * beat * sr))
  const buf = ac.createBuffer(1, n, sr)
  const out = buf.getChannelData(0)

  for (const v of def.voices) {
    const start = Math.round(v.at * beat * sr)
    const tail = Math.min(n, Math.round(v.decay * 7 * sr))
    const step = (2 * Math.PI * v.freq) / sr
    const grit = v.grit ?? 0
    for (let i = 0; i < tail; i++) {
      const env = Math.exp(-i / (v.decay * sr))
      const sample = wave(v.type, step * i) * (1 - grit) + (Math.random() * 2 - 1) * grit
      const at = (start + i) % n
      out[at] = (out[at] ?? 0) + v.gain * env * sample
    }
  }

  normalize(out)
  return buf
}

/** ── Catalogue ──────────────────────────────────────────────────────── */

const DEFS = new Map<string, AmbientDef | PeriodicDef>(
  [...PERIODIC, ...AMBIENT].map((d) => [d.id, d]),
)

export const TIMER_SOUNDS: TimerSoundDef[] = [...PERIODIC, ...AMBIENT].map(
  ({ id, label, kind }) => ({ id, label, kind }),
)

export function timerSoundKind(id: string): TimerSoundKind | null {
  return DEFS.get(id)?.kind ?? null
}

export function isTimerSound(id: string): boolean {
  return DEFS.has(id)
}

/** ── Engine ─────────────────────────────────────────────────────────── */

interface Playing {
  id: string
  /** 0 for ambient beds, which have no tempo to match against. */
  bpm: number
  ac: AudioContext
  master: GainNode
  sources: AudioScheduledSourceNode[]
}

let playing: Playing | null = null
let watching = false

/**
 * Two ways a loop can end up muted through no fault of its own: backgrounding
 * the tab (or, on iOS, the app) can suspend the context, and a session
 * restored from storage on reload starts the loop before the page has seen the
 * gesture that autoplay policy wants. Both are recoverable, and neither
 * announces itself, so watch for the moments that let us resume.
 */
function watchWakeups(): void {
  if (watching || typeof document === 'undefined') return
  watching = true
  const resume = () => {
    if (playing && playing.ac.state === 'suspended') void playing.ac.resume()
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') resume()
  })
  document.addEventListener('pointerdown', resume)
  document.addEventListener('keydown', resume)
}

function rampTo(p: Playing, value: number, seconds: number): void {
  const t0 = p.ac.currentTime
  p.master.gain.cancelScheduledValues(t0)
  p.master.gain.setValueAtTime(p.master.gain.value, t0)
  p.master.gain.linearRampToValueAtTime(value, t0 + seconds)
}

/**
 * Idempotent: calling it again with the same sound only re-levels the volume,
 * so a settings change mid-session never restarts the loop.
 */
export function startTimerSound(id: string, volume: number, bpm: number): void {
  const def = DEFS.get(id)
  if (!def || volume <= 0) {
    stopTimerSound()
    return
  }
  const tempo = def.kind === 'periodic' ? clamp(Math.round(bpm) || DEFAULT_BPM, MIN_BPM, MAX_BPM) : 0
  if (playing && playing.id === id && playing.bpm === tempo) {
    rampTo(playing, volume * HEADROOM, 0.12)
    return
  }
  stopTimerSound()

  try {
    const ac = audioContext()
    const master = ac.createGain()
    master.gain.value = 0
    master.connect(ac.destination)

    const sources: AudioScheduledSourceNode[] = []
    const rig: Rig = {
      ac,
      out: master,
      add: (node) => {
        sources.push(node)
        return node
      },
    }
    if (def.kind === 'periodic') {
      const src = ac.createBufferSource()
      src.buffer = cached(`${def.id}:${tempo}`, () => periodicBuffer(ac, def, tempo))
      src.loop = true
      src.connect(master)
      rig.add(src)
    } else {
      def.build(rig)
    }

    const t0 = ac.currentTime
    for (const src of sources) src.start(t0)
    master.gain.setValueAtTime(0, t0)
    master.gain.linearRampToValueAtTime(volume * HEADROOM, t0 + FADE)

    playing = { id, bpm: tempo, ac, master, sources }
    watchWakeups()
  } catch {
    // Autoplay policy or no audio device: silence is an acceptable outcome.
    playing = null
  }
}

export function stopTimerSound(): void {
  const p = playing
  if (!p) return
  playing = null
  try {
    rampTo(p, 0, FADE)
    const end = p.ac.currentTime + FADE + 0.05
    for (const src of p.sources) src.stop(end)
    setTimeout(() => p.master.disconnect(), (FADE + 0.3) * 1000)
    // Park the audio rendering thread once nothing needs it: the context
    // otherwise runs (and drains battery) for the app's whole lifetime after
    // the first sound. The grace period lets the end-of-phase chime ring out,
    // and `audioContext()` resumes a suspended context on the next use.
    setTimeout(() => {
      if (!playing && p.ac.state === 'running') void p.ac.suspend()
    }, 3000)
  } catch {
    /* already torn down */
  }
}

/** Which sound, if any, is sounding right now. Used by the settings preview. */
export function timerSoundPlaying(): string | null {
  return playing?.id ?? null
}
