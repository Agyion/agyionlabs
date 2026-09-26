import { describe, expect, it } from 'vitest'
import { INITIAL_POD_TRIAL, podTrialReducer, podTrialStage, type PodCondition } from '../src/components/podTrial'

const conditions: PodCondition[] = ['timeReached', 'secretPresent', 'commitmentReady']

describe('Pod interactive example conditions', () => {
  it.each(Array.from({ length: 8 }, (_, mask) => mask))('requires all three independent conditions before opening (combination %i)', mask => {
    let state = INITIAL_POD_TRIAL
    conditions.forEach((condition, index) => {
      if (mask & 1 << index) state = podTrialReducer(state, { type: 'toggle', condition })
    })
    expect(state.opened).toBe(false)
    expect(podTrialStage(state)).toBe(mask === 7 ? 1 : 0)
    const opened = podTrialReducer(state, { type: 'open' })
    expect(opened.opened).toBe(mask === 7)
    expect(podTrialStage(opened)).toBe(mask === 7 ? 2 : 0)
  })

  it('does not treat time and secret as enough without an earlier-ledger recipient commitment', () => {
    const state = { ...INITIAL_POD_TRIAL, timeReached: true, secretPresent: true }
    expect(podTrialReducer(state, { type: 'open' }).opened).toBe(false)
    expect(podTrialStage(state)).toBe(0)
  })

  it('requires a new explicit opening after a previously satisfied condition changes', () => {
    const ready = { timeReached: true, secretPresent: true, commitmentReady: true, opened: false }
    const opened = podTrialReducer(ready, { type: 'open' })
    const relocked = podTrialReducer(opened, { type: 'toggle', condition: 'secretPresent' })
    expect(podTrialStage(relocked)).toBe(0)
    const readyAgain = podTrialReducer(relocked, { type: 'toggle', condition: 'secretPresent' })
    expect(podTrialStage(readyAgain)).toBe(1)
    expect(readyAgain.opened).toBe(false)
  })

  it('resets the example without retaining any fulfilled conditions or opened state', () => {
    const opened = { timeReached: true, secretPresent: true, commitmentReady: true, opened: true }
    expect(podTrialReducer(opened, { type: 'reset' })).toEqual(INITIAL_POD_TRIAL)
    expect(INITIAL_POD_TRIAL.opened).toBe(false)
  })
})
