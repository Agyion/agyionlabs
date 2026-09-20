/* Depth gauge — signature chrome ("scroll = descent").
 * Fixed right-edge rail: hairline track, major tick marks with mono depth
 * labels, a drop marker lerped to scroll progress and a live depth readout.
 * Replaces the top progress bar when config.depthGauge.enabled is set.
 * Desktop only (CSS hides < 1024px); reduced-motion safe — the marker is
 * position-driven, no autonomous animation. Self-adapting contrast via
 * mix-blend-mode: difference (same treatment as the cursor). */
import { useEffect, useRef } from 'react'
import { config } from '../config'

export default function DepthGauge() {
  const dropRef = useRef<HTMLSpanElement>(null)
  const readRef = useRef<HTMLSpanElement>(null)
  const maxDepth = config.depthGauge?.maxDepthM ?? 4000

  useEffect(() => {
    let raf = 0
    let current = 0
    let target = 0
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const measure = () => {
      const doc = document.documentElement
      const span = Math.max(1, doc.scrollHeight - window.innerHeight)
      target = Math.min(1, Math.max(0, window.scrollY / span))
    }

    const tick = () => {
      const prev = current
      current = reduced ? target : current + (target - current) * 0.14
      if (Math.abs(target - current) < 0.0004) current = target
      /* velocity stretch: the drop elongates along the rail while the page
       * is moving fast, settling back as it slows (position-driven only) */
      const v = Math.min(1, Math.abs(current - prev) * 40)
      const depth = Math.round(current * maxDepth)
      if (dropRef.current) {
        dropRef.current.style.top = `${8 + current * 84}%`
        dropRef.current.style.transform = `rotate(45deg) scaleY(${(1 + v * 1.6).toFixed(3)})`
      }
      if (readRef.current) {
        const label = `−${String(depth).padStart(4, '0')} M`
        if (readRef.current.textContent !== label) readRef.current.textContent = label
      }
      raf = window.requestAnimationFrame(tick)
    }

    measure()
    window.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    raf = window.requestAnimationFrame(tick)
    return () => {
      window.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
      window.cancelAnimationFrame(raf)
    }
  }, [maxDepth])

  const majors = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ top: 8 + f * 84, label: Math.round(f * maxDepth) }))
  const minors = [0.125, 0.375, 0.625, 0.875].map((f) => 8 + f * 84)

  return (
    <div className="depth-gauge" aria-hidden="true">
      <span className="depth-gauge__rail" />
      {majors.map((m) => (
        <span key={m.top} className="depth-gauge__tick is-major" style={{ top: `${m.top}%` }}>
          <span className="depth-gauge__num">{String(m.label).padStart(4, '0')}</span>
        </span>
      ))}
      {minors.map((t) => (
        <span key={t} className="depth-gauge__tick" style={{ top: `${t}%` }} />
      ))}
      <span ref={dropRef} className="depth-gauge__drop" style={{ top: '8%' }} />
      <span ref={readRef} className="depth-gauge__read">
        −0000 M
      </span>
      <span className="depth-gauge__cap is-top">SURFACE</span>
      <span className="depth-gauge__cap is-bottom">ABYSS</span>
    </div>
  )
}
