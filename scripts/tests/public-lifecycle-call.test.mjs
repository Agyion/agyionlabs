import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { buildPublicLifecyclePlan } from '../lib/public-lifecycle-plan.mjs';
import { bindPublicLifecycleCall, publicLifecycleCallIntent } from '../lib/public-lifecycle-call.mjs';
const { Address, Keypair, scValToNative, xdr } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const roles = ['recipient', 'relayer', 'venue', 'podTimelock', 'podMixed', 'attester', 'agent'];
// Synthetic, unfunded credential fixtures. No existing transaction key is read.
const keys = Object.fromEntries(roles.map((role, i) => [role, Keypair.fromRawEd25519Seed(Buffer.alloc(32, 210 + i))]));
const plan = buildPublicLifecyclePlan({ preparedAt: '2026-09-27T17:00:00.000Z', recipient: keys.recipient.publicKey(), relayer: keys.relayer.publicKey(), credentialKeys: Object.fromEntries(roles.slice(2).map(role => [role, keys[role].publicKey()])) });
const headLedger = 5000000, timestamp = '1790528400000';
const timed = new Set(['confirm_handoff', 'attest', 'envoy_claim']);
const input = step => ({ plan, stepId: step.id, headLedger, ...(timed.has(step.method) ? { timestamp } : {}) });
const by = (record, method) => plan.steps.find(s => s.record === record && s.method === method);
const native = result => result.call.argsXdr.map(v => scValToNative(xdr.ScVal.fromXDR(v, 'base64')));
const u64 = value => { const out = Buffer.alloc(8); out.writeBigUInt64BE(BigInt(value)); return out; };
const u32 = value => { const out = Buffer.alloc(4); out.writeUInt32BE(value); return out; };
const addr = value => new Address(value).toScVal().toXDR();
const domain = purpose => Buffer.concat([Buffer.from(purpose + '\0'), createHash('sha256').update(plan.networkPassphrase).digest(), addr(plan.contractId)]);
function signed(step) {
  const options = input(step), intent = publicLifecycleCallIntent(options);
  return bindPublicLifecycleCall({ ...options, ...(intent.credential ? { signatureHex: keys[intent.credential.role].sign(Buffer.from(intent.credential.payloadHex, 'hex')).toString('hex') } : {}) });
}

test('all 39 calls bind exact reviewed methods, source roles and immutable arguments', () => {
  const ids = { fade: 0, pod: 0, trigger: 0, mandate: 0 };
  for (const step of plan.steps) {
    const result = signed(step), values = native(result);
    assert.equal(result.call.method, step.method); assert.equal(result.call.target, step.target);
    assert.equal(result.call.sourceAccount, plan.actors[step.sourceRole]);
    assert.equal(result.stepId, step.id); assert.equal(result.headLedger, headLedger);
    assert.equal(result.call.kind, step.kind); assert.ok(Object.isFrozen(result.call.argsXdr));
    if (step.method.startsWith('create_')) {
      const kind = step.method.slice(7); ids[kind]++;
      assert.equal(result.expectedCreatedId, String(ids[kind]));
    } else assert.equal(result.expectedCreatedId, null);
    if (step.method === 'create_fade') assert.deepEqual(values, [plan.actors.seller, plan.assets[0], 10000000n, BigInt(step.terms.price), BigInt(step.terms.price), 0n, 1n, step.terms.durationLedgers, step.terms.handoffWindow, keys.venue.rawPublicKey()]);
    if (step.method === 'create_pod') assert.deepEqual(values.slice(0, 5), [plan.actors.seller, plan.assets[0], 10000000n, headLedger + step.terms.unlockOffsetLedgers, keys[step.terms.credentialRole].rawPublicKey()]);
    if (step.method === 'create_trigger') assert.deepEqual(values, [plan.actors.seller, plan.assets[0], 10000000n, plan.actors.recipient, keys.attester.rawPublicKey(), headLedger + step.terms.deadlineOffsetLedgers]);
    if (step.method === 'create_mandate') assert.deepEqual(values, [plan.actors.recipient, keys.agent.rawPublicKey(), BigInt(step.terms.maxPerTx), BigInt(step.terms.dailyCap), headLedger + step.terms.validForLedgers]);
    if (step.method === 'claim') assert.equal(values[1], plan.actors.recipient);
    if (step.method === 'transfer') assert.deepEqual(values, [plan.actors.seller, plan.contractId, 1n]);
  }
  assert.deepEqual(ids, { fade: 8, pod: 2, trigger: 3, mandate: 3 });
});

