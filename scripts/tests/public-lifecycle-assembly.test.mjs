import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { buildPublicLifecyclePlan, hashPublicLifecyclePlan } from '../lib/public-lifecycle-plan.mjs';
import { publicLifecycleCallIntent, bindPublicLifecycleCall } from '../lib/public-lifecycle-call.mjs';
import { assemblePublicLifecycleTransaction } from '../lib/public-lifecycle-assembly.mjs';
const { Account, Address, Contract, Keypair, Operation, SorobanDataBuilder, TransactionBuilder, nativeToScVal, rpc, xdr } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
// Synthetic, unfunded credential fixtures only; no outer transaction is signed.
const roles = ['recipient', 'relayer', 'venue', 'podTimelock', 'podMixed', 'attester', 'agent'];
const keys = Object.fromEntries(roles.map((role, i) => [role, Keypair.fromRawEd25519Seed(Buffer.alloc(32, 210 + i))]));
const plan = buildPublicLifecyclePlan({ preparedAt: '2026-09-27T17:00:00.000Z', recipient: keys.recipient.publicKey(), relayer: keys.relayer.publicKey(), credentialKeys: Object.fromEntries(roles.slice(2).map(role => [role, keys[role].publicKey()])) });
const NOW = 1800000000, HEAD = 5000000, b64 = value => value.toXDR('base64');
const addr = value => new Address(value).toScVal();
const integer = (n, type = 'i128') => nativeToScVal(BigInt(n), { type });
function tree(target, method, args, children = []) {
  return new xdr.SorobanAuthorizedInvocation({ function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new xdr.InvokeContractArgs({ contractAddress: new Address(target).toScAddress(), functionName: method, args })), subInvocations: children });
}
function fixture(index = 0) {
  const step = plan.steps[index], options = { plan, stepId: step.id, headLedger: HEAD, ...(['confirm_handoff', 'attest', 'envoy_claim'].includes(step.method) ? { timestamp: String(NOW) } : {}) };
  const intent = publicLifecycleCallIntent(options);
  if (intent.credential) options.signatureHex = keys[intent.credential.role].sign(Buffer.from(intent.credential.payloadHex, 'hex')).toString('hex');
  const derived = bindPublicLifecycleCall(options), call = derived.call, args = call.argsXdr.map(s => xdr.ScVal.fromXDR(s, 'base64'));
  let required = ['create_fade', 'create_pod', 'create_trigger', 'claim', 'claim_pod', 'create_mandate', 'revoke_mandate', 'transfer'].includes(step.method), children = [];
  if (['create_fade', 'create_pod', 'create_trigger'].includes(step.method)) children = [tree(plan.assets[0], 'transfer', [addr(plan.actors.seller), addr(plan.contractId), integer(10000000)])];
  if (step.method === 'confirm_handoff' && step.record === 'fade-positive') { required = true; children = [tree(plan.assets[0], 'transfer', [addr(plan.actors.recipient), addr(plan.actors.seller), integer(1000000)])]; }
  const auth = required ? [b64(new xdr.SorobanAuthorizationEntry({ credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(), rootInvocation: tree(call.target, call.method, args, children) }))] : [];
  const unsigned = new TransactionBuilder(new Account(call.sourceAccount, '10'), { fee: '100', networkPassphrase: plan.networkPassphrase })
    .addOperation(Operation.invokeContractFunction({ contract: call.target, function: call.method, args, auth: [] })).setTimebounds(0, NOW + 90).build();
  const data = new SorobanDataBuilder().setResourceFee('700').setReadWrite([new Contract(plan.contractId).getFootprint()]).build();
  const binding = { sequence: '11', headLedger: HEAD, argsXdr: call.argsXdr, ...(options.timestamp ? { timestamp: options.timestamp } : {}), ...(options.signatureHex ? { signatureHex: options.signatureHex } : {}) };
  return { plan, stepId: step.id, binding, unsignedXdr: unsigned.toXDR(), nowSeconds: NOW,
    simulation: { latestLedger: HEAD, transactionData: b64(data), minResourceFee: '700', results: [{ xdr: derived.expectedCreatedId ? b64(integer(derived.expectedCreatedId, 'u64')) : b64(xdr.ScVal.scvVoid()), auth }], events: [] } };
}
function mutateEnvelope(input, change) { const env = xdr.TransactionEnvelope.fromXDR(input.unsignedXdr, 'base64'); change(env.v1().tx(), env); input.unsignedXdr = b64(env); }
function mutateData(input, change) { const data = xdr.SorobanTransactionData.fromXDR(input.simulation.transactionData, 'base64'); change(data); input.simulation.transactionData = b64(data); }
const refusal = fn => assert.throws(fn, /^Error: LIFECYCLE_ASSEMBLY_[A-Z_]+$/);

