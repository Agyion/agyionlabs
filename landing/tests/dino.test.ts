import { describe, expect, it } from 'vitest'
import { DINO, hitPlayer, initialState, jump, padScore, speedFor, step } from '../src/lib/dino'

const noRand = () => 0 // deterministic spawn: earliest possible gap

describe('dino runner logic', () => {
  it('jump only fires from the ground while alive', () => {
    const s0 = initialState()
    const s1 = jump(s0)
    expect(s1.jumping).toBe(true)
    expect(s1.vy).toBe(DINO.jumpVelocity)
    expect(jump(s1)).toBe(s1) // mid-air: no double jump
    expect(jump({ ...s0, alive: false })).toEqual({ ...s0, alive: false })
  })

  it('gravity returns the player to the ground', () => {
    let s = jump(initialState())
    let peak = 0
    for (let i = 0; i < 200 && s.jumping; i++) {
      s = step(s, 16, noRand)
      peak = Math.max(peak, s.y)
    }
    expect(peak).toBeGreaterThan(60) // actually left the ground
    expect(s.jumping).toBe(false)
    expect(s.y).toBe(0)
  })

  it('obstacles spawn, travel left and score when cleared', () => {
    let s = initialState()
    s = step(s, DINO.minGapMs + 1, noRand, 800)
    expect(s.obstacleX).toBe(800)
    const before = s.obstacleX!
    s = step(s, 100, noRand, 800)
    expect(s.obstacleX!).toBeLessThan(before)
    // an obstacle already past the player exits left and scores
    let past = { ...initialState(), obstacleX: 10 }
    let guard = 0
    while (past.obstacleX !== null && guard++ < 100) past = step(past, 50, noRand, 800)
    expect(past.score).toBeGreaterThanOrEqual(1)
  })

  it('collision ends the run and preserves hi-score', () => {
    const s = { ...initialState(42), obstacleX: 70, score: 9 }
    expect(hitPlayer(s)).toBe(true)
    const dead = step(s, 1, noRand)
    expect(dead.alive).toBe(false)
    expect(dead.hiScore).toBe(42)
    expect(step(dead, 100, noRand)).toBe(dead) // frozen when dead
  })

  it('jump clears a low obstacle', () => {
    const airborne = { ...initialState(), obstacleX: 70, y: DINO.obstacleH + 10, jumping: true }
    expect(hitPlayer(airborne)).toBe(false)
  })

  it('speed grows with score, capped', () => {
    expect(speedFor(0)).toBe(DINO.speed)
    expect(speedFor(50)).toBeGreaterThan(DINO.speed)
    expect(speedFor(1000)).toBe(DINO.speed + 360)
  })

  it('padScore renders 5 digits', () => {
    expect(padScore(0)).toBe('00000')
    expect(padScore(404)).toBe('00404')
  })
})
