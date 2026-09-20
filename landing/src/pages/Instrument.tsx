/* Shared instrument page — one component renders Fade / Pod / Trigger / Envoy.
 * Layout DNA reused from the template: LedgerHero descent header, DiveBand
 * zone transitions, numbered rows (core-caps rhythm), footer marquee. */
import { Link } from 'react-router'
import LedgerHero from '../components/LedgerHero'
import DiveBand from '../components/DiveBand'
import WordMarquee from '../components/WordMarquee'
import Footer from '../components/Footer'
import { config } from '../config'
import { INSTRUMENTS, PAGE_ORDER } from './instruments-data'

export default function Instrument({ slug }: { slug: string }) {
  const data = INSTRUMENTS.find((d) => d.slug === slug)!
  const idx = PAGE_ORDER.findIndex((p) => p.slug === slug)
  const prev = PAGE_ORDER[(idx - 1 + PAGE_ORDER.length) % PAGE_ORDER.length]
  const next = PAGE_ORDER[(idx + 1) % PAGE_ORDER.length]

  return (
    <div>
      <LedgerHero data={data.hero} />
      <DiveBand from={0} to={1} />

      <section className="pg-steps zone zone-z1" aria-label={data.mechanism.title}>
        <h2 className="pg-section-title" data-reveal>{data.mechanism.title}</h2>
        <div className="pg-steps__list">
          {data.mechanism.steps.map((s) => (
            <article className="pg-step" key={s.n} data-reveal>
              <span className="pg-step__n">{s.n}</span>
              <h3 className="pg-step__title">{s.title}</h3>
              <p className="pg-step__body">{s.body}</p>
            </article>
          ))}
        </div>
      </section>
      <DiveBand from={1} to={2} />

      <section className="pg-visual zone zone-z2">
        <figure className="pg-visual__fig" data-reveal>
          <img src={data.image.src} alt={data.image.alt} loading="lazy" decoding="async" />
          <figcaption className="pg-visual__cap">{data.image.caption}</figcaption>
        </figure>
        <div className="pg-visual__rules" data-reveal>
          <h2 className="pg-section-title">THE RULE</h2>
          <dl className="pg-params">
            {data.params.map((p) => (
              <div className="pg-params__row" key={p.label}>
                <dt>{p.label}</dt>
                <dd>{p.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <DiveBand from={2} to={3} />

      <section className="pg-life zone zone-z3">
        <h2 className="pg-section-title" data-reveal>LIFECYCLE</h2>
        <ol className="pg-life__flow" data-reveal>
          {data.lifecycle.map((s, i) => (
            <li key={s}>
              <span className="pg-life__chip">{s}</span>
              {i < data.lifecycle.length - 1 && <span className="pg-life__arrow" aria-hidden="true">→</span>}
            </li>
          ))}
        </ol>
        <div className="pg-proof" data-reveal>
          <h3 className="pg-proof__title">PROOF</h3>
          {data.proof.map((p) => (
            <p className="pg-proof__row" key={p.label}>
              <span>{p.label}</span>
              <code>{p.value}</code>
            </p>
          ))}
        </div>
      </section>
      <DiveBand from={3} to={4} />

      <section className="pg-cta zone zone-z4">
        <p className="pg-cta__kicker" data-reveal>THE RULE IS THE COUNTERPARTY</p>
        <a className="pg-cta__btn" href={data.cta.href} target="_blank" rel="noreferrer" data-reveal>
          {data.cta.label} <span aria-hidden="true">↗</span>
        </a>
        <nav className="pg-nav" aria-label="Instruments">
          <Link to={`/${prev.slug}`} className="pg-nav__link">← {prev.label}</Link>
          <Link to="/#instruments" className="pg-nav__link pg-nav__link--mid">ALL INSTRUMENTS</Link>
          <Link to={`/${next.slug}`} className="pg-nav__link">{next.label} →</Link>
        </nav>
      </section>

      <WordMarquee words={[data.tag, ...config.footer.marqueeWords]} duration={22} />
      <Footer />
    </div>
  )
}
