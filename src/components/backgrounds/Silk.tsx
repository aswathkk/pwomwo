/**
 * Folds of woven light, drifting slowly across the screen.
 *
 * Ported from React Bits' Silk (MIT + Commons Clause, © David Haz —
 * https://reactbits.dev/backgrounds/silk). The shader is his. Upstream renders
 * it through `three` and React Three Fiber on a plane scaled to the viewport;
 * here it runs on the full-screen triangle the other backgrounds use, which
 * gives the same `vUv` and saves shipping a second WebGL library for one
 * fragment shader. The light-mode branch is dropped, and the colour is dark
 * enough that a white clock still clears contrast over the brightest fold.
 */

import { useShaderCanvas } from './useShaderCanvas'

const VERT = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const FRAG = `
precision highp float;

varying vec2 vUv;

uniform float uTime;
uniform vec3 uColor;

const float SPEED = 5.0;
const float SCALE = 1.0;
const float ROTATION = -0.35;
const float NOISE_INTENSITY = 1.2;

const float e = 2.71828182845904523536;

float noise(vec2 texCoord) {
  float G = e;
  vec2 r = (G * sin(G * texCoord));
  return fract(r.x * r.y * (1.0 + texCoord.x));
}

vec2 rotateUvs(vec2 uv, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  mat2 rot = mat2(c, -s, s, c);
  return rot * uv;
}

void main() {
  float rnd = noise(gl_FragCoord.xy);
  vec2 uv = rotateUvs(vUv * SCALE, ROTATION);
  vec2 tex = uv * SCALE;
  float tOffset = SPEED * uTime;

  tex.y += 0.03 * sin(8.0 * tex.x - tOffset);

  float pattern = 0.6 +
                  0.4 * sin(5.0 * (tex.x + tex.y +
                                   cos(3.0 * tex.x + 5.0 * tex.y) +
                                   0.02 * tOffset) +
                           sin(20.0 * (tex.x + tex.y - 0.1 * tOffset)));

  float grain = rnd / 15.0 * NOISE_INTENSITY;
  vec3 result = uColor * pattern - vec3(grain);
  gl_FragColor = vec4(clamp(result, 0.0, 1.0), 1.0);
}
`

/** #332a4d, a muted violet. The folds run from about a third of this to full,
    which keeps the brightest one far below the white of the clock. */
const COLOR = [0.2, 0.165, 0.302]

export default function Silk() {
  // Upstream advances its clock by 0.1 per second; 10000 ms per unit is the
  // same rate, and the folds cross the screen over a couple of minutes.
  const host = useShaderCanvas({
    vertex: VERT,
    fragment: FRAG,
    uniforms: { uColor: COLOR },
    speed: 10000,
  })
  return <div ref={host} aria-hidden className="absolute inset-0" />
}
