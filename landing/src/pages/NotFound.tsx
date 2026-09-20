/* 404 — pixel face with mouse-tracking eyes, glitch heading, typewriter,
 * and an embedded dino runner (space/click to jump, hi-score persisted). */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { config } from '../config'
import { DINO, initialState, jump, padScore, step, type DinoState } from '../lib/dino'
import { prefersReducedMotion } from '../lib/motion'

const HI_KEY = 'fluid-404-dino-hi'

/* Pixel glyphs. */
function PixelFace() {
  return (
    <svg viewBox="0 0 27 7" className="nf__graphic" aria-hidden="true">
      <g fill="currentColor">
        {/* 4 */}
        <rect x="3" y="1" width="1" height="1" />
        <rect x="2" y="2" width="1" height="1" />
        <rect x="1" y="3" width="1" height="1" />
        <rect x="0" y="4" width="6" height="1" />
        <rect x="4" y="0" width="1" height="7" />
        {/* square face */}
        <rect x="9" y="0" width="7" height="1" />
        <rect x="9" y="6" width="7" height="1" />
        <rect x="9" y="0" width="1" height="7" />
        <rect x="15" y="0" width="1" height="7" />
        <g id="nf-eyes">
          <rect x="11" y="2" width="1" height="1" />
          <rect x="13" y="2" width="1" height="1" />
        </g>
        <rect x="11" y="4" width="3" height="1" />
        {/* 4 */}
        <rect x="22" y="1" width="1" height="1" />
        <rect x="21" y="2" width="1" height="1" />
        <rect x="20" y="3" width="1" height="1" />
        <rect x="19" y="4" width="6" height="1" />
        <rect x="23" y="0" width="1" height="7" />
      </g>
    </svg>
  )
}

function DinoGlyph({ legs }: { legs: boolean }) {
  return (
    <svg viewBox="0 0 20 22" aria-hidden="true">
      <g fill="currentColor">
        <rect x="9" y="0" width="8" height="1" />
        <rect x="8" y="1" width="11" height="2" />
        <rect x="8" y="3" width="11" height="1" />
        <rect x="8" y="4" width="9" height="1" />
        <rect x="8" y="5" width="10" height="2" />
        <rect x="7" y="7" width="10" height="2" />
        <rect x="6" y="9" width="9" height="2" />
        <rect x="5" y="11" width="9" height="3" />
        <rect x="3" y="12" width="2" height="2" />
        <rect x="1" y="13" width="3" height="1" />
        <rect x="0" y="14" width="2" height="1" />
        <rect x="6" y="14" width="8" height="2" />
        {/* eye cutout */}
        <rect x="14" y="2" width="1" height="1" fill="#000" />
        {legs ? (
          <>
            <rect className="dino-player__leg" x="8" y="16" width="2" height="6" />
            <rect className="dino-player__leg--b dino-player__leg" x="12" y="16" width="2" height="6" />
          </>
        ) : (
          <>
            <rect x="8" y="16" width="2" height="6" />
            <rect x="12" y="16" width="2" height="6" />
          </>
        )}
      </g>
    </svg>
  )
}

function CactusGlyph() {
  return (
    <svg viewBox="0 0 12 22" aria-hidden="true">
      <g fill="currentColor">
        <rect x="5" y="0" width="3" height="22" />
        <rect x="1" y="6" width="2" height="7" />
        <rect x="1" y="6" width="5" height="2" />
        <rect x="9" y="9" width="2" height="6" />
        <rect x="6" y="9" width="5" height="2" />
      </g>
    </svg>
  )
}

function loadHi(): number {
  try {
    return Number(window.localStorage.getItem(HI_KEY)) || 0
  } catch {
    return 0
  }
}

