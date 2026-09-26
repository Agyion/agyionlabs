import { useReducer, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import OrbitalScene from './OrbitalScene'
import PodConditionTrial from './PodConditionTrial'
import { INITIAL_POD_TRIAL, podTrialReducer, podTrialStage } from './podTrial'
import '../styles/detail-world.css'

export type CoreInstrument = 'fade' | 'pod' | 'trigger' | 'envoy'
export type DetailInstrument = CoreInstrument | 'ramp' | 'ledger'
export type ConditionStep = { label: string; text: string }

const INSTRUMENTS: { id: DetailInstrument; name: string }[] = [
  { id: 'fade', name: 'Fade' }, { id: 'pod', name: 'Pod' },
  { id: 'trigger', name: 'Trigger' }, { id: 'envoy', name: 'Envoy' },
  { id: 'ramp', name: 'Ramp' }, { id: 'ledger', name: 'Ledger' },
]

type DetailWorldProps = {
  id: DetailInstrument
  name: string
  promise: string
  steps: readonly ConditionStep[]
  caveat: string
  notes: readonly string[]
  environment?: string
  visual?: (step: number) => ReactNode
}

export default function DetailWorld({ id, name, promise, steps, caveat, notes, environment, visual }: DetailWorldProps) {
  const [step, setStep] = useState(0)
  const [podTrial, changePodTrial] = useReducer(podTrialReducer, INITIAL_POD_TRIAL)
  const sceneStage = id === 'pod' ? podTrialStage(podTrial) : step as 0 | 1 | 2
  const tabs = useRef<Array<HTMLButtonElement | null>>([])
  const core = id !== 'ramp' && id !== 'ledger'

  return (
    <section className={`detail-world detail-world--${id}${core ? ' detail-world--instrument' : ' detail-world--utility'}`} data-instrument={id} data-step={sceneStage} aria-labelledby={`detail-${id}-title`}>
      <OrbitalScene initialExhibit={core ? id : undefined} initialExhibitView={core} exhibitStage={core ? sceneStage : undefined} exhibitLinks showExhibits={core} />
      {visual && <div className="detail-world__visual">{visual(step)}</div>}
      <div className="detail-world__content">
        <Link className="detail-world__back" to="/#instruments"><span aria-hidden="true">←</span> Instruments</Link>
        <h1 id={`detail-${id}-title`}>{name}</h1>
        <p className="detail-world__promise">{promise}</p>
        {id === 'pod' ? <PodConditionTrial state={podTrial} onChange={changePodTrial} /> : <div className="detail-conditions">
          <div className="detail-conditions__tabs" role="tablist" aria-label={`${name} conditions`}>
            {steps.map((item, index) => <button key={item.label} id={`${id}-condition-${index}`} ref={element => { tabs.current[index] = element }} type="button" role="tab" aria-selected={step === index} aria-controls={`${id}-condition-panel-${index}`} tabIndex={step === index ? 0 : -1} onClick={() => setStep(index)} onKeyDown={event => {
              let next = index
              if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % steps.length
              else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + steps.length - 1) % steps.length
              else if (event.key === 'Home') next = 0
              else if (event.key === 'End') next = steps.length - 1
              else return
              event.preventDefault()
              setStep(next)
              tabs.current[next]?.focus()
            }}><span aria-hidden="true">0{index + 1}</span><span className="detail-condition__label">{item.label}</span></button>)}
          </div>
          {steps.map((item, index) => <p key={item.label} className="detail-conditions__sentence" id={`${id}-condition-panel-${index}`} role="tabpanel" tabIndex={0} aria-labelledby={`${id}-condition-${index}`} hidden={step !== index}>{item.text}</p>)}
        </div>}
        <a className="detail-world__launch" href={`/app/?tab=${id}`}>{id === 'pod' ? 'Launch Pod app' : `Open ${name}`}<span aria-hidden="true">↗</span></a>
        <p className="detail-world__caveat">{caveat}</p>
        <details className="detail-world__limits"><summary>Conditions &amp; limits <span aria-hidden="true">+</span></summary><ul>{notes.map(note => <li key={note}>{note}</li>)}{core && <li>On-chain actions need a compatible v2 testnet contract; the app blocks incompatible deployments and labels local simulation separately.</li>}</ul></details>
      </div>
      <footer className="detail-world__footer">
        <nav aria-label="Explore instruments">{INSTRUMENTS.map(item => <Link key={item.id} to={`/${item.id}`} aria-current={item.id === id ? 'page' : undefined}>{item.name}<span aria-hidden="true">↗</span></Link>)}</nav>
        <p>{environment ?? 'Stellar testnet. Test assets only.'}<span>Independent project.</span></p>
      </footer>
    </section>
  )
}
