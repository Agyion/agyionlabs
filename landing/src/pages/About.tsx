/* About — pixel marquee hero, showreel expansion scrub, year counter,
 * 6-face capability cube carousel, roster with cursor-follow image. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { config } from '../config'
import { gsap, ScrollTrigger } from '../lib/smoothScroll'
import { prefersReducedMotion } from '../lib/motion'
import Footer from '../components/Footer'
import DiveBand from '../components/DiveBand'

const FACE_ROTATIONS = [
  'rotateX(0deg) rotateY(0deg)', // front
  'rotateX(0deg) rotateY(180deg)', // back
  'rotateX(0deg) rotateY(-90deg)', // right
  'rotateX(0deg) rotateY(90deg)', // left
  'rotateX(-90deg) rotateY(0deg)', // top
  'rotateX(90deg) rotateY(0deg)', // bottom
]

export default function About() {
  const root = useRef<HTMLDivElement>(null)
  const { about } = config
  const [face, setFace] = useState(0)
  const [counter, setCounter] = useState(() => (prefersReducedMotion() ? about.years.to : about.years.from))
  const rosterImgRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (prefersReducedMotion()) return
    const ctx = gsap.context(() => {
      /* showreel: small frame expands to full viewport while pinned */
      gsap.fromTo(
        '.showreel__frame',
        { scale: 0.35 },
        {
          scale: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: '.showreel',
            start: 'top top',
            end: 'bottom bottom',
            scrub: 1,
          },
        },
      )

      /* year counter scrubbed from→to across the section */
      ScrollTrigger.create({
        trigger: '.years',
        start: 'top 80%',
        end: 'bottom 30%',
        scrub: 0.8,
        onUpdate: (self) => {
          const { from, to } = config.about.years
          setCounter(Math.round(from + (to - from) * self.progress))
        },
      })
    }, root)
    ScrollTrigger.refresh()
    return () => ctx.revert()
  }, [about.years.from, about.years.to])

  /* roster cursor-follow image (fixed layer, clip reveal) */
  useEffect(() => {
    const box = rosterImgRef.current
    if (!box) return
    if (window.matchMedia('(hover: none), (pointer: coarse)').matches) return
    let raf = 0
    let tx = 0
    let ty = 0
    let cx = 0
    let cy = 0
    const onMove = (e: MouseEvent) => {
      tx = e.clientX
      ty = e.clientY
    }
    const loop = () => {
      raf = requestAnimationFrame(loop)
      cx += (tx - cx) * 0.16
      cy += (ty - cy) * 0.16
      box.style.transform = `translate(${cx - 150}px,${cy - 105}px)`
    }
    raf = requestAnimationFrame(loop)
    document.addEventListener('mousemove', onMove, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('mousemove', onMove)
    }
  }, [])

  const showRosterImg = (src: string) => {
    const box = rosterImgRef.current
    if (!box) return
    const img = box.querySelector('img')
    if (img && img.getAttribute('src') !== src) img.setAttribute('src', src)
    box.classList.add('is-visible')
  }

  const hideRosterImg = () => rosterImgRef.current?.classList.remove('is-visible')

  return (
    <div ref={root}>
      <section className="about-hero zone zone-z0" aria-label={config.brandName}>
        <div className="about-hero__track">
          {[0, 1].map((dup) => (
            <span key={dup} aria-hidden={dup === 1}>
              {[...about.marqueeWords, ...about.marqueeWords].map((w, i) => (
                <span className="about-hero__word" key={i}>
                  {w}
                </span>
              ))}
            </span>
          ))}
        </div>
      </section>

      <DiveBand from={0} to={1} />
      <section className="showreel zone zone-z1" style={{ height: about.showreel.heightPx }} aria-label={config.copy.a11y.showreel}>
        <div className="showreel__sticky">
          <div className="showreel__frame">
            <video
              src={about.showreel.video.src}
              poster={about.showreel.video.poster}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
            />
          </div>
          <p className="showreel__label">{about.showreel.label}</p>
        </div>
      </section>

      <DiveBand from={1} to={2} />
      <section className="years zone zone-z2" aria-label={about.years.label}>
        <div className="years__row" aria-hidden="true">
          <div className="years__track" id="year-left">
            {Array.from({ length: 12 }, (_, i) => (
              <span key={i}>{about.years.from + (i % (about.years.to - about.years.from + 1))}</span>
            ))}
          </div>
        </div>
        <div className="years__counter">
          <span className="years__number" id="year-counter">
            {counter}
          </span>
          <span className="years__label">{about.years.label}</span>
        </div>
        <div className="years__row years__row--reverse" aria-hidden="true">
          <div className="years__track" id="year-right">
            {Array.from({ length: 12 }, (_, i) => (
              <span key={i}>{about.years.to - (i % (about.years.to - about.years.from + 1))}</span>
            ))}
          </div>
        </div>
      </section>

      <DiveBand from={2} to={3} />
      <section className="cc zone zone-z3" aria-label={config.copy.a11y.capabilities}>
        <div className="cc__scene">
          <div className="cc__cube" id="cc-cube" style={{ transform: FACE_ROTATIONS[face] }}>
            {(['front', 'back', 'right', 'left', 'top', 'bottom'] as const).map((slot, i) => (
              <div key={slot} className={`cc__face cc__face--${slot}`} data-face={slot}>
                <div className="cc__face-inner">
                  <span className="cc__face-icon" aria-hidden="true">
                    {about.cube.faces[i].icon}
                  </span>
                  <span className="cc__face-title">{about.cube.faces[i].title}</span>
                  <span className="cc__face-zh">{about.cube.faces[i].subTitle}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <nav className="cc__nav" aria-label={config.copy.a11y.capabilityNav}>
          {about.cube.faces.map((f, i) => (
            <button
              key={f.title}
              type="button"
              className={`cc__nav-btn${i === face ? ' is-active' : ''}`}
              aria-label={f.title}
              aria-pressed={i === face}
              onClick={() => setFace(i)}
            >
              <span aria-hidden="true">{f.icon}</span>
            </button>
          ))}
        </nav>
      </section>

      <section className="roster zone zone-z3" aria-label={about.roster.heading}>
        <h2 className="roster__heading" data-reveal>{about.roster.heading}</h2>
        {about.roster.clients.map((c) => (
          <div
            key={c.name}
            className="roster__row"
            data-cursor={config.copy.cursor.view}
            onMouseEnter={() => showRosterImg(c.image.src)}
            onMouseLeave={hideRosterImg}
          >
            <span>{c.name}</span>
            <span className="roster__note">{c.note}</span>
          </div>
        ))}
        <div ref={rosterImgRef} className="roster__cursor-img" aria-hidden="true">
          <img src={about.roster.clients[0]?.image.src} alt="" decoding="async" />
        </div>
      </section>

      <section className="awards zone zone-z3" aria-label={about.awards.heading}>
        <h2 className="awards__heading" data-reveal>{about.awards.heading}</h2>
        {about.awards.items.map((a) => (
          <div className="awards__row" key={`${a.year}-${a.title}`}>
            <span className="awards__year">{a.year}</span>
            <span className="awards__title">{a.title}</span>
            <span className="awards__org">{a.org}</span>
          </div>
        ))}
      </section>

      <DiveBand from={3} to={4} />
      <Footer />
    </div>
  )
}
