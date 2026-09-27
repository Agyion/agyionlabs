import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { buildPublicLifecyclePlan } from '../lib/public-lifecycle-plan.mjs';
import { publicLifecycleReadbackKeys, verifyPublicLifecycleState, verifyPublicLifecycleSnapshot } from '../lib/public-lifecycle-readback.mjs';
import * as readback from '../lib/public-lifecycle-readback.mjs';
const { Address, Contract, StrKey, Account, TransactionBuilder, nativeToScVal, xdr, contract } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const publicKeys = Array.from({ length: 7 }, (_, i) => StrKey.encodeEd25519PublicKey(Buffer.alloc(32, i + 1)));
const plan = buildPublicLifecyclePlan({ preparedAt: '2026-09-27T16:30:00.000Z', recipient: publicKeys[0], relayer: publicKeys[1], credentialKeys: Object.fromEntries(['venue', 'podTimelock', 'podMixed', 'attester', 'agent'].map((r, i) => [r, publicKeys[i + 2]])) });
const types = { create_fade: 'Fade', create_pod: 'Pod', create_trigger: 'Trigger', create_mandate: 'Mandate' };
const creates = plan.steps.filter(s => types[s.method]);
const b64 = value => value.toXDR('base64');
const en = name => xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(name)]);
const i128 = n => nativeToScVal(BigInt(n), { type: 'i128' });
const u64 = n => nativeToScVal(BigInt(n), { type: 'u64' });
const map = value => xdr.ScVal.scvMap(Object.keys(value).sort().map(k => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(k), val: value[k] })));
const dataKey = (address, key) => xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({ contract: new Address(address).toScAddress(), key, durability: xdr.ContractDataDurability.persistent() }));
const fields = {
  Fade: { seller: 'address', asset: 'address', pot: 'i128', start_price: 'i128', floor_price: 'i128', start_ledger: 'u32', deadline_ledger: 'u32', handoff_window: 'u32', slope_num: 'i128', slope_den: 'i128', venue_pubkey: 'bytes', state: 'u32', claimant: '?address', claimed_at: '?u32' },
  Pod: { funder: 'address', asset: 'address', amount: 'i128', unlock_ledger: 'u32', claim_pubkey: 'bytes', state: 'u32' },
  Trigger: { funder: 'address', asset: 'address', amount: 'i128', beneficiary: 'address', attester_pubkey: 'bytes', deadline_ledger: 'u32', state: 'u32' },
  Mandate: { owner: 'address', agent_pubkey: 'bytes', max_per_tx: 'i128', daily_cap: 'i128', valid_until: 'u32', daily_used: 'i128', window_start: 'u32', revoked: 'bool', claims_used: 'u32' },
};
function recordVal(type, value) {
  return map(Object.fromEntries(Object.entries(fields[type]).map(([k, kind]) => {
    const v = value[k], t = kind.replace('?', '');
    return [k, v === null ? xdr.ScVal.scvVoid() : t === 'address' ? new Address(v).toScVal() : t === 'bytes' ? xdr.ScVal.scvBytes(Buffer.from(v, 'hex')) : t === 'i128' ? i128(v) : t === 'u32' ? xdr.ScVal.scvU32(v) : xdr.ScVal.scvBool(v)];
  })));
}
function plannedRecord(step, id, terminal) {
  const t = step.terms, key = StrKey.decodeEd25519PublicKey(plan.credentialKeys[t.credentialRole]).toString('hex');
  let value;
  if (step.method === 'create_fade') value = { seller: plan.actors.seller, asset: t.asset, pot: t.amount, start_price: t.price, floor_price: t.price, start_ledger: 900, deadline_ledger: 900 + t.durationLedgers, handoff_window: t.handoffWindow, slope_num: t.slopeNumerator, slope_den: t.slopeDenominator, venue_pubkey: key, state: terminal ? (['fade-unclaimed', 'fade-no-show'].includes(step.record) ? 3 : 2) : 0, claimant: terminal && step.record !== 'fade-unclaimed' ? plan.actors.recipient : null, claimed_at: terminal && step.record !== 'fade-unclaimed' ? 905 : null };
  if (step.method === 'create_pod') value = { funder: plan.actors.seller, asset: t.asset, amount: t.amount, unlock_ledger: 899 + t.unlockOffsetLedgers, claim_pubkey: key, state: terminal ? 1 : 0 };
  if (step.method === 'create_trigger') value = { funder: plan.actors.seller, asset: t.asset, amount: t.amount, beneficiary: plan.actors.recipient, attester_pubkey: key, deadline_ledger: 899 + t.deadlineOffsetLedgers, state: terminal ? (step.record === 'trigger-timeout' ? 2 : 1) : 0 };
  if (step.method === 'create_mandate') value = { owner: plan.actors.recipient, agent_pubkey: key, max_per_tx: t.maxPerTx, daily_cap: t.dailyCap, valid_until: 899 + t.validForLedgers, daily_used: '0', window_start: 900, revoked: terminal && step.record !== 'grant-expiry', claims_used: terminal && step.record === 'grant-capped' ? 1 : 0 };
  return { record: step.record, id: String(id), creationLedger: 900, preparedLedger: 899, value };
}
function fixture(count = 0, mixed = false) {
  // Synthetic coherent ledger data; no private identities, RPC, signing or sends.
  const counters = {}, records = creates.slice(0, count).map(step => {
    const type = types[step.method], id = counters[type] = (counters[type] || 0) + 1;
    return plannedRecord(step, id, mixed ? !step.record.endsWith('-mixed') : false);
  });
  const expected = { minLedger: 1000, maxLedger: 1010, initialSurplusStroops: '0', donationConfirmed: mixed, fundedHistory: count > 0, records, accounts: Object.fromEntries(Object.keys(plan.actors).map(r => [r, { sequence: '4294967296000' }])), zeroBalanceEvidence: null };
  const debt = records.reduce((sum, r) => sum + (r.value.pot && r.value.state < 2 ? BigInt(r.value.pot) : r.value.amount && r.value.state === 0 ? BigInt(r.value.amount) : 0n), 0n);
  const storage = [new xdr.ScMapEntry({ key: en('AccountingVersion'), val: xdr.ScVal.scvU32(4) }), new xdr.ScMapEntry({ key: en('Assets'), val: xdr.ScVal.scvVec(plan.assets.map(a => new Address(a).toScVal())) }), ...Object.keys(counters).sort().map(t => new xdr.ScMapEntry({ key: en(t + 'Count'), val: u64(counters[t]) }))];
  // Independent keys, not the helper under test.
  const keys = [xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: Buffer.from(plan.wasmSha256, 'hex') })), new Contract(plan.contractId).getFootprint(), ...plan.assets.map(a => new Contract(a).getFootprint()), ...plan.assets.map(a => dataKey(plan.contractId, xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Liability'), new Address(a).toScVal()]))), dataKey(plan.assets[0], xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Balance'), new Address(plan.contractId).toScVal()])), ...Object.values(plan.actors).map(a => xdr.LedgerKey.account(new xdr.LedgerKeyAccount({ accountId: new Address(a).toScAddress().accountId() }))), ...records.map((r, i) => dataKey(plan.contractId, xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(types[creates[i].method]), u64(r.id)])))];
  const entries = keys.map((key, index) => {
    let val;
    if (index === 0) val = xdr.LedgerEntryData.contractCode(new xdr.ContractCodeEntry({ ext: new xdr.ContractCodeEntryExt(0), hash: Buffer.from(plan.wasmSha256, 'hex'), code: Buffer.from('SYNTHETIC, NOT THE REVIEWED WASM') }));
    else if (index >= 7 && index < 10) val = xdr.LedgerEntryData.account(new xdr.AccountEntry({ accountId: key.account().accountId(), balance: xdr.Int64.fromString('10000000000'), seqNum: xdr.SequenceNumber.fromString('4294967296000'), numSubEntries: 0, inflationDest: null, flags: 0, homeDomain: '', thresholds: Buffer.from([1, 0, 0, 0]), signers: [], ext: new xdr.AccountEntryExt(0) }));
    else {
      const value = index < 4 ? xdr.ScVal.scvContractInstance(new xdr.ScContractInstance({ executable: index === 1 ? xdr.ContractExecutable.contractExecutableWasm(Buffer.from(plan.wasmSha256, 'hex')) : xdr.ContractExecutable.contractExecutableStellarAsset(), storage: index === 1 ? storage : null })) : index < 6 ? i128(index === 4 ? debt : 0n) : index === 6 ? map({ amount: i128(debt + (mixed ? 1n : 0n)), authorized: xdr.ScVal.scvBool(true), clawback: xdr.ScVal.scvBool(false) }) : recordVal(types[creates[index - 10].method], records[index - 10].value);
      val = xdr.LedgerEntryData.contractData(new xdr.ContractDataEntry({ ext: new xdr.ExtensionPoint(0), contract: key.contractData().contract(), key: key.contractData().key(), durability: key.contractData().durability(), val: value }));
    }
    return { key, val, lastModifiedLedgerSeq: 999, ...(index >= 7 && index < 10 ? {} : { liveUntilLedgerSeq: 5000 }) };
  });
  return { plan, expected, storage, keys, response: { latestLedger: 1000, entries } };
}
const check = f => verifyPublicLifecycleState({ plan: f.plan, expected: f.expected }, f.response);
const setValue = (f, index, val) => f.response.entries[index].val.contractData().val(val);
function zeroEvidence(f) {
  f.expected.zeroBalanceEvidence = { ledger: 1000, resultXdr: b64(i128(0)), envelopeXdr: new TransactionBuilder(new Account(plan.actors.seller, '4294967296000'), { fee: '100', networkPassphrase: plan.networkPassphrase }).addOperation(new Contract(plan.assets[0]).call('balance', new Address(plan.contractId).toScVal())).setTimeout(0).build().toXDR() };
}