test('all 39 exact scheduled calls assemble locally with preserved raw input and bounded fee', () => {
  let network = 0; const originalFetch = globalThis.fetch; globalThis.fetch = () => { network++; throw Error('NO_NETWORK'); };
  try {
    for (let i = 0; i < 39; i++) {
      const input = fixture(i), before = JSON.stringify(input), out = assemblePublicLifecycleTransaction(input);
      assert.equal(out instanceof Promise, false); assert.equal(JSON.stringify(input), before); assert.ok(Object.isFrozen(out));
      const tx = TransactionBuilder.fromXDR(out.envelopeXdr, plan.networkPassphrase), env = tx.toEnvelope();
      assert.equal(tx.fee, '800'); assert.equal(tx.sequence, '11'); assert.equal(tx.source, plan.steps[i].sourceAccount);
      assert.deepEqual(tx.timeBounds, { minTime: '0', maxTime: String(NOW + 90) }); assert.equal(tx.signatures.length, 0);
      assert.equal(b64(env.v1().tx().ext().sorobanData()), input.simulation.transactionData);
      assert.deepEqual(env.v1().tx().operations()[0].body().invokeHostFunctionOp().auth().map(b64), input.simulation.results[0].auth);
      assert.equal(out.hash, tx.hash().toString('hex')); assert.equal(out.feeStroops, '800'); assert.equal(out.resourceFeeStroops, '700'); assert.equal(out.simulationLedger, HEAD);
      assert.equal(out.expectedCreatedId, plan.steps[i].method.startsWith('create_') ? xdr.ScVal.fromXDR(input.simulation.results[0].xdr, 'base64').u64().toString() : null);
    }
    assert.equal(network, 0);
  } finally { globalThis.fetch = originalFetch; }
});

for (const [name, change] of [
  ...['_parsed', 'error', 'restorePreamble'].flatMap(k => [undefined, null, false, '', {}].map(v => [`${k} presence ${String(v)}`, f => { f.simulation[k] = v; }])),
  ['unknown success field', f => { f.simulation.success = true; }],
  ['undocumented cost object', f => { f.simulation.cost = { cpuInsns: '1', memBytes: '1' }; }],
  ...['transactionData', 'minResourceFee', 'results'].map(k => [`missing ${k}`, f => { delete f.simulation[k]; }]),
  ['no result', f => { f.simulation.results = []; }], ['two results', f => { f.simulation.results.push(f.simulation.results[0]); }],
  ['missing explicit retval', f => { delete f.simulation.results[0].xdr; }], ['missing explicit auth', f => { delete f.simulation.results[0].auth; }],
  ['wrong create ID', f => { f.simulation.results[0].xdr = b64(integer(2, 'u64')); }], ['void create return', f => { f.simulation.results[0].xdr = b64(xdr.ScVal.scvVoid()); }],
  ['parsed retval', f => { f.simulation.results[0].xdr = xdr.ScVal.scvVoid(); }], ['result alias', f => { f.simulation.results[0].retval = f.simulation.results[0].xdr; }],
  ['resource fee mismatch', f => { f.simulation.minResourceFee = '900'; }], ['leading zero fee', f => { f.simulation.minResourceFee = '0700'; }],
  ['negative fee', f => { f.simulation.minResourceFee = '-1'; }], ['number fee', f => { f.simulation.minResourceFee = 700; }],
  ['encoded negative resource fee', f => { mutateData(f, d => d.resourceFee(xdr.Int64.fromString('-1'))); }],
  ['fee above cap', f => { mutateData(f, d => d.resourceFee(xdr.Int64.fromString('9999901'))); f.simulation.minResourceFee = '9999901'; }],
  ['automatic resource restoration', f => { mutateData(f, d => d.ext(new xdr.SorobanTransactionDataExt(1, new xdr.SorobanResourcesExtV0({ archivedSorobanEntries: [0] })))); }],
  ...['transactionData'].map(k => [`noncanonical ${k}`, f => { f.simulation[k] += '\n'; }]),
  ['noncanonical auth', f => { f.simulation.results[0].auth[0] += '\n'; }],
  ['invalid event', f => { f.simulation.events = ['AAAA']; }], ['parsed event', f => { f.simulation.events = [{}]; }],
  ['extra auth', f => { f.simulation.results[0].auth.push(f.simulation.results[0].auth[0]); }], ['missing required auth', f => { f.simulation.results[0].auth = []; }],
  ['changed source tree', f => { const a = xdr.SorobanAuthorizationEntry.fromXDR(f.simulation.results[0].auth[0], 'base64'); a.rootInvocation().function().contractFn().functionName('refund'); f.simulation.results[0].auth[0] = b64(a); }],
  ['foreign auth subtree', f => { const a = xdr.SorobanAuthorizationEntry.fromXDR(f.simulation.results[0].auth[0], 'base64'); a.rootInvocation().subInvocations()[0].function().contractFn().contractAddress(new Address(plan.assets[1]).toScAddress()); f.simulation.results[0].auth[0] = b64(a); }],
  ['address credentials', f => { const a = xdr.SorobanAuthorizationEntry.fromXDR(f.simulation.results[0].auth[0], 'base64'); a.credentials(xdr.SorobanCredentials.sorobanCredentialsAddress(new xdr.SorobanAddressCredentials({ address: new Address(plan.actors.seller).toScAddress(), nonce: xdr.Int64.fromString('1'), signatureExpirationLedger: HEAD + 20, signature: xdr.ScVal.scvVoid() }))); f.simulation.results[0].auth[0] = b64(a); }],
]) test(`refuses ${name} without SDK normalization hiding the raw contradiction`, () => { const input = fixture(); change(input); refusal(() => assemblePublicLifecycleTransaction(input)); });

