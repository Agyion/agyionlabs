import { useRef } from 'react'
import type { HoleProjection } from '../../../shared/space-scene'
import WordmarkParticles from '../components/WordmarkParticles'
import { Link, Navigate, useLocation } from 'react-router'
import OrbitalScene from '../components/OrbitalScene'
import FlightPreference from '../components/FlightPreference'
import '../styles/home-gateway.css'

export default function Home() {
  const location = useLocation()
  const holeProjection = useRef<HoleProjection | null>(null)
  // Previously shared gallery links resolve to the one canonical catalog.
  // Replace this history entry so Back never loops through an obsolete view.
  if (location.hash === '#instruments' || location.hash === '#how-it-works') return <Navigate to={{ pathname: '/instruments', search: location.search }} replace />

  return (
    <div className="orbital-home orbital-home--immersive orbital-home--gateway">
      <section className="orbital-hero immersive-world" id="home" tabIndex={-1} aria-labelledby="hero-title">
        <OrbitalScene showExhibits={false} holeProjection={holeProjection} />
        <WordmarkParticles projection={holeProjection} />
        <div className="orbital-hero__content immersive-intro">
          <h1 id="hero-title" className="immersive-wordmark"><span>agyion</span><span>labs</span></h1>
          <p className="immersive-intro__copy">Conditional money.<br />Built on Stellar.</p>
          <a className="orbital-button immersive-launch" href="/app/">Launch app <span aria-hidden="true">↗</span></a>
          <FlightPreference />
        </div>
        <div className="orbital-hero__foot home-horizon">
          <Link to="/instruments" className="home-horizon__explore"><span>Explore instruments</span><i aria-hidden="true">↗</i></Link>
          <span className="home-horizon__network">Stellar testnet · Test assets only</span>
        </div>
      </section>
      <footer className="home-colophon">
        <Link to="/" className="home-colophon__brand">agyion labs</Link>
        <nav aria-label="Supporting tools"><Link to="/ramp">Ramp ↗</Link><Link to="/ledger">Ledger ↗</Link></nav>
      </footer>
    </div>
  )
}