test('keys include fixed code, instances, liabilities, native balance, all three accounts and all journal records', () => {
  const f = fixture(16, true); assert.deepEqual(publicLifecycleReadbackKeys(plan, f.expected).map(b64), f.keys.map(b64));
});
test('acquisition keys request all sixteen possible records before their values or creation ledgers exist', () => {
  assert.equal(typeof readback.publicLifecycleAcquisitionKeys, 'function');
  const keys = readback.publicLifecycleAcquisitionKeys(plan), encoded = keys.map(b64);
  assert.equal(encoded.length, 26); assert.equal(new Set(encoded).size, 26);
  assert.deepEqual(encoded, fixture(16, true).keys.map(b64));
  const records = keys.slice(10).map(k => {
    const data = k.contractData(), tuple = data.key().vec();
    assert.equal(data.durability().name, 'persistent');
    assert.equal(Address.fromScAddress(data.contract()).toString(), plan.contractId);
    return `${tuple[0].sym()}:${tuple[1].u64()}`;
  }).sort();
  assert.deepEqual(records, ['Fade:1', 'Fade:2', 'Fade:3', 'Fade:4', 'Fade:5', 'Fade:6', 'Fade:7', 'Fade:8', 'Mandate:1', 'Mandate:2', 'Mandate:3', 'Pod:1', 'Pod:2', 'Trigger:1', 'Trigger:2', 'Trigger:3']);
});
test('acquisition rejects modified plan scope and accessors without reading a getter', () => {
  for (const mutate of [p => { p.contractId = p.assets[0]; }, p => { p.assets.reverse(); }, p => { p.actors.seller = p.actors.recipient; }, p => { p.steps.pop(); }]) {
    const changed = structuredClone(plan); mutate(changed);
    assert.throws(() => readback.publicLifecycleAcquisitionKeys(changed), /LIFECYCLE_PLAN_/);
  }
  const changed = structuredClone(plan); let calls = 0;
  Object.defineProperty(changed, 'contractId', { enumerable: true, get() { calls++; return plan.contractId; } });
  assert.throws(() => readback.publicLifecycleAcquisitionKeys(changed), /LIFECYCLE_PLAN_/);
  assert.equal(calls, 0);
});
test('requested acquisition keys do not authorize a future record in the exact expected snapshot', () => {
  const f = fixture(), future = fixture(1).response.entries[10];
  assert.ok(readback.publicLifecycleAcquisitionKeys(plan).map(b64).includes(b64(future.key)));
  f.response.entries.push(future);
  assert.throws(() => check(f), /LIFECYCLE_READBACK_(ROWS|KEY)/);
});
test('mutating one acquisition result cannot redirect a later request', () => {
  const keys = readback.publicLifecycleAcquisitionKeys(plan), original = keys.map(b64);
  keys[10].contractData().contract(new Address(plan.assets[0]).toScAddress()); keys.pop();
  assert.deepEqual(readback.publicLifecycleAcquisitionKeys(plan).map(b64), original);
});
test('synthetic initial and mixed accounting checks return exact decimal values without claiming code authentication', () => {
  assert.equal(check(fixture()).nativeReserveStroops, '0');
  const result = check(fixture(16, true));
  assert.equal(result.codeBytesAuthenticated, false); assert.equal(result.liabilities[0].amount, '30000000'); assert.equal(result.liabilities[1].amount, '0');
  assert.equal(result.nativeReserveStroops, '30000001'); assert.equal(result.openPrincipalStroops, '30000000'); assert.equal(result.records.length, 16);
  assert.deepEqual(result.counters, { Fade: '8', Pod: '2', Trigger: '3', Mandate: '3' });
  assert.equal(result.accounts.seller.balance, '10000000000'); assert.equal(result.accounts.seller.sequence, '4294967296000');
  assert.equal(xdr.AccountEntry.fromXDR(result.accounts.seller.accountEntryXdr, 'base64').balance().toString(), '10000000000');
});
test('restored liabilities may be newer than the instance, with live TTL equal to response head and unordered rows', () => {
  const f = fixture(1); f.response.entries[4].lastModifiedLedgerSeq = 1000;
  for (const row of f.response.entries) if (row.liveUntilLedgerSeq) row.liveUntilLedgerSeq = 1000;
  f.response.entries.reverse(); assert.equal(check(f).openPrincipalStroops, '10000000');
});
test('only pristine never-funded absent balance permits same-head exact raw zero balance evidence', () => {
  const f = fixture(); f.response.entries.splice(6, 1); zeroEvidence(f);
  assert.equal(check(f).nativeReserveStroops, '0');
  f.expected.zeroBalanceEvidence.ledger = 999; assert.throws(() => check(f), /ZERO/);
});
for (const [name, mutate] of [
  ['missing liability', f => f.response.entries.splice(4, 1)],
  ['missing record', f => f.response.entries.pop()],
  ['missing funded balance', f => { f.response.entries.splice(6, 1); zeroEvidence(f); }],
  ['missing actor', f => f.response.entries.splice(8, 1)],
  ['duplicate row', f => f.response.entries.push(f.response.entries[0])],
  ['substituted key', f => { f.response.entries[4].key = f.keys[5]; }],
  ['type mismatch', f => { f.response.entries[4].val = f.response.entries[0].val; }],
  ['redirected contract', f => { f.response.entries[4].val.contractData().contract(new Address(plan.assets[0]).toScAddress()); }],
  ['temporary debt', f => { f.response.entries[4].val.contractData().durability(xdr.ContractDataDurability.temporary()); }],
  ['wrong hash', f => f.response.entries[0].val.contractCode().hash(Buffer.alloc(32))],
  ['stale head', f => { f.response.latestLedger = 999; }],
  ['future head', f => { f.response.latestLedger = 1011; }],
  ['zero head', f => { f.response.latestLedger = 0; }],
  ['fractional head', f => { f.response.latestLedger = 1000.5; }],
  ['future modification', f => { f.response.entries[4].lastModifiedLedgerSeq = 1001; }],
  ['zero modification', f => { f.response.entries[4].lastModifiedLedgerSeq = 0; }],
  ['expired TTL', f => { f.response.entries[4].liveUntilLedgerSeq = 999; }],
  ['zero code TTL', f => { f.response.entries[0].liveUntilLedgerSeq = 0; }],
  ['missing record TTL', f => { delete f.response.entries[10].liveUntilLedgerSeq; }],
  ['unknown instance storage', f => f.storage.push(new xdr.ScMapEntry({ key: en('Admin'), val: xdr.ScVal.scvVoid() }))],
  ['changed assets', f => f.storage[1].val(xdr.ScVal.scvVec([...plan.assets].reverse().map(a => new Address(a).toScVal())))],
  ['wrong version', f => f.storage[0].val(xdr.ScVal.scvU32(3))],
  ['changed counter', f => f.storage[2].val(u64(2))],
  ['reordered instance map', f => f.storage.reverse()],
  ['non SAC executable', f => f.response.entries[2].val.contractData().val().instance().executable(xdr.ContractExecutable.contractExecutableWasm(Buffer.alloc(32)))],
  ['negative liability', f => setValue(f, 4, i128(-1))],
  ['missing debt disguised as zero', f => setValue(f, 4, i128(0))],
  ['USDC liability', f => setValue(f, 5, i128(1))],
  ['wrong liability scalar', f => setValue(f, 4, u64(10000000))],
  ['reserve shortfall', f => setValue(f, 6, map({ amount: i128(9999999), authorized: xdr.ScVal.scvBool(true), clawback: xdr.ScVal.scvBool(false) }))],
  ['unexplained reserve excess', f => setValue(f, 6, map({ amount: i128(10000001), authorized: xdr.ScVal.scvBool(true), clawback: xdr.ScVal.scvBool(false) }))],
  ['frozen SAC balance', f => f.response.entries[6].val.contractData().val().map()[1].val(xdr.ScVal.scvBool(false))],
  ['clawback SAC balance', f => f.response.entries[6].val.contractData().val().map()[2].val(xdr.ScVal.scvBool(true))],
  ['duplicate SAC field', f => f.response.entries[6].val.contractData().val().map()[2].key(xdr.ScVal.scvSymbol('amount'))],
  ['record state mismatch', f => f.response.entries[10].val.contractData().val().map().find(e => e.key().sym().toString() === 'state').val(xdr.ScVal.scvU32(2))],
  ['noncanonical record order', f => f.response.entries[10].val.contractData().val().map().reverse()],
  ['wrong actor', f => f.response.entries[7].val.account().accountId(new Address(plan.actors.recipient).toScAddress().accountId())],
  ['negative actor balance', f => f.response.entries[7].val.account().balance(xdr.Int64.fromString('-1'))],
  ['changed actor sequence', f => f.response.entries[7].val.account().seqNum(xdr.SequenceNumber.fromString('4294967296001'))],
  ['foreign signer', f => f.response.entries[7].val.account().signers([new xdr.Signer({ key: xdr.SignerKey.signerKeyTypeEd25519(Buffer.alloc(32, 55)), weight: 1 })])],
  ['disabled master authority', f => f.response.entries[7].val.account().thresholds(Buffer.from([0, 0, 0, 0]))],
  ['subentries', f => f.response.entries[7].val.account().numSubEntries(1)],
  ['actor flags', f => f.response.entries[7].val.account().flags(1)],
  ['inflation destination', f => f.response.entries[7].val.account().inflationDest(new Address(plan.actors.recipient).toScAddress().accountId())],
  ['account domain', f => f.response.entries[7].val.account().homeDomain('foreign.example')],
  ['nonzero account liabilities', f => f.response.entries[7].val.account().ext(new xdr.AccountEntryExt(1, new xdr.AccountEntryExtensionV1({ liabilities: new xdr.Liabilities({ buying: xdr.Int64.fromString('1'), selling: xdr.Int64.fromString('0') }), ext: new xdr.AccountEntryExtensionV1Ext(0) })))],
  ['invented expected principal', f => { f.expected.records[0].value.pot = '1'; setValue(f, 10, recordVal('Fade', f.expected.records[0].value)); }],
  ['invented expected credential', f => { f.expected.records[0].value.venue_pubkey = 'aa'.repeat(32); setValue(f, 10, recordVal('Fade', f.expected.records[0].value)); }],
  ['invented record ID', f => { f.expected.records[0].id = '2'; }],
  ['unplanned record label', f => { f.expected.records[0].record = 'fade-foreign'; }],
  ['unanchored start', f => { f.expected.records[0].value.start_ledger++; }],
  ['noncanonical expected integer', f => { f.expected.records[0].id = '01'; }],
  ['unfunded history assertion after creation', f => { f.expected.fundedHistory = false; }],
]) test(`snapshot rejects ${name}`, () => { const f = fixture(1); mutate(f); assert.throws(() => check(f), /LIFECYCLE_/); });

