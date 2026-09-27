import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { buildPublicLifecyclePlan, validatePublicLifecyclePlan, hashPublicLifecyclePlan } from '../lib/public-lifecycle-plan.mjs';

const { Keypair, StrKey } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
// Synthetic unfunded public identities. No secret is persisted or submitted.
const keys = Array.from({ length: 7 }, (_, i) => Keypair.fromRawEd25519Seed(Buffer.alloc(32, 180 + i)).publicKey());
const options = () => ({ preparedAt: '2026-09-27T16:30:00.000Z', recipient: keys[0], relayer: keys[1], credentialKeys: {
  venue: keys[2], podTimelock: keys[3], podMixed: keys[4], attester: keys[5], agent: keys[6],
} });
const copy = value => structuredClone(value);
const expectedSource = 'GBDINNMPHA7LWJDAXS3G3NWCOLYLSPCER2Z4HENF2JE3ZKH7TVLF7PBF';

test('offline plan binds the preserved deployment receipt and exact fixed testnet authority', () => {
  const plan = buildPublicLifecyclePlan(options());
  const bytes = fs.readFileSync(new URL('../../deployments/public-v4-testnet.json', import.meta.url));
  const receipt = JSON.parse(bytes);
  assert.equal(plan.schema, 'agyion-public-v4-lifecycle-plan-v1');
  assert.equal(plan.testOnly, true);
  assert.equal(plan.receiptSha256, createHash('sha256').update(bytes).digest('hex'));
  for (const key of ['contractId', 'wasmSha256', 'networkPassphrase', 'rpcUrl', 'protocolVersion']) assert.equal(plan[key], receipt[key]);
  assert.deepEqual(plan.assets, receipt.assets);
  assert.equal(plan.deploymentManifestSha256, receipt.reviewedManifestSha256);
  assert.equal(plan.deploymentPlanSha256, receipt.offlinePlanSha256);
  assert.equal(plan.actors.seller, expectedSource);
  assert.equal(plan.friendbotUrl, 'https://friendbot.stellar.org/');
  assert.deepEqual(plan.fundingRoles, ['recipient', 'relayer']);
  assert.equal(validatePublicLifecyclePlan(plan), true);
});

test('schedule has exactly 39 source-bound calls, not 39 plus implicit cleanup or a seller faucet', () => {
  const plan = buildPublicLifecyclePlan(options()), steps = plan.steps;
  assert.equal(steps.length, 39);
  assert.equal(new Set(steps.map(s => s.id)).size, 39);
  const counts = Object.groupBy(steps, s => s.sourceRole);
  assert.deepEqual(Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v.length])), { seller: 14, recipient: 14, relayer: 11 });
  for (let i = 0; i < steps.length; i++) {
    assert.equal(steps[i].sourceAccount, plan.actors[steps[i].sourceRole]);
    assert.deepEqual(steps[i].predecessors, i ? [steps[i - 1].id] : []);
    assert.equal(steps[i].target, steps[i].kind === 'donation' ? plan.assets[0] : plan.contractId);
  }
  assert.deepEqual(steps.filter(s => s.method === 'transfer').map(s => s.terms), [{ amount: '1', recipient: plan.contractId }]);
  assert.equal(steps.filter(s => ['create_fade', 'create_pod', 'create_trigger'].includes(s.method)).length, 13);
  assert.deepEqual(plan.limits, { perTransactionFeeStroops: '10000000', aggregateFeeStroops: '400000000', outstandingPrincipalStroops: '30000000', grossPrincipalStroops: '130000000', nonFundingTransactions: 39, fundingRequests: 2, maxTimeAheadSeconds: 90 });
  assert.deepEqual(plan.finalState, { fade: { confirmed: 6, refunded: 2 }, pod: { opened: 2 }, trigger: { executed: 2, refunded: 1 }, mandate: { revoked: 2, expiredUnused: 1 }, liabilities: ['0', '0'], nativeSurplusIncrease: '1' });
});

