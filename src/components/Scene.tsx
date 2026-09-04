import { Component, lazy, Suspense, useEffect, type ReactNode } from 'react'
import type { ThemeName } from '../types'

/**
 * The backgrounds that run a shader, with the flat colour each one draws over.
 * Loaded lazily and one chunk apiece: `ogl` and a fragment shader are dead
 * weight for anyone whose background is a gradient.
 */
const SHADERS = {
  aurora: { component: lazy(() => import('./backgrounds/Aurora')), base: 'bg-[#07060d]' },
  'soft-aurora': {
    component: lazy(() => import('./backgrounds/SoftAurora')),
    base: 'bg-[#07060d]',
  },
  silk: { component: lazy(() => import('./backgrounds/Silk')), base: 'bg-[#241d38]' },
} as const

/**
 * A background is decoration, and the timer has to outlive it. Without this,
 * a chunk that fails to arrive — a hiccup on the first load after an update,
 * before the service worker has it — throws out of render and takes the whole
 * app down to a blank page, on every launch, with the setting that causes it
 * saved and no way to reach the screen that would change it.
 */
class ShaderBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  override render() {
    return this.state.failed ? null : this.props.children
  }
}

interface SkyPalette {
  /** Zenith to horizon. */
  stops: readonly [string, string, string, string, string]
  /** The horizon glow that sits under the gradient's bottom edge. */
  glow: string
  /** How much of the starfield shows through, 0 to 1. */
  stars: number
}

/**
 * Time-of-day tints for the scene (PRD UI-1: morning / day / dusk / night).
 * Each is a real sky rather than a tinted grey: a saturated zenith, a warm
 * horizon, and enough distance between the two for the gradient to read as
 * depth. The earlier set sat close to neutral at every stop, and under the
 * scrim that grades the chrome it came out as a wash with no colour in it.
 *
 * The horizon stop stays saturated rather than going pale. The bottom of the
 * screen carries the most scrim, because the hint line and the progress bar
 * are down there, and a pale stop under that much darkening turns brown.
 */
const PALETTES = {
  morning: {
    stops: ['#16255c', '#3f4a94', '#8a5a9e', '#e0765f', '#ffa257'],
    glow: 'rgb(255 165 90 / 0.55)',
    stars: 0.35,
  },
  day: {
    stops: ['#0d3a80', '#1c6ac4', '#3f9ee0', '#79c4e8', '#ffc07a'],
    glow: 'rgb(255 190 120 / 0.42)',
    stars: 0,
  },
  dusk: {
    stops: ['#10102e', '#351c58', '#7a2f6b', '#c9515a', '#ff9a56'],
    glow: 'rgb(255 150 90 / 0.6)',
    stars: 0.75,
  },
  night: {
    stops: ['#050a1e', '#0c1440', '#182a66', '#274a8c', '#41729e'],
    glow: 'rgb(90 150 220 / 0.38)',
    stars: 1,
  },
} as const satisfies Record<string, SkyPalette>

function paletteFor(hour: number): SkyPalette {
  if (hour >= 6 && hour < 11) return PALETTES.morning
  if (hour >= 11 && hour < 16) return PALETTES.day
  if (hour >= 21 || hour < 6) return PALETTES.night
  return PALETTES.dusk
}

/**
 * A break is cooler and a shade darker than focus. The two gradient forms are
 * kept apart because the flat backgrounds have no sky to grade against: a
 * top-to-bottom wash over black just looks like a smudge.
 */
function BreakTint({ isBreak, flat }: { isBreak: boolean; flat?: boolean }) {
  // The middle stop sits low and light on purpose: the sky is at its most
  // colourful across the horizon, and a scrim that ramps evenly from the top
  // takes that colour away long before it reaches the text it is there for.
  const focus = flat
    ? 'bg-transparent'
    : 'bg-linear-180 from-[rgb(10_8_20/0.16)] from-0% via-[rgb(10_8_20/0.09)] via-52% to-[rgb(10_8_20/0.44)] to-100%'
  const brk = flat
    ? 'bg-[rgb(6_16_22/0.35)]'
    : 'bg-linear-180 from-[rgb(8_22_26/0.3)] from-0% via-[rgb(8_20_26/0.13)] via-52% to-[rgb(6_16_22/0.56)] to-100%'
  return <div className={`fixed inset-0 transition-colors duration-400 ${isBreak ? brk : focus}`} />
}

