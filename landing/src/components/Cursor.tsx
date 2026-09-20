/* Custom cursor: direct-follow dot, lerped ring, data-cursor labels,
 * magnetic pull on small targets, pixel trail. Disabled on touch/small
 * screens and for reduced-motion users (CSS hides; JS never starts). */
import { useEffect, useRef } from 'react'
import { config } from '../config'
import { isCoarsePointer, prefersReducedMotion } from '../lib/motion'

const INTERACTIVE = 'a, button, [data-cursor], input, textarea, select, [role="button"]'

export default function Cursor() {
  const dotRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!config.cursor.enabled) return
    if (prefersReducedMotion() || isCoarsePointer()) return
    if (window.innerWidth <= 1024) return
    const dot = dotRef.current
    const ring = ringRef.current
    if (!dot || !ring) return

    let mouseX = -100
    let mouseY = -100
    let ringX = -100
    let ringY = -100
    let magnetRect: DOMRect | null = null
    const strength = config.cursor.magnetStrength
    let raf = 0
    let leaveTimer = 0

    const showLabel = (label: string) => {
      window.clearTimeout(leaveTimer)
      dot.classList.add('is-link')
      ring.setAttribute('data-cursor-label', label)
      ring.classList.add('is-link')
    }

    const hideLabel = () => {
      ring.classList.remove('is-link')
      dot.classList.remove('is-link')
      window.clearTimeout(leaveTimer)
      leaveTimer = window.setTimeout(() => {
        ring.setAttribute('data-cursor-label', config.cursor.defaultLabel)
      }, 140)
    }

    const onMove = (e: MouseEvent) => {
      mouseX = e.clientX
      mouseY = e.clientY
      dot.style.opacity = '1'
      ring.style.opacity = '1'
      const target = (e.target as Element | null)?.closest?.(INTERACTIVE) as HTMLElement | null
      if (target) {
        const labeled = target.closest('[data-cursor]') as HTMLElement | null
        showLabel(labeled?.dataset.cursor || config.cursor.defaultLabel)
        magnetRect = target.offsetWidth < 300 ? target.getBoundingClientRect() : null
      } else {
        if (ring.classList.contains('is-link')) hideLabel()
        magnetRect = null
      }
    }

    const onLeaveDoc = () => {
      dot.style.opacity = '0'
      ring.style.opacity = '0'
    }

    const loop = () => {
      raf = requestAnimationFrame(loop)
      const tx = magnetRect
        ? mouseX + (magnetRect.left + magnetRect.width / 2 - mouseX) * strength
        : mouseX
      const ty = magnetRect
        ? mouseY + (magnetRect.top + magnetRect.height / 2 - mouseY) * strength
        : mouseY
      ringX += (tx - ringX) * 0.18
      ringY += (ty - ringY) * 0.18
      dot.style.transform = `translate(${tx}px,${ty}px)`
      ring.style.transform = `translate(${ringX}px,${ringY}px)`
    }
    raf = requestAnimationFrame(loop)

    /* optional pixel-block trail (pool, GPU transforms, WAAPI fade) */
    let trailCleanup = () => {}
    if (config.cursor.trail) {
      const GRID = 5
      const MAX = 50
      const pool: HTMLDivElement[] = []
      const active = new Set<string>()
      let poolIdx = 0
      let prevX: number | null = null
      let prevY: number | null = null
      const frag = document.createDocumentFragment()
      for (let i = 0; i < MAX; i++) {
        const el = document.createElement('div')
        el.className = 'cursor-trail-block'
        frag.appendChild(el)
        pool.push(el)
      }
      document.body.appendChild(frag)

      const draw = (x: number, y: number) => {
        const key = `${x},${y}`
        if (active.has(key)) return
        const el = pool[poolIdx]
        poolIdx = (poolIdx + 1) % MAX
        if (el.dataset.pos) active.delete(el.dataset.pos)
        el.dataset.pos = key
        active.add(key)
        el.style.transform = `translate3d(${x}px,${y}px,0)`
        const anim = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1000, fill: 'forwards' })
        anim.onfinish = () => {
          active.delete(key)
          el.dataset.pos = ''
        }
      }

      const onTrail = (e: MouseEvent) => {
        const cols = Math.ceil(window.innerWidth / GRID)
        const rows = Math.ceil(window.innerHeight / GRID)
        if (prevX !== null && prevY !== null) {
          const dx = e.clientX - prevX
          const dy = e.clientY - prevY
          const steps = Math.max(Math.abs(dx), Math.abs(dy)) / GRID
          for (let i = 0; i <= steps; i++) {
            const t = steps > 0 ? i / steps : 0
            const cx = Math.floor((prevX + dx * t) / GRID)
            const cy = Math.floor((prevY + dy * t) / GRID)
            if (cx >= 0 && cx < cols && cy >= 0 && cy < rows) draw(cx * GRID, cy * GRID)
          }
        }
        prevX = e.clientX
        prevY = e.clientY
      }
      document.addEventListener('mousemove', onTrail, { passive: true })
      trailCleanup = () => {
        document.removeEventListener('mousemove', onTrail)
        pool.forEach((el) => el.remove())
      }
    }

    document.addEventListener('mousemove', onMove, { passive: true })
    document.documentElement.addEventListener('mouseleave', onLeaveDoc)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(leaveTimer)
      document.removeEventListener('mousemove', onMove)
      document.documentElement.removeEventListener('mouseleave', onLeaveDoc)
      trailCleanup()
    }
  }, [])

  if (!config.cursor.enabled) return null
  return (
    <>
      <div ref={dotRef} className="cursor-dot" aria-hidden="true" />
      <div
        ref={ringRef}
        className="cursor-ring"
        data-cursor-label={config.cursor.defaultLabel}
        aria-hidden="true"
      />
    </>
  )
}
