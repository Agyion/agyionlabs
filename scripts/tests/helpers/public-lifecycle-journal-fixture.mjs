/** Synthetic local journal integration. Deterministic unfunded test keys only.
 * The fixed seller is substituted ONLY through the Node test-module facility.
 * No production options, real private keys, network or contract execution.
 * Raw fee/refund and ledger evidence below are constructed test fixtures.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mock } from 'node:test';
const [home, mode] = process.argv.slice(2);
assert.ok(home && path.isAbsolute(home) && ['unit', 'real'].includes(mode));
const realWasm = mode === 'real', count = realWasm ? 39 : 38;
// The child uses one explicit synthetic clock for signing bounds, persisted
// validation time, ledger headers and transaction metadata. Never real time.
let fixtureNow = 1800001000;
Date.now = () => fixtureNow * 1000;
const url = name => new URL('../../lib/' + name, import.meta.url).href;
const { Account, Address, Keypair, Networks, Operation, SorobanDataBuilder, StrKey, TransactionBuilder, nativeToScVal, xdr } = createRequire(new URL('../../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
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
const { createPublicLifecyclePolicies } = await import(url('public-lifecycle-policies.mjs'));
const { createStateFixture } = await import('./public-lifecycle-state-fixture.mjs');
const { createObservationFixture, loadLocalObservationPinFixture } = await import('./public-lifecycle-observation-fixture.mjs');
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
const records = [], prefix = []; let accounts = f.accounts(), sends = 0, signs = 0, maxPolicyBytes = 0, netFees = 0n;
const initialResponse = f.snapshot(), initialHeader = f.header();
const initial = S.initialPublicLifecycleState({ plan, response: initialResponse, zeroBalanceEvidence: null, headerEvidence: initialHeader });
const policies = createPublicLifecyclePolicies(), checkedPolicies = Object.fromEntries(Object.entries(policies).map(([name, fn]) => [name, input => {
  maxPolicyBytes = Math.max(maxPolicyBytes, Buffer.byteLength(canonical(input))); return fn(input);
}]));
const minimalPrefix = () => prefix.map(r => ({ stepId: r.stepId, binding: r.binding,
  inclusion: { status: r.inclusion.status, ledger: r.inclusion.ledger, createdId: r.inclusion.createdId },
  fee: { authorizedFee: r.fee.authorizedFee, netFee: r.fee.netFee }, after: { ledger: r.after.ledger, accounts: r.after.accounts } }));
function stateAt(index, binding, phase, included = null) {
  const head = phase === 'before' ? f.heads[index] : f.heads[index] + 1;
  const response = f.snapshot(head, records, accounts, '0', index > 34 || (index === 34 && phase === 'after'));
  const headerEvidence = f.header(head), state = S.derivePublicLifecycleState({ plan, initial, prefix: minimalPrefix(), stepId: plan.steps[index].id,
    binding, phase, inclusion: included, response, headerEvidence });
  assert.deepEqual(state.expected.records, records.map(({ type: _type, ...r }) => r));
  return { state, response, headerEvidence };
}
function evidence(index, phase, facts) {
  const current = facts.state.snapshot.ledger, historical = new Set([current]);
  for (const r of records) {
    if (r.value.unlock_ledger) historical.add(r.value.unlock_ledger - 1);
    if (r.value.deadline_ledger) historical.add(r.value.deadline_ledger);
    if (r.value.claimed_at) historical.add(r.value.claimed_at + r.value.handoff_window);
  }
  const historySnapshots = Object.fromEntries([...historical].filter(h => h > 0 && h <= current).map(h => [String(h), {
    response: f.snapshot(h, records, accounts, '0', index > 34 || (index === 34 && phase === 'after')),
    headerEvidence: f.header(h), zeroBalanceEvidence: null,
  }]));
  const pins = index === 38 && phase === 'after' ? loadLocalObservationPinFixture({ ledger: current }) : undefined;
  return { snapshot: { expected: facts.state.expected, response: facts.response, headerEvidence: facts.headerEvidence },
    observations: createObservationFixture({ plan, credentialSigners: keys, stepId: plan.steps[index].id, phase,
      state: facts.state, currentSnapshotResponse: facts.response, headerEvidence: facts.headerEvidence, historySnapshots,
      ...(pins ? { pins } : {}) }) };
}
let finalRecovery;
for (let index = 0; index < count; index++) {
  fixtureNow = 1800000000 + f.heads[index];
  const step = plan.steps[index], binding = f.binding(index, f.heads[index], accounts), pre = stateAt(index, binding, 'before');
  const beforeEvidence = evidence(index, 'before', pre), before = structuredClone(accounts);
  const deltas = Object.fromEntries(roles.map((r, i) => [r, String(f.business[index][i] || 0)]));
  let claim, response, id;
  const options = { ...base, ...checkedPolicies, stepId: step.id, binding, evidence: beforeEvidence,
    prepare: async input => { claim = input.claim; assert.deepEqual(claim.derived.businessDeltas, deltas); return { envelopeXdr: unsigned(claim) }; },
    sign: async ({ unsignedXdr }) => { signs++; const tx = TransactionBuilder.fromXDR(unsignedXdr, Networks.TESTNET); tx.sign(keys[step.sourceRole]); return tx.toXDR(); },
    sendTransaction: async signed => { sends++; id = f.advance(records, index); const result = receipt(claim, signed, before, deltas, id);
      accounts = result.after; response = result.response; throw Error('synthetic unknown send acknowledgement'); },
    getTransaction: async hash => { assert.equal(hash, response.txHash); return response; },
    collectEvidence: async input => { assert.equal(input.prefix.length, index); return evidence(index, 'after', stateAt(index, binding, 'after',
      { status: 'SUCCESS', ledger: response.ledger, createdId: id })); },
  };
  const result = await J.executePublicLifecycleStep(options); assert.equal(result.status, 'complete');
  const completion = JSON.parse(fs.readFileSync(path.join(run, step.id + '.completion.json'), 'utf8'));
  const verified = completion.verified; assert.equal(verified.fee.netFee, '400'); netFees += BigInt(verified.fee.netFee);
  prefix.push({ stepId: step.id, binding, inclusion: { status: 'SUCCESS', ledger: response.ledger, createdId: id, hash: response.txHash },
    fee: verified.fee, before: verified.before.snapshot, after: verified.after.snapshot,
    observations: { before: verified.before.observations, after: verified.after.observations },
    completionSha256: digest(completion), evidenceSha256: { before: digest(beforeEvidence), after: digest(completion.evidence) } });
  const { binding: _b, evidence: _e, prepare: _p, sign: _s, sendTransaction: _t, ...recovery } = options;
  finalRecovery = recovery;
}
let recoveryNetworkCalls = 0;
const recovered = await J.recoverPublicLifecycleStep({ ...finalRecovery, getTransaction: async () => { recoveryNetworkCalls++; throw Error('completed replay must not use network'); } });
assert.equal(recovered.status, 'complete');
// Mutate retained RAW evidence, leaving all serialized success acknowledgments
// intact. Replay must reject before trusting them or opening another send path.
const file = path.join(run, plan.steps[count - 1].id + '.completion.json'), bytes = fs.readFileSync(file);
const changed = JSON.parse(bytes); changed.evidence.snapshot.response.entries[0].val += '\n';
fs.writeFileSync(file, JSON.stringify(changed));
await assert.rejects(J.recoverPublicLifecycleStep(finalRecovery), /LIFECYCLE_STATE_XDR/);
assert.equal(sends, count); assert.equal(signs, count);
console.log(JSON.stringify({ completed: count, sends, signs, netFees: String(netFees), recoveryNetworkCalls,
  rawTamperRejected: true, maxPolicyBytes, codeBytesAuthenticated: realWasm ? 'actual pinned bytes' : 'unit-only byte-auth double' }));
