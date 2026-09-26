import { Link } from 'react-router'
import OrbitalScene from './OrbitalScene'
import InstrumentMechanism from './InstrumentMechanism'
import { PRODUCT_NAV } from './productNavigation'
import '../styles/product-pages.css'

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

/** Product explanations have their own surface. The space renderer only appears at departure. */
export default function DetailWorld({ id, name, promise, steps, caveat, notes, environment }: DetailWorldProps) {
  const index = PRODUCT_NAV.findIndex(item => item.id === id)
  const product = PRODUCT_NAV[index]
  const next = PRODUCT_NAV[(index + 1) % PRODUCT_NAV.length]
  const previous = PRODUCT_NAV[(index + PRODUCT_NAV.length - 1) % PRODUCT_NAV.length]
  return (
    <article className={`product-page product-page--${id}`} data-instrument={id} aria-labelledby={`product-${id}-title`}>
      <OrbitalScene flightOnly showExhibits={false} />
      <div className="product-page__body">
        <header className="product-hero">
          <div className="product-hero__strip"><Link to="/instruments">← All instruments</Link><span>{product.category}</span><span>{environment ?? 'Stellar testnet'}</span></div>
          <div className="product-hero__composition">
            <h1 id={`product-${id}-title`} className="product-wordmark" aria-label={name}>
              <span aria-hidden="true">{product.split[0]}</span><span className="product-wordmark__outline" aria-hidden="true">{product.split[1]}<i className="product-wordmark__point" /></span>
            </h1>
            <div className="product-hero__aside">
              <p className="product-hero__promise">{promise}</p>
              <a className="product-launch" href={`/app/?tab=${id}`}>Open {name}<span aria-hidden="true">↗</span></a>
              <a className="product-hero__explore" href="#mechanism">Explore the mechanism<span aria-hidden="true">↓</span></a>
            </div>
          </div>
          <div className="product-hero__bottom"><span>{String(index + 1).padStart(2, '0')} / 06</span><span>Agyion instruments</span><span aria-hidden="true">↓</span></div>
        </header>

        <section className="product-experiment" id="mechanism" aria-label={`${name} interactive mechanism`} tabIndex={-1}>
          <InstrumentMechanism kind={id} />
        </section>

        <section className="product-rules" aria-labelledby="rules-title">
          <div className="product-rules__intro"><span className="product-eyebrow">The conditions</span><h2 id="rules-title">What makes<br />it work.</h2><p>{caveat}</p></div>
          <div className="product-rules__list">
            {steps.map((step, i) => <div className="product-rule" key={step.label}><span>{String(i + 1).padStart(2, '0')}</span><h3>{step.label}</h3><p>{step.text}</p></div>)}
            <details className="product-limits"><summary>Before you use it <span aria-hidden="true">+</span></summary><ul>{notes.map(note => <li key={note}>{note}</li>)}{id !== 'ramp' && id !== 'ledger' && <li>The current app uses public testnet records. Protected writes require a compatible V3 deployment. The separate experimental privacy pool is not live.</li>}</ul></details>
          </div>
        </section>

        <footer className="product-footer">
          <div className="product-footer__next"><span>Next instrument</span><Link to={`/${next.id}`} aria-label={`Explore ${next.name}`}>{next.name}<span aria-hidden="true">↗</span></Link></div>
          <div className="product-footer__rail"><Link to={`/${previous.id}`}>← {previous.name}</Link><Link to="/instruments">All instruments</Link><a href={`/app/?tab=${id}`}>Open {name} ↗</a></div>
          <div className="product-footer__legal"><Link to="/">agyion labs</Link><p>Test assets only. Independent project.</p></div>
        </footer>
      </div>
    </article>
  )
}
