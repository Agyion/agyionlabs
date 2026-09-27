import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import { createStateFixture } from './helpers/public-lifecycle-state-fixture.mjs';
const { Account, Address, Contract, Operation, SorobanDataBuilder, TransactionBuilder, nativeToScVal, xdr } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const real = process.env.PUBLIC_LIFECYCLE_BASELINE_WASM === '1';
// Default tests replace ONLY the compiled executable-byte gate. Actual state,
// account, reserve, budget, record and omission policies run in both modes.
const readbackURL = new URL('../lib/public-lifecycle-readback.mjs', import.meta.url).href;
const hook = registerHooks({ resolve(specifier, context, next) {
  if (!real && specifier === './public-lifecycle-readback.mjs' && context.parentURL?.endsWith('/public-lifecycle-state.mjs')) return { url: 'data:text/javascript,' + encodeURIComponent(`import {verifyPublicLifecycleState} from ${JSON.stringify(readbackURL)}; export function verifyPublicLifecycleSnapshot(a,b){return {...verifyPublicLifecycleState(a,b),schema:'agyion-public-v4-lifecycle-snapshot-v1',codeBytesAuthenticated:true};}`), shortCircuit: true };
  return next(specifier, context);
} });
const { acquirePublicLifecycleBaseline, verifyPublicLifecycleZeroRead } = await import('../lib/public-lifecycle-baseline.mjs');
const { initialPublicLifecycleState, derivePublicLifecycleState } = await import('../lib/public-lifecycle-state.mjs');
hook.deregister();
const f = createStateFixture({ realWasm: real }), { plan, b64 } = f;
const NOW = 1800001000, HEAD = 1000, MAX = 2 * 1024 * 1024, clone = structuredClone;
const zero = b64(nativeToScVal(0n, { type: 'i128' }));
const fail = code => e => { assert.equal(e.message, `LIFECYCLE_BASELINE_${code}`); assert.equal(e.cause, undefined); return true; };
const refusal = fn => assert.throws(fn, /^Error: LIFECYCLE_BASELINE_[A-Z_]+$/);
function headerReply(head = HEAD, transactions = 0) {
  const h = f.header(head), header = xdr.LedgerHeader.fromXDR(h.headerXdr, 'base64');
  const wrapper = new xdr.LedgerHeaderHistoryEntry({ hash: Buffer.from(h.hash, 'hex'), header, ext: new xdr.LedgerHeaderHistoryEntryExt(0) });
  const tx = TransactionBuilder.fromXDR(request().transaction, plan.networkPassphrase).toEnvelope();
  const meta = new xdr.LedgerCloseMeta(0, new xdr.LedgerCloseMetaV0({ ledgerHeader: wrapper, txSet: new xdr.TransactionSet({ previousLedgerHash: Buffer.alloc(32), txes: Array(transactions).fill(tx) }), txProcessing: [], upgradesProcessing: [], scpInfo: [] }));
  return { id: h.hash, sequence: head, protocolVersion: 25, closeTime: String(NOW + head - HEAD), headerXdr: h.headerXdr, metadataXdr: b64(meta) };
}
function request(now = NOW) {
  const transaction = new TransactionBuilder(new Account(plan.actors.seller, '10'), { fee: '100', networkPassphrase: plan.networkPassphrase })
    .addOperation(Operation.invokeContractFunction({ contract: plan.assets[0], function: 'balance', args: [new Address(plan.contractId).toScVal()], auth: [] })).setTimebounds(0, now + 90).build().toXDR();
  return { transaction, authMode: 'record' };
}
function simulation() {
  const keys = f.snapshot().entries;
  const data = new SorobanDataBuilder().setResources(20000, 0, 0).setResourceFee('700').setReadOnly([keys[2], keys[6]].map(r => xdr.LedgerKey.fromXDR(r.key, 'base64'))).build();
  return { latestLedger: HEAD, transactionData: b64(data), minResourceFee: '700', results: [{ xdr: zero, auth: [] }], events: [], stateChanges: [] };
}
function pure() { const snapshot = f.snapshot(); snapshot.entries.splice(6, 1); return { plan, snapshot, request: request(), response: simulation(), nowSeconds: NOW }; }
function fixture({ present = false, latest = HEAD, transactions = 0 } = {}) {
  const snapshot = f.snapshot(); if (!present) snapshot.entries.splice(6, 1);
  const history = headerReply(HEAD), header = xdr.LedgerHeader.fromXDR(history.headerXdr, 'base64');
  const values = { getNetwork: { passphrase: plan.networkPassphrase, protocolVersion: 25 }, getLedgerEntries: { latestLedger: HEAD, entries: snapshot.entries.map(({ val, ...row }) => ({ ...row, xdr: val })) }, getLatestLedger: headerReply(latest, transactions), getLedgers: { ledgers: [{ hash: history.id, sequence: HEAD, ledgerCloseTime: history.closeTime, headerXdr: b64(new xdr.LedgerHeaderHistoryEntry({ hash: Buffer.from(history.id, 'hex'), header, ext: new xdr.LedgerHeaderHistoryEntryExt(0) })), metadataXdr: history.metadataXdr }], oldestLedger: 1, oldestLedgerCloseTime: 1, latestLedger: latest, latestLedgerCloseTime: NOW + latest - HEAD, cursor: String(HEAD) }, simulateTransaction: simulation() };
  const calls = [], rpc = { async request(method, params) { calls.push({ method, params: clone(params) }); assert.ok(Object.hasOwn(values, method)); return values[method]; } };
  return { snapshot, values, calls, rpc };
}
function envelope(input, change) { const e = xdr.TransactionEnvelope.fromXDR(input.request.transaction, 'base64'); change(e.v1().tx(), e); input.request.transaction = b64(e); }
function resource(input, change) { const data = xdr.SorobanTransactionData.fromXDR(input.response.transactionData, 'base64'); change(data); input.response.transactionData = b64(data); }
function diagnostic() { return b64(new xdr.DiagnosticEvent({ inSuccessfulContractCall: true, event: new xdr.ContractEvent({ ext: new xdr.ExtensionPoint(0), contractId: Buffer.from(new Address(plan.assets[0]).toScAddress().contractId()), type: xdr.ContractEventType.diagnostic(), body: new xdr.ContractEventBody(0, new xdr.ContractEventV0({ topics: [], data: xdr.ScVal.scvVoid() })) }) })); }