test('record IDs are bound to initially empty per-type counters and prior scheduled creates', () => {
  for (const [record, method, expected] of [
    ['fade-negative', 'claim', [1n]], ['fade-no-show', 'refund', [5n]],
    ['fade-mixed', 'confirm_handoff', [8n]], ['pod-mixed', 'claim_pod', [2n]],
    ['trigger-mixed', 'attest', [3n]], ['fade-delegated', 'envoy_claim', [1n, 6n]],
    ['grant-permissive', 'revoke_mandate', [plan.actors.recipient, 2n]],
  ]) assert.deepEqual(native(signed(by(record, method))).slice(0, expected.length), expected);
  const step = by('fade-negative', 'claim');
  for (const extra of [{ recordId: '2' }, { argsXdr: [] }, { sourceAccount: plan.actors.relayer }]) assert.throws(() => bindPublicLifecycleCall({ ...input(step), ...extra }), /LIFECYCLE_CALL_INPUT/);
});

test('credential preimages match the actual V4 contract purpose, network and deployment encodings', () => {
  const amount = Buffer.alloc(16); amount.writeBigUInt64BE(10000000n, 8);
  const cases = [
    ['pod-timelock', 'create_pod', 'podTimelock', Buffer.concat([domain('agyion:pod-create:v3'), addr(plan.actors.seller), addr(plan.assets[0]), amount, u32(headLedger + 30), keys.podTimelock.rawPublicKey()])],
    ['pod-mixed', 'claim_pod', 'podMixed', Buffer.concat([domain('agyion:pod-claim:v3'), u64(2), addr(plan.actors.recipient)])],
    ['fade-positive', 'confirm_handoff', 'venue', Buffer.concat([domain('agyion:handoff:v2'), u64(3), addr(plan.actors.recipient), u64(timestamp)])],
    ['trigger-mixed', 'attest', 'attester', Buffer.concat([domain('agyion:attest:v2'), u64(3), addr(plan.actors.recipient), u64(timestamp)])],
    ['fade-delegated', 'envoy_claim', 'agent', Buffer.concat([domain('agyion:envoy:v2'), u64(1), u64(6), u64(timestamp)])],
  ];
  for (const [record, method, role, expected] of cases) {
    const intent = publicLifecycleCallIntent(input(by(record, method)));
    assert.deepEqual(intent.credential, { role, publicKey: keys[role].publicKey(), payloadHex: expected.toString('hex') });
    assert.ok(Object.isFrozen(intent.credential));
    signed(by(record, method));
  }
});

test('valid signature for another key, Pod, recipient, domain, head or timestamp is rejected', () => {
  const pod = by('pod-timelock', 'create_pod'), options = input(pod), intent = publicLifecycleCallIntent(options);
  const good = keys.podTimelock.sign(Buffer.from(intent.credential.payloadHex, 'hex')).toString('hex');
  assert.throws(() => bindPublicLifecycleCall({ ...options, headLedger: headLedger + 1, signatureHex: good }), /LIFECYCLE_CALL_SIGNATURE/);
  assert.throws(() => bindPublicLifecycleCall({ ...options, signatureHex: keys.podMixed.sign(Buffer.from(intent.credential.payloadHex, 'hex')).toString('hex') }), /LIFECYCLE_CALL_SIGNATURE/);
  for (const method of ['create_pod', 'claim_pod', 'confirm_handoff', 'attest', 'envoy_claim']) {
    const step = plan.steps.find(s => s.method === method), o = input(step), i = publicLifecycleCallIntent(o), key = keys[i.credential.role];
    for (const position of [0, 25, Buffer.from(i.credential.payloadHex, 'hex').length - 1]) {
      const changed = Buffer.from(i.credential.payloadHex, 'hex'); changed[position] ^= 1;
      assert.throws(() => bindPublicLifecycleCall({ ...o, signatureHex: key.sign(changed).toString('hex') }), /LIFECYCLE_CALL_SIGNATURE/);
    }
    assert.throws(() => bindPublicLifecycleCall(o), /LIFECYCLE_CALL_SIGNATURE/);
    for (const signatureHex of ['00'.repeat(64), good + '00', good.toUpperCase(), Buffer.from(good, 'hex')]) assert.throws(() => bindPublicLifecycleCall({ ...o, signatureHex }), /LIFECYCLE_CALL_SIGNATURE/);
  }
});

