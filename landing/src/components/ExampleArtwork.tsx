import type { DetailInstrument } from './instrumentMechanismState'

type ArtworkProps = { kind: DetailInstrument; stage: number; blocked: boolean }

const INK = '#0c0d10'
const GRAPHITE = '#202126'
const CREAM = '#f1eee7'
const EMBER = '#ed9850'

function Person({ x, y, apron = false }: { x: number; y: number; apron?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-21 2c0-18 42-18 42 0v13c0 27-42 27-42 0Z" fill={INK} />
      <path d="M-22 4c0-17 9-25 23-25 17 0 25 11 22 27L8-4-5 6-22 8" fill={GRAPHITE} />
      <path d="M-9 37v10m18-10v10M-38 104l5-34c2-18 15-25 33-25s31 7 33 25l5 34" fill={GRAPHITE} />
      <path d="M-19 66l-3 37M19 66l3 37" fill="none" />
      {apron && <path d="M-14 48h28l7 54h-42Z" fill={INK} stroke={EMBER} />}
      <path d="M-25 104v27M25 104v27" fill="none" />
    </g>
  )
}

function Pastry({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M-29 3c4-16 16-24 29-24S25-13 29 3c-9 11-49 11-58 0Z" fill={EMBER} stroke={INK} />
      <path d="m-14-12 5 15M0-17 4 2M14-10l2 12" stroke={INK} fill="none" />
    </g>
  )
}

function PaperLines({ x, y, width = 66 }: { x: number; y: number; width?: number }) {
  return (
    <g transform={`translate(${x} ${y})`} fill="none" opacity=".6">
      <path d={`M0 0h${width}M0 13h${width}M0 26h${width * .65}`} />
    </g>
  )
}

function StatusSeal({ stage, blocked, x = 607, y = 76 }: Omit<ArtworkProps, 'kind'> & { x?: number; y?: number }) {
  if (!blocked && stage < 3) return null
  return (
    <g className={`example-art__object example-art__stamp${blocked ? ' example-art__stamp--blocked' : ''}`} transform={`translate(${x} ${y})`} stroke={EMBER}>
      <circle r="19" fill={INK} />
      {blocked ? <path d="m-6-6 12 12m0-12L-6 6" fill="none" strokeWidth="2.4" /> : <path d="m-8 0 5 5L9-7" fill="none" strokeWidth="2.4" />}
    </g>
  )
}

function Bakery() {
  return (
    <g className="example-art__object example-art__bakery">
      <path d="M53 110h156v130H53Z" fill={GRAPHITE} />
      <path d="M60 75h142l18 38H42Z" fill={INK} />
      <path d="m76 75-9 38m42-38-3 38m35-38 3 38m29-38 9 38" stroke={EMBER} />
      <path d="M42 113v8c0 17 29 17 29 0 0 17 30 17 30 0 0 17 30 17 30 0 0 17 30 17 30 0 0 17 30 17 30 0 0 17 29 17 29 0v-8" fill={INK} />
      <path d="M67 145h127v61H67Z" fill={INK} />
      <path d="M70 179h121M108 148v56M153 148v56" stroke={GRAPHITE} />
      <Pastry x={87} y={172} scale={.45} />
      <Pastry x={131} y={172} scale={.45} />
      <Pastry x={173} y={172} scale={.45} />
      <Pastry x={109} y={200} scale={.45} />
      <Pastry x={151} y={200} scale={.45} />
      <path d="M47 211h169v13H47Zm17 13v16m133-16v16" fill={INK} />
    </g>
  )
}

function FadeArt({ stage, blocked }: Omit<ArtworkProps, 'kind'>) {
  return (
    <>
      <Bakery />
      <g className="example-art__object example-art__pastry-box">
        <path d="m296 161 33-31h69l29 31-18 74h-95Z" fill={GRAPHITE} />
        <path d="m296 161 65 19 66-19M361 180v55m-47 0 47-14 48 14" fill="none" />
        <path d="m296 161 33-31 32 15-23 27Zm65-16 37-15 29 31-42 12Z" fill={INK} />
        <Pastry x={361} y={145} scale={.85} />
        <path d="M347 193h28v13h-28Z" fill={INK} stroke={EMBER} />
      </g>
      <g className="example-art__object example-art__buyer">
        <Person x={586} y={99} />
        <path d="m553 168-22 15-31-13m119 1 17 21-8 24" fill="none" />
        <path d="m626 207 22 7-7 31-28-8 9-30Zm-1 3c1-12 16-8 15 4" fill={GRAPHITE} />
      </g>
      <StatusSeal stage={stage} blocked={blocked} />
    </>
  )
}

