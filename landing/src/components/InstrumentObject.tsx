import type { DetailInstrument } from './instrumentMechanismState'

/** A catalog object, separate from the interactive teaching illustration. */
export default function InstrumentObject({ kind }: { kind: DetailInstrument }) {
  return <svg className={`instrument-object instrument-object--${kind}`} viewBox="0 0 400 260" fill="none" aria-hidden="true" focusable="false">
    {kind === 'fade' && <>
      <path className="object-shell" d="M26 35h348v58a15 15 0 0 0 0 30v101H26V123a15 15 0 0 0 0-30Z" />
      <path className="object-rule" d="M280 36v188M46 187h214" strokeDasharray="3 6" />
      <path className="object-curve" d="M51 84c58 0 59 70 113 70s65 29 94 29" />
      <circle className="object-dot" cx="164" cy="154" r="6" />
      <text x="48" y="64">12</text><text x="179" y="143" className="object-accent">8</text><text x="245" y="211">4</text>
      <text x="303" y="144" className="object-large">8</text>
      <path className="object-rule" d="M305 171h40m-40 9h40m-40 9h18" />
    </>}
    {kind === 'pod' && <>
      <path className="object-shell" d="M115 53c0-25 170-25 170 0v151c0 25-170 25-170 0Z" />
      <ellipse className="object-rule" cx="200" cy="53" rx="85" ry="23" />
      <path className="object-rule" d="M131 74v110m138-110v110M200 77v113" />
      <circle className="object-lock" cx="200" cy="125" r="37" />
      <path className="object-highlight" d="M186 123v-11a14 14 0 0 1 28 0v11m-29 0h30v25h-30Zm15 10v6" />
      <path className="object-rule" d="M85 90v101m-7-85h14m-14 28h14m-14 28h14m-14 28h14" />
      <circle className="object-lock" cx="300" cy="191" r="27" /><path className="object-highlight" d="M300 176v16l10 6" />
    </>}
    {kind === 'trigger' && <>
      <path className="object-rule" d="M91 129h74m74 0h43V67h49m-49 62v67h49" />
      <rect className="object-shell" x="28" y="91" width="91" height="77" rx="3" />
      <text x="48" y="128" className="object-value">150</text>
      <path className="object-lock" d="m200 81 48 48-48 48-48-48Z" />
      <path className="object-highlight" d="m184 129 11 11 23-24" />
      <rect className="object-shell" x="310" y="44" width="65" height="47" rx="3" />
      <rect className="object-shell" x="310" y="172" width="65" height="47" rx="3" />
      <path className="object-highlight" d="m331 66 7 7 14-16" /><path className="object-rule" d="m334 188 12 12m0-12-12 12" />
    </>}
    {kind === 'envoy' && <>
      <rect className="object-shell" x="49" y="38" width="302" height="190" rx="8" />
      <path className="object-rule" d="M49 87h302M237 106v98" />
      <circle className="object-lock" cx="85" cy="62" r="8" /><path className="object-highlight" d="M101 62h108" />
      <text x="72" y="174" className="object-large">50</text>
      <text x="263" y="176" className="object-value">≤ 0</text>
      <path className="object-highlight" d="m75 201 13-8 5 10 12-13 5 12 14-6h30" />
    </>}
    {kind === 'ramp' && <>
      <rect className="object-shell" x="25" y="57" width="146" height="152" rx="3" /><rect className="object-shell" x="229" y="32" width="146" height="152" rx="3" />
      <text x="45" y="141" className="object-large">400</text><text x="46" y="181">TRY</text>
      <text x="250" y="116" className="object-large">10</text><text x="250" y="155">USDC</text>
      <path className="object-highlight" d="M155 131h91m-12-12 12 12-12 12" />
    </>}
    {kind === 'ledger' && <>
      <path className="object-shell" d="M106 24h188v214l-12-7-12 7-12-7-12 7-12-7-12 7-12-7-12 7-12-7-12 7-12-7-12 7-12-7-12 7-10-7-10 7V24Z" />
      <text x="125" y="104" className="object-large">150</text>
      <path className="object-rule" d="M126 122h148m-148 23h83m-83 14h120m-120 14h65" />
      <path className="object-highlight" d="M126 199h100m-10-8 10 8-10 8" />
    </>}
  </svg>
}