test('present Balance skips simulation and returns immutable acquisition plus null zero fields', async () => {
  const t = fixture({ present: true }), result = await acquirePublicLifecycleBaseline({ plan, rpc: t.rpc });
  assert.deepEqual(t.calls.map(x => x.method), ['getNetwork', 'getLedgerEntries', 'getLatestLedger']);
  assert.equal(result.zeroBalanceEvidence, null); assert.equal(result.zeroRead, null); assert.deepEqual(result.acquisition.response, t.snapshot); assert.ok(Object.isFrozen(result.acquisition.raw.entries.entries));
});
test('absent Balance makes exactly one fixed unsigned record getter and retains the whole same-head raw response', async t => {
  t.mock.method(Date, 'now', () => NOW * 1000); const fx = fixture(), before = JSON.stringify(fx.values);
  const result = await acquirePublicLifecycleBaseline({ plan, rpc: fx.rpc });
  assert.deepEqual(fx.calls.map(x => x.method), ['getNetwork', 'getLedgerEntries', 'getLatestLedger', 'simulateTransaction']);
  assert.deepEqual(fx.calls[3].params, request()); assert.equal(JSON.stringify(fx.values), before);
  assert.deepEqual(result.zeroBalanceEvidence, { envelopeXdr: request().transaction, ledger: HEAD, resultXdr: zero });
  assert.deepEqual(result.zeroRead, { request: request(), response: simulation(), validatedAtSeconds: NOW });
  assert.ok(Object.isFrozen(result.zeroRead.response.results[0])); assert.throws(() => { result.zeroRead.response.latestLedger++; }, TypeError);
  assert.equal(result.expected, undefined); assert.equal(result.codeBytesAuthenticated, undefined);
});
test('same-head historical header is retained, but a newer simulation refuses without any retry', async t => {
  t.mock.method(Date, 'now', () => NOW * 1000); const fx = fixture({ latest: HEAD + 1 });
  const result = await acquirePublicLifecycleBaseline({ plan, rpc: fx.rpc });
  assert.equal(result.acquisition.headerEvidence.kind, 'history'); assert.equal(fx.calls.length, 5);
  const bad = fixture({ latest: HEAD + 1 }); bad.values.simulateTransaction.latestLedger++;
  await assert.rejects(acquirePublicLifecycleBaseline({ plan, rpc: bad.rpc }), fail('LEDGER')); assert.equal(bad.calls.length, 5);
});
test('pure verification is synchronous, immutable and replays at explicit validation time', () => {
  const input = pure(), before = JSON.stringify(input), out = verifyPublicLifecycleZeroRead(input);
  assert.equal(out instanceof Promise, false); assert.ok(Object.isFrozen(out)); assert.equal(JSON.stringify(input), before); assert.equal(out.resultXdr, zero);
  refusal(() => verifyPublicLifecycleZeroRead({ ...input, nowSeconds: NOW + 90 }));
});

