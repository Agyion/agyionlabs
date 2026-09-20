/* Film-grain overlay: pre-baked noise frames flipped at 25fps (12fps while
 * scrolling cools down). Off on small screens / reduced-motion / hidden tab. */
import { useEffect, useRef } from 'react'
import { config } from '../config'
import { prefersReducedMotion } from '../lib/motion'

const FRAMES = 10
const SCROLL_HOLD_MS = 180
const RESIZE_DEBOUNCE = 160

export default function Noise() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!config.noise.enabled) return
    const canvas = canvasRef.current
    if (!canvas) return
    if (window.innerWidth <= 768 || prefersReducedMotion()) {
      canvas.style.display = 'none'
      return
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { opacity, density, fps, fpsHold } = config.noise
    Object.assign(canvas.style, {
      display: 'block',
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      zIndex: '9999',
      pointerEvents: 'none',
      mixBlendMode: 'screen',
      opacity: String(opacity),
    } satisfies Partial<CSSStyleDeclaration>)

    let frames: ImageData[] = []
    let frameIdx = 0
    let rafId = 0
    let timerId = 0
    let resizeTimer = 0
    let scrollHoldUntil = 0
    let running = false

    const bake = (w: number, h: number) => {
      frames = []
      for (let i = 0; i < FRAMES; i++) {
        const idata = ctx.createImageData(w, h)
        const buf = new Uint32Array(idata.data.buffer)
        for (let p = 0; p < buf.length; p++) {
          if (Math.random() < density) buf[p] = 0xffffffff
        }
        frames.push(idata)
      }
    }

    const tick = () => {
      if (!running) return
      rafId = 0
      const cooling = performance.now() < scrollHoldUntil
      if (!cooling && document.visibilityState !== 'hidden') {
        frameIdx = (frameIdx + 1) % FRAMES
        ctx.putImageData(frames[frameIdx], 0, 0)
      }
      timerId = window.setTimeout(() => {
        rafId = window.requestAnimationFrame(tick)
      }, 1000 / (cooling ? fpsHold : fps))
    }

    const stop = () => {
      running = false
      window.clearTimeout(timerId)
      if (rafId) cancelAnimationFrame(rafId)
      rafId = 0
    }

    const start = () => {
      if (running) return
      running = true
      rafId = window.requestAnimationFrame(tick)
    }

    const setup = () => {
      stop()
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      bake(canvas.width, canvas.height)
      start()
    }

    const onScroll = () => {
      scrollHoldUntil = performance.now() + SCROLL_HOLD_MS
    }
    const onResize = () => {
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(setup, RESIZE_DEBOUNCE)
    }
    const onVisibility = () => (document.hidden ? stop() : start())

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    setup()

    return () => {
      stop()
      window.clearTimeout(resizeTimer)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  if (!config.noise.enabled) return null
  return <canvas ref={canvasRef} id="bg-noise" aria-hidden="true" />
}
