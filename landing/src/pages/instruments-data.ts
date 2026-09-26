/* Content model for the six product pages (4 instruments + ramp + ledger).
 * Kept outside config.ts on purpose: config is the landing schema guarded by
 * validateConfig + 28 vitest tests — product-page copy lives here instead. */

export interface InstrumentData {
  slug: string
  tag: string
  hero: { left: string; right: string; desc: string; metaLeft: string; metaCenter: string; metaRight: string }
  mechanism: { title: string; steps: { n: string; title: string; body: string }[] }
  image: { src: string; alt: string; caption: string }
  params: { label: string; value: string }[]
  lifecycle: string[]
  proof: { label: string; value: string }[]
  cta: { label: string; href: string }
}

const APP = '/app/'
const KERNEL = 'CAVVTPBBNOCMDBC26CVOXKSU7B7MDK33TXQXTVUVKSJHSVKGLZTVJ5N5'

export const INSTRUMENTS: InstrumentData[] = [
  {
    slug: 'fade',
    tag: 'FADE',
    hero: {
      left: 'FA',
      right: 'DE',
      desc: 'A price that walks backwards.\nBelow zero, the pot pays you.',
      metaLeft: 'INSTRUMENT 01',
      metaCenter: 'LINEAR DECAY — ON-CHAIN',
      metaRight: 'STELLAR TESTNET',
    },
    mechanism: {
      title: 'THE MECHANISM',
      steps: [
        { n: '01', title: 'Lock the pot', body: 'A seller locks USDC into the kernel contract with a start price, a floor price, and a duration. The decay schedule is compiled into the rule — not promised by a person.' },
        { n: '02', title: 'Price walks down', body: 'The price decreases linearly, second by second, enforced by the contract itself. Any buyer can claim at the current price — under the configured claim and settlement terms.' },
        { n: '03', title: 'Below zero', body: 'If the price crosses the floor and goes negative, the direction flips: the pot pays the claimer. Unsold inventory stops being a loss and becomes a settlement.' },
      ],
    },
    image: { src: '/media/agyion-fade.png', alt: 'Fade — decaying price curve rendered as a descending price curve', caption: 'PRICE(t) — LINEAR DESCENT, COMPILED' },
    params: [
      { label: 'POT', value: 'USDC amount locked' },
      { label: 'START PRICE', value: 'Price at t = 0' },
      { label: 'FLOOR PRICE', value: 'Negative allowed' },
      { label: 'DURATION', value: 'Seconds to floor' },
      { label: 'HANDOFF WINDOW', value: 'Claim settlement window' },
      { label: 'VENUE PUBKEY', value: 'Settlement destination' },
    ],
    lifecycle: ['LOCK', 'DECAY', 'CLAIM', 'SETTLE'],
    proof: [
      { label: 'KERNEL', value: KERNEL },
      { label: 'NETWORK', value: 'Stellar Testnet' },
    ],
    cta: { label: 'Open Fade in the app', href: APP + '?tab=fade' },
  },
  {
    slug: 'pod',
    tag: 'POD',
    hero: {
      left: 'P',
      right: 'OD',
      desc: 'A time-locked capsule.\nNo one opens it before 2035 — not even me.',
      metaLeft: 'INSTRUMENT 02',
      metaCenter: 'TIMELOCK + CLAIM KEY',
      metaRight: 'PROOF ON-CHAIN',
    },
    mechanism: {
      title: 'THE MECHANISM',
      steps: [
        { n: '01', title: 'Seal the capsule', body: 'Save a fresh claim key before locking funds. The contract records its public key and unlock ledger.' },
        { n: '02', title: 'Wait', body: 'Opening requires the unlock ledger. Long-lived records also need storage maintenance or restoration.' },
        { n: '03', title: 'Authorize', body: 'The key signs locally for the recipient wallet. Only the signature is submitted; amounts and wallet addresses remain public.' },
      ],
    },
    image: { src: '/media/agyion-pod.png', alt: 'Pod — a sealed capsule of light in dark water', caption: 'TIMELOCK + RECIPIENT-BOUND SIGNATURE' },
    params: [
      { label: 'AMOUNT', value: 'USDC locked' },
      { label: 'UNLOCK DATE', value: 'e.g. 2035-01-01' },
      { label: 'CLAIM KEY', value: 'Ed25519 · protocol v3' },
      { label: 'BENEFICIARY', value: 'Stellar pubkey' },
    ],
    lifecycle: ['SEAL', 'WAIT', 'SIGN', 'PAYOUT'],
    proof: [
      { label: 'NETWORK', value: 'Stellar Testnet' },
      { label: 'KERNEL', value: KERNEL },
    ],
    cta: { label: 'Open Pod in the app', href: APP + '?tab=pod' },
  },
  {
    slug: 'trigger',
    tag: 'TRIGGER',
    hero: {
      left: 'TRIG',
      right: 'GER',
      desc: 'Escrow unlocked by a proven event.\nAn eligible refund can be claimed after expiry.',
      metaLeft: 'INSTRUMENT 03',
      metaCenter: 'ORACLE-GATED ESCROW',
      metaRight: 'BINARY OUTCOME',
    },
    mechanism: {
      title: 'THE MECHANISM',
      steps: [
        { n: '01', title: 'Define the event', body: 'Two parties agree on a verifiable condition and an oracle that can attest to it. Funds are escrowed against that condition — not against someone\'s word.' },
        { n: '02', title: 'Oracle attests', body: 'The configured oracle signs an attestation. A transaction submits the proof and the contract checks it against the rule.' },
        { n: '03', title: 'Execute or refund', body: 'Submit an accepted proof to execute the escrow for the beneficiary. If the rule expires without execution, submit an eligible refund claim. Both paths require a transaction; time passing alone does not move funds.' },
      ],
    },
    image: { src: '/media/agyion-trigger.png', alt: 'Trigger — a beam of light switching a circuit', caption: 'IF PROVEN → EXECUTE / ELSE → REFUND' },
    params: [
      { label: 'ESCROW', value: 'USDC amount' },
      { label: 'CONDITION', value: 'Oracle-attested event' },
      { label: 'ORACLE', value: 'Attesting pubkey' },
      { label: 'DEADLINE', value: 'Refund after this' },
      { label: 'BENEFICIARY', value: 'Paid if proven' },
    ],
    lifecycle: ['ESCROW', 'ATTEST', 'EXECUTE', 'REFUND'],
    proof: [
      { label: 'KERNEL', value: KERNEL },
      { label: 'NETWORK', value: 'Stellar Testnet' },
    ],
    cta: { label: 'Open Trigger in the app', href: APP + '?tab=trigger' },
  },
  {
    slug: 'envoy',
    tag: 'ENVOY',
    hero: {
      left: 'EN',
      right: 'VOY',
      desc: 'A spending mandate for AI agents.\nCaps, expiry, one-click revoke.',
      metaLeft: 'INSTRUMENT 04',
      metaCenter: 'DELEGATED SPENDING',
      metaRight: 'REVOCABLE',
    },
    mechanism: {
      title: 'THE MECHANISM',
      steps: [
        { n: '01', title: 'Issue the mandate', body: 'You delegate a bounded spending rule to an agent: a cap, an expiry, an allowed set of destinations. The agent can act — but only inside the rule.' },
        { n: '02', title: 'Agent spends', body: 'The agent pays for services within its mandate. Every spend is checked by the contract against cap and expiry before a single unit moves.' },
        { n: '03', title: 'Revoke anytime', body: 'Submit a revocation transaction to end the mandate. Review the transaction result before treating the mandate as revoked; recover eligible remaining funds through the contract claim path.' },
      ],
    },
    image: { src: '/media/agyion-envoy.png', alt: 'Envoy — a courier of light carrying a sealed envelope', caption: 'MANDATE: CAP + EXPIRY + REVOKE' },
    params: [
      { label: 'CAP', value: 'Max USDC spendable' },
      { label: 'EXPIRY', value: 'Mandate dies here' },
      { label: 'ALLOWLIST', value: 'Allowed destinations' },
      { label: 'AGENT KEY', value: 'Delegatee pubkey' },
      { label: 'REVOKE', value: 'One-click, on-chain' },
    ],
    lifecycle: ['DELEGATE', 'SPEND', 'MONITOR', 'REVOKE'],
    proof: [
      { label: 'KERNEL', value: KERNEL },
      { label: 'NETWORK', value: 'Stellar Testnet' },
    ],
    cta: { label: 'Open Envoy in the app', href: APP + '?tab=envoy' },
  },
]

