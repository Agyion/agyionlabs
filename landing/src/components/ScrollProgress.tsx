/* 1.5px scroll progress bar, width-driven. */
import { useEffect, useRef } from 'react'
import { onScrollProgress } from '../lib/smoothScroll'

export default function ScrollProgress() {
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    return onScrollProgress((p) => {
      bar.style.width = `${(p * 100).toFixed(3)}%`
    })
  }, [])

  return <div ref={barRef} className="scroll-progress" aria-hidden="true" />
}
