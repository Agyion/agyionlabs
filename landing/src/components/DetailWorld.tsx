import { Link, useLocation } from 'react-router'
import OrbitalScene from './OrbitalScene'
import FlightPreference from './FlightPreference'
import InstrumentExample from './InstrumentExample'
import { PRODUCT_NAV } from './productNavigation'
import '../styles/product-pages.css'
import '../styles/product-route-transition.css'
import '../styles/instrument-surfaces.css'

export type CoreInstrument = 'fade' | 'pod' | 'trigger' | 'envoy'
export type DetailInstrument = CoreInstrument | 'ramp' | 'ledger'
export type ConditionStep = { label: string; text: string }

type DetailWorldProps = {
  id: DetailInstrument
  name: string
  promise: string
  steps: readonly ConditionStep[]
  caveat: string
  notes: readonly string[]
  environment?: string
}

/** One working example explains the instrument. Space appears only at departure. */
export default function DetailWorld({ id, name, caveat, notes, environment }: DetailWorldProps) {
  const location = useLocation()
  const index = PRODUCT_NAV.findIndex(item => item.id === id)
  const next = PRODUCT_NAV[(index + 1) % PRODUCT_NAV.length]
  const previous = PRODUCT_NAV[(index + PRODUCT_NAV.length - 1) % PRODUCT_NAV.length]
  return (
    <article className={`product-page product-page--${id} instrument-edition`} data-instrument={id} data-product-entry={location.state?.productEntry === true ? 'shared' : undefined} aria-labelledby={`product-${id}-title`}>
      <OrbitalScene flightOnly showExhibits={false} />
      <div className="product-page__body">
        <div className="edition-lead">
          <header className="product-hero edition-masthead">
            <div className="product-hero__strip"><Link to="/instruments">← All instruments</Link><span>{environment ?? 'Stellar testnet · Test assets only'}</span></div>
            <h1 id={`product-${id}-title`} className="product-wordmark" data-product-transition-title={id} aria-label={name}>
              {name}
            </h1>
            <div className="edition-launch">
              <a className="product-launch" href={`/app/?tab=${id}`}>Open {name}<span aria-hidden="true">↗</span></a>
              <FlightPreference />
            </div>
          </header>
          <section className="product-experiment edition-workbench" id="mechanism" data-product-transition-stage={id} aria-label={`${name} interactive mechanism`} tabIndex={-1}>
            <InstrumentExample key={id} kind={id} caveat={caveat} />
          </section>
        </div>
        <section className="product-rules" aria-label={`${name} protocol details`}>
          <details className="product-limits"><summary>Protocol details <span aria-hidden="true">+</span></summary>
            <ul>{notes.map(note => <li key={note}>{note}</li>)}{id !== 'ramp' && id !== 'ledger' && <li>Testnet only. Fade and existing public positions stay public. Private Pod, Trigger and Envoy use an experimental pool with development setup keys and trustees held by one operator. Public deposits, withdrawals and fee payers can reveal relationships.</li>}</ul>
          </details>
        </section>
        <footer className="product-footer">
          <nav className="product-footer__rail" aria-label="More instruments"><Link to={`/${previous.id}`}>← {previous.name}</Link><Link to="/instruments">All instruments</Link><Link to={`/${next.id}`} aria-label={`Explore ${next.name}`}>{next.name} →</Link></nav>
          <div className="product-footer__legal"><Link to="/">agyion labs</Link><p>Test assets only. Independent project.</p></div>
        </footer>
      </div>
    </article>
  )
}