for (const [name, change] of [
  ...['error', 'restorePreamble', '_parsed', 'cost', 'verified'].flatMap(k => [null, false, ''].map(v => [`${k} presence ${String(v)}`, p => { p.response[k] = v; }])),
  ...['latestLedger', 'transactionData', 'minResourceFee', 'results'].map(k => [`missing ${k}`, p => { delete p.response[k]; }]),
  ...[HEAD - 1, HEAD + 1, 0, -1, '1000', 1.5, 0x100000000].map(n => [`ledger ${n}`, p => { p.response.latestLedger = n; }]),
  ['positive result', p => { p.response.results[0].xdr = b64(nativeToScVal(1n, { type: 'i128' })); }],
  ['negative result', p => { p.response.results[0].xdr = b64(nativeToScVal(-1n, { type: 'i128' })); }],
  ['wrong integer type', p => { p.response.results[0].xdr = b64(xdr.ScVal.scvU32(0)); }],
  ['no result', p => { p.response.results = []; }], ['two results', p => { p.response.results.push(clone(p.response.results[0])); }],
  ['missing auth', p => { delete p.response.results[0].auth; }], ['nonempty auth', p => { p.response.results[0].auth = ['AAAA']; }],
  ['parsed retval', p => { p.response.results[0].retval = {}; }], ['noncanonical retval', p => { p.response.results[0].xdr += '\n'; }],
  ['noncanonical resources', p => { p.response.transactionData += '\n'; }], ['noncanonical request', p => { p.request.transaction += '\n'; }],
  ['enforce mode', p => { p.request.authMode = 'enforce'; }], ['request extra', p => { p.request.allowRestore = true; }],
  ['missing auth mode', p => { delete p.request.authMode; }], ['invalid time', p => { p.nowSeconds = 0; }],
  ['fee mismatch', p => { p.response.minResourceFee = '701'; }], ['fee number', p => { p.response.minResourceFee = 700; }], ['leading zero fee', p => { p.response.minResourceFee = '0700'; }],
  ['negative fee', p => { resource(p, d => d.resourceFee(xdr.Int64.fromString('-1'))); p.response.minResourceFee = '-1'; }],
  ['excessive fee', p => { resource(p, d => d.resourceFee(xdr.Int64.fromString('10000000'))); p.response.minResourceFee = '10000000'; }],
  ['automatic restoration', p => resource(p, d => d.ext(new xdr.SorobanTransactionDataExt(1, new xdr.SorobanResourcesExtV0({ archivedSorobanEntries: [0] }))))],
  ['writable footprint', p => resource(p, d => d.resources().footprint().readWrite([new Contract(plan.assets[0]).getFootprint()]))],
  ['missing footprint key', p => resource(p, d => d.resources().footprint().readOnly(d.resources().footprint().readOnly().slice(0, 1)))],
  ['duplicate footprint key', p => resource(p, d => d.resources().footprint().readOnly(Array(2).fill(d.resources().footprint().readOnly()[0])))],
  ['foreign footprint', p => resource(p, d => d.resources().footprint().readOnly([new Contract(plan.assets[1]).getFootprint(), d.resources().footprint().readOnly()[1]]))],
  ['write bytes', p => resource(p, d => d.resources().writeBytes(1))], ['zero instructions', p => resource(p, d => d.resources().instructions(0))], ['too many instructions', p => resource(p, d => d.resources().instructions(10000001))], ['too many read bytes', p => resource(p, d => d.resources().diskReadBytes(65537))],
  ['state effect', p => { p.response.stateChanges = [{ type: 'created' }]; }], ['malformed events', p => { p.response.events = ['AAAA']; }],
  ['contract event', p => { const e = xdr.DiagnosticEvent.fromXDR(diagnostic(), 'base64'); e.event().type(xdr.ContractEventType.contract()); p.response.events = [b64(e)]; }],
  ['unsuccessful diagnostic', p => { const e = xdr.DiagnosticEvent.fromXDR(diagnostic(), 'base64'); e.inSuccessfulContractCall(false); p.response.events = [b64(e)]; }],
  ['foreign diagnostic', p => { const e = xdr.DiagnosticEvent.fromXDR(diagnostic(), 'base64'); e.event().contractId(new Address(plan.assets[1]).toScAddress().contractId()); p.response.events = [b64(e)]; }],
  ['too many diagnostics', p => { p.response.events = Array(17).fill(diagnostic()); }], ['too long raw id', p => { p.response.id = 'x'.repeat(129); }],
]) test(`strict zero read refuses ${name}`, () => { const p = pure(); change(p); refusal(() => verifyPublicLifecycleZeroRead(p)); });

