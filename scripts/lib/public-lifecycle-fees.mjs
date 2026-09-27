/** Offline native-XLM attribution for an included public lifecycle transaction.
 * Protocol-28 TransactionMeta V4 records initial debit/refund in native-SAC
 * transaction events; txChangesBefore starts AFTER the initial debit, and the
 * refund may be AFTER all transactions, outside txChangesAfter. Never derive a
 * fee by subtracting TransactionResult.feeCharged from a wallet balance alone.
 * Requires raw inclusion XDR plus three independently verified, coherent actor
 * snapshots. No RPC authentication, transfer-route audit or live-run claim. */
import { createRequire } from 'node:module';
const { Address, Asset, Keypair, Networks, StrKey, TransactionBuilder, xdr } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const ROLES = ['seller', 'recipient', 'relayer'];
const I64 = (1n << 63n) - 1n;
// Reviewed fixed-Testnet lifecycle policy, not a network-wide protocol theorem.
const MIN_INCLUSION_FEE = 100n;
const ensure = (ok, code) => { if (!ok) throw Error(`PUBLIC_LIFECYCLE_FEES_${code}`); };
const u32 = n => Number.isInteger(n) && n > 0 && n <= 0xffffffff;
const encode = value => value.toXDR('base64');
const copy = a => xdr.AccountEntry.fromXDR(a.toXDR());
const int = n => xdr.Int64.fromString(String(n));
function amount(value, signed = false) {
  ensure(typeof value === 'string' && /^(0|[1-9][0-9]*|-[1-9][0-9]*)$/.test(value) && value.length <= 20, 'AMOUNT');
  const n = BigInt(value);
  ensure(n >= (signed ? -I64 : 0n) && n <= I64, 'AMOUNT');
  return n;
}
function decode(type, value, limit = 4 * 1024 * 1024) {
  ensure(typeof value === 'string' && value.length > 0 && value.length <= limit, 'XDR');
  const result = type.fromXDR(value, 'base64');
  ensure(encode(result) === value, 'XDR');
  return result;
}
function address(account) {
  ensure(account.accountId().switch().name === 'publicKeyTypeEd25519', 'ACCOUNT');
  return StrKey.encodeEd25519PublicKey(account.accountId().ed25519());
}
function dedicated(account) {
  amount(account.balance().toString()); amount(account.seqNum().toString());
  ensure(account.numSubEntries() === 0 && !account.inflationDest() && account.flags() === 0 &&
    account.homeDomain().length === 0 && account.thresholds().equals(Buffer.from([1, 0, 0, 0])) && account.signers().length === 0, 'ACCOUNT_AUTHORITY');
  const ext = account.ext();
  ensure([0, 1].includes(ext.switch()), 'ACCOUNT_EXTENSION');
  if (ext.switch() === 0) return;
  const v1 = ext.v1();
  ensure(v1.liabilities().buying().toString() === '0' && v1.liabilities().selling().toString() === '0' && [0, 2].includes(v1.ext().switch()), 'ACCOUNT_EXTENSION');
  if (v1.ext().switch() === 0) return;
  const v2 = v1.ext().v2();
  ensure(v2.numSponsored() === 0 && v2.numSponsoring() === 0 && v2.signerSponsoringIDs().length === 0 && [0, 3].includes(v2.ext().switch()), 'ACCOUNT_EXTENSION');
  if (v2.ext().switch() === 3) ensure(v2.ext().v3().ext().switch() === 0, 'ACCOUNT_EXTENSION');
}
function sourceSequenceUpdate(account, sequence, ledger, closeTime) {
  const next = copy(account); next.seqNum(int(sequence));
  next.ext(new xdr.AccountEntryExt(1, new xdr.AccountEntryExtensionV1({
    liabilities: new xdr.Liabilities({ buying: int(0), selling: int(0) }),
    ext: new xdr.AccountEntryExtensionV1Ext(2, new xdr.AccountEntryExtensionV2({
      numSponsored: 0, numSponsoring: 0, signerSponsoringIDs: [],
      ext: new xdr.AccountEntryExtensionV2Ext(3, new xdr.AccountEntryExtensionV3({
        ext: new xdr.ExtensionPoint(0), seqLedger: ledger, seqTime: xdr.Uint64.fromString(closeTime),
      })),
    })),
  })));
  return next;
}
function snapshot(value) {
  ensure(u32(value?.ledger) && value.accounts && Object.keys(value.accounts).sort().join(',') === [...ROLES].sort().join(','), 'SNAPSHOT');
  const rows = Object.fromEntries(ROLES.map(role => {
    const row = value.accounts[role], account = decode(xdr.AccountEntry, row.accountEntryXdr, 16384);
    dedicated(account);
    ensure(StrKey.isValidEd25519PublicKey(row.address) && address(account) === row.address &&
      account.balance().toString() === row.balance && account.seqNum().toString() === row.sequence &&
      u32(row.lastModifiedLedgerSeq) && row.lastModifiedLedgerSeq <= value.ledger, 'SNAPSHOT_ACCOUNT');
    return [role, { address: row.address, account, last: row.lastModifiedLedgerSeq }];
  }));
  ensure(new Set(ROLES.map(r => rows[r].address)).size === 3, 'SNAPSHOT_ACCOUNT');
  return rows;
}

