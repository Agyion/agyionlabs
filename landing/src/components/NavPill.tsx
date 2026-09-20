/* Morphing pill ↔ fullscreen showcase menu.
 * Open: pill grows to 100vw×100vh cream surface (~1.4s morph sequence,
 * content arrives after the surface settles). Close: reverse. Esc closes.
 * Row click: curtain covers → SPA navigate → curtain lifts. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { config } from '../config'
import { getLenis } from '../lib/smoothScroll'

const MORPH_MS = 1400
const CURTAIN_MS = 520

export default function NavPill() {
  const [open, setOpen] = useState(false)
  const [morphing, setMorphing] = useState(false)
  const shellRef = useRef<HTMLDivElement>(null)
  const burgerRef = useRef<HTMLButtonElement>(null)
  const morphTimer = useRef(0)
  const curtainTimer = useRef(0)
  const navigate = useNavigate()
  const location = useLocation()
  const { menu } = config
  /* 'dock' re-forms the chrome as a frosted capsule at
   * the bottom edge; morph/fullscreen/row mechanics stay identical */
  const form = menu.form ?? 'pill'
  /* 'ledger' re-composes the open rows as a left-aligned
   * index table (mono number cell, capitalised title, right sub column);
   * the layer-swap hover and row-anchored thumbs are untouched */
  const layout = menu.layout ?? 'stage'
  const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())

  const openMenu = useCallback(() => {
    window.clearTimeout(morphTimer.current)
    setMorphing(true)
    setOpen(true)
    document.body.classList.add('menu-locked')
    morphTimer.current = window.setTimeout(() => setMorphing(false), MORPH_MS)
  }, [])

  const closeMenu = useCallback(() => {
    window.clearTimeout(morphTimer.current)
    setMorphing(true)
    setOpen(false)
    document.body.classList.remove('menu-locked')
    morphTimer.current = window.setTimeout(() => {
      setMorphing(false)
      burgerRef.current?.focus({ preventScroll: true })
    }, 700)
  }, [])

  const toggle = () => (open ? closeMenu() : openMenu())

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) closeMenu()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, closeMenu])

  useEffect(
    () => () => {
      window.clearTimeout(morphTimer.current)
      window.clearTimeout(curtainTimer.current)
      document.body.classList.remove('menu-locked')
    },
    [],
  )

  const go = (e: React.MouseEvent, href: string) => {
    e.preventDefault()
    /* on-page anchors ('/#section') scroll to the section instead of the top */
    const hashIdx = href.indexOf('#')
    const path = hashIdx >= 0 ? href.slice(0, hashIdx) || '/' : href
    const hash = hashIdx >= 0 ? href.slice(hashIdx + 1) : ''
    if (!hash && path === location.pathname) {
      closeMenu()
      return
    }
    /* menu closes under the curtain, then the SPA route swaps */
    closeMenu()
    document.documentElement.classList.add('has-pending-page-transition')
    curtainTimer.current = window.setTimeout(() => {
      navigate(path)
      curtainTimer.current = window.setTimeout(() => {
        document.documentElement.classList.remove('has-pending-page-transition')
        const el = hash ? document.getElementById(hash) : null
        if (el) {
          const lenis = getLenis()
          if (lenis) lenis.scrollTo(el)
          else el.scrollIntoView({ behavior: 'smooth' })
        } else {
          window.scrollTo(0, 0)
        }
      }, 240)
    }, CURTAIN_MS)
  }

  return (
    <>
      <div
        ref={shellRef}
        className={`nav-shell${form === 'dock' ? ' nav-shell--dock' : ''}${layout === 'ledger' ? ' nav-shell--ledger' : ''}${open ? ' is-open' : ''}${morphing ? ' is-morphing' : ''}`}
        data-open={open || undefined}
      >
        <div className="nav-bar">
          <a className="nav-icon" href={`mailto:${menu.email}`} aria-label={menu.mailAria} data-cursor={config.copy.cursor.contact}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="1" />
              <path d="m3 7 9 6 9-6" />
            </svg>
          </a>
          <span className="nav-brand" aria-hidden="true">
            {menu.brandMark}
          </span>
          <button
            ref={burgerRef}
            type="button"
            className="nav-icon nav-burger"
            aria-expanded={open}
            aria-label={open ? menu.closeAria : menu.openAria}
            onClick={toggle}
          >
            <svg className="burger-svg" viewBox="0 0 18 24" width="18" height="24" aria-hidden="true">
              <line className="burger-l1" x1="0" y1="10" x2="18" y2="10" strokeWidth="2" stroke="currentColor" />
              <line className="burger-l2" x1="0" y1="14" x2="18" y2="14" strokeWidth="2" stroke="currentColor" />
            </svg>
          </button>
        </div>

        <div className="menu-panel">
          <nav className="menu-stage menu-surface" aria-label={config.copy.a11y.menuNav}>
            <div className="menu-rows" style={{ ['--menu-row-count' as string]: menu.rows.length }}>
              {menu.rows.map((row, i) => (
                <Link
                  key={row.id}
                  to={row.href}
                  className="menu-row"
                  aria-label={row.label}
                  data-cursor={i === 0 ? config.copy.cursor.home : config.cursor.defaultLabel}
                  onClick={(e) => go(e, row.href)}
                >
                  <span className="menu-row__index" aria-hidden="true">
                    {row.subLabel}
                  </span>
                  {layout === 'ledger' && (
                    <span className="menu-row__num" aria-hidden="true">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                  )}
                  <span className="menu-row__thumb is-left" aria-hidden="true">
                    <img src={row.thumbs[0].src} alt="" loading="lazy" decoding="async" />
                  </span>
                  <span className="menu-row__thumb is-right" aria-hidden="true">
                    <img src={row.thumbs[1].src} alt="" loading="lazy" decoding="async" />
                  </span>
                  <span className="menu-row__title">
                    <span className="menu-row__track">
                      <span className="menu-row__layer is-primary">{layout === 'ledger' ? titleCase(row.label) : row.label}</span>
                      <span className="menu-row__layer is-accent" aria-hidden="true">
                        {layout === 'ledger' ? titleCase(row.label) : row.label}
                      </span>
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </nav>
        </div>
      </div>
      <div className="pt-shell" aria-hidden="true" />
    </>
  )
}