function PodArt({ stage, blocked }: Omit<ArtworkProps, 'kind'>) {
  const open = stage >= 3 && !blocked
  return (
    <>
      <g className="example-art__object example-art__laptop" transform="translate(460 0)">
        <rect x="51" y="93" width="157" height="110" rx="7" fill={GRAPHITE} />
        <rect x="61" y="105" width="137" height="85" rx="2" fill={INK} />
        <path d="m50 203-14 24h186l-14-24Zm63 0-5 12h43l-5-12" fill={GRAPHITE} />
        <path d="M101 157a28 28 0 1 1 56 0m-28-26v24l15 8" fill="none" stroke={EMBER} />
        <path d="M112 177h35" />
      </g>
      <g className="example-art__object example-art__capsule">
        <rect x="303" y="78" width="115" height="163" rx="49" fill={INK} />
        <g className="example-art__savings" stroke={EMBER}>
          <ellipse cx="360" cy="191" rx="25" ry="9" fill={GRAPHITE} />
          <path d="M335 178v13c0 12 50 12 50 0v-13" fill={GRAPHITE} />
          <ellipse cx="360" cy="178" rx="25" ry="9" fill={GRAPHITE} />
          <path d="M340 165v13c0 10 40 10 40 0v-13" fill={GRAPHITE} />
          <ellipse cx="360" cy="165" rx="20" ry="8" fill={GRAPHITE} />
          <path d="M347 146v12m12-16v13m12-9v12" />
        </g>
        <g className="example-art__object example-art__pod-door example-art__pod-door--left" transform={open ? 'translate(-34 0)' : undefined}>
          <path d="M360 78h-7c-28 0-50 22-50 50v63c0 28 22 50 50 50h7Z" fill={GRAPHITE} />
          <path d="M346 92c-17 0-30 13-30 32v67c0 18 13 33 30 35" opacity=".4" fill="none" />
        </g>
        <g className="example-art__object example-art__pod-door example-art__pod-door--right" transform={open ? 'translate(34 0)' : undefined}>
          <path d="M360 78h8c28 0 50 22 50 50v63c0 28-22 50-50 50h-8Z" fill={GRAPHITE} />
          <path d="M375 94c18 5 30 18 30 38m-30 93c18-5 30-18 30-38" opacity=".4" fill="none" />
        </g>
        {!open && <g className="example-art__object example-art__pod-seal" stroke={EMBER}>
          <circle cx="360" cy="157" r="23" fill={INK} />
          <path d="M352 156v-9a8 8 0 0 1 16 0v9m-19 0h22v17h-22Z" fill={INK} />
          <path d="M360 163v4" />
        </g>}
      </g>
      <g className="example-art__object example-art__wallet" transform="translate(-450 0)">
        <path d="m522 135 106-26v27" fill={INK} />
        <path d="M522 135h123v99H522c-9 0-14-6-14-14v-70c0-9 5-15 14-15Z" fill={GRAPHITE} />
        <path d="M525 147h106M525 221h106" opacity=".45" />
        <path d="M605 165h47v36h-47c-17 0-17-36 0-36Z" fill={INK} stroke={EMBER} />
        <circle cx="613" cy="183" r="4" fill={EMBER} stroke="none" />
      </g>
      <StatusSeal stage={stage} blocked={blocked} />
    </>
  )
}

