import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as journal from '../lib/public-lifecycle-journal.mjs';
import { createStateFixture } from './helpers/public-lifecycle-state-fixture.mjs';
import { hashPublicLifecyclePlan } from '../lib/public-lifecycle-plan.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
function fixture(t) {
  fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
  const home = fs.mkdtempSync(path.join(root, 'artifacts/replay-test-')); fs.chmodSync(home, 0o700);
  const run = path.join(home, 'run'), lockRoot = path.join(home, 'locks');
  for (const directory of [run, lockRoot]) fs.mkdirSync(directory, { mode: 0o700 });
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const { plan } = createStateFixture({ realWasm: false });
  return { run, lockRoot, plan, planSha256: hashPublicLifecyclePlan(plan) };
}
// Deny side effects at their actual filesystem boundary, including directory
// fsync and write-capable opens; restore everything before fixture cleanup.
function readOnly(fn) {
  const names = ['fsyncSync', 'fdatasyncSync', 'writeFileSync', 'writeSync', 'mkdirSync', 'renameSync', 'unlinkSync', 'rmSync', 'chmodSync'];
  const prior = Object.fromEntries(names.map(name => [name, fs[name]]));
  const open = fs.openSync, fetch = globalThis.fetch;
  try {
    for (const name of names) fs[name] = () => { throw Error('READ_ONLY_SIDE_EFFECT_' + name); };
    fs.openSync = (file, flags, ...rest) => {
      assert.equal(typeof flags, 'number');
      assert.equal(flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND), 0);
      return open.call(fs, file, flags, ...rest);
    };
    globalThis.fetch = () => { throw Error('READ_ONLY_NETWORK'); };
    return fn();
  } finally { Object.assign(fs, prior); fs.openSync = open; globalThis.fetch = fetch; }
}
test('empty replay has no baseline and creates no manifest, lock, or fsync', t => {
  const f = fixture(t); assert.equal(typeof journal.readVerifiedPublicLifecycleContext, 'function');
  const result = readOnly(() => journal.readVerifiedPublicLifecycleContext(f));
  assert.deepEqual(result, { schema: 'agyion-public-lifecycle-verified-context-v1', planSha256: f.planSha256,
    status: 'empty', nextStepId: f.plan.steps[0].id, signedFeesStroops: '0', prefix: [], initialEvidence: null, unfinished: null });
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.prefix));
  assert.deepEqual(fs.readdirSync(f.run), []); assert.deepEqual(fs.readdirSync(f.lockRoot), []);
});
test('verified replay rejects policy injection, wrong authority and unsafe private records', t => {
  const f = fixture(t); assert.equal(typeof journal.readVerifiedPublicLifecycleContext, 'function');
  for (const name of ['verifyStateExpectations', 'verifyObservations', 'readOnly', 'getTransaction'])
    assert.throws(() => readOnly(() => journal.readVerifiedPublicLifecycleContext({ ...f, [name]: () => true })), /FIELDS/);
  assert.throws(() => readOnly(() => journal.readVerifiedPublicLifecycleContext({ ...f, planSha256: '11'.repeat(32) })), /PLAN_HASH/);
  fs.chmodSync(f.run, 0o755);
  assert.throws(() => readOnly(() => journal.readVerifiedPublicLifecycleContext(f)), /PRIVATE_DIRECTORY/);
  fs.chmodSync(f.run, 0o700); fs.symlinkSync(path.join(f.lockRoot, 'absent'), path.join(f.run, 'plan.json'));
  assert.throws(() => readOnly(() => journal.readVerifiedPublicLifecycleContext(f)), /RECORD/);
});

