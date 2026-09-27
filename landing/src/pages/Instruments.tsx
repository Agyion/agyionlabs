import { Link } from 'react-router'
import { PRODUCT_NAV } from '../components/productNavigation'
import OrbitalScene from '../components/OrbitalScene'
import InstrumentObject from '../components/InstrumentObject'
import { INSTRUMENT_EXAMPLES } from '../components/instrumentExamples'
import '../styles/product-pages.css'
import '../styles/instrument-surfaces.css'

export default function Instruments() {
  return <section className="product-page instrument-directory instrument-collection" aria-labelledby="directory-title">
    <OrbitalScene flightOnly showExhibits={false} />
    <div className="product-page__body">
      <header className="directory-intro collection-intro">
        <h1 id="directory-title" tabIndex={-1}>Instruments</h1>
      </header>
      <nav className="directory-list collection-objects" aria-label="Choose an instrument">{PRODUCT_NAV.map(product => {
        const example = INSTRUMENT_EXAMPLES[product.id]
        return <Link key={product.id} to={`/${product.id}`} className={`collection-object collection-object--${product.id}`} aria-label={`${product.name}: ${example.catalog}`}>
          <h2>{product.name}</h2>
          <div className="collection-object__picture"><InstrumentObject kind={product.id} /></div>
          <div className="collection-object__caption"><p>{example.catalog}</p></div>
        </Link>
      })}</nav>
      <footer className="directory-footer collection-footer"><Link to="/">agyion labs</Link><span>Stellar testnet · test assets only</span></footer>
    </div>
  </section>
}
