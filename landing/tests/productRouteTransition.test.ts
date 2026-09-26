import { afterEach, describe, expect, it, vi } from 'vitest'
import { cancelProductTransitionForRoute, commitProductRoute, finishProductRouteCommit, isPlainProductClick, transitionProductRoute } from '../src/components/productRouteTransition'

const click = { button: 0, defaultPrevented: false, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }
function fixture({ reduced = false, supported = true } = {}) {
  const dataset: Record<string, string> = {}
  const callbacks: (() => void)[] = []
  const finishes: (() => void)[] = []
  const skips: ReturnType<typeof vi.fn>[] = []
  let stageVisible = true
  const media = { matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() }
  const start = vi.fn((callback: () => void) => {
    callbacks.push(callback)
    const skipTransition = vi.fn(); skips.push(skipTransition)
    return { ready: Promise.resolve(), updateCallbackDone: Promise.resolve(), finished: new Promise<void>(resolve => finishes.push(resolve)), skipTransition }
  })
  vi.stubGlobal('window', { matchMedia: () => media, innerWidth: 1440, innerHeight: 1000 })
  vi.stubGlobal('document', {
    documentElement: { dataset },
    querySelector: () => ({ getBoundingClientRect: () => ({ top: stageVisible ? 100 : 1100, bottom: stageVisible ? 700 : 1700, left: 100, right: 1300 }) }),
    startViewTransition: supported ? start : undefined,
  })
  return { dataset, callbacks, finishes, skips, start, hideStage: () => { stageVisible = false } }
}
afterEach(() => vi.unstubAllGlobals())

describe('progressive product-route navigation', () => {
  it('waits for the Router DOM commit before allowing the destination snapshot', async () => {
    const navigate = vi.fn(), captured = vi.fn()
    const result = commitProductRoute('pod', navigate).then(captured)
    expect(navigate).toHaveBeenCalledTimes(1)
    await Promise.resolve()
    expect(captured).not.toHaveBeenCalled()
    finishProductRouteCommit('/pod')
    await result
    expect(captured).toHaveBeenCalledWith(true)
  })
  it('releases a superseded commit without scrolling the unrelated destination', async () => {
    const result = commitProductRoute('fade', vi.fn())
    finishProductRouteCommit('/instruments')
    await expect(result).resolves.toBe(false)
  })
  it('leaves modified, auxiliary, prevented and new-tab links to the browser', () => {
    expect(isPlainProductClick(click, '')).toBe(true)
    expect(isPlainProductClick(click, '_self')).toBe(true)
    for (const alteration of [{ button: 1 }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { defaultPrevented: true }]) {
      expect(isPlainProductClick({ ...click, ...alteration }, '')).toBe(false)
    }
    expect(isPlainProductClick(click, '_blank')).toBe(false)
  })
  it.each([{ reduced: true }, { supported: false }])('navigates immediately without animation when %j', options => {
    const state = fixture(options), navigate = vi.fn()
    transitionProductRoute('pod', navigate)
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(state.start).not.toHaveBeenCalled()
    expect(state.dataset).toEqual({})
  })
  it('commits once inside the native snapshot update and clears its names on completion', async () => {
    const state = fixture(), navigate = vi.fn()
    transitionProductRoute('fade', navigate)
    expect(navigate).not.toHaveBeenCalled()
    expect(state.dataset.productRouteTransition).toBe('fade')
    state.callbacks[0]()
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(state.dataset.productRouteStage).toBe('true')
    state.finishes[0](); await Promise.resolve()
    expect(state.dataset).toEqual({})
  })
  it('fades an offscreen destination stage instead of matching it across the viewport', async () => {
    const state = fixture()
    transitionProductRoute('trigger', state.hideStage)
    expect(state.dataset.productRouteStage).toBe('true')
    state.callbacks[0]()
    expect(state.dataset.productRouteStage).toBeUndefined()
    expect(state.dataset.productRouteTransition).toBe('trigger')
    state.finishes[0](); await Promise.resolve()
  })
  it('falls back once if the browser refuses to start a transition', () => {
    const state = fixture(), navigate = vi.fn()
    state.start.mockImplementation(() => { throw new Error('Document is not active') })
    transitionProductRoute('envoy', navigate)
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(state.dataset).toEqual({})
  })
  it('does not let a skipped old callback navigate over a newer destination', async () => {
    const state = fixture(), oldNavigation = vi.fn(), newNavigation = vi.fn()
    transitionProductRoute('fade', oldNavigation)
    transitionProductRoute('pod', newNavigation)
    expect(state.skips[0]).toHaveBeenCalledTimes(1)
    state.callbacks[0](); state.callbacks[1]()
    expect(oldNavigation).not.toHaveBeenCalled()
    expect(newNavigation).toHaveBeenCalledTimes(1)
    state.finishes[0](); await Promise.resolve()
    expect(state.dataset.productRouteTransition).toBe('pod')
    state.finishes[1](); await Promise.resolve()
    expect(state.dataset).toEqual({})
  })
  it('does not override Back or another route with a delayed snapshot callback', async () => {
    const state = fixture(), navigate = vi.fn()
    transitionProductRoute('pod', navigate)
    cancelProductTransitionForRoute('/instruments')
    expect(state.skips[0]).toHaveBeenCalledTimes(1)
    state.callbacks[0]()
    expect(navigate).not.toHaveBeenCalled()
    expect(state.dataset).toEqual({})
    state.finishes[0](); await Promise.resolve()
  })
})
