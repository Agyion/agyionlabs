import { Link } from 'react-router'

export default function Footer() {
  return (
    <footer className="orbital-footer" id="site-footer">
      <div className="orbital-footer__invitation"><Link to="/" className="orbital-footer__brand" aria-label="Agyion Labs home">agyion<span>labs</span></Link><a className="orbital-button" href="/app/">Launch app <span aria-hidden="true">↗</span></a></div>
      <div className="orbital-footer__disclosure"><span className="orbital-status-dot" /><p>Experimental software on Stellar testnet. Use test assets only. Review each rule and transaction before signing.</p></div>
      <div className="orbital-footer__bottom"><p>© 2026 Agyion Labs</p><nav aria-label="Footer navigation"><Link to="/instruments">Instruments</Link><Link to="/ramp">Ramp</Link><Link to="/ledger">Ledger</Link><button type="button" onClick={() => { window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); (document.getElementById('home') ?? document.getElementById('main'))?.focus({ preventScroll: true }) }}>Back to top ↑</button></nav></div>
    </footer>
  )
}
