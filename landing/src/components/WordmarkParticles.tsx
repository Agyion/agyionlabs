import { useEffect, useRef, type RefObject } from 'react'
import type { HoleProjection } from '../../../shared/space-scene'

type Point = { x: number; y: number }
type Shard = { source: Point; born: number; life: number; size: number; bend: number; rotation: number }

/** Small fragments leave the actual letter outlines and follow the projected horizon. */
export default function WordmarkParticles({ projection }: { projection: RefObject<HoleProjection | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    const hero = canvas?.closest<HTMLElement>('.immersive-world')
    if (!canvas || !hero) return
    const context = canvas.getContext('2d')
    if (!context) return
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sources: Point[] = []
    const shards: Shard[] = []
    let width = 0, height = 0, frame = 0, last = 0, elapsed = 0, emission = 0
    let inView = true, disposed = false
    const measure = () => {
      const rect = canvas.getBoundingClientRect()
      width = rect.width; height = rect.height
      const ratio = Math.min(devicePixelRatio || 1, 1.5)
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      sources.length = 0; shards.length = 0
      for (const word of hero.querySelectorAll<HTMLElement>('.immersive-wordmark > span')) {
        const range = document.createRange(); range.selectNodeContents(word)
        const bounds = range.getBoundingClientRect()
        const style = getComputedStyle(word)
        const mask = document.createElement('canvas')
        mask.width = Math.ceil(bounds.width + 12); mask.height = Math.ceil(bounds.height + 12)
        const ink = mask.getContext('2d', { willReadFrequently: true })
        if (!ink) continue
        ink.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
        ink.letterSpacing = style.letterSpacing
        ink.fillStyle = '#fff'; ink.strokeStyle = '#fff'; ink.lineWidth = 1
        const text = word.textContent || ''
        const metrics = ink.measureText(text)
        const baseline = (bounds.height + metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2 + 6
        if (word === word.parentElement?.lastElementChild) ink.strokeText(text, 6, baseline)
        else ink.fillText(text, 6, baseline)
        const pixels = ink.getImageData(0, 0, mask.width, mask.height).data
        // Edge samples keep the word intact while tiny pieces appear to lift off it.
        for (let y = 2; y < mask.height - 2; y += 2) for (let x = Math.floor(mask.width * .25); x < mask.width - 2; x += 2) {
          const alpha = (px: number, py: number) => pixels[(py * mask.width + px) * 4 + 3]
          if (alpha(x, y) > 100 && (alpha(x + 2, y) < 70 || alpha(x, y - 2) < 70)) {
            sources.push({ x: bounds.left - rect.left + x - 6, y: bounds.top - rect.top + y - 6 })
          }
        }
      }
    }
    const tick = (time: number) => {
      frame = 0
      if (disposed || media.matches || document.hidden || !inView) return
      frame = requestAnimationFrame(tick)
      const dt = Math.min((time - last) / 1000 || 0, .05); last = time
      elapsed += dt
      context.clearRect(0, 0, width, height)
      const hole = projection.current
      if (!hole?.visible || document.documentElement.classList.contains('is-launching')) {
        shards.length = 0; return
      }
      emission += dt * (width < 600 ? 5 : 9)
      while (emission >= 1 && sources.length && shards.length < 80) {
        emission--
        shards.push({ source: sources[Math.floor(Math.random() * sources.length)], born: elapsed,
          life: 4.5 + Math.random() * 2, size: .8 + Math.random() * 1.6, bend: Math.random(), rotation: Math.random() * 6.28 })
      }
      // Scene coordinates are normalized to the same full hero canvas.
      const target = { x: hole.x * width, y: hole.y * height }
      const radius = Math.max(12, hole.radius * height)
      for (let i = shards.length - 1; i >= 0; i--) {
        const shard = shards[i]
        const t = (elapsed - shard.born) / shard.life
        if (t >= 1) { shards.splice(i, 1); continue }
        const smooth = t * t * (3 - 2 * t)
        const startAngle = Math.atan2(shard.source.y - target.y, shard.source.x - target.x)
        const distance = Math.hypot(shard.source.x - target.x, shard.source.y - target.y)
        const orbit = startAngle + smooth * (1.4 + shard.bend * .65)
        const reach = distance * Math.pow(1 - smooth, 1.12)
        // A gently curving orbit accelerates into the dark horizon, with no path reset.
        const x = target.x + Math.cos(orbit) * reach
        const y = target.y + Math.sin(orbit) * reach
        const fade = Math.min(1, t * 8) * Math.min(1, Math.max(0, (reach - radius * .42) / (radius * .75)))
        if (fade <= 0) continue
        const warm = Math.min(1, smooth * 1.6)
        context.save(); context.translate(x, y); context.rotate(shard.rotation + t * 3)
        context.globalAlpha = fade * .75
        context.fillStyle = `rgb(${Math.round(241 + warm * 5)} ${Math.round(238 - warm * 66)} ${Math.round(231 - warm * 136)})`
        const size = shard.size * (1 - smooth * .5)
        context.beginPath(); context.moveTo(-size, -size * .5); context.lineTo(size * 1.5, 0); context.lineTo(-size * .3, size); context.closePath(); context.fill()
        context.restore()
      }
    }
    const sync = () => {
      cancelAnimationFrame(frame); frame = 0; last = 0
      if (media.matches || document.hidden || !inView) { context.clearRect(0, 0, width, height); shards.length = 0 }
      else frame = requestAnimationFrame(tick)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(hero)
    observer.observe(canvas)
    const wordmark = hero.querySelector('.immersive-wordmark')
    if (wordmark) observer.observe(wordmark)
    const visibility = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync() }); visibility.observe(canvas)
    const onMotionChange = () => { measure(); sync() }
    media.addEventListener('change', onMotionChange); document.addEventListener('visibilitychange', sync)
    void document.fonts.ready.then(() => { if (!disposed) measure() })
    measure(); sync()
    return () => {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect(); visibility.disconnect()
      media.removeEventListener('change', onMotionChange); document.removeEventListener('visibilitychange', sync)
    }
  }, [projection])
  return <canvas className="wordmark-particles" ref={canvasRef} aria-hidden="true" />
}
