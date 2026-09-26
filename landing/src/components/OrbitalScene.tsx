import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router'
import type { OrbitalSceneHandle } from '../../../shared/space-scene'
import { clearFlightHandoff, LAUNCH_DURATION_MS } from '../../../shared/flight-handoff'
import { warmAppAssets } from '../lib/appAssetWarmup'

const motionQuery = '(prefers-reduced-motion: reduce)'
const readReducedMotion = () => window.matchMedia(motionQuery).matches
const subscribeReducedMotion = (notify: () => void) => {
  const query = window.matchMedia(motionQuery)
  query.addEventListener('change', notify)
  return () => query.removeEventListener('change', notify)
}

/** Static original composition remains visible until the optional renderer is ready. */
function OrbitalFallback() {
  const id = useId()
  return (
    <svg className="orbital-fallback" viewBox="0 0 1400 950" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-halo`}>
          <stop offset="0.36" stopColor="#07090d" stopOpacity="0" />
          <stop offset="0.48" stopColor="#e8b77b" stopOpacity="0.19" />
          <stop offset="0.64" stopColor="#c39465" stopOpacity="0.05" />
          <stop offset="1" stopColor="#07090d" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}-blur`}><feGaussianBlur stdDeviation="4" /></filter>
      </defs>
      <rect width="1400" height="950" fill="#07090d" />
      <g fill="#a7adb8" opacity="0.55">
        {Array.from({ length: 65 }, (_, i) => <circle key={i} cx={(i * 191 + 83) % 1400} cy={(i * 127 + 47) % 950} r={i % 7 === 0 ? 1.2 : 0.65} />)}
      </g>
      <circle cx="1010" cy="370" r="360" fill={`url(#${id}-halo)`} />
      <g transform="rotate(-18 1010 370)" fill="none" stroke="#e8b77b">
        <ellipse cx="1010" cy="370" rx="335" ry="69" opacity="0.25" strokeWidth="17" filter={`url(#${id}-blur)`} />
        <ellipse cx="1010" cy="370" rx="335" ry="69" opacity="0.7" strokeWidth="1" />
        <ellipse cx="1010" cy="370" rx="299" ry="56" opacity="0.4" strokeWidth="2" />
        <circle cx="1010" cy="370" r="121" fill="#07090d" strokeWidth="2" opacity="0.96" />
        <path d="M680 370 Q1010 510 1340 370" opacity="0.55" strokeWidth="3" />
      </g>
      <g transform="translate(895 650) rotate(-26) scale(.88)" stroke="#a7adb8" fill="#11151b">
        <ellipse rx="104" ry="75" strokeWidth="9" />
        <ellipse rx="79" ry="56" strokeWidth="1" opacity=".55" />
        {Array.from({ length: 12 }, (_, i) => <rect key={i} x="-12" y="-88" width="24" height="28" rx="2" transform={`rotate(${i * 30})`} />)}
        <path d="M-84 0H84 M0-58V58" strokeWidth="4" />
        <rect x="-18" y="-13" width="36" height="26" rx="3" />
        <path d="M-8-13V13 M8-13V13" opacity=".5" />
        <circle cx="-90" cy="-14" r="3" fill="#e8b77b" stroke="none" />
      </g>
    </svg>
  )
}

type ExhibitId = 'fade' | 'pod' | 'trigger' | 'envoy'

