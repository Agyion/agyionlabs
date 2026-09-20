/* Motion preference helpers — every atmosphere/scroll effect degrades here. */
import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(QUERY).matches
}

/** Reactive hook version; re-renders when the OS setting flips. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion)
  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

/** True when the custom cursor / hover layers should stay off. */
export function isCoarsePointer(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(hover: none), (pointer: coarse)').matches
  )
}
