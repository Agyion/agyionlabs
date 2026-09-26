import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDisclosureRequest } from '../src/disclosure.mjs';
import { h, request, requestContext } from './fixtures.mjs';
const rejected = (v, c = requestContext()) => assert.throws(() => parseDisclosureRequest(v, c), { name: 'PrivacyValidationError' });

test('a scoped request remains explicitly unverified and cannot be widened after parsing', () => {
  const original = request(); const parsed = parseDisclosureRequest(original, requestContext());
  assert.equal(parsed.kind, 'UnverifiedDisclosureRequest'); assert.equal('authorized' in parsed, false);
  original.fields.push('identity-reference'); assert.deepEqual(parsed.value.fields, ['asset-amount', 'terms-outcome']);
  assert.throws(() => { parsed.value.fields.push('participants'); }, TypeError);
});

test('rejects wildcard, multi-record, extra-field, empty, duplicate or reordered field scope', () => {
  for (const fields of [['*'], [], ['asset-amount', 'asset-amount'], ['participants', 'asset-amount'], ['other']]) { const v = request(); v.fields = fields; rejected(v); }
  for (const key of ['records', 'recordHashes', 'allRecords', 'verified', 'authorization']) { const v = request(); v[key] = true; rejected(v); }
  const v = request(); v.recordHash = '*'; rejected(v);
});

test('cannot add identity fields beyond the trusted request scope or weaken its allowed-fields list', () => {
  const v = request(); v.fields = ['asset-amount', 'terms-outcome', 'identity-reference']; rejected(v);
  for (const allowedFields of [[], ['*'], ['terms-outcome', 'asset-amount'], ['asset-amount', 'asset-amount']]) rejected(request(), { ...requestContext(), allowedFields });
  const narrower = request(); narrower.fields = ['asset-amount'];
  assert.deepEqual(parseDisclosureRequest(narrower, requestContext()).value.fields, ['asset-amount']);
});

test('rejects altered requester, record, ciphertext, policy, epoch and domain even with the same request id', () => {
  for (const field of ['recordHash', 'ciphertextDigest', 'policyDigest', 'epoch', 'requesterPublicKey']) {
    const v = request(); v[field] = field === 'epoch' ? '4' : field === 'requesterPublicKey' ? '04' + '42'.repeat(64) : h('de'); rejected(v);
    const c = requestContext(); c[field] = v[field]; rejected(request(), c);
  }
  const v = request(); v.domain.contractId = h('de'); rejected(v);
  const c = requestContext(); c.domain.networkId = h('de'); rejected(request(), c);
});

test('requires distinct ordered trustees from the trusted roster and meets its threshold', () => {
  for (const ids of [[], ['1'], ['1', '1'], ['3', '1'], ['1', '4'], ['1', '03'], ['0', '1'], ['1', '65536']]) { const v = request(); v.trusteeIds = ids; rejected(v); }
  for (const patch of [{ threshold: '1' }, { threshold: '4' }, { trusteeIds: ['1', '1', '3'] }, { trusteeIds: ['3', '2', '1'] }, { threshold: 2 }]) rejected(request(), { ...requestContext(), ...patch });
  const c = requestContext(); c.threshold = '3'; rejected(request(), c);
  const v = request(); v.trusteeIds = ['1', '2', '3']; assert.equal(parseDisclosureRequest(v, c).kind, 'UnverifiedDisclosureRequest');
});

test('requires a fresh bounded request with canonical identifiers and requester key shape', () => {
  for (const currentLedger of ['6', '10']) rejected(request(), { ...requestContext(), currentLedger });
  const v = request(); v.ledger = { from: '0', until: '17281' }; rejected(v);
  for (const field of ['requestId', 'purposeDigest']) { const bad = request(); bad[field] = h('00'); rejected(bad); }
  for (const key of ['03' + '44'.repeat(64), '04' + '44'.repeat(63), '04' + 'AA'.repeat(64)]) { const bad = request(); bad.requesterPublicKey = key; rejected(bad); }
  rejected(request(), { ...requestContext(), obsolete: true });
});