export const RAMP = {
  hero: {
    left: 'ON/OFF',
    right: 'RAMP',
    desc: 'Explore TRY ↔ USDC.\nA mock anchor for testnet flows.',
    metaLeft: 'BRIDGE 05',
    metaCenter: 'SEP-10 · SEP-6 · SEP-12 · SEP-38',
    metaRight: 'TR MOCK ANCHOR',
  },
  steps: [
    { n: 'SEP-10', title: 'Authenticate', body: 'The wallet proves ownership by signing a challenge from the anchor. No passwords, no accounts — a Stellar signature is the login.' },
    { n: 'SEP-12', title: 'Verify (KYC)', body: 'Identity data goes to the anchor through the standard SEP-12 interface. The contract layer never touches personal data.' },
    { n: 'SEP-38', title: 'Quote', body: 'The mock anchor returns an illustrative TRY↔USDC quote. It is not a live exchange rate or an offer to exchange real funds.' },
    { n: 'SEP-6', title: 'Deposit / withdraw', body: 'Walk through a mock deposit or withdrawal. This experimental environment does not send a bank transfer or settle real TRY.' },
  ],
  note: {
    title: 'A TEST ENVIRONMENT',
    body: 'The ramp demonstrates how an anchor can connect local currency and Stellar assets. This mock integration does not provide live banking or exchange services.',
  },
  anchor: 'https://tr-mock-anchor.fly.dev',
  cta: { label: 'Open On/Off-Ramp in the app', href: APP + '?tab=ramp' },
}

