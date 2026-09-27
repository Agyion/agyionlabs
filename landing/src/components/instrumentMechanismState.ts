/** Deterministic teaching states. No wallet, keys, network or asset operations. */
export type DetailInstrument = 'fade' | 'pod' | 'trigger' | 'envoy' | 'ramp' | 'ledger'
export type MechanismAction = 'claim' | 'open' | 'submit' | 'grant' | 'request' | 'revoke' | 'bridge' | 'bundle'
export type MechanismInputs = {
  time: number; mature: boolean; signed: boolean; evidence: 'valid' | 'invalid' | 'expired'
  granted: boolean; revoked: boolean; expired: boolean; claims: number; positivePrice: boolean
  direction: 'in' | 'out'; altered: boolean
}
export type MechanismResult = {
  code: string; ok: boolean; title: string; detail: string
  route: 'forward' | 'reverse' | 'blocked'; action: MechanismAction
}
export const INITIAL_MECHANISM_INPUTS: Readonly<MechanismInputs> = Object.freeze({
  time: 75, mature: false, signed: false, evidence: 'valid', granted: false, revoked: false,
  expired: false, claims: 0, positivePrice: false, direction: 'in', altered: false,
})
export const fadePrice = (time: number) => Math.round(80 - 1.2 * Math.max(0, Math.min(100, time)))
export function mechanismResult(kind: DetailInstrument, action: MechanismAction, input: MechanismInputs): MechanismResult {
  const result = (code: string, ok: boolean, title: string, detail: string, route: MechanismResult['route'] = ok ? 'forward' : 'blocked'): MechanismResult => ({ code, ok, title, detail, route, action })
  if (kind === 'fade') {
    const price = fadePrice(input.time)
    return price < 0 ? result('fade-pays', true, 'The direction changes.', `At ${price}, the pot pays ${Math.abs(price)} to the claimer on settlement.`, 'reverse')
      : price === 0 ? result('fade-zero', true, 'A claim at zero price.', 'The claim costs zero; settlement still requires a transaction.')
      : result('fade-costs', true, 'The claimer pays.', `At +${price}, the claimer pays ${price} on settlement.`)
  }
  if (kind === 'pod') {
    if (!input.mature) return result('pod-time', false, 'The seal holds.', 'The unlock ledger has not been reached.')
    if (!input.signed) return result('pod-signature', false, 'Authorization is missing.', 'A valid signature bound to the recipient is required. The key stays local.')
    return result('pod-open', true, 'Authorized for the recipient.', 'The unlock condition and signature bound to the recipient both pass. The key is never revealed.')
  }
  if (kind === 'trigger') {
    if (input.evidence === 'invalid') return result('trigger-invalid', false, 'The proof does not pass.', 'An invalid oracle attestation leaves the escrow locked.')
    if (input.evidence === 'expired') return result('trigger-refund', true, 'An eligible refund is claimed.', 'After expiry, a refund transaction returns the escrow to its funder.', 'reverse')
    return result('trigger-payout', true, 'The attestation passes.', 'The configured oracle proof authorizes payout to the beneficiary.')
  }
  if (kind === 'envoy') {
    if (action === 'grant') return result('envoy-grant', true, 'Permission, not custody.', 'The agent may request eligible Fade claims. The recipient remains the owner.')
    if (action === 'revoke') return result('envoy-revoke', true, 'The route is cut.', 'This simulated revocation blocks the next request. Earlier completed claims stay completed.')
    if (!input.granted) return result('envoy-ungranted', false, 'No mandate, no claim.', 'The owner must first grant the agent a mandate.')
    if (input.revoked) return result('envoy-revoked', false, 'Revoked. Request blocked.', 'The agent no longer has permission to claim under this mandate.')
    if (input.expired) return result('envoy-expired', false, 'The mandate has expired.', 'A request after expiry does not create a claim.')
    if (input.claims >= 50) return result('envoy-limit', false, 'The claim limit is reached.', 'This mandate has used all 50 permitted claims.')
    if (input.positivePrice) return result('envoy-positive', false, 'Claim at a positive price blocked.', 'Envoy can claim only Fades priced at zero or less; it cannot make this purchase.')
    return result('envoy-owner', true, 'The claim belongs to the owner.', `Request ${input.claims + 1} of 50 passes. The owner receives the Fade claim; the agent does not take custody.`)
  }
  if (kind === 'ramp') return result('ramp-mock', true, input.direction === 'in' ? 'TRY → test USDC.' : 'Test USDC → TRY.', 'A mock route only. No bank transfer, live rate or real currency settlement.', input.direction === 'in' ? 'forward' : 'reverse')
  return input.altered ? result('ledger-mismatch', false, 'The checksum changed.', 'Changed bundle content no longer matches its recorded checksum. No settlement is proved.')
    : result('ledger-reference', true, 'A portable reference.', 'The unsigned bundle carries activity and transaction references. Check each transaction independently.')
}
export function completeMechanism(input: MechanismInputs, result: MechanismResult): MechanismInputs {
  if (result.code === 'envoy-grant') return { ...input, granted: true, revoked: false, expired: false, claims: 0 }
  if (result.code === 'envoy-revoke') return { ...input, revoked: true }
  if (result.code === 'envoy-owner') return { ...input, claims: Math.min(50, input.claims + 1) }
  return input
}
