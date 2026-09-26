import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStatement, encodeStatement, decodeStatement } from '../src/statement.mjs';
import { h, FIELD_MODULUS, statement, statementContext, STATEMENT_HEX } from './fixtures.mjs';

const rejected = (value, context = statementContext()) => assert.throws(() => parseStatement(value, context), { name: 'PrivacyValidationError' });

test('canonical bytes match the independently specified big-endian vector', () => {
  assert.equal(Buffer.from(encodeStatement(statement(), statementContext())).toString('hex'), STATEMENT_HEX);
  assert.equal(Buffer.from(STATEMENT_HEX, 'hex').length, 320);
});

test('decodes the literal vector into a parsed, not verified, immutable snapshot', () => {
  const parsed = decodeStatement(Buffer.from(STATEMENT_HEX, 'hex'), statementContext());
  assert.equal(parsed.kind, 'ParsedStatement');
  assert.deepEqual(parsed.value, statement());
  assert.equal('verified' in parsed, false);
  assert.throws(() => { parsed.value.nullifiers[0] = h('01'); }, TypeError);
  const original = statement();
  const copy = parseStatement(original, statementContext());
  original.domain.contractId = h('cc');
  assert.equal(copy.value.domain.contractId, h('bb'));
});

test('rejects unknown fields at every object boundary without invoking accessors', () => {
  for (const part of ['', 'domain', 'ledger', 'bridge', 'fee']) {
    const v = statement(); (part ? v[part] : v).extra = 'bad'; rejected(v);
  }
  const inherited = Object.assign(Object.create({ inherited: true }), statement()); rejected(inherited);
  const accessor = statement(); Object.defineProperty(accessor, 'epoch', { enumerable: true, get() { throw new Error('accessor ran'); } }); rejected(accessor);
  const symbolic = statement(); symbolic[Symbol('hidden')] = 'bad'; rejected(symbolic);
  const hidden = statement(); Object.defineProperty(hidden, 'secret', { value: 'hidden' }); rejected(hidden);
  const extraArray = statement(); extraArray.nullifiers.extra = true; rejected(extraArray);
  const sparse = statement(); sparse.nullifiers = new Array(1); rejected(sparse);
});

test('accepts canonical field maximum and uint boundaries, rejects scalar alias encodings', () => {
  const v = statement(); v.root = '30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000000';
  assert.equal(parseStatement(v, statementContext()).value.root, v.root);
  for (const value of [FIELD_MODULUS, h('ff'), '0x' + h('11'), h('AA'), h('11').slice(1), ' ' + h('11')]) {
    const invalid = statement(); invalid.root = value; rejected(invalid);
  }
  for (const value of [3, 3n, '03', '+3', '-1', '3.0', '3e0', ' 3', '4294967296', '', '9'.repeat(10000)]) {
    const invalid = statement(); invalid.epoch = value; rejected(invalid);
  }
  const max = statement(); max.epoch = '4294967295';
  assert.equal(parseStatement(max, { ...statementContext(), epoch: '4294967295' }).value.epoch, '4294967295');
});

test('rejects duplicate, zero, oversized and empty real note lists', () => {
  for (const field of ['nullifiers', 'commitments']) {
    for (const values of [[h('21'), h('21')], [h('00')], [h('01'), h('02'), h('03')], [], [FIELD_MODULUS]]) {
      const v = statement(); v[field] = values; rejected(v);
    }
  }
});

test('rejects statement or trusted-context changes to domain, epoch and ciphertext', () => {
  for (const field of ['networkId', 'contractId']) {
    const v = statement(); v.domain[field] = h('de'); rejected(v);
    const c = statementContext(); c.domain[field] = h('de'); rejected(statement(), c);
  }
  for (const field of ['epoch', 'ciphertextDigest']) {
    const v = statement(); v[field] = field === 'epoch' ? '4' : h('de'); rejected(v);
    const c = statementContext(); c[field] = field === 'epoch' ? '4' : h('de'); rejected(statement(), c);
  }
  rejected(statement(), { ...statementContext(), ignored: true });
});

test('freshness is inclusive and bounded, including uint32 maximum without wraparound', () => {
  for (const now of ['7', '9']) assert.equal(parseStatement(statement(), { ...statementContext(), currentLedger: now }).kind, 'ParsedStatement');
  for (const now of ['6', '10']) rejected(statement(), { ...statementContext(), currentLedger: now });
  for (const ledger of [{ from: '9', until: '7' }, { from: '0', until: '121' }]) { const v = statement(); v.ledger = ledger; rejected(v); }
  const v = statement(); v.ledger = { from: '4294967294', until: '4294967295' };
  assert.equal(parseStatement(v, { ...statementContext(), currentLedger: '4294967295' }).kind, 'ParsedStatement');
});

