import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { gsap } from 'gsap'
import { completeMechanism, fadePrice, INITIAL_MECHANISM_INPUTS, mechanismResult, type DetailInstrument, type MechanismAction, type MechanismInputs, type MechanismResult } from './instrumentMechanismState'
import '../styles/instrument-mechanism.css'

export type { DetailInstrument } from './instrumentMechanismState'
type Run = { id: number; result: MechanismResult; input: MechanismInputs; replay: boolean }
const AMBER = '#ed9850'
const TITLES: Record<DetailInstrument, [string, string, string]> = {
  fade: ['A price with a direction.', 'Move the clock. Watch who pays whom.', 'PRICE / TIME'],
  pod: ['A seal with two conditions.', 'Time permits. A signature authorizes.', 'TIME / AUTHORITY'],
  trigger: ['One escrow. Two exits.', 'Follow the evidence through the gate.', 'EVIDENCE / OUTCOME'],
  envoy: ['The agent acts. You receive.', 'Trace a mandate all the way back to its owner.', 'PERMISSION / CLAIM'],
  ramp: ['Across the currency boundary.', 'Follow either direction through the mock anchor.', 'LOCAL / NETWORK'],
  ledger: ['Activity becomes a reference.', 'Assemble a bundle. Then test its integrity.', 'RECORD / REFERENCE'],
}
const fmt = (n: number) => n < 0 ? `−${Math.abs(n)}` : n > 0 ? `+${n}` : '0'

function Route({ name, d }: { name: string; d: string }) {
  return <g><path className="im-route" data-route={name} d={d} /><path className="im-trace" data-trace={name} d={d} /></g>
}
function Parcel({ name = 'parcel' }: { name?: string }) {
  return <g data-parcel={name} className="im-parcel" transform="translate(-40 -40)"><circle r="15" className="im-parcel__halo" /><rect x="-9" y="-5" width="18" height="10" rx="3" /><path d="M-3 -3V3M3 -3V3" /></g>
}
function Cross({ x, y }: { x: number; y: number }) {
  return <g data-motion="deny" className="im-deny" transform={`translate(${x} ${y})`}><circle r="24" /><path d="M-8 -8L8 8M8 -8L-8 8" /></g>
}
function Hardware({ x, y, width = 122, children, label, sub }: { x: number; y: number; width?: number; children: ReactNode; label: string; sub?: string }) {
  const w = width / 2
  return <g transform={`translate(${x} ${y})`} className="im-hardware">
    <path className="im-hardware__depth" d={`M${-w} -40L${-w + 15} -55H${w - 15}L${w} -40V41L${w - 15} 56H${-w + 15}L${-w} 41Z`} />
    <path className="im-hardware__face" d={`M${-w} -47L${-w + 15} -62H${w - 15}L${w} -47V34L${w - 15} 49H${-w + 15}L${-w} 34Z`} />
    <path className="im-edge" d={`M${-w + 7} -45L${-w + 18} -55H${w - 19}M${-w + 7} -43V27`} />
    <circle cx={-w + 15} cy="30" r="2" /><circle cx={w - 15} cy="30" r="2" />
    {children}<text className="im-node-label" y="84" textAnchor="middle">{label}</text>{sub && <text className="im-annotation" y="109" textAnchor="middle">{sub}</text>}
  </g>
}
function OwnerIcon() { return <g className="im-icon"><circle cy="-20" r="12" /><path d="M-24 19V8C-24 -5 24 -5 24 8V19M-31 25H31" /></g> }
function AgentIcon() { return <g className="im-icon"><path d="M-26 -27H26V13L15 24H-15L-26 13ZM-9 -27V-37H9M-36 -9H-26M26 -9H36" /><path d="M-13 -6H-5M5 -6H13M-9 10H9" /></g> }
function TokenIcon() { return <g className="im-icon"><circle cy="-9" r="27" /><circle cy="-9" r="21" /><path d="M7 -24H-5C-17 -24 -17 -9 -5 -9H5C17 -9 17 6 5 6H-7M0 -31V-24M0 6V13" /></g> }
function Stamp({ children }: { children: ReactNode }) { return <text className="im-stamp" x="500" y="483" textAnchor="middle">{children}</text> }

