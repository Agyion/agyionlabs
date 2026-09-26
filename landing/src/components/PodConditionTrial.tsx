import { useId, type Dispatch } from 'react'
import { podTrialStage, type PodCondition, type PodTrialAction, type PodTrialState } from './podTrial'
import '../styles/pod-trial.css'

const CONDITIONS: { id: PodCondition; label: string; detail: string }[] = [
  { id: 'timeReached', label: 'Unlock time reached', detail: 'At or after the unlock ledger' },
  { id: 'keyAvailable', label: 'Claim key available', detail: 'Matches this capsule’s public key' },
  { id: 'recipientSigned', label: 'Recipient signature ready', detail: 'Authorizes this recipient wallet locally' },
]

/** A local teaching example: it never connects a wallet or submits a transaction. */
export default function PodConditionTrial({ state, onChange }: { state: PodTrialState; onChange: Dispatch<PodTrialAction> }) {
  const id = useId()
  const stage = podTrialStage(state)
  const fulfilled = CONDITIONS.filter(condition => state[condition.id]).length
  const changed = fulfilled > 0 || state.opened

  return <section className="pod-trial" aria-label="Pod interactive example" data-stage={stage}>
    <p className="pod-trial__context">Interactive example <span aria-hidden="true">·</span> No transaction</p>
    <fieldset className="pod-trial__conditions" aria-describedby={`${id}-status`}>
      <legend>Try the conditions</legend>
      {CONDITIONS.map(condition => <label className="pod-trial__condition" key={condition.id}>
        <input type="checkbox" checked={state[condition.id]} onChange={() => onChange({ type: 'toggle', condition: condition.id })} />
        <span className="pod-trial__check" aria-hidden="true">✓</span>
        <span className="pod-trial__label">{condition.label}<small>{condition.detail}</small></span>
      </label>)}
    </fieldset>
    <p className="pod-trial__status" id={`${id}-status`} role="status" aria-live="polite">
      {stage === 2 ? 'Opened in this example.' : stage === 1 ? 'All three conditions met. Ready to open.' : `Locked · ${fulfilled} of 3 conditions met.`}
    </p>
    <div className="pod-trial__actions">
      <button className="pod-trial__open" type="button" disabled={stage !== 1} onClick={() => onChange({ type: 'open' })}>{stage === 2 ? 'Capsule opened' : 'Open capsule'}</button>
      <button className="pod-trial__reset" type="button" disabled={!changed} onClick={() => onChange({ type: 'reset' })}>Reset example</button>
    </div>
  </section>
}
