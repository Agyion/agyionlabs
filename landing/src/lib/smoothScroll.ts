/* Smooth-scroll + scroll-effect engine.
 * Lenis (lerp 0.09) drives native scroll; GSAP ScrollTrigger consumes it.
 * Reduced-motion: Lenis is never created — native scroll, effects static.
 */
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { prefersReducedMotion } from './motion'

gsap.registerPlugin(ScrollTrigger)

export { gsap, ScrollTrigger }

const SCROLL_CLASS_THRESHOLD = 300

let lenis: Lenis | null = null
let rafCb: ((time: number) => void) | null = null

export function initSmoothScroll(): Lenis | null {
  if (lenis || prefersReducedMotion()) return lenis
  lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1.0 })
  rafCb = (time: number) => lenis?.raf(time * 1000)
  gsap.ticker.add(rafCb)
  gsap.ticker.lagSmoothing(0)
  lenis.on('scroll', ScrollTrigger.update)
  return lenis
}

export function getLenis(): Lenis | null {
  return lenis
}

export function destroySmoothScroll() {
  if (rafCb) gsap.ticker.remove(rafCb)
  rafCb = null
  lenis?.destroy()
  lenis = null
}

/** Toggles html.show-nav-scroll past the threshold — the fixed-logo ↔ pill
 * handoff. Returns the cleanup. */
export function initNavScrollClass(threshold = SCROLL_CLASS_THRESHOLD): () => void {
  const onScroll = () => {
    document.documentElement.classList.toggle('show-nav-scroll', window.scrollY > threshold)
  }
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
  return () => window.removeEventListener('scroll', onScroll)
}

/** Scroll progress (0..1) subscription for the progress bar. */
export function onScrollProgress(cb: (p: number) => void): () => void {
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    cb(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0)
  }
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll, { passive: true })
  return () => {
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onScroll)
  }
}

/** React-friendly ScrollTrigger scope: runs `fn` inside a gsap.context and
 * reverts it on cleanup. No-op body still refreshes triggers. */
export function withScrollScope(root: React.RefObject<HTMLElement | null>, fn: () => void) {
  return () => {
    const ctx = gsap.context(fn, root)
    ScrollTrigger.refresh()
    return () => ctx.revert()
  }
}