function FadeScene({ input }: { input: MechanismInputs }) {
  const price = fadePrice(input.time)
  return <>
    <path className="im-axis" d="M120 98V334H698M120 263H698" /><path className="im-grid" d="M120 165H698M120 214H698M120 313H698M263 98V334M406 98V334M549 98V334M692 98V334" />
    <text className="im-annotation" x="98" y="136" textAnchor="end">+80</text><text className="im-annotation" x="98" y="270" textAnchor="end">0</text><text className="im-annotation" x="98" y="334" textAnchor="end">−40</text>
    <text className="im-annotation" x="120" y="78">PRICE</text><text className="im-annotation" x="698" y="358" textAnchor="end">TIME →</text>
    <path className="im-curve-shadow" d="M120 130L692 330" /><Route name="price" d="M120 130L692 330" />
    <g transform={`translate(${120 + input.time * 5.72} ${130 + input.time * 2})`}><circle data-motion="price-dot" className="im-price-dot" cx="0" cy="0" r="8" /></g>
    <text className="im-annotation" x="838" y="132" textAnchor="middle">SELECTED PRICE</text><text className="im-value" x="838" y="221" textAnchor="middle">{fmt(price)}</text>
    <text className="im-annotation" x="838" y="253" textAnchor="middle">ILLUSTRATIVE UNITS</text>
    <g className="im-settlement-pod" transform="translate(174 412)"><rect x="-57" y="-26" width="114" height="52" rx="25" /><path d="M-44 -14H44M-44 14H44" /><text className="im-node-label" textAnchor="middle" y="7">POT</text></g>
    <g className="im-settlement-pod" transform="translate(826 412)"><rect x="-75" y="-26" width="150" height="52" rx="25" /><text className="im-node-label" textAnchor="middle" y="7">CLAIMER</text></g>
    <text className="im-annotation" x="500" y="390" textAnchor="middle">ON SETTLEMENT</text>
    <Route name="settlement" d="M234 412H746" /><path className="im-arrow" d="M473 407L481 412L473 417M527 407L519 412L527 417" />
    <Parcel /><Stamp>ONE SCHEDULE · THE SIGN DETERMINES THE PAYMENT DIRECTION</Stamp>
  </>
}
function PodScene({ input }: { input: MechanismInputs }) {
  return <>
    <Route name="signature" d="M206 256H306Q331 256 350 234L405 212H485" />
    <Route name="pod-payout" d="M506 307H641Q680 307 709 274H785" />
    <Hardware x={140} y={259} label="LOCAL KEY" sub="NEVER REVEALED"><g className="im-icon"><path d="M0 -41L27 -29V-8C27 13 0 27 0 27S-27 13 -27 -8V-29Z" /><path d="M-9 -8L-1 0L13 -17" /></g></Hardware>
    <Hardware x={858} y={275} label="RECIPIENT" sub="BOUND TO SIGNATURE"><OwnerIcon /></Hardware>
    <path className="im-mount" d="M331 149L357 123H643L669 149V378L643 403H357L331 378Z" /><path className="im-edge" d="M345 156L363 137H637M346 374L364 390H638" />
    <path className="im-pod-core" data-motion="core" d="M454 185H546L569 207V326L546 348H454L431 326V207Z" />
    <g data-motion="door-left"><path className="im-metal" d="M498 158H422C386 158 364 205 364 266S386 374 422 374H498Z" /><path className="im-edge" d="M486 171H425C398 171 379 212 379 266" /><path className="im-grip" d="M397 228V302M408 220V310M419 215V315" /></g>
    <g data-motion="door-right"><path className="im-metal" d="M502 158H578C614 158 636 205 636 266S614 374 578 374H502Z" /><path className="im-edge" d="M514 171H575C602 171 621 212 621 266" /><path className="im-grip" d="M581 215V315M592 220V310M603 228V302" /></g>
    <circle className="im-seal" data-motion="seal" cx="500" cy="266" r="33" /><path className="im-lock-mark" data-motion="seal-mark" d="M484 279V260H516V279ZM490 260V251C490 237 510 237 510 251V260" />
    <g className={input.mature ? 'im-condition im-condition--on' : 'im-condition'}><circle cx="442" cy="90" r="4" /><text x="456" y="96">UNLOCK LEDGER</text></g>
    <text className="im-annotation" x="303" y="232" textAnchor="middle">SIGNATURE</text>
    <Parcel /><Cross x={500} y={266} /><Stamp>TIMELOCK + SIGNATURE BOUND TO RECIPIENT · PROTOCOL V3</Stamp>
  </>
}
function TriggerScene() {
  return <>
    <Hardware x={158} y={289} label="ESCROW" sub="LOCKED UNTIL A CLAIM"><TokenIcon /></Hardware>
    <Hardware x={842} y={167} label="BENEFICIARY"><OwnerIcon /></Hardware>
    <Hardware x={842} y={382} label="FUNDER"><OwnerIcon /></Hardware>
    <Route name="attestation" d="M169 118H338Q366 118 390 150L466 250" />
    <Route name="trigger-pay" d="M226 278H465Q580 278 627 172H773" />
    <Route name="trigger-refund" d="M226 306H465Q577 306 626 382H773" />
    <g transform="translate(129 98)" className="im-attestation"><path d="M0 0H42L55 13V48H0Z" /><path d="M12 15H31M12 24H41M12 34H30" /></g>
    <text className="im-annotation" x="228" y="98">ORACLE ATTESTATION</text>
    <path className="im-gate" d="M443 170V363M562 170V363M432 178H454M551 178H573M432 352H454M551 352H573" />
    <path className="im-gate-fins" d="M466 191V337M478 191V337M490 191V337M502 191V337M514 191V337M526 191V337M538 191V337" />
    <rect data-motion="scan" className="im-scan" x="445" y="192" width="115" height="6" />
    <text className="im-node-label" x="502" y="405" textAnchor="middle">VALIDATION GATE</text>
    <text className="im-annotation" x="673" y="148">IF PROVEN</text><text className="im-annotation" x="659" y="356">IF EXPIRED + CLAIMED</text>
    <Parcel /><Parcel name="evidence" /><Cross x={501} y={269} /><Stamp>AN ATTESTATION OR REFUND CLAIM STARTS THE TRANSACTION</Stamp>
  </>
}
function EnvoyScene({ input }: { input: MechanismInputs }) {
  return <>
    <Route name="grant-owner" d="M205 226H261Q278 226 301 191L349 170" />
    <Route name="grant-agent" d="M613 170H673Q706 170 729 207L787 226" />
    <Route name="request" d="M914 229H920Q940 229 940 249V326Q940 346 920 346H668" />
    <Route name="validation" d="M596 346H472" />
    <Route name="owner-return" d="M371 349H81Q60 349 60 328V249Q60 229 82 229" />
    <Hardware x={144} y={229} label="OWNER" sub="FIXED CLAIM RECIPIENT"><OwnerIcon /></Hardware>
    <Hardware x={853} y={229} label="AGENT" sub="REQUESTS · NO CUSTODY"><AgentIcon /></Hardware>
    <g transform="translate(350 102)">
      <path className="im-mandate-depth" d="M0 20L20 0H241L265 23V147L246 166H20L0 146Z" />
      <path className="im-mandate" d="M0 11L15 -5H246L265 13V137L246 155H18L0 136Z" />
      <path className="im-edge" d="M11 19L22 7H239M12 22V128" /><path className="im-mandate-lines" d="M26 53H239M26 93H239M26 132H239" />
      <text className="im-node-label" x="26" y="35">MANDATE</text><text className="im-annotation" x="237" y="35" textAnchor="end">HAK / ENVOY</text>
      <text className="im-annotation" x="26" y="78">CLAIMS</text><text className="im-rule-value" x="239" y="78" textAnchor="end">{String(input.claims).padStart(2, '0')} / 50</text>
      <text className="im-annotation" x="26" y="118">EXPIRY</text><text className="im-rule-value" x="239" y="118" textAnchor="end">{input.expired ? 'REACHED' : 'IN WINDOW'}</text>
      <path data-motion="revoke-cut" className="im-revoke-cut" d="M15 142L252 6" />
      {input.revoked && <path className="im-revoke-static" d="M15 142L252 6" />}
      {input.revoked && <text className="im-revoked-label" x="132" y="181" textAnchor="middle">REVOKED</text>}
    </g>
    <text className="im-annotation" x="263" y="197" textAnchor="middle">GRANT</text><text className="im-annotation" x="730" y="154" textAnchor="middle">DELEGATE</text>
    <g transform="translate(632 346)" className="im-validator"><path d="M-35 -26L-22 -38H22L35 -26V25L22 38H-22L-35 25Z" /><path data-motion="validation-check" className="im-check" d="M-17 0L-3 13L19 -13" /><path className="im-validator-slot" d="M-23 -16V16M-11 -16V16M1 -16V16M13 -16V16M25 -16V16" /></g>
    <g transform="translate(421 346)" className="im-fade-claim"><circle r="48" /><circle r="39" /><text className="im-claim-price" textAnchor="middle" y="8">{input.positivePrice ? '+12' : '−12'}</text></g>
    <text className="im-node-label" x="631" y="413" textAnchor="middle">CHECK RULE</text><text className="im-node-label" x="421" y="413" textAnchor="middle">FADE CLAIM</text>
    <text className="im-annotation" x="757" y="374" textAnchor="middle">REQUEST ←</text><text className="im-return-label" x="287" y="380" textAnchor="middle">← BACK TO OWNER</text>
    <Parcel /><Parcel name="permission" /><Cross x={632} y={346} /><Stamp>ZERO OR NEGATIVE PRICE · UP TO 50 CLAIMS · EXPIRY · REVOCATION</Stamp>
  </>
}
function RampScene({ input }: { input: MechanismInputs }) {
  return <>
    <Hardware x={157} y={266} width={142} label="TRY" sub="LOCAL CURRENCY"><g className="im-icon"><path d="M-37 -15L0 -39L37 -15ZM-34 21H34M-29 -9V16M-10 -9V16M10 -9V16M29 -9V16M-39 29H39" /></g></Hardware>
    <Hardware x={843} y={266} width={142} label="TEST USDC" sub="STELLAR TESTNET"><TokenIcon /></Hardware>
    <Route name="ramp-in" d="M233 246C330 80 670 80 767 246" />
    <Route name="ramp-out" d="M767 290C670 450 330 450 233 290" />
    <g className="im-anchor" transform="translate(500 266)"><circle r="98" /><circle r="84" /><path d="M-58 -56L58 56M58 -56L-58 56M0 -97V-76M97 0H76M0 97V76M-97 0H-76" /><rect x="-62" y="-35" width="124" height="70" rx="5" /><text className="im-node-label" textAnchor="middle" y="-7">MOCK</text><text className="im-node-label" textAnchor="middle" y="20">ANCHOR</text></g>
    <text className="im-annotation" x="500" y="92" textAnchor="middle">DEPOSIT →</text><text className="im-annotation" x="500" y="444" textAnchor="middle">← WITHDRAW</text>
    <text className="im-route-note" x="500" y="54" textAnchor="middle">{input.direction === 'in' ? 'LOCAL CURRENCY TO A TEST ASSET' : 'A TEST ASSET TO LOCAL CURRENCY'}</text>
    <Parcel /><Stamp>ILLUSTRATIVE QUOTE · NO LIVE RATE · NO BANK TRANSFER</Stamp>
  </>
}
function LedgerScene({ input }: { input: MechanismInputs }) {
  return <>
    <g className="im-records" transform="translate(142 198)">{[0, 1, 2].map(i => <g key={i} data-record={i} transform={`translate(${i * 13} ${i * 20})`}><path d="M0 0H124L140 16V112H0Z" /><path d="M18 27H108M18 46H91M18 67H118M18 86H68" /></g>)}</g>
    <text className="im-node-label" x="214" y="389" textAnchor="middle">ACTIVITY</text><text className="im-annotation" x="214" y="417" textAnchor="middle">LOCAL RECORDS</text>
    <Route name="record-bundle" d="M311 279H411" /><Route name="bundle-reference" d="M594 279H764" />
    <g className="im-bundle" transform="translate(425 175)"><path d="M0 17L17 0H139L159 20V204H0Z" /><path className="im-edge" d="M10 27V193M23 11H130" /><path className="im-bundle-band" d="M-9 70H169V123H-9Z" /><text className="im-node-label" x="80" y="101" textAnchor="middle">PROOF PACK</text><path data-motion="checksum" className="im-checksum" d="M21 152V181M29 158V181M42 151V181M54 163V181M65 151V181M73 158V181M87 150V181M100 160V181M109 151V181M124 155V181M137 151V181" /></g>
    <text className="im-annotation" x="503" y="410" textAnchor="middle">{input.altered ? 'CONTENT ALTERED' : 'CHECKSUM / INTEGRITY'}</text>
    <Hardware x={842} y={280} width={140} label="REFERENCE" sub="CHECK ON THE NETWORK"><g className="im-icon"><path d="M-19 -34H16L30 -20V25H-30V-23ZM-16 -11H15M-16 0H19M-16 11H7" /></g></Hardware>
    <text className="im-unsigned" x="842" y="158" textAnchor="middle">UNSIGNED</text>
    <Parcel /><Cross x={638} y={279} /><Stamp>A CHECKSUM CHECKS CONTENT · A REFERENCE DOES NOT PROVE SETTLEMENT</Stamp>
  </>
}

