/* Ledger — the local proof record + signed Proof Pack export page. */
import { Link } from 'react-router'
import LedgerHero from '../components/LedgerHero'
import DiveBand from '../components/DiveBand'
import WordMarquee from '../components/WordMarquee'
import Footer from '../components/Footer'
import { config } from '../config'
import { LEDGER, PAGE_ORDER } from './instruments-data'

export default function Ledger() {
  const idx = PAGE_ORDER.findIndex((p) => p.slug === 'ledger')
  const prev = PAGE_ORDER[(idx - 1 + PAGE_ORDER.length) % PAGE_ORDER.length]
  const next = PAGE_ORDER[(idx + 1) % PAGE_ORDER.length]

  return (
    <div>
      <LedgerHero data={LEDGER.hero} />
      <DiveBand from={0} to={1} />

      <section className="pg-steps zone zone-z1" aria-label="Ledger properties">
        <h2 className="pg-section-title" data-reveal>THE RECORD</h2>
        <div className="pg-steps__list">
          {LEDGER.features.map((s) => (
            <article className="pg-step" key={s.n} data-reveal>
              <span className="pg-step__n">{s.n}</span>
              <h3 className="pg-step__title">{s.title}</h3>
              <p className="pg-step__body">{s.body}</p>
            </article>
          ))}
        </div>
      </section>
      <DiveBand from={1} to={3} />

      <section className="pg-pack zone zone-z3">
        <h2 className="pg-section-title" data-reveal>PROOF PACK — SIGNED JSON</h2>
        <div className="pg-pack__box" data-reveal>
          <div className="pg-pack__head">
            <span>proof-pack.json</span>
            <span>SIGNED</span>
          </div>
          <ul className="pg-pack__fields">
            {LEDGER.packFields.map((f) => (
              <li key={f}><code>{f}</code></li>
            ))}
          </ul>
          <p className="pg-pack__kernel">
            KERNEL <code>{LEDGER.kernel}</code>
          </p>
        </div>
      </section>
      <DiveBand from={3} to={4} />

      <section className="pg-cta zone zone-z4">
        <p className="pg-cta__kicker" data-reveal>YOUR HISTORY IS YOURS</p>
        <a className="pg-cta__btn" href={LEDGER.cta.href} target="_blank" rel="noreferrer" data-reveal>
          {LEDGER.cta.label} <span aria-hidden="true">↗</span>
        </a>
        <nav className="pg-nav" aria-label="Pages">
          <Link to={`/${prev.slug}`} className="pg-nav__link">← {prev.label}</Link>
          <Link to="/#instruments" className="pg-nav__link pg-nav__link--mid">ALL INSTRUMENTS</Link>
          <Link to={`/${next.slug}`} className="pg-nav__link">{next.label} →</Link>
        </nav>
      </section>

      <WordMarquee words={['PROOF PACK', ...config.footer.marqueeWords]} duration={22} />
      <Footer />
    </div>
  )
}
