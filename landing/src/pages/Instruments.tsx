import { Link } from 'react-router'
import { PRODUCT_NAV } from '../components/productNavigation'
import OrbitalScene from '../components/OrbitalScene'
import '../styles/product-pages.css'

export default function Instruments() {
  return <section className="product-page instrument-directory" aria-labelledby="directory-title">
    <OrbitalScene flightOnly showExhibits={false} />
    <div className="product-page__body">
      <header className="directory-intro"><span className="product-eyebrow">Agyion instruments</span><h1 id="directory-title">Money, with <em>conditions.</em></h1><p>Choose what moves it.</p></header>
      <nav className="directory-list" aria-label="Choose an instrument">{PRODUCT_NAV.map((product, index) => <Link key={product.id} to={`/${product.id}`} className="directory-item" aria-label={`${product.name}: ${product.line}`}><span className="directory-item__index">{String(index + 1).padStart(2, '0')}</span><span className="directory-item__name">{product.split[0]}<i aria-hidden="true">/</i><span>{product.split[1]}</span></span><span className="directory-item__line">{product.line}</span><span className="directory-item__arrow" aria-hidden="true">↗</span></Link>)}</nav>
      <footer className="directory-footer"><Link to="/">agyion labs</Link><span>Stellar testnet · test assets only</span><a href="/app/">Launch app ↗</a></footer>
    </div>
  </section>
}
