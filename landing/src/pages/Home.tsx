/* Home — loader, pinned hero (canvas ambience), scroll-driven pixel marquee,
 * 3D cube scrub, statement field, core capabilities, s3 scroll gallery. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { config } from '../config'
import type { HomeHeroFluid } from '../types'
import { gsap, ScrollTrigger, getLenis } from '../lib/smoothScroll'
import { isCoarsePointer, prefersReducedMotion } from '../lib/motion'
import { createFluidField, hexToRgb } from '../lib/fluid'
import type { Rgb } from '../lib/fluid'
import { scrambleIn } from '../lib/scramble'
import Loader from '../components/Loader'
import Footer from '../components/Footer'
import DiveBand from '../components/DiveBand'

/* Ambient canvas — a lightweight gradient field behind the hero, dark mood.
 * The third blob takes the instance's theme.glow (色彩情绪层).
 * Over a photographic bg (hero.bgImage) the canvas composites with
 * mix-blend-mode: screen — its black base drops out, blobs read as glow. */
function AmbientCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf = 0
    const reduced = prefersReducedMotion()

    const glowRaw = getComputedStyle(document.documentElement).getPropertyValue('--glow').trim() || '#c89a45'
    const hex = glowRaw.replace('#', '')
    const gi = parseInt(hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex, 16)
    const glow = `rgba(${(gi >> 16) & 255}, ${(gi >> 8) & 255}, ${gi & 255}, 0.10)`

    const draw = (t: number) => {
      const w = (canvas.width = canvas.clientWidth)
      const h = (canvas.height = canvas.clientHeight)
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
      const blobs = [
        { x: 0.24, y: 0.3, r: 0.42, c: 'rgba(38,34,28,0.9)' },
        { x: 0.78, y: 0.62, r: 0.5, c: 'rgba(24,28,34,0.9)' },
        { x: 0.55, y: 0.9, r: 0.38, c: 'rgba(32,26,20,0.85)' },
        { x: 0.42, y: 0.55, r: 0.55, c: glow },
      ]
      for (const [i, b] of blobs.entries()) {
        const drift = reduced ? 0 : Math.sin(t / 4000 + i * 2.1) * 0.05
        const g = ctx.createRadialGradient(
          (b.x + drift) * w,
          (b.y + drift * 0.6) * h,
          0,
          (b.x + drift) * w,
          (b.y + drift * 0.6) * h,
          b.r * Math.max(w, h),
        )
        g.addColorStop(0, b.c)
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, w, h)
      }
    }

    if (reduced) {
      draw(0)
      return
    }
    const loop = (t: number) => {
      draw(t)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return <canvas className="home-hero__bg-canvas" ref={ref} aria-hidden="true" />
}

/* Signature fluid ambience: a domain-warped fbm gradient
 * field behind the hero — theme-tinted, drifting, pushed by the pointer.
 * Same slot and screen blend as the ambient canvas it replaces when
 * hero.fluid is enabled; reduced-motion renders one static frame.
 * tone='light' re-voices the field as ink dispersing in
 * water — the buffer paints the zone surface as its base and composites with
 * multiply, so only the dark/teal bands touch the foam background. */
function FluidCanvas({ fluid, tone = 'dark' }: { fluid: HomeHeroFluid; tone?: 'dark' | 'light' }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const glowRaw = getComputedStyle(document.documentElement).getPropertyValue('--glow').trim() || '#c89a45'
    const glow = hexToRgb(glowRaw)
    const dim = (c: Rgb, k: number): Rgb => ({ r: c.r * k, g: c.g * k, b: c.b * k })
    const lift = (c: Rgb, k: number): Rgb => ({ r: c.r + (255 - c.r) * k, g: c.g + (255 - c.g) * k, b: c.b + (255 - c.b) * k })
    /* light tone: base = zone surface straight from config (CSS custom
     * properties resolve after mount effects — reading them here would race),
     * mid = steel teal, high = deep ink: dye blooming in water */
    const surface = hexToRgb(config.theme.depthZones?.surface ?? '#edf1ed')
    const palette: [Rgb, Rgb, Rgb] =
      tone === 'light'
        ? [surface, dim(glow, 0.72), dim(glow, 0.38)]
        : [dim(glow, 0.05), dim(glow, 0.4), lift(glow, 0.5)]
    const field = createFluidField(canvas, {
      speed: fluid.speed ?? 1,
      strength: fluid.strength ?? 0.6,
      palette,
      curve: tone,
    })
    if (fluid.mouse === false || isCoarsePointer()) return () => field.destroy()
    const onMove = (e: PointerEvent) => field.pointer(e.clientX / window.innerWidth, e.clientY / window.innerHeight)
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      field.destroy()
    }
  }, [fluid, tone])

  return <canvas className="home-hero__bg-canvas home-hero__bg-canvas--fluid" data-fluid="on" data-tone={tone} ref={ref} aria-hidden="true" />
}

