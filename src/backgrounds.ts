/**
 * The catalogue of backgrounds the app can paint behind the clock.
 *
 * The id is what `Settings.theme` stores, so it is also a persisted value:
 * renaming one silently resets that device to the default. `swatch` is a CSS
 * `background` value, drawn at tile size in the settings picker — a still of
 * what the real layer looks like, not a screenshot of it.
 */

export type ThemeName =
  | 'scene'
  | 'minimal'
  | 'oled'
  | 'ember'
  | 'mesh'
  | 'graph'
  | 'aurora'
  | 'soft-aurora'
  | 'silk'

export interface BackgroundDef {
  id: ThemeName
  label: string
  hint: string
  /** Runs a loop while it is on screen. Honoured by the reduced-motion and
      reduced-data defaults, and called out in the picker. */
  animated: boolean
  swatch: string
}

export const BACKGROUNDS: BackgroundDef[] = [
  {
    id: 'scene',
    label: 'Dusk sky',
    hint: 'A gradient sky that re-tints with the time of day.',
    animated: false,
    swatch:
      'radial-gradient(80% 40% at 50% 100%, rgb(255 150 90 / 0.55), transparent 72%),' +
      'linear-gradient(180deg, #10102e 0%, #351c58 26%, #7a2f6b 50%, #c9515a 70%, #ff9a56 96%)',
  },
  {
    id: 'minimal',
    label: 'Minimal dark',
    hint: 'Flat and quiet, with a whisper of starfield.',
    animated: false,
    swatch:
      'radial-gradient(rgb(255 255 255 / 0.5) 0.7px, transparent 1.2px) 0 0 / 26px 18px, #0f0d16',
  },
  {
    id: 'oled',
    label: 'OLED black',
    hint: 'True black, so an OLED screen leaves those pixels unlit. Panels go black to match.',
    animated: false,
    swatch: '#000000',
  },
  {
    id: 'ember',
    label: 'Ember',
    hint: 'A hearth after dark: near-black above, a low warm glow that breathes below. The warm one.',
    animated: true,
    swatch:
      'radial-gradient(70% 55% at 50% 104%, rgb(255 126 62 / 0.6), transparent 70%),' +
      'linear-gradient(180deg, #120a10 0%, #1c0d14 40%, #35131a 72%, #5a2418 100%)',
  },
  {
    id: 'mesh',
    label: 'Mesh',
    hint: 'Three pools of colour drifting over a deep ground, blending where they meet. Slow, and light on a GPU.',
    animated: true,
    swatch:
      'radial-gradient(60% 60% at 22% 28%, rgb(122 63 214 / 0.85), transparent 70%),' +
      'radial-gradient(55% 55% at 78% 30%, rgb(64 196 178 / 0.6), transparent 70%),' +
      'radial-gradient(60% 50% at 52% 92%, rgb(255 120 110 / 0.6), transparent 70%),' +
      '#0b0916',
  },
  {
    id: 'graph',
    label: 'Graph paper',
    hint: 'Deep navy ruled into a fine grid and lit from above. Still. The segment and dial faces sit well on it.',
    animated: false,
    swatch:
      'radial-gradient(80% 60% at 50% 0%, rgb(120 150 255 / 0.22), transparent 70%),' +
      'repeating-linear-gradient(0deg, rgb(255 255 255 / 0.09) 0 1px, transparent 1px 11px),' +
      'repeating-linear-gradient(90deg, rgb(255 255 255 / 0.09) 0 1px, transparent 1px 11px),' +
      '#0a0f1f',
  },
  {
    id: 'aurora',
    label: 'Aurora',
    hint: 'A band of light with slow curtains, over a near-black sky. Uses the GPU.',
    animated: true,
    swatch:
      'radial-gradient(74% 68% at 16% 30%, rgb(58 29 122 / 0.95), transparent 72%),' +
      'radial-gradient(58% 60% at 48% 22%, rgb(77 255 184 / 0.8), transparent 74%),' +
      'radial-gradient(70% 64% at 84% 28%, rgb(138 63 224 / 0.95), transparent 74%),' +
      '#07060d',
  },
  {
    id: 'soft-aurora',
    label: 'Soft aurora',
    hint: 'The same light, wider and far more diffuse. The heaviest of these on a GPU.',
    animated: true,
    swatch:
      'radial-gradient(120% 74% at 30% 30%, rgb(127 224 168 / 0.5), transparent 76%),' +
      'radial-gradient(120% 78% at 72% 22%, rgb(122 63 214 / 0.65), transparent 78%),' +
      '#07060d',
  },
  {
    id: 'silk',
    label: 'Silk',
    hint: 'Folds of woven light, drifting. Fills the screen, so it is the least black of these.',
    animated: true,
    swatch:
      'repeating-linear-gradient(115deg, #241d38 0 5px, #3b3160 7px, #241d38 13px),' +
      '#2b2344',
  },
]

const BY_ID = new Map<string, BackgroundDef>(BACKGROUNDS.map((b) => [b.id, b]))

export function isTheme(id: unknown): id is ThemeName {
  return typeof id === 'string' && BY_ID.has(id)
}

export function backgroundDef(id: ThemeName): BackgroundDef | undefined {
  return BY_ID.get(id)
}

/** The three colour stops the aurora ramps across, left to right. Two hues,
    not three: a full spectrum reads as a smear rather than a sky, and it also
    leaves the orange accent with nothing to stand out against. */
export const AURORA_STOPS = ['#3a1d7a', '#4dffb8', '#8a3fe0'] as const

/**
 * The browser UI colour: a phone's status bar, and the title bar of the
 * installed app. Matched to the top of each background so the chrome does not
 * sit on a visible seam. The manifest still carries the default for the splash
 * screen, which is chosen before any setting has been read.
 */
const THEME_COLORS: Record<ThemeName, string> = {
  scene: '#171233',
  minimal: '#0f0d16',
  oled: '#000000',
  ember: '#120a10',
  mesh: '#0b0916',
  graph: '#0a0f1f',
  aurora: '#07060d',
  'soft-aurora': '#07060d',
  silk: '#2b2344',
}

export function applyThemeColor(theme: ThemeName): void {
  if (typeof document === 'undefined') return
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme])
}