test('bridge and fee encoding preserves uint64 values without Number conversion', () => {
  const v = statement(); v.bridge = { kind: 'deposit', assetId: h('ad'), amount: '18446744073709551615', accountId: h('ae') }; v.nullifiers = [];
  assert.deepEqual(decodeStatement(encodeStatement(v, statementContext()), statementContext()).value, v);
  const bytes = Buffer.from(encodeStatement(v, statementContext()));
  assert.equal(bytes.subarray(280, 288).toString('hex'), 'ffffffffffffffff');
  for (const amount of ['0', '-1', '18446744073709551616', 10, '01']) { const bad = structuredClone(v); bad.bridge.amount = amount; rejected(bad); }
  const withdrawal = statement(); withdrawal.bridge = { kind: 'withdrawal', assetId: h('ad'), amount: '7', accountId: h('ae') }; withdrawal.commitments = [];
  assert.deepEqual(decodeStatement(encodeStatement(withdrawal, statementContext()), statementContext()).value, withdrawal);
  const mismatched = statement(); mismatched.fee.recipient = h('ad'); rejected(mismatched);
  mismatched.fee.amount = '1'; assert.equal(parseStatement(mismatched, statementContext()).value.fee.amount, '1');
  const zeroRecipient = statement(); zeroRecipient.fee.amount = '1'; rejected(zeroRecipient);
  const wrongCount = structuredClone(v); wrongCount.nullifiers = [h('21')]; rejected(wrongCount);
  const unknownKind = statement(); unknownKind.bridge.kind = 'mint'; rejected(unknownKind);
});

test('decoder rejects each truncated prefix, extra bytes and structural byte mutations', () => {
  const bytes = Buffer.from(STATEMENT_HEX, 'hex');
  for (let n = 0; n < bytes.length; n++) assert.throws(() => decodeStatement(bytes.subarray(0, n), statementContext()), { name: 'PrivacyValidationError' });
  assert.throws(() => decodeStatement(Buffer.concat([bytes, Buffer.from([0])]), statementContext()), { name: 'PrivacyValidationError' });
  for (const [offset, value] of [[0, 0], [8, 2], [181, 3], [214, 0], [279, 9]]) {
    const changed = Buffer.from(bytes); changed[offset] = value;
    assert.throws(() => decodeStatement(changed, statementContext()), { name: 'PrivacyValidationError' });
  }
  assert.throws(() => decodeStatement(new Uint8Array(1025), statementContext()), { name: 'PrivacyValidationError' });
  assert.throws(() => decodeStatement(STATEMENT_HEX, statementContext()), { name: 'PrivacyValidationError' });
});

test('decoder reads actual bounded bytes without invoking supplied view properties', () => {
  const valid = Buffer.from(STATEMENT_HEX, 'hex');
  const forged = Uint8Array.from(valid); forged[0] = 0;
  let methodCalls = 0;
  forged.subarray = (...args) => { methodCalls++; return valid.subarray(...args); };
  assert.throws(() => decodeStatement(forged, statementContext()), { name: 'PrivacyValidationError' });
  assert.equal(methodCalls, 0);

  const oversized = new Uint8Array(1025); oversized.set(valid);
  Object.defineProperty(oversized, 'byteLength', { value: valid.length });
  assert.throws(() => decodeStatement(oversized, statementContext()), { name: 'PrivacyValidationError', code: 'BOUNDED_BYTES_REQUIRED' });

  const padded = new Uint8Array(valid.length + 12); padded.set(valid, 7);
  const view = padded.subarray(7, 7 + valid.length);
  for (const key of ['byteLength', 'buffer', 'constructor', 'subarray', Symbol.iterator]) {
    Object.defineProperty(view, key, { get() { throw new Error('caller property executed'); } });
  }
  assert.deepEqual(decodeStatement(view, statementContext()).value, statement());
});

test('decoder rejects shared, detached, proxy and disguised non-byte views', () => {
  const shared = new Uint8Array(new SharedArrayBuffer(320));
  shared.set(Buffer.from(STATEMENT_HEX, 'hex'));
  assert.throws(() => decodeStatement(shared, statementContext()), { name: 'PrivacyValidationError', code: 'BOUNDED_BYTES_REQUIRED' });
  const detached = Uint8Array.from(Buffer.from(STATEMENT_HEX, 'hex'));
  structuredClone(detached.buffer, { transfer: [detached.buffer] });
  assert.throws(() => decodeStatement(detached, statementContext()), { name: 'PrivacyValidationError' });
  const proxy = new Proxy(Uint8Array.from(Buffer.from(STATEMENT_HEX, 'hex')), {});
  assert.throws(() => decodeStatement(proxy, statementContext()), { name: 'PrivacyValidationError' });
  const disguised = Uint16Array.from(Buffer.from(STATEMENT_HEX, 'hex'));
  Object.setPrototypeOf(disguised, Uint8Array.prototype);
  assert.throws(() => decodeStatement(disguised, statementContext()), { name: 'PrivacyValidationError', code: 'BOUNDED_BYTES_REQUIRED' });
});
