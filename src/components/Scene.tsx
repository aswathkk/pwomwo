import { useEffect } from 'react'
import type { ThemeName } from '../types'

/** Time-of-day tints for the scene (PRD UI-1: morning / day / dusk / night). */
const PALETTES = {
  morning: ['#8fb6d9', '#a8c4d6', '#c9c2b4', '#d9c9a8', '#f0d9a0', 'rgb(255 226 170 / 0.45)'],
  day: ['#2b4a7a', '#4d78ab', '#7ba3c9', '#a9c4d9', '#d6e2ea', 'rgb(214 226 234 / 0.3)'],
  dusk: ['#151130', '#2f1e4b', '#6d395b', '#b55e52', '#e68e60', 'rgb(255 176 110 / 0.5)'],
  night: ['#0a0c1e', '#111531', '#141a38', '#1d2450', '#26315e', 'rgb(120 140 220 / 0.3)'],
} as const

function paletteFor(hour: number): readonly string[] {
  if (hour >= 6 && hour < 11) return PALETTES.morning
  if (hour >= 11 && hour < 16) return PALETTES.day
  if (hour >= 21 || hour < 6) return PALETTES.night
  return PALETTES.dusk
}

export function Scene({ theme, isBreak }: { theme: ThemeName; isBreak: boolean }) {
  useEffect(() => {
    const apply = () => {
      const [a, b, c, d, e, glow] = paletteFor(new Date().getHours())
      const root = document.documentElement.style
      root.setProperty('--scene-a', a!)
      root.setProperty('--scene-b', b!)
      root.setProperty('--scene-c', c!)
      root.setProperty('--scene-d', d!)
      root.setProperty('--scene-e', e!)
      root.setProperty('--scene-glow', glow!)
    }
    apply()
    const id = setInterval(apply, 5 * 60_000)
    return () => clearInterval(id)
  }, [])

  if (theme === 'minimal') {
    return (
      <div aria-hidden className="fixed inset-0 bg-ground">
        {/* A whisper of texture keeps the flat theme from looking broken. */}
        <div className="scene-stars fixed inset-0 opacity-15" />
        <div
          className={`fixed inset-0 transition-colors duration-400 ${
            isBreak ? 'bg-[rgb(6_16_22/0.35)]' : 'bg-transparent'
          }`}
        />
      </div>
    )
  }

  return (
    <div aria-hidden className="fixed inset-0 overflow-hidden">
      <div className="scene-sky animate-skydrift absolute inset-x-0 top-0 h-[130%]" />
      <div className="scene-glow fixed inset-0" />
      <div className="scene-stars animate-twinkle fixed inset-x-0 top-0 bottom-[40%]" />
      <div
        className={`fixed inset-0 transition-colors duration-400 ${
          isBreak
            ? 'bg-linear-180 from-[rgb(8_22_26/0.42)] via-[rgb(8_20_26/0.26)] to-[rgb(6_16_22/0.56)]'
            : 'bg-linear-180 from-[rgb(10_8_20/0.32)] via-[rgb(10_8_20/0.18)] to-[rgb(10_8_20/0.5)]'
        }`}
      />
    </div>
  )
}