// Bounded first-create fixture copied from the shared full journey. Real raw
// XDR, signatures, state, fee and observation policies run. Only the fixed
// seller is replaced by a deterministic unfunded identity. Default substitutes
// executable-byte authentication alone; the opt-in uses pinned local WASM.
const child = String.raw`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mock } from 'node:test';
const [root, home, mode] = process.argv.slice(2);
assert.ok(home && path.isAbsolute(home) && ['unit', 'real'].includes(mode));
const realWasm = mode === 'real';
// The child uses one explicit synthetic clock for signing bounds, persisted
// validation time, ledger headers and transaction metadata. Never real time.
let fixtureNow = 1800001000;
Date.now = () => fixtureNow * 1000;
const url = name => pathToFileURL(path.join(root, 'scripts/lib', name)).href;
const { Account, Address, Keypair, Networks, Operation, SorobanDataBuilder, StrKey, TransactionBuilder, nativeToScVal, xdr } = createRequire(path.join(root, 'app/package.json'))('@stellar/stellar-sdk');
const canonical = v => v && typeof v === 'object' ? Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']'
  : '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}' : JSON.stringify(v);
const sha = v => createHash('sha256').update(v).digest('hex'), digest = v => sha(canonical(v));
const seller = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 121));
const realPlan = await import(url('public-lifecycle-plan.mjs'));
const originalSeller = 'GBDINNMPHA7LWJDAXS3G3NWCOLYLSPCER2Z4HENF2JE3ZKH7TVLF7PBF';
function replaceSeller(value, address) {
  const p = structuredClone(value); p.actors.seller = address;
  for (const s of p.steps) if (s.sourceRole === 'seller') s.sourceAccount = address;
  return p;
}
function validate(p) {
  assert.equal(p.actors.seller, seller.publicKey());
  return realPlan.validatePublicLifecyclePlan(replaceSeller(p, originalSeller));
}
mock.module(url('public-lifecycle-plan.mjs'), { namedExports: {
  buildPublicLifecyclePlan: input => replaceSeller(realPlan.buildPublicLifecyclePlan(input), seller.publicKey()),
  validatePublicLifecyclePlan: validate, hashPublicLifecyclePlan: p => { validate(p); return digest(p); },
} });
if (!realWasm) {
  const readback = await import(url('public-lifecycle-readback.mjs'));
  mock.module(url('public-lifecycle-readback.mjs'), { namedExports: { ...readback,
    verifyPublicLifecycleSnapshot: (a, b) => ({ ...readback.verifyPublicLifecycleState(a, b),
      schema: 'agyion-public-v4-lifecycle-snapshot-v1', codeBytesAuthenticated: true }),
  } });
}
const S = await import(url('public-lifecycle-state.mjs'));
const J = await import(url('public-lifecycle-journal.mjs'));
assert.equal(typeof J.readVerifiedPublicLifecycleContext, 'function');
const { createPublicLifecyclePolicies } = await import(url('public-lifecycle-policies.mjs'));
const { createStateFixture } = await import(pathToFileURL(path.join(root, 'scripts/tests/helpers/public-lifecycle-state-fixture.mjs')).href);
const { createObservationFixture } = await import(pathToFileURL(path.join(root, 'scripts/tests/helpers/public-lifecycle-observation-fixture.mjs')).href);
const f = createStateFixture({ realWasm }), { plan, roles } = f, planSha256 = digest(plan);
const keys = { seller, recipient: f.keys[0], relayer: f.keys[1],
  ...Object.fromEntries(f.credentialRoles.map((r, i) => [r, f.keys[i + 2]])) };
const run = path.join(home, 'run'), lockRoot = path.join(home, 'locks');
for (const dir of [run, lockRoot]) fs.mkdirSync(dir, { mode: 0o700 });
const base = { run, lockRoot, plan, planSha256 };
const int = n => xdr.Int64.fromString(String(n)), b64 = v => v.toXDR('base64');
const addr = a => new Address(a).toScVal(), amount = a => nativeToScVal(BigInt(a), { type: 'i128' });
const cloneAccount = a => xdr.AccountEntry.fromXDR(a.toXDR());
const tree = (target, method, args, children = []) => new xdr.SorobanAuthorizedInvocation({
  function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new xdr.InvokeContractArgs({
    contractAddress: new Address(target).toScAddress(), functionName: method, args })), subInvocations: children,
});
function unsigned(claim) {
  const call = claim.derived.call, args = call.argsXdr.map(v => xdr.ScVal.fromXDR(v, 'base64'));
  const funding = ['create_fade', 'create_pod', 'create_trigger'].includes(call.method);
  const positive = call.method === 'confirm_handoff' && call.handoff.price === '1000000';
  const children = funding ? [tree(plan.assets[0], 'transfer', [addr(call.sourceAccount), addr(plan.contractId), amount('10000000')])]
    : positive ? [tree(plan.assets[0], 'transfer', [addr(plan.actors.recipient), addr(plan.actors.seller), amount('1000000')])] : [];
  const auth = funding || positive || ['claim', 'claim_pod', 'create_mandate', 'revoke_mandate', 'transfer'].includes(call.method)
    ? [new xdr.SorobanAuthorizationEntry({ credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
      rootInvocation: tree(call.target, call.method, args, children) })] : [];
  return new TransactionBuilder(new Account(call.sourceAccount, String(BigInt(claim.binding.sequence) - 1n)),
    { fee: '100', networkPassphrase: Networks.TESTNET }).addOperation(Operation.invokeContractFunction({
      contract: call.target, function: call.method, args, auth })).setSorobanData(new SorobanDataBuilder().setResourceFee('900').build())
    .setTimebounds(0, Math.floor(Date.now() / 1000) + 80).build().toXDR();
}
function stamp(a, ledger, closeTime) {
  a.ext(new xdr.AccountEntryExt(1, new xdr.AccountEntryExtensionV1({ liabilities: new xdr.Liabilities({ buying: int(0), selling: int(0) }),
    ext: new xdr.AccountEntryExtensionV1Ext(2, new xdr.AccountEntryExtensionV2({ numSponsored: 0, numSponsoring: 0, signerSponsoringIDs: [],
      ext: new xdr.AccountEntryExtensionV2Ext(3, new xdr.AccountEntryExtensionV3({ ext: new xdr.ExtensionPoint(0), seqLedger: ledger,
        seqTime: xdr.Uint64.fromString(closeTime) })) })) })));
  return a;
}
function receipt(claim, signedXdr, before, deltas, createdId) {
  const source = plan.steps.find(s => s.id === claim.stepId).sourceRole, ledger = claim.binding.headLedger + 1;
  const closeTime = String(1800000000 + ledger), tx = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);
  const entry = (a, last = ledger) => new xdr.LedgerEntry({ lastModifiedLedgerSeq: last,
    data: xdr.LedgerEntryData.account(a), ext: new xdr.LedgerEntryExt(0) });
  const state = (a, last) => xdr.LedgerEntryChange.ledgerEntryState(entry(a, last));
  const update = a => xdr.LedgerEntryChange.ledgerEntryUpdated(entry(a));
  const current = Object.fromEntries(roles.map(r => [r, xdr.AccountEntry.fromXDR(before[r].accountEntryXdr, 'base64')]));
  const charged = cloneAccount(current[source]); charged.balance(int(BigInt(charged.balance().toString()) - 1000n));
  const advanced = stamp(cloneAccount(charged), ledger, closeTime); advanced.seqNum(int(claim.binding.sequence)); current[source] = advanced;
  const changes = [];
  for (const role of roles) if (BigInt(deltas[role]) !== 0n) {
    const next = cloneAccount(current[role]); next.balance(int(BigInt(next.balance().toString()) + BigInt(deltas[role])));
    changes.push(state(current[role], role === source ? ledger : before[role].lastModifiedLedgerSeq), update(next)); current[role] = next;
  }
  current[source] = cloneAccount(current[source]); current[source].balance(int(BigInt(current[source].balance().toString()) + 600n));
  const after = Object.fromEntries(roles.map(r => [r, { address: plan.actors[r], balance: current[r].balance().toString(),
    sequence: current[r].seqNum().toString(), accountEntryXdr: b64(current[r]),
    lastModifiedLedgerSeq: r === source || BigInt(deltas[r]) !== 0n ? ledger : before[r].lastModifiedLedgerSeq }]));
  const feeEvent = (a, stage) => new xdr.TransactionEvent({ stage, event: new xdr.ContractEvent({ ext: new xdr.ExtensionPoint(0),
    contractId: StrKey.decodeContract(plan.assets[0]), type: xdr.ContractEventType.contract(),
    body: new xdr.ContractEventBody(0, new xdr.ContractEventV0({ topics: [xdr.ScVal.scvSymbol('fee'), addr(plan.actors[source])], data: amount(a) })) }) });
  const rv = createdId === null ? xdr.ScVal.scvVoid() : nativeToScVal(BigInt(createdId), { type: 'u64' });
  const preimage = new xdr.InvokeHostFunctionSuccessPreImage({ returnValue: rv, events: [] });
  const meta = new xdr.TransactionMeta(4, new xdr.TransactionMetaV4({ ext: new xdr.ExtensionPoint(0),
    txChangesBefore: [state(charged), update(advanced)], operations: [new xdr.OperationMetaV2({ ext: new xdr.ExtensionPoint(0), changes, events: [] })],
    txChangesAfter: [], sorobanMeta: new xdr.SorobanTransactionMetaV2({
      ext: new xdr.SorobanTransactionMetaExt(1, new xdr.SorobanTransactionMetaExtV1({ ext: new xdr.ExtensionPoint(0),
        totalNonRefundableResourceFeeCharged: int(100), totalRefundableResourceFeeCharged: int(200), rentFeeCharged: int(50) })), returnValue: rv }),
    events: [feeEvent(1000, xdr.TransactionEventStage.transactionEventStageBeforeAllTxes()),
      feeEvent(-600, xdr.TransactionEventStage.transactionEventStageAfterAllTxes())], diagnosticEvents: [] }));
  const result = new xdr.TransactionResult({ feeCharged: int(400), result: xdr.TransactionResultResult.txSuccess([
    xdr.OperationResult.opInner(xdr.OperationResultTr.invokeHostFunction(xdr.InvokeHostFunctionResult.invokeHostFunctionSuccess(Buffer.from(sha(preimage.toXDR()), 'hex'))))]), ext: new xdr.TransactionResultExt(0) });
  return { after, response: { status: 'SUCCESS', txHash: tx.hash().toString('hex'), ledger, latestLedger: ledger, createdAt: closeTime,
    feeBump: false, envelopeXdr: signedXdr, resultXdr: b64(result), resultMetaXdr: b64(meta) } };
}

const readOnly = READ_ONLY_FUNCTION;
const records = [], accounts = f.accounts(), step = plan.steps[0], binding = f.binding(0, 1000, accounts);
const initialResponse = f.snapshot(), initialHeader = f.header();
const initial = S.initialPublicLifecycleState({ plan, response: initialResponse, zeroBalanceEvidence: null, headerEvidence: initialHeader });
let afterAccounts = accounts;
function evidence(phase) {
  const ledger = phase === 'before' ? 1000 : 1001;
  const response = f.snapshot(ledger, records, afterAccounts), headerEvidence = f.header(ledger);
  const state = S.derivePublicLifecycleState({ plan, initial, prefix: [], stepId: step.id, binding, phase,
    inclusion: phase === 'before' ? null : { status: 'SUCCESS', ledger: 1001, createdId: '1' }, response, headerEvidence });
  return { snapshot: { expected: state.expected, response, headerEvidence }, observations: createObservationFixture({
    plan, credentialSigners: keys, stepId: step.id, phase, state, currentSnapshotResponse: response, headerEvidence }) };
}
const policies = createPublicLifecyclePolicies(); let capturedClaim, response, sends = 0, signs = 0;
const beforeEvidence = evidence('before');
const result = await J.executePublicLifecycleStep({ ...base, ...policies, stepId: step.id, binding, evidence: beforeEvidence,
  prepare: async ({ claim }) => { capturedClaim = claim; return { envelopeXdr: unsigned(claim) }; },
  sign: async ({ unsignedXdr }) => { signs++; const tx = TransactionBuilder.fromXDR(unsignedXdr, Networks.TESTNET); tx.sign(seller); return tx.toXDR(); },
  sendTransaction: async signed => { sends++; f.advance(records, 0); const built = receipt(capturedClaim, signed, accounts,
    { seller: '-10000000', recipient: '0', relayer: '0' }, '1'); afterAccounts = built.after; response = built.response; },
  getTransaction: async () => response, collectEvidence: async () => evidence('after'),
});
assert.equal(result.status, 'complete'); assert.equal(sends, 1); assert.equal(signs, 1);
const file = suffix => path.join(run, step.id + '.' + suffix + '.json');
const originals = Object.fromEntries(['claim', 'attempt', 'inclusion', 'completion'].map(s => [s, fs.readFileSync(file(s))]));
const allBytes = () => Object.fromEntries(fs.readdirSync(run).map(n => [n, fs.readFileSync(path.join(run, n)).toString('hex')]));
const bytes = allBytes();
const sourceDirectory = path.join(lockRoot, fs.readdirSync(lockRoot)[0]);
// A crash after durable completion but before release must stay unreleased.
fs.unlinkSync(path.join(sourceDirectory, '000001.release.json'));
const replay = () => readOnly(() => J.readVerifiedPublicLifecycleContext(base));
const ready = replay();
assert.equal(ready.status, 'ready'); assert.equal(ready.nextStepId, plan.steps[1].id);
assert.equal(ready.signedFeesStroops, '1000'); assert.equal(ready.unfinished, null);
assert.equal(ready.prefix.length, 1); assert.equal(ready.prefix[0].fee.netFee, '400');
assert.equal(ready.prefix[0].after.liabilities[0].amount, '10000000');
assert.deepEqual(ready.initialEvidence, beforeEvidence.snapshot);
assert.deepEqual(allBytes(), bytes); assert.equal(fs.existsSync(path.join(sourceDirectory, '000001.release.json')), false);
assert.throws(() => { ready.prefix[0].fee.netFee = '0'; }, TypeError);
assert.throws(() => { ready.initialEvidence.response.entries[0].val = ''; }, TypeError);
assert.throws(() => { ready.prefix.push({}); }, TypeError);
const completed = JSON.parse(originals.completion);
for (const mutate of [v => { v.evidence.snapshot.response.entries[0].val += '\n'; },
  v => { v.verified.fee.netFee = '0'; }, v => { v.evidence.snapshot.expected.initialSurplusStroops = '1'; }]) {
  const changed = structuredClone(completed); mutate(changed); fs.writeFileSync(file('completion'), JSON.stringify(changed));
  assert.throws(replay, /LIFECYCLE_STATE_XDR|COMPLETION_EVIDENCE|LIFECYCLE_POLICY_EXPECTED/);
  fs.writeFileSync(file('completion'), originals.completion);
}
// Rebind the altered raw receipt and completion hashes so the real fee gate,
// not a stale digest, must reject the invented charged fee.
const badInclusion = JSON.parse(originals.inclusion), badCompletion = JSON.parse(originals.completion);
const badFee = xdr.TransactionResult.fromXDR(badInclusion.response.resultXdr, 'base64'); badFee.feeCharged(int(401));
badInclusion.response.resultXdr = b64(badFee); badCompletion.inclusionSha256 = digest(badInclusion);
fs.writeFileSync(file('inclusion'), JSON.stringify(badInclusion)); fs.writeFileSync(file('completion'), JSON.stringify(badCompletion));
assert.throws(replay, /PUBLIC_LIFECYCLE_FEES_RESULT_FEE/);
fs.writeFileSync(file('inclusion'), originals.inclusion); fs.writeFileSync(file('completion'), originals.completion);
// Completion is not inferred from an included SUCCESS or retained flags.
fs.unlinkSync(file('completion'));
let context = replay();
assert.equal(context.status, 'included'); assert.equal(context.nextStepId, null); assert.equal(context.prefix.length, 0);
assert.deepEqual(context.unfinished, { stepId: step.id, status: 'included', hash: result.hash, ledger: 1001, createdId: '1' });
const failed = JSON.parse(originals.inclusion), failedResult = xdr.TransactionResult.fromXDR(failed.response.resultXdr, 'base64');
failedResult.result(xdr.TransactionResultResult.txFailed([xdr.OperationResult.opInner(xdr.OperationResultTr.invokeHostFunction(xdr.InvokeHostFunctionResult.invokeHostFunctionTrapped()))]));
failed.status = 'FAILED'; failed.createdId = null; failed.response.status = 'FAILED'; failed.response.resultXdr = b64(failedResult);
fs.writeFileSync(file('inclusion'), JSON.stringify(failed));
context = replay(); assert.equal(context.status, 'failed'); assert.equal(context.nextStepId, null); assert.equal(context.unfinished.createdId, null);
fs.writeFileSync(file('inclusion'), originals.inclusion);
fs.unlinkSync(file('inclusion'));
context = replay(); assert.equal(context.status, 'pending'); assert.equal(context.nextStepId, null); assert.equal(context.unfinished.hash, result.hash);
assert.equal(context.signedFeesStroops, '1000'); assert.equal(context.unfinished.ledger, null);
fs.unlinkSync(file('attempt'));
context = replay(); assert.equal(context.status, 'claimed'); assert.equal(context.nextStepId, null); assert.equal(context.signedFeesStroops, '0');
assert.equal(context.unfinished.hash, null); assert.deepEqual(context.initialEvidence, beforeEvidence.snapshot);
// A claim written before verification failed is not a verified baseline.
for (const mutate of [v => { v.evidence.snapshot.response.entries[0].val += '\n'; },
  v => { v.evidence.observations[Object.keys(v.evidence.observations)[0]] = { passed: true }; }]) {
  const changed = JSON.parse(originals.claim); mutate(changed); fs.writeFileSync(file('claim'), JSON.stringify(changed));
  assert.throws(replay, /LIFECYCLE_STATE_XDR|LIFECYCLE_OBSERVATION_INPUT/);
}
fs.writeFileSync(file('claim'), originals.claim);
fs.unlinkSync(file('claim'));
context = replay(); assert.equal(context.status, 'empty'); assert.equal(context.initialEvidence, null); assert.equal(context.prefix.length, 0);
assert.equal(context.nextStepId, plan.steps[0].id); assert.equal(context.signedFeesStroops, '0');
console.log(JSON.stringify({ statuses: ['empty', 'claimed', 'pending', 'included', 'failed', 'ready'],
  frozen: true, rawForgeryRejected: true, writes: 0, fsyncs: 0, network: 0, netFee: '400',
  codeAuthentication: realWasm ? 'pinned local WASM' : 'unit-only executable-byte double' }));
`;
for (const realWasm of [false, true]) {
  test(realWasm ? 'local pinned WASM: verified replay authenticates raw first-create evidence without writes'
    : 'synthetic first-create replay gates every retained phase, raw evidence and frozen context; code-auth-only double',
  { skip: realWasm && process.env.AGYION_LIFECYCLE_REAL_DECODERS !== '1', timeout: 90000 }, async t => {
    const f = fixture(t), home = path.dirname(f.run), childHome = path.join(home, 'child'); fs.mkdirSync(childHome, { mode: 0o700 });
    const script = path.join(home, 'child.mjs'); fs.writeFileSync(script, child.replace('READ_ONLY_FUNCTION', readOnly.toString()), { mode: 0o600 });
    const result = await promisify(execFile)(process.execPath, ['--experimental-test-module-mocks', script, root, childHome, realWasm ? 'real' : 'unit'], { timeout: 80000, maxBuffer: 1024 * 1024 });
    const evidence = JSON.parse(result.stdout.trim());
    assert.deepEqual(evidence.statuses, ['empty', 'claimed', 'pending', 'included', 'failed', 'ready']);
    assert.equal(evidence.network, 0); assert.equal(evidence.writes, 0); assert.equal(evidence.netFee, '400');
    t.diagnostic(JSON.stringify(evidence));
  });
}