for (const [name, change] of [
  ['prefilled auth', (tx, env, f) => tx.operations()[0].body().invokeHostFunctionOp().auth(f.simulation.results[0].auth.map(v => xdr.SorobanAuthorizationEntry.fromXDR(v, 'base64')))],
  ['prefilled resource data', (tx, env, f) => tx.ext(new xdr.TransactionExt(1, xdr.SorobanTransactionData.fromXDR(f.simulation.transactionData, 'base64')))],
  ['outer signature', (tx, env) => env.v1().signatures([new xdr.DecoratedSignature({ hint: Buffer.alloc(4), signature: Buffer.alloc(64) })])],
  ['wrong source', tx => tx.sourceAccount(xdr.MuxedAccount.keyTypeEd25519(keys.recipient.rawPublicKey()))],
  ['muxed source', tx => tx.sourceAccount(xdr.MuxedAccount.keyTypeMuxedEd25519(new xdr.MuxedAccountMed25519({ id: xdr.Uint64.fromString('1'), ed25519: keys.recipient.rawPublicKey() })))],
  ['wrong sequence', tx => tx.seqNum(xdr.SequenceNumber.fromString('12'))], ['inclusion bid change', tx => tx.fee(101)],
  ['memo', tx => tx.memo(xdr.Memo.memoText('unsafe'))], ['duplicate operation', tx => tx.operations([tx.operations()[0], tx.operations()[0]])],
  ['operation source', tx => tx.operations()[0].sourceAccount(tx.sourceAccount())],
  ['wrong argument', tx => { const fn = tx.operations()[0].body().invokeHostFunctionOp().hostFunction().invokeContract(), args = fn.args(); args[2] = integer(1); fn.args(args); }],
  ['wrong target', tx => tx.operations()[0].body().invokeHostFunctionOp().hostFunction().invokeContract().contractAddress(new Address(plan.assets[1]).toScAddress())],
  ['no time bounds', tx => tx.cond(xdr.Preconditions.precondNone())],
  ['expired time', tx => tx.cond().timeBounds().maxTime(xdr.Uint64.fromString(String(NOW)))],
  ['expanded time', tx => tx.cond().timeBounds().maxTime(xdr.Uint64.fromString(String(NOW + 91)))],
]) test(`refuses fresh request with ${name}`, () => { const f = fixture(); mutateEnvelope(f, (tx, env) => change(tx, env, f)); refusal(() => assemblePublicLifecycleTransaction(f)); });

test('freshness requires a positive uint32 within exactly two ledgers, without overflow', () => {
  for (const delta of [0, 1, 2]) { const f = fixture(); f.simulation.latestLedger += delta; assert.equal(assemblePublicLifecycleTransaction(f).simulationLedger, HEAD + delta); }
  for (const ledger of [HEAD - 1, HEAD + 3, 0, -1, '5000000', 1.5, 0x100000000]) { const f = fixture(); f.simulation.latestLedger = ledger; refusal(() => assemblePublicLifecycleTransaction(f)); }
  for (const nowSeconds of [0, -1, '1800000000', Infinity]) refusal(() => assemblePublicLifecycleTransaction({ ...fixture(), nowSeconds }));
  const f = fixture(1); f.binding.headLedger = 0xfffffffe; f.simulation.latestLedger = 0xffffffff; assert.equal(assemblePublicLifecycleTransaction(f).simulationLedger, 0xffffffff);
});

