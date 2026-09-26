import { fail, record, list, uint, hex, field, domain, interval, equal, bindDomain, freeze } from './validation.mjs';

const VERSION = '1';
const SUITE = 'research-groth16-bn254-v1';
const MAGIC = new TextEncoder().encode('AGYPS001');
const KEYS = ['version', 'suiteId', 'domain', 'epoch', 'ledger', 'root', 'policyRoot', 'revocationRoot', 'nullifiers', 'commitments', 'ciphertextDigest', 'bridge', 'fee'];
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const arrayTypeOf = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag).get;
const byteLengthOf = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength').get;
const bufferOf = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer').get;
const arrayBufferLengthOf = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get;

function snapshotBytes(value) {
  try {
    // Intrinsics read the actual view, not shadowed lengths/methods. Reject
    // shared storage, which another worker could change during the copy.
    if (arrayTypeOf.call(value) !== 'Uint8Array' || byteLengthOf.call(value) > 1024) fail('BOUNDED_BYTES_REQUIRED', 'statement');
    arrayBufferLengthOf.call(bufferOf.call(value));
    // The typed-array constructor copies internal bytes without calling the
    // supplied iterator, constructor/species or subarray method.
    return new Uint8Array(value);
  } catch {
    fail('BOUNDED_BYTES_REQUIRED', 'statement');
  }
}

function fieldList(value, path) {
  const values = list(value, 2, path).map((v) => field(v, path, true));
  if (new Set(values).size !== values.length) fail('DUPLICATE_NOTE', path);
  return values;
}

function bridge(value) {
  // Read kind as a data property before selecting one exact shape.
  if (!value || typeof value !== 'object') fail('OBJECT_REQUIRED', 'bridge');
  const kind = Object.getOwnPropertyDescriptor(value, 'kind')?.value;
  if (kind === 'none') { record(value, ['kind'], 'bridge'); return { kind }; }
  if (!['deposit', 'withdrawal'].includes(kind)) fail('UNKNOWN_BRIDGE_KIND', 'bridge');
  const v = record(value, ['kind', 'assetId', 'amount', 'accountId'], 'bridge');
  return { kind, assetId: hex(v.assetId, 32, 'bridge.assetId', true), amount: uint(v.amount, 64, 'bridge.amount', 1n), accountId: hex(v.accountId, 32, 'bridge.accountId', true) };
}

/** Structural parsing and caller-context binding only; no root/proof/token validation. */
export function parseStatement(value, context) {
  const c = record(context, ['domain', 'epoch', 'currentLedger', 'ciphertextDigest'], 'context');
  const expectedDomain = domain(c.domain, 'context.domain');
  const expectedEpoch = uint(c.epoch, 32, 'context.epoch', 1n);
  const now = uint(c.currentLedger, 32, 'context.currentLedger');
  const expectedCiphertext = hex(c.ciphertextDigest, 32, 'context.ciphertextDigest', true);
  const v = record(value, KEYS, 'statement');
  equal(v.version, VERSION, 'version'); equal(v.suiteId, SUITE, 'suiteId');
  const parsedDomain = domain(v.domain, 'domain'); bindDomain(parsedDomain, expectedDomain);
  const epoch = uint(v.epoch, 32, 'epoch', 1n); equal(epoch, expectedEpoch, 'epoch');
  const ciphertextDigest = hex(v.ciphertextDigest, 32, 'ciphertextDigest', true); equal(ciphertextDigest, expectedCiphertext, 'ciphertextDigest');
  const nullifiers = fieldList(v.nullifiers, 'nullifiers'); const commitments = fieldList(v.commitments, 'commitments');
  const parsedBridge = bridge(v.bridge);
  if (parsedBridge.kind === 'deposit' ? nullifiers.length !== 0 || commitments.length === 0
    : parsedBridge.kind === 'withdrawal' ? nullifiers.length === 0
      : nullifiers.length === 0 || commitments.length === 0) fail('INVALID_NOTE_COUNTS', 'bridge');
  const fee = record(v.fee, ['amount', 'recipient'], 'fee');
  const feeAmount = uint(fee.amount, 64, 'fee.amount'); const feeRecipient = hex(fee.recipient, 32, 'fee.recipient');
  if ((feeAmount === '0') !== /^0+$/.test(feeRecipient)) fail('FEE_RECIPIENT_MISMATCH', 'fee');
  return freeze({ kind: 'ParsedStatement', value: {
    version: VERSION, suiteId: SUITE, domain: parsedDomain, epoch,
    ledger: interval(v.ledger, now, 120n, 'ledger'),
    root: field(v.root, 'root'), policyRoot: field(v.policyRoot, 'policyRoot'), revocationRoot: field(v.revocationRoot, 'revocationRoot'),
    nullifiers, commitments, ciphertextDigest, bridge: parsedBridge, fee: { amount: feeAmount, recipient: feeRecipient },
  } });
}

