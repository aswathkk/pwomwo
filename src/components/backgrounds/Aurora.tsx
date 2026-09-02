/**
 * A band of light in the upper sky, with curtains running through it.
 *
 * Ported from React Bits' Aurora (MIT + Commons Clause, © David Haz —
 * https://reactbits.dev/backgrounds/aurora). The noise and the colour ramp are
 * his. Changed here: the band is lifted clear of the clock and fades again
 * towards the zenith (upstream draws into a hero strip a few hundred pixels
 * tall, and stretched over a whole screen the same ramp sits behind it); the
 * edge is tighter and the colour more saturated, because at upstream's blend
 * the whole thing washes out over a full screen; and slow vertical curtains
 * are layered in, which is the part that makes it read as an aurora rather
 * than a gradient.
 */

import { AURORA_STOPS } from '../../backgrounds'
import { useShaderCanvas } from './useShaderCanvas'

const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const FRAG = `#version 300 es
precision highp float;

uniform float uTime;
uniform vec3 uColorStops[3];
uniform vec2 uResolution;

out vec4 fragColor;

const float AMPLITUDE = 0.9;
const float BLEND = 0.3;

vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v) {
  const vec4 C = vec4(
    0.211324865405187, 0.366025403784439,
    -0.577350269189626, 0.024390243902439
  );
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);

  vec3 p = permute(
    permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0)
  );

  vec3 m = max(
    0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)),
    0.0
  );
  m = m * m;
  m = m * m;

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);

  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

struct ColorStop {
  vec3 color;
  float position;
};

#define COLOR_RAMP(colors, factor, finalColor) {                     \
  int index = 0;                                                     \
  for (int i = 0; i < 2; i++) {                                      \
    ColorStop currentColor = colors[i];                              \
    bool isInBetween = currentColor.position <= factor;              \
    index = int(mix(float(index), float(i), float(isInBetween)));    \
  }                                                                  \
  ColorStop currentColor = colors[index];                            \
  ColorStop nextColor = colors[index + 1];                           \
  float range = nextColor.position - currentColor.position;          \
  float lerpFactor = (factor - currentColor.position) / range;       \
  finalColor = mix(currentColor.color, nextColor.color, lerpFactor); \
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  ColorStop colors[3];
  colors[0] = ColorStop(uColorStops[0], 0.0);
  colors[1] = ColorStop(uColorStops[1], 0.5);
  colors[2] = ColorStop(uColorStops[2], 1.0);

  vec3 rampColor;
  COLOR_RAMP(colors, uv.x, rampColor);
  // Pushed away from grey. Multiplying an already soft ramp by a fractional
  // intensity is most of what makes a full-screen aurora look washed out.
  float lum = dot(rampColor, vec3(0.299, 0.587, 0.114));
  rampColor = max(mix(vec3(lum), rampColor, 1.4), 0.0);

  float height = snoise(vec2(uv.x * 2.0 + uTime * 0.1, uTime * 0.25)) * 0.5 * AMPLITUDE;
  height = exp(height);
  // The band runs from a little above the middle of the screen to the top.
  // Upstream draws into a hero strip a few hundred pixels tall, where its ramp
  // is a whole sky; over a full screen it has to clear the clock without
  // shrinking to a stripe along the top edge.
  height = (uv.y * 2.08 - 0.15 - height + 0.2);
  float intensity = 0.6 * height;

  float midPoint = 0.20;
  float auroraAlpha = smoothstep(midPoint - BLEND * 0.5, midPoint + BLEND * 0.5, intensity);
  // Fades again towards the zenith, so it reads as a band of light in the sky
  // and not as a lit ceiling.
  auroraAlpha *= smoothstep(1.42, 0.86, uv.y);

  // Curtains: vertical striations through the band, drifting sideways at a
  // different rate from the band itself.
  float curtain = snoise(vec2(uv.x * 9.0 - uTime * 0.06, uTime * 0.09));
  auroraAlpha *= 0.66 + 0.44 * curtain;

  fragColor = vec4(intensity * rampColor * auroraAlpha * 1.25, auroraAlpha);
}
`

const stops = AURORA_STOPS.map((hex) => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
])

export default function Aurora() {
  // 5000 ms per unit of shader time: a fifth of upstream's rate. The band
  // should drift over a session rather than perform, and much slower than this
  // is motion nobody sees and a loop nobody needs.
  const host = useShaderCanvas({
    vertex: VERT,
    fragment: FRAG,
    uniforms: { uColorStops: stops },
    speed: 5000,
  })
  return <div ref={host} aria-hidden className="absolute inset-0" />
}