export default function Home() {
  const root = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const { home } = config
  /* 'poster' centres the giant word as a monument, flips
   * the sub line to bottom-right and docks the wave images as a rail */
  const poster = home.hero.composition === 'poster'
  /* 'ledger' — descent ledger hero (data strip, solid +
   * outline word pair, left sub, specimen rail) on the foam surface zone */
  const ledger = home.hero.composition === 'ledger'

  /* hero letters arrive after the loader hands over */
  useEffect(() => {
    const delay = prefersReducedMotion() ? 0 : home.loader.enabled ? home.loader.holdMs : 200
    const t = window.setTimeout(() => setReady(true), delay)
    return () => window.clearTimeout(t)
  }, [home.loader])

  useLayoutEffect(() => {
    if (prefersReducedMotion()) return
    const ctx = gsap.context(() => {
      /* hero: wave strip / card stack drifts up as the hero scrolls away */
      gsap.to('.home-hero__wave, .home-hero__stack', {
        yPercent: -38,
        ease: 'none',
        scrollTrigger: { trigger: '.home-hero', start: 'top top', end: 'bottom top', scrub: 1 },
      })
      /* hero: flanking word columns recede faster and fade out */
      gsap.to('.home-hero__words', {
        yPercent: -46,
        opacity: 0,
        ease: 'none',
        scrollTrigger: { trigger: '.home-hero', start: 'top top', end: '60% top', scrub: 1 },
      })
      /* hero: ambient slow float on each wave/stack image except the raised
       * one (config: waveDrift) */
      if (config.home.hero.waveDrift) {
        gsap.to('.home-hero__wave img:not(.is-active), .home-hero__stack-card', {
          y: (i) => (i % 2 ? -9 : 9),
          duration: (i) => 6 + i * 0.7,
          yoyo: true,
          repeat: -1,
          ease: 'sine.inOut',
          stagger: 0.45,
        })
      }
      gsap.to('.home-hero__pair-mask--outline', {
        yPercent: 9,
        ease: 'none',
        scrollTrigger: { trigger: '.home-hero', start: 'top top', end: 'bottom top', scrub: 1 },
      })
      gsap.to('.home-hero__word, .home-hero__pair', {
        yPercent: -12,
        opacity: 0.25,
        ease: 'none',
        scrollTrigger: { trigger: '.home-hero', start: 'top top', end: 'bottom top', scrub: 1 },
      })

      /* scroll-driven title marquee (no CSS animation — JS transform) */
      const track = document.querySelector<HTMLElement>('.title-marquee__track')
      const setEl = document.querySelector<HTMLElement>('.title-marquee__set')
      if (track && setEl) {
        ScrollTrigger.create({
          trigger: '.title-marquee',
          start: 'top bottom',
          end: 'bottom top',
          scrub: 0.6,
          onUpdate: (self) => {
            const w = setEl.offsetWidth
            if (!w) return
            const dir = config.home.marquee.direction
            const x = (((-self.progress * dir * w * 0.6) % w) + w) % w
            gsap.set(track, { x: -x })
          },
        })
      }

      /* 3D cube — sticky stage: scale-up tumble-in, then a full rotation
       * scrubbed across the section (tumble → spin → zoom phases). */
      gsap.fromTo(
        '.cube-scene',
        { scale: 0.35, opacity: 0 },
        {
          scale: 1,
          opacity: 1,
          ease: 'none',
          scrollTrigger: { trigger: '.cube-section', start: 'top 85%', end: 'top 15%', scrub: 1 },
        },
      )
      gsap.fromTo(
        '.cube',
        { rotateX: -15, rotateY: -45 },
        {
          rotateX: -6,
          rotateY: 315,
          ease: 'none',
          scrollTrigger: { trigger: '.cube-section', start: 'top bottom', end: 'bottom top', scrub: 1.2 },
        },
      )

      /* statement — words are always present; a scroll
       * spotlight ramps small words baseOpacity → 1 towards the viewport
       * centre (with a slight far-blur), and text scrambles in on entry. */
      const spot = config.home.statement.spotlight ?? {}
      const baseOp = spot.baseOpacity ?? 0.6
      const farBlur = spot.farBlurPx ?? 2
      const spotWords = gsap.utils.toArray<HTMLElement>('.statement__word')
      const applySpotlight = () => {
        const mid = window.innerHeight / 2
        const range = window.innerHeight * 0.72
        for (const el of spotWords) {
          const r = el.getBoundingClientRect()
          const d = Math.min(1, Math.abs(r.top + r.height / 2 - mid) / range)
          if (el.classList.contains('statement__word--xl')) {
            gsap.set(el, { opacity: 1, filter: 'blur(0px)' })
          } else if (el.classList.contains('statement__line')) {
            /* manifesto lines are long-form editorial: a higher floor and
             * gentler blur keep distant beats readable */
            gsap.set(el, { opacity: 1 - (1 - 0.78) * d, filter: `blur(${(farBlur * 0.5 * d).toFixed(2)}px)` })
          } else {
            gsap.set(el, { opacity: 1 - (1 - baseOp) * d, filter: `blur(${(farBlur * d).toFixed(2)}px)` })
          }
        }
      }
      applySpotlight()
      ScrollTrigger.create({
        trigger: '.statement',
        start: 'top bottom',
        end: 'bottom top',
        onUpdate: applySpotlight,
        onRefresh: applySpotlight,
      })
      if (spot.scramble !== false) {
        spotWords.forEach((el) => {
          /* manifesto lines are long-form editorial — the scramble treatment
           * stays on the short scatter words and mono status lines */
          if (el.classList.contains('statement__line')) return
          const dur = el.classList.contains('statement__word--xl') ? 1.6 : 0.8
          ScrollTrigger.create({
            trigger: el,
            start: 'top bottom',
            end: 'bottom top',
            onEnter: () => scrambleIn(el, dur),
            onEnterBack: () => scrambleIn(el, dur),
          })
        })
      }

      /* statement status lines + readout reveal as they enter, staggered within a beat */
      gsap.utils.toArray<HTMLElement>('.statement__status, .statement__readout').forEach((el) => {
        const beatIndex = Array.prototype.indexOf.call(el.parentElement?.children ?? [], el)
        const endOpacity = el.classList.contains('statement__readout') ? 0.8 : 1
        gsap.fromTo(
          el,
          { opacity: 0, y: 60 },
          {
            opacity: endOpacity,
            y: 0,
            duration: 1.1,
            delay: Math.max(0, beatIndex) * 0.09,
            ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 88%', once: true },
          },
        )
      })

      /* capabilities rows */
      gsap.utils.toArray<HTMLElement>('.core-caps__row').forEach((el, i) => {
        gsap.fromTo(
          el,
          { opacity: 0, y: 40 },
          {
            opacity: 1,
            y: 0,
            duration: 0.9,
            delay: (i % 4) * 0.06,
            ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 90%', once: true },
          },
        )
      })

      /* s3 gallery — sticky viewport, horizontal scrub */
      const trackEl = document.querySelector<HTMLElement>('.scroll-gallery__track')
      if (trackEl) {
        const distance = () => Math.max(0, trackEl.scrollWidth - window.innerWidth + 40)
        gsap.to(trackEl, {
          x: () => -distance(),
          ease: 'none',
          scrollTrigger: {
            trigger: '.scroll-gallery',
            start: 'top top',
            end: 'bottom bottom',
            scrub: 1,
            invalidateOnRefresh: true,
          },
        })
      }
    }, root)
    ScrollTrigger.refresh()
    return () => ctx.revert()
  }, [])

  const giantWord = (
    <h1
      className="home-hero__word"
      aria-label={home.hero.brandWord}
      style={{ ['--hero-title-vw' as string]: `${home.hero.titleVw ?? 16}vw` }}
    >
      {home.hero.brandWord.split('').map((ch, i) => (
        <span key={i} style={{ ['--i' as string]: i }} aria-hidden="true">
          {ch}
        </span>
      ))}
    </h1>
  )

  /* ledger hero: weight-contrast pair over the foam
   * surface — solid brand word, outline companion word, offset right */
  const ledgerPair = (
    <h1 className="home-hero__pair" aria-label={[home.hero.brandWord, home.hero.brandWordOutline].filter(Boolean).join(' ')}>
      <span className="home-hero__pair-mask">
        <span className="home-hero__pair-inner home-hero__pair-w1" aria-hidden="true">
          {home.hero.brandWord}
        </span>
      </span>
      {home.hero.brandWordOutline && (
        <span className="home-hero__pair-mask home-hero__pair-mask--outline">
          <span className="home-hero__pair-inner home-hero__pair-w2" aria-hidden="true">
            {home.hero.brandWordOutline}
          </span>
        </span>
      )}
    </h1>
  )

  return (
    <div ref={root} className={ready ? 'is-ready' : undefined}>
      <Loader />
      <div
        className={`home-hero zone zone-z0${poster ? ' home-hero--poster' : ''}${ledger ? ' home-hero--ledger' : ''}${home.hero.ctas?.length ? ' home-hero--has-ctas' : ''}${ready ? ' is-ready' : ''}`}
      >
        <div className="home-hero__bg" aria-hidden="true">
          {home.hero.bgImage && (
            <img
              className="home-hero__bg-img"
              src={home.hero.bgImage.src}
              alt=""
              style={home.hero.bgImage.position ? { objectPosition: home.hero.bgImage.position } : undefined}
              decoding="async"
            />
          )}
          {home.hero.bgImage && <div className="home-hero__bg-scrim" style={{ opacity: home.hero.bgDim ?? 0.5 }} />}
          {home.hero.fluid?.enabled ? <FluidCanvas fluid={home.hero.fluid} tone={ledger && !home.hero.bgImage ? 'light' : 'dark'} /> : <AmbientCanvas />}
        </div>
        {ledger ? (
          <p className="home-hero__strip" aria-hidden="true">
            <span>{config.brandName}</span>
            <span>{home.hero.kicker}</span>
          </p>
        ) : (
          <p className="home-hero__kicker">{home.hero.kicker}</p>
        )}
        {/* poster: the word rides a centring overlay so the gsap scrub on
         * .home-hero__word itself stays untouched */}
        {poster ? <div className="home-hero__word-center">{giantWord}</div> : ledger ? ledgerPair : giantWord}
        <p className="home-hero__sub">{home.hero.subLine}</p>
        {home.hero.ctas && home.hero.ctas.length > 0 && (
          <div className="home-hero__ctas">
            {home.hero.ctas.map((cta) => {
              const external = /^https?:\/\//.test(cta.href)
              const hash = cta.href.startsWith('#') ? cta.href.slice(1) : cta.href.startsWith('/#') ? cta.href.slice(2) : null
              return (
                <a
                  key={cta.label}
                  className={`home-hero__cta${cta.primary ? ' home-hero__cta--primary' : ''}`}
                  href={cta.href}
                  target={external ? '_blank' : undefined}
                  rel={external ? 'noopener noreferrer' : undefined}
                  data-cursor={config.copy.cursor.open}
                  onClick={
                    hash
                      ? (e) => {
                          e.preventDefault()
                          const el = document.getElementById(hash)
                          if (!el) return
                          const lenis = getLenis()
                          if (lenis) lenis.scrollTo(el)
                          else el.scrollIntoView({ behavior: 'smooth' })
                        }
                      : undefined
                  }
                >
                  <span className="home-hero__cta-label">{cta.label}</span>
                  <span className="home-hero__cta-arrow" aria-hidden="true">
                    {external ? '↗' : '↓'}
                  </span>
                </a>
              )
            })}
          </div>
        )}
        {home.hero.wordColumns && (
          <div className="home-hero__words" aria-hidden="true">
            {(['left', 'right'] as const).map((side) => (
              <ul key={side} className={`home-hero__words-col home-hero__words-col--${side}`}>
                {home.hero.wordColumns?.[side].map((w, i) => (
                  <li key={i} style={{ ['--i' as string]: i }}>
                    {w}
                  </li>
                ))}
              </ul>
            ))}
          </div>
        )}
        {home.hero.stack ? (
          /* floating card stack: middle wave image
           * raised as the main card, the rest clustered around it, tilted,
           * deep-shadowed, pressing the hero bottom edge */
          <div className="home-hero__stack" aria-hidden="true">
            {home.hero.wave.map((img, i) => {
              const mid = Math.floor(home.hero.wave.length / 2)
              if (i === mid) {
                return <img key={i} src={img.src} alt="" className="home-hero__stack-main" loading={i > 1 ? 'lazy' : undefined} decoding="async" />
              }
              const slot = (i < mid ? i : i - 1) % 4
              return (
                <img
                  key={i}
                  src={img.src}
                  alt=""
                  className={`home-hero__stack-card home-hero__stack-card--${slot}`}
                  loading={i > 1 ? 'lazy' : undefined}
                  decoding="async"
                />
              )
            })}
          </div>
        ) : ledger ? (
          /* ledger composition: the wave becomes a uniform specimen rail —
           * hairline cells, mono indices, even baseline (mechanism: the same
           * scroll scrub drives .home-hero__wave) */
          <div className="home-hero__wave home-hero__wave--specimen" aria-hidden="true">
            {home.hero.wave.map((img, i) => (
              <span className="home-hero__cell" key={i}>
                <img src={img.src} alt="" loading={i > 1 ? 'lazy' : undefined} decoding="async" />
                <span className="home-hero__cell-idx">{String(i + 1).padStart(2, '0')}</span>
              </span>
            ))}
          </div>
        ) : (
          <div
            className={
              poster
                ? 'home-hero__wave home-hero__wave--rail'
                : home.hero.waveOverlap
                  ? 'home-hero__wave home-hero__wave--overlap'
                  : 'home-hero__wave'
            }
            aria-hidden="true"
          >
            {home.hero.wave.map((img, i) => (
              <img
                key={i}
                src={img.src}
                alt=""
                className={home.hero.waveOverlap && i === Math.floor(home.hero.wave.length / 2) ? 'is-active' : undefined}
                loading={i > 1 ? 'lazy' : undefined}
                decoding="async"
              />
            ))}
          </div>
        )}
      </div>

      <section className="title-marquee zone zone-z0 zone-next-z1 zone-grad" aria-label={home.marquee.items.map((i) => i.text).join(', ')}>
        <div className="title-marquee__track">
          {[0, 1].map((dup) => (
            <div className="title-marquee__set" key={dup} aria-hidden={dup === 1}>
              {home.marquee.items.map((item, i) => (
                <span className="title-marquee__block" key={i}>
                  <span className="title-marquee__item">{item.text}</span>
                  <span className="title-marquee__label">{item.label}</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="cube-section zone zone-z1" aria-label={config.copy.a11y.cube}>
        <div className="cube-section__sticky">
          <div
            className="cube-scene"
            style={
              home.cube.zoom
                ? ({
                    '--cube-zoom-vw': String(home.cube.zoom.vw * home.cube.zoom.scale * 100),
                    '--cube-zoom-vh': String(home.cube.zoom.vh * home.cube.zoom.scale * 100),
                  } as React.CSSProperties)
                : undefined
            }
          >
            <div className="cube">
              {(['front', 'back', 'right', 'left', 'top', 'bottom'] as const).map((face, i) => (
                <div key={face} className={`cube__face cube__face--${face}`}>
                  <img src={home.cube.faces[i].src} alt="" loading="lazy" decoding="async" />
                </div>
              ))}
            </div>
          </div>
          <p className="cube-section__caption">{config.copy.ui.cubeCaption}</p>
        </div>
      </section>

      <DiveBand from={1} to={2} />
      <section
        id="manifesto"
        className={`statement zone zone-z2 zone-next-z3${ledger ? ' zone-grad statement--manifesto' : ''}`}
        style={{ minHeight: home.statement.heightPx }}
      >
        <div className="statement__inner">
          {home.statement.manifesto ? (
            /* manifesto form: editorial descent lines lit
             * by the same spotlight curve (each line carries .statement__word
             * so the scroll ramp/blur applies unchanged) */
            <>
              {home.statement.manifesto.lines.map((ln, li) => (
                <div className="statement__word statement__line" key={`m${li}`}>
                  {ln.em && ln.text.includes(ln.em) ? (
                    <>
                      {ln.text.split(ln.em)[0]}
                      <em>{ln.em}</em>
                      {ln.text.split(ln.em).slice(1).join(ln.em)}
                    </>
                  ) : (
                    ln.text
                  )}
                </div>
              ))}
              {home.statement.statusLines?.map((s, si) => (
                <div
                  className={`statement__status${s.pos !== 'left' ? ` statement__word--${s.pos}` : ''}`}
                  style={s.offsetY ? { marginTop: s.offsetY } : undefined}
                  key={`s${si}`}
                >
                  <span className="statement__status-text">{s.text}</span>
                  <span className="statement__status-block" aria-hidden="true" />
                </div>
              ))}
            </>
          ) : (
            (() => {
              const beats: ReactNode[] = home.statement.groups.map((group, gi) => (
                <div className="statement__group" key={`g${gi}`}>
                  {group.map((word, wi) => (
                    <div
                      key={wi}
                      className={`statement__word${word.size === 'xl' ? ' statement__word--xl' : ''}${
                        word.pos !== 'left' ? ` statement__word--${word.pos}` : ''
                      }`}
                      style={word.offsetY ? { marginTop: word.offsetY } : undefined}
                    >
                      {word.text}
                    </div>
                  ))}
                </div>
              ))
              /* terminal-style status lines spliced between beats */
              home.statement.statusLines?.forEach((s, si) => {
                const at = Math.min(beats.length, Math.round(((si + 1) * beats.length) / ((home.statement.statusLines?.length ?? 1) + 1)))
                beats.splice(
                  at,
                  0,
                  <div
                    className={`statement__status${s.pos !== 'left' ? ` statement__word--${s.pos}` : ''}`}
                    style={s.offsetY ? { marginTop: s.offsetY } : undefined}
                    key={`s${si}`}
                  >
                    <span className="statement__status-text">{s.text}</span>
                    <span className="statement__status-block" aria-hidden="true" />
                  </div>,
                )
              })
              return beats
            })()
          )}
          {home.statement.readout && (
            <div className="statement__readout">
              {home.statement.readout.map((token, i) => (
                <span key={i} className={`statement__readout-token statement__readout-token--${i}`}>
                  {token}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="core-caps zone zone-z3" id="how-it-works">
        <h2 className="core-caps__heading" data-reveal>{home.capabilities.heading}</h2>
        {home.capabilities.items.map((item) => (
          <div className="core-caps__row" key={item.index}>
            <span className="core-caps__index">{item.index}</span>
            <h3 className="core-caps__title">{item.title}</h3>
            <p className="core-caps__body">{item.body}</p>
          </div>
        ))}
      </section>

      <section
        className="scroll-gallery zone zone-z3 zone-next-z4 zone-grad"
        id="instruments"
        style={
          {
            height: home.gallery.heightPx,
            '--gallery-card-w': `clamp(${home.gallery.card?.minPx ?? 420}px, ${home.gallery.card?.vw ?? 45}vw, ${home.gallery.card?.maxPx ?? 648}px)`,
            '--gallery-card-aspect': home.gallery.card?.aspect ?? '4 / 3',
          } as React.CSSProperties
        }
      >
        <div className="scroll-gallery__sticky">
          <h2 className="scroll-gallery__heading" data-reveal>{home.gallery.heading}</h2>
          <div className="scroll-gallery__track">
            {home.gallery.images.map((img, i) => {
              const card = home.gallery.cards?.[i]
              return (
                <figure className="scroll-gallery__card" key={i}>
                  <img src={img.src} alt={img.alt} loading="lazy" decoding="async" />
                  {card ? (
                    <figcaption className="scroll-gallery__info">
                      <span className="scroll-gallery__info-top">
                        <span className="scroll-gallery__tag">[{card.tag}]</span>
                        <span className="scroll-gallery__num">{String(i + 1).padStart(2, '0')}</span>
                      </span>
                      <span className="scroll-gallery__body">{card.body}</span>
                    </figcaption>
                  ) : (
                    <figcaption>
                      {String(i + 1).padStart(2, '0')} — {config.copy.ui.galleryFragmentLabel}
                    </figcaption>
                  )}
                </figure>
              )
            })}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
