import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import OrbitalScene from '../components/OrbitalScene'
import HowItWorksDialog from '../components/HowItWorksDialog'
import PodConditionTrial from '../components/PodConditionTrial'
import { INITIAL_POD_TRIAL, podTrialReducer, podTrialStage } from '../components/podTrial'

const INSTRUMENTS = [
  {
    id: 'fade', name: 'Fade', label: 'Falling price', description: 'A falling price. A proven handoff.',
    mechanism: 'The price falls. The handoff settles it.',
  },
  {
    id: 'pod', name: 'Pod', label: 'Time + secret', description: 'Funds behind a time lock and a secret.',
    mechanism: 'Time is one key. Your secret is the other.',
  },
  {
    id: 'trigger', name: 'Trigger', label: 'Event proof', description: 'Escrow released by your attester’s proof.',
    mechanism: 'An agreed event. A signed release.',
  },
  {
    id: 'envoy', name: 'Envoy', label: 'Agent limits', description: 'An agent’s authority, within your limits.',
    mechanism: 'Delegate the claim. Keep the boundaries.',
  },
] as const
type InstrumentId = (typeof INSTRUMENTS)[number]['id']

export default function Home() {
  const [selected, setSelected] = useState<InstrumentId | null>(null)
  const [podTrial, changePodTrial] = useReducer(podTrialReducer, INITIAL_POD_TRIAL)
  const location = useLocation()
  const navigate = useNavigate()
  const controls = useRef<Array<HTMLButtonElement | null>>([])
  const stage = useRef<HTMLElement>(null)
  const selectedRef = useRef<InstrumentId | null>(null)
  const previousHash = useRef(location.hash === '#how-it-works' ? '#home' : location.hash || '#home')
  const lastHash = useRef(location.hash)
  const explanationOpen = location.hash === '#how-it-works'
  const [backgroundHash, setBackgroundHash] = useState(location.hash === '#how-it-works' ? '#home' : location.hash)
  // The explanation keeps the spatial view it opened over, including on Back.
  if (!explanationOpen && backgroundHash !== location.hash) setBackgroundHash(location.hash)
  const exploring = (explanationOpen ? backgroundHash : location.hash) === '#instruments'
  const active = INSTRUMENTS.find(instrument => instrument.id === selected) ?? (exploring ? INSTRUMENTS[0] : null)
  const activeIndex = active ? INSTRUMENTS.indexOf(active) : 0

  const select = useCallback((id: InstrumentId | null) => {
    selectedRef.current = id
    setSelected(id)
    window.dispatchEvent(new CustomEvent('agyion:exhibit', { detail: { id } }))
  }, [])

  useEffect(() => {
    const returningFromDialog = lastHash.current === '#how-it-works'
    lastHash.current = location.hash
    if (location.hash === '#how-it-works') return
    previousHash.current = location.hash || '#home'
    if (returningFromDialog) return
    const home = !location.hash || location.hash === '#home'
    if (!home && (location.hash !== '#instruments' || selectedRef.current !== null)) return
    const frame = window.requestAnimationFrame(() => select(home ? null : 'fade'))
    return () => window.cancelAnimationFrame(frame)
  }, [location.hash, location.key, select])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('agyion:exhibit-view', { detail: { active: exploring } }))
  }, [exploring])

  useEffect(() => {
    const onSelect = (event: Event) => {
      const id: unknown = (event as CustomEvent<{ id?: unknown }>).detail?.id
      if (id === null || INSTRUMENTS.some(instrument => instrument.id === id)) {
        select(id as InstrumentId | null)
        if (id !== null && location.hash !== '#instruments') navigate('/#instruments')
      }
    }
    const returnToExhibit = () => {
      select(selectedRef.current ?? 'fade')
      window.dispatchEvent(new CustomEvent('agyion:exhibit-view', { detail: { active: true } }))
      stage.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' })
      stage.current?.focus({ preventScroll: true })
    }
    window.addEventListener('agyion:exhibit-select', onSelect)
    window.addEventListener('agyion:exhibit-focus', returnToExhibit)
    return () => {
      window.removeEventListener('agyion:exhibit-select', onSelect)
      window.removeEventListener('agyion:exhibit-focus', returnToExhibit)
    }
  }, [location.hash, navigate, select])

  const dismissExplanation = () => {
    navigate({ pathname: '/', hash: previousHash.current }, { replace: true })
  }

  const moveExhibit = (direction: number) => select(INSTRUMENTS[(activeIndex + direction + INSTRUMENTS.length) % INSTRUMENTS.length].id)

  return (
    <div className={`orbital-home orbital-home--immersive${selected ? ' has-selection' : ''}${exploring ? ' is-exploring' : ''}${explanationOpen ? ' is-explaining' : ''}`} data-selected={selected ?? 'none'} data-view={exploring ? 'instruments' : 'home'}>
      <section className="orbital-hero immersive-world" id="home" tabIndex={-1} aria-labelledby="hero-title">
        <OrbitalScene exhibitStage={active?.id === 'pod' && exploring ? podTrialStage(podTrial) : undefined} />
        <div className="orbital-hero__content immersive-intro" inert={exploring} aria-hidden={exploring || undefined}>
          <h1 id="hero-title" className="immersive-wordmark"><span>agyion</span><span>labs</span></h1>
          <p className="immersive-intro__copy">Conditional money.<br />Built on Stellar.</p>
          <a className="orbital-button immersive-launch" href="/app/">Launch app <span aria-hidden="true">↗</span></a>
        </div>

        <section className="orbital-hero__content immersive-exhibit" id="instrument-stage" ref={stage} tabIndex={-1} aria-labelledby="exhibit-title" aria-hidden={!exploring || undefined} inert={!exploring}>
          {active && <>
            <div className="immersive-exhibit__navigation"><span>Instruments <i aria-hidden="true">/</i> {String(activeIndex + 1).padStart(2, '0')} <span className="immersive-exhibit__total">of 04</span></span><div><button type="button" onClick={() => moveExhibit(-1)} aria-label="Previous instrument">←</button><button type="button" onClick={() => moveExhibit(1)} aria-label="Next instrument">→</button></div></div>
            <div className="immersive-exhibit__story" key={active.id} aria-live="polite" aria-atomic="true">
              <h2 id="exhibit-title">{active.name}<span>{active.label}</span></h2>
              {active.id !== 'pod' && <p className="immersive-exhibit__mechanism">{active.mechanism}</p>}
            </div>
            {active.id === 'pod' && <PodConditionTrial state={podTrial} onChange={changePodTrial} />}
            <div className="immersive-selection__links immersive-exhibit__links"><Link to={`/${active.id}`}>Details <span aria-hidden="true">↗</span></Link><a href={`/app/?tab=${active.id}`}>{active.id === 'pod' ? 'Launch Pod app' : `Open ${active.name}`} <span aria-hidden="true">↗</span></a></div>
          </>}
        </section>

        <div className="orbital-hero__foot immersive-console">
          <div className="immersive-selection" aria-live="polite" aria-atomic="true" hidden={exploring}>
            {active && <div className="immersive-selection__content" key={active.id}>
              <div><h2>{active.name}</h2><p>{active.description}</p></div>
              <div className="immersive-selection__links"><Link to={`/${active.id}`}>Details <span aria-hidden="true">↗</span></Link><a href={`/app/?tab=${active.id}`}>{active.id === 'pod' ? 'Launch Pod app' : `Open ${active.name}`} <span aria-hidden="true">↗</span></a></div>
            </div>}
          </div>
          <div className="immersive-instruments" id="instruments" role="group" aria-label="Instruments" tabIndex={-1}>
            {INSTRUMENTS.map((instrument, index) => <button key={instrument.id} id={`exhibit-${instrument.id}`} ref={element => { controls.current[index] = element }} type="button" aria-pressed={selected === instrument.id} onFocus={() => select(instrument.id)} onClick={() => {
              select(instrument.id)
              if (!exploring) navigate('/#instruments')
            }} onKeyDown={event => {
              let next = index
              if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % INSTRUMENTS.length
              else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + INSTRUMENTS.length - 1) % INSTRUMENTS.length
              else if (event.key === 'Home') next = 0
              else if (event.key === 'End') next = INSTRUMENTS.length - 1
              else return
              event.preventDefault()
              controls.current[next]?.focus()
            }}><span>{instrument.name}</span><small>{instrument.label}</small><i aria-hidden="true">↗</i></button>)}
          </div>
          <footer className="immersive-footer"><p>Stellar testnet <span>· Test assets only</span></p><nav aria-label="Supporting tools"><Link to="/ramp">Ramp</Link><Link to="/ledger">Ledger</Link></nav></footer>
        </div>
      </section>
      <HowItWorksDialog open={explanationOpen} onDismiss={dismissExplanation} />
    </div>
  )
}