test('expected input accessors are rejected without being invoked', () => {
  const f = fixture(); let calls = 0; Object.defineProperty(f.expected, 'donationConfirmed', { enumerable: true, get() { calls++; return false; } });
  assert.throws(() => check(f)); assert.equal(calls, 0);
});
test('empty balance evidence cannot authorize a funded run or foreign/readless simulation', () => {
  for (const mutation of [f => { f.expected.zeroBalanceEvidence = null; }, f => { f.expected.zeroBalanceEvidence.resultXdr = b64(xdr.ScVal.scvU32(0)); }, f => { f.expected.zeroBalanceEvidence.envelopeXdr = new TransactionBuilder(new Account(plan.actors.seller, '1'), { fee: '100', networkPassphrase: plan.networkPassphrase }).addOperation(new Contract(plan.assets[1]).call('balance', new Address(plan.contractId).toScVal())).setTimeout(0).build().toXDR(); }, f => { f.expected.initialSurplusStroops = '1'; }]) {
    const f = fixture(); f.response.entries.splice(6, 1); zeroEvidence(f); mutation(f); assert.throws(() => check(f), /LIFECYCLE_/);
  }
});
test('full code gate refuses the structural fixture even with correct code entry hash', () => {
  const f = fixture(); assert.throws(() => verifyPublicLifecycleSnapshot(f, f.response), /LIFECYCLE_.*CODE/);
});
const wasmPath = new URL('../../contracts/agyion/target/wasm32v1-none/release/agyion.wasm', import.meta.url);
test('reviewed locally compiled WASM authenticates full snapshot and independently confirms Rust struct ABI', { skip: !fs.existsSync(wasmPath) }, () => {
  const wasm = fs.readFileSync(wasmPath), f = fixture(16, true); f.response.entries[0].val.contractCode().code(wasm);
  const result = verifyPublicLifecycleSnapshot(f, f.response); assert.equal(result.codeBytesAuthenticated, true);
  const spec = contract.Spec.fromWasm(wasm);
  for (let i = 0; i < f.expected.records.length; i++) {
    const r = f.expected.records[i], type = types[creates[i].method], decoded = spec.scValToNative(f.response.entries[i + 10].val.contractData().val(), xdr.ScSpecTypeDef.scSpecTypeUdt(new xdr.ScSpecTypeUdt({ name: type })));
    for (const [name, kind] of Object.entries(fields[type])) assert.deepEqual(decoded[name], r.value[name] === null ? null : kind === 'i128' ? BigInt(r.value[name]) : kind === 'bytes' ? Buffer.from(r.value[name], 'hex') : r.value[name]);
    assert.equal(b64(spec.nativeToScVal(decoded, xdr.ScSpecTypeDef.scSpecTypeUdt(new xdr.ScSpecTypeUdt({ name: type })))), b64(f.response.entries[i + 10].val.contractData().val()));
  }
  assert.deepEqual(verifyPublicLifecycleSnapshot(f, replay(f.response)), result);
});
const replay = response => ({ latestLedger: response.latestLedger, entries: response.entries.map(row => ({ ...row, key: b64(row.key), val: b64(row.val) })) });
test('canonical persisted JSON replay yields the identical coherent snapshot', () => {
  const f = fixture(16, true); assert.deepEqual(verifyPublicLifecycleState(f, JSON.parse(JSON.stringify(replay(f.response)))), check(f));
});
for (const [name, change] of [
  ['trailing bytes', r => { r.entries[0].val += 'AAAA'; }],
  ['noncanonical base64 whitespace', r => { r.entries[0].val += '\n'; }],
  ['oversize value', r => { r.entries[0].val = 'A'.repeat(65540); }],
  ['wire xdr alias without explicit mapping', r => { r.entries[0].xdr = r.entries[0].val; delete r.entries[0].val; }],
  ['unknown row field', r => { r.entries[0].passed = true; }],
  ['unknown response field', r => { r.success = true; }],
]) test(`persisted replay refuses ${name}`, () => { const f = fixture(), r = replay(f.response); change(r); assert.throws(() => verifyPublicLifecycleState(f, r), /LIFECYCLE_/); });