function hexBytes(value) {
  return Uint8Array.from({ length: value.length / 2 }, (_, i) => Number.parseInt(value.slice(i * 2, i * 2 + 2), 16));
}

function intBytes(value, width) {
  let remaining = BigInt(value); const bytes = new Uint8Array(width);
  for (let i = width - 1; i >= 0; i--) { bytes[i] = Number(remaining & 255n); remaining >>= 8n; }
  return bytes;
}

export function encodeStatement(value, context) {
  const s = parseStatement(value, context).value;
  const parts = [MAGIC, Uint8Array.of(1), hexBytes(s.domain.networkId), hexBytes(s.domain.contractId), intBytes(s.epoch, 4), intBytes(s.ledger.from, 4), intBytes(s.ledger.until, 4), hexBytes(s.root), hexBytes(s.policyRoot), hexBytes(s.revocationRoot), Uint8Array.of(s.nullifiers.length), ...s.nullifiers.map(hexBytes), Uint8Array.of(s.commitments.length), ...s.commitments.map(hexBytes), hexBytes(s.ciphertextDigest)];
  parts.push(Uint8Array.of({ none: 0, deposit: 1, withdrawal: 2 }[s.bridge.kind]));
  if (s.bridge.kind !== 'none') parts.push(hexBytes(s.bridge.assetId), intBytes(s.bridge.amount, 8), hexBytes(s.bridge.accountId));
  parts.push(intBytes(s.fee.amount, 8), hexBytes(s.fee.recipient));
  const result = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

export function decodeStatement(input, context) {
  const bytes = snapshotBytes(input);
  let offset = 0;
  const take = (length) => {
    if (offset + length > bytes.byteLength) fail('TRUNCATED_BYTES', 'statement');
    const part = bytes.subarray(offset, offset + length); offset += length; return part;
  };
  const readInt = (width) => { let n = 0n; for (const b of take(width)) n = (n << 8n) | BigInt(b); return n.toString(); };
  const readHex = () => Array.from(take(32), (b) => b.toString(16).padStart(2, '0')).join('');
  const magic = take(MAGIC.length); if (magic.some((b, i) => b !== MAGIC[i])) fail('UNKNOWN_WIRE_VERSION', 'statement');
  if (readInt(1) !== '1') fail('UNKNOWN_SUITE', 'statement');
  const parsedDomain = { networkId: readHex(), contractId: readHex() };
  const epoch = readInt(4); const ledger = { from: readInt(4), until: readInt(4) };
  const root = readHex(); const policyRoot = readHex(); const revocationRoot = readHex();
  const readList = () => {
    const count = Number(readInt(1)); if (count > 2) fail('INVALID_NOTE_COUNTS', 'statement');
    return Array.from({ length: count }, readHex);
  };
  const nullifiers = readList(); const commitments = readList(); const ciphertextDigest = readHex();
  const tag = readInt(1); if (!['0', '1', '2'].includes(tag)) fail('UNKNOWN_BRIDGE_KIND', 'statement');
  const parsedBridge = tag === '0' ? { kind: 'none' } : { kind: tag === '1' ? 'deposit' : 'withdrawal', assetId: readHex(), amount: readInt(8), accountId: readHex() };
  const fee = { amount: readInt(8), recipient: readHex() };
  if (offset !== bytes.byteLength) fail('TRAILING_BYTES', 'statement');
  return parseStatement({ version: VERSION, suiteId: SUITE, domain: parsedDomain, epoch, ledger, root, policyRoot, revocationRoot, nullifiers, commitments, ciphertextDigest, bridge: parsedBridge, fee }, context);
}
