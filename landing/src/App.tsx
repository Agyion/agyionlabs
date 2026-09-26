import { useEffect, useMemo, useRef } from 'react'
import { Route, Routes, useLocation } from 'react-router'
import { config } from './config'
import { validateConfig } from './lib/validateConfig'
import { initReveals } from './lib/reveal'
import NavPill from './components/NavPill'
import Home from './pages/Home'
import Instrument from './pages/Instrument'
import Instruments from './pages/Instruments'
import Ramp from './pages/Ramp'
import Ledger from './pages/Ledger'
import NotFound from './pages/NotFound'

export default function App() {
  const errors = useMemo(() => validateConfig(config), [])
  const location = useLocation()
  const previousLocationKey = useRef(location.key)
  const previousHash = useRef(location.hash)

  useEffect(() => {
    const navigated = previousLocationKey.current !== location.key
    const leavingExplanation = previousHash.current === '#how-it-works' && location.hash !== '#how-it-works'
    previousLocationKey.current = location.key
    previousHash.current = location.hash
    const offReveals = initReveals()
    const frame = window.requestAnimationFrame(() => {
      const anchor = location.pathname === '/' && location.hash === '#instruments'
        ? document.getElementById('instrument-stage') ?? document.getElementById('instruments')
        : location.hash ? document.getElementById(location.hash.slice(1)) : null
      // The immersive homepage owns its dialog focus and keeps one spatial view.
      if (location.pathname === '/' && (location.hash === '#how-it-works' || leavingExplanation) && document.querySelector('.orbital-home--immersive')) return
      if (anchor) {
        const immersive = Boolean(anchor.closest('.orbital-home--immersive'))
        anchor.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: immersive ? 'nearest' : 'start' })
        anchor.focus({ preventScroll: true })
      } else {
        window.scrollTo({ top: 0, behavior: 'instant' })
        if (navigated) document.getElementById('main')?.focus({ preventScroll: true })
      }
    })
    return () => {
      window.cancelAnimationFrame(frame)
      offReveals()
    }
  }, [location.pathname, location.hash, location.key])

  /* theme tokens from config */
  useEffect(() => {
    const t = config.theme
    const root = document.documentElement.style
    root.setProperty('--canvas', t.canvas)
    root.setProperty('--surface', t.surface)
    root.setProperty('--ink', t.ink)
    root.setProperty('--menu-bg', t.menuBg)
    root.setProperty('--menu-ink', t.menuInk)
    root.setProperty('--menu-line', t.menuLine)
    root.setProperty('--accent', t.accent)
    root.setProperty('--glow', t.glow)
    root.setProperty('--muted', t.muted)
    root.setProperty('--faint', t.faint)
    /* frosted chrome (dock form): surface at 78% — derived here so the
     * computed background stays a plain rgba() for any surface hex */
    const h = t.surface.replace('#', '')
    const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
    root.setProperty('--dock-bg', `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, 0.78)`)
    /* depth-zone program: derive a full palette per
     * zone band from five configured backgrounds; luminance picks ink/line/
     * accent/muted so zones stay legible from surface foam down to abyss */
    if (t.depthZones) {
      const parse = (hex: string) => {
        const hh = hex.replace('#', '')
        const n = parseInt(hh.length === 3 ? hh.split('').map((c) => c + c).join('') : hh.slice(0, 6), 16)
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const
      }
      const lumOf = (hex: string) => {
        const [r, g, b] = parse(hex)
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
      }
      const scale = (hex: string, k: number) => {
        const [r, g, b] = parse(hex)
        return `rgb(${Math.round(r * k)}, ${Math.round(g * k)}, ${Math.round(b * k)})`
      }
      const bands = [t.depthZones.surface, t.depthZones.drift, t.depthZones.twilight, t.depthZones.deep, t.depthZones.abyss]
      bands.forEach((bg, i) => {
        const light = lumOf(bg) > 0.55
        root.setProperty(`--dz${i}-bg`, bg)
        root.setProperty(`--dz${i}-ink`, light ? '#11151b' : '#f2eee5')
        root.setProperty(`--dz${i}-line`, light ? 'rgba(17, 21, 27, 0.16)' : 'rgba(242, 238, 229, 0.16)')
        root.setProperty(`--dz${i}-accent`, light ? scale(t.accent, 0.58) : t.accent)
        root.setProperty(`--dz${i}-muted`, light ? 'rgba(17, 21, 27, 0.62)' : 'rgba(242, 238, 229, 0.7)')
      })
    }
    document.title = config.siteTitle
    document.documentElement.lang = config.locale
  }, [])

  if (errors.length) {
    return (
      <div className="config-error" role="alert">
        {`Invalid site config (${errors.length}):\n` + errors.map((e) => ` - ${e}`).join('\n')}
      </div>
    )
  }

  return (
    <>
      <a className="skip-link" href="#main">
        {config.copy.ui.skipLink}
      </a>
      <NavPill />
      <main id="main" className="orbital-route" key={location.pathname} tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/instruments" element={<Instruments />} />
          <Route path="/fade" element={<Instrument slug="fade" />} />
          <Route path="/pod" element={<Instrument slug="pod" />} />
          <Route path="/trigger" element={<Instrument slug="trigger" />} />
          <Route path="/envoy" element={<Instrument slug="envoy" />} />
          <Route path="/ramp" element={<Ramp />} />
          <Route path="/ledger" element={<Ledger />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </>
  )
}