function terminalFixture() {
  const f = fixture(16, true);
  for (let i = 0; i < f.expected.records.length; i++) {
    f.expected.records[i] = plannedRecord(creates[i], f.expected.records[i].id, true);
    setValue(f, 10 + i, recordVal(types[creates[i].method], f.expected.records[i].value));
  }
  setValue(f, 4, i128(0));
  setValue(f, 6, map({ amount: i128(1), authorized: xdr.ScVal.scvBool(true), clawback: xdr.ScVal.scvBool(false) }));
  return f;
}
test('all terminal positions retain exactly the donation surplus and both initialized zero liabilities', () => {
  const f = terminalFixture(), result = check(f);
  assert.equal(result.openPrincipalStroops, '0'); assert.equal(result.nativeReserveStroops, '1');
  assert.deepEqual(result.liabilities.map(v => v.amount), ['0', '0']);
  f.response.entries.splice(6, 1); zeroEvidence(f); assert.throws(() => check(f), /ZERO/);
});
test('an explicit initial surplus is retained in reserve equality and cannot disappear in settlements', () => {
  const f = terminalFixture(); f.expected.initialSurplusStroops = '25';
  assert.throws(() => check(f), /RESERVE/);
  setValue(f, 6, map({ amount: i128(26), authorized: xdr.ScVal.scvBool(true), clawback: xdr.ScVal.scvBool(false) }));
  assert.equal(check(f).nativeReserveStroops, '26');
});
test('missing initialized zero liability never becomes zero through balance simulation evidence', () => {
  const f = fixture(); zeroEvidence(f); f.response.entries.splice(5, 1); assert.throws(() => check(f), /MISSING/);
});
test('record modification cannot predate its journaled creation even when supplied value matches', () => {
  const f = fixture(1); f.response.entries[10].lastModifiedLedgerSeq = 899; assert.throws(() => check(f), /RECORD_LEDGER/);
});
test('counter-bearing instance cannot predate the latest journaled creation', () => {
  const f = fixture(1); f.response.entries[1].lastModifiedLedgerSeq = 899; assert.throws(() => check(f), /INSTANCE_LEDGER/);
});
for (const [label, field, value] of [
  ['pod-timelock', 'unlock_ledger', 928], ['pod-timelock', 'claim_pubkey', 'ab'.repeat(32)],
  ['trigger-execution', 'deadline_ledger', 1020], ['trigger-execution', 'beneficiary', plan.actors.relayer],
  ['grant-permissive', 'valid_until', 2000], ['grant-permissive', 'max_per_tx', '1'],
  ['grant-permissive', 'daily_used', '1'], ['grant-permissive', 'claims_used', 1],
  ['fade-mixed', 'claimant', plan.actors.recipient],
]) test(`matching expected and observed ${label}.${field} cannot override immutable terms or state semantics`, () => {
  const f = fixture(16, true), index = f.expected.records.findIndex(r => r.record === label), r = f.expected.records[index];
  r.value[field] = value; setValue(f, 10 + index, recordVal(types[creates[index].method], r.value));
  assert.throws(() => check(f), /LIFECYCLE_/);
});
function modernAccountExt() {
  return new xdr.AccountEntryExt(1, new xdr.AccountEntryExtensionV1({ liabilities: new xdr.Liabilities({ buying: xdr.Int64.fromString('0'), selling: xdr.Int64.fromString('0') }), ext: new xdr.AccountEntryExtensionV1Ext(2, new xdr.AccountEntryExtensionV2({ numSponsored: 0, numSponsoring: 0, signerSponsoringIDs: [], ext: new xdr.AccountEntryExtensionV2Ext(3, new xdr.AccountEntryExtensionV3({ ext: new xdr.ExtensionPoint(0), seqLedger: 999, seqTime: xdr.TimePoint.fromString('1790520000') })) })) }));
}
test('normal modern classic account extensions retain exact raw account bytes for independent fee verification', () => {
  const f = fixture(); f.response.entries[7].val.account().ext(modernAccountExt());
  assert.equal(check(f).accounts.seller.accountEntryXdr, b64(f.response.entries[7].val.account()));
});
for (const [name, mutate] of [
  ['sponsored reserve', v2 => v2.numSponsored(1)], ['sponsoring reserve', v2 => v2.numSponsoring(1)],
  ['future source sequence ledger', v2 => v2.ext().v3().seqLedger(1001)],
]) test(`classic account rejects ${name}`, () => {
  const f = fixture(), ext = modernAccountExt(); mutate(ext.v1().ext().v2()); f.response.entries[7].val.account().ext(ext);
  assert.throws(() => check(f), /ACCOUNT_/);
});
test('claimed Fade keeps its principal until terminal settlement, with exact claimant and timestamp', () => {
  const f = fixture(1), r = f.expected.records[0]; r.value.state = 1; r.value.claimant = plan.actors.recipient; r.value.claimed_at = 950;
  setValue(f, 10, recordVal('Fade', r.value)); assert.equal(check(f).openPrincipalStroops, '10000000');
  r.value.claimed_at = 1001; setValue(f, 10, recordVal('Fade', r.value)); assert.throws(() => check(f), /RECORD_STATE/);
});
test('neither query keys nor decoding mutates expectations or raw evidence', () => {
  const f = fixture(16, true), raw = replay(f.response), before = JSON.stringify({ expected: f.expected, raw });
  publicLifecycleReadbackKeys(f.plan, f.expected); verifyPublicLifecycleState(f, raw);
  assert.equal(JSON.stringify({ expected: f.expected, raw }), before);
});

