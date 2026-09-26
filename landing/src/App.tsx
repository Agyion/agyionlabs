import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Route, Routes, useLocation, useNavigationType } from 'react-router'
import { config } from './config'
import { validateConfig } from './lib/validateConfig'
import { initReveals } from './lib/reveal'
import { routeScrollKey } from './lib/routeScroll'
import NavPill from './components/NavPill'
import Home from './pages/Home'
import Instrument from './pages/Instrument'
import Instruments from './pages/Instruments'
import Ramp from './pages/Ramp'
import Ledger from './pages/Ledger'
import NotFound from './pages/NotFound'
import { cancelProductTransitionForRoute, finishProductRouteCommit } from './components/productRouteTransition'

export default function App() {
  const errors = useMemo(() => validateConfig(config), [])
  const location = useLocation()
  const navigationType = useNavigationType()
  const previousLocationKey = useRef(location.key)
  const previousHash = useRef(location.hash)
  const scrollPositions = useRef(new Map<string, { x: number; y: number; product?: string }>())

  useLayoutEffect(() => {
    finishProductRouteCommit(location.pathname)
  }, [location.pathname, location.key])

  useLayoutEffect(() => {
    cancelProductTransitionForRoute(location.pathname)
    const navigated = previousLocationKey.current !== location.key
    const leavingExplanation = previousHash.current === '#how-it-works' && location.hash !== '#how-it-works'
    previousLocationKey.current = location.key
    previousHash.current = location.hash
    const offReveals = initReveals()
    const positions = scrollPositions.current
    const positionKey = routeScrollKey({ key: location.key, pathname: location.pathname, search: location.search, hash: location.hash })
    const restored = navigationType === 'POP' && window.history.state !== null ? positions.get(positionKey) : undefined
    const rememberPosition = () => {
      const product = document.activeElement instanceof Element ? document.activeElement.closest<HTMLElement>('[data-product-route-link]')?.dataset.productRouteLink : undefined
      positions.set(positionKey, { x: window.scrollX, y: window.scrollY, product: product ?? positions.get(positionKey)?.product })
      if (positions.size > 40) positions.delete(positions.keys().next().value!)
    }
    window.addEventListener('scroll', rememberPosition, { passive: true })
    document.addEventListener('focusin', rememberPosition)
    const frame = window.requestAnimationFrame(() => {
      const anchor = location.hash ? document.getElementById(location.hash.slice(1)) : null
      // The dialog owns focus restoration; opening/closing it must not move
      // the real gallery scroll position under the modal.
      if (location.pathname === '/' && (location.hash === '#how-it-works' || leavingExplanation) && document.querySelector('.orbital-home--immersive')) {
        rememberPosition()
        return
      }
      if (restored) {
        window.scrollTo({ top: restored.y, left: restored.x, behavior: 'instant' })
        const product = restored.product && /^(fade|pod|trigger|envoy)$/.test(restored.product) ? document.querySelector<HTMLElement>(`[data-product-route-link="${restored.product}"]`) : null
        ;(product ?? anchor ?? document.getElementById('main'))?.focus({ preventScroll: true })
      } else if (anchor) {
        const immersive = Boolean(anchor.closest('.orbital-home--immersive:not(.orbital-home--gallery)'))
        anchor.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: immersive ? 'nearest' : 'start' })
        anchor.focus({ preventScroll: true })
      } else {
        window.scrollTo({ top: 0, behavior: 'instant' })
        if (navigated) document.getElementById('main')?.focus({ preventScroll: true })
      }
      rememberPosition()
    })
    return () => {
      // The route's DOM has already changed at cleanup. Keep the position
      // observed while it was mounted, before a shorter page can clamp scroll.
      // Layout cleanup also detaches this route's listeners before the new
      // destination's acknowledged commit can scroll or focus its contents.
      window.removeEventListener('scroll', rememberPosition)
      document.removeEventListener('focusin', rememberPosition)
      window.cancelAnimationFrame(frame)
      offReveals()
    }
  }, [location.pathname, location.search, location.hash, location.key, navigationType])

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
      <main id="main" className="orbital-route" data-product-entry={location.state?.productEntry === true ? 'shared' : undefined} key={location.pathname} tabIndex={-1}>
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