test('fee boundaries and empty archival extension use exact encoded resource fee', () => {
  for (const fee of ['0', '9999900']) {
    const f = fixture(); f.simulation.minResourceFee = fee;
    mutateData(f, d => { d.resourceFee(xdr.Int64.fromString(fee)); d.ext(new xdr.SorobanTransactionDataExt(1, new xdr.SorobanResourcesExtV0({ archivedSorobanEntries: [] }))); });
    const out = assemblePublicLifecycleTransaction(f); assert.equal(out.feeStroops, fee === '0' ? '100' : '10000000'); assert.equal(out.resourceFeeStroops, fee);
  }
  const f = fixture(); const inner = TransactionBuilder.fromXDR(f.unsignedXdr, plan.networkPassphrase);
  f.unsignedXdr = TransactionBuilder.buildFeeBumpTransaction(plan.actors.recipient, '100', inner, plan.networkPassphrase).toXDR();
  refusal(() => assemblePublicLifecycleTransaction(f));
});

test('forbidden raw fields and invalid exact auth fail before local SDK assembly', t => {
  const calls = t.mock.method(rpc, 'assembleTransaction', () => { throw Error('SDK_MUST_NOT_RUN'); });
  for (const change of [f => { f.simulation.restorePreamble = null; }, f => { f.simulation.results.push(f.simulation.results[0]); }, f => { f.simulation.results[0].auth = []; }, f => { f.simulation.minResourceFee = '900'; }]) {
    const f = fixture(); change(f); refusal(() => assemblePublicLifecycleTransaction(f));
  }
  assert.equal(calls.mock.callCount(), 0);
});

test('changed local assembly output is refused instead of silently rebinding the signed body', t => {
  const original = rpc.assembleTransaction;
  t.mock.method(rpc, 'assembleTransaction', (...args) => { const builder = original(...args); return { build() { const tx = builder.build(), env = tx.toEnvelope(); env.v1().tx().fee(801); return TransactionBuilder.fromXDR(b64(env), plan.networkPassphrase); } }; });
  assert.throws(() => assemblePublicLifecycleTransaction(fixture()), /LIFECYCLE_ASSEMBLY_PRESERVATION/);
});

test('immutable plan, exact binding and method return type are independently enforced', () => {
  const changed = fixture(); changed.plan = structuredClone(plan); changed.plan.steps[0].terms.amount = '1'; refusal(() => assemblePublicLifecycleTransaction(changed));
  for (const change of [f => { f.binding.argsXdr = []; }, f => { f.binding.sequence = '011'; }, f => { f.stepId = 'unknown'; }, f => { f.binding.headLedger = 0; }, f => { f.binding.target = plan.assets[1]; }, f => { f.policy = () => true; }]) { const f = fixture(); change(f); refusal(() => assemblePublicLifecycleTransaction(f)); }
  const transition = fixture(1); transition.simulation.results[0].xdr = b64(integer(1, 'u64')); refusal(() => assemblePublicLifecycleTransaction(transition));
  const permissionless = fixture(2); permissionless.simulation.results[0].auth = fixture().simulation.results[0].auth; refusal(() => assemblePublicLifecycleTransaction(permissionless));
});

test('plain bounded JSON rejects accessors, prototypes, sparse arrays and hostile exceptions without invoking getters', () => {
  let calls = 0;
  const cases = [
    f => Object.defineProperty(f.simulation, 'latestLedger', { get() { calls++; return HEAD; }, enumerable: true }),
    f => Object.defineProperty(f.simulation.results, '0', { get() { calls++; return {}; }, enumerable: true }),
    f => { f.simulation.toJSON = () => { calls++; return {}; }; },
    f => { f.simulation = Object.assign(Object.create({ hidden: true }), f.simulation); },
    f => { f.simulation.events = new Array(2); }, f => { f.simulation.events.extra = 'hidden'; },
    f => { f.simulation[Symbol('hidden')] = true; }, f => { f.simulation.self = f.simulation; },
    f => { f.simulation.id = 'x'.repeat(2 * 1024 * 1024); },
    f => { f.simulation = new Proxy({}, { ownKeys() { throw Error('UNTRUSTED_SECRET'); } }); },
  ];
  for (const change of cases) { const f = fixture(); change(f); refusal(() => assemblePublicLifecycleTransaction(f)); }
  assert.equal(calls, 0);
});