function fundingFixture(role = 'recipient') {
  const row = fixture().response.entries[role === 'recipient' ? 8 : 9];
  return { latestLedger: 1000, entries: [{ key: b64(row.key), val: b64(row.val), lastModifiedLedgerSeq: 999 }] };
}
const fundingCheck = (response, role = 'recipient', selectedPlan = plan) => readback.verifyPublicLifecycleFundingAccount({ plan: selectedPlan, role }, response);
test('funding account gate permits absent or pristine selected actor without claiming a funding transaction', () => {
  assert.equal(typeof readback.verifyPublicLifecycleFundingAccount, 'function');
  for (const role of ['recipient', 'relayer']) {
    const result = fundingCheck(fundingFixture(role), role);
    assert.equal(result.role, role); assert.equal(result.ledger, 1000);
    assert.equal(result.account.address, plan.actors[role]); assert.equal(result.account.balance, '10000000000');
    assert.equal(result.account.sequence, '4294967296000'); assert.equal(result.fundingTransactionAuthenticated, false);
    assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.account));
    const absent = fundingCheck({ latestLedger: 1000, entries: [] }, role);
    assert.equal(absent.account, null); assert.equal(absent.fundingTransactionAuthenticated, false);
  }
});
for (const role of ['seller', 'venue', '', null, 'recipient\n', {}, ['recipient']]) test(`funding rejects nonfundable role ${JSON.stringify(role)}`, () => {
  assert.throws(() => fundingCheck(fundingFixture(), role), /LIFECYCLE_READBACK_/);
});
for (const [name, mutate] of [
  ['duplicate', r => r.entries.push(r.entries[0])],
  ['other actor key', r => { r.entries[0].key = fundingFixture('relayer').entries[0].key; }],
  ['other actor value', r => { r.entries[0].val = fundingFixture('relayer').entries[0].val; }],
  ['future modification', r => { r.entries[0].lastModifiedLedgerSeq = 1001; }],
  ['zero modification', r => { r.entries[0].lastModifiedLedgerSeq = 0; }],
  ['zero ledger', r => { r.latestLedger = 0; }],
  ['fractional ledger', r => { r.latestLedger = 1000.5; }],
  ['extra field', r => { r.verified = true; }],
  ['account TTL', r => { r.entries[0].liveUntilLedgerSeq = 1001; }],
  ['noncanonical key', r => { r.entries[0].key += '\n'; }],
  ['bad value', r => { r.entries[0].val = 'AAAA'; }],
  ['nonaccount value', r => { r.entries[0].val = b64(fixture().response.entries[0].val); }],
]) test(`funding rejects ${name}`, () => {
  const response = fundingFixture(); mutate(response);
  assert.throws(() => fundingCheck(response), /LIFECYCLE_READBACK_/);
});
for (const [name, mutate] of [
  ['negative balance', a => a.balance(xdr.Int64.fromString('-1'))],
  ['negative sequence', a => a.seqNum(xdr.SequenceNumber.fromString('-1'))],
  ['extra subentry', a => a.numSubEntries(1)],
  ['flags', a => a.flags(1)],
  ['domain', a => a.homeDomain('untrusted')],
  ['changed threshold', a => a.thresholds(Buffer.from([1, 1, 0, 0]))],
  ['zero master', a => a.thresholds(Buffer.from([0, 0, 0, 0]))],
  ['liability', a => a.ext(new xdr.AccountEntryExt(1, new xdr.AccountEntryExtensionV1({ liabilities: new xdr.Liabilities({ buying: xdr.Int64.fromString('1'), selling: xdr.Int64.fromString('0') }), ext: new xdr.AccountEntryExtensionV1Ext(0) })))],
]) test(`funding rejects account ${name}`, () => {
  const response = fundingFixture(), val = xdr.LedgerEntryData.fromXDR(response.entries[0].val, 'base64');
  mutate(val.account()); response.entries[0].val = b64(val);
  assert.throws(() => fundingCheck(response), /LIFECYCLE_READBACK_/);
});
test('funding rejects accessor data without executing it and modified plan scope', () => {
  const response = fundingFixture(); let reads = 0;
  Object.defineProperty(response, 'entries', { enumerable: true, get() { reads++; throw Error('PRIVATE'); } });
  assert.throws(() => fundingCheck(response), /LIFECYCLE_READBACK_/); assert.equal(reads, 0);
  const changed = structuredClone(plan); changed.actors.seller = changed.actors.recipient;
  assert.throws(() => fundingCheck(fundingFixture(), 'recipient', changed), /LIFECYCLE_PLAN_/);
});