function TriggerArt({ stage, blocked }: Omit<ArtworkProps, 'kind'>) {
  return (
    <>
      <g className="example-art__object example-art__poster">
        <path d="M64 78h125v163H64Z" fill={GRAPHITE} />
        <path d="M73 87h107v132H73Z" fill={INK} />
        <circle cx="127" cy="134" r="31" stroke={EMBER} />
        <path d="m81 200 30-45 21 25 15-17 25 37Z" fill={EMBER} stroke="none" />
        <path d="M84 102h22m40 0h21M94 231h64" opacity=".7" />
        <path d="m182 215 15-59 8 2-14 59-7 7Z" fill={EMBER} stroke={INK} />
      </g>
      <g className="example-art__object example-art__review">
        <path d="M312 91h72l27 27v118h-99Z" fill={GRAPHITE} />
        <path d="M384 91v27h27" fill={INK} />
        <PaperLines x={328} y={141} width={64} />
        <circle cx="359" cy="201" r="20" fill={INK} stroke={EMBER} />
        <path d="M353 192v18m12-18v18m-16-13h21m-21 8h21" fill="none" stroke={EMBER} />
        <g className="example-art__object example-art__reviewer-stamp">
          <path d="M343 58v-9c0-14 33-14 33 0v9l8 8v10h-49V66Z" fill={INK} />
          <path d="M334 79h52" stroke={EMBER} />
        </g>
      </g>
      <g className="example-art__object example-art__designer">
        <Person x={586} y={96} />
        <path d="M525 178h123l-10 56H536Z" fill={INK} />
        <path d="M518 239h137M556 187h61" />
        <path d="m582 198-8 9 8 9m12-18 8 9-8 9" stroke={EMBER} fill="none" />
      </g>
      <StatusSeal stage={stage} blocked={blocked} />
    </>
  )
}

function EnvoyArt({ stage, blocked }: Omit<ArtworkProps, 'kind'>) {
  return (
    <>
      <g className="example-art__object example-art__permission">
        <path d="M61 83h108l24 24v132H61Z" fill={GRAPHITE} />
        <path d="M169 83v24h24" fill={INK} />
        <circle cx="98" cy="124" r="12" fill={INK} />
        <path d="M80 152c0-19 36-19 36 0M134 122h27m-27 12h27" fill="none" />
        <PaperLines x={79} y={169} width={94} />
        <path d="m81 216 12-8 4 10 10-10 5 8h24" fill="none" stroke={EMBER} />
      </g>
      <g transform="translate(58 0)"><g className="example-art__object example-art__agent">
        <rect x="271" y="115" width="62" height="48" rx="17" fill={INK} stroke={EMBER} />
        <path d="M302 114v-11m-25 79c0-17 50-17 50 0l5 45h-60Zm-4 15-14 14m68-14 14 14" fill={GRAPHITE} />
        <circle cx="291" cy="137" r="3" fill={CREAM} stroke="none" />
        <circle cx="313" cy="137" r="3" fill={CREAM} stroke="none" />
        <path d="M292 150h20M291 229v12m22-12v12" />
      </g></g>
      <g className="example-art__object example-art__pickup" transform="translate(22 0)">
        <path d="m401 179 14-18h63l14 18-7 58h-77Z" fill={GRAPHITE} />
        <Pastry x={445} y={179} scale={.9} />
        <path d="M403 184h86v53h-86Zm2 18h81m-81 17h81m-62-34v51m44-51v51" fill={INK} />
        <path d="M432 210h28" stroke={EMBER} />
      </g>
      <g className="example-art__object example-art__baker">
        <Person x={605} y={102} apron />
        <path d="m572 173-25 21-34-4" fill="none" />
      </g>
      <StatusSeal stage={stage} blocked={blocked} x={628} y={77} />
    </>
  )
}

function RampArt({ stage, blocked }: Omit<ArtworkProps, 'kind'>) {
  return (
    <>
      <g className="example-art__object example-art__bank">
        <path d="m47 113 71-38 72 38ZM58 121h120m-111 8v72m25-72v72m25-72v72m26-72v72m25-72v72M49 211h140v13H49Z" fill={GRAPHITE} />
        <path d="m116 147 84 5-6 84-10-5-11 4-9-5-10 4-10-5-10 4-11-6-9 4Z" fill={INK} />
        <PaperLines x={130} y={169} width={48} />
        <path d="m131 214 18 1m11 0 15 1" stroke={EMBER} />
      </g>
      <g className="example-art__object example-art__anchor">
        <path d="M310 224v-87a50 50 0 0 1 100 0v87" fill={GRAPHITE} />
        <path d="M328 222v-85a32 32 0 0 1 64 0v85" fill={INK} />
        <path d="M300 236h120" />
        <path d="M353 129h-15l7-7m-7 7 7 7m22 47h15l-7-7m7 7-7 7" fill="none" stroke={EMBER} />
        <circle cx="360" cy="155" r="11" fill={GRAPHITE} stroke={EMBER} />
        <path d="M360 166v32m-21-9c0 24 42 24 42 0m-42 0-5 9m47-9 5 9" fill="none" stroke={EMBER} />
      </g>
      <g className="example-art__object example-art__test-coins" stroke={EMBER}>
        <path d="M525 202v25c0 19 103 19 103 0v-25" fill={GRAPHITE} />
        <ellipse cx="576.5" cy="202" rx="51.5" ry="15" fill={INK} />
        <path d="M536 182v21c0 16 81 16 81 0v-21" fill={GRAPHITE} />
        <ellipse cx="576.5" cy="182" rx="40.5" ry="13" fill={INK} />
        <circle cx="577" cy="128" r="38" fill={GRAPHITE} />
        <circle cx="577" cy="128" r="29" opacity=".5" />
        <path d="M566 109v27c0 13 22 13 22 0v-27m-27 5h32m-32 30h32" fill="none" />
      </g>
      <StatusSeal stage={stage} blocked={blocked} x={634} />
    </>
  )
}

