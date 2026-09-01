/**
 * The alert chimes are synthesised rather than shipped as audio files: it keeps
 * the precache tiny, works offline by construction, and gives every sound the
 * same headroom so the volume slider means the same thing across all of them.
 */

export type SoundName = 'bell' | 'chime' | 'wood' | 'digital'

export const SOUNDS: { id: SoundName; label: string }[] = [
  { id: 'bell', label: 'Bell' },
  { id: 'chime', label: 'Chime' },
  { id: 'wood', label: 'Wood block' },
  { id: 'digital', label: 'Digital' },
]

let ctx: AudioContext | null = null

function context(): AudioContext {
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

interface Partial_ {
  freq: number
  at: number
  dur: number
  gain: number
  type: OscillatorType
}

function recipe(name: SoundName): Partial_[] {
  switch (name) {
    case 'chime':
      return [
        { freq: 880, at: 0, dur: 1.1, gain: 0.5, type: 'sine' },
        { freq: 1318.5, at: 0.09, dur: 1.0, gain: 0.35, type: 'sine' },
        { freq: 1760, at: 0.18, dur: 0.9, gain: 0.2, type: 'sine' },
      ]
    case 'wood':
      return [
        { freq: 420, at: 0, dur: 0.14, gain: 0.7, type: 'triangle' },
        { freq: 210, at: 0.01, dur: 0.1, gain: 0.4, type: 'square' },
      ]
    case 'digital':
      return [
        { freq: 1046.5, at: 0, dur: 0.12, gain: 0.5, type: 'square' },
        { freq: 1046.5, at: 0.18, dur: 0.12, gain: 0.5, type: 'square' },
        { freq: 1568, at: 0.36, dur: 0.22, gain: 0.5, type: 'square' },
      ]
    case 'bell':
    default:
      return [
        { freq: 660, at: 0, dur: 1.6, gain: 0.55, type: 'sine' },
        { freq: 990, at: 0, dur: 1.2, gain: 0.28, type: 'sine' },
        { freq: 1320, at: 0.02, dur: 0.8, gain: 0.14, type: 'sine' },
      ]
  }
}

export function playSound(name: SoundName, volume: number): void {
  if (volume <= 0) return
  try {
    const ac = context()
    const master = ac.createGain()
    master.gain.value = volume
    master.connect(ac.destination)
    const t0 = ac.currentTime
    for (const p of recipe(name)) {
      const osc = ac.createOscillator()
      const gain = ac.createGain()
      osc.type = p.type
      osc.frequency.value = p.freq
      gain.gain.setValueAtTime(0, t0 + p.at)
      gain.gain.linearRampToValueAtTime(p.gain, t0 + p.at + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + p.at + p.dur)
      osc.connect(gain).connect(master)
      osc.start(t0 + p.at)
      osc.stop(t0 + p.at + p.dur + 0.05)
    }
  } catch {
    // Autoplay policy or no audio device: silence is an acceptable outcome.
  }
}
