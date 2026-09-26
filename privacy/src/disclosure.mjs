import { fail, record, list, uint, hex, domain, interval, equal, bindDomain, freeze } from './validation.mjs';

const FIELDS = Object.freeze(['asset-amount', 'participants', 'terms-outcome', 'identity-reference']);
const KEYS = ['version', 'domain', 'epoch', 'ledger', 'requestId', 'recordHash', 'ciphertextDigest', 'requesterPublicKey', 'policyDigest', 'purposeDigest', 'fields', 'trusteeIds'];

function trustees(value, path) {
  const ids = list(value, 32, path).map((id) => uint(id, 16, path, 1n));
  if (ids.some((id, i) => i > 0 && BigInt(id) <= BigInt(ids[i - 1]))) fail('ORDERED_DISTINCT_TRUSTEES_REQUIRED', path);
  return ids;
}

function publicKey(value, path) {
  hex(value, 65, path);
  if (!value.startsWith('04') || /^0+$/.test(value.slice(2))) fail('PUBLIC_KEY_SHAPE_REQUIRED', path);
  return value; // Shape only: this does not prove P-256 curve membership or possession.
}

function fieldScope(value, path) {
  const fields = list(value, FIELDS.length, path);
  if (!fields.length || fields.some((f, i) => !FIELDS.includes(f) || (i > 0 && FIELDS.indexOf(f) <= FIELDS.indexOf(fields[i - 1])))) fail('ORDERED_FIELD_SCOPE_REQUIRED', path);
  return fields;
}

/** No signatures, DKG shares, request authorization or decryption are verified. */
export function parseDisclosureRequest(value, context) {
  const c = record(context, ['domain', 'epoch', 'currentLedger', 'recordHash', 'ciphertextDigest', 'requesterPublicKey', 'policyDigest', 'trusteeIds', 'threshold', 'allowedFields'], 'context');
  const expectedDomain = domain(c.domain, 'context.domain'); const expectedEpoch = uint(c.epoch, 32, 'context.epoch', 1n);
  const now = uint(c.currentLedger, 32, 'context.currentLedger');
  const roster = trustees(c.trusteeIds, 'context.trusteeIds'); const threshold = uint(c.threshold, 16, 'context.threshold', 2n);
  if (BigInt(threshold) > BigInt(roster.length)) fail('INVALID_THRESHOLD', 'context.threshold');
  const expectedRecord = hex(c.recordHash, 32, 'context.recordHash', true);
  const expectedCiphertext = hex(c.ciphertextDigest, 32, 'context.ciphertextDigest', true);
  const expectedRequester = publicKey(c.requesterPublicKey, 'context.requesterPublicKey');
  const expectedPolicy = hex(c.policyDigest, 32, 'context.policyDigest', true);
  const allowedFields = fieldScope(c.allowedFields, 'context.allowedFields');
  const v = record(value, KEYS, 'request'); equal(v.version, '1', 'version');
  const parsedDomain = domain(v.domain, 'domain'); bindDomain(parsedDomain, expectedDomain);
  const epoch = uint(v.epoch, 32, 'epoch', 1n); equal(epoch, expectedEpoch, 'epoch');
  const recordHash = hex(v.recordHash, 32, 'recordHash', true); equal(recordHash, expectedRecord, 'recordHash');
  const ciphertextDigest = hex(v.ciphertextDigest, 32, 'ciphertextDigest', true); equal(ciphertextDigest, expectedCiphertext, 'ciphertextDigest');
  const requesterPublicKey = publicKey(v.requesterPublicKey, 'requesterPublicKey'); equal(requesterPublicKey, expectedRequester, 'requesterPublicKey');
  const policyDigest = hex(v.policyDigest, 32, 'policyDigest', true); equal(policyDigest, expectedPolicy, 'policyDigest');
  const fields = fieldScope(v.fields, 'fields');
  if (fields.some((f) => !allowedFields.includes(f))) fail('FIELD_SCOPE_MISMATCH', 'fields');
  const trusteeIds = trustees(v.trusteeIds, 'trusteeIds');
  if (BigInt(trusteeIds.length) < BigInt(threshold) || trusteeIds.some((id) => !roster.includes(id))) fail('TRUSTEE_SCOPE_MISMATCH', 'trusteeIds');
  return freeze({ kind: 'UnverifiedDisclosureRequest', value: {
    version: '1', domain: parsedDomain, epoch, ledger: interval(v.ledger, now, 17280n, 'ledger'),
    requestId: hex(v.requestId, 32, 'requestId', true), recordHash, ciphertextDigest, requesterPublicKey, policyDigest,
    purposeDigest: hex(v.purposeDigest, 32, 'purposeDigest', true), fields, trusteeIds,
  } });
}