function animateRun(root: HTMLElement, run: Run, complete: () => void) {
  const find = <T extends Element>(selector: string) => root.querySelector<T>(selector)!
  const timeline = gsap.timeline({ paused: true, onComplete: complete, defaults: { ease: 'power2.inOut' } })
  gsap.set(root.querySelectorAll('.im-trace, .im-parcel, .im-deny, .im-revoke-cut, .im-check, .im-scan'), { opacity: 0 })
  function illuminate(route: string, at: number, duration: number) {
    const path = find<SVGPathElement>(`[data-trace="${route}"]`), length = path.getTotalLength()
    gsap.set(path, { strokeDasharray: length, strokeDashoffset: length })
    timeline.set(path, { opacity: 1 }, at).to(path, { strokeDashoffset: 0, duration, ease: 'none' }, at)
  }
  function travel(route: string, at: number, duration: number, reverse = false, parcel = 'parcel') {
    const path = find<SVGPathElement>(`[data-route="${route}"]`), target = find<SVGGElement>(`[data-parcel="${parcel}"]`)
    const length = path.getTotalLength(), cursor = { progress: 0 }
    const position = () => { const p = path.getPointAtLength((reverse ? 1 - cursor.progress : cursor.progress) * length); target.setAttribute('transform', `translate(${p.x} ${p.y})`) }
    timeline.call(position, [], at).set(target, { opacity: 1 }, at)
    timeline.to(cursor, { progress: 1, duration, ease: 'none', onUpdate: position }, at).set(target, { opacity: 0 }, at + duration)
    illuminate(route, at, duration)
  }
  function reject(at: number) {
    const deny = find('[data-motion="deny"]')
    timeline.to(deny, { opacity: 1, duration: .35 }, at).to(deny, { opacity: .45, duration: .25 }, at + .5).to(deny, { opacity: 1, duration: .25 }, at + .8)
  }
  const { code, ok } = run.result
  if (code.startsWith('fade')) {
    const dot = find('[data-motion="price-dot"]')
    // React owns the selected-price parent position; GSAP owns only this local
    // offset. Reverting an old run cannot restore an obsolete slider position.
    timeline.fromTo(dot, { attr: { cx: -run.input.time * 5.72, cy: -run.input.time * 2 } }, { attr: { cx: 0, cy: 0 }, duration: 1.8, ease: 'none' }, 0)
    illuminate('price', 0, 1.8)
    if (code !== 'fade-zero') travel('settlement', 2.1, 1.7, code === 'fade-costs')
    else timeline.to(dot, { opacity: .4, duration: .4, yoyo: true, repeat: 1 }, 2.1)
  } else if (code.startsWith('pod')) {
    travel('signature', 0, 1.65)
    timeline.to(find('[data-motion="seal"]'), { stroke: AMBER, duration: .6 }, 1.45)
    if (ok) {
      timeline.to(root.querySelectorAll('[data-motion="seal"], [data-motion="seal-mark"]'), { opacity: 0, duration: .35 }, 2)
      timeline.to(find('[data-motion="door-left"]'), { x: -45, duration: 1.3 }, 2).to(find('[data-motion="door-right"]'), { x: 45, duration: 1.3 }, 2)
      timeline.to(find('[data-motion="core"]'), { fill: AMBER, fillOpacity: .2, duration: .7 }, 2.3)
      travel('pod-payout', 3.4, 1.45)
    } else reject(2)
  } else if (code.startsWith('trigger')) {
    if (code !== 'trigger-refund') travel('attestation', 0, 1.4, false, 'evidence')
    const scan = find('[data-motion="scan"]')
    timeline.set(scan, { opacity: .8 }, .7).fromTo(scan, { y: 0 }, { y: 132, duration: 1.35, ease: 'none' }, .7).to(scan, { opacity: 0, duration: .25 }, 2.1)
    if (ok) travel(code === 'trigger-refund' ? 'trigger-refund' : 'trigger-pay', 2, 1.9)
    else reject(2.1)
  } else if (code.startsWith('envoy')) {
    if (code === 'envoy-grant') { travel('grant-owner', 0, 1.35, false, 'permission'); travel('grant-agent', 1.65, 1.4, false, 'permission') }
    else if (code === 'envoy-revoke') {
      travel('grant-owner', 0, 1.15, false, 'permission')
      const cut = find<SVGPathElement>('[data-motion="revoke-cut"]'), length = cut.getTotalLength()
      timeline.fromTo(cut, { strokeDasharray: length, strokeDashoffset: length, opacity: 1 }, { strokeDashoffset: 0, duration: 1 }, 1.15)
      timeline.to(root.querySelectorAll('[data-route="grant-agent"], [data-route="validation"]'), { opacity: .15, duration: .7 }, 1.9)
      travel('request', 2.2, 1.1); reject(3.3)
    } else {
      travel('request', 0, 1.4)
      if (ok) {
        timeline.to(find('[data-motion="validation-check"]'), { opacity: 1, duration: .35 }, 1.4)
        travel('validation', 1.95, .8); travel('owner-return', 2.95, 1.5)
      } else reject(1.7)
    }
  } else if (code === 'ramp-mock') travel(run.input.direction === 'in' ? 'ramp-in' : 'ramp-out', .4, 3.2)
  else {
    timeline.to(root.querySelectorAll('[data-record]'), { x: 18, duration: 1, stagger: .12 }, 0)
    travel('record-bundle', .6, 1.1)
    timeline.fromTo(find('[data-motion="checksum"]'), { opacity: 0 }, { opacity: 1, duration: .25, repeat: 3, yoyo: true }, 1.6)
    timeline.set(find('[data-motion="checksum"]'), { opacity: 1 }, 2.65)
    if (ok) travel('bundle-reference', 2.9, 1.3); else reject(2.9)
  }
  // A finite history, never an ambient/infinite ticker. The hold lets the final
  // physical relationship settle before announcing the semantic result.
  timeline.to({}, { duration: .45 })
  return timeline
}

