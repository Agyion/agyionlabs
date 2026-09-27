import type { DetailInstrument } from './instrumentMechanismState'

export type ExampleStep = {
  label: string
  title: string
  detail: string
  balances: [string, string, string]
  action?: string
  moving?: string
}
export type InstrumentExampleContent = {
  title: string
  summary: string
  catalog: string
  preview: [string, string, string]
  actors: [string, string, string]
  steps: [ExampleStep, ExampleStep, ExampleStep, ExampleStep]
  failure: { at: number; action: string; title: string; detail: string }
  note: string
}

/** Fictional teaching examples. No wallet, network request or transaction. */
export const INSTRUMENT_EXAMPLES: Record<DetailInstrument, InstrumentExampleContent> = {
  fade: {
    title: 'The last pastry box.',
    summary: 'Maya buys a bakery’s spare box as its price falls before closing.',
    catalog: 'Buy the last pastry box as its price falls.',
    preview: ['12 USDC', 'Reserve at 8', 'Pay on pickup'],
    actors: ['Bakery', 'Price of the box', 'Maya'],
    steps: [
      { label: 'Listed', title: 'A box worth picking up.', detail: 'The bakery funds a deposit and lists the box at 12 USDC. The lowest price is 4 USDC.', balances: ['Deposit locked', '12 USDC', 'Nothing paid'], action: 'Advance 30 minutes', moving: 'The price falls as time passes.' },
      { label: 'Price falls', title: 'Half an hour later: 8 USDC.', detail: 'Maya can claim now or wait. Someone else may take the box first.', balances: ['Box available', '8 USDC', 'Nothing paid'], action: 'Reserve at 8 USDC', moving: 'Maya’s claim fixes the price when it is confirmed.' },
      { label: 'Reserved', title: '8 USDC is fixed. Nothing is paid yet.', detail: 'The first valid claim belongs to Maya. She still needs to collect the box.', balances: ['Box reserved', '8 USDC fixed', 'Pickup due'], action: 'Confirm pickup and payment', moving: 'The bakery signs the handoff. Maya authorizes the payment.' },
      { label: 'Picked up', title: 'Maya gets the box. The bakery gets 8 USDC.', detail: 'The signed handoff settles the sale and returns the bakery’s deposit.', balances: ['Receives 8 USDC', 'Pickup confirmed', 'Pays 8 USDC'] },
    ],
    failure: { at: 2, action: 'What if Maya never arrives?', title: 'A reservation is not a sale.', detail: 'After the pickup window, the bakery can request its deposit back. The listing stays closed.' },
    note: 'This example has a positive floor. A negative price instead pays a collection reward from the seller’s funded pot.',
  },
  pod: {
    title: 'Save it for the laptop.',
    summary: 'Maya puts 200 USDC aside until her chosen unlock time.',
    catalog: 'Keep 200 USDC for a laptop until your chosen time.',
    preview: ['200 USDC', 'Time + claim key', 'Maya’s wallet'],
    actors: ['Maya’s wallet', 'Savings capsule', 'Laptop budget'],
    steps: [
      { label: 'Plan', title: 'A laptop fund, with a date.', detail: 'Maya saves a fresh claim key and chooses when the 200 USDC can be opened.', balances: ['200 USDC', 'Not funded', 'Not available'], action: 'Lock 200 USDC', moving: 'The funds move into the capsule.' },
      { label: 'Locked', title: 'The money is set aside.', detail: 'The claim key alone cannot open it before the unlock ledger.', balances: ['200 USDC set aside', '200 USDC locked', 'Not available'], action: 'Reach the unlock time', moving: 'Time advances to the chosen unlock point.' },
      { label: 'Time reached', title: 'Time permits. Maya still has to claim.', detail: 'Her claim key signs for her wallet. Her wallet must also authorize the claim.', balances: ['Claim key ready', '200 USDC claimable', 'Awaiting claim'], action: 'Sign and claim', moving: 'The capsule checks the time and both authorizations.' },
      { label: 'Claimed', title: '200 USDC is back with Maya.', detail: 'The confirmed claim releases the money to the wallet she authorized.', balances: ['Claim confirmed', 'Capsule opened', 'Receives 200 USDC'] },
    ],
    failure: { at: 1, action: 'Try without the claim key', title: 'The capsule stays locked.', detail: 'A date cannot replace the key. There is no lost key reset or refund path.' },
    note: 'The current app records amounts and addresses publicly. This example does not demonstrate private transfers.',
  },
  trigger: {
    title: 'Pay when the design is approved.',
    summary: 'Maya reserves 150 USDC for Noor’s poster. Their chosen reviewer approves the delivery.',
    catalog: 'Release a designer’s fee after the agreed reviewer approves.',
    preview: ['150 USDC', 'Reviewer’s signature', 'Noor gets paid'],
    actors: ['Maya', 'Design review', 'Noor'],
    steps: [
      { label: 'Agree', title: 'One poster. One agreed reviewer.', detail: 'Maya and Noor choose the reviewer, payment recipient and deadline.', balances: ['150 USDC', 'Reviewer chosen', 'Payment pending'], action: 'Reserve the design fee', moving: 'Maya’s 150 USDC moves into escrow.' },
      { label: 'Reserved', title: 'The fee is waiting in escrow.', detail: 'Noor delivers the poster. The contract does not decide whether the work is good.', balances: ['150 USDC reserved', 'Awaiting approval', 'Poster delivered'], action: 'Reviewer signs approval', moving: 'The chosen reviewer signs for this payment.' },
      { label: 'Approved', title: 'The proof is ready. The fee has not moved.', detail: 'An approval signature must be submitted to the contract before the deadline.', balances: ['Funds in escrow', 'Signature ready', 'Payment pending'], action: 'Submit proof and pay Noor', moving: 'The contract checks the signature and pays the named recipient.' },
      { label: 'Paid', title: 'Noor receives 150 USDC.', detail: 'The accepted proof releases this escrow once. It cannot pay a second time.', balances: ['Payment completed', 'Proof accepted', 'Receives 150 USDC'] },
    ],
    failure: { at: 1, action: 'Try a different reviewer', title: 'That signature cannot release the fee.', detail: 'The funds stay in escrow. If still unpaid after expiry, Maya can submit a refund request.' },
    note: 'Trust sits with the chosen reviewer. The contract checks the signature, not the quality of the poster.',
  },
  envoy: {
    title: 'Let an agent reserve the pickup.',
    summary: 'A bakery offers a funded 2 USDC reward to collect a surplus crate. Maya delegates the claim.',
    catalog: 'Let an agent claim a collection reward for you.',
    preview: ['Maya’s permission', 'Agent claims', 'Maya receives'],
    actors: ['Maya', 'Her agent', 'Bakery pickup'],
    steps: [
      { label: 'Choose', title: 'Help with claims, without handing over a wallet.', detail: 'Maya chooses an agent key and expiry. This permission allows up to 50 eligible Fade claims.', balances: ['No mandate yet', 'No permission', '2 USDC reward'], action: 'Authorize the agent', moving: 'Maya signs a mandate for this agent.' },
      { label: 'Authorized', title: 'Permission has a boundary.', detail: 'Only free listings or listings with a collection reward qualify. The recipient is always Maya.', balances: ['Mandate active', '0 of 50 claims', '2 USDC reward'], action: 'Agent reserves the crate', moving: 'The agent submits the eligible claim in Maya’s name.' },
      { label: 'Reserved', title: 'The crate is reserved for Maya.', detail: 'One claim is used. The agent receives no reward, and pickup still needs confirmation.', balances: ['Named recipient', '1 of 50 claims', 'Pickup due'], action: 'Maya completes the pickup', moving: 'The bakery signs the handoff. Its funded pot pays Maya.' },
      { label: 'Collected', title: 'Maya receives the crate and 2 USDC.', detail: 'Envoy delegated the claim. Fade’s signed handoff settled the collection reward.', balances: ['Receives 2 USDC', 'Receives nothing', 'Pickup confirmed'] },
    ],
    failure: { at: 1, action: 'Try a listing costing 3 USDC', title: 'The agent cannot buy that listing.', detail: 'A positive price is outside this mandate. No claim is used and no funds move.' },
    note: 'Maya can submit a revocation to stop future claims. A confirmed revocation does not undo a claim already made.',
  },
  ramp: {
    title: 'From a currency quote to a test balance.',
    summary: 'Maya explores a simulated deposit of 400 TRY into 10 test USDC.',
    catalog: 'Try a simulated currency deposit into a test wallet.',
    preview: ['400 TRY', 'Example quote', '10 test USDC'],
    actors: ['Simulated deposit', 'Mock anchor', 'Test wallet'],
    steps: [
      { label: 'Amount', title: 'Start with an example amount.', detail: 'This walkthrough uses a fictional rate of 40 TRY per USDC and an example fee of zero.', balances: ['400 TRY', 'No request', '0 test USDC'], action: 'Show the example quote', moving: 'The mock quote converts the example amount.' },
      { label: 'Quoted', title: '400 TRY becomes 10 test USDC.', detail: 'A quote is not a bank transfer. This is an illustration, not a live exchange rate.', balances: ['400 TRY', '40 TRY per USDC', '10 quoted'], action: 'Create a simulated request', moving: 'The mock anchor records the deposit request.' },
      { label: 'Pending', title: 'Instructions received. Completion is still pending.', detail: 'The application must check the anchor’s returned status rather than assume money arrived.', balances: ['No real TRY moved', 'Request pending', 'Not credited'], action: 'Show simulated completion', moving: 'The illustrated request changes to completed.' },
      { label: 'Completed', title: 'The example ends with 10 test USDC.', detail: 'Nothing was sent to a bank or credited to a real wallet by this demonstration.', balances: ['Simulation only', 'Example completed', '10 test USDC'] },
    ],
    failure: { at: 1, action: 'What if the anchor is offline?', title: 'The deposit cannot be confirmed.', detail: 'Wait for the service and check the request status. An unavailable response does not mean a completed deposit.' },
    note: 'The app’s mock flow includes wallet authentication and identity steps. Use test information and test assets only.',
  },
  ledger: {
    title: 'Keep the receipt. Check the payment.',
    summary: 'Maya exports the record of Noor’s 150 USDC design fee.',
    catalog: 'Keep a payment record and check its transaction reference.',
    preview: ['150 USDC record', 'Export + inspect', 'Check transaction'],
    actors: ['Browser history', 'Exported Proof Pack', 'Network reference'],
    steps: [
      { label: 'Recorded', title: 'A payment appears in Maya’s history.', detail: 'The local entry contains an amount, status and the available transaction reference.', balances: ['150 USDC entry', 'Not exported', 'Not checked'], action: 'Export the Proof Pack', moving: 'The recorded entry is copied into an export file.' },
      { label: 'Exported', title: 'The receipt can leave this browser.', detail: 'The example file is unsigned. Connecting a wallet does not automatically sign an export.', balances: ['History kept', 'Unsigned file', 'Not checked'], action: 'Check the file’s integrity', moving: 'The checksum is compared with the exported content.' },
      { label: 'Intact', title: 'The file is intact. Payment is still a separate question.', detail: 'A matching checksum does not prove that 150 USDC reached Noor.', balances: ['150 USDC entry', 'Checksum matches', 'Still to verify'], action: 'Inspect the transaction example', moving: 'The reference is compared with the network, amount and recipient.' },
      { label: 'Checked', title: 'The example transaction matches the receipt.', detail: 'In actual use, check the network result and recipient before relying on a payment claim.', balances: ['150 USDC entry', 'Record preserved', 'Noor · 150 USDC'] },
    ],
    failure: { at: 1, action: 'Change the exported amount', title: 'The file no longer matches its checksum.', detail: 'That detects this edit. A new matching checksum could still be made, so network verification remains necessary.' },
    note: 'This illustrated lookup performs no network verification. Local history and exports are not independent proof of payment.',
  },
}
