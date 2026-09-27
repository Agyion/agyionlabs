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
        <div className="home-colophon__identity">
          <Link to="/" className="home-colophon__brand">agyion labs</Link>
          <a className="home-colophon__github" href="https://github.com/Agyion/agyionlabs" target="_blank" rel="noopener noreferrer" aria-label="Agyion source code on GitHub" title="GitHub">
            <svg viewBox="0 0 24 24" width="21" height="21" fill="currentColor" aria-hidden="true"><path d="M12 .75a11.25 11.25 0 0 0-3.56 21.92c.56.1.77-.24.77-.54v-2.1c-3.13.68-3.79-1.33-3.79-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.39-1.22.71-1.5-2.5-.28-5.13-1.25-5.13-5.56 0-1.23.44-2.23 1.16-3.02-.12-.28-.5-1.43.11-2.97 0 0 .95-.3 3.1 1.16a10.8 10.8 0 0 1 5.63 0c2.15-1.46 3.1-1.16 3.1-1.16.61 1.54.23 2.69.11 2.97.72.79 1.16 1.8 1.16 3.02 0 4.32-2.64 5.27-5.15 5.55.4.35.76 1.03.76 2.08v3.11c0 .3.2.65.78.54A11.25 11.25 0 0 0 12 .75Z" /></svg>
          </a>
        </div>
        <nav aria-label="Supporting tools"><Link to="/ramp">Ramp ↗</Link><Link to="/ledger">Ledger ↗</Link></nav>
      </footer>
    </div>
  )
}
