import { useEffect, useMemo } from 'react'
import { Route, Routes, useLocation } from 'react-router'
import { config } from './config'
import { validateConfig } from './lib/validateConfig'
import { destroySmoothScroll, initNavScrollClass, initSmoothScroll, ScrollTrigger } from './lib/smoothScroll'
import { initReveals } from './lib/reveal'
import Cursor from './components/Cursor'
import Noise from './components/Noise'
import ScrollProgress from './components/ScrollProgress'
import DepthGauge from './components/DepthGauge'
import NavPill from './components/NavPill'
import Home from './pages/Home'
import Instrument from './pages/Instrument'
import Ramp from './pages/Ramp'
import Ledger from './pages/Ledger'
import NotFound from './pages/NotFound'

export default function App() {
  const errors = useMemo(() => validateConfig(config), [])
  const location = useLocation()

  useEffect(() => {
    initSmoothScroll()
    const offNavClass = initNavScrollClass()
    return () => {
      offNavClass()
      destroySmoothScroll()
    }
  }, [])

  /* scroll to top + refresh triggers on route change */
  useEffect(() => {
    window.scrollTo(0, 0)
    const t = window.setTimeout(() => ScrollTrigger.refresh(), 60)
    const offReveals = initReveals()
    return () => {
      window.clearTimeout(t)
      offReveals()
    }
  }, [location.pathname])

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
        root.setProperty(`--dz${i}-ink`, light ? '#0e1b18' : '#eef2ef')
        root.setProperty(`--dz${i}-line`, light ? 'rgba(14, 27, 24, 0.16)' : 'rgba(238, 242, 239, 0.16)')
        root.setProperty(`--dz${i}-accent`, light ? scale(t.accent, 0.58) : t.accent)
        root.setProperty(`--dz${i}-muted`, light ? 'rgba(14, 27, 24, 0.62)' : 'rgba(238, 242, 239, 0.6)')
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
      {config.depthGauge?.enabled ? <DepthGauge /> : <ScrollProgress />}
      <Cursor />
      <Noise />
      {location.pathname === '/' && (
        <span className="fixed-brand" aria-hidden="true">
          {config.menu.brandMark}
        </span>
      )}
      <NavPill />
      <main id="main">
        <Routes>
          <Route path="/" element={<Home />} />
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
