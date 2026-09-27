import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { Account, Address, Asset, Keypair, Networks, Operation, SorobanDataBuilder, StrKey, TransactionBuilder, nativeToScVal, xdr } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const subject = await import('../lib/public-lifecycle-fees.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const roles = ['seller', 'recipient', 'relayer'];
// Public, deterministic SYNTHETIC test identities only; never funded or sent.
const keys = Object.fromEntries(roles.map((role, i) => [role, Keypair.fromRawEd25519Seed(Buffer.alloc(32, i + 11))]));
const contract = StrKey.encodeContract(Buffer.alloc(32, 7));
const sac = Asset.native().contractId(Networks.TESTNET);
const ledger = 100, closeTime = '1790521042';
const int = n => xdr.Int64.fromString(String(n));
const encode = value => value.toXDR('base64');
const copyAccount = a => xdr.AccountEntry.fromXDR(a.toXDR());
function account(role, balance, sequence) {
  return new xdr.AccountEntry({ accountId: keys[role].xdrPublicKey(), balance: int(balance), seqNum: int(sequence), numSubEntries: 0, inflationDest: null, flags: 0, homeDomain: '', thresholds: Buffer.from([1, 0, 0, 0]), signers: [], ext: new xdr.AccountEntryExt(0) });
}
function stamp(a) {
  a.ext(new xdr.AccountEntryExt(1, new xdr.AccountEntryExtensionV1({ liabilities: new xdr.Liabilities({ buying: int(0), selling: int(0) }), ext: new xdr.AccountEntryExtensionV1Ext(2, new xdr.AccountEntryExtensionV2({ numSponsored: 0, numSponsoring: 0, signerSponsoringIDs: [], ext: new xdr.AccountEntryExtensionV2Ext(3, new xdr.AccountEntryExtensionV3({ ext: new xdr.ExtensionPoint(0), seqLedger: ledger, seqTime: xdr.Uint64.fromString(closeTime) })) })) })));
  return a;
}
function entry(a, last = ledger) { return new xdr.LedgerEntry({ lastModifiedLedgerSeq: last, data: xdr.LedgerEntryData.account(a), ext: new xdr.LedgerEntryExt(0) }); }
const state = (a, last) => xdr.LedgerEntryChange.ledgerEntryState(entry(a, last));
const updated = a => xdr.LedgerEntryChange.ledgerEntryUpdated(entry(a));
function feeEvent(source, amount, stage) {
  return new xdr.TransactionEvent({ stage, event: new xdr.ContractEvent({ ext: new xdr.ExtensionPoint(0), contractId: StrKey.decodeContract(sac), type: xdr.ContractEventType.contract(), body: new xdr.ContractEventBody(0, new xdr.ContractEventV0({ topics: [xdr.ScVal.scvSymbol('fee'), new Address(source).toScVal()], data: nativeToScVal(BigInt(amount), { type: 'i128' }) })) }) });
}
function snapshot(accounts, head, modified) {
  return { ledger: head, accounts: Object.fromEntries(roles.map(role => {
    const a = accounts[role];
    return [role, { address: keys[role].publicKey(), balance: a.balance().toString(), sequence: a.seqNum().toString(), accountEntryXdr: encode(a), lastModifiedLedgerSeq: modified[role] }];
  })) };
}
function fixture(sourceRole = 'seller', deltas = { seller: '-10000', recipient: '0', relayer: '0' }) {
  // Hand arithmetic: initial fee1000 = inclusion100 + resources900;
  // actual resources100+200; refund600; net400. Result feeCharged is a
  // separate net400 observation here, not the1000 initial debit or600 refund.
  const pre = Object.fromEntries(roles.map((r, i) => [r, account(r, (i + 1) * 100000, 41 + i * 10)]));
  const source = keys[sourceRole], sourceAccount = source.publicKey();
  const tx = new TransactionBuilder(new Account(sourceAccount, pre[sourceRole].seqNum().toString()), { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.invokeContractFunction({ contract, function: 'synthetic', args: [] }))
    .setSorobanData(new SorobanDataBuilder().setResourceFee('900').build()).setTimeout(300).build();
  tx.sign(source);
  const charged = copyAccount(pre[sourceRole]); charged.balance(int(BigInt(charged.balance().toString()) - 1000n));
  const advanced = stamp(copyAccount(charged)); advanced.seqNum(int(BigInt(advanced.seqNum().toString()) + 1n));
  const current = Object.fromEntries(roles.map(r => [r, copyAccount(r === sourceRole ? advanced : pre[r])]));
  const operationChanges = [];
  for (const role of roles) {
    const amount = BigInt(deltas[role]);
    if (amount === 0n) continue;
    const next = copyAccount(current[role]); next.balance(int(BigInt(next.balance().toString()) + amount));
    operationChanges.push(state(current[role], role === sourceRole ? ledger : 90), updated(next)); current[role] = next;
  }
  current[sourceRole] = copyAccount(current[sourceRole]);
  current[sourceRole].balance(int(BigInt(current[sourceRole].balance().toString()) + 600n));
  const meta = new xdr.TransactionMeta(4, new xdr.TransactionMetaV4({ ext: new xdr.ExtensionPoint(0), txChangesBefore: [state(charged), updated(advanced)], operations: [new xdr.OperationMetaV2({ ext: new xdr.ExtensionPoint(0), changes: operationChanges, events: [] })], txChangesAfter: [], sorobanMeta: new xdr.SorobanTransactionMetaV2({ ext: new xdr.SorobanTransactionMetaExt(1, new xdr.SorobanTransactionMetaExtV1({ ext: new xdr.ExtensionPoint(0), totalNonRefundableResourceFeeCharged: int(100), totalRefundableResourceFeeCharged: int(200), rentFeeCharged: int(50) })), returnValue: xdr.ScVal.scvVoid() }), events: [feeEvent(sourceAccount, 1000, xdr.TransactionEventStage.transactionEventStageBeforeAllTxes()), feeEvent(sourceAccount, -600, xdr.TransactionEventStage.transactionEventStageAfterAllTxes())], diagnosticEvents: [] }));
  const result = new xdr.TransactionResult({ feeCharged: int(400), result: xdr.TransactionResultResult.txSuccess([xdr.OperationResult.opInner(xdr.OperationResultTr.invokeHostFunction(xdr.InvokeHostFunctionResult.invokeHostFunctionSuccess(Buffer.alloc(32, 9))))]), ext: new xdr.TransactionResultExt(0) });
  const input = { networkPassphrase: Networks.TESTNET, sourceAccount, signedEnvelopeXdr: tx.toXDR(), transactionHash: tx.hash().toString('hex'), inclusionLedger: ledger,
    response: { status: 'SUCCESS', txHash: tx.hash().toString('hex'), ledger, latestLedger: 101, createdAt: closeTime, feeBump: false, envelopeXdr: tx.toXDR(), resultXdr: encode(result), resultMetaXdr: encode(meta) },
    before: snapshot(pre, 99, { seller: 90, recipient: 90, relayer: 90 }), after: snapshot(current, 101, Object.fromEntries(roles.map(r => [r, r === sourceRole || BigInt(deltas[r]) !== 0n ? ledger : 90]))), expectedBusinessDeltas: { ...deltas } };
  return { input, meta, result, tx, sourceRole, seal() { input.response.resultMetaXdr = encode(meta); input.response.resultXdr = encode(result); return input; } };
}
function reconcile(input) {
  assert.equal(typeof subject.reconcilePublicLifecycleFees, 'function', 'fee reconciliation API must exist');
  return subject.reconcilePublicLifecycleFees(input);
}
test('refund600 is independently reconciled with initial1000 and actual net400, with source deposit attribution', () => {
  const f = fixture(); const got = reconcile(f.seal());
  assert.equal(got.netFee, '400'); assert.equal(got.initialFeeDebit, '1000'); assert.equal(got.resourceFeeRefund, '600');
  assert.equal(got.resultFeeCharged, '400'); assert.equal(got.authorizedFee, '1000');
  assert.equal(got.accounts.seller.businessDelta, '-10000'); assert.equal(got.accounts.seller.balanceDelta, '-10400');
  assert.equal(got.accounts.recipient.balanceDelta, '0'); assert.equal(got.accounts.relayer.balanceDelta, '0');
  assert.equal(got.transactionHash, f.input.transactionHash); assert.equal(got.inclusionLedger, 100); assert.equal(got.metaVersion, 4);
});
for (const [name, source, deltas, expected] of [
  ['fee-only grant has no business account changes', 'seller', { seller: '0', recipient: '0', relayer: '0' }, ['-400', '0', '0']],
  ['recipient payout pays only its own fee', 'recipient', { seller: '0', recipient: '5000', relayer: '0' }, ['0', '4600', '0']],
  ['positive handoff charges recipient and credits seller', 'recipient', { seller: '12000', recipient: '-2000', relayer: '0' }, ['12000', '-2400', '0']],
  ['relayer fee is separate from both nonpositive payouts', 'relayer', { seller: '8000', recipient: '2000', relayer: '0' }, ['8000', '2000', '-400']],
]) test(name, () => { const f = fixture(source, deltas); const got = reconcile(f.seal()); assert.deepEqual(roles.map(r => got.accounts[r].balanceDelta), expected); assert.equal(got.netFee, '400'); });

test('zero refund needs no refund event only when complete resource charges independently prove zero', () => {
  const f = fixture();
  f.meta.v4().sorobanMeta().ext().v1().totalRefundableResourceFeeCharged(int(800));
  f.meta.v4().events().pop(); f.result.feeCharged(int(1000));
  changeSnapshot(f, 'after', 'seller', a => a.balance(int(89000)));
  const got = reconcile(f.seal()); assert.equal(got.resourceFeeRefund, '0'); assert.equal(got.netFee, '1000');
  assert.equal(got.accounts.seller.balanceDelta, '-11000');
});

test('fee reconciliation is replayable and does not mutate retained raw input evidence', () => {
  const f = fixture(); const input = f.seal(), before = JSON.stringify(input);
  const first = reconcile(input), second = reconcile(JSON.parse(before));
  assert.deepEqual(first, second); assert.equal(JSON.stringify(input), before);
});

test('fixed testnet lifecycle refuses coherent fee evidence with zero inclusion fee', () => {
  const f = fixture();
  for (const c of [...f.meta.v4().txChangesBefore(), ...f.meta.v4().operations()[0].changes()]) {
    const a = c.value().data().account(); a.balance(int(BigInt(a.balance().toString()) + 100n));
  }
  f.meta.v4().events()[0].event().body().v0().data(nativeToScVal(900n, { type: 'i128' }));
  f.result.feeCharged(int(300)); changeSnapshot(f, 'after', 'seller', a => a.balance(int(89700)));
  assert.throws(() => reconcile(f.seal()), /PUBLIC_LIFECYCLE_FEES_FEE_EVENTS/);
});

const metaBody = f => f.meta.v4();
const sourceState = f => metaBody(f).txChangesBefore()[0].state();
function changeSnapshot(f, phase, role, change) { const row = f.input[phase].accounts[role]; const a = xdr.AccountEntry.fromXDR(row.accountEntryXdr, 'base64'); change(a); row.accountEntryXdr = encode(a); row.balance = a.balance().toString(); row.sequence = a.seqNum().toString(); }
for (const [name, mutate] of [
  ['missing positive refund metadata', f => metaBody(f).events().pop()],
  ['missing initial debit metadata', f => metaBody(f).events().shift()],
  ['wrong refund amount', f => metaBody(f).events()[1].event().body().v0().data(nativeToScVal(-599n, { type: 'i128' }))],
  ['refund at unsupported stage', f => metaBody(f).events()[1].stage(xdr.TransactionEventStage.transactionEventStageAfterTx())],
  ['refund for a foreign account', f => metaBody(f).events()[1].event().body().v0().topics()[1] = new Address(keys.recipient.publicKey()).toScVal()],
  ['fee event from a foreign contract', f => metaBody(f).events()[0].event().contractId(Buffer.alloc(32))],
  ['duplicate refund', f => metaBody(f).events().push(metaBody(f).events()[1])],
  ['noncanonical fee amount type', f => metaBody(f).events()[1].event().body().v0().data(xdr.ScVal.scvI64(int(-600)))],
  ['fee amount above signed64', f => metaBody(f).events()[0].event().body().v0().data(nativeToScVal(1n << 63n, { type: 'i128' }))],
  ['missing resource fee details', f => metaBody(f).sorobanMeta().ext(new xdr.SorobanTransactionMetaExt(0))],
  ['negative resource charge', f => metaBody(f).sorobanMeta().ext().v1().totalRefundableResourceFeeCharged(int(-1))],
  ['resource charge over authorized resources', f => metaBody(f).sorobanMeta().ext().v1().totalRefundableResourceFeeCharged(int(901))],
  ['result fee disagrees with independent metadata', f => f.result.feeCharged(int(1000))],
  ['missing before phase', f => metaBody(f).txChangesBefore([])],
  ['updated account before its state', f => metaBody(f).txChangesBefore().reverse()],
  ['duplicate before state', f => metaBody(f).txChangesBefore().unshift(metaBody(f).txChangesBefore()[0])],
  ['unpaired state', f => metaBody(f).operations()[0].changes().pop()],
  ['wrong ordered operation starting balance', f => metaBody(f).operations()[0].changes()[0].state().data().account().balance(int(98999))],
  ['unrelated account update', f => { const a = account('relayer', 10000, 0); a.accountId(Keypair.fromRawEd25519Seed(Buffer.alloc(32, 88)).xdrPublicKey()); metaBody(f).operations()[0].changes().push(state(a), updated(a)); }],
  ['account creation instead of update', f => metaBody(f).operations()[0].changes()[1] = xdr.LedgerEntryChange.ledgerEntryCreated(metaBody(f).operations()[0].changes()[1].updated())],
  ['source sequence changed inside operation', f => metaBody(f).operations()[0].changes()[1].updated().data().account().seqNum(int(43))],
  ['authority altered inside operation', f => metaBody(f).operations()[0].changes()[1].updated().data().account().thresholds(Buffer.from([0, 0, 0, 0]))],
  ['source timestamp extension differs from inclusion', f => metaBody(f).txChangesBefore()[1].updated().data().account().ext().v1().ext().v2().ext().v3().seqLedger(99)],
  ['hidden refund in after phase', f => { const a = copyAccount(metaBody(f).operations()[0].changes()[1].updated().data().account()); const b = copyAccount(a); b.balance(int(89600)); metaBody(f).txChangesAfter([state(a), updated(b)]); }],
  ['negative account balance', f => sourceState(f).data().account().balance(int(-1))],
  ['future modification ledger', f => sourceState(f).lastModifiedLedgerSeq(101)],
  ['before balance does not match included starting state', f => changeSnapshot(f, 'before', 'seller', a => a.balance(int(100001)))],
  ['extra unrelated post-account payment', f => changeSnapshot(f, 'after', 'recipient', a => a.balance(int(200001)))],
  ['after source sequence drift', f => changeSnapshot(f, 'after', 'seller', a => a.seqNum(int(43)))],
  ['wrong planned business amount', f => f.input.expectedBusinessDeltas.seller = '-9999'],
  ['noncanonical business decimal', f => f.input.expectedBusinessDeltas.seller = '-010000'],
  ['number rather than exact decimal', f => f.input.expectedBusinessDeltas.seller = -10000],
  ['business amount overflow', f => f.input.expectedBusinessDeltas.seller = '9223372036854775808'],
  ['missing actor delta', f => delete f.input.expectedBusinessDeltas.relayer],
  ['foreign actor delta', f => f.input.expectedBusinessDeltas.other = '0'],
  ['duplicate actor identity', f => f.input.before.accounts.relayer = { ...f.input.before.accounts.recipient }],
  ['snapshot displayed amount disagrees with canonical XDR', f => f.input.before.accounts.seller.balance = '100001'],
  ['noncanonical snapshot XDR base64', f => f.input.before.accounts.seller.accountEntryXdr += '\n'],
  ['snapshot predates inclusion on after side', f => f.input.after.ledger = 99],
  ['snapshot before is not before inclusion', f => f.input.before.ledger = 100],
  ['foreign expected source', f => f.input.sourceAccount = keys.relayer.publicKey()],
  ['wrong network', f => f.input.networkPassphrase = Networks.PUBLIC],
  ['wrong original hash', f => f.input.transactionHash = '00'.repeat(32)],
  ['changed signed signature with the original transaction hash', f => {
    const e = xdr.TransactionEnvelope.fromXDR(f.input.signedEnvelopeXdr, 'base64'); e.v1().signatures()[0].signature(Buffer.alloc(64));
    f.input.signedEnvelopeXdr = encode(e); f.input.response.envelopeXdr = encode(e);
  }],
  ['included envelope with a different signature', f => {
    const e = xdr.TransactionEnvelope.fromXDR(f.input.response.envelopeXdr, 'base64'); e.v1().signatures()[0].signature(Buffer.alloc(64)); f.input.response.envelopeXdr = encode(e);
  }],
  ['unsigned original envelope', f => {
    const e = xdr.TransactionEnvelope.fromXDR(f.input.signedEnvelopeXdr, 'base64'); e.v1().signatures([]); f.input.signedEnvelopeXdr = encode(e); f.input.response.envelopeXdr = encode(e);
  }],
  ['duplicated original signatures', f => {
    const e = xdr.TransactionEnvelope.fromXDR(f.input.signedEnvelopeXdr, 'base64'); e.v1().signatures().push(e.v1().signatures()[0]); f.input.signedEnvelopeXdr = encode(e); f.input.response.envelopeXdr = encode(e);
  }],
  ['response wrong hash', f => f.input.response.txHash = '00'.repeat(32)],
  ['response wrong inclusion ledger', f => f.input.response.ledger = 101],
  ['response not included', f => f.input.response.status = 'NOT_FOUND'],
  ['response fee-bump flag', f => f.input.response.feeBump = true],
  ['result discriminator failure', f => f.result.result(xdr.TransactionResultResult.txFailed(f.result.result().results()))],
  ['missing operation metadata', f => metaBody(f).operations([])],
  ['duplicate operation metadata', f => metaBody(f).operations().push(metaBody(f).operations()[0])],
  ['old metadata version cannot prove after-all refund', f => f.meta = new xdr.TransactionMeta(2, new xdr.TransactionMetaV2({ txChangesBefore: [], operations: [], txChangesAfter: [] }))],
]) test(`fee attribution refuses ${name}`, () => { const f = fixture(); mutate(f); if (f.meta.switch() !== 4) f.input.response.resultMetaXdr = encode(f.meta); const input = f.meta.switch() === 4 ? f.seal() : f.input; assert.throws(() => reconcile(input), /PUBLIC_LIFECYCLE_FEES_/); });
