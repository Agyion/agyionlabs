/* Lab — split hero, category tabs (desktop), 48-col scatterboard,
 * video lightbox (clip reveal, custom controls, progress, mute, toast). */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { config } from '../config'
import type { LabExperiment } from '../types'
import { gsap } from '../lib/smoothScroll'
import { prefersReducedMotion } from '../lib/motion'
import LedgerHero from '../components/LedgerHero'
import Footer from '../components/Footer'
import DiveBand from '../components/DiveBand'

export default function Lab() {
  const { lab } = config
  const root = useRef<HTMLDivElement>(null)
  const [filter, setFilter] = useState<string>(lab.allLabel)
  const [active, setActive] = useState<LabExperiment | null>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true)
  const [toast, setToast] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const toastTimer = useRef(0)

  const open = (exp: LabExperiment) => {
    if (!exp.video) return
    setActive(exp)
    setPlaying(false)
    setMuted(true)
    document.body.classList.add('menu-locked')
  }

  const close = useCallback(() => {
    setActive(null)
    setPlaying(false)
    document.body.classList.remove('menu-locked')
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && active) close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [active, close])

  /* focus the close button when the lightbox opens */
  useEffect(() => {
    if (active) {
      const t = window.setTimeout(() => closeRef.current?.focus(), 350)
      return () => window.clearTimeout(t)
    }
  }, [active])

  /* progress loop */
  useEffect(() => {
    if (!active) return
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const v = videoRef.current
      const fill = progressRef.current
      if (v && fill && v.duration > 0) {
        fill.style.width = `${(v.currentTime / v.duration) * 100}%`
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [active])

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  /* scatterboard items drift in with a loose per-column stagger */
  useLayoutEffect(() => {
    if (prefersReducedMotion()) return
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>('.lab-item').forEach((el, i) => {
        gsap.fromTo(
          el,
          { opacity: 0, y: 56 },
          {
            opacity: 1,
            y: 0,
            duration: 0.95,
            delay: (i % 5) * 0.07,
            ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 94%', once: true },
          },
        )
      })
    }, root)
    return () => ctx.revert()
  }, [])

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      void v.play()
      setPlaying(true)
    } else {
      v.pause()
      setPlaying(false)
    }
  }

  const toggleMute = () => {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
    setToast(true)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(false), 1400)
  }

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current
    if (!v || v.duration <= 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    v.currentTime = ((e.clientX - rect.left) / rect.width) * v.duration
  }

  const visibleCount = lab.experiments.length

  return (
    <div ref={root}>
      <LedgerHero data={lab.hero} />
      <DiveBand from={0} to={1} />

      <div className="lab-tabs zone zone-z1" role="tablist" aria-label={config.copy.a11y.labTabs}>
        {[lab.allLabel, ...lab.categories].map((cat) => (
          <button
            key={cat}
            type="button"
            role="tab"
            aria-selected={filter === cat}
            className={`lab-tab${filter === cat ? ' is--active' : ''}`}
            onClick={() => setFilter(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      <section className="lab-board zone zone-z1" aria-label={config.copy.a11y.labBoard} data-visible-count={visibleCount}>
        {lab.experiments.map((exp) => {
          const dimmed = filter !== lab.allLabel && exp.category !== filter
          return (
            <article key={exp.id} className={`lab-item${dimmed ? ' is--filtered-out' : ''}`}>
              <button
                type="button"
                className="lab-item__media"
                data-cursor={exp.video ? config.copy.cursor.video : config.copy.cursor.view}
                data-cursor-native={exp.video || undefined}
                aria-label={exp.video ? `${config.copy.ui.playPrefix} ${exp.title}` : exp.title}
                onClick={() => open(exp)}
                tabIndex={dimmed ? -1 : 0}
              >
                <img src={exp.image.src} alt={exp.image.alt} loading="lazy" decoding="async" />
                {exp.video && (
                  <span className="lab-item__play" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                )}
              </button>
              <div className="lab-item__title">{exp.title}</div>
              <div className="lab-item__meta">
                <span>{exp.date}</span>
                <span>{exp.tags.join(' · ')}</span>
              </div>
            </article>
          )
        })}
      </section>

      <div className={`lightbox${active ? ' is-active' : ''}`} role="dialog" aria-modal="true" aria-label={active?.title}>
        <div className="lightbox__bg" onClick={close} />
        {active?.video && (
          <div className="lightbox__wrap">
            <button ref={closeRef} type="button" className="lightbox__close" aria-label={lab.lightbox.closeAria} onClick={close}>
              ×
            </button>
            <div className="lightbox__content">
              <div className="lightbox__media">
                <video
                  ref={videoRef}
                  src={active.video.src}
                  poster={active.video.poster}
                  muted={muted}
                  loop
                  playsInline
                  autoPlay
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                />
                <div className={`lightbox__toast${toast ? ' is-visible' : ''}`} id="lightbox-toast">
                  {lab.lightbox.toastText}
                </div>
                <div className="lightbox__controls">
                  <button type="button" className="lightbox__btn" aria-label={lab.lightbox.playAria} onClick={togglePlay}>
                    {playing ? (
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>
                  <div
                    ref={progressRef}
                    className="lightbox__progress"
                    role="progressbar"
                    aria-label={config.copy.a11y.playbackProgress}
                    onClick={seek}
                  >
                    <div className="lightbox__progress-fill" id="video-progress-fill" />
                  </div>
                  <button
                    type="button"
                    className="lightbox__btn"
                    id="video-mute-btn"
                    aria-label={lab.lightbox.muteAria}
                    aria-pressed={!muted}
                    onClick={toggleMute}
                  >
                    {muted ? (
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4-2.7-2.7z" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <div className="lightbox__caption">
                {active.title} — {active.date}
              </div>
            </div>
          </div>
        )}
      </div>

      <DiveBand from={1} to={4} />
      <Footer />
    </div>
  )
}
