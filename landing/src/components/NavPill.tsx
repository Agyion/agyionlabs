import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { Link, useLocation } from 'react-router'

const sections = [
  { id: 'home', label: 'Home' },
  { id: 'instruments', label: 'Instruments' },
  { id: 'how-it-works', label: 'How it works' },
] as const

export default function NavPill() {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<string>('home')
  const buttonRef = useRef<HTMLButtonElement>(null)
  const headerRef = useRef<HTMLElement>(null)
  const location = useLocation()

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const threshold = (headerRef.current?.getBoundingClientRect().bottom ?? 90) + Math.min(window.innerHeight * .18, 150)
      let current = 'home'
      const immersive = location.pathname === '/' && Boolean(document.querySelector('.orbital-home--immersive'))
      if (immersive) {
        current = sections.some(section => `#${section.id}` === location.hash) ? location.hash.slice(1) : 'home'
      } else {
        for (const section of sections) {
          if ((document.getElementById(section.id)?.getBoundingClientRect().top ?? Infinity) <= threshold) current = section.id
        }
        if (window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2 && document.getElementById('how-it-works')) current = 'how-it-works'
      }
      setActive(current)
      headerRef.current?.classList.toggle('is-scrolled', window.scrollY > 40)
    }
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update) }
    schedule()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [location.pathname, location.hash])

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    document.addEventListener('pointerdown', closeOutside)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.removeEventListener('pointerdown', closeOutside)
    }
  }, [open])

  const closeMenu = () => setOpen(false)
  const visitSection = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    closeMenu()
    if (id === 'instruments' && location.pathname === '/' && location.hash === '#instruments') {
      event.preventDefault()
      window.dispatchEvent(new CustomEvent('agyion:exhibit-focus'))
    }
  }
  const currentSection = (id: string) => location.pathname === '/' && active === id ? 'location' as const : undefined

  return (
    <header className="orbital-nav" data-surface={location.pathname === '/' ? 'home' : 'detail'} ref={headerRef}>
      <Link to="/" className="orbital-brand" aria-label="Agyion Labs home" onClick={closeMenu}>
        <svg viewBox="0 0 32 32" width="29" height="29" aria-hidden="true"><circle cx="16" cy="16" r="10" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M3 22L29 10M9 29L23 3" stroke="currentColor" strokeWidth="1.4" /><circle cx="16" cy="16" r="3" fill="currentColor" /></svg>
        <span>agyion<span className="orbital-brand__suffix">labs</span></span>
      </Link>
      <nav className="orbital-nav__desktop" aria-label="Main navigation">
        {sections.map(section => <Link key={section.id} to={`/#${section.id}`} aria-current={currentSection(section.id)} aria-haspopup={section.id === 'how-it-works' ? 'dialog' : undefined} aria-controls={section.id === 'how-it-works' ? 'how-it-works-dialog' : undefined} onClick={event => visitSection(event, section.id)}>{section.label}</Link>)}
      </nav>
      <div className="orbital-nav__actions"><a className="orbital-nav__launch" href="/app/">Launch app <span aria-hidden="true">↗</span></a>
        <button className="orbital-nav__toggle" ref={buttonRef} type="button" aria-expanded={open} aria-controls="orbital-mobile-menu" aria-label={open ? 'Close navigation menu' : 'Open navigation menu'} onClick={() => setOpen(value => !value)}>Menu <span aria-hidden="true">{open ? '−' : '+'}</span></button>
      </div>
      <nav className="orbital-nav__mobile" id="orbital-mobile-menu" aria-label="Mobile navigation" hidden={!open}>
        {sections.map(section => <Link key={section.id} to={`/#${section.id}`} aria-current={currentSection(section.id)} aria-haspopup={section.id === 'how-it-works' ? 'dialog' : undefined} aria-controls={section.id === 'how-it-works' ? 'how-it-works-dialog' : undefined} onClick={event => visitSection(event, section.id)}>{section.label}<span aria-hidden="true">↘</span></Link>)}
        <Link to="/ramp" aria-current={location.pathname === '/ramp' ? 'page' : undefined} onClick={closeMenu}>Ramp <span aria-hidden="true">↗</span></Link>
        <Link to="/ledger" aria-current={location.pathname === '/ledger' ? 'page' : undefined} onClick={closeMenu}>Ledger <span aria-hidden="true">↗</span></Link>
      </nav>
    </header>
  )
}
