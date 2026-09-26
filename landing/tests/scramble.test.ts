import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scrambleIn } from '../src/lib/scramble'

describe('dormant scramble helper cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
    vi.stubGlobal('window', globalThis)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('releases its repeating timer after restoring the original text', () => {
    const el = { dataset: {}, textContent: 'Money with conditions' } as unknown as HTMLElement
    scrambleIn(el, 0.12)
    vi.advanceTimersByTime(160)
    expect(el.textContent).toBe('Money with conditions')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('restarting a reveal leaves no old timer running after completion', () => {
    const el = { dataset: {}, textContent: 'Agyion' } as unknown as HTMLElement
    scrambleIn(el, 0.12)
    vi.advanceTimersByTime(80)
    scrambleIn(el, 0.12)
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(160)
    expect(el.textContent).toBe('Agyion')
    expect(vi.getTimerCount()).toBe(0)
  })
})
