/**
 * The catalogue of faces the countdown can be drawn as.
 *
 * They differ in *kind*, not in effect. One bold typeface wearing six
 * animations is one clock, not six, and three typefaces at the same size are
 * barely two: every face here is a different object, or the same time set
 * so differently that no one would mistake it for the default.
 *
 * The id is what `Settings.clockStyle` stores, so it is a persisted value:
 * renaming one silently resets that device to the default. The faces
 * themselves live in `components/Clock.tsx`; this file is only the list, so
 * that settings, validation and the picker all read the same one.
 */

export type ClockStyleName = 'plain' | 'serif' | 'outline' | 'dots' | 'segment' | 'dial' | 'flip'

export interface ClockStyleDef {
  id: ClockStyleName
  label: string
  hint: string
  /** Something on this face moves without being asked: a blink, a sweep, a
      flip. Only used to soften the reduced-motion note in the picker. */
  animated: boolean
}

export const CLOCK_STYLES: ClockStyleDef[] = [
  {
    id: 'plain',
    label: 'Bold',
    hint: 'The default. Heavy numerals, as wide as the screen will allow, and nothing else.',
    animated: false,
  },
  {
    id: 'serif',
    label: 'Editorial',
    hint: 'An italic serif with old-style figures, the way a magazine would set a number. Digits cross-fade rather than snap.',
    animated: false,
  },
  {
    id: 'outline',
    label: 'Outline',
    hint: 'Hollow numerals that fill from the bottom as the phase runs. Solid at the bell.',
    animated: true,
  },
  {
    id: 'dots',
    label: 'Minutes',
    hint: 'A dot for every minute of the phase. The spent ones dim, the current one drains with the seconds, and the count stays small underneath.',
    animated: true,
  },
  {
    id: 'segment',
    label: 'Segment',
    hint: 'A seven-segment display, slanted the way the real ones are. The unlit segments stay as faint outlines, and the colon blinks.',
    animated: true,
  },
  {
    id: 'dial',
    label: 'Dial',
    hint: 'An instrument. The phase is a dial with the elapsed arc sweeping round it, and the count sits in the middle.',
    animated: true,
  },
  {
    id: 'flip',
    label: 'Split-flap',
    hint: 'A departures board. The old half falls, the new half swings up behind it, on opaque cards.',
    animated: true,
  },
]

const BY_ID = new Map<string, ClockStyleDef>(CLOCK_STYLES.map((c) => [c.id, c]))

export function isClockStyle(id: unknown): id is ClockStyleName {
  return typeof id === 'string' && BY_ID.has(id)
}

export function clockStyleDef(id: ClockStyleName): ClockStyleDef | undefined {
  return BY_ID.get(id)
}
