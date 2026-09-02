/**
 * A wide, diffuse wash of light: two layers of Perlin-driven glow crossing the
 * upper sky, coloured by a pair of cosine gradients that cycle as they drift.
 * Quieter and less defined than `Aurora`, which is the point of having both.
 *
 * Ported from React Bits' Soft Aurora (MIT + Commons Clause, © David Haz —
 * https://reactbits.dev/backgrounds/soft-aurora). The shader is his, with the
 * light-mode branch and the mouse-parallax uniforms removed: pointer tracking
 * would give a focus timer's background a reason to react to you, which is the
 * opposite of what it is for. The band is raised out of the middle of the
 * screen, where it sat behind the clock.
 */

import { useShaderCanvas } from './useShaderCanvas'

const VERT = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const FRAG = `
precision highp float;

uniform float uTime;
uniform vec3 uResolution;
uniform vec3 uColor1;
uniform vec3 uColor2;

#define TAU 6.28318

const float SPEED = 0.6;
const float SCALE = 1.5;
const float BRIGHTNESS = 0.72;
const float NOISE_FREQ = 2.5;
const float NOISE_AMP = 1.0;
const float BAND_HEIGHT = 0.82;
const float BAND_SPREAD = 1.0;
const float OCTAVE_DECAY = 0.1;
const float LAYER_OFFSET = 1.7;
const float COLOR_SPEED = 1.0;
/* Half of what SPEED * 0.4 covers over one turn of the host's clock, so the
   fold below completes exactly as that clock wraps. See CLOCK_WRAP. */
const float TIME_FOLD = 12.0;

vec3 gradientHash(vec3 p) {
  p = vec3(
    dot(p, vec3(127.1, 311.7, 234.6)),
    dot(p, vec3(269.5, 183.3, 198.3)),
    dot(p, vec3(169.5, 283.3, 156.9))
  );
  vec3 h = fract(sin(p) * 43758.5453123);
  float phi = acos(2.0 * h.x - 1.0);
  float theta = TAU * h.y;
  return vec3(cos(theta) * sin(phi), sin(theta) * cos(phi), cos(phi));
}

float quinticSmooth(float t) {
  float t2 = t * t;
  float t3 = t * t2;
  return 6.0 * t3 * t2 - 15.0 * t2 * t2 + 10.0 * t3;
}

vec3 cosineGradient(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(TAU * (c * t + d));
}

/* The noise reads a moving z, and it has to keep moving without the number
   growing: a 32-bit float that has counted up for hours resolves less than one
   pixel of the screen, and a smooth field turns into steps. Folding it back on
   itself keeps it small and stays continuous, where a wrap to zero would jump.
   The pattern has no direction, so the turn reads as more drift. */
float foldTime(float t) {
  float w = mod(t, 2.0 * TIME_FOLD);
  return TIME_FOLD - abs(w - TIME_FOLD);
}

float perlin3D(float amplitude, float frequency, float px, float py, float pz) {
  float x = px * frequency;
  float y = py * frequency;

  float fx = floor(x); float fy = floor(y); float fz = floor(pz);
  float cx = ceil(x);  float cy = ceil(y);  float cz = ceil(pz);

  vec3 g000 = gradientHash(vec3(fx, fy, fz));
  vec3 g100 = gradientHash(vec3(cx, fy, fz));
  vec3 g010 = gradientHash(vec3(fx, cy, fz));
  vec3 g110 = gradientHash(vec3(cx, cy, fz));
  vec3 g001 = gradientHash(vec3(fx, fy, cz));
  vec3 g101 = gradientHash(vec3(cx, fy, cz));
  vec3 g011 = gradientHash(vec3(fx, cy, cz));
  vec3 g111 = gradientHash(vec3(cx, cy, cz));

  float d000 = dot(g000, vec3(x - fx, y - fy, pz - fz));
  float d100 = dot(g100, vec3(x - cx, y - fy, pz - fz));
  float d010 = dot(g010, vec3(x - fx, y - cy, pz - fz));
  float d110 = dot(g110, vec3(x - cx, y - cy, pz - fz));
  float d001 = dot(g001, vec3(x - fx, y - fy, pz - cz));
  float d101 = dot(g101, vec3(x - cx, y - fy, pz - cz));
  float d011 = dot(g011, vec3(x - fx, y - cy, pz - cz));
  float d111 = dot(g111, vec3(x - cx, y - cy, pz - cz));

  float sx = quinticSmooth(x - fx);
  float sy = quinticSmooth(y - fy);
  float sz = quinticSmooth(pz - fz);

  float lx00 = mix(d000, d100, sx);
  float lx10 = mix(d010, d110, sx);
  float lx01 = mix(d001, d101, sx);
  float lx11 = mix(d011, d111, sx);

  float ly0 = mix(lx00, lx10, sy);
  float ly1 = mix(lx01, lx11, sy);

  return amplitude * mix(ly0, ly1, sz);
}

float auroraGlow(float t) {
  vec2 uv = gl_FragCoord.xy / uResolution.y;

  float noiseVal = 0.0;
  float freq = NOISE_FREQ;
  float amp = NOISE_AMP;
  vec2 samplePos = uv * SCALE;

  for (float i = 0.0; i < 3.0; i += 1.0) {
    noiseVal += perlin3D(amp, freq, samplePos.x, samplePos.y, t);
    amp *= OCTAVE_DECAY;
    freq *= 2.0;
  }

  float yBand = uv.y * 10.0 - BAND_HEIGHT * 10.0;
  return 0.3 * max(exp(BAND_SPREAD * (1.0 - 1.1 * abs(noiseVal + yBand))), 0.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float t = SPEED * 0.4 * uTime;

  float glow1 = auroraGlow(foldTime(t));
  float glow2 = auroraGlow(foldTime(t + LAYER_OFFSET));
  vec3 gradient1 = cosineGradient(
    uv.x + uTime * SPEED * 0.2 * COLOR_SPEED,
    vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.3, 0.20, 0.20)
  );
  vec3 gradient2 = cosineGradient(
    uv.x + uTime * SPEED * 0.1 * COLOR_SPEED,
    vec3(0.5), vec3(0.5), vec3(2.0, 1.0, 0.0), vec3(0.5, 0.20, 0.25)
  );

  vec3 col = 0.99 * glow1 * gradient1 * uColor1;
  col += 0.99 * glow2 * gradient2 * uColor2;
  col *= BRIGHTNESS;

  float alpha = clamp(length(col), 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}
`

/** Mint and violet, the same pair the aurora ramps through. */
const COLOR_1 = [0.5, 0.88, 0.66]
const COLOR_2 = [0.48, 0.25, 0.84]

/**
 * One turn of the shader clock. Both cosine gradients advance by a whole number
 * of their own periods over it (`uTime * 0.12` and `uTime * 0.06` reach 12 and
 * 6), and `SPEED * 0.4 * CLOCK_WRAP` is one full fold of the noise time, so the
 * wrap is invisible — and nothing the shader sees ever exceeds 24.
 */
const CLOCK_WRAP = 100

export default function SoftAurora() {
  const host = useShaderCanvas({
    vertex: VERT,
    fragment: FRAG,
    uniforms: { uColor1: COLOR_1, uColor2: COLOR_2 },
    resolutionComponents: 3,
    speed: 1000,
    wrap: CLOCK_WRAP,
    // Three octaves of 3D Perlin, twice per pixel. This is the most expensive
    // background here, so it gets the smallest buffer of the three.
    maxDpr: 1.25,
  })
  return <div ref={host} aria-hidden className="absolute inset-0" />
}
