/* Text scramble reveal — resolves random glyphs into the target string
 * left-to-right. Lightweight interval implementation, no plugin dependency.
 * Callers must skip this entirely under reduced-motion. */
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&/=+'

const timers = new WeakMap<HTMLElement, number>()

export function scrambleIn(el: HTMLElement, duration = 0.9): void {
  const target = el.dataset.scrambleText ?? el.textContent ?? ''
  el.dataset.scrambleText = target
  if (!target.trim()) return
  const prev = timers.get(el)
  if (prev !== undefined) window.clearInterval(prev)
  const start = performance.now()
  const tick = () => {
    const t = Math.min(1, (performance.now() - start) / (duration * 1000))
    if (t >= 1) {
      el.textContent = target
      timers.delete(el)
      return
    }
    /* resolved prefix grows with t; unresolved chars stay random glyphs */
    const resolved = Math.floor(target.length * t)
    let out = target.slice(0, resolved)
    for (let i = resolved; i < target.length; i++) {
      const ch = target[i]
      out += ch === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0]
    }
    el.textContent = out
  }
  timers.set(el, window.setInterval(tick, 40))
  tick()
}