for (const [name, change] of [
  ['wrong source', tx => tx.sourceAccount(xdr.MuxedAccount.keyTypeEd25519(new Address(plan.actors.recipient).toScAddress().accountId().ed25519()))],
  ['muxed source', tx => tx.sourceAccount(xdr.MuxedAccount.keyTypeMuxedEd25519(new xdr.MuxedAccountMed25519({ id: xdr.Uint64.fromString('1'), ed25519: tx.sourceAccount().ed25519() })))],
  ['sequence', tx => tx.seqNum(xdr.SequenceNumber.fromString('12'))], ['fee', tx => tx.fee(101)], ['memo', tx => tx.memo(xdr.Memo.memoText('unexpected'))],
  ['unbounded time', tx => tx.cond().timeBounds().maxTime(xdr.Uint64.fromString('0'))], ['expired time', tx => tx.cond().timeBounds().maxTime(xdr.Uint64.fromString(String(NOW)))], ['long time', tx => tx.cond().timeBounds().maxTime(xdr.Uint64.fromString(String(NOW + 91)))], ['nonzero min time', tx => tx.cond().timeBounds().minTime(xdr.Uint64.fromString('1'))], ['missing bounds', tx => tx.cond(xdr.Preconditions.precondNone())],
  ['signature', (tx, e) => e.v1().signatures([new xdr.DecoratedSignature({ hint: Buffer.alloc(4), signature: Buffer.alloc(64) })])],
  ['two operations', tx => tx.operations([tx.operations()[0], tx.operations()[0]])], ['operation source', tx => tx.operations()[0].sourceAccount(tx.sourceAccount())],
  ['target', tx => tx.operations()[0].body().invokeHostFunctionOp().hostFunction().invokeContract().contractAddress(new Address(plan.assets[1]).toScAddress())],
  ['method', tx => tx.operations()[0].body().invokeHostFunctionOp().hostFunction().invokeContract().functionName('transfer')],
  ['argument', tx => tx.operations()[0].body().invokeHostFunctionOp().hostFunction().invokeContract().args([new Address(plan.actors.seller).toScVal()])],
  ['prefilled resources', tx => tx.ext(new xdr.TransactionExt(1, xdr.SorobanTransactionData.fromXDR(simulation().transactionData, 'base64')))],
]) test(`fixed getter refuses changed ${name}`, () => { const p = pure(); envelope(p, change); refusal(() => verifyPublicLifecycleZeroRead(p)); });

