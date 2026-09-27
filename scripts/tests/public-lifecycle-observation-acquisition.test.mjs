import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire, registerHooks } from 'node:module';
import { createStateFixture } from './helpers/public-lifecycle-state-fixture.mjs';
const { Account, Address, Operation, SorobanDataBuilder, TransactionBuilder, nativeToScVal, xdr } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const real = process.env.PUBLIC_LIFECYCLE_OBSERVATION_ACQUISITION_WASM === '1';
const readbackURL = new URL('../lib/public-lifecycle-readback.mjs', import.meta.url).href;
// Default replaces ONLY executable-byte authentication. All account, accounting,
// header, state provenance, request and raw observation policies remain real.
const hook = registerHooks({ resolve(specifier, context, next) {
  if (!real && specifier === './public-lifecycle-readback.mjs' && /public-lifecycle-(state|observations|policies|observation-acquisition)\.mjs$/.test(context.parentURL ?? '')) return { url: 'data:text/javascript,' + encodeURIComponent(`export * from ${JSON.stringify(readbackURL)}; import {verifyPublicLifecycleState} from ${JSON.stringify(readbackURL)}; export function verifyPublicLifecycleSnapshot(a,b){return {...verifyPublicLifecycleState(a,b),schema:'agyion-public-v4-lifecycle-snapshot-v1',codeBytesAuthenticated:true};}`), shortCircuit: true };
  return next(specifier, context);
} });
const { acquirePublicLifecycleObservationCase: acquire } = await import('../lib/public-lifecycle-observation-acquisition.mjs');
const S = await import('../lib/public-lifecycle-state.mjs');
const O = await import('../lib/public-lifecycle-observations.mjs');
const { createPublicLifecyclePolicies } = await import('../lib/public-lifecycle-policies.mjs');
const { acquirePublicLifecycleBaseline } = await import('../lib/public-lifecycle-baseline.mjs');
const { createPublicLifecycleRpc } = await import('../lib/public-lifecycle-rpc.mjs');
const { bindPublicLifecycleCall } = await import('../lib/public-lifecycle-call.mjs');
hook.deregister();
const f = createStateFixture({ realWasm: real }), { plan, b64 } = f, HEAD = 1000, NOW = 1800001000, MAX = 2 * 1024 * 1024;
const clone = structuredClone, sha = v => createHash('sha256').update(v).digest('hex');
const canonical = v => v && typeof v === 'object' ? Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' : '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}' : JSON.stringify(v);
const fail = code => e => { assert.equal(e.message, `LIFECYCLE_OBSERVATION_ACQUISITION_${code}`); assert.equal(e.cause, undefined); return true; };
function header(head) {
  const h = xdr.LedgerHeader.fromXDR(f.header(head).headerXdr, 'base64'); h.ledgerVersion(28); h.scpValue().closeTime(xdr.Uint64.fromString(String(NOW + (head - HEAD) * 5)));
  const hash = sha(h.toXDR()), wrapper = new xdr.LedgerHeaderHistoryEntry({ hash: Buffer.from(hash, 'hex'), header: h, ext: new xdr.LedgerHeaderHistoryEntryExt(0) });
  const meta = new xdr.LedgerCloseMeta(0, new xdr.LedgerCloseMetaV0({ ledgerHeader: wrapper, txSet: new xdr.TransactionSet({ previousLedgerHash: Buffer.alloc(32), txes: [] }), txProcessing: [], upgradesProcessing: [], scpInfo: [] }));
  return { id: hash, sequence: head, protocolVersion: 28, closeTime: h.scpValue().closeTime().toString(), headerXdr: b64(h), metadataXdr: b64(meta) };
}
function snapshot(head, present = true) { const r = f.snapshot(head); if (!present) r.entries.splice(6, 1); return r; }
function zero(head) {
  const entries = f.snapshot(head).entries, data = new SorobanDataBuilder().setResources(20000, 0, 0).setResourceFee('700').setReadOnly([entries[2], entries[6]].map(r => xdr.LedgerKey.fromXDR(r.key, 'base64'))).build();
  return { latestLedger: head, transactionData: b64(data), minResourceFee: '700', results: [{ xdr: b64(nativeToScVal(0n, { type: 'i128' })), auth: [] }], events: [], stateChanges: [] };
}
function fixture({ head = HEAD, present = true, error = 3, simulationHead = head, response = snapshot(head, present), onCall, events } = {}) {
  const calls = [], values = { getNetwork: { passphrase: plan.networkPassphrase, protocolVersion: 28 }, getLedgerEntries: { latestLedger: response.latestLedger, entries: response.entries.map(({ val, ...r }) => ({ ...r, xdr: val })) }, getLatestLedger: header(head) };
  const rpc = createPublicLifecycleRpc({ fetch: async (url, init) => {
    assert.equal(url, 'https://soroban-testnet.stellar.org'); assert.equal(init.redirect, 'manual'); const q = JSON.parse(init.body); calls.push(clone(q)); await onCall?.(q, values);
    let result = values[q.method];
    if (q.method === 'simulateTransaction') { const op = xdr.TransactionEnvelope.fromXDR(q.params.transaction, 'base64').v1().tx().operations()[0].body().invokeHostFunctionOp(); result = op.hostFunction().invokeContract().functionName().toString() === 'balance' ? zero(head) : { latestLedger: simulationHead, error: `HostError: Error(Contract, #${error})`, ...(events ? { events } : {}) }; }
    assert.ok(result, q.method); return new Response(JSON.stringify({ jsonrpc: '2.0', id: q.id, result }));
  } });
  return { calls, values, rpc };
}
async function boot({ head = HEAD, present = true } = {}) {
  const capture = fixture({ head, present }), before = await acquirePublicLifecycleBaseline({ plan, rpc: capture.rpc });
  const initial = S.initialPublicLifecycleState({ plan, response: before.acquisition.response, headerEvidence: before.acquisition.headerEvidence, zeroBalanceEvidence: before.zeroBalanceEvidence });
  const binding = f.binding(0, head, f.accounts()), state = S.derivePublicLifecycleState({ plan, initial, prefix: [], stepId: plan.steps[0].id, binding, phase: 'before', inclusion: null, response: before.acquisition.response, headerEvidence: before.acquisition.headerEvidence });
  return { before, initial, binding, state };
}
const basic = ({ before, state }, rpc) => ({ plan, state, before, observationKind: 'creation-nonpositive-amount', caseId: 'fade-zero', rpc });
function afterOf(result) { const batch = result.snapshots[result.case.afterSnapshot]; return { acquisition: { schema: 'agyion-public-lifecycle-acquisition-v1', planSha256: result.planSha256, response: batch.response, headerEvidence: batch.headerEvidence, raw: result.captures.after.raw }, zeroBalanceEvidence: batch.zeroBalanceEvidence, zeroRead: result.captures.after.zeroRead }; }

