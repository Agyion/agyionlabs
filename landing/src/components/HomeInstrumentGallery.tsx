import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import InstrumentMechanism from './InstrumentMechanism'
import ProductRouteLink from './ProductRouteLink'
import type { CoreInstrument } from './DetailWorld'

const INSTRUMENTS: { id: CoreInstrument; name: string; split: [string, string]; label: string }[] = [
  { id: 'fade', name: 'Fade', split: ['FA', 'DE'], label: 'A price in motion' },
  { id: 'pod', name: 'Pod', split: ['P', 'OD'], label: 'A key. A point in time.' },
  { id: 'trigger', name: 'Trigger', split: ['TRIG', 'GER'], label: 'An event, proven' },
  { id: 'envoy', name: 'Envoy', split: ['EN', 'VOY'], label: 'Permission with limits' },
]
// Navigation-only memory; no wallet or application state is kept here.
const selectionHistory = new Map<string, CoreInstrument>()

export default function HomeInstrumentGallery() {
  const location = useLocation()
  const historyKey = `${location.key}:${location.pathname}${location.search}${location.hash}`
  const [selection, setSelection] = useState(() => ({ key: historyKey, id: selectionHistory.get(historyKey) ?? 'fade' as CoreInstrument }))
  const selected = selection.key === historyKey ? selection.id : selectionHistory.get(historyKey) ?? selection.id
  // Same-path Back does not remount Home. Reconcile before committing effects,
  // otherwise the newer choice would overwrite the older history entry.
  if (selection.key !== historyKey) setSelection({ key: historyKey, id: selected })
  const controls = useRef<Array<HTMLButtonElement | null>>([])
  const active = INSTRUMENTS.find(instrument => instrument.id === selected)!
  const select = (id: CoreInstrument) => setSelection({ key: historyKey, id })
  useEffect(() => {
    selectionHistory.set(historyKey, selected)
    if (selectionHistory.size > 40) selectionHistory.delete(selectionHistory.keys().next().value!)
  }, [historyKey, selected])
  return <section className="home-gallery" id="instruments" tabIndex={-1} aria-labelledby="gallery-title" data-selected={selected}>
    <header className="home-gallery__heading"><div><span className="home-gallery__eyebrow">The instruments</span><h2 id="gallery-title">Set the conditions.</h2></div><span className="home-gallery__intro">Four ways to move money.</span></header>
    <div className="home-gallery__layout">
      <div className="home-gallery__selector" role="group" aria-label="Choose an instrument">
        {INSTRUMENTS.map((instrument, index) => <button key={instrument.id} type="button" id={`exhibit-${instrument.id}`} ref={element => { controls.current[index] = element }} aria-pressed={selected === instrument.id} aria-controls="instrument-stage" aria-label={instrument.name} onClick={() => select(instrument.id)} onFocus={() => select(instrument.id)} onKeyDown={event => {
          let next = index
          if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % INSTRUMENTS.length
          else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + INSTRUMENTS.length - 1) % INSTRUMENTS.length
          else if (event.key === 'Home') next = 0
          else if (event.key === 'End') next = INSTRUMENTS.length - 1
          else return
          event.preventDefault()
          controls.current[next]?.focus()
        }}>
          <span className="home-gallery__wordmark" data-product-transition-title={selected === instrument.id ? instrument.id : undefined} aria-hidden="true"><span>{instrument.split[0]}</span><span className="home-gallery__outline">/{instrument.split[1]}</span></span>
          <span className="home-gallery__label">{instrument.label}</span><span className="home-gallery__arrow" aria-hidden="true">↗</span>
        </button>)}
      </div>
      <div className="home-gallery__panel" id="instrument-stage" role="region" aria-label={`${active.name} illustration`}>
        <div className="home-gallery__mechanism" key={active.id} data-product-transition-stage={active.id}><InstrumentMechanism kind={active.id} preview /></div>
        <div className="home-gallery__links"><ProductRouteLink id={active.id}>Details <span aria-hidden="true">↗</span></ProductRouteLink><a href={`/app/?tab=${active.id}`}>Open {active.name}<span aria-hidden="true">↗</span></a></div>
      </div>
    </div>
  </section>
}
