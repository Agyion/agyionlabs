import DetailWorld, { type CoreInstrument, type ConditionStep } from '../components/DetailWorld'

type InstrumentDetail = {
  name: string
  promise: string
  steps: readonly ConditionStep[]
  caveat: string
  notes: readonly string[]
}

const DETAILS: Record<CoreInstrument, InstrumentDetail> = {
  fade: {
    name: 'Fade',
    promise: 'A falling price. A signed handoff.',
    steps: [
      { label: 'Set', text: 'Fund the pot and choose a starting price, floor and claim window.' },
      { label: 'Claim', text: 'Claim the current price; a negative price pays the claimant from the pot when the handoff settles.' },
      { label: 'Settle', text: 'Submit the venue’s signed proof within the handoff window to settle the claim.' },
    ],
    caveat: 'A claim is not a completed handoff.',
    notes: [
      'The contract calculates the falling price from its ledger schedule; a negative floor is optional.',
      'Settlement and eligible refunds require transactions; a deadline does not move funds automatically.',
      'Keep the rule ID and confirmed transaction reference to verify the outcome.',
    ],
  },
  pod: {
    name: 'Pod',
    promise: 'Time and a secret hold the key.',
    steps: [
      { label: 'Lock', text: 'Save a fresh secret, then lock funds with its hash and an unlock ledger.' },
      { label: 'Commit', text: 'Bind a hidden claim commitment to your recipient wallet.' },
      { label: 'Reveal', text: 'After unlock and a later confirmed ledger, reveal the secret to submit the opening.' },
    ],
    caveat: 'Save the secret before locking; the reveal becomes public.',
    notes: [
      'A lost secret cannot be recreated; never reuse a revealed secret for another Pod.',
      'The unlock condition uses ledger time; a displayed countdown is an estimate.',
      'Long locks may need storage extension or restoration; there is no automatic keeper.',
      'The separate proof-verifier experiment is not part of Pod claims.',
    ],
  },
  trigger: {
    name: 'Trigger',
    promise: 'An attester’s proof releases escrow.',
    steps: [
      { label: 'Define', text: 'Set the escrow amount, beneficiary, attester key and deadline.' },
      { label: 'Sign', text: 'The configured attester signs the proof for this payment.' },
      { label: 'Execute', text: 'Submit the proof to pay the beneficiary; if still unpaid after expiry, request a refund.' },
    ],
    caveat: 'The contract checks the signature, not the real-world event.',
    notes: [
      'Choose the attester deliberately: its configured key is the accepted source of proof.',
      'Expiry is not an automatic refund; submit the claim and confirm the transaction result.',
    ],
  },
  envoy: {
    name: 'Envoy',
    promise: 'Let an agent claim within your limits.',
    steps: [
      { label: 'Authorize', text: 'Choose an agent key and expiry for up to 50 zero or negative-price Fade claims.' },
      { label: 'Claim', text: 'The agent claims for the mandate owner; it cannot buy positive-price Fades or choose another recipient.' },
      { label: 'Revoke', text: 'Submit and confirm a revocation to stop the mandate from authorizing another claim.' },
    ],
    caveat: 'Only zero or negative-price Fade claims; up to 50 per mandate.',
    notes: [
      'Claim count and expiry are the effective limits; permitted nonpositive-price claims do not consume the contract’s monetary caps.',
      'Each delegated claim must pass signature and contract permission checks.',
      'A mandate does not grant unrestricted wallet access or arbitrary payment destinations.',
      'Revocation must be confirmed; an expired or revoked mandate cannot authorize another claim.',
    ],
  },
}

export default function Instrument({ slug }: { slug: string }) {
  if (!Object.prototype.hasOwnProperty.call(DETAILS, slug)) return null
  const id = slug as CoreInstrument
  return <DetailWorld key={id} id={id} {...DETAILS[id]} />
}