export default function NotFound() {
  const { notFound } = config
  const reduced = prefersReducedMotion()
  const [typed, setTyped] = useState(reduced ? notFound.messages[0] : '')
  const [state, setState] = useState<DinoState>(() => initialState(loadHi()))
  const eyesRef = useRef<HTMLSpanElement>(null)
  const rafRef = useRef(0)
  const lastRef = useRef(0)

  /* typewriter */
  useEffect(() => {
    if (reduced) return
    let msg = 0
    let char = 0
    let deleting = false
    let timer = 0
    const tick = () => {
      const line = notFound.messages[msg]
      if (!deleting) {
        char += 1
        setTyped(line.slice(0, char))
        if (char >= line.length) {
          deleting = true
          timer = window.setTimeout(tick, 2200)
          return
        }
        timer = window.setTimeout(tick, 42)
      } else {
        char -= 1
        setTyped(line.slice(0, char))
        if (char <= 0) {
          deleting = false
          msg = (msg + 1) % notFound.messages.length
          timer = window.setTimeout(tick, 500)
          return
        }
        timer = window.setTimeout(tick, 18)
      }
    }
    timer = window.setTimeout(tick, 600)
    return () => window.clearTimeout(timer)
  }, [notFound.messages, reduced])

  /* eyes follow the cursor */
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const eyes = document.getElementById('nf-eyes')
      if (!eyes) return
      const dx = Math.max(-1, Math.min(1, (e.clientX / window.innerWidth - 0.5) * 2))
      const dy = Math.max(-1, Math.min(1, (e.clientY / window.innerHeight - 0.5) * 2))
      eyes.setAttribute('transform', `translate(${dx * 1.2},${dy * 1.2})`)
    }
    document.addEventListener('mousemove', onMove, { passive: true })
    return () => document.removeEventListener('mousemove', onMove)
  }, [])

  /* game loop */
  const sceneRef = useRef<HTMLDivElement>(null)
  const fieldWRef = useRef<number>(DINO.spawnX)
  useEffect(() => {
    const measure = () => {
      fieldWRef.current = sceneRef.current?.clientWidth || DINO.spawnX
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  useEffect(() => {
    if (reduced) return
    const loop = (t: number) => {
      rafRef.current = requestAnimationFrame(loop)
      const dt = lastRef.current ? Math.min(50, t - lastRef.current) : 16
      lastRef.current = t
      setState((s) => step(s, dt, Math.random, fieldWRef.current))
    }
    rafRef.current = requestAnimationFrame(loop)
    const onVis = () => {
      lastRef.current = 0
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelAnimationFrame(rafRef.current)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [reduced])

  /* persist hi-score */
  useEffect(() => {
    try {
      window.localStorage.setItem(HI_KEY, String(state.hiScore))
    } catch {
      /* private mode — non-fatal */
    }
  }, [state.hiScore])

  const onJump = useCallback(() => {
    setState((s) => {
      if (!s.alive) return { ...initialState(s.hiScore), obstacleX: null }
      return jump(s)
    })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault()
        onJump()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onJump])

  return (
    <div className="nf">
      <span ref={eyesRef} style={{ display: 'contents' }}>
        <PixelFace />
      </span>
      <h1 className="nf__heading" data-text={notFound.heading}>
        {notFound.heading}
      </h1>
      <p className="nf__message">
        <span id="nf-typewriter">{typed}</span>
        {!reduced && <span className="nf__caret" aria-hidden="true" />}
      </p>
      <div>
        <Link to={notFound.ctaHref} className="nf__cta" data-cursor={config.copy.cursor.home}>
          {notFound.ctaLabel}
        </Link>
      </div>
      <p className="nf__hint">{config.copy.ui.notFoundHint}</p>

      <div className="dino-scene" aria-hidden="true">
        <div className="dino-scene__inner" ref={sceneRef} onClick={onJump}>
          <div className="dino-score">
            <span className="dino-score__hi">
              {notFound.hiScoreLabel} {padScore(state.hiScore)}
            </span>
            <span className="dino-score__current">{padScore(state.score)}</span>
          </div>
          <span className="dino-cloud" style={{ top: 18, animationDuration: '26s', fontSize: 18 }}>
            ▪▪
          </span>
          <span className="dino-cloud" style={{ top: 44, animationDuration: '38s', animationDelay: '-12s', fontSize: 12 }}>
            ▪
          </span>
          <div className="dino-track" />
          <div className="dino-player" style={{ transform: `translateY(${-state.y}px)` }} id="dino-player">
            <DinoGlyph legs={!reduced && state.alive} />
          </div>
          {state.obstacleX !== null && (
            <div className="dino-obstacle" id="dino-obstacle" style={{ left: state.obstacleX }}>
              <CactusGlyph />
            </div>
          )}
          {!state.alive && (
            <div className="dino-game-over" id="dino-game-over">
              {config.copy.ui.notFoundGameOver}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