test('distinct Pod credentials, expiries and negative observations are bound before terminal steps', () => {
  const plan = buildPublicLifecyclePlan(options()), steps = plan.steps;
  const pods = steps.filter(s => s.method === 'create_pod');
  assert.deepEqual(pods.map(s => s.terms.credentialRole), ['podTimelock', 'podMixed']);
  assert.deepEqual(pods.map(s => s.terms.unlockOffsetLedgers), [30, 0]);
  assert.deepEqual(steps.filter(s => s.method === 'create_mandate').map(s => [s.terms.maxPerTx, s.terms.validForLedgers]), [['500000', 1000], ['2000000', 1000], ['2000000', 12]]);
  const opening = steps.find(s => s.record === 'pod-timelock' && s.method === 'claim_pod');
  assert.deepEqual(opening.requiredObservations, ['pod-before-unlock', 'pod-crypto-domain', 'pod-recipient-auth-enforce', 'pod-destination-resigned-after-unlock']);
  const refund = steps.find(s => s.record === 'trigger-timeout' && s.method === 'refund_trigger');
  assert.deepEqual(refund.requiredObservations, ['trigger-early-refund', 'trigger-expired-attest-before-refund']);
  const cleanup = steps.find(s => s.record === 'fade-cleanup' && s.method === 'claim');
  assert.deepEqual(cleanup.requiredObservations, ['envoy-revoked-before-claim', 'envoy-expired-before-claim']);
});

test('terminal replay and malformed creation checks remain mandatory even after the last included call', () => {
  const plan = buildPublicLifecyclePlan(options());
  assert.deepEqual(plan.preflightObservations, ['initial-reviewed-code-and-empty-accounting', 'distinct-actor-authority-and-remaining-funds', 'creation-nonpositive-amount', 'fade-floor-below-pot', 'fade-zero-slope-denominator', 'fade-zero-duration-or-handoff', 'fade-excessive-span', 'zero-credential-key', 'trigger-current-past-or-max-deadline', 'trigger-kernel-or-asset-beneficiary', 'unsupported-asset-valid-creation-proof']);
  assert.deepEqual(plan.steps[1].requiredObservations, ['fade-kernel-or-asset-claimant-record-mode', 'fade-claim-wrong-source-enforce']);
  const replay = { confirm_handoff: 'fade-handoff-terminal-replay', claim_pod: 'pod-claim-terminal-replay', attest: 'trigger-attest-terminal-replay', refund_trigger: 'trigger-refund-terminal-replay', refund: 'fade-refund-terminal-replay' };
  for (const step of plan.steps) assert.deepEqual(step.postObservations, replay[step.method] ? [replay[step.method]] : []);
  assert.deepEqual(plan.steps.at(-1).postObservations, ['trigger-attest-terminal-replay']);
  assert.deepEqual(plan.finalObservations, ['all-required-simulations-have-matching-errors-and-prerequisites', 'all-39-original-inclusions-and-fee-metadata-reconciled', 'all-final-records-counters-and-live-ttls', 'both-liabilities-zero-and-native-surplus-increased-by-one', 'original-public-private-and-market-pins-unchanged']);
  for (const field of ['preflightObservations', 'finalObservations']) {
    const altered = copy(plan); altered[field].pop();
    assert.throws(() => validatePublicLifecyclePlan(altered), /LIFECYCLE_PLAN/);
  }
  const altered = copy(plan); altered.steps.at(-1).postObservations = [];
  assert.throws(() => validatePublicLifecyclePlan(altered), /LIFECYCLE_PLAN/);
});