test('one fixed unsigned case preserves raw evidence, full projections and immutable output', async t => {
  t.mock.method(Date, 'now', () => NOW * 1000); const b = await boot(), fx = fixture(), input = basic(b, fx.rpc), original = JSON.stringify(b.before);
  const out = await acquire(input);
  assert.deepEqual(fx.calls.map(q => q.method), ['simulateTransaction', 'getNetwork', 'getLedgerEntries', 'getLatestLedger']);
  assert.equal(out.schema, 'agyion-public-lifecycle-observation-acquisition-v1'); assert.equal(out.case.caseId, 'fade-zero'); assert.equal(out.case.ledger, HEAD); assert.equal(out.case.timestamp, String(NOW));
  const tx = xdr.TransactionEnvelope.fromXDR(out.case.request.envelopeXdr, 'base64').v1(); assert.equal(tx.signatures().length, 0); assert.equal(tx.tx().fee(), 100); assert.equal(tx.tx().ext().switch(), 0); assert.equal(tx.tx().seqNum().toString(), '11'); assert.equal(tx.tx().cond().timeBounds().maxTime().toString(), String(NOW + 90));
  assert.equal(out.case.request.authMode, 'record'); assert.deepEqual(fx.calls[0].params, { transaction: out.case.request.envelopeXdr, authMode: 'record' });
  assert.equal(Object.keys(out.snapshots).length, 1); assert.deepEqual(out.captures.before.raw, b.before.acquisition.raw); assert.deepEqual(afterOf(out), b.before); assert.equal(JSON.stringify(b.before), original);
  assert.deepEqual(out.timing, { startedAtSeconds: NOW, responseValidatedAtSeconds: NOW, completedAtSeconds: NOW }); assert.ok(Object.isFrozen(out.captures.after.raw.entries.entries[0])); assert.equal(out.verified, undefined);
});
test('forged state and mutated raw projection refuse without external calls', async t => {
  t.mock.method(Date, 'now', () => NOW * 1000); const b = await boot();
  for (const change of [v => v.state = clone(v.state), v => v.before.acquisition.raw.entries.entries[0].xdr += '\n', v => v.before.acquisition.response.entries[7].val += '\n', v => v.before.zeroBalanceEvidence = {}]) {
    const fx = fixture(), input = { ...basic(b, fx.rpc), before: clone(b.before) }; change(input); await assert.rejects(acquire(input), /^Error: LIFECYCLE_OBSERVATION_ACQUISITION_[A-Z_]+$/); assert.equal(fx.calls.length, 0);
  }
});
test('head drift is allowed only for an unchanged intent and two-ledger bracket', async t => {
  t.mock.method(Date, 'now', () => NOW * 1000); const b = await boot();
  const fx = fixture({ head: HEAD + 2, simulationHead: HEAD + 1 }); const out = await acquire(basic(b, fx.rpc)); assert.equal(out.case.ledger, HEAD + 1); assert.equal(out.snapshots[out.case.afterSnapshot].response.latestLedger, HEAD + 2);
  for (const options of [{ head: HEAD + 3 }, { head: HEAD, simulationHead: HEAD - 1 }]) { const bad = fixture(options); await assert.rejects(acquire(basic(b, bad.rpc)), fail('BRACKET')); }
});
test('full raw zero replay is mandatory and after missing balance stays same-head', async t => {
  t.mock.method(Date, 'now', () => NOW * 1000); const b = await boot({ present: false }), fx = fixture({ present: false }); const out = await acquire(basic(b, fx.rpc));
  assert.deepEqual(fx.calls.map(q => q.method), ['simulateTransaction', 'getNetwork', 'getLedgerEntries', 'getLatestLedger', 'simulateTransaction']); assert.ok(out.captures.after.zeroRead); assert.equal(out.snapshots[out.case.afterSnapshot].zeroBalanceEvidence.ledger, HEAD);
  for (const change of [v => v.zeroRead = null, v => v.zeroRead.response.latestLedger++, v => v.zeroRead.response.results[0].auth.push('AAAA')]) { const before = clone(b.before); change(before); const q = fixture(); await assert.rejects(acquire({ ...basic(b, q.rpc), before }), /^Error: LIFECYCLE_OBSERVATION_ACQUISITION_[A-Z_]+$/); assert.equal(q.calls.length, 0); }
});
test('unsupported cases and capabilities never reach transport', async t => {
  t.mock.method(Date, 'now', () => NOW * 1000); const b = await boot();
  for (const change of [v => v.caseId = 'unknown', v => v.observationKind = 'initial-reviewed-code-and-empty-accounting', v => v.phase = 'after', v => v.before.acquisition.raw.history = {}, v => v.observationCredential = 3]) {
    const fx = fixture(), input = { ...basic(b, fx.rpc), before: clone(b.before) }; change(input); await assert.rejects(acquire(input), /^Error: LIFECYCLE_OBSERVATION_ACQUISITION_[A-Z_]+$/); assert.equal(fx.calls.length, 0);
  }
});
test('the sole initial proof is exact, awaited once, and expires without a simulation', async t => {
  let now = NOW; t.mock.method(Date, 'now', () => now * 1000); const b = await boot(), key = f.keys[3]; let credentials = 0;
  const credential = async input => { credentials++; assert.equal(input.state, b.state); assert.equal(input.ledger, HEAD); const c = O.publicLifecycleObservationIntent({ plan, stepId: input.stepId, observationKind: input.observationKind, caseId: input.caseId, ledger: input.ledger, timestamp: input.timestamp, recordAnchors: input.state.recordAnchors }).credential; return { role: c.role, publicKey: key.publicKey(), payloadSha256: sha(Buffer.from(c.payloadHex, 'hex')), signatureHex: key.sign(Buffer.from(c.payloadHex, 'hex')).toString('hex') }; };
  const fx = fixture({ error: 14 }), input = { ...basic(b, fx.rpc), observationKind: 'unsupported-asset-valid-creation-proof', caseId: 'pod', observationCredential: credential };
  const out = await acquire(input); assert.equal(credentials, 1); assert.equal(out.case.response.error, 'HostError: Error(Contract, #14)');
  const expired = fixture({ error: 14 }); await assert.rejects(acquire({ ...input, rpc: expired.rpc, observationCredential: async value => { const result = await credential(value); now += 90; return result; } }), fail('TIME')); assert.equal(credentials, 2); assert.equal(expired.calls.length, 0);
});
test('head-sensitive prepared intent cannot be silently regenerated', async t => {
  t.mock.method(Date, 'now', () => NOW * 1000); const b = await boot(), fx = fixture({ head: HEAD + 1, error: 12 });
  await assert.rejects(acquire({ ...basic(b, fx.rpc), observationKind: 'trigger-current-past-or-max-deadline', caseId: 'current' }), fail('INTENT_DRIFT')); assert.equal(fx.calls.length, 1);
});
test('unrelated account movement, expired TTL and wrong simulation error fail closed', async t => {
  t.mock.method(Date, 'now', () => NOW * 1000); const b = await boot();
  for (const mutate of [r => { const a = xdr.LedgerEntryData.fromXDR(r.entries[8].val, 'base64'); a.account().balance(xdr.Int64.fromString('1000000001')); r.entries[8].val = b64(a); }, r => r.entries[5].liveUntilLedgerSeq = 999]) {
    const response = snapshot(HEAD); mutate(response); const fx = fixture({ response }); await assert.rejects(acquire(basic(b, fx.rpc)), /^Error: LIFECYCLE_OBSERVATION_ACQUISITION_[A-Z_]+$/);
  }
  const wrong = fixture({ error: 12 }); await assert.rejects(acquire(basic(b, wrong.rpc)), fail('CASE')); assert.equal(wrong.calls.length, 1);
});
test('response and readback expiry cannot return accepted evidence', async t => {
  let now = NOW; t.mock.method(Date, 'now', () => now * 1000); const b = await boot();
  for (const when of ['simulateTransaction', 'getLatestLedger']) { now = NOW; const fx = fixture({ onCall: q => { if (q.method === when) now = NOW + 90; } }); await assert.rejects(acquire(basic(b, fx.rpc)), fail('TIME')); assert.equal(fx.calls.filter(q => q.method === 'simulateTransaction').length, 1); }
});
test('hostile and reused mutable errors are replaced by fresh fixed refusals', async t => {
  t.mock.method(Date, 'now', () => NOW * 1000); let prior; try { await acquire({}); } catch (e) { prior = e; } assert.ok(prior); prior.message = 'PRIVATE_SECRET'; prior.cause = Error('PRIVATE_SECRET');
  for (const thrown of [prior, new Proxy({}, { getPrototypeOf() { throw Error('PRIVATE_SECRET'); } })]) { const hostile = new Proxy({}, { ownKeys() { throw thrown; } }); await assert.rejects(acquire(hostile), e => { assert.notEqual(e, thrown); assert.match(e.message, /^LIFECYCLE_OBSERVATION_ACQUISITION_[A-Z_]+$/); assert.equal(e.cause, undefined); return true; }); }
});
test('native abort handling ignores caller-overridden methods including final cleanup', async t => {
  t.mock.method(Date, 'now', () => NOW * 1000); const b = await boot(), fx = fixture(), controller = new AbortController(); let touched = 0;
  Object.defineProperties(controller.signal, { aborted: { get() { touched++; throw Error('PRIVATE_SECRET'); } }, addEventListener: { value() { touched++; throw Error('PRIVATE_SECRET'); } }, removeEventListener: { value() { touched++; throw Error('PRIVATE_SECRET'); } } });
  const out = await acquire({ ...basic(b, fx.rpc), signal: controller.signal }); assert.equal(out.case.caseId, 'fade-zero'); assert.equal(touched, 0);
  controller.abort(); const next = fixture(); await assert.rejects(acquire({ ...basic(b, next.rpc), signal: controller.signal }), fail('ABORTED')); assert.equal(next.calls.length, 0);
});
test('cancellation during a pending simulation stops subsequent reads and handles late completion', async t => {
  t.mock.method(Date, 'now', () => NOW * 1000); const b = await boot(), controller = new AbortController(); let release, entered; const started = new Promise(r => { entered = r; }), calls = [];
  const pending = acquire({ ...basic(b, { async request(method) { calls.push(method); entered(); return new Promise(r => { release = r; }); } }), signal: controller.signal }); await started; controller.abort(); await assert.rejects(pending, fail('ABORTED')); release({ latestLedger: HEAD, error: 'HostError: Error(Contract, #3)' }); await Promise.resolve(); assert.deepEqual(calls, ['simulateTransaction']);
});
// Independent initial-case/error table. Requests are generated by the acquirer,
// never by createObservationFixture or a mocked observation policy.
const initialCases = [
  ['creation-nonpositive-amount', ['fade-zero', 'fade-negative', 'pod-zero', 'pod-negative', 'trigger-zero', 'trigger-negative'], 3],
  ['fade-floor-below-pot', ['floor'], 3], ['fade-zero-slope-denominator', ['denominator'], 4],
  ['fade-zero-duration-or-handoff', ['duration', 'handoff'], 4], ['fade-excessive-span', ['duration', 'handoff'], 12],
  ['zero-credential-key', ['fade', 'pod', 'trigger', 'mandate'], 7], ['trigger-current-past-or-max-deadline', ['current', 'past', 'max'], 12],
  ['trigger-kernel-or-asset-beneficiary', ['kernel', 'asset'], 12], ['unsupported-asset-valid-creation-proof', ['fade', 'pod', 'trigger'], 14],
];
function stateFor(before) {
  const { response, headerEvidence } = before.acquisition, initial = S.initialPublicLifecycleState({ plan, response, headerEvidence, zeroBalanceEvidence: before.zeroBalanceEvidence });
  const binding = f.binding(0, response.latestLedger, f.accounts());
  return { initial, binding, state: S.derivePublicLifecycleState({ plan, initial, prefix: [], stepId: plan.steps[0].id, binding, phase: 'before', inclusion: null, response, headerEvidence }) };
}
function phaseGate(before, rawEvidence) {
  const derived = stateFor(before), { state, initial, binding } = derived;
  const scope = { plan, planSha256: state.planSha256, stepId: state.stepId, phase: 'before', claim: { stepId: state.stepId, binding }, prefix: [], initialEvidence: { expected: initial.expected, response: before.acquisition.response, headerEvidence: before.acquisition.headerEvidence }, currentInclusion: null, snapshotResponse: before.acquisition.response, headerEvidence: before.acquisition.headerEvidence, beforeSnapshot: null };
  const policies = createPublicLifecyclePolicies(); policies.verifyStateExpectations({ ...scope, expected: state.expected });
  return { result: policies.verifyObservations({ ...scope, snapshot: state.snapshot, currentFee: null, rawEvidence }), scope, derived };
}
async function initialJourney(t, drift) {
  let seconds = NOW; t.mock.method(Date, 'now', () => seconds * 1000); let before = (await boot({ present: false })).before;
  const raw = Object.fromEntries(plan.preflightObservations.map(k => [k, { cases: [] }])), batches = {}, captures = [], calls = []; let credentials = 0, index = 0;
  for (const [observationKind, ids, error] of initialCases) for (const caseId of ids) {
    const { state } = stateFor(before), from = before.acquisition.response.latestLedger, afterHead = from + (drift ? 1 : 0);
    const fx = fixture({ head: afterHead, simulationHead: from, present: false, error, onCall: q => { if (q.method === 'simulateTransaction') assertInitialRequest(q.params, observationKind, caseId, from); if (q.method === 'getLatestLedger') seconds = NOW + (afterHead - HEAD) * 5; } });
    const out = await acquire({ plan, before, state, observationKind, caseId, rpc: fx.rpc, observationCredential: async input => {
      credentials++; assert.equal(observationKind, 'unsupported-asset-valid-creation-proof'); assert.equal(caseId, 'pod'); assert.equal(input.state, state);
      const c = O.publicLifecycleObservationIntent({ plan, stepId: state.stepId, observationKind, caseId, ledger: from, timestamp: input.timestamp, recordAnchors: state.recordAnchors }).credential, key = f.keys[3];
      return { role: 'podTimelock', publicKey: key.publicKey(), payloadSha256: sha(Buffer.from(c.payloadHex, 'hex')), signatureHex: key.sign(Buffer.from(c.payloadHex, 'hex')).toString('hex') };
    } });
    assert.ok(Buffer.byteLength(canonical(out)) <= MAX); assert.equal(out.case.response.error, `HostError: Error(Contract, #${error})`); raw[observationKind].cases.push(out.case); Object.assign(batches, out.snapshots); captures.push(out.captures); calls.push(...fx.calls); before = afterOf(out); index++;
  }
  assert.equal(index, 24); assert.equal(credentials, 1); const negativeCalls = calls.filter(q => q.method === 'simulateTransaction' && xdr.TransactionEnvelope.fromXDR(q.params.transaction, 'base64').v1().tx().operations()[0].body().invokeHostFunctionOp().hostFunction().invokeContract().functionName().toString() !== 'balance'); assert.equal(negativeCalls.length, 24);
  raw[plan.preflightObservations[0]].snapshots = batches;
  // A final independent acquisition is the authority for first-claim state.
  const last = fixture({ head: before.acquisition.response.latestLedger, present: false }), finalBefore = await acquirePublicLifecycleBaseline({ plan, rpc: last.rpc });
  const verified = phaseGate(finalBefore, raw); assert.equal(verified.result.evidence.length, 11); assert.equal(Object.keys(batches).length, drift ? 25 : 1);
  const claimShape = { schema: 'agyion-public-lifecycle-journal-v1', planSha256: verified.derived.state.planSha256, stepId: plan.steps[0].id, binding: verified.derived.binding, derived: bindPublicLifecycleCall({ plan, stepId: plan.steps[0].id, headLedger: verified.derived.binding.headLedger }), predecessors: [], evidence: { snapshot: { expected: verified.derived.state.expected, response: finalBefore.acquisition.response, headerEvidence: finalBefore.acquisition.headerEvidence }, observations: raw }, claimedAtSeconds: seconds };
  const journalBytes = Buffer.byteLength(canonical(claimShape) + '\n'), rawCaptureBytes = Buffer.byteLength(canonical(captures)); assert.ok(journalBytes <= MAX);
  t.diagnostic(JSON.stringify({ mode: real ? 'pinned-wasm' : 'executable-auth-only-double', cases: 24, heads: Object.keys(batches).length, phaseLedgerSpan: finalBefore.acquisition.response.latestLedger - HEAD, journalBytes, rawCaptureBytes, perCaseSpan: drift ? 1 : 0 }));
  for (const mutate of [v => v['creation-nonpositive-amount'].cases.pop(), v => v['creation-nonpositive-amount'].cases.reverse(), v => v['creation-nonpositive-amount'].cases[0].response.error = 'HostError: Error(Contract, #12)']) { const bad = clone(raw); mutate(bad); assert.throws(() => phaseGate(finalBefore, bad)); }
  const tooOld = clone(raw); tooOld['creation-nonpositive-amount'].cases[0].ledger = HEAD - 1; tooOld['creation-nonpositive-amount'].cases[0].response.latestLedger = HEAD - 1; assert.throws(() => phaseGate(finalBefore, tooOld));
  if (!drift) {
    const oversized = clone(raw), event = diagnostic(36000);
    for (const family of Object.values(oversized)) for (const c of family.cases) { c.response.events = [event, event]; O.verifyPublicLifecycleObservationCase({ plan, stepId: plan.steps[0].id, observationKind: Object.keys(oversized).find(k => oversized[k] === family), caseId: c.caseId, ledger: c.ledger, timestamp: c.timestamp, recordAnchors: [] }, { request: c.request, response: c.response }); }
    assert.ok(Buffer.byteLength(canonical({ ...claimShape, evidence: { ...claimShape.evidence, observations: oversized } }) + '\n') > MAX); assert.throws(() => phaseGate(finalBefore, oversized), /LIFECYCLE_POLICY_DATA/);
  }
  return { raw, finalBefore, claimShape };
}
test('all24 acquired cases pass actual phase policies at one head', async t => { await initialJourney(t, false); });
test('all24 acquired cases at25 heads obey per-case windows and final phase replay', async t => { await initialJourney(t, true); });
test('abort occurring during capability validation cannot be missed before listener setup', async t => {
  t.mock.method(Date, 'now', () => NOW * 1000); const b = await boot(), controller = new AbortController(), fx = fixture();
  const rpc = new Proxy(fx.rpc, { getOwnPropertyDescriptor(target, key) { controller.abort(); return Reflect.getOwnPropertyDescriptor(target, key); } });
  await assert.rejects(acquire({ ...basic(b, rpc), signal: controller.signal }), fail('ABORTED')); assert.equal(fx.calls.length, 0);
});
test('each after-read deadline stops all subsequent external reads immediately', async t => {
  let now = NOW; t.mock.method(Date, 'now', () => now * 1000); const b = await boot();
  for (const [at, count] of [['getNetwork', 2], ['getLedgerEntries', 3], ['getLatestLedger', 4]]) { now = NOW; const fx = fixture({ onCall: q => { if (q.method === at) now = NOW + 90; } }); await assert.rejects(acquire(basic(b, fx.rpc)), fail('TIME')); assert.equal(fx.calls.length, count); }
});
function diagnostic(length = 0) { return b64(new xdr.DiagnosticEvent({ inSuccessfulContractCall: false, event: new xdr.ContractEvent({ ext: new xdr.ExtensionPoint(0), contractId: null, type: xdr.ContractEventType.diagnostic(), body: new xdr.ContractEventBody(0, new xdr.ContractEventV0({ topics: [], data: xdr.ScVal.scvString('x'.repeat(length)) })) }) })); }
test('individually bounded raw captures cannot overflow the combined per-case output', async t => {
  t.mock.method(Date, 'now', () => NOW * 1000); const b = await boot(), before = clone(b.before);
  const tx = new TransactionBuilder(new Account(plan.actors.seller, '10'), { fee: '100', networkPassphrase: plan.networkPassphrase }).addOperation(Operation.invokeContractFunction({ contract: plan.assets[0], function: 'balance', args: [new Address(plan.contractId).toScVal()], auth: [] })).setTimebounds(0, NOW + 90).build().toEnvelope();
  const meta = xdr.LedgerCloseMeta.fromXDR(before.acquisition.raw.latest.metadataXdr, 'base64'); meta.v0().txSet().txes(Array(Math.ceil(1300000 / (tx.toXDR().length * 4 / 3))).fill(tx)); before.acquisition.raw.latest.metadataXdr = b64(meta);
  assert.ok(Buffer.byteLength(canonical(before)) < MAX); const fx = fixture({ events: Array(20).fill(diagnostic(36000)) }); await assert.rejects(acquire({ ...basic(b, fx.rpc), before }), fail('BOUNDS')); assert.equal(fx.calls.length, 4);
});
test('input and raw response limits fail without leaking or making further calls', async t => {
  t.mock.method(Date, 'now', () => NOW * 1000); const b = await boot(), fx = fixture(), before = clone(b.before); before.acquisition.raw.network.passphrase = 'x'.repeat(MAX + 1);
  await assert.rejects(acquire({ ...basic(b, fx.rpc), before }), fail('BOUNDS')); assert.equal(fx.calls.length, 0);
  const calls = [], rpc = { async request(method) { calls.push(method); return { latestLedger: HEAD, error: 'x'.repeat(MAX + 1) }; } }; await assert.rejects(acquire(basic(b, rpc)), fail('BOUNDS')); assert.deepEqual(calls, ['simulateTransaction']);
});
test('funded record-mode cases reject omitted Balance without invoking a zero getter', async t => {
  t.mock.method(Date, 'now', () => NOW * 1000); const j = f.journey(S, 2), stage = j.stages[1].before, head = stage.response.latestLedger;
  const capture = fixture({ head, response: stage.response }), before = await acquirePublicLifecycleBaseline({ plan, rpc: capture.rpc });
  const state = S.derivePublicLifecycleState({ ...stage, response: before.acquisition.response, headerEvidence: before.acquisition.headerEvidence }); assert.equal(state.expected.fundedHistory, true);
  const response = clone(stage.response); response.entries.splice(6, 1); const missing = fixture({ head, error: 12, response });
  await assert.rejects(acquire({ plan, state, before, observationKind: 'fade-kernel-or-asset-claimant-record-mode', caseId: 'kernel', rpc: missing.rpc }), fail('ZERO')); assert.equal(missing.calls.filter(c => c.method === 'simulateTransaction').length, 1);
  const refused = fixture(); await assert.rejects(acquire({ plan, state, before, observationKind: 'fade-claim-wrong-source-enforce', caseId: 'source', rpc: refused.rpc }), fail('MODE')); assert.equal(refused.calls.length, 0);
});
test('credential mismatch and mutation during await cannot alter the captured request', async t => {
  t.mock.method(Date, 'now', () => NOW * 1000); const b = await boot(), before = clone(b.before), fx = fixture({ error: 14 });
  const input = { ...basic(b, fx.rpc), before, observationKind: 'unsupported-asset-valid-creation-proof', caseId: 'pod', observationCredential: async v => { before.acquisition.response.entries.length = 0; const c = O.publicLifecycleObservationIntent({ plan, stepId: v.stepId, observationKind: v.observationKind, caseId: v.caseId, ledger: v.ledger, timestamp: v.timestamp, recordAnchors: v.state.recordAnchors }).credential; return { role: c.role, publicKey: c.publicKey, payloadSha256: '00'.repeat(32), signatureHex: f.keys[3].sign(Buffer.from(c.payloadHex, 'hex')).toString('hex') }; } };
  await assert.rejects(acquire(input), fail('CREDENTIAL')); assert.equal(fx.calls.length, 0);
});
function assertInitialRequest(params, kind, id, head) {
  const envelope = xdr.TransactionEnvelope.fromXDR(params.transaction, 'base64').v1(), tx = envelope.tx(), op = tx.operations()[0].body().invokeHostFunctionOp(), fn = op.hostFunction().invokeContract();
  if (fn.functionName().toString() === 'balance') return; // separate fixed zero-read gate covers this
  const args = fn.args(), addr = s => b64(new Address(s).toScVal()), number = v => v.switch().name === 'scvU32' ? BigInt(v.u32()) : (v.i128().hi().toBigInt() << 64n) + v.i128().lo().toBigInt();
  let type = kind === 'creation-nonpositive-amount' ? id.split('-')[0] : ['zero-credential-key', 'unsupported-asset-valid-creation-proof'].includes(kind) ? id : kind.startsWith('trigger-') ? 'trigger' : 'fade';
  assert.equal(fn.functionName().toString(), 'create_' + type); assert.equal(b64(fn.contractAddress()), b64(new Address(plan.contractId).toScAddress()));
  const source = kind === 'zero-credential-key' && id === 'mandate' ? plan.actors.recipient : plan.actors.seller;
  assert.ok(tx.sourceAccount().ed25519().equals(new Address(source).toScAddress().accountId().ed25519())); assert.equal(b64(args[0]), addr(source));
  assert.equal(params.authMode, 'record'); assert.equal(op.auth().length, 0); assert.equal(envelope.signatures().length, 0); assert.equal(tx.seqNum().toString(), '11'); assert.equal(tx.fee(), 100);
  if (kind === 'creation-nonpositive-amount') assert.equal(number(args[2]), id.endsWith('-zero') ? 0n : -1n);
  else if (kind === 'fade-floor-below-pot') assert.equal(number(args[4]), -10000001n);
  else if (kind === 'fade-zero-slope-denominator') assert.equal(number(args[6]), 0n);
  else if (kind === 'fade-zero-duration-or-handoff' || kind === 'fade-excessive-span') assert.equal(number(args[id === 'duration' ? 7 : 8]), kind === 'fade-excessive-span' ? 1000001n : 0n);
  else if (kind === 'zero-credential-key') assert.deepEqual(args[{ fade: 9, pod: 4, trigger: 4, mandate: 1 }[id]].bytes(), Buffer.alloc(32));
  else if (kind === 'trigger-current-past-or-max-deadline') assert.equal(number(args[5]), id === 'current' ? BigInt(head) : id === 'past' ? BigInt(head - 1) : 0xffffffffn);
  else if (kind === 'trigger-kernel-or-asset-beneficiary') assert.equal(b64(args[3]), addr(id === 'kernel' ? plan.contractId : plan.assets[0]));
  else if (kind === 'unsupported-asset-valid-creation-proof') { assert.equal(b64(args[1]), addr('CBIIHFELPAKC2KJD4NCJSB32BQO5QUBNEKHBMISFB4MVDKBVM6AJSRXT')); if (id === 'pod') { assert.equal(number(args[3]), BigInt(head + 30)); assert.equal(args[5].bytes().length, 64); } }
  else assert.fail('unmapped independent case');
}
test('global liabilities, counters, reserve and every actor sequence remain unchanged', async t => {
  t.mock.method(Date, 'now', () => NOW * 1000); const b = await boot();
  const mutations = [
    r => { const v = xdr.LedgerEntryData.fromXDR(r.entries[5].val, 'base64'); v.contractData().val(nativeToScVal(1n, { type: 'i128' })); r.entries[5].val = b64(v); },
    r => { const v = xdr.LedgerEntryData.fromXDR(r.entries[1].val, 'base64'), instance = v.contractData().val().instance(); instance.storage([...instance.storage(), new xdr.ScMapEntry({ key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('FadeCount')]), val: nativeToScVal(1n, { type: 'u64' }) })]); r.entries[1].val = b64(v); },
    r => { const v = xdr.LedgerEntryData.fromXDR(r.entries[6].val, 'base64'); v.contractData().val().map().find(m => m.key().sym().toString() === 'amount').val(nativeToScVal(1n, { type: 'i128' })); r.entries[6].val = b64(v); },
    ...[7, 8, 9].map(index => r => { const v = xdr.LedgerEntryData.fromXDR(r.entries[index].val, 'base64'); v.account().seqNum(xdr.SequenceNumber.fromString('11')); r.entries[index].val = b64(v); }),
  ];
  for (const mutate of mutations) { const response = snapshot(HEAD); mutate(response); const fx = fixture({ response }); await assert.rejects(acquire(basic(b, fx.rpc)), /^Error: LIFECYCLE_OBSERVATION_ACQUISITION_[A-Z_]+$/); }
});
test('valid proof uses the copied before capture despite caller mutation while awaiting', async t => {
  t.mock.method(Date, 'now', () => NOW * 1000); const b = await boot(), before = clone(b.before), fx = fixture({ error: 14 });
  const out = await acquire({ ...basic(b, fx.rpc), before, observationKind: 'unsupported-asset-valid-creation-proof', caseId: 'pod', observationCredential: async v => { before.acquisition.response.entries.length = 0; before.acquisition.raw.entries.entries.length = 0; const c = O.publicLifecycleObservationIntent({ plan, stepId: v.stepId, observationKind: v.observationKind, caseId: v.caseId, ledger: v.ledger, timestamp: v.timestamp, recordAnchors: v.state.recordAnchors }).credential; return { role: c.role, publicKey: c.publicKey, payloadSha256: sha(Buffer.from(c.payloadHex, 'hex')), signatureHex: f.keys[3].sign(Buffer.from(c.payloadHex, 'hex')).toString('hex') }; } });
  assert.equal(out.captures.before.raw.entries.entries.length, 10); assert.equal(out.snapshots[out.case.beforeSnapshot].response.entries.length, 10);
});
test('abort during a pending credential cannot trigger any external request', async t => {
  t.mock.method(Date, 'now', () => NOW * 1000); const b = await boot(), fx = fixture(), controller = new AbortController(); let reached; const started = new Promise(r => { reached = r; });
  const pending = acquire({ ...basic(b, fx.rpc), observationKind: 'unsupported-asset-valid-creation-proof', caseId: 'pod', signal: controller.signal, observationCredential: async () => { reached(); return new Promise(() => {}); } }); await started; controller.abort(); await assert.rejects(pending, fail('ABORTED')); assert.equal(fx.calls.length, 0);
});
for (const kind of ['simulation', 'credential']) test(`queued deadline expiry refuses before ${kind} callback starts`, async t => {
  t.mock.method(Date, 'now', () => NOW * 1000); const b = await boot(), fx = fixture(); let seconds = NOW, clockCalls = 0, credentials = 0;
  t.mock.method(Date, 'now', () => { if (++clockCalls === (kind === 'simulation' ? 2 : 1)) queueMicrotask(() => { seconds = NOW + 90; }); return seconds * 1000; });
  const input = kind === 'simulation' ? basic(b, fx.rpc) : { ...basic(b, fx.rpc), observationKind: 'unsupported-asset-valid-creation-proof', caseId: 'pod', observationCredential: async () => { credentials++; throw Error('must not be invoked'); } };
  await assert.rejects(acquire(input), fail('TIME')); assert.equal(fx.calls.length, 0); assert.equal(credentials, 0);
});
