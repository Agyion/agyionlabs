import { useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import OrbitalScene from '../components/OrbitalScene'
import HowItWorksDialog from '../components/HowItWorksDialog'
import HomeInstrumentGallery from '../components/HomeInstrumentGallery'
import '../styles/home-gallery.css'

export default function Home() {
  const location = useLocation()
  const navigate = useNavigate()
  const explanationOpen = location.hash === '#how-it-works'
  const previousHash = useRef(explanationOpen ? '#home' : location.hash || '#home')
  useEffect(() => {
    if (!explanationOpen) previousHash.current = location.hash || '#home'
  }, [explanationOpen, location.hash])

  return (
    <div className="orbital-home orbital-home--immersive orbital-home--gallery">
      <section className="orbital-hero immersive-world" id="home" tabIndex={-1} aria-labelledby="hero-title">
        <OrbitalScene showExhibits={false} />
        <div className="orbital-hero__content immersive-intro">
          <h1 id="hero-title" className="immersive-wordmark"><span>agyion</span><span>labs</span></h1>
          <p className="immersive-intro__copy">Conditional money.<br />Built on Stellar.</p>
          <a className="orbital-button immersive-launch" href="/app/">Launch app <span aria-hidden="true">↗</span></a>
        </div>
        <div className="orbital-hero__foot home-horizon">
          <Link to="/#instruments" className="home-horizon__explore"><span>Explore the instruments</span><i aria-hidden="true">↓</i></Link>
          <span className="home-horizon__network">Stellar testnet · Test assets only</span>
        </div>
      </section>
      <HomeInstrumentGallery />
      <footer className="home-colophon">
        <Link to="/" className="home-colophon__brand">agyion labs</Link>
        <nav aria-label="Supporting tools"><Link to="/ramp">Ramp ↗</Link><Link to="/ledger">Ledger ↗</Link><Link to="/instruments">All instruments ↗</Link></nav>
        <p>Stellar testnet · Test assets only</p>
      </footer>
      <HowItWorksDialog open={explanationOpen} onDismiss={() => navigate({ pathname: '/', hash: previousHash.current }, { replace: true })} />
    </div>
  )
}
