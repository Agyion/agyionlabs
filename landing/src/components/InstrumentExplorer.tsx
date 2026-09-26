import { useEffect, useId, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { Link } from 'react-router'
import { prefersReducedMotion } from '../lib/motion'

const INSTRUMENTS = [
  { id: 'fade', name: 'Fade', condition: 'Falling price', description: 'Set a falling price, then settle a proven handoff.', drawing: 'A falling price curve descends onto its floor, with a claim moving along the curve.' },
  { id: 'pod', name: 'Pod', condition: 'Time + secret', description: 'Lock funds until a chosen time and secret match.', drawing: 'A sealed capsule holds funds behind two locks: time and a saved secret.' },
  { id: 'trigger', name: 'Trigger', condition: 'Event proof', description: 'Release escrow when your attester’s proof is accepted.', drawing: 'An attestation passes through the escrow gate toward the recipient.' },
  { id: 'envoy', name: 'Envoy', condition: 'Agent limits', description: 'Let an agent claim within your caps and expiry.', drawing: 'An agent’s claim travels through a mandate with a spending boundary.' },
] as const
type InstrumentId = (typeof INSTRUMENTS)[number]['id']

function InstrumentArt({ kind, label }: { kind: InstrumentId; label: string }) {
  const id = useId()
  return (
    <svg viewBox="0 0 720 430" className={`explorer-art explorer-art--${kind}`} role="img" aria-labelledby={`${id}-title`}>
      <title id={`${id}-title`}>{label}</title>
      <defs>
        <linearGradient id={`${id}-metal`} x1="0" x2="1" y1="0" y2=".4"><stop stopColor="#35404d"/><stop offset=".44" stopColor="#111923"/><stop offset=".76" stopColor="#263340"/><stop offset="1" stopColor="#0c1118"/></linearGradient>
        <linearGradient id={`${id}-light`} x1="0" x2="1"><stop stopColor="#f2eee5"/><stop offset=".6" stopColor="#e8b77b"/><stop offset="1" stopColor="#98744f"/></linearGradient>
      </defs>
      <g className="art-world">
        {kind === 'fade' && <>
          <g className="art-grid"><path d="M87 286 384 395 647 256 350 154Z"/>{Array.from({ length: 6 }, (_, i) => <path key={i} d={`M${87 + i * 50} ${286 + i * 18.2}l263-139M${87 + i * 44} ${286 - i * 23.2}l297 109`}/>)}</g>
          <path className="art-solid" d="M124 112C246 103 269 239 372 256S517 293 584 296L584 325C485 319 446 317 353 290S225 139 124 145Z" fill={`url(#${id}-metal)`}/>
          {Array.from({ length: 9 }, (_, i) => <path key={i} className="art-contour" opacity={.12 + i * .055} d={`M${124 + i * 2.5} ${112 + i * 4}C${246 + i * 2.5} ${103 + i * 4} ${269 + i * 2.5} ${239 + i * 4} ${372 + i * 2.5} ${256 + i * 4}S${517 + i * 2.5} ${293 + i * 4} ${584 + i * 2.5} ${296 + i * 4}`}/>) }
          <path className="art-highlight art-trace" stroke={`url(#${id}-light)`} d="M124 112C246 103 269 239 372 256S517 293 584 296"/>
          <g className="art-fade-point art-loop"><circle r="18" className="art-halo"/><circle r="5" className="art-point"/></g>
          <path className="art-wire" d="M124 112V287M584 296V344M94 91H143M546 352H610"/><text x="94" y="76">Start</text><text x="548" y="377">Floor</text>
        </>}
        {kind === 'pod' && <>
          <g className="art-grid"><ellipse cx="357" cy="333" rx="225" ry="57"/><ellipse cx="357" cy="333" rx="174" ry="43"/><path d="m121 333 476 0m-240-67v133"/></g>
          <g className="art-pod-body"><path className="art-solid" d="M268 112C268 47 452 47 452 112V292C452 356 268 356 268 292Z" fill={`url(#${id}-metal)`}/><ellipse className="art-wire" cx="360" cy="112" rx="92" ry="42"/><path className="art-contour" d="M282 106V293M297 91V306M423 91V307M438 105V297M268 280c0 59 184 59 184 0"/><ellipse className="art-highlight" cx="360" cy="197" rx="92" ry="36"/><ellipse className="art-contour" cx="360" cy="205" rx="92" ry="36"/><path className="art-highlight" d="M347 272v-15a13 13 0 0 1 26 0v15m-33 0h40v34h-40Z"/><circle className="art-point" cx="360" cy="284" r="3"/></g>
          <g className="art-pod-orbit art-loop"><ellipse className="art-wire" cx="360" cy="210" rx="197" ry="64" transform="rotate(-19 360 210)"/><circle className="art-point" cx="185" cy="277" r="5"/></g>
          <path className="art-wire" d="M273 122 204 98H136M448 269l67 23h55"/><text x="137" y="81">Time</text><text x="517" y="318">Secret</text>
        </>}
        {kind === 'trigger' && <>
          <g className="art-grid"><path d="m107 293 230 81 279-130-227-73Z"/><path d="m176 260 230 81m-164-113 230 81m-133-95-165 81m234-56-168 81"/></g>
          <path className="art-solid" d="m135 193 95-47 93 38v104l-94 48-94-38Z" fill={`url(#${id}-metal)`}/><path className="art-wire" d="m135 193 94 40 94-49m-94 49v103m-82-144 82 34 82-40"/>
          <g className="art-trigger-gate"><path className="art-highlight" d="m395 99 63 27v174l-63-27Z"/><path className="art-contour" d="m405 112 43 20v148l-43-19ZM415 107v175m15-166v173"/></g>
          <path className="art-wire" d="m229 227 327-94m-23-11 24 11-12 24"/><path className="art-highlight art-trace" d="m250 220 164-47"/>
          <g className="art-proof art-loop"><path className="art-proof-shape" d="m-17 0 17-13 17 13-17 13Z"/><path className="art-proof-check" d="m-7 0 5 4 10-9"/></g>
          <circle className="art-highlight" cx="558" cy="132" r="24"/><circle className="art-grid" cx="558" cy="132" r="36"/><path className="art-wire" d="M160 325v28h69M558 95V65h-69"/><text x="155" y="380">Escrow</text><text x="464" y="50">Accepted proof</text>
        </>}
        {kind === 'envoy' && <>
          <g className="art-grid"><ellipse cx="360" cy="290" rx="239" ry="69"/><ellipse cx="360" cy="290" rx="198" ry="52"/><path d="M100 290h520M360 210v163"/></g>
          <path className="art-solid" d="m286 125 74-38 74 29v174l-75 40-73-32Z" fill={`url(#${id}-metal)`}/><path className="art-wire" d="m286 125 73 29 75-38m-75 38v176M298 141v145l48 22V162"/>
          <path className="art-highlight" d="m307 199 36 14m-36 13 36 14m-36 13 36 14"/><path className="art-mandate-ring art-loop" d="M180 236C130 112 410 42 553 144S483 362 257 306"/><path className="art-highlight art-trace" d="M174 231C151 172 230 115 342 100"/>
          <g className="art-agent-point art-loop"><circle className="art-halo" r="16"/><circle className="art-point" r="5"/></g><path className="art-wire" d="M170 236h-53v52m442-143h49v-30"/><text x="87" y="315">Agent</text><text x="549" y="96">Your limits</text>
        </>}
      </g>
    </svg>
  )
}

export default function InstrumentExplorer() {
  const [selected, setSelected] = useState<InstrumentId>('fade')
  const root = useRef<HTMLDivElement>(null)
  const tabs = useRef<Array<HTMLButtonElement | null>>([])
  const pointerFrame = useRef(0)

  useEffect(() => {
    const element = root.current
    if (!element) return
    const observer = new IntersectionObserver(([entry]) => element.classList.toggle('is-in-view', entry.isIntersecting), { threshold: .08 })
    observer.observe(element)
    return () => { observer.disconnect(); window.cancelAnimationFrame(pointerFrame.current) }
  }, [])

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || prefersReducedMotion()) return
    const element = event.currentTarget
    const box = element.getBoundingClientRect()
    const x = Math.max(-1, Math.min(1, (event.clientX - box.left) / box.width * 2 - 1))
    const y = Math.max(-1, Math.min(1, (event.clientY - box.top) / box.height * 2 - 1))
    window.cancelAnimationFrame(pointerFrame.current)
    pointerFrame.current = window.requestAnimationFrame(() => {
      element.style.setProperty('--art-yaw', `${x * 8}deg`)
      element.style.setProperty('--art-pitch', `${-y * 6}deg`)
      element.style.setProperty('--art-x', `${x * 11}px`)
      element.style.setProperty('--art-y', `${y * 7}px`)
    })
  }
  const reset = (event: PointerEvent<HTMLDivElement>) => {
    window.cancelAnimationFrame(pointerFrame.current)
    event.currentTarget.style.removeProperty('--art-yaw')
    event.currentTarget.style.removeProperty('--art-pitch')
    event.currentTarget.style.removeProperty('--art-x')
    event.currentTarget.style.removeProperty('--art-y')
  }

  return (
    <div className="instrument-explorer" ref={root} data-selected={selected}>
      <div className="explorer-tabs" role="tablist" aria-label="Explore instruments">
        {INSTRUMENTS.map((instrument, index) => <button key={instrument.id} ref={element => { tabs.current[index] = element }} type="button" role="tab" id={`explorer-tab-${instrument.id}`} aria-selected={selected === instrument.id} aria-controls={`explorer-panel-${instrument.id}`} tabIndex={selected === instrument.id ? 0 : -1}
          onPointerEnter={event => {
            if (event.pointerType === 'mouse' && !root.current?.querySelector('[role="tabpanel"]:focus-within')) setSelected(instrument.id)
          }} onFocus={() => setSelected(instrument.id)} onClick={() => setSelected(instrument.id)}
          onKeyDown={event => {
            let next = index
            if (event.key === 'ArrowRight') next = (index + 1) % INSTRUMENTS.length
            else if (event.key === 'ArrowLeft') next = (index + INSTRUMENTS.length - 1) % INSTRUMENTS.length
            else if (event.key === 'Home') next = 0
            else if (event.key === 'End') next = INSTRUMENTS.length - 1
            else return
            event.preventDefault()
            tabs.current[next]?.focus()
          }}>
          <span>{instrument.name}</span><small>{instrument.condition}</small><i aria-hidden="true">↗</i>
        </button>)}
      </div>
      {INSTRUMENTS.map(instrument => <section key={instrument.id} className="explorer-stage" role="tabpanel" id={`explorer-panel-${instrument.id}`} aria-labelledby={`explorer-tab-${instrument.id}`} hidden={selected !== instrument.id} tabIndex={0}>
        <div className="explorer-visual" onPointerMove={move} onPointerLeave={reset}><InstrumentArt kind={instrument.id} label={instrument.drawing} /></div>
        <div className="explorer-copy"><h3>{instrument.name}</h3><p>{instrument.description}</p><div className="explorer-links"><Link to={`/${instrument.id}`}>View details <span aria-hidden="true">↗</span></Link><a href={`/app/?tab=${instrument.id}`}>Open {instrument.name} <span aria-hidden="true">↗</span></a></div></div>
      </section>)}
    </div>
  )
}
