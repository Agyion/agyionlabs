export const h = (byte) => byte.repeat(32);
export const FIELD_MODULUS = '30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001';
export const PUBLIC_KEY = '046b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c2964fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5';
export const statement = () => ({
  version: '1', suiteId: 'research-groth16-bn254-v1',
  domain: { networkId: h('aa'), contractId: h('bb') }, epoch: '3',
  ledger: { from: '7', until: '9' }, root: h('11'), policyRoot: h('12'), revocationRoot: h('13'),
  nullifiers: [h('21')], commitments: [h('22')], ciphertextDigest: h('cc'),
  bridge: { kind: 'none' }, fee: { amount: '0', recipient: h('00') },
});
export const statementContext = () => ({
  domain: { networkId: h('aa'), contractId: h('bb') }, epoch: '3',
  currentLedger: '8', ciphertextDigest: h('cc'),
});
// Hand-described wire vector; no production encoder/helper supplies expected bytes.
export const STATEMENT_HEX = '4147595053303031' + '01' + 'aa'.repeat(32) + 'bb'.repeat(32)
  + '00000003' + '00000007' + '00000009' + '11'.repeat(32) + '12'.repeat(32) + '13'.repeat(32)
  + '01' + '21'.repeat(32) + '01' + '22'.repeat(32) + 'cc'.repeat(32) + '00'
  + '0000000000000000' + '00'.repeat(32);
export const request = () => ({
  version: '1', domain: { networkId: h('aa'), contractId: h('bb') }, epoch: '3',
  ledger: { from: '7', until: '9' }, requestId: h('dd'), recordHash: h('ee'),
  ciphertextDigest: h('cc'), requesterPublicKey: PUBLIC_KEY, policyDigest: h('ab'),
  purposeDigest: h('ac'), fields: ['asset-amount', 'terms-outcome'], trusteeIds: ['1', '3'],
});
export const requestContext = () => ({
  ...statementContext(), recordHash: h('ee'), requesterPublicKey: PUBLIC_KEY,
  policyDigest: h('ab'), trusteeIds: ['1', '2', '3'], threshold: '2', allowedFields: ['asset-amount', 'terms-outcome'],
});