export default function OrbitalScene({ initialExhibit, initialExhibitView = false, exhibitStage, exhibitLinks = false, showExhibits = true, flightOnly = false }: {
  initialExhibit?: ExhibitId
  initialExhibitView?: boolean
  exhibitStage?: 0 | 1 | 2
  exhibitLinks?: boolean
  showExhibits?: boolean
  /** Product pages keep the world hidden and paused until a launch. */
  flightOnly?: boolean
} = {}) {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<OrbitalSceneHandle | null>(null)
  const [readyForMotion, setReadyForMotion] = useState<boolean | null>(null)
  const navigate = useNavigate()
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, readReducedMotion, () => true)
  const ready = readyForMotion === reducedMotion
  const inViewRef = useRef(true)
  const selectedExhibit = useRef<ExhibitId | null>(initialExhibit ?? null)
  const exhibitView = useRef(initialExhibitView)
  const stageRef = useRef(exhibitStage)
  const launchDestination = useRef<string | null>(null)


  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const standaloneHome = Boolean(mount.closest('.orbital-home--gateway'))
    // A motion preference change can replace the renderer during departure.
    // Keep the user's navigation intent while honoring the new preference.
    if (launchDestination.current) {
      window.location.assign(launchDestination.current)
      return
    }
    let cancelled = false
    let handle: OrbitalSceneHandle | null = null
    let rendererReady = false
    let rendererFailed = false
    let sceneRequested = false
    let launching = false
    let flightStarted = false
    let navigationCommitted = false
    let launchGeneration = 0
    let scrollFrame = 0
    let launchTimeout = 0
    let prefetch: HTMLLinkElement | null = null
    const onExhibit = (event: Event) => {
      if (launching) return
      const id = (event as CustomEvent<{ id?: unknown }>).detail?.id
      if (id !== null && (typeof id !== 'string' || !['fade', 'pod', 'trigger', 'envoy'].includes(id))) return
      selectedExhibit.current = id as typeof selectedExhibit.current
      handle?.setExhibit(selectedExhibit.current)
    }
    const onExhibitView = (event: Event) => {
      if (launching) return
      const active = (event as CustomEvent<{ active?: unknown }>).detail?.active
      if (typeof active !== 'boolean') return
      exhibitView.current = active
      handle?.setExhibitView(active)
    }
    const setDeparting = (departing: boolean) => {
      document.documentElement.classList.toggle('is-launching', departing)
      document.querySelectorAll<HTMLElement>('.orbital-home--immersive, .detail-world, .product-page__body, .orbital-nav').forEach(element => { element.inert = departing })
    }
    // A hidden flight-only world still draws its initial frame to compile and
    // report readiness. Pausing before that frame would deadlock early launches.
    const updatePause = () => handle?.setPaused((!launching && (flightOnly ? rendererReady : !inViewRef.current)) || document.hidden)
    const updateProgress = () => {
      scrollFrame = 0
      const hero = mount.closest('section')
      if (hero && !launching && !flightOnly) {
        // Scrolling to the footer does not advance the camera. The standalone
        // hero keeps its original flight starting point intact.
        handle?.setProgress(standaloneHome ? 0 : Math.min(1, Math.max(0, -hero.getBoundingClientRect().top / hero.offsetHeight)))
      }
    }
    const onScroll = () => { if (!standaloneHome && !scrollFrame) scrollFrame = window.requestAnimationFrame(updateProgress) }
    const prefetchApp = () => {
      warmAppAssets()
      if (prefetch) return
      prefetch = document.createElement('link')
      prefetch.rel = 'prefetch'
      prefetch.as = 'document'
      prefetch.href = '/app/'
      document.head.append(prefetch)
    }
    const appLink = (event: Event) => {
      const target = event.target
      const anchor = target instanceof Element ? target.closest<HTMLAnchorElement>('a[href]') : null
      if (!anchor) return null
      const destination = new URL(anchor.href, window.location.href)
      return destination.origin === window.location.origin && /^\/app\/?$/.test(destination.pathname) ? anchor : null
    }
    const onIntent = (event: Event) => {
      if (!appLink(event)) return
      prefetchApp()
      if (flightOnly && !reducedMotion) prepareScene()
    }
    const completeNavigation = () => {
      if (cancelled || navigationCommitted || !launching || !launchDestination.current) return
      navigationCommitted = true
      window.clearTimeout(launchTimeout)
      window.location.assign(launchDestination.current)
    }
    const startFlight = () => {
      if (!launching || flightStarted || !rendererReady || !handle) return
      flightStarted = true
      // The departure class has already lifted this same canvas from the hero
      // into the viewport. Refresh its measured size and camera before launching,
      // without waiting for a possibly throttled ResizeObserver/animation frame.
      try {
        handle.setPaused(true)
        if (standaloneHome) handle.setMode('landing')
        handle.refreshLayout()
      } catch {
        rendererFailed = true
        setReadyForMotion(null)
        completeNavigation()
        return
      }
      if (navigationCommitted || rendererFailed) return
      window.clearTimeout(launchTimeout)
      updatePause()
      const generation = launchGeneration
      const maxDuration = new Promise<void>(resolve => { launchTimeout = window.setTimeout(resolve, LAUNCH_DURATION_MS + 650) })
      const activeScene = handle
      void Promise.race([Promise.resolve().then(() => {
        if (!cancelled && launching && generation === launchGeneration) return activeScene.launch()
      }), maxDuration]).catch(() => {}).then(() => {
        if (generation === launchGeneration) completeNavigation()
      })
    }
    const onNavigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target
      const anchor = target instanceof Element ? target.closest<HTMLAnchorElement>('a[href]') : null
      if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return
      const destination = new URL(anchor.href, window.location.href)
      if (destination.origin !== window.location.origin) return
      if (appLink(event) && !launching) {
        try { clearFlightHandoff(sessionStorage) } catch { /* Private storage does not block navigation. */ }
      }
      if (!appLink(event) || reducedMotion || rendererFailed) return
      event.preventDefault()
      if (launching) return
      launching = true
      launchGeneration += 1
      launchDestination.current = destination.href
      prefetchApp()
      setDeparting(true)
      window.scrollTo({ top: 0, behavior: 'instant' })
      // An early click waits for the existing scene, including an explicit tab.
      // A failed or stalled renderer still leaves the chosen workspace reachable.
      launchTimeout = window.setTimeout(completeNavigation, 3000)
      prepareScene()
      startFlight()
    }
    const resetDeparture = () => {
      // setMode resolves the renderer's old launch promise synchronously. Retire
      // that intent first, including callbacks from a renderer error during reset.
      launchGeneration += 1
      window.clearTimeout(launchTimeout)
      launching = false
      flightStarted = false
      navigationCommitted = false
      launchDestination.current = null
      try {
        handle?.setPaused(true)
        handle?.setMode('landing')
      } catch {
        rendererFailed = true
        setReadyForMotion(null)
      }
      // Resetting a live renderer completes its old frame bridge. A cancelled
      // departure must not leave that synthetic completion for the next page.
      try { clearFlightHandoff(sessionStorage) } catch { /* Storage is optional. */ }
      setDeparting(false)
      try { handle?.refreshLayout() } catch {
        rendererFailed = true
        setReadyForMotion(null)
      }
      updatePause()
    }
    const onRestore = (event: PageTransitionEvent) => {
      if (event.persisted) resetDeparture()
    }
    const onHistoryNavigation = () => {
      // Same-path history changes keep this component mounted. Back/Forward is
      // newer navigation intent, even when only the homepage hash changes.
      if (launching) resetDeparture()
    }
    const observer = new IntersectionObserver(([entry]) => {
      inViewRef.current = entry.isIntersecting
      updatePause()
    }, { rootMargin: standaloneHome ? '0px' : '80px', threshold: 0 })
    observer.observe(mount)
    document.addEventListener('visibilitychange', updatePause)
    document.addEventListener('click', onNavigate, true)
    document.addEventListener('pointerover', onIntent, { passive: true })
    document.addEventListener('focusin', onIntent)
    window.addEventListener('agyion:exhibit', onExhibit)
    window.addEventListener('agyion:exhibit-view', onExhibitView)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pageshow', onRestore)
    window.addEventListener('popstate', onHistoryNavigation)

    function prepareScene() {
      if (!mount || sceneRequested || cancelled) return
      sceneRequested = true
      void import('../../../shared/space-scene').then(({ createOrbitalScene }) => {
        if (cancelled) return
        handle = createOrbitalScene(mount, {
          mode: 'landing',
          reducedMotion,
          interactive: !flightOnly,
          showExhibits,
          onExhibitSelect: id => {
            if (exhibitLinks) {
              if (selectedExhibit.current !== id) navigate(`/${id}`)
            } else window.dispatchEvent(new CustomEvent('agyion:exhibit-select', { detail: { id } }))
          },
          onSelect: id => {
            if (['fade', 'pod', 'trigger', 'envoy', 'ramp', 'ledger'].includes(id)) navigate(`/${id}`)
          },
          onReady: () => { if (!cancelled) { rendererReady = true; rendererFailed = false; setReadyForMotion(reducedMotion); startFlight(); updatePause() } },
          onError: () => { if (!cancelled) { rendererReady = false; rendererFailed = true; setReadyForMotion(null); completeNavigation() } },
        })
        if (cancelled) { handle.dispose(); return }
        sceneRef.current = handle
        handle.setExhibit(selectedExhibit.current)
        handle.setExhibitView(exhibitView.current)
        handle.setExhibitStage(stageRef.current ?? null)
        updatePause()
        updateProgress()
        startFlight()
      }).catch(() => {
        if (!cancelled) { rendererReady = false; rendererFailed = true; setReadyForMotion(null); completeNavigation() }
      })
    }
    if (!flightOnly) prepareScene()

    return () => {
      cancelled = true
      // Lazy product scenes may stay unmounted across preference changes. A
      // previous renderer's ready flag must not hide the next launch fallback.
      setReadyForMotion(null)
      observer.disconnect()
      document.removeEventListener('visibilitychange', updatePause)
      document.removeEventListener('click', onNavigate, true)
      document.removeEventListener('pointerover', onIntent)
      document.removeEventListener('focusin', onIntent)
      window.removeEventListener('agyion:exhibit', onExhibit)
      window.removeEventListener('agyion:exhibit-view', onExhibitView)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pageshow', onRestore)
      window.removeEventListener('popstate', onHistoryNavigation)
      window.cancelAnimationFrame(scrollFrame)
      window.clearTimeout(launchTimeout)
      setDeparting(false)
      prefetch?.remove()
      handle?.dispose()
      sceneRef.current = null
    }
  }, [reducedMotion, navigate, exhibitLinks, showExhibits, flightOnly])

  useEffect(() => {
    stageRef.current = exhibitStage
    sceneRef.current?.setExhibitStage(exhibitStage ?? null)
  }, [exhibitStage])

  return (
    <div className={`orbital-scene${ready ? ' is-ready' : ''}`}>
      <OrbitalFallback />
      <div className="orbital-scene__canvas" ref={mountRef} />
      <div className="orbital-scene__scrim" aria-hidden="true" />
    </div>
  )
}