function LedgerArt({ stage, blocked }: Omit<ArtworkProps, 'kind'>) {
  return (
    <>
      <g className="example-art__object example-art__invoice">
        <path d="M67 81h123v159l-12-7-12 7-12-7-13 7-12-7-13 7-12-7-13 7-12-7-12 7Z" fill={GRAPHITE} />
        <path d="M83 99h32v27H83Z" fill={INK} stroke={EMBER} />
        <path d="M128 104h45m-45 12h28" />
        <PaperLines x={84} y={147} width={89} />
        <path d="M84 196h89m-38 17h38" stroke={EMBER} />
      </g>
      <g className="example-art__object example-art__bundle">
        <path d="M320 93h83v128h-83Z" fill={INK} />
        <path d="M305 108h83v128h-83Z" fill={GRAPHITE} />
        <path d="m294 139 13-13h30l13 13h65v98H294Z" fill={INK} />
        <path d="M294 152h121m-59-13v98" fill="none" stroke={EMBER} />
        <rect x="344" y="175" width="24" height="31" rx="3" fill={GRAPHITE} stroke={EMBER} />
        <path d="M356 184v12" stroke={EMBER} />
      </g>
      <g className="example-art__object example-art__network-receipt">
        <path d="m531 100 91-15 30 80-81 25-40-90Z" fill={GRAPHITE} />
        <path d="M538 87h86v143h-86Z" fill={INK} />
        <PaperLines x={552} y={111} width={57} />
        <path d="M558 199h46m-46 13h31" opacity=".6" />
        <path d="m555 172 27-18 29 18-29 17-27-17Z" stroke={EMBER} fill="none" />
        <g fill={GRAPHITE} stroke={EMBER}>
          <circle cx="555" cy="172" r="6" />
          <circle cx="582" cy="154" r="6" />
          <circle cx="611" cy="172" r="6" />
          <circle cx="582" cy="189" r="6" />
        </g>
      </g>
      <StatusSeal stage={stage} blocked={blocked} x={635} />
    </>
  )
}

const ROUTES: Record<DetailInstrument, string> = {
  fade: 'M130 265C212 288 276 285 360 267S509 251 590 267',
  pod: 'M130 265C220 265 270 283 360 283S502 265 590 265',
  trigger: 'M130 266C213 283 284 263 360 274S506 289 590 266',
  envoy: 'M130 270C215 270 249 285 302 277S407 258 448 267S547 286 605 267',
  ramp: 'M130 267C222 290 282 270 360 270S505 250 590 270',
  ledger: 'M130 268C214 268 275 283 360 277S507 266 590 269',
}

const SCENES = { fade: FadeArt, pod: PodArt, trigger: TriggerArt, envoy: EnvoyArt, ramp: RampArt, ledger: LedgerArt }

/** Decorative only: the parent supplies readable labels and the story's state. */
export default function ExampleArtwork({ kind, stage, blocked }: ArtworkProps) {
  const Scene = SCENES[kind]
  return (
    <svg className={`example-art example-art--${kind}`} viewBox="0 0 720 320" aria-hidden="true" role="presentation" fill="none" stroke={CREAM} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M43 250h634" stroke={GRAPHITE} />
      <Scene stage={stage} blocked={blocked} />
      <path className="example-art__route" data-example-route="" d={ROUTES[kind]} stroke={EMBER} opacity=".45" />
      <g className="example-art__token" data-example-token="" transform="translate(130 267)" opacity="0" stroke={EMBER}>
        <rect x="-11" y="-8" width="22" height="16" rx="3" fill={INK} fillOpacity=".8" />
        <path d="M-6-3v6M6-3v6m-9-3 3-3 3 3-3 3Z" fill="none" />
      </g>
    </svg>
  )
}