test('canonical optional diagnostic and state-change XDR survive unchanged but confer no inclusion authority', () => {
  const f = fixture(), key = new Contract(plan.contractId).getFootprint();
  const data = new xdr.LedgerEntryData.contractData(new xdr.ContractDataEntry({ ext: new xdr.ExtensionPoint(0), contract: new Address(plan.contractId).toScAddress(), key: xdr.ScVal.scvSymbol('test'), durability: xdr.ContractDataDurability.persistent(), val: integer(0) }));
  const row = new xdr.LedgerEntry({ lastModifiedLedgerSeq: HEAD, data, ext: new xdr.LedgerEntryExt(0) });
  const event = new xdr.DiagnosticEvent({ inSuccessfulContractCall: true, event: new xdr.ContractEvent({ ext: new xdr.ExtensionPoint(0), contractId: null, type: xdr.ContractEventType.diagnostic(), body: new xdr.ContractEventBody(0, new xdr.ContractEventV0({ topics: [], data: xdr.ScVal.scvVoid() })) }) });
  // Actual Testnet positive capture uses string types despite SDK .d.ts number.
  f.simulation.id = 'synthetic'; f.simulation.events = [b64(event)]; f.simulation.stateChanges = [{ type: 'created', key: b64(key), before: null, after: b64(row) }, { type: 'updated', key: b64(key), before: b64(row), after: b64(row) }, { type: 'deleted', key: b64(key), before: b64(row), after: null }];
  const saved = JSON.stringify(f.simulation); assert.equal(assemblePublicLifecycleTransaction(f).feeStroops, '800'); assert.equal(JSON.stringify(f.simulation), saved);
  for (const change of [r => { r.type = 0; }, r => { r.type = 'unknown'; }, r => { r.type = 'updated'; }, r => { r.before = b64(row); }, r => { r.after = null; }, r => { r.after += '\n'; }, r => { r.key = 'AAAA'; }, r => { delete r.before; }, r => { r.unknown = true; }]) { const bad = structuredClone(f); change(bad.simulation.stateChanges[0]); refusal(() => assemblePublicLifecycleTransaction(bad)); }
});

test('actual captured positive Testnet wire assembles at its historical time and refuses expired signing time', () => {
  const captured = JSON.parse(readFileSync(new URL('./fixtures/public-v4-positive-assembly.json', import.meta.url), 'utf8'));
  const digest = value => createHash('sha256').update(JSON.stringify(value, null, 2) + '\n').digest('hex');
  const restoredPlan = buildPublicLifecyclePlan(captured.planInputs), saved = captured.input;
  assert.equal(digest(restoredPlan), '96d5687695596558a023e8f063ab9b0f1be13b8504dbbf036a6b549f7bca966c');
  assert.equal(digest(restoredPlan), captured.provenance.originalPlanFileSha256);
  assert.equal(hashPublicLifecyclePlan(restoredPlan), captured.provenance.originalPlanSha256);
  assert.equal(hashPublicLifecyclePlan(restoredPlan), saved.planSha256);
  assert.equal(digest(saved), 'ba35e9e6b15b16e0a790b61e5c8ffc674ab734b693a3683c91caadd405a6c877');
  assert.equal(digest(captured.simulation), '5d58a0ae4feacdfe3af87d992bc0e6cc8407138bb6175b47e28e18138fb00ffe');
  const input = { plan: restoredPlan, stepId: saved.stepId, binding: saved.binding, unsignedXdr: saved.unsignedXdr, simulation: captured.simulation, nowSeconds: saved.nowSeconds };
  const before = JSON.stringify(captured), out = assemblePublicLifecycleTransaction(input);
  assert.equal(out.feeStroops, '714238'); assert.equal(out.resourceFeeStroops, '714138'); assert.equal(out.expectedCreatedId, '1'); assert.equal(out.simulationLedger, 4902687);
  assert.equal(out.hash, '37fe6da312d92490d52d173a44e9c0b63e81b7ce6b661d0fe135fa4a661c2607');
  assert.equal(TransactionBuilder.fromXDR(out.envelopeXdr, restoredPlan.networkPassphrase).signatures.length, 0);
  assert.equal(JSON.stringify(captured), before);
  assert.throws(() => assemblePublicLifecycleTransaction({ ...input, nowSeconds: saved.nowSeconds + 91 }), /LIFECYCLE_ASSEMBLY_ENVELOPE/);
});
