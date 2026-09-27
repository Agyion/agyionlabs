import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import ExampleArtwork from './ExampleArtwork'
import { INSTRUMENT_EXAMPLES } from './instrumentExamples'
import type { DetailInstrument } from './instrumentMechanismState'
import '../styles/instrument-example.css'

type Pending = { stage: number; blocked: boolean }

/** A user driven illustration. It never obtains a client or submits a transaction. */
export default function InstrumentExample({ kind, caveat }: { kind: DetailInstrument; caveat?: string }) {
  const example = INSTRUMENT_EXAMPLES[kind]
  const root = useRef<HTMLDivElement>(null)
  const tween = useRef<gsap.core.Tween | null>(null)
  const pending = useRef<Pending | null>(null)
  const reduced = useRef(false)
  const restoreActionFocus = useRef(false)
  const [stage, setStage] = useState(0)
  const [busy, setBusy] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [moving, setMoving] = useState<'money' | 'condition' | 'rejected'>('condition')
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    if (busy || !restoreActionFocus.current) return
    restoreActionFocus.current = false
    const active = document.activeElement
    if (active === document.body || (active && root.current?.contains(active))) {
      root.current?.querySelector<HTMLButtonElement>('[data-action="next"], [data-action="reset"]')?.focus({ preventScroll: true })
    }
  }, [busy, stage, blocked])

  const clearMotion = () => {
    tween.current?.kill()
    tween.current = null
    root.current?.style.setProperty('--example-progress', '0')
    root.current?.style.setProperty('--example-pulse', '0')
    root.current?.querySelector<SVGElement>('[data-example-token]')?.setAttribute('opacity', '0')
  }

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    reduced.current = media.matches
    const onMotionChange = () => {
      reduced.current = media.matches
      // Finish exactly once if the preference changes during a demonstration.
      const current = pending.current
      if (media.matches && current) {
        pending.current = null
        clearMotion()
        setStage(current.stage)
        setBlocked(current.blocked)
        setBusy(false)
        setAnnouncement(current.blocked ? example.failure.title : example.steps[current.stage].title)
      }
    }
    media.addEventListener('change', onMotionChange)
    return () => {
      pending.current = null
      clearMotion()
      media.removeEventListener('change', onMotionChange)
    }
  }, [example])

  const reset = () => {
    restoreActionFocus.current = Boolean(root.current?.contains(document.activeElement))
    pending.current = null
    clearMotion()
    setBusy(false)
    setBlocked(false)
    setStage(0)
    setMoving('condition')
    setAnnouncement('Example reset. ' + example.steps[0].title)
  }

  const play = (reject = false) => {
    if (pending.current || blocked || stage === 3) return
    restoreActionFocus.current = Boolean(root.current?.contains(document.activeElement))
    const next = { stage: reject ? stage : stage + 1, blocked: reject }
    pending.current = next
    setBusy(true)
    setAnnouncement('')
    const complete = () => {
      if (pending.current !== next) return
      pending.current = null
      clearMotion()
      setStage(next.stage)
      setBlocked(next.blocked)
      setBusy(false)
      setAnnouncement(next.blocked ? example.failure.title : example.steps[next.stage].title)
    }
    const path = root.current?.querySelector<SVGPathElement>('[data-example-route]')
    const token = root.current?.querySelector<SVGElement>('[data-example-token]')
    if (reduced.current || !path || !token) { complete(); return }

    const length = path.getTotalLength()
    const position = { progress: 0 }
    // Claims carry permission, not money. Funds only travel on funding/payment steps.
    const money = (kind === 'fade' && stage === 2) ||
      ((kind === 'pod' || kind === 'trigger') && (stage === 0 || stage === 2)) ||
      (kind === 'envoy' && stage === 2)
    setMoving(reject ? 'rejected' : money ? 'money' : 'condition')
    const reverse = (kind === 'fade' || kind === 'envoy') && stage === 2
    const start = reverse ? 1 : stage === 2 ? .5 : 0
    const end = reject ? .43 : reverse ? 0 : stage === 0 ? .5 : 1
    const draw = () => {
      const progress = position.progress
      const point = path.getPointAtLength((start + (end - start) * progress) * length)
      token.setAttribute('transform', `translate(${point.x} ${point.y})`)
      token.setAttribute('opacity', String(Math.min(1, progress * 8, (1 - progress) * 8)))
      root.current?.style.setProperty('--example-progress', String(progress))
      root.current?.style.setProperty('--example-pulse', String(Math.sin(progress * Math.PI)))
    }
    draw()
    tween.current = gsap.to(position, { progress: 1, duration: reject ? 1.5 : 2.1, ease: 'power2.inOut', onUpdate: draw, onComplete: complete })
  }

  const current = example.steps[stage]
  const status = busy ? 'running' : blocked ? 'blocked' : stage === 3 ? 'complete' : stage === 0 ? 'ready' : 'step'
  return <div className={`instrument-example instrument-example--${kind}`} ref={root}
    data-example={kind} data-stage={stage} data-status={status} data-moving={moving} aria-busy={busy}>
    <header className="example-heading">
      <h2>{example.title}</h2>
      <span className="example-disclosure">Illustration only. No money moves.</span>
    </header>

    <ol className="example-progress" aria-label="Example progress">
      {example.steps.map((step, index) => <li key={step.label} aria-current={index === stage ? 'step' : undefined} data-complete={index < stage}>
        <span className="example-progress__number" aria-hidden="true">{index < stage ? '✓' : index + 1}</span><span>{step.label}</span>
      </li>)}
    </ol>

    <div className="example-scene" aria-label={`${example.title} ${current.title}`}>
      <div className="example-actors">{example.actors.map(actor => <span key={actor}>{actor}</span>)}</div>
      <ExampleArtwork kind={kind} stage={stage} blocked={blocked} />
      <div className="example-balances">{current.balances.map((balance, index) => <div key={index}>
        <span className="sr-only">{example.actors[index]}: </span><strong>{balance}</strong>
      </div>)}</div>
      {busy && <span className="example-transit" aria-hidden="true">{moving === 'money' ? 'Funds in motion' : 'Following the condition'}</span>}
    </div>

    <div className="example-action-panel">
      <div className="example-outcome" data-blocked={blocked}>
        <div><h3>{busy ? moving === 'rejected' ? 'Checking this attempt…' : current.moving : blocked ? example.failure.title : current.title}</h3>
          <p>{blocked ? example.failure.detail : current.detail}</p></div>
      </div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>

      <div className="example-controls">
        {stage < 3 && !blocked && <button type="button" className="example-next" data-action="next" disabled={busy} onClick={() => play()}>
          {busy ? 'Following the example…' : current.action}<span aria-hidden="true">↗</span>
        </button>}
        {!blocked && stage === example.failure.at && <button className="example-alternative" type="button" data-action="alternative" disabled={busy} onClick={() => play(true)}>{example.failure.action}</button>}
        <button type="button" className="example-reset" data-action="reset" disabled={stage === 0 && !busy && !blocked} onClick={reset}>{stage === 3 || blocked ? 'Start again' : 'Reset example'}<span aria-hidden="true">↺</span></button>
      </div>
    </div>
    <p className="example-note">{caveat ?? example.note}</p>
  </div>
}
