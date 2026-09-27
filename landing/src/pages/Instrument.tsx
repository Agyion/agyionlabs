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
    caveat: 'A claim reserves the box. Payment still needs a signed handoff.',
    notes: [
      'The contract calculates the falling price from its ledger schedule; a negative floor is optional.',
      'Settlement and eligible refunds require transactions; a deadline does not move funds automatically.',
      'Keep the rule ID and confirmed transaction reference to verify the outcome.',
    ],
  },
  pod: {
    name: 'Pod',
    promise: 'Your key. Its own time.',
    steps: [
      { label: 'Back up', text: 'Save and check your encrypted vault and the recipient credential before locking private funds.' },
      { label: 'Set the time', text: 'Choose the unlock ledger. The capsule cannot open before it arrives.' },
      { label: 'Prove to open', text: 'The recipient uses their saved keys to create a local proof and claim after unlock.' },
    ],
    caveat: 'Keep your encrypted backup and its password. A Pod sender cannot reclaim the recipient’s locked funds.',
    notes: [
      'Private notes use local proofs and encrypted recovery. Deposits, withdrawals, transaction timing and fee payers remain observable.',
      'The unlock condition uses ledger time; a displayed countdown is an estimate.',
      'Long locks may need storage extension or restoration; there is no automatic keeper.',
      'Existing public positions remain accessible through their original contract and saved credentials. They do not become private.',
    ],
  },
  trigger: {
    name: 'Trigger',
    promise: 'Proof arrives. Escrow moves.',
    steps: [
      { label: 'Define', text: 'Set the escrow amount, beneficiary, attester key and deadline.' },
      { label: 'Sign', text: 'The configured attester signs the proof for this payment.' },
      { label: 'Execute', text: 'Submit the proof to pay the beneficiary; if still unpaid after expiry, request a refund.' },
    ],
    caveat: 'Your chosen reviewer is trusted to approve the work. The contract checks their signature.',
    notes: [
      'Choose the attester deliberately: its configured key is the accepted source of proof.',
      'Expiry is not an automatic refund; submit the claim and confirm the transaction result.',
      'New private escrows require saved encrypted credentials. Existing public escrows remain accessible separately.',
    ],
  },
  envoy: {
    name: 'Envoy',
    promise: 'Give permission. Keep control.',
    steps: [
      { label: 'Authorize', text: 'Choose an agent key and expiry for up to 50 Fade claims at zero or a negative price.' },
      { label: 'Claim', text: 'The agent claims for the mandate owner; it cannot buy Fades with a positive price or choose another recipient.' },
      { label: 'Revoke', text: 'Submit and confirm a revocation to stop the mandate from authorizing another claim.' },
    ],
    caveat: 'Agents can claim only free or rewarded pickups, up to 50 times. Revocation affects future claims.',
    notes: [
      'Claim count and expiry are the effective limits; permitted claims priced at zero or less do not consume the contract’s monetary caps.',
      'Each delegated claim must pass signature and contract permission checks.',
      'A mandate does not grant unrestricted wallet access or arbitrary payment destinations.',
      'Revocation must be confirmed; an expired or revoked mandate cannot authorize another claim.',
      'This example shows the public Fade agent. Private note delegation has separate amount, claim-count, expiry and recovery rules in the app.',
    ],
  },
}

export default function Instrument({ slug }: { slug: string }) {
  if (!Object.prototype.hasOwnProperty.call(DETAILS, slug)) return null
  const id = slug as CoreInstrument
  return <DetailWorld key={id} id={id} {...DETAILS[id]} />
}
