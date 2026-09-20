/* Ledger hero primitive — a descent-ledger composition: top mono data strip,
 * a weight-contrast word pair (solid 800 + outline 340, offset), the desc as
 * a right column, and a hairline that draws itself in. Shared by work / lab /
 * blog / contact heroes; entrance via .is-entered. */
import { useEffect, useRef, useState } from 'react'
import type { LedgerHero as LedgerHeroData } from '../types'

export default function LedgerHero({ data }: { data: LedgerHeroData }) {
  const ref = useRef<HTMLElement>(null)
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => setEntered(true), 60)
    return () => window.clearTimeout(t)
  }, [])

  return (
    <header ref={ref} className={`ledger-hero zone zone-z0 zone-next-z1${entered ? ' is-entered' : ''}`}>
      <div className="ledger-hero__strip">
        <span className="ledger-hero__cell">{data.metaLeft}</span>
        <span className="ledger-hero__cell">{data.metaCenter}</span>
        <span className="ledger-hero__cell">{data.metaRight}</span>
      </div>
      <h1 className="ledger-hero__words" aria-label={`${data.left} ${data.right}`}>
        <span className="ledger-hero__mask">
          <span className="ledger-hero__inner ledger-hero__w1" aria-hidden="true">
            {data.left}
          </span>
        </span>
        <span className="ledger-hero__mask ledger-hero__mask--outline">
          <span className="ledger-hero__inner ledger-hero__w2" aria-hidden="true">
            {data.right}
          </span>
        </span>
      </h1>
      <div className="ledger-hero__foot">
        <span className="ledger-hero__rule" aria-hidden="true" />
        <p className="ledger-hero__desc">
          {data.desc.split('\n').map((line, i) => (
            <span key={i} style={{ ['--i' as string]: i }}>
              {line}
            </span>
          ))}
        </p>
      </div>
    </header>
  )
}
