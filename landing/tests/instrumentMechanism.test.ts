import { describe, expect, it } from 'vitest'
import { INITIAL_MECHANISM_INPUTS, completeMechanism, fadePrice, mechanismResult } from '../src/components/instrumentMechanismState'

const initial = () => ({ ...INITIAL_MECHANISM_INPUTS })
describe('instrument teaching outcomes match the actual public product boundaries', () => {
  it('Fade flips settlement direction below zero and stops at its floor', () => {
    expect(fadePrice(0)).toBe(80); expect(fadePrice(100)).toBe(-40); expect(fadePrice(200)).toBe(-40)
    expect(mechanismResult('fade', 'claim', { ...initial(), time: 25 }).code).toBe('fade-costs')
    expect(mechanismResult('fade', 'claim', initial()).route).toBe('reverse')
  })
  it('Pod requires maturity and recipient signature, never public secret revelation', () => {
    expect(mechanismResult('pod', 'open', { ...initial(), signed: true }).code).toBe('pod-time')
    expect(mechanismResult('pod', 'open', { ...initial(), mature: true }).code).toBe('pod-signature')
    expect(mechanismResult('pod', 'open', { ...initial(), mature: true, signed: true }).code).toBe('pod-open')
  })
  it('Trigger separates invalid attestations, beneficiary payout and explicitly claimed refund', () => {
    expect(mechanismResult('trigger', 'submit', { ...initial(), evidence: 'invalid' }).ok).toBe(false)
    expect(mechanismResult('trigger', 'submit', initial()).code).toBe('trigger-payout')
    expect(mechanismResult('trigger', 'submit', { ...initial(), evidence: 'expired' }).route).toBe('reverse')
  })
  it('Envoy grants bounded permission and delivers claims to the owner', () => {
    expect(mechanismResult('envoy', 'request', initial()).code).toBe('envoy-ungranted')
    const granted = completeMechanism(initial(), mechanismResult('envoy', 'grant', initial()))
    const claim = mechanismResult('envoy', 'request', granted)
    expect(claim.code).toBe('envoy-owner'); expect(claim.detail).toContain('owner')
    expect(completeMechanism(granted, claim).claims).toBe(1)
  })
  it('revocation, expiry, positive price and the 50-claim ceiling each block requests without counting them', () => {
    for (const [change, code] of [[{ revoked: true }, 'envoy-revoked'], [{ expired: true }, 'envoy-expired'], [{ claims: 50 }, 'envoy-limit'], [{ positivePrice: true }, 'envoy-positive']] as const) {
      const state = { ...initial(), granted: true, ...change }, outcome = mechanismResult('envoy', 'request', state)
      expect(outcome.code).toBe(code); expect(completeMechanism(state, outcome).claims).toBe(state.claims)
    }
  })
  it('revocation preserves completed claims; an explicitly new mandate resets its own count and expiry', () => {
    const old = { ...initial(), granted: true, claims: 7, expired: true }
    const revoked = completeMechanism(old, mechanismResult('envoy', 'revoke', old))
    expect(revoked.claims).toBe(7); expect(revoked.revoked).toBe(true)
    const renewed = completeMechanism(revoked, mechanismResult('envoy', 'grant', revoked))
    expect(renewed).toMatchObject({ granted: true, claims: 0, expired: false, revoked: false })
  })
  it('Ramp remains mock in both directions and Ledger never claims signed settlement', () => {
    expect(mechanismResult('ramp', 'bridge', initial()).detail).toContain('mock')
    expect(mechanismResult('ramp', 'bridge', { ...initial(), direction: 'out' }).route).toBe('reverse')
    expect(mechanismResult('ledger', 'bundle', initial()).detail).toContain('unsigned')
    expect(mechanismResult('ledger', 'bundle', { ...initial(), altered: true }).ok).toBe(false)
  })
})