export const LEDGER = {
  hero: {
    left: 'LED',
    right: 'GER',
    desc: 'Your activity, on your device.\nA local ledger with an exportable Proof Pack.',
    metaLeft: 'RECORD 06',
    metaCenter: 'LOCAL-FIRST PROOFS',
    metaRight: 'JSON EXPORT',
  },
  features: [
    { n: '01', title: 'Local-first', body: 'Every lock, claim, execution and refund you make is recorded in a local ledger on your device. Your history is yours — exportable, deletable, never hosted.' },
    { n: '02', title: 'Proof Pack', body: 'Export a JSON bundle of recorded activity and transaction references. Check each referenced transaction against the configured Stellar network; the export alone does not prove settlement.' },
    { n: '03', title: 'Verifiable by anyone', body: 'Successful recorded transactions can be checked against the configured testnet. Mock and local records are not evidence of on-chain settlement.' },
  ],
  packFields: ['RULE PARAMETERS', 'TX HASHES', 'KERNEL ADDRESS', 'SIGNATURE'],
  kernel: KERNEL,
  cta: { label: 'Open Ledger in the app', href: APP + '?tab=ledger' },
}

export const PAGE_ORDER = [
  { slug: 'fade', label: 'FADE' },
  { slug: 'pod', label: 'POD' },
  { slug: 'trigger', label: 'TRIGGER' },
  { slug: 'envoy', label: 'ENVOY' },
  { slug: 'ramp', label: 'ON/OFF RAMP' },
  { slug: 'ledger', label: 'LEDGER' },
]
