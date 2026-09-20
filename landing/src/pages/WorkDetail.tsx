/* Work detail — full-bleed hero (img scale 1.08→1 scrub), overview,
 * 2-col case grid with scroll reveal, prev/next arrows. */
import { useLayoutEffect, useRef } from 'react'
import { Link, useParams } from 'react-router'
import { config } from '../config'
import { gsap, ScrollTrigger } from '../lib/smoothScroll'
import { prefersReducedMotion } from '../lib/motion'
import Footer from '../components/Footer'
import DiveBand from '../components/DiveBand'
import NotFound from './NotFound'

export default function WorkDetail() {
  const { slug } = useParams()
  const root = useRef<HTMLDivElement>(null)
  const projects = config.work.projects
  const idx = projects.findIndex((p) => p.slug === slug)
  const project = idx >= 0 ? projects[idx] : undefined

  useLayoutEffect(() => {
    if (!project || prefersReducedMotion()) return
    const ctx = gsap.context(() => {
      /* hero image settles from 1.08 → 1 across the hero's scroll-out */
      gsap.fromTo(
        '.wd-hero__bg img',
        { scale: 1.08 },
        {
          scale: 1,
          ease: 'none',
          scrollTrigger: { trigger: '.wd-hero', start: 'top top', end: 'bottom top', scrub: 1.5 },
        },
      )

      /* case grid reveal — clip + rise, once per item */
      gsap.utils.toArray<HTMLElement>('.wd-grid__item img').forEach((el) => {
        gsap.fromTo(
          el,
          { clipPath: 'inset(18% 0% 18% 0%)', scale: 1.12, opacity: 0.4 },
          {
            clipPath: 'inset(0% 0% 0% 0%)',
            scale: 1,
            opacity: 1,
            ease: 'none',
            scrollTrigger: { trigger: el, start: 'top 95%', end: 'top 45%', scrub: 0.6 },
          },
        )
      })
    }, root)
    ScrollTrigger.refresh()
    return () => ctx.revert()
  }, [project])

  if (!project) return <NotFound />

  const prev = projects[(idx - 1 + projects.length) % projects.length]
  const next = projects[(idx + 1) % projects.length]

  return (
    <div ref={root}>
      <section className="wd-hero">
        <div className="wd-hero__bg">
          <img src={project.hero.src} alt={project.hero.alt} decoding="async" />
        </div>
        <div className="wd-hero__scrim" aria-hidden="true" />
        <h1 className="wd-hero__title">
          <span>{project.title}</span>
          <span>{project.subTitle}</span>
        </h1>
      </section>

      <DiveBand from={0} to={1} />
      <section className="wd-overview zone zone-z1">
        <h2 className="wd-overview__heading">{project.overview.heading}</h2>
        <p className="wd-overview__body">{project.overview.body}</p>
        <dl className="wd-overview__meta">
          {project.overview.meta.map((m) => (
            <div key={m.label}>
              <dt>{m.label}</dt>
              <dd>{m.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="wd-grid zone zone-z1" aria-label={`${project.title} ${config.copy.ui.caseImagesSuffix}`}>
        {project.images.map((img, i) => (
          <div className="wd-grid__item" key={i}>
            <img src={img.src} alt={img.alt} loading="lazy" decoding="async" />
          </div>
        ))}
      </section>

      <DiveBand from={1} to={3} />
      <nav className="wd-nav zone zone-z3" aria-label={config.copy.a11y.moreProjects}>
        <Link to={`/work/${prev.slug}`} data-cursor={config.copy.cursor.prev}>
          <span className="wd-nav__arrow" aria-hidden="true">
            ←
          </span>
          <span>{project.prevLabel}</span>
        </Link>
        <Link to={`/work/${next.slug}`} data-cursor={config.copy.cursor.next}>
          <span>{project.nextLabel}</span>
          <span className="wd-nav__arrow" aria-hidden="true">
            →
          </span>
        </Link>
      </nav>

      <DiveBand from={3} to={4} />
      <Footer />
    </div>
  )
}