/** V4 txSuccess only: no fee bump, muxed source, multiple operations, restore,
 * absent refund evidence, non-dedicated actors, or ambiguous account changes.
 * expectedBusinessDeltas is exactly {seller,recipient,relayer}, decimal stroops.
 * Caller derives those deltas from the immutable operation plan, not balances.
 * response is RAW RPC JSON: createdAt is a decimal string in the observed wire
 * responses, despite the installed SDK declaration saying number. No coercion. */
export function reconcilePublicLifecycleFees(input) {
  try { return reconcile(input); }
  catch (error) {
    if (error?.message?.startsWith('PUBLIC_LIFECYCLE_FEES_')) throw error;
    throw Error('PUBLIC_LIFECYCLE_FEES_MALFORMED');
  }
}
function reconcile({ networkPassphrase, sourceAccount, signedEnvelopeXdr, transactionHash, inclusionLedger, response, before, after, expectedBusinessDeltas }) {
  ensure(networkPassphrase === Networks.TESTNET && StrKey.isValidEd25519PublicKey(sourceAccount), 'NETWORK_SOURCE');
  ensure(u32(inclusionLedger) && /^[0-9a-f]{64}$/.test(transactionHash), 'IDENTITY');
  const envelope = decode(xdr.TransactionEnvelope, signedEnvelopeXdr, 256 * 1024);
  ensure(envelope.switch().name === 'envelopeTypeTx', 'ENVELOPE');
  const inner = envelope.v1(), body = inner.tx(), operations = body.operations();
  ensure(body.sourceAccount().switch().name === 'keyTypeEd25519' &&
    StrKey.encodeEd25519PublicKey(body.sourceAccount().ed25519()) === sourceAccount &&
    operations.length === 1 && !operations[0].sourceAccount() && operations[0].body().switch().name === 'invokeHostFunction' &&
    operations[0].body().invokeHostFunctionOp().hostFunction().switch().name === 'hostFunctionTypeInvokeContract' && body.ext().switch() === 1, 'ENVELOPE');
  const tx = TransactionBuilder.fromXDR(signedEnvelopeXdr, networkPassphrase), hash = tx.hash(), key = Keypair.fromPublicKey(sourceAccount);
  ensure(hash.toString('hex') === transactionHash && inner.signatures().length === 1 &&
    inner.signatures()[0].hint().equals(key.signatureHint()) && key.verify(hash, inner.signatures()[0].signature()), 'SIGNATURE_HASH');
  ensure(response?.status === 'SUCCESS' && response.txHash === transactionHash && response.ledger === inclusionLedger &&
    u32(response.latestLedger) && response.latestLedger >= inclusionLedger && response.feeBump === false &&
    response.envelopeXdr === signedEnvelopeXdr, 'INCLUSION');
  const closeTime = amount(response.createdAt).toString();
  const result = decode(xdr.TransactionResult, response.resultXdr, 256 * 1024);
  ensure(result.ext().switch() === 0 && result.result().switch().name === 'txSuccess', 'RESULT');
  const opResults = result.result().results();
  ensure(opResults.length === 1 && opResults[0].switch().name === 'opInner' &&
    opResults[0].tr().switch().name === 'invokeHostFunction' &&
    opResults[0].tr().invokeHostFunctionResult().switch().name === 'invokeHostFunctionSuccess', 'RESULT');
  const meta = decode(xdr.TransactionMeta, response.resultMetaXdr);
  ensure(meta.switch() === 4, 'META_VERSION');
  const m = meta.v4(), soroban = m.sorobanMeta(), data = body.ext().sorobanData();
  ensure(m.ext().switch() === 0 && m.operations().length === 1 && m.operations()[0].ext().switch() === 0 &&
    soroban && soroban.returnValue() && soroban.ext().switch() === 1 && soroban.ext().v1().ext().switch() === 0, 'META_PHASES');
  ensure(data.ext().switch() === 0 || (data.ext().switch() === 1 && data.ext().resourceExt().archivedSorobanEntries().length === 0), 'RESTORATION');
  const fees = soroban.ext().v1(), authorizedFee = BigInt(body.fee()), resourceFee = amount(data.resourceFee().toString());
  const nonRefundable = amount(fees.totalNonRefundableResourceFeeCharged().toString()), refundable = amount(fees.totalRefundableResourceFeeCharged().toString());
  const rent = amount(fees.rentFeeCharged().toString()), chargedResources = nonRefundable + refundable;
  ensure(resourceFee <= authorizedFee && chargedResources <= resourceFee && rent <= refundable, 'RESOURCE_FEES');
  const refund = resourceFee - chargedResources, events = m.events();
  ensure(events.length === (refund > 0n ? 2 : 1), 'FEE_EVENTS');
  const native = StrKey.decodeContract(Asset.native().contractId(networkPassphrase));
  const topics = [xdr.ScVal.scvSymbol('fee'), new Address(sourceAccount).toScVal()].map(encode);
  const feeAmounts = events.map((row, index) => {
    const e = row.event();
    ensure(row.stage().name === (index === 0 ? 'transactionEventStageBeforeAllTxes' : 'transactionEventStageAfterAllTxes') &&
      e.ext().switch() === 0 && e.type().name === 'contract' && e.contractId()?.equals(native) && e.body().switch() === 0 &&
      JSON.stringify(e.body().v0().topics().map(encode)) === JSON.stringify(topics) && e.body().v0().data().switch().name === 'scvI128', 'FEE_EVENTS');
    const parts = e.body().v0().data().i128();
    return amount(((BigInt(parts.hi().toString()) << 64n) + BigInt(parts.lo().toString())).toString(), true);
  });
  const initialFee = feeAmounts[0];
  ensure(initialFee - resourceFee >= MIN_INCLUSION_FEE && initialFee <= authorizedFee &&
    (refund === 0n || feeAmounts[1] === -refund), 'FEE_EVENTS');
  const netFee = initialFee - refund, resultFee = amount(result.feeCharged().toString());
  ensure(netFee >= 0n && resultFee === netFee, 'RESULT_FEE');
  const pre = snapshot(before), post = snapshot(after);
  ensure(before.ledger < inclusionLedger && after.ledger >= inclusionLedger, 'SNAPSHOT_ORDER');
  ensure(expectedBusinessDeltas && Object.keys(expectedBusinessDeltas).sort().join(',') === [...ROLES].sort().join(','), 'BUSINESS_DELTAS');
  const business = Object.fromEntries(ROLES.map(r => [r, amount(expectedBusinessDeltas[r], true)]));
  const sourceRole = ROLES.find(r => pre[r].address === sourceAccount);
  ensure(sourceRole && ROLES.every(r => pre[r].address === post[r].address), 'ACTORS');
  const sequence = amount(body.seqNum().toString());
  ensure(amount(pre[sourceRole].account.seqNum().toString()) + 1n === sequence, 'SOURCE_SEQUENCE');
  const current = Object.fromEntries(ROLES.map(r => [r, { account: copy(pre[r].account), last: pre[r].last }]));
  const sourceBalance = amount(current[sourceRole].account.balance().toString()) - initialFee;
  ensure(sourceBalance >= 0n, 'BALANCE');
  current[sourceRole].account.balance(int(sourceBalance)); current[sourceRole].last = inclusionLedger;
  const phaseBalances = {};
  const capture = phase => { phaseBalances[phase] = Object.fromEntries(ROLES.map(r => [r, current[r].account.balance().toString()])); };
  capture('afterInitialFee');
  function process(changes, phase) {
    const pending = new Set(); let sourceAdvanced = false;
    if (phase === 'before') ensure(changes.length === 2, 'BEFORE_PHASE');
    for (const change of changes) {
      const kind = change.switch().name, value = change.value();
      const type = kind === 'ledgerEntryRemoved' ? value.switch().name : value.data().switch().name;
      ensure(kind !== 'ledgerEntryRestored' && ['account', 'contractData', 'contractCode', 'ttl'].includes(type), 'UNRELATED_CHANGE');
      if (type !== 'account') { ensure(phase !== 'before', 'BEFORE_PHASE'); continue; }
      ensure(['ledgerEntryState', 'ledgerEntryUpdated'].includes(kind) && value.ext().switch() === 0, 'ACCOUNT_CHANGE');
      const a = value.data().account(); dedicated(a);
      const role = ROLES.find(r => pre[r].address === address(a));
      ensure(role && u32(value.lastModifiedLedgerSeq()) && value.lastModifiedLedgerSeq() <= inclusionLedger, 'ACCOUNT_CHANGE');
      const previous = current[role];
      if (kind === 'ledgerEntryState') {
        ensure(!pending.has(role) && encode(a) === encode(previous.account) && value.lastModifiedLedgerSeq() === previous.last, 'ACCOUNT_STATE');
        pending.add(role); continue;
      }
      ensure(pending.delete(role) && value.lastModifiedLedgerSeq() === inclusionLedger, 'ACCOUNT_ORDER');
      let expected = copy(previous.account);
      if (phase === 'before') {
        ensure(role === sourceRole && !sourceAdvanced, 'BEFORE_PHASE');
        expected = sourceSequenceUpdate(expected, sequence, inclusionLedger, closeTime); sourceAdvanced = true;
      } else if (phase === 'operations') expected.balance(a.balance());
      ensure(encode(a) === encode(expected), 'ACCOUNT_MUTATION');
      current[role] = { account: copy(a), last: inclusionLedger };
    }
    ensure(pending.size === 0 && (phase !== 'before' || sourceAdvanced), 'ACCOUNT_ORDER'); capture(phase);
  }
  process(m.txChangesBefore(), 'before'); process(m.operations()[0].changes(), 'operations'); process(m.txChangesAfter(), 'after');
  const accounts = {};
  for (const role of ROLES) {
    const observedBusiness = BigInt(phaseBalances.operations[role]) - BigInt(phaseBalances.before[role]);
    ensure(observedBusiness === business[role], 'BUSINESS_DELTA');
    const expected = copy(current[role].account);
    const finalBalance = amount(expected.balance().toString()) + (role === sourceRole ? refund : 0n);
    ensure(finalBalance <= I64, 'BALANCE'); expected.balance(int(finalBalance));
    ensure(encode(expected) === encode(post[role].account) && current[role].last === post[role].last, 'FINAL_ACCOUNT');
    const delta = BigInt(post[role].account.balance().toString()) - BigInt(pre[role].account.balance().toString());
    ensure(delta === observedBusiness - (role === sourceRole ? netFee : 0n), 'NET_FEE');
    accounts[role] = { address: pre[role].address, balanceBefore: pre[role].account.balance().toString(), balanceAfter: finalBalance.toString(), balanceDelta: delta.toString(), businessDelta: observedBusiness.toString(), netFee: (role === sourceRole ? netFee : 0n).toString(), phases: Object.fromEntries(Object.entries(phaseBalances).map(([k, v]) => [k, v[role]])) };
  }
  return { schema: 'agyion-public-v4-lifecycle-fees-v1', testOnly: true, transactionHash, sourceAccount, networkPassphrase, inclusionLedger, metaVersion: 4, result: 'txSuccess', authorizedFee: authorizedFee.toString(), resultFeeCharged: resultFee.toString(), initialFeeDebit: initialFee.toString(), resourceFeeRefund: refund.toString(), netFee: netFee.toString(), nonRefundableResourceFee: nonRefundable.toString(), refundableResourceFeeCharged: refundable.toString(), rentFeeCharged: rent.toString(), accounts, boundary: 'Raw V4 inclusion metadata and coherent dedicated actor snapshots reconcile native account net changes; no independent RPC authentication, transfer-route audit or live lifecycle execution claim.' };
}