test('only exact immutable plan and bounded canonical snapshot with seller sequence can support the getter', () => {
  const cases = [p => { p.plan = clone(p.plan); p.plan.assets.reverse(); }, p => { p.snapshot.entries.push(p.snapshot.entries[0]); }, p => { p.snapshot.entries.push(f.snapshot().entries[6]); }, p => { p.snapshot.entries = p.snapshot.entries.filter(r => r.key !== f.snapshot().entries[7].key); }, p => { p.snapshot.entries.find(r => r.key === f.snapshot().entries[7].key).val = f.snapshot().entries[8].val; }, p => { p.snapshot.entries[0].val += '\n'; }, p => { p.snapshot.entries[1].liveUntilLedgerSeq = HEAD - 1; }, p => { p.snapshot.latestLedger = 0; }, p => { p.snapshot.entries[1].lastModifiedLedgerSeq = HEAD + 1; }];
  for (const change of cases) { const p = pure(); change(p); refusal(() => verifyPublicLifecycleZeroRead(p)); }
  const p = pure(), row = p.snapshot.entries.find(r => r.key === f.snapshot().entries[7].key), data = xdr.LedgerEntryData.fromXDR(row.val, 'base64'); data.account().seqNum(xdr.SequenceNumber.fromString('9223372036854775807')); row.val = b64(data); refusal(() => verifyPublicLifecycleZeroRead(p));
});
test('valid diagnostic, absent optional arrays, reversed readonly keys and empty archival extension remain accepted', () => {
  const p = pure(); p.response.events = [diagnostic()]; p.response.id = 'synthetic'; delete p.response.stateChanges;
  resource(p, d => { d.ext(new xdr.SorobanTransactionDataExt(1, new xdr.SorobanResourcesExtV0({ archivedSorobanEntries: [] }))); d.resources().footprint().readOnly(d.resources().footprint().readOnly().reverse()); });
  assert.equal(verifyPublicLifecycleZeroRead(p).resultXdr, zero); delete p.response.events; assert.equal(verifyPublicLifecycleZeroRead(p).ledger, HEAD);
});
test('fee-bump envelope and prefilled source-account authorization cannot enter the getter', () => {
  const p = pure(); p.request.transaction = TransactionBuilder.buildFeeBumpTransaction(plan.actors.recipient, '100', TransactionBuilder.fromXDR(p.request.transaction, plan.networkPassphrase), plan.networkPassphrase).toXDR(); refusal(() => verifyPublicLifecycleZeroRead(p));
  const q = pure(); envelope(q, tx => { const op = tx.operations()[0].body().invokeHostFunctionOp(); op.auth([new xdr.SorobanAuthorizationEntry({ credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(), rootInvocation: new xdr.SorobanAuthorizedInvocation({ function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(op.hostFunction().invokeContract()), subInvocations: [] }) })]); }); refusal(() => verifyPublicLifecycleZeroRead(q));
});
test('fixed resource upper boundaries and diagnostic with no contract id are accepted', () => {
  const p = pure(); p.response.minResourceFee = '9999900'; resource(p, d => { d.resourceFee(xdr.Int64.fromString('9999900')); d.resources().instructions(10000000); d.resources().diskReadBytes(65536); });
  const event = xdr.DiagnosticEvent.fromXDR(diagnostic(), 'base64'); event.event().contractId(null); p.response.events = [b64(event)]; assert.equal(verifyPublicLifecycleZeroRead(p).resultXdr, zero);
});
test('hostile data cannot call getters/toJSON, leak thrown contents or exceed decoder bounds', () => {
  let getters = 0; const cases = [p => Object.defineProperty(p.response, 'latestLedger', { enumerable: true, get() { getters++; return HEAD; } }), p => { p.response.toJSON = () => { getters++; return {}; }; }, p => { p.response.events = new Array(2); }, p => { p.response[Symbol('hidden')] = 1; }, p => { p.response.self = p.response; }, p => { p.response = Object.assign(Object.create({ secret: true }), p.response); }, p => { p.response = new Proxy({}, { ownKeys() { throw Error('DO_NOT_LEAK'); } }); }, p => { p.response.id = 'x'.repeat(MAX); }];
  for (const change of cases) { const p = pure(); change(p); refusal(() => verifyPublicLifecycleZeroRead(p)); } assert.equal(getters, 0);
});
test('aggregate wrapper cap counts acquisition, request and complete zero response together', async t => {
  t.mock.method(Date, 'now', () => NOW * 1000); const fx = fixture({ transactions: 4500 });
  const event = xdr.DiagnosticEvent.fromXDR(diagnostic(), 'base64'); event.event().body().v0().data(xdr.ScVal.scvBytes(Buffer.alloc(43000))); fx.values.simulateTransaction.events = Array(16).fill(b64(event));
  assert.ok(Buffer.byteLength(JSON.stringify(fx.values.simulateTransaction)) < MAX);
  await assert.rejects(acquirePublicLifecycleBaseline({ plan, rpc: fx.rpc }), fail('BOUNDS')); assert.equal(fx.calls.length, 4);
});
test('abort before acquisition or during deferred zero RPC prevents later calls and sanitizes errors', async () => {
  const controller = new AbortController(); controller.abort(); const pre = fixture(); await assert.rejects(acquirePublicLifecycleBaseline({ plan, rpc: pre.rpc, signal: controller.signal }), fail('ABORTED')); assert.equal(pre.calls.length, 0);
  const later = new AbortController(), fx = fixture(), original = fx.rpc.request; let started; const pending = new Promise(r => { started = r; });
  fx.rpc.request = async (...args) => { if (args[0] === 'simulateTransaction') { fx.calls.push({ method: args[0] }); started(); return new Promise(() => {}); } return original(...args); };
  const run = acquirePublicLifecycleBaseline({ plan, rpc: fx.rpc, signal: later.signal }); await pending; later.abort(); await assert.rejects(run, fail('ABORTED')); assert.equal(fx.calls.length, 4);
  const bad = fixture(); bad.rpc.request = async () => { throw Error('PRIVATE_ERROR'); }; await assert.rejects(acquirePublicLifecycleBaseline({ plan, rpc: bad.rpc }), /^Error: LIFECYCLE_BASELINE_ACQUISITION$/);
});
test('no option can override the network, limits, clock, method or exact trusted-adapter shape', async () => {
  for (const field of ['url', 'nowSeconds', 'timeout', 'maxBytes', 'method', 'expected']) { const fx = fixture(); await assert.rejects(acquirePublicLifecycleBaseline({ plan, rpc: fx.rpc, [field]: 1 }), fail('INPUT')); assert.equal(fx.calls.length, 0); }
  let reads = 0; const rpc = {}; Object.defineProperty(rpc, 'request', { enumerable: true, get() { reads++; return () => {}; } }); await assert.rejects(acquirePublicLifecycleBaseline({ plan, rpc }), fail('INPUT')); assert.equal(reads, 0);
  const fx = fixture(); fx.rpc.extra = true; await assert.rejects(acquirePublicLifecycleBaseline({ plan, rpc: fx.rpc }), fail('INPUT')); assert.equal(fx.calls.length, 0);
});
test('freshness is rechecked after the simulation, whose error is sanitized with no retry', async t => {
  let now = NOW; t.mock.method(Date, 'now', () => now * 1000); const fx = fixture(), original = fx.rpc.request;
  fx.rpc.request = async (...args) => { const raw = await original(...args); if (args[0] === 'simulateTransaction') now += 90; return raw; };
  await assert.rejects(acquirePublicLifecycleBaseline({ plan, rpc: fx.rpc }), fail('TIME')); assert.equal(fx.calls.length, 4);
  const bad = fixture(), good = bad.rpc.request; bad.rpc.request = async (...args) => { if (args[0] === 'simulateTransaction') { bad.calls.push({ method: args[0] }); throw Error('RAW_SECRET'); } return good(...args); };
  await assert.rejects(acquirePublicLifecycleBaseline({ plan, rpc: bad.rpc }), fail('RPC')); assert.equal(bad.calls.length, 4);
});
test('caller mutation after acquisition begins cannot rebind plan, transport, snapshot or raw response', async () => {
  const inputPlan = clone(plan), fx = fixture(), original = fx.rpc.request; let changed = false;
  fx.rpc.request = async (...args) => { if (!changed) { changed = true; inputPlan.actors.seller = plan.actors.recipient; fx.rpc.request = () => { throw Error('CHANGED'); }; } return original(...args); };
  const out = await acquirePublicLifecycleBaseline({ plan: inputPlan, rpc: fx.rpc }); assert.equal(out.acquisition.planSha256.length, 64); assert.equal(fx.calls.length, 4);
  fx.values.simulateTransaction.results[0].xdr = 'changed'; assert.equal(out.zeroRead.response.results[0].xdr, zero);
});
test(`${real ? 'actual pinned WASM' : 'executable-auth-only unit double'}: initial state composes and funded omission still fails closed`, async t => {
  t.mock.method(Date, 'now', () => NOW * 1000); const fx = fixture(), baseline = await acquirePublicLifecycleBaseline({ plan, rpc: fx.rpc });
  const initial = initialPublicLifecycleState({ plan, response: baseline.acquisition.response, headerEvidence: baseline.acquisition.headerEvidence, zeroBalanceEvidence: baseline.zeroBalanceEvidence });
  assert.equal(initial.snapshot.nativeReserveStroops, '0'); assert.equal(initial.expected.fundedHistory, false); assert.equal(initial.remainingBudget.seller.requiredStroops, '280000001');
  const records = []; f.advance(records, 0); const accounts = f.accounts(); accounts.seller.sequence = '11'; accounts.seller.balance = '989999900'; accounts.seller.lastModifiedLedgerSeq = HEAD + 1; accounts.seller.accountEntryXdr = b64(f.account('seller', accounts.seller.balance, accounts.seller.sequence));
  const after = f.snapshot(HEAD + 1, records, accounts); after.entries.splice(6, 1);
  assert.throws(() => derivePublicLifecycleState({ plan, initial, prefix: [], stepId: plan.steps[0].id, binding: f.binding(0, HEAD, f.accounts()), phase: 'after', inclusion: { status: 'SUCCESS', ledger: HEAD + 1, createdId: '1' }, response: after, headerEvidence: f.header(HEAD + 1) }), /LIFECYCLE_READBACK_ZERO_EVIDENCE/);
});
test('zero at H cannot authorize a final initial snapshot H+1; a fresh exact-head zero and new initial brand can', async t => {
  t.mock.method(Date, 'now', () => NOW * 1000); const fx = fixture(), baseline = await acquirePublicLifecycleBaseline({ plan, rpc: fx.rpc });
  const later = f.snapshot(HEAD + 1); later.entries.splice(6, 1);
  const args = { plan, response: later, headerEvidence: f.header(HEAD + 1), zeroBalanceEvidence: baseline.zeroBalanceEvidence };
  assert.throws(() => initialPublicLifecycleState(args), /LIFECYCLE_READBACK_ZERO_EVIDENCE/);
  const raw = pure(); raw.snapshot = later; raw.response.latestLedger = HEAD + 1;
  const newEvidence = verifyPublicLifecycleZeroRead(raw), initial = initialPublicLifecycleState({ ...args, zeroBalanceEvidence: newEvidence });
  assert.equal(initial.snapshot.ledger, HEAD + 1); assert.equal(initial.expected.zeroBalanceEvidence.ledger, HEAD + 1);
});
for (const kind of ['pure', 'async']) test(`${kind} boundary sanitizes nested thrown Proxies without consulting their prototype`, async () => {
  let prototypeReads = 0;
  const hostile = () => new Proxy({}, { ownKeys() { throw new Proxy({}, { getPrototypeOf() { prototypeReads++; throw Error('PRIVATE_SECRET'); } }); } });
  if (kind === 'pure') { const p = pure(); p.response = hostile(); assert.throws(() => verifyPublicLifecycleZeroRead(p), fail('INPUT')); }
  else { const fx = fixture(); fx.values.simulateTransaction = hostile(); await assert.rejects(acquirePublicLifecycleBaseline({ plan, rpc: fx.rpc }), fail('INPUT')); }
  assert.equal(prototypeReads, 0);
});
for (const kind of ['pure', 'async']) test(`${kind} exposed error constructor cannot counterfeit private refusal branding or arbitrary error suffixes`, async () => {
  let Constructor; try { verifyPublicLifecycleZeroRead({}); } catch (error) { Constructor = error.constructor; }
  assert.equal(typeof Constructor, 'function');
  const hostile = () => new Proxy({}, { ownKeys() { throw new Constructor('PRIVATE_SECRET'); } });
  if (kind === 'pure') { const p = pure(); p.response = hostile(); assert.throws(() => verifyPublicLifecycleZeroRead(p), fail('INPUT')); }
  else { const fx = fixture(); fx.values.simulateTransaction = hostile(); await assert.rejects(acquirePublicLifecycleBaseline({ plan, rpc: fx.rpc }), fail('INPUT')); }
});
for (const kind of ['pure', 'async']) test(`${kind} boundary reconstructs a genuine mutated refusal from its private fixed code`, async () => {
  let owned; try { verifyPublicLifecycleZeroRead({}); } catch (error) { owned = error; }
  owned.message = 'PRIVATE_SECRET'; owned.stack = 'PRIVATE_SECRET'; owned.cause = Error('PRIVATE_SECRET');
  const hostile = new Proxy({}, { ownKeys() { throw owned; } });
  const fresh = error => { assert.notEqual(error, owned); assert.ok(!error.stack.includes('PRIVATE_SECRET')); return fail('INPUT')(error); };
  if (kind === 'pure') { const p = pure(); p.response = hostile; assert.throws(() => verifyPublicLifecycleZeroRead(p), fresh); }
  else { const fx = fixture(); fx.values.simulateTransaction = hostile; await assert.rejects(acquirePublicLifecycleBaseline({ plan, rpc: fx.rpc }), fresh); }
});
