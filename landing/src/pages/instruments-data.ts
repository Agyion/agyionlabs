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

const APP = 'https://agyionlabs.dev/app'
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
        { n: '02', title: 'Price walks down', body: 'The price decreases linearly, second by second, enforced by the contract itself. Any buyer can claim at the current price — no negotiation, no counterparty risk.' },
        { n: '03', title: 'Below zero', body: 'If the price crosses the floor and goes negative, the direction flips: the pot pays the claimer. Unsold inventory stops being a loss and becomes a settlement.' },
      ],
    },
    image: { src: '/media/agyion-fade.png', alt: 'Fade — decaying price curve rendered as a green depth chart', caption: 'PRICE(t) — LINEAR DESCENT, COMPILED' },
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
    cta: { label: 'Open Fade in the app', href: APP },
  },
  {
    slug: 'pod',
    tag: 'POD',
    hero: {
      left: 'P',
      right: 'OD',
      desc: 'A time-locked capsule.\nNo one opens it before 2035 — not even me.',
      metaLeft: 'INSTRUMENT 02',
      metaCenter: 'TIMELOCK + PREIMAGE',
      metaRight: 'PROOF ON-CHAIN',
    },
    mechanism: {
      title: 'THE MECHANISM',
      steps: [
        { n: '01', title: 'Seal the capsule', body: 'Funds are locked with a hashlock and a hard timelock. Until the deadline, no key, no admin, no founder can move them. The rule outranks its author.' },
        { n: '02', title: 'Wait', body: 'Time does the work. The capsule sits on-chain, publicly verifiable, untouchable. Checking it costs nothing; opening it early is impossible.' },
        { n: '03', title: 'Reveal', body: 'After the timelock, the preimage is revealed and the capsule pays out. Both the lock and the claim are public transactions — proof, not trust.' },
      ],
    },
    image: { src: '/media/agyion-pod.png', alt: 'Pod — a sealed capsule of light in dark water', caption: 'SEALED UNTIL 2035 — HASHLOCKED' },
    params: [
      { label: 'AMOUNT', value: 'USDC locked' },
      { label: 'UNLOCK DATE', value: 'e.g. 2035-01-01' },
      { label: 'HASHLOCK', value: 'sha256(preimage)' },
      { label: 'BENEFICIARY', value: 'Stellar pubkey' },
    ],
    lifecycle: ['SEAL', 'WAIT', 'REVEAL', 'PAYOUT'],
    proof: [
      { label: 'POD LOCK TX', value: 'd193a85b…' },
      { label: 'PREIMAGE CLAIM TX', value: 'f466151d…' },
      { label: 'KERNEL', value: KERNEL },
    ],
    cta: { label: 'Open Pod in the app', href: APP },
  },
  {
    slug: 'trigger',
    tag: 'TRIGGER',
    hero: {
      left: 'TRIG',
      right: 'GER',
      desc: 'Escrow that executes when an event is proven.\nRefunds when it is not.',
      metaLeft: 'INSTRUMENT 03',
      metaCenter: 'ORACLE-GATED ESCROW',
      metaRight: 'BINARY OUTCOME',
    },
    mechanism: {
      title: 'THE MECHANISM',
      steps: [
        { n: '01', title: 'Define the event', body: 'Two parties agree on a verifiable condition and an oracle that can attest to it. Funds are escrowed against that condition — not against someone\'s word.' },
        { n: '02', title: 'Oracle attests', body: 'The oracle observes the real world and posts proof on-chain. The contract checks the attestation; nobody votes, nobody decides.' },
        { n: '03', title: 'Execute or refund', body: 'Proven: the escrow executes and pays the beneficiary. Not proven by the deadline: it refunds the depositor. Both paths are pre-compiled — there is no third option.' },
      ],
    },
    image: { src: '/media/agyion-trigger.png', alt: 'Trigger — a beam of green light switching a circuit', caption: 'IF PROVEN → EXECUTE / ELSE → REFUND' },
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
    cta: { label: 'Open Trigger in the app', href: APP },
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
        { n: '03', title: 'Revoke anytime', body: 'One click and the mandate dies on-chain. No "please stop", no support ticket. The unspent remainder returns immediately.' },
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
    cta: { label: 'Open Envoy in the app', href: APP },
  },
]

export const RAMP = {
  hero: {
    left: 'ON/OFF',
    right: 'RAMP',
    desc: 'TRY in, USDC out — and back.\nThe merchant sees only TRY.',
    metaLeft: 'BRIDGE 05',
    metaCenter: 'SEP-10 · SEP-6 · SEP-12 · SEP-38',
    metaRight: 'TR MOCK ANCHOR',
  },
  steps: [
    { n: 'SEP-10', title: 'Authenticate', body: 'The wallet proves ownership by signing a challenge from the anchor. No passwords, no accounts — a Stellar signature is the login.' },
    { n: 'SEP-12', title: 'Verify (KYC)', body: 'Identity data goes to the anchor through the standard SEP-12 interface. The contract layer never touches personal data.' },
    { n: 'SEP-38', title: 'Quote', body: 'A firm TRY↔USDC rate is quoted up front. The number you see is the number that settles.' },
    { n: 'SEP-6', title: 'Deposit / withdraw', body: 'TRY in via bank transfer, USDC arrives in the wallet. Or USDC in, TRY lands in the bank account. Programmatic, no tickets.' },
  ],
  note: {
    title: 'THE MERCHANT SEES ONLY TRY',
    body: 'A venue running Fade never touches crypto. Settlement passes through the anchor and arrives as an ordinary TRY bank transfer. The customer pays in USDC; the merchant\'s accountant sees a normal day.',
  },
  anchor: 'https://tr-mock-anchor.fly.dev',
  cta: { label: 'Open On/Off-Ramp in the app', href: APP },
}

export const LEDGER = {
  hero: {
    left: 'LED',
    right: 'GER',
    desc: 'Every rule, every proof, every refund.\nOne local ledger. Exportable as a signed Proof Pack.',
    metaLeft: 'RECORD 06',
    metaCenter: 'LOCAL-FIRST PROOFS',
    metaRight: 'SIGNED JSON EXPORT',
  },
  features: [
    { n: '01', title: 'Local-first', body: 'Every lock, claim, execution and refund you make is recorded in a local ledger on your device. Your history is yours — exportable, deletable, never hosted.' },
    { n: '02', title: 'Proof Pack', body: 'One click exports a signed JSON bundle: the rule parameters, the transaction hashes, the contract address. Anyone can verify it against the chain — no account on our side required.' },
    { n: '03', title: 'Verifiable by anyone', body: 'Each entry links to a real testnet transaction. The ledger is a readable index over public truth, not a private database asking to be trusted.' },
  ],
  packFields: ['RULE PARAMETERS', 'TX HASHES', 'KERNEL ADDRESS', 'SIGNATURE'],
  kernel: KERNEL,
  cta: { label: 'Open Ledger in the app', href: APP },
}

export const PAGE_ORDER = [
  { slug: 'fade', label: 'FADE' },
  { slug: 'pod', label: 'POD' },
  { slug: 'trigger', label: 'TRIGGER' },
  { slug: 'envoy', label: 'ENVOY' },
  { slug: 'ramp', label: 'ON/OFF RAMP' },
  { slug: 'ledger', label: 'LEDGER' },
]