test('expected business deltas exclude fees and conserve all 13 principals and donation', () => {
  const balance = { seller: 0n, recipient: 0n, relayer: 0n };
  let reserve = 0n, peak = 0n;
  for (const step of plan.steps) {
    const result = signed(step), delta = result.businessDeltas;
    assert.deepEqual(Object.keys(delta).sort(), ['recipient', 'relayer', 'seller']);
    for (const role of Object.keys(balance)) { balance[role] += BigInt(delta[role]); reserve -= BigInt(delta[role]); }
    if (reserve > peak) peak = reserve;
    assert.ok(reserve >= 0n);
  }
  assert.equal(peak, 30000001n); assert.equal(reserve, 1n);
  // Two 1-XLM Pods and two executed Triggers pay 4 XLM. Two negative
  // handoffs pay 0.2 XLM, while the positive handoff charges 0.1 XLM.
  assert.deepEqual(balance, { seller: -41000001n, recipient: 41000000n, relayer: 0n });
  assert.deepEqual(signed(by('fade-positive', 'confirm_handoff')).businessDeltas, { seller: '11000000', recipient: '-1000000', relayer: '0' });
  assert.deepEqual(signed(by('fade-negative', 'confirm_handoff')).businessDeltas, { seller: '9000000', recipient: '1000000', relayer: '0' });
});

test('time, ledger, plan and accessor ambiguity fail before any implicit coercion', () => {
  const simple = input(by('fade-negative', 'claim')), credential = input(by('fade-negative', 'confirm_handoff'));
  for (const headLedger of [0, -1, 0xffffffff, 0xfffffffe, '5000000', NaN, Infinity]) assert.throws(() => publicLifecycleCallIntent({ ...input(by('grant-capped', 'create_mandate')), headLedger }), /LIFECYCLE_CALL_LEDGER/);
  for (const timestamp of [undefined, '0', '01', '-1', '18446744073709551616', 100]) assert.throws(() => publicLifecycleCallIntent({ ...credential, timestamp }), /LIFECYCLE_CALL_TIME/);
  assert.throws(() => publicLifecycleCallIntent({ ...simple, timestamp }), /LIFECYCLE_CALL_INPUT/);
  assert.throws(() => bindPublicLifecycleCall({ ...simple, signatureHex: '11'.repeat(64) }), /LIFECYCLE_CALL_INPUT/);
  assert.throws(() => publicLifecycleCallIntent({ ...simple, stepId: 'unknown' }), /LIFECYCLE_CALL_STEP/);
  const changed = structuredClone(plan); changed.steps[0].terms.price = '0';
  assert.throws(() => publicLifecycleCallIntent({ ...simple, plan: changed }), /LIFECYCLE_PLAN/);
  let invoked = 0;
  const hostile = { ...simple }; Object.defineProperty(hostile, 'stepId', { enumerable: true, get() { invoked++; throw Error('secret'); } });
  assert.throws(() => publicLifecycleCallIntent(hostile), /LIFECYCLE_CALL_INPUT/);
  assert.equal(invoked, 0);
});

test('changing a reviewed recipient or timestamp cannot reuse its earlier valid credential', () => {
  const step = by('pod-timelock', 'claim_pod'), original = input(step);
  const intent = publicLifecycleCallIntent(original);
  const signatureHex = keys.podTimelock.sign(Buffer.from(intent.credential.payloadHex, 'hex')).toString('hex');
  const different = buildPublicLifecyclePlan({ preparedAt: plan.preparedAt, recipient: plan.actors.relayer, relayer: plan.actors.recipient, credentialKeys: plan.credentialKeys });
  assert.throws(() => bindPublicLifecycleCall({ ...original, plan: different, signatureHex }), /LIFECYCLE_CALL_SIGNATURE/);
  const handoff = input(by('fade-negative', 'confirm_handoff')), h = publicLifecycleCallIntent(handoff);
  const signature = keys.venue.sign(Buffer.from(h.credential.payloadHex, 'hex')).toString('hex');
  assert.throws(() => bindPublicLifecycleCall({ ...handoff, timestamp: String(BigInt(timestamp) + 1n), signatureHex: signature }), /LIFECYCLE_CALL_SIGNATURE/);
});

test('call intent and binding use no filesystem, entropy, transport or secret operations', () => {
  const original = { read: fs.readFileSync, write: fs.writeFileSync, random: crypto.randomBytes, fetch: globalThis.fetch, key: Keypair.random };
  const deny = () => { throw Error('Unexpected side effect'); };
  try {
    fs.readFileSync = deny; fs.writeFileSync = deny; crypto.randomBytes = deny; globalThis.fetch = deny; Keypair.random = deny;
    const result = signed(by('pod-timelock', 'claim_pod'));
    assert.equal(result.call.method, 'claim_pod');
    assert.ok(Object.isFrozen(result) && Object.isFrozen(result.businessDeltas));
  } finally {
    fs.readFileSync = original.read; fs.writeFileSync = original.write; crypto.randomBytes = original.random; globalThis.fetch = original.fetch; Keypair.random = original.key;
  }
});