test('immutable plan hashing is stable across property order and refuses altered authority', () => {
  const plan = buildPublicLifecyclePlan(options());
  const reordered = Object.fromEntries(Object.entries(copy(plan)).reverse());
  assert.match(hashPublicLifecyclePlan(plan), /^[a-f0-9]{64}$/);
  assert.equal(hashPublicLifecyclePlan(plan), hashPublicLifecyclePlan(reordered));
  for (const change of [p => { p.networkPassphrase = 'Public Global Stellar Network ; September 2015'; }, p => { p.contractId = p.assets[0]; }, p => { p.assets.reverse(); }, p => { p.wasmSha256 = 'aa'.repeat(32); }, p => { p.receiptSha256 = 'bb'.repeat(32); }, p => { p.rpcUrl += '/'; }, p => { p.friendbotUrl = 'https://example.test/'; }, p => { p.actors.seller = p.actors.recipient; }, p => { p.testOnly = false; }, p => { p.steps.pop(); }, p => { p.steps.push(copy(p.steps[0])); }, p => { p.steps[1].predecessors = []; }, p => { p.steps[12].requiredObservations = []; }, p => { p.steps[34].terms.amount = '2'; }, p => { p.limits.aggregateFeeStroops = '400000001'; }, p => { p.finalState.nativeSurplusIncrease = '0'; }, p => { p.extra = true; }]) {
    const changed = copy(plan); change(changed);
    assert.throws(() => validatePublicLifecyclePlan(changed), /LIFECYCLE_PLAN/);
    assert.throws(() => hashPublicLifecyclePlan(changed), /LIFECYCLE_PLAN/);
  }
  assert.throws(() => { plan.steps[0].terms.amount = '2'; }, TypeError);
  assert.throws(() => { plan.credentialKeys.podMixed = plan.credentialKeys.podTimelock; }, TypeError);
});

test('input accepts only explicit canonical timestamps and separate public roles', () => {
  for (const change of [o => { o.extra = true; }, o => { o.preparedAt = 'not-a-date'; }, o => { o.preparedAt = '2026-09-27T16:30:00Z'; }, o => { o.recipient = expectedSource; }, o => { o.relayer = o.recipient; }, o => { o.recipient = 'G'.repeat(56); }, o => { o.credentialKeys.podMixed = o.credentialKeys.podTimelock; }, o => { o.credentialKeys.venue = o.recipient; }, o => { o.credentialKeys.agent = StrKey.encodeEd25519PublicKey(Buffer.alloc(32)); }, o => { delete o.credentialKeys.attester; }, o => { o.credentialKeys.extra = keys[0]; }]) {
    const changed = options(); change(changed);
    assert.throws(() => buildPublicLifecyclePlan(changed), /LIFECYCLE_PLAN/);
  }
});

test('validation rejects accessors, non-JSON values, sparse or oversized data without invoking them', () => {
  const plan = copy(buildPublicLifecyclePlan(options()));
  let reads = 0; Object.defineProperty(plan, 'rpcUrl', { enumerable: true, get() { reads++; return 'https://soroban-testnet.stellar.org'; } });
  assert.throws(() => validatePublicLifecyclePlan(plan), /LIFECYCLE_PLAN/); assert.equal(reads, 0);
  for (const bad of [null, [], { ...copy(buildPublicLifecyclePlan(options())), extra: undefined }, { ...copy(buildPublicLifecyclePlan(options())), extra: 1n }, { ...copy(buildPublicLifecyclePlan(options())), extra: 'a'.repeat(65537) }]) assert.throws(() => validatePublicLifecyclePlan(bad), /LIFECYCLE_PLAN/);
  const sparse = copy(buildPublicLifecyclePlan(options())); delete sparse.steps[4];
  assert.throws(() => validatePublicLifecyclePlan(sparse), /LIFECYCLE_PLAN/);
});

test('building and hashing the plan do not open files, use randomness, or request network access', () => {
  const restore = [], calls = [];
  const deny = (object, key) => {
    const before = object[key]; restore.push(() => { object[key] = before; });
    object[key] = () => { calls.push(key); throw Error(`Unexpected side effect: ${key}`); };
  };
  try {
    for (const name of ['openSync', 'readFileSync', 'writeFileSync', 'mkdirSync']) deny(fs, name);
    for (const name of ['randomBytes', 'randomFillSync', 'randomUUID']) deny(crypto, name);
    deny(Keypair, 'random'); deny(globalThis, 'fetch');
    const input = options(), plan = buildPublicLifecyclePlan(input), digest = hashPublicLifecyclePlan(plan);
    input.credentialKeys.venue = keys[0];
    assert.equal(hashPublicLifecyclePlan(plan), digest, 'caller mutation cannot alter frozen plan');
    assert.deepEqual(calls, []);
  } finally { restore.reverse().forEach(fn => fn()); }
});