function previewInput(): MechanismInputs {
  return { ...INITIAL_MECHANISM_INPUTS, mature: true, signed: true, granted: true }
}
function previewAction(kind: DetailInstrument): MechanismAction {
  return ({ fade: 'claim', pod: 'open', trigger: 'submit', envoy: 'request', ramp: 'bridge', ledger: 'bundle' } as const)[kind]
}

function MechanismExhibit({ kind, preview }: { kind: DetailInstrument; preview: boolean }) {
  const [input, setInput] = useState<MechanismInputs>(() => preview ? previewInput() : { ...INITIAL_MECHANISM_INPUTS })
  const [run, setRun] = useState<Run | null>(() => preview ? { id: 0, input: previewInput(), result: mechanismResult(kind, previewAction(kind), previewInput()), replay: false } : null)
  const [busy, setBusy] = useState(preview)
  const root = useRef<HTMLElement>(null), serial = useRef(0), completedRun = useRef<number | null>(null), id = useId()
  const [title, subtitle, dimension] = TITLES[kind]
  useEffect(() => {
    if (!run || !root.current) return
    const element = root.current, media = window.matchMedia('(prefers-reduced-motion: reduce)')
    let visible = false, disposed = false, finished = false
    const done = () => {
      if (disposed || finished || run.id !== serial.current) return
      finished = true
      // Reduced-motion previews complete during mount. StrictMode may replay
      // that effect; a completed illustrative claim still counts only once.
      if (completedRun.current !== run.id) {
        completedRun.current = run.id
        if (!run.replay) setInput(previous => completeMechanism(previous, run.result))
      }
      setBusy(false)
    }
    let timeline: gsap.core.Timeline
    const context = gsap.context(() => { timeline = animateRun(element, run, done) }, element)
    const sync = () => {
      if (disposed || finished) return
      if (media.matches) timeline.progress(1)
      else if (visible && !document.hidden) timeline.play()
      else timeline.pause()
    }
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); sync() }, { threshold: .1 })
    observer?.observe(element.querySelector('.im-stage')!)
    document.addEventListener('visibilitychange', sync); media.addEventListener('change', sync)
    if (!observer || media.matches) timeline!.progress(1)
    return () => {
      disposed = true; observer?.disconnect(); document.removeEventListener('visibilitychange', sync); media.removeEventListener('change', sync)
      timeline?.kill(); context.revert()
      element.querySelectorAll('[data-parcel]').forEach(parcel => parcel.setAttribute('transform', 'translate(-40 -40)'))
    }
  }, [run])
  function start(action: MechanismAction) {
    if (busy && action !== 'revoke') return
    const snapshot = { ...input }, result = mechanismResult(kind, action, snapshot)
    setBusy(true); setRun({ id: ++serial.current, input: snapshot, result, replay: false })
  }
  function replay() { if (!run || busy) return; setBusy(true); setRun({ ...run, id: ++serial.current, replay: true }) }
  function reset() { ++serial.current; setRun(null); setBusy(false); setInput({ ...INITIAL_MECHANISM_INPUTS }) }
  const change = <K extends keyof MechanismInputs>(key: K, value: MechanismInputs[K]) => { ++serial.current; setRun(null); setInput(previous => ({ ...previous, [key]: value })) }
  const toggle = (key: 'mature' | 'signed' | 'expired' | 'positivePrice' | 'altered', label: string, disabled = busy) => <label className="im-toggle"><input type="checkbox" checked={input[key]} disabled={disabled} onChange={event => change(key, event.target.checked)} /><span className="im-toggle__mark" aria-hidden="true" /><span>{label}</span></label>
  const action = (name: MechanismAction, label: string, secondary = false, disabled = busy) => <button className={secondary ? 'im-button im-button--secondary' : 'im-button'} type="button" data-action={name} disabled={disabled} onClick={() => start(name)}>{label}<span aria-hidden="true">{name === 'revoke' ? '×' : '↗'}</span></button>
  return <section ref={root} className={`instrument-mechanism instrument-mechanism--${kind}${preview ? ' instrument-mechanism--preview' : ''}`} data-mechanism={kind} data-running={busy} data-outcome={!busy ? run?.result.code ?? 'ready' : 'running'} aria-labelledby={`${id}-heading`}>
    <header className="im-heading"><div><p className="im-eyebrow">Inside the mechanism <span aria-hidden="true">/</span> {dimension}</p><h2 id={`${id}-heading`}>{title}</h2><p className="im-subtitle">{subtitle}</p></div><span className="im-simulation"><i aria-hidden="true" />Illustration · no funds move</span></header>
    <div className="im-stage"><svg viewBox="0 0 1000 520" fill="none" role="img" aria-labelledby={`${id}-diagram-title`} preserveAspectRatio="xMidYMid meet"><title id={`${id}-diagram-title`}>{title} {subtitle} {preview ? 'Illustrative example. Explore the product for the full controls.' : 'Use the controls below to run this local example.'}</title>
      <defs><pattern id={`${id}-grid`} width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#f3efe6" strokeOpacity=".035" strokeWidth="1" /></pattern></defs>
      <rect width="1000" height="520" fill={`url(#${id}-grid)`} /><path className="im-corner" d="M28 68V30H66M934 30H972V68M28 452V490H66M934 490H972V452" />
      <path className="im-crosshairs" d="M493 30H507M500 23V37M28 253V267M21 260H35M972 253V267M965 260H979" />
      {kind === 'fade' && <FadeScene input={input} />}{kind === 'pod' && <PodScene input={input} />}{kind === 'trigger' && <TriggerScene />}{kind === 'envoy' && <EnvoyScene input={input} />}{kind === 'ramp' && <RampScene input={input} />}{kind === 'ledger' && <LedgerScene input={input} />}
    </svg></div>
    {!preview && <div className="im-console">
      <fieldset className="im-inputs" disabled={false}><legend>Change the conditions</legend>
        {kind === 'fade' && <label className="im-range"><span>Elapsed time <output>{input.time}%</output></span><input aria-label="Elapsed time" type="range" min="0" max="100" value={input.time} disabled={busy} onChange={e => change('time', Number(e.target.value))} /><span className="im-range__ends"><span>+80 start</span><span>−40 floor</span></span></label>}
        {kind === 'pod' && <>{toggle('mature', 'Unlock ledger reached')}{toggle('signed', 'Recipient signature valid')}</>}
        {kind === 'trigger' && <label className="im-select"><span>Evidence to submit</span><select value={input.evidence} disabled={busy} onChange={e => change('evidence', e.target.value as MechanismInputs['evidence'])}><option value="valid">Valid oracle attestation</option><option value="invalid">Invalid attestation</option><option value="expired">Expired · claim refund</option></select></label>}
        {kind === 'envoy' && <><label className="im-range im-range--claims"><span>Claims already used <output>{input.claims} / 50</output></span><input aria-label="Claims already used" type="range" min="0" max="50" value={input.claims} disabled={busy || !input.granted} onChange={e => change('claims', Number(e.target.value))} /></label>{toggle('expired', 'Past expiry', busy || !input.granted)}{toggle('positivePrice', 'Positive price')}</>}
        {kind === 'ramp' && <label className="im-select"><span>Route direction</span><select value={input.direction} disabled={busy} onChange={e => change('direction', e.target.value as MechanismInputs['direction'])}><option value="in">TRY → test USDC</option><option value="out">Test USDC → TRY</option></select></label>}
        {kind === 'ledger' && <>{toggle('altered', 'Alter the exported content')}<span className="im-local-note">Three illustrative activity records</span></>}
      </fieldset>
      <div className="im-actions">
        {kind === 'fade' && action('claim', 'Follow the claim')}{kind === 'pod' && action('open', 'Try to open')}{kind === 'trigger' && action('submit', input.evidence === 'expired' ? 'Claim refund' : 'Submit evidence')}
        {kind === 'envoy' && <>{action('grant', input.revoked ? 'Grant a new mandate' : 'Grant mandate', true, busy || input.granted && !input.revoked)}{action('request', 'Request a claim')}{action('revoke', 'Revoke', true, !input.granted || input.revoked)}</>}
        {kind === 'ramp' && action('bridge', 'Run mock route')}{kind === 'ledger' && action('bundle', 'Build the bundle')}
      </div>
    </div>}
    <footer className="im-result"><span className="im-announcement" role="status" aria-live={preview ? 'off' : 'polite'} aria-atomic="true">{!busy && run ? `${run.result.title} ${run.result.detail}` : ''}</span><div className="im-result__copy"><span className={`im-result__light${run && !busy && !run.result.ok ? ' im-result__light--blocked' : ''}`} aria-hidden="true" /><div><p className="im-result__title">{busy ? 'Following the mechanism…' : run?.result.title ?? 'Your move.'}</p><p className="im-result__detail">{busy ? 'Trace the highlighted route through the same rule.' : run?.result.detail ?? 'Set the conditions above, then run the example.'}</p></div></div><div className="im-playback"><button type="button" onClick={replay} disabled={!run || busy} data-action="replay"><span aria-hidden="true">↻</span> Replay</button>{!preview && <button type="button" onClick={reset} data-action="reset">Reset</button>}</div></footer>
  </section>
}

export default function InstrumentMechanism({ kind, preview = false }: { kind: DetailInstrument; preview?: boolean }) { return <MechanismExhibit key={`${kind}-${preview}`} kind={kind} preview={preview} /> }