export function Scene({ theme, isBreak }: { theme: ThemeName; isBreak: boolean }) {
  const isSky = theme === 'scene'

  useEffect(() => {
    if (!isSky) return
    const apply = () => {
      const { stops, glow, stars } = paletteFor(new Date().getHours())
      const root = document.documentElement.style
      const names = ['--scene-a', '--scene-b', '--scene-c', '--scene-d', '--scene-e'] as const
      stops.forEach((stop, i) => root.setProperty(names[i]!, stop))
      root.setProperty('--scene-glow', glow)
      root.setProperty('--scene-star-opacity', String(stars))
    }
    apply()
    const id = setInterval(apply, 5 * 60_000)
    return () => clearInterval(id)
  }, [isSky])

  // True black, and nothing else: every lit pixel here is one an OLED panel
  // would have left off. The phase still reads from the pill and the clock.
  if (theme === 'oled') {
    return <div aria-hidden className="fixed inset-0 bg-black" />
  }

  const shader = theme in SHADERS ? SHADERS[theme as keyof typeof SHADERS] : undefined
  if (shader) {
    const Shader = shader.component
    return (
      <div aria-hidden className={`fixed inset-0 overflow-hidden ${shader.base}`}>
        {/* Nothing to show while the chunk loads, and nothing to show if it
            never arrives: the flat base above is already a finished
            background, so a spinner would only flash. */}
        <ShaderBoundary>
          <Suspense fallback={null}>
            <Shader />
          </Suspense>
        </ShaderBoundary>
        <BreakTint isBreak={isBreak} flat />
      </div>
    )
  }

  if (theme === 'minimal') {
    return (
      <div aria-hidden className="fixed inset-0 bg-ground">
        {/* A whisper of texture keeps the flat theme from looking broken, and
            a little light from above keeps it from looking like a void. */}
        <div className="scene-stars fixed inset-0 opacity-15" />
        <div className="scene-toplight fixed inset-0" />
        <BreakTint isBreak={isBreak} flat />
      </div>
    )
  }

  // The three CSS backgrounds below run entirely on the compositor: the ember
  // glow breathes on opacity, the mesh pools drift on transform, and the grid
  // does not move at all. Each one carries a film grain so the gradients read
  // as something printed rather than something rendered.
  if (theme === 'ember') {
    return (
      <div aria-hidden className="fixed inset-0 overflow-hidden bg-[#120a10]">
        <div className="ember-sky absolute inset-0" />
        <div className="ember-glow animate-ember absolute inset-0" />
        <div className="scene-grain absolute inset-0" />
        <BreakTint isBreak={isBreak} flat />
      </div>
    )
  }

  if (theme === 'mesh') {
    return (
      <div aria-hidden className="fixed inset-0 overflow-hidden bg-[#0b0916]">
        <div className="mesh-pool mesh-pool-a animate-mesh-a absolute" />
        <div className="mesh-pool mesh-pool-b animate-mesh-b absolute" />
        <div className="mesh-pool mesh-pool-c animate-mesh-c absolute" />
        <div className="scene-grain absolute inset-0" />
        <BreakTint isBreak={isBreak} flat />
      </div>
    )
  }

  if (theme === 'graph') {
    return (
      <div aria-hidden className="fixed inset-0 overflow-hidden bg-[#0a0f1f]">
        <div className="graph-grid absolute inset-0" />
        <div className="graph-light absolute inset-0" />
        <div className="scene-grain absolute inset-0" />
        <BreakTint isBreak={isBreak} flat />
      </div>
    )
  }

  return (
    <div aria-hidden className="fixed inset-0 overflow-hidden">
      <div className="scene-sky animate-skydrift absolute inset-x-0 top-0 h-[130%]" />
      <div className="scene-glow fixed inset-0" />
      {/* The opacity lives on this wrapper because the twinkle keyframes animate
          opacity on the layer itself, and an animation beats an inline value. */}
      <div
        className="fixed inset-x-0 top-0 bottom-[40%]"
        style={{ opacity: 'var(--scene-star-opacity)' }}
      >
        <div className="scene-stars animate-twinkle absolute inset-0" />
      </div>
      {/* Darkens the corners so the chrome keeps its contrast without a flat
          scrim over the whole sky, which is what drained the colour out of it. */}
      <div className="scene-vignette fixed inset-0" />
      <BreakTint isBreak={isBreak} />
    </div>
  )
}
