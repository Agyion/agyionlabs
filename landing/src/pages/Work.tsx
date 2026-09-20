/* Work list — split hero + 2-col archive grid + coming-soon marquee. */
import { useLayoutEffect, useRef } from 'react'
import { config } from '../config'
import { gsap } from '../lib/smoothScroll'
import { prefersReducedMotion } from '../lib/motion'
import LedgerHero from '../components/LedgerHero'
import WordMarquee from '../components/WordMarquee'
import Footer from '../components/Footer'
import DiveBand from '../components/DiveBand'
import { Link } from 'react-router'

export default function Work() {
  const { work, footer } = config
  const root = useRef<HTMLDivElement>(null)

  /* archive cards rise in with a per-column stagger as they enter */
  useLayoutEffect(() => {
    if (prefersReducedMotion()) return
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>('.work-card').forEach((el, i) => {
        gsap.fromTo(
          el,
          { opacity: 0, y: 72 },
          {
            opacity: 1,
            y: 0,
            duration: 1.05,
            delay: (i % 2) * 0.1,
            ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 92%', once: true },
          },
        )
      })
    }, root)
    return () => ctx.revert()
  }, [])

  return (
    <div ref={root}>
      <LedgerHero data={work.hero} />
      <DiveBand from={0} to={1} />
      <section className={`work-grid zone zone-z1${work.stagger ? ' work-grid--stagger' : ''}`} aria-label={config.copy.a11y.workGrid}>
        {work.projects.map((p) => (
          <article className="work-card" key={p.id} data-cursor={config.copy.cursor.preview}>
            <Link to={`/work/${p.slug}`} className="work-card__link" aria-label={p.title} />
            <div className="work-card__box">
              <img
                className="work-card__cover"
                src={p.cover.src}
                alt={p.cover.alt}
                loading="lazy"
                decoding="async"
              />
              <div className="work-card__blur" aria-hidden="true" />
              <div className="work-card__blend" aria-hidden="true" />
              <div className="work-card__meta" aria-hidden="true">
                <span className="work-card__index">{p.index} — {p.year}</span>
                <span className="work-card__action">{work.previewLabel}</span>
              </div>
            </div>
            <div className="work-card__info">
              <div className="work-card__date">{p.tags.join(' · ')} — {p.year}</div>
              <div className="work-card__title">{p.title}</div>
              <div className="work-card__subtitle">{p.subTitle}</div>
            </div>
          </article>
        ))}
      </section>
      <WordMarquee words={footer.marqueeWords} duration={24} />
      <DiveBand from={1} to={4} />
      <Footer />
    </div>
  )
}
