import type { CoreInstrument } from './DetailWorld'

type ClickIntent = Pick<MouseEvent, 'button' | 'defaultPrevented' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>
export function isPlainProductClick(event: ClickIntent, target: string) {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && (!target || target === '_self')
}

let generation = 0
let pending: ViewTransition | undefined
let destination: string | undefined
let cancelPending: (() => void) | undefined
let awaitingCommit: { pathname: string; resolve: (committed: boolean) => void } | undefined

/** BrowserRouter schedules its own React transition; navigate is not a DOM commit. */
export function commitProductRoute(id: CoreInstrument, navigate: () => void): Promise<boolean> {
  awaitingCommit?.resolve(false)
  return new Promise((resolve, reject) => {
    awaitingCommit = { pathname: `/${id}`, resolve }
    try { navigate() } catch (error) { awaitingCommit = undefined; reject(error) }
  })
}

/** Called from App's layout effect after the destination DOM has been committed. */
export function finishProductRouteCommit(pathname: string) {
  const waiting = awaitingCommit
  awaitingCommit = undefined
  waiting?.resolve(waiting.pathname === pathname)
}

export function cancelProductTransitionForRoute(pathname: string) {
  if (destination && destination !== pathname) cancelPending?.()
}

function visibleStage(id: CoreInstrument) {
  const box = document.querySelector<HTMLElement>(`[data-product-transition-stage="${id}"]`)?.getBoundingClientRect()
  return Boolean(box && box.bottom > 0 && box.top < window.innerHeight && box.right > 0 && box.left < window.innerWidth)
}

/** Animation is optional; route commitment never depends on snapshot success. */
export function transitionProductRoute(id: CoreInstrument, update: () => void | Promise<void>) {
  const current = ++generation
  pending?.skipTransition()
  pending = undefined
  destination = undefined
  cancelPending = undefined
  let committed = false
  const commit = () => {
    if (committed || current !== generation) return
    committed = true
    return update()
  }
  const root = document.documentElement
  delete root.dataset.productRouteTransition
  delete root.dataset.productRouteStage
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  if (motion.matches || typeof document.startViewTransition !== 'function') {
    void commit()
    return
  }

  root.dataset.productRouteTransition = id
  if (visibleStage(id)) root.dataset.productRouteStage = 'true'
  let transition: ViewTransition | undefined
  const onMotion = () => { if (motion.matches) transition?.skipTransition() }
  const clean = () => {
    motion.removeEventListener('change', onMotion)
    if (current !== generation) return
    pending = undefined
    destination = undefined
    cancelPending = undefined
    delete root.dataset.productRouteTransition
    delete root.dataset.productRouteStage
  }
  destination = `/${id}`
  cancelPending = () => {
    transition?.skipTransition()
    clean()
    // A skipped native transition may still invoke its update callback later.
    generation++
  }
  motion.addEventListener('change', onMotion)
  try {
    transition = document.startViewTransition(() => {
      const result = commit()
      // The detail mechanism keeps its real layout. If it is below the fold,
      // fade the old stage instead of flying its snapshot outside the screen.
      const checkStage = () => {
        if (current === generation && !visibleStage(id)) delete root.dataset.productRouteStage
      }
      if (result) return result.then(checkStage)
      checkStage()
    })
    pending = transition
    // A skipped animation still calls the route update. Neither a hidden tab
    // nor an unavailable snapshot may create an unhandled promise rejection.
    void transition.ready.catch(() => undefined)
    void transition.updateCallbackDone.catch(() => undefined)
    void transition.finished.then(clean, clean)
  } catch {
    clean()
    void commit()
  }
}
