/* Auto marquee strip (footer / work / contact) — seamless CSS loop over a
 * doubled set of words. */
import { useMemo } from 'react'

interface Props {
  words: string[]
  /** seconds for one full loop */
  duration?: number
  className?: string
}

export default function WordMarquee({ words, duration = 22, className = '' }: Props) {
  const set = useMemo(
    () => (
      <>
        {words.map((w, i) => (
          <span key={i} aria-hidden={i > 0 || undefined}>
            <span className="word-marquee__item">{w}</span>
            <span className="word-marquee__sep" />
          </span>
        ))}
      </>
    ),
    [words],
  )
  return (
    <div className={`word-marquee ${className}`} aria-hidden="true">
      <div className="word-marquee__track" style={{ ['--marquee-duration' as string]: `${duration}s` }}>
        <span className="word-marquee__set" style={{ display: 'inline-flex', alignItems: 'center' }}>{set}</span>
        <span className="word-marquee__set" style={{ display: 'inline-flex', alignItems: 'center' }}>{set}</span>
      </div>
    </div>
  )
}
