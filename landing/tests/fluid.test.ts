import { describe, expect, it } from 'vitest'
import { hexToRgb, sampleFluid } from '../src/lib/fluid'

describe('fluid field sampler', () => {
  it('is deterministic for identical inputs', () => {
    const a = sampleFluid(0.42, 0.61, 3.2, 0.5, 0.42, 0.6)
    const b = sampleFluid(0.42, 0.61, 3.2, 0.5, 0.42, 0.6)
    expect(a).toBe(b)
  })

  it('stays within 0..1 across the domain', () => {
    for (let i = 0; i < 200; i++) {
      const v = sampleFluid((i % 20) / 10, Math.floor(i / 20) / 10, i * 0.37, 0.5, 0.5, 0.6)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('evolves over time', () => {
    const still = sampleFluid(0.8, 0.35, 0, 0.5, 0.42, 0.6)
    const later = sampleFluid(0.8, 0.35, 6, 0.5, 0.42, 0.6)
    expect(later).not.toBe(still)
  })

  it('responds to the pointer position', () => {
    /* near the cursor the warp must change the field */
    const near = sampleFluid(0.3, 0.3, 2, 0.32, 0.3, 0.8)
    const far = sampleFluid(0.3, 0.3, 2, 0.95, 0.9, 0.8)
    expect(near).not.toBe(far)
  })

  it('zero strength disables the pointer push', () => {
    const a = sampleFluid(0.3, 0.3, 2, 0.1, 0.1, 0)
    const b = sampleFluid(0.3, 0.3, 2, 0.9, 0.9, 0)
    expect(a).toBe(b)
  })
})

describe('hexToRgb', () => {
  it('parses 6-digit hex', () => {
    expect(hexToRgb('#c89a45')).toEqual({ r: 200, g: 154, b: 69 })
  })

  it('parses 3-digit hex', () => {
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 })
  })
})
