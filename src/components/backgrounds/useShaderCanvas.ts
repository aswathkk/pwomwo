/**
 * The lifecycle every shader background shares, so that each one is only its
 * shader. This app runs for hours on a phone, which the upstream versions of
 * these effects do not assume:
 *
 *   - the loop stops whenever the tab is hidden, and the shader clock picks up
 *     where it left off rather than jumping by however long you were away;
 *   - `prefers-reduced-motion` draws one frame and never starts the loop;
 *   - the device pixel ratio is capped, since these are smooth gradients and a
 *     phone GPU pays for every pixel of a 3× buffer;
 *   - a lost context stops the loop instead of spinning on a dead canvas;
 *   - the uniforms are held by reference, so a frame allocates nothing.
 *
 * Every shader gets `uTime` (seconds of shader time) and `uResolution` (the
 * drawing buffer, in device pixels — `gl_FragCoord` is in those, and passing
 * the CSS size instead is only ever right at a ratio of 1).
 */

import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'
import { Mesh, Program, Renderer, Triangle } from 'ogl'

export interface ShaderCanvasSpec {
  vertex: string
  fragment: string
  /** Constant uniforms by name; the value is copied, so a module-level table
      is safe to pass. `uTime` and `uResolution` are provided. */
  uniforms?: Record<string, unknown>
  /** `uResolution` as `[w, h]`, or `[w, h, w / h]` when a shader wants the
      aspect ratio alongside it. */
  resolutionComponents?: 2 | 3
  /** Milliseconds of wall clock per unit of `uTime`. */
  speed: number
  /**
   * Wraps `uTime` at this value. A uniform is a 32-bit float, and a clock that
   * only ever grows eventually has a step per pixel smaller than its own last
   * place, at which point a smooth gradient quantises into bands. Set it to a
   * period the shader is continuous across, or leave it off for a shader whose
   * clock stays small enough not to care.
   */
  wrap?: number
  maxDpr?: number
}

const DEFAULT_MAX_DPR = 1.5

export function useShaderCanvas(spec: ShaderCanvasSpec) {
  const host = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  // Read inside the effect so that re-rendering the component does not tear
  // the GL context down and build it again. Every field is constant per
  // background, so there is nothing to go stale.
  const latest = useRef(spec)
  latest.current = spec

  useEffect(() => {
    const node = host.current
    if (!node) return
    const { vertex, fragment, uniforms = {}, resolutionComponents = 2, speed, wrap } =
      latest.current
    const maxDpr = latest.current.maxDpr ?? DEFAULT_MAX_DPR

    let renderer: Renderer
    try {
      renderer = new Renderer({
        alpha: true,
        premultipliedAlpha: true,
        antialias: true,
        dpr: Math.min(window.devicePixelRatio || 1, maxDpr),
      })
    } catch {
      // No WebGL. Every background that uses this draws over a base layer that
      // is a finished background on its own, so there is nothing to fall back
      // to and nothing worth reporting.
      return
    }

    const gl = renderer.gl
    const canvas = gl.canvas as HTMLCanvasElement
    gl.clearColor(0, 0, 0, 0)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    canvas.style.backgroundColor = 'transparent'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.display = 'block'

    const uTime = { value: 0 }
    const uResolution = { value: resolutionComponents === 3 ? [1, 1, 1] : [1, 1] }
    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        uTime,
        uResolution,
        ...Object.fromEntries(Object.entries(uniforms).map(([k, value]) => [k, { value }])),
      },
    })
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program })
    node.appendChild(canvas)

    // Set once the context is gone. Nothing here rebuilds the program, the
    // mesh or the buffers, so every later draw would be a call against deleted
    // objects: a blank canvas, a loop that never stops, and a GL error per
    // frame in the console.
    let lost = false

    const draw = () => renderer.render({ scene: mesh })

    const resize = () => {
      const width = node.offsetWidth
      const height = node.offsetHeight
      if (lost || width === 0 || height === 0) return
      renderer.setSize(width, height)
      const w = gl.drawingBufferWidth
      const h = gl.drawingBufferHeight
      uResolution.value = resolutionComponents === 3 ? [w, h, w / h] : [w, h]
      // Without this a resize while paused leaves a stretched last frame.
      draw()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(node)

    let frame = 0
    let last = 0
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (last !== 0) uTime.value += (now - last) / speed
      if (wrap) uTime.value %= wrap
      last = now
      draw()
    }

    const start = () => {
      if (frame !== 0 || reduceMotion || lost) return
      last = 0
      frame = requestAnimationFrame(tick)
    }
    const stop = () => {
      if (frame === 0) return
      cancelAnimationFrame(frame)
      frame = 0
    }

    const onVisibility = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', onVisibility)

    // The default is not prevented, so the browser does not offer the context
    // back: taking it would mean rebuilding everything, and the flat base layer
    // under this canvas is a complete background on its own.
    const onLost = () => {
      lost = true
      stop()
      canvas.remove()
    }
    canvas.addEventListener('webglcontextlost', onLost)

    resize()
    if (reduceMotion) draw()
    else if (!document.hidden) start()

    return () => {
      stop()
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.remove()
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [reduceMotion])

  return host
}
