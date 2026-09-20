/* On/Off Ramp — the TRY↔USDC bridge page (SEP-10/6/12/38 over the TR mock anchor). */
import { Link } from 'react-router'
import LedgerHero from '../components/LedgerHero'
import DiveBand from '../components/DiveBand'
import WordMarquee from '../components/WordMarquee'
import Footer from '../components/Footer'
import { config } from '../config'
import { RAMP, PAGE_ORDER } from './instruments-data'

export default function Ramp() {
  const idx = PAGE_ORDER.findIndex((p) => p.slug === 'ramp')
  const prev = PAGE_ORDER[(idx - 1 + PAGE_ORDER.length) % PAGE_ORDER.length]
  const next = PAGE_ORDER[(idx + 1) % PAGE_ORDER.length]

  return (
    <div>
      <LedgerHero data={RAMP.hero} />
      <DiveBand from={0} to={1} />

      <section className="pg-steps zone zone-z1" aria-label="Anchor flow">
        <h2 className="pg-section-title" data-reveal>THE FLOW</h2>
        <div className="pg-steps__list">
          {RAMP.steps.map((s) => (
            <article className="pg-step" key={s.n} data-reveal>
              <span className="pg-step__n">{s.n}</span>
              <h3 className="pg-step__title">{s.title}</h3>
              <p className="pg-step__body">{s.body}</p>
            </article>
          ))}
        </div>
        <p className="pg-anchor" data-reveal>
          ANCHOR <code>{RAMP.anchor}</code>
        </p>
      </section>
      <DiveBand from={1} to={3} />

      <section className="pg-note zone zone-z3">
        <h2 className="pg-note__title" data-reveal>{RAMP.note.title}</h2>
        <p className="pg-note__body" data-reveal>{RAMP.note.body}</p>
      </section>
      <DiveBand from={3} to={4} />

      <section className="pg-cta zone zone-z4">
        <p className="pg-cta__kicker" data-reveal>TRY IN — USDC OUT — TRY BACK</p>
        <a className="pg-cta__btn" href={RAMP.cta.href} target="_blank" rel="noreferrer" data-reveal>
          {RAMP.cta.label} <span aria-hidden="true">↗</span>
        </a>
        <nav className="pg-nav" aria-label="Pages">
          <Link to={`/${prev.slug}`} className="pg-nav__link">← {prev.label}</Link>
          <Link to="/#instruments" className="pg-nav__link pg-nav__link--mid">ALL INSTRUMENTS</Link>
          <Link to={`/${next.slug}`} className="pg-nav__link">{next.label} →</Link>
        </nav>
      </section>

      <WordMarquee words={['NO DISCRETION', ...config.footer.marqueeWords]} duration={22} />
      <Footer />
    </div>
  )
}
