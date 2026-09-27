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
function fixture({ head = HEAD, present = true, error = 3, errorText, simulationHead = head, response = snapshot(head, present), onCall, events } = {}) {
  const calls = [], values = { getNetwork: { passphrase: plan.networkPassphrase, protocolVersion: 28 }, getLedgerEntries: { latestLedger: response.latestLedger, entries: response.entries.map(({ val, ...r }) => ({ ...r, xdr: val })) }, getLatestLedger: header(head) };
  const rpc = createPublicLifecycleRpc({ fetch: async (url, init) => {
    assert.equal(url, 'https://soroban-testnet.stellar.org'); assert.equal(init.redirect, 'manual'); const q = JSON.parse(init.body); calls.push(clone(q)); await onCall?.(q, values);
    let result = values[q.method];
    if (q.method === 'simulateTransaction') { const op = xdr.TransactionEnvelope.fromXDR(q.params.transaction, 'base64').v1().tx().operations()[0].body().invokeHostFunctionOp(); result = op.hostFunction().invokeContract().functionName().toString() === 'balance' ? zero(head) : { latestLedger: simulationHead, error: errorText ?? `HostError: Error(Contract, #${error})`, ...(events ? { events } : {}) }; }
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

// ENFORCE acquisition oracle: fixed contract calls and auth/payload bytes below
// deliberately do not use the production intent or observation-evidence builder.
// The shared journey supplies synthetic states; wire replies remain controlled.
const ENFORCE = [
  { step: 2, stepId: '02-fade-negative-claim', kind: 'fade-claim-wrong-source-enforce', caseId: 'source', method: 'claim', id: 1, error: 'Auth, InvalidAction', role: null },
  { step: 11, stepId: '11-fade-positive-confirm_handoff', kind: 'positive-handoff-wrong-source-enforce', caseId: 'source', method: 'confirm_handoff', id: 3, error: 'Auth, InvalidAction', role: 'venue' },
  { step: 13, stepId: '13-pod-timelock-claim_pod', kind: 'pod-recipient-auth-enforce', caseId: 'source', method: 'claim_pod', id: 1, error: 'Auth, InvalidAction', role: 'podTimelock' },
  { step: 26, stepId: '26-grant-capped-revoke_mandate', kind: 'envoy-owner-mismatch-relayer-authorized', caseId: 'owner', method: 'revoke_mandate', id: 1, error: 'Contract, #11', role: null },
];
let enforceJourney;
const enforceSeconds = row => NOW + (f.heads[row.step - 1] - HEAD) * 5;
const eb64 = value => value.toXDR('base64'), ea = address => new Address(address).toScVal();
const eu64 = value => nativeToScVal(BigInt(value), { type: 'u64' });
function ebe64(value) { const bytes = Buffer.alloc(8); bytes.writeBigUInt64BE(BigInt(value)); return bytes; }
function enforceOracle(row, state) {
  assert.equal(plan.steps[row.step - 1].id, row.stepId); const capturedSeconds = enforceSeconds(row);
  const purpose = row.role === 'venue' ? 'handoff:v2' : 'pod-claim:v3';
  const payload = row.role ? Buffer.concat([Buffer.from('agyion:' + purpose + '\0'), Buffer.from(sha('Test SDF Network ; September 2015'), 'hex'), ea(plan.contractId).toXDR(), ebe64(row.id), ea(plan.actors.recipient).toXDR(), ...(row.role === 'venue' ? [ebe64(capturedSeconds)] : [])]) : null;
  const key = row.role === 'venue' ? f.keys[2] : row.role === 'podTimelock' ? f.keys[3] : null;
  if (key) assert.equal(key.publicKey(), plan.credentialKeys[row.role]);
  const signature = key ? key.sign(payload) : null;
  const tree = (target, method, args, children = []) => new xdr.SorobanAuthorizedInvocation({ function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new xdr.InvokeContractArgs({ contractAddress: new Address(target).toScAddress(), functionName: method, args })), subInvocations: children });
  function request(control) {
    const source = plan.actors[control ? 'recipient' : 'relayer'];
    const args = row.method === 'claim' ? [eu64(1), ea(plan.actors.recipient)]
      : row.method === 'confirm_handoff' ? [eu64(3), eu64(capturedSeconds), xdr.ScVal.scvBytes(signature)]
      : row.method === 'claim_pod' ? [eu64(1), ea(plan.actors.recipient), xdr.ScVal.scvBytes(signature)]
      : [ea(source), eu64(1)];
    const children = row.method === 'confirm_handoff' ? [tree(plan.assets[0], 'transfer', [ea(plan.actors.recipient), ea(plan.actors.seller), nativeToScVal(1000000n, { type: 'i128' })])] : [];
    const auth = [new xdr.SorobanAuthorizationEntry({ credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(), rootInvocation: tree(plan.contractId, row.method, args, children) })];
    const account = state.snapshot.accounts[control ? 'recipient' : 'relayer'];
    const transaction = new TransactionBuilder(new Account(source, account.sequence), { fee: '100', networkPassphrase: 'Test SDF Network ; September 2015' }).addOperation(Operation.invokeContractFunction({ contract: plan.contractId, function: row.method, args, auth })).setTimebounds(0, capturedSeconds + 90).build().toXDR();
    return { params: { transaction, authMode: 'enforce' }, auth: auth.map(eb64) };
  }
  const negative = request(false), control = request(true);
  let credentials = 0;
  return { negative, control, get credentials() { return credentials; }, async observationCredential(value) {
    credentials++; assert.ok(payload); assert.equal(value.state, state); assert.equal(value.stepId, row.stepId); assert.equal(value.phase, 'before'); assert.equal(value.observationKind, row.kind); assert.equal(value.caseId, row.caseId); assert.equal(value.timestamp, String(capturedSeconds)); assert.equal(value.ledger, state.snapshot.ledger);
    return { role: row.role, publicKey: key.publicKey(), payloadSha256: sha(payload), signatureHex: signature.toString('hex') };
  } };
}
async function enforceBoot(row) {
  const stage = (enforceJourney ??= f.journey(S, 26)).stages[row.step - 1].before, head = stage.response.latestLedger;
  const capture = fixture({ head, response: stage.response }), before = await acquirePublicLifecycleBaseline({ plan, rpc: capture.rpc });
  const state = S.derivePublicLifecycleState({ ...stage, response: before.acquisition.response, headerEvidence: before.acquisition.headerEvidence });
  assert.equal(state.expected.fundedHistory, true); assert.equal(before.zeroRead, null); return { before, state };
}
function enforceTransport(row, boot, oracle, options = {}) {
  const head = boot.state.snapshot.ledger, afterHead = options.afterHead ?? head, calls = [];
  const response = clone(boot.before.acquisition.response); response.latestLedger = afterHead; options.mutateAfter?.(response);
  const values = { getNetwork: { passphrase: plan.networkPassphrase, protocolVersion: 28 }, getLedgerEntries: { latestLedger: afterHead, entries: response.entries.map(({ val, ...entry }) => ({ ...entry, xdr: val })) }, getLatestLedger: header(afterHead) };
  let simulations = 0;
  const rpc = createPublicLifecycleRpc({ fetch: async (url, init) => {
    assert.equal(url, 'https://soroban-testnet.stellar.org'); assert.equal(init.redirect, 'manual');
    const q = JSON.parse(init.body); calls.push(clone(q)); let result;
    if (q.method === 'simulateTransaction') {
      const control = ++simulations === 2; assert.ok(simulations <= 2, 'no simulation retry');
      assert.deepEqual(q.params, control ? oracle.control.params : oracle.negative.params);
      result = control ? { latestLedger: options.controlHead ?? head, transactionData: eb64(new SorobanDataBuilder().setResourceFee('100').build()), minResourceFee: '100', results: [{ xdr: eb64(xdr.ScVal.scvVoid()), auth: oracle.control.auth }] }
        : { latestLedger: options.negativeHead ?? head, error: `HostError: Error(${row.error})` };
      (control ? options.mutateControl : options.mutateNegative)?.(result);
      await options.onSimulation?.(control, q, result);
    } else { result = values[q.method]; assert.ok(result, 'no extra method ' + q.method); }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: q.id, result }));
  } });
  return { calls, rpc };
}
const enforceInput = (row, boot, oracle, rpc) => ({ plan, ...boot, observationKind: row.kind, caseId: row.caseId, observationCredential: oracle.observationCredential, rpc });
for (const row of ENFORCE) test(`ENFORCE fixed pair ${row.stepId} has independent source/auth/payload oracle`, async t => {
  t.mock.method(Date, 'now', () => enforceSeconds(row) * 1000); const boot = await enforceBoot(row), oracle = enforceOracle(row, boot.state), fx = enforceTransport(row, boot, oracle), original = JSON.stringify(boot.before);
  const out = await acquire(enforceInput(row, boot, oracle, fx.rpc));
  assert.deepEqual(fx.calls.map(q => q.method), ['simulateTransaction', 'simulateTransaction', 'getNetwork', 'getLedgerEntries', 'getLatestLedger']);
  assert.equal(oracle.credentials, row.role ? 1 : 0); assert.equal(JSON.stringify(boot.before), original);
  assert.deepEqual(out.case.request, { envelopeXdr: oracle.negative.params.transaction, authMode: 'enforce' });
  assert.deepEqual(out.case.control.request, { envelopeXdr: oracle.control.params.transaction, authMode: 'enforce' });
  assert.equal(out.case.response.error, `HostError: Error(${row.error})`); assert.deepEqual(out.case.control.response.results[0].auth, oracle.control.auth);
  assert.equal(out.case.ledger, boot.state.snapshot.ledger); assert.deepEqual(afterOf(out), boot.before); assert.ok(Object.isFrozen(out.case.control.response.results[0].auth));
  assert.deepEqual(out.timing, { startedAtSeconds: enforceSeconds(row), responseValidatedAtSeconds: enforceSeconds(row), controlResponseValidatedAtSeconds: enforceSeconds(row), completedAtSeconds: enforceSeconds(row) });
  assert.equal(O.verifyPublicLifecycleObservationCase({ plan, stepId: row.stepId, observationKind: row.kind, caseId: row.caseId, ledger: out.case.ledger, timestamp: out.case.timestamp, recordAnchors: boot.state.recordAnchors }, { request: out.case.request, response: out.case.response, control: out.case.control }).caseId, row.caseId);
});
test('ENFORCE wrong negative error or success-shaped aliases stop before control and readback', async t => {
  const row = ENFORCE[0]; t.mock.method(Date, 'now', () => enforceSeconds(row) * 1000); const boot = await enforceBoot(row);
  for (const mutateNegative of [r => r.error = 'HostError: Error(Contract, #3)', r => r.results = [], r => r.id = '', r => r.cost = false, r => r.restorePreamble = null, r => r._parsed = false]) {
    const oracle = enforceOracle(row, boot.state), fx = enforceTransport(row, boot, oracle, { mutateNegative });
    await assert.rejects(acquire(enforceInput(row, boot, oracle, fx.rpc)), fail('CASE')); assert.equal(fx.calls.length, 1);
  }
});
test('ENFORCE control auth, raw schema and resource quote failures never reach after-read', async t => {
  const row = ENFORCE[0]; t.mock.method(Date, 'now', () => enforceSeconds(row) * 1000); const boot = await enforceBoot(row);
  for (const mutateControl of [r => delete r.results[0].auth, r => r.results[0].auth = [], r => r.results[0].auth = null, r => r.results[0].auth.push(r.results[0].auth[0]), r => r.minResourceFee = '101', r => r.minResourceFee = '0100', r => r.results[0].xdr = eb64(xdr.ScVal.scvBool(false)), r => r.restorePreamble = null, r => r.id = false, r => r._parsed = false]) {
    const oracle = enforceOracle(row, boot.state), fx = enforceTransport(row, boot, oracle, { mutateControl });
    await assert.rejects(acquire(enforceInput(row, boot, oracle, fx.rpc)), fail('CASE')); assert.equal(fx.calls.length, 2);
  }
});
test('ENFORCE requires the same simulation ledger and an unchanged two-ledger bracket', async t => {
  const row = ENFORCE[0]; t.mock.method(Date, 'now', () => enforceSeconds(row) * 1000); const boot = await enforceBoot(row), head = boot.state.snapshot.ledger;
  const oracle = enforceOracle(row, boot.state), fx = enforceTransport(row, boot, oracle, { negativeHead: head + 1, controlHead: head + 1, afterHead: head + 2 });
  const out = await acquire(enforceInput(row, boot, oracle, fx.rpc)); assert.equal(out.case.ledger, head + 1); assert.equal(out.snapshots[out.case.afterSnapshot].response.latestLedger, head + 2);
  const different = enforceTransport(row, boot, oracle, { controlHead: head + 1, afterHead: head + 1 });
  await assert.rejects(acquire(enforceInput(row, boot, oracle, different.rpc)), fail('CASE')); assert.equal(different.calls.length, 2);
  const outside = enforceTransport(row, boot, oracle, { negativeHead: head + 3, controlHead: head + 3, afterHead: head + 3 });
  await assert.rejects(acquire(enforceInput(row, boot, oracle, outside.rpc)), fail('BRACKET')); assert.equal(outside.calls.length, 1);
});
test('ENFORCE cancellation and deadline during the negative leg prevent a control call', async t => {
  const row = ENFORCE[0], started = enforceSeconds(row); let time = started; t.mock.method(Date, 'now', () => time * 1000); const boot = await enforceBoot(row);
  for (const kind of ['abort', 'deadline']) {
    time = started; const controller = new AbortController(), oracle = enforceOracle(row, boot.state), fx = enforceTransport(row, boot, oracle, { onSimulation(control) { assert.equal(control, false); if (kind === 'abort') controller.abort(); else time = started + 90; } });
    await assert.rejects(acquire({ ...enforceInput(row, boot, oracle, fx.rpc), signal: controller.signal }), fail(kind === 'abort' ? 'ABORTED' : 'TIME')); assert.equal(fx.calls.length, 1);
  }
});
test('ENFORCE invalid fixed credential refuses before both simulations', async t => {
  const row = ENFORCE[1]; t.mock.method(Date, 'now', () => enforceSeconds(row) * 1000); const boot = await enforceBoot(row), oracle = enforceOracle(row, boot.state), fx = enforceTransport(row, boot, oracle);
  await assert.rejects(acquire({ ...enforceInput(row, boot, oracle, fx.rpc), observationCredential: async value => ({ ...await oracle.observationCredential(value), payloadSha256: '00'.repeat(32) }) }), fail('CREDENTIAL'));
  assert.equal(oracle.credentials, 1); assert.equal(fx.calls.length, 0);
});
function editControlAuth(response, edit) { const original = response.results[0].auth[0], auth = xdr.SorobanAuthorizationEntry.fromXDR(original, 'base64'); edit(auth); assert.notEqual(eb64(auth), original, 'fixture edit must change auth bytes'); response.results[0].auth = [eb64(auth)]; }
test('ENFORCE altered root, payment child or credential type is rejected before readback', async t => {
  const row = ENFORCE[1]; t.mock.method(Date, 'now', () => enforceSeconds(row) * 1000); const boot = await enforceBoot(row);
  for (const edit of [
    auth => auth.rootInvocation().function().contractFn().functionName('claim'),
    auth => auth.rootInvocation().function().contractFn().contractAddress(new Address(plan.assets[0]).toScAddress()),
    auth => { const fn = auth.rootInvocation().function().contractFn(); fn.args([eu64(4), ...fn.args().slice(1)]); },
    auth => auth.rootInvocation().subInvocations([]),
    auth => auth.rootInvocation().subInvocations().push(auth.rootInvocation().subInvocations()[0]),
    auth => { const fn = auth.rootInvocation().subInvocations()[0].function().contractFn(); fn.args([ea(plan.actors.relayer), ...fn.args().slice(1)]); },
    auth => { const fn = auth.rootInvocation().subInvocations()[0].function().contractFn(); fn.args([fn.args()[0], ea(plan.actors.relayer), fn.args()[2]]); },
    auth => { const fn = auth.rootInvocation().subInvocations()[0].function().contractFn(); fn.args([...fn.args().slice(0, 2), nativeToScVal(1000001n, { type: 'i128' })]); },
    auth => auth.credentials(xdr.SorobanCredentials.sorobanCredentialsAddress(new xdr.SorobanAddressCredentials({ address: new Address(plan.actors.recipient).toScAddress(), nonce: xdr.Int64.fromString('1'), signatureExpirationLedger: boot.state.snapshot.ledger + 10, signature: xdr.ScVal.scvVoid() }))),
  ]) {
    const oracle = enforceOracle(row, boot.state), fx = enforceTransport(row, boot, oracle, { mutateControl: response => editControlAuth(response, edit) });
    await assert.rejects(acquire(enforceInput(row, boot, oracle, fx.rpc)), fail('CASE')); assert.equal(fx.calls.length, 2); assert.equal(oracle.credentials, 1);
  }
});
test('ENFORCE resource extensions reject restoration and enforce encoded fee cap', async t => {
  const row = ENFORCE[0]; t.mock.method(Date, 'now', () => enforceSeconds(row) * 1000); const boot = await enforceBoot(row);
  for (const [fee, archived, accepted] of [['0', [], true], ['9999900', [], true], ['9999901', [], false], ['100', [0], false]]) {
    const oracle = enforceOracle(row, boot.state), fx = enforceTransport(row, boot, oracle, { mutateControl(response) {
      const data = new SorobanDataBuilder().setResourceFee(fee).build(); data.ext(new xdr.SorobanTransactionDataExt(1, new xdr.SorobanResourcesExtV0({ archivedSorobanEntries: archived })));
      response.transactionData = eb64(data); response.minResourceFee = fee;
    } });
    if (accepted) { const out = await acquire(enforceInput(row, boot, oracle, fx.rpc)); assert.equal(out.case.control.response.minResourceFee, fee); assert.equal(fx.calls.length, 5); }
    else { await assert.rejects(acquire(enforceInput(row, boot, oracle, fx.rpc)), fail('CASE')); assert.equal(fx.calls.length, 2); }
  }
});
function enforceEvent(type, success) { return eb64(new xdr.DiagnosticEvent({ inSuccessfulContractCall: success, event: new xdr.ContractEvent({ ext: new xdr.ExtensionPoint(0), contractId: null, type, body: new xdr.ContractEventBody(0, new xdr.ContractEventV0({ topics: [xdr.ScVal.scvSymbol('fixture')], data: xdr.ScVal.scvVoid() })) }) })); }
test('ENFORCE nonempty simulated state changes and diagnostic wrappers stay raw while after state is unchanged', async t => {
  const row = ENFORCE[0]; t.mock.method(Date, 'now', () => enforceSeconds(row) * 1000); const boot = await enforceBoot(row), oracle = enforceOracle(row, boot.state);
  const account = boot.before.acquisition.response.entries[8], data = xdr.LedgerEntryData.fromXDR(account.val, 'base64');
  const entry = eb64(new xdr.LedgerEntry({ lastModifiedLedgerSeq: boot.state.snapshot.ledger, data, ext: new xdr.LedgerEntryExt(0) }));
  const changes = [{ type: 'created', key: account.key, before: null, after: entry }, { type: 'updated', key: account.key, before: entry, after: entry }, { type: 'deleted', key: account.key, before: entry, after: null }];
  const events = [xdr.ContractEventType.system(), xdr.ContractEventType.contract(), xdr.ContractEventType.diagnostic()].flatMap(type => [false, true].map(flag => enforceEvent(type, flag)));
  const fx = enforceTransport(row, boot, oracle, { mutateNegative: response => response.events = events, mutateControl(response) { response.events = events; response.stateChanges = changes; const resources = xdr.SorobanTransactionData.fromXDR(response.transactionData, 'base64'); resources.resources().footprint().readWrite([xdr.LedgerKey.fromXDR(account.key, 'base64')]); response.transactionData = eb64(resources); } });
  const out = await acquire(enforceInput(row, boot, oracle, fx.rpc)); assert.deepEqual(out.case.control.response.stateChanges, changes); assert.deepEqual(out.case.control.response.events, events); assert.deepEqual(out.case.response.events, events); assert.deepEqual(afterOf(out), boot.before); assert.equal(fx.calls.length, 5);
});
test('ENFORCE control bytes contribute to the combined two-MiB result limit', async t => {
  const row = ENFORCE[0]; t.mock.method(Date, 'now', () => enforceSeconds(row) * 1000); const original = await enforceBoot(row), boot = { ...original, before: clone(original.before) }, oracle = enforceOracle(row, boot.state);
  const tx = xdr.TransactionEnvelope.fromXDR(oracle.negative.params.transaction, 'base64'), meta = xdr.LedgerCloseMeta.fromXDR(boot.before.acquisition.raw.latest.metadataXdr, 'base64');
  meta.v0().txSet().txes(Array(Math.ceil(1300000 / (tx.toXDR().length * 4 / 3))).fill(tx)); boot.before.acquisition.raw.latest.metadataXdr = eb64(meta);
  assert.ok(Buffer.byteLength(canonical(boot.before)) < MAX);
  const fx = enforceTransport(row, boot, oracle, { mutateControl: response => response.events = Array(20).fill(diagnostic(36000)) });
  await assert.rejects(acquire(enforceInput(row, boot, oracle, fx.rpc)), fail('BOUNDS')); assert.equal(fx.calls.length, 5);
});
test('ENFORCE pending control abort returns without waiting and late completion cannot read state', async t => {
  const row = ENFORCE[0]; t.mock.method(Date, 'now', () => enforceSeconds(row) * 1000); const boot = await enforceBoot(row), oracle = enforceOracle(row, boot.state), abort = new AbortController();
  let entered, release; const started = new Promise(resolve => { entered = resolve; });
  const fx = enforceTransport(row, boot, oracle, { onSimulation: control => control ? new Promise(resolve => { release = resolve; entered(); }) : undefined });
  const pending = acquire({ ...enforceInput(row, boot, oracle, fx.rpc), signal: abort.signal }); await started; abort.abort(); await assert.rejects(pending, fail('ABORTED'));
  assert.equal(fx.calls.length, 2); release(); await Promise.resolve(); await Promise.resolve(); assert.equal(fx.calls.length, 2);
});
for (const kind of ['abort', 'deadline']) test(`ENFORCE queued control ${kind} never dispatches its RPC`, async t => {
  const row = ENFORCE[0], start = enforceSeconds(row); let current = start, queued = false, afterNegativeClock = 0;
  t.mock.method(Date, 'now', () => current * 1000); const boot = await enforceBoot(row), oracle = enforceOracle(row, boot.state), abort = new AbortController(); let negativeReturned = false;
  // Direct trusted RPC capability makes the exact scheduling boundary explicit:
  // the first post-await clock check queues cancellation before wait's next job.
  const calls = [], rpc = { async request(method, params) { calls.push(method); assert.equal(method, 'simulateTransaction'); assert.deepEqual(params, oracle.negative.params); negativeReturned = true; return { latestLedger: boot.state.snapshot.ledger, error: 'HostError: Error(Auth, InvalidAction)' }; } };
  t.mock.method(Date, 'now', () => { if (negativeReturned && ++afterNegativeClock === 1) { queued = true; queueMicrotask(() => { if (kind === 'abort') abort.abort(); else current = start + 90; }); } return current * 1000; });
  await assert.rejects(acquire({ ...enforceInput(row, boot, oracle, rpc), signal: abort.signal }), fail(kind === 'abort' ? 'ABORTED' : 'TIME')); assert.equal(queued, true); assert.deepEqual(calls, ['simulateTransaction']);
});
test('ENFORCE expiry after control prevents readback and expiry in readback prevents a result', async t => {
  const row = ENFORCE[0], start = enforceSeconds(row); let current = start; t.mock.method(Date, 'now', () => current * 1000); const boot = await enforceBoot(row), oracle = enforceOracle(row, boot.state);
  const first = enforceTransport(row, boot, oracle, { onSimulation(control) { if (control) current = start + 90; } });
  await assert.rejects(acquire(enforceInput(row, boot, oracle, first.rpc)), fail('TIME')); assert.equal(first.calls.length, 2);
  current = start; const second = enforceTransport(row, boot, oracle), rpc = { async request(method, params) { const result = await second.rpc.request(method, params); if (method === 'getLedgerEntries') current = start + 90; return result; } };
  await assert.rejects(acquire(enforceInput(row, boot, oracle, rpc)), fail('TIME')); assert.deepEqual(second.calls.map(q => q.method), ['simulateTransaction', 'simulateTransaction', 'getNetwork', 'getLedgerEntries']);
});
test('ENFORCE after-read account economics and funded Balance must remain unchanged', async t => {
  const row = ENFORCE[0]; t.mock.method(Date, 'now', () => enforceSeconds(row) * 1000); const boot = await enforceBoot(row);
  for (const mutateAfter of [response => response.entries.splice(6, 1), response => { const entry = xdr.LedgerEntryData.fromXDR(response.entries[8].val, 'base64'); entry.account().balance(xdr.Int64.fromString('999999999')); response.entries[8].val = eb64(entry); }, response => { const entry = xdr.LedgerEntryData.fromXDR(response.entries[9].val, 'base64'); entry.account().seqNum(xdr.SequenceNumber.fromString('11')); response.entries[9].val = eb64(entry); }]) {
    const oracle = enforceOracle(row, boot.state), fx = enforceTransport(row, boot, oracle, { mutateAfter });
    await assert.rejects(acquire(enforceInput(row, boot, oracle, fx.rpc)), /^Error: LIFECYCLE_OBSERVATION_ACQUISITION_(ZERO|SNAPSHOT|UNCHANGED)$/); assert.equal(fx.calls.length, 5);
  }
});
test('ENFORCE caller source, auth, mode, control and payload overrides are rejected before capabilities', async t => {
  const row = ENFORCE[0]; t.mock.method(Date, 'now', () => enforceSeconds(row) * 1000); const boot = await enforceBoot(row);
  for (const override of [{ sourceAccount: plan.actors.seller }, { authMode: 'record' }, { auth: [] }, { control: null }, { transaction: 'AAAA' }, { expectedError: 'Contract#3' }]) {
    const oracle = enforceOracle(row, boot.state), fx = enforceTransport(row, boot, oracle);
    await assert.rejects(acquire({ ...enforceInput(row, boot, oracle, fx.rpc), ...override }), fail('INPUT')); assert.equal(fx.calls.length, 0); assert.equal(oracle.credentials, 0);
  }
});
function enforcePhaseGate(row, boot, rawEvidence) {
  const stage = enforceJourney.stages[row.step - 1].before, state = boot.state;
  const scope = { plan, planSha256: state.planSha256, stepId: row.stepId, phase: 'before', claim: { stepId: row.stepId, binding: stage.binding }, prefix: stage.prefix, initialEvidence: { expected: enforceJourney.initial.expected, response: f.snapshot(), headerEvidence: f.header() }, currentInclusion: null, snapshotResponse: boot.before.acquisition.response, headerEvidence: boot.before.acquisition.headerEvidence, beforeSnapshot: null };
  const policies = createPublicLifecyclePolicies(); policies.verifyStateExpectations({ ...scope, expected: state.expected });
  return policies.verifyObservations({ ...scope, snapshot: state.snapshot, currentFee: null, rawEvidence });
}
for (const row of ENFORCE.filter(row => row.step !== 13)) test(`ENFORCE acquired pair completes exact before-phase gate ${row.stepId}`, async t => {
  t.mock.method(Date, 'now', () => enforceSeconds(row) * 1000); const boot = await enforceBoot(row), oracle = enforceOracle(row, boot.state), fx = enforceTransport(row, boot, oracle);
  const out = await acquire(enforceInput(row, boot, oracle, fx.rpc)), families = O.publicLifecycleObservationCases({ plan, stepId: row.stepId, phase: 'before' }), raw = Object.fromEntries(families.map(family => [family.observationKind, { cases: [] }])), batches = { ...out.snapshots };
  raw[row.kind].cases.push(out.case);
  if (row.step === 2) for (const caseId of ['kernel', 'asset']) {
    const transport = fixture({ head: boot.state.snapshot.ledger, response: boot.before.acquisition.response, error: 12 });
    const record = await acquire({ plan, ...boot, observationKind: 'fade-kernel-or-asset-claimant-record-mode', caseId, rpc: transport.rpc }); raw['fade-kernel-or-asset-claimant-record-mode'].cases.push(record.case); Object.assign(batches, record.snapshots);
  }
  raw[families[0].observationKind].snapshots = batches;
  assert.equal(enforcePhaseGate(row, boot, raw).evidence.length, families.length);
  for (const change of [tx => tx.sourceAccount(xdr.MuxedAccount.keyTypeEd25519(new Address(plan.actors.relayer).toScAddress().accountId().ed25519())), tx => tx.seqNum(xdr.SequenceNumber.fromString(String(BigInt(tx.seqNum().toString()) + 1n)))]) {
    const bad = clone(raw), request = bad[row.kind].cases[0].control.request, envelope = xdr.TransactionEnvelope.fromXDR(request.envelopeXdr, 'base64'); change(envelope.v1().tx()); request.envelopeXdr = eb64(envelope);
    assert.throws(() => enforcePhaseGate(row, boot, bad), /LIFECYCLE_OBSERVATION_(ENVELOPE|SEQUENCE)/);
  }
});
test('ENFORCE Pod plus all six current record cases still cannot replace the missing historical early case', async t => {
  const row = ENFORCE[2]; t.mock.method(Date, 'now', () => enforceSeconds(row) * 1000); const boot = await enforceBoot(row), oracle = enforceOracle(row, boot.state), fx = enforceTransport(row, boot, oracle), head = boot.state.snapshot.ledger;
  const out = await acquire(enforceInput(row, boot, oracle, fx.rpc)), families = O.publicLifecycleObservationCases({ plan, stepId: row.stepId, phase: 'before' }), raw = Object.fromEntries(families.map(family => [family.observationKind, { cases: [] }])), batches = { ...out.snapshots }; raw[row.kind].cases.push(out.case);
  let records = 0;
  for (const [observationKind, caseIds] of [['pod-crypto-domain', ['recipient', 'purpose', 'deployment', 'legacy']], ['pod-destination-resigned-after-unlock', ['kernel', 'asset']]]) for (const caseId of caseIds) {
    const destinationCase = observationKind === 'pod-destination-resigned-after-unlock', recipient = destinationCase ? caseId === 'kernel' ? plan.contractId : plan.assets[0] : plan.actors.recipient;
    const purpose = caseId === 'purpose' ? 'handoff:v2' : caseId === 'legacy' ? 'pod-claim:v2' : 'pod-claim:v3', deployment = caseId === 'deployment' ? 'CBIIHFELPAKC2KJD4NCJSB32BQO5QUBNEKHBMISFB4MVDKBVM6AJSRXT' : plan.contractId;
    const payload = Buffer.concat([Buffer.from('agyion:' + purpose + '\0'), Buffer.from(sha(plan.networkPassphrase), 'hex'), ea(deployment).toXDR(), ebe64(1), ea(recipient).toXDR()]);
    const transport = fixture({ head, response: boot.before.acquisition.response, errorText: destinationCase ? 'HostError: Error(Contract, #12)' : 'HostError: Error(Crypto, InvalidInput)' }); let credentials = 0;
    const record = await acquire({ plan, ...boot, observationKind, caseId, rpc: transport.rpc, observationCredential: async () => { credentials++; return { role: 'podTimelock', publicKey: f.keys[3].publicKey(), payloadSha256: sha(payload), signatureHex: f.keys[3].sign(payload).toString('hex') }; } });
    assert.equal(credentials, 1); raw[observationKind].cases.push(record.case); Object.assign(batches, record.snapshots); records++;
  }
  assert.equal(records, 6); assert.deepEqual(raw['pod-before-unlock'].cases, []); raw[families[0].observationKind].snapshots = batches;
  assert.throws(() => enforcePhaseGate(row, boot, raw), /LIFECYCLE_OBSERVATION_CASES/);
});
