/** Pure coherent RPC snapshot verification for the fixed public V4 lifecycle.
 * Expectations, ledger freshness bounds and RPC acquisition are trusted runner
 * policy. This decoder does not establish inclusion history or reconcile fees.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { validatePublicLifecyclePlan, hashPublicLifecyclePlan } from './public-lifecycle-plan.mjs';
const { Address, Contract, StrKey, nativeToScVal, xdr } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const ensure = (ok, suffix) => { if (!ok) throw Error(`LIFECYCLE_READBACK_${suffix}`); };
const bytes = value => value.toXDR('base64');
const u32 = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const ledgerNumber = value => u32(value) && value > 0;
const enumKey = name => xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(name)]);
const intVal = (value, type) => nativeToScVal(BigInt(value), { type });
const types = { create_fade: 'Fade', create_pod: 'Pod', create_trigger: 'Trigger', create_mandate: 'Mandate' };
const roles = ['seller', 'recipient', 'relayer'];
const fields = {
  Fade: { seller: 'address', asset: 'address', pot: 'i128', start_price: 'i128', floor_price: 'i128', start_ledger: 'u32', deadline_ledger: 'u32', handoff_window: 'u32', slope_num: 'i128', slope_den: 'i128', venue_pubkey: 'bytes', state: 'u32', claimant: '?address', claimed_at: '?u32' },
  Pod: { funder: 'address', asset: 'address', amount: 'i128', unlock_ledger: 'u32', claim_pubkey: 'bytes', state: 'u32' },
  Trigger: { funder: 'address', asset: 'address', amount: 'i128', beneficiary: 'address', attester_pubkey: 'bytes', deadline_ledger: 'u32', state: 'u32' },
  Mandate: { owner: 'address', agent_pubkey: 'bytes', max_per_tx: 'i128', daily_cap: 'i128', valid_until: 'u32', daily_used: 'i128', window_start: 'u32', revoked: 'bool', claims_used: 'u32' },
};
function exact(value, names) {
  ensure(value && !Array.isArray(value) && Object.keys(value).length === names.length && names.every(k => Object.hasOwn(value, k)), 'EXPECTED_FIELDS');
}
function decimal(value, bits, signed = false) {
  ensure(typeof value === 'string' && value.length <= 40 && /^(0|[1-9]\d*|-[1-9]\d*)$/.test(value), 'INTEGER');
  const n = BigInt(value), limit = 1n << BigInt(signed ? bits - 1 : bits);
  ensure(n >= (signed ? -limit : 0n) && n < limit, 'INTEGER'); return n;
}
// Copy bounded plain JSON without invoking accessors, prototypes or toJSON.
function plain(value, seen = new Set(), depth = 0) {
  ensure(depth <= 10, 'EXPECTED_DATA');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') { ensure(value.length <= 65536, 'EXPECTED_DATA'); return value; }
  if (typeof value === 'number') { ensure(Number.isSafeInteger(value) && !Object.is(value, -0), 'EXPECTED_DATA'); return value; }
  const array = Array.isArray(value);
  ensure(value && typeof value === 'object' && !seen.has(value) && Object.getPrototypeOf(value) === (array ? Array.prototype : Object.prototype) && Object.getOwnPropertySymbols(value).length === 0, 'EXPECTED_DATA');
  seen.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value), names = Object.keys(descriptors);
  ensure(names.length <= 64, 'EXPECTED_DATA');
  let copy;
  if (array) {
    ensure(names.length === value.length + 1, 'EXPECTED_DATA');
    copy = Array.from({ length: value.length }, (_, i) => { const d = descriptors[i]; ensure(d && d.enumerable && Object.hasOwn(d, 'value'), 'EXPECTED_DATA'); return plain(d.value, seen, depth + 1); });
  } else copy = Object.fromEntries(names.map(k => { const d = descriptors[k]; ensure(d.enumerable && Object.hasOwn(d, 'value'), 'EXPECTED_DATA'); return [k, plain(d.value, seen, depth + 1)]; }));
  seen.delete(value); return copy;
}
function scalar(value, type) {
  if (type.startsWith('?')) return value === null ? xdr.ScVal.scvVoid() : scalar(value, type.slice(1));
  if (type === 'i128') { decimal(value, 128, true); return intVal(value, type); }
  if (type === 'u32') { ensure(u32(value), 'RECORD_VALUE'); return xdr.ScVal.scvU32(value); }
  if (type === 'bool') { ensure(typeof value === 'boolean', 'RECORD_VALUE'); return xdr.ScVal.scvBool(value); }
  if (type === 'bytes') { ensure(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value), 'RECORD_VALUE'); return xdr.ScVal.scvBytes(Buffer.from(value, 'hex')); }
  ensure(typeof value === 'string' && (StrKey.isValidEd25519PublicKey(value) || StrKey.isValidContract(value)), 'RECORD_VALUE');
  return new Address(value).toScVal();
}
const scMap = values => xdr.ScVal.scvMap(Object.keys(values).sort().map(k => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(k), val: values[k] })));
function recordValue(type, value) {
  exact(value, Object.keys(fields[type]));
  return scMap(Object.fromEntries(Object.entries(fields[type]).map(([k, t]) => [k, scalar(value[k], t)])));
}
function checkRecord(plan, r, step, ledger) {
  const type = types[step.method], t = step.terms, v = r.value;
  const encoded = recordValue(type, v), key = StrKey.decodeEd25519PublicKey(plan.credentialKeys[t.credentialRole]).toString('hex');
  ensure(ledgerNumber(r.creationLedger) && ledgerNumber(r.preparedLedger) && r.preparedLedger <= r.creationLedger && r.creationLedger <= ledger, 'RECORD_LEDGER');
  const matches = fixed => ensure(Object.entries(fixed).every(([k, value]) => v[k] === value), 'RECORD_TERMS');
  if (type === 'Fade') {
    matches({ seller: plan.actors.seller, asset: t.asset, pot: t.amount, start_price: t.price, floor_price: t.price, start_ledger: r.creationLedger, deadline_ledger: r.creationLedger + t.durationLedgers, handoff_window: t.handoffWindow, slope_num: t.slopeNumerator, slope_den: t.slopeDenominator, venue_pubkey: key });
    ensure(v.state <= 3 && v.deadline_ledger + v.handoff_window < 0xffffffff, 'RECORD_STATE');
    if (v.claimant === null) ensure(v.claimed_at === null && (v.state === 0 || v.state === 3), 'RECORD_STATE');
    else ensure(v.claimant === plan.actors.recipient && ledgerNumber(v.claimed_at) && v.claimed_at >= v.start_ledger && v.claimed_at <= v.deadline_ledger && v.claimed_at <= ledger && v.state > 0, 'RECORD_STATE');
    if (v.state === 3) ensure(ledger > (v.claimed_at === null ? v.deadline_ledger : v.claimed_at + v.handoff_window), 'RECORD_STATE');
  } else if (type === 'Pod') {
    matches({ funder: plan.actors.seller, asset: t.asset, amount: t.amount, unlock_ledger: r.preparedLedger + t.unlockOffsetLedgers, claim_pubkey: key });
    ensure(v.state <= 1 && (v.state === 0 || ledger >= v.unlock_ledger), 'RECORD_STATE');
  } else if (type === 'Trigger') {
    matches({ funder: plan.actors.seller, asset: t.asset, amount: t.amount, beneficiary: t.beneficiary, attester_pubkey: key, deadline_ledger: r.preparedLedger + t.deadlineOffsetLedgers });
    ensure(v.deadline_ledger > r.creationLedger && v.deadline_ledger < 0xffffffff && v.state <= 2 && (v.state !== 2 || ledger > v.deadline_ledger), 'RECORD_STATE');
  } else {
    matches({ owner: plan.actors.recipient, agent_pubkey: key, max_per_tx: t.maxPerTx, daily_cap: t.dailyCap, valid_until: r.preparedLedger + t.validForLedgers, daily_used: '0', window_start: r.creationLedger });
    ensure(v.valid_until > r.creationLedger && v.claims_used <= (r.record === 'grant-capped' ? 1 : 0), 'RECORD_STATE');
  }
  return { type, encoded, principal: type === 'Fade' && v.state < 2 ? BigInt(v.pot) : (type === 'Pod' || type === 'Trigger') && v.state === 0 ? BigInt(v.amount) : 0n };
}
function expectations(plan, input) {
  validatePublicLifecyclePlan(plan);
  const expected = plain(input);
  exact(expected, ['minLedger', 'maxLedger', 'initialSurplusStroops', 'donationConfirmed', 'fundedHistory', 'records', 'accounts', 'zeroBalanceEvidence']);
  ensure(ledgerNumber(expected.minLedger) && ledgerNumber(expected.maxLedger) && expected.minLedger <= expected.maxLedger, 'EXPECTED_LEDGER');
  ensure(decimal(expected.initialSurplusStroops, 128, true) >= 0n && typeof expected.donationConfirmed === 'boolean' && typeof expected.fundedHistory === 'boolean', 'EXPECTED_ACCOUNTING');
  exact(expected.accounts, roles);
  for (const role of roles) { exact(expected.accounts[role], ['sequence']); ensure(decimal(expected.accounts[role].sequence, 64, true) >= 0n, 'ACCOUNT_SEQUENCE'); }
  const creates = plan.steps.filter(s => types[s.method]), counters = { Fade: '0', Pod: '0', Trigger: '0', Mandate: '0' };
  ensure(Array.isArray(expected.records) && expected.records.length <= creates.length && expected.fundedHistory === (expected.records.length > 0) && (!expected.donationConfirmed || expected.records.length === creates.length), 'EXPECTED_HISTORY');
  const records = expected.records.map((r, i) => {
    exact(r, ['record', 'id', 'creationLedger', 'preparedLedger', 'value']);
    const type = types[creates[i].method]; counters[type] = String(BigInt(counters[type]) + 1n);
    ensure(r.record === creates[i].record && decimal(r.id, 64) > 0n && r.id === counters[type], 'RECORD_ID');
    return { ...r, ...checkRecord(plan, r, creates[i], expected.maxLedger) };
  });
  if (expected.zeroBalanceEvidence !== null) exact(expected.zeroBalanceEvidence, ['envelopeXdr', 'ledger', 'resultXdr']);
  return { expected, counters, records, creates };
}
function dataKey(contract, key) {
  return xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({ contract: new Address(contract).toScAddress(), key, durability: xdr.ContractDataDurability.persistent() }));
}
function keysFor(plan, records) {
  return [xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: Buffer.from(plan.wasmSha256, 'hex') })), new Contract(plan.contractId).getFootprint(), ...plan.assets.map(a => new Contract(a).getFootprint()), ...plan.assets.map(a => dataKey(plan.contractId, xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Liability'), new Address(a).toScVal()]))), dataKey(plan.assets[0], xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Balance'), new Address(plan.contractId).toScVal()])), ...roles.map(role => xdr.LedgerKey.account(new xdr.LedgerKeyAccount({ accountId: new Address(plan.actors[role]).toScAddress().accountId() }))), ...records.map(r => dataKey(plan.contractId, xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(r.type), intVal(r.id, 'u64')])))];
}
export function publicLifecycleReadbackKeys(plan, expected) {
  return keysFor(plan, expectations(plan, expected).records);
}
// Durable replay uses base64 key/val, never serialized SDK object graphs.
// An RPC adapter explicitly maps wire `xdr` to `val`; this module does no I/O.
function responseRows(response) {
  ensure(response && Array.isArray(response.entries) && response.entries.length <= 26, 'ROWS');
  const stringRows = response.entries.some(row => typeof row?.key === 'string' || typeof row?.val === 'string');
  if (!stringRows) return response;
  const copied = plain(response); exact(copied, ['latestLedger', 'entries']);
  return { latestLedger: copied.latestLedger, entries: copied.entries.map(row => {
    exact(row, ['key', 'val', 'lastModifiedLedgerSeq', ...(Object.hasOwn(row, 'liveUntilLedgerSeq') ? ['liveUntilLedgerSeq'] : [])]);
    const decode = (value, Type, limit) => {
      ensure(typeof value === 'string' && value.length <= limit, 'XDR');
      let decoded; try { decoded = Type.fromXDR(value, 'base64'); } catch { throw Error('LIFECYCLE_READBACK_XDR'); }
      ensure(bytes(decoded) === value, 'XDR'); return decoded;
    };
    return { ...row, key: decode(row.key, xdr.LedgerKey, 1024), val: decode(row.val, xdr.LedgerEntryData, 65536) };
  }) };
}
function checkedRows(keys, response, expected) {
  const ledger = response?.latestLedger;
  ensure(ledgerNumber(ledger) && ledger >= expected.minLedger && ledger <= expected.maxLedger, 'LEDGER');
  ensure(Array.isArray(response.entries) && response.entries.length <= keys.length, 'ROWS');
  const wanted = new Map(keys.map(k => [bytes(k), k])), rows = new Map();
  for (const row of response.entries) {
    const id = bytes(row.key), key = wanted.get(id); ensure(key && !rows.has(id), 'KEY');
    ensure(ledgerNumber(row.lastModifiedLedgerSeq) && row.lastModifiedLedgerSeq <= ledger, 'MODIFIED');
    const type = key.switch().name; ensure(row.val.switch().name === type, 'TYPE');
    if (type !== 'account') ensure(ledgerNumber(row.liveUntilLedgerSeq) && row.liveUntilLedgerSeq >= ledger, 'TTL');
    if (type === 'contractCode') ensure(row.val.contractCode().hash().equals(key.contractCode().hash()), 'CODE');
    else if (type === 'account') ensure(bytes(row.val.account().accountId()) === bytes(key.account().accountId()), 'ACCOUNT_ID');
    else {
      const actual = row.val.contractData(), requested = key.contractData();
      ensure(actual.ext().switch() === 0 && bytes(actual.contract()) === bytes(requested.contract()) && bytes(actual.key()) === bytes(requested.key()) && actual.durability().value === requested.durability().value, 'DATA_KEY');
    }
    rows.set(id, row);
  }
  for (const [i, key] of keys.entries()) ensure(i === 6 || rows.has(bytes(key)), 'MISSING');
  return { ledger, get: index => rows.get(bytes(keys[index])) };
}
function account(row, address, sequence, ledger) {
  const a = row.val.account();
  ensure(a.balance().toBigInt() >= 0n && a.seqNum().toString() === sequence, 'ACCOUNT_BALANCE_SEQUENCE');
  ensure(a.numSubEntries() === 0 && a.inflationDest() == null && a.flags() === 0 && Buffer.from(a.homeDomain()).length === 0 && a.thresholds().equals(Buffer.from([1, 0, 0, 0])) && a.signers().length === 0, 'ACCOUNT_AUTHORITY');
  const ext = a.ext(); ensure(ext.switch() === 0 || ext.switch() === 1, 'ACCOUNT_EXTENSION');
  if (ext.switch() === 1) {
    const v1 = ext.v1(); ensure(v1.liabilities().buying().toString() === '0' && v1.liabilities().selling().toString() === '0', 'ACCOUNT_LIABILITIES');
    ensure(v1.ext().switch() === 0 || v1.ext().switch() === 2, 'ACCOUNT_EXTENSION');
    if (v1.ext().switch() === 2) {
      const v2 = v1.ext().v2(); ensure(v2.numSponsored() === 0 && v2.numSponsoring() === 0 && v2.signerSponsoringIDs().length === 0, 'ACCOUNT_SPONSORSHIP');
      ensure(v2.ext().switch() === 0 || v2.ext().switch() === 3, 'ACCOUNT_EXTENSION');
      if (v2.ext().switch() === 3) { const v3 = v2.ext().v3(); ensure(v3.ext().switch() === 0 && u32(v3.seqLedger()) && v3.seqLedger() <= ledger, 'ACCOUNT_SEQUENCE_LEDGER'); }
    }
  }
  return { address, balance: a.balance().toString(), sequence, accountEntryXdr: bytes(a), lastModifiedLedgerSeq: row.lastModifiedLedgerSeq };
}
function amount(value) {
  ensure(value.switch().name === 'scvI128', 'AMOUNT');
  const n = (value.i128().hi().toBigInt() << 64n) + value.i128().lo().toBigInt();
  ensure(n >= 0n, 'AMOUNT'); return n;
}
function zeroEvidence(plan, expected, ledger) {
  const evidence = expected.zeroBalanceEvidence;
  ensure(!expected.fundedHistory && !expected.donationConfirmed && expected.records.length === 0 && expected.initialSurplusStroops === '0' && evidence?.ledger === ledger && evidence.resultXdr === bytes(intVal('0', 'i128')), 'ZERO_EVIDENCE');
  try {
    const envelope = xdr.TransactionEnvelope.fromXDR(evidence.envelopeXdr, 'base64');
    ensure(bytes(envelope) === evidence.envelopeXdr && envelope.switch().name === 'envelopeTypeTx' && envelope.v1().signatures().length === 0, 'ZERO_EVIDENCE');
    const tx = envelope.v1().tx(), ops = tx.operations();
    ensure(tx.sourceAccount().switch().name === 'keyTypeEd25519' && Object.values(plan.actors).includes(StrKey.encodeEd25519PublicKey(tx.sourceAccount().ed25519())) && ops.length === 1 && ops[0].sourceAccount() == null && ops[0].body().switch().name === 'invokeHostFunction', 'ZERO_EVIDENCE');
    const op = ops[0].body().invokeHostFunctionOp();
    ensure(op.auth().length === 0 && op.hostFunction().switch().name === 'hostFunctionTypeInvokeContract', 'ZERO_EVIDENCE');
    const invoke = op.hostFunction().invokeContract();
    ensure(bytes(invoke.contractAddress()) === bytes(new Address(plan.assets[0]).toScAddress()) && invoke.functionName().toString() === 'balance' && invoke.args().length === 1 && bytes(invoke.args()[0]) === bytes(new Address(plan.contractId).toScVal()), 'ZERO_EVIDENCE');
  } catch { throw Error('LIFECYCLE_READBACK_ZERO_EVIDENCE'); }
}
/** Structure only for synthetic fixtures. NEVER release journal successors from
 * this helper: the sole full code gate is verifyPublicLifecycleSnapshot below. */
export function verifyPublicLifecycleState({ plan, expected: input }, response) {
  const { expected, counters, records, creates } = expectations(plan, input), keys = keysFor(plan, records);
  const { ledger, get } = checkedRows(keys, responseRows(response), expected), value = get(1).val.contractData().val();
  ensure(value.switch().name === 'scvContractInstance', 'INSTANCE');
  const instance = value.instance();
  ensure(instance.executable().switch().name === 'contractExecutableWasm' && instance.executable().wasmHash().toString('hex') === plan.wasmSha256, 'CODE');
  ensure(records.every(r => get(1).lastModifiedLedgerSeq >= r.creationLedger), 'INSTANCE_LEDGER');
  const storage = [new xdr.ScMapEntry({ key: enumKey('AccountingVersion'), val: xdr.ScVal.scvU32(4) }), new xdr.ScMapEntry({ key: enumKey('Assets'), val: xdr.ScVal.scvVec(plan.assets.map(a => new Address(a).toScVal())) }), ...Object.keys(counters).filter(t => counters[t] !== '0').sort().map(t => new xdr.ScMapEntry({ key: enumKey(t + 'Count'), val: intVal(counters[t], 'u64') }))];
  ensure(Array.isArray(instance.storage()) && bytes(xdr.ScVal.scvMap(instance.storage())) === bytes(xdr.ScVal.scvMap(storage)), 'INSTANCE_STORAGE');
  let principal = 0n;
  const observed = records.map((r, i) => {
    const checked = checkRecord(plan, r, creates[i], ledger), row = get(10 + i);
    ensure(row.lastModifiedLedgerSeq >= r.creationLedger, 'RECORD_LEDGER');
    ensure(bytes(row.val.contractData().val()) === bytes(checked.encoded), 'RECORD'); principal += checked.principal;
    return { record: r.record, type: r.type, id: r.id, creationLedger: r.creationLedger, preparedLedger: r.preparedLedger, value: r.value, lastModifiedLedgerSeq: row.lastModifiedLedgerSeq, liveUntilLedgerSeq: row.liveUntilLedgerSeq };
  });
  ensure(principal <= BigInt(plan.limits.outstandingPrincipalStroops), 'PRINCIPAL_LIMIT');
  const liabilities = plan.assets.map((asset, i) => {
    const sac = get(2 + i).val.contractData().val();
    ensure(sac.switch().name === 'scvContractInstance' && sac.instance().executable().switch().name === 'contractExecutableStellarAsset', 'SAC');
    const row = get(4 + i), debt = amount(row.val.contractData().val());
    // Restoring persistent data can update its modification ledger while the
    // already-live instance is unchanged. Compare both only to the RPC head.
    ensure(debt === (i === 0 ? principal : 0n), 'LIABILITY');
    return { asset, amount: String(debt), lastModifiedLedgerSeq: row.lastModifiedLedgerSeq, liveUntilLedgerSeq: row.liveUntilLedgerSeq };
  });
  let reserve = 0n;
  if (!get(6)) zeroEvidence(plan, expected, ledger);
  else {
    const balance = get(6).val.contractData().val(); ensure(balance.switch().name === 'scvMap', 'BALANCE');
    const entries = balance.map(); ensure(entries?.length === 3 && entries[0].key().switch().name === 'scvSymbol' && entries[0].key().sym().toString() === 'amount', 'BALANCE');
    reserve = amount(entries[0].val());
    ensure(bytes(balance) === bytes(scMap({ amount: intVal(String(reserve), 'i128'), authorized: xdr.ScVal.scvBool(true), clawback: xdr.ScVal.scvBool(false) })), 'BALANCE');
  }
  ensure(reserve === principal + BigInt(expected.initialSurplusStroops) + (expected.donationConfirmed ? 1n : 0n), 'RESERVE');
  const accounts = Object.fromEntries(roles.map((role, i) => [role, account(get(7 + i), plan.actors[role], expected.accounts[role].sequence, ledger)]));
  const entryMetadata = keys.map((key, i) => ({ key: bytes(key), present: Boolean(get(i)), ...(get(i) ? { lastModifiedLedgerSeq: get(i).lastModifiedLedgerSeq, ...(key.switch().name === 'account' ? {} : { liveUntilLedgerSeq: get(i).liveUntilLedgerSeq }) } : {}) }));
  return { schema: 'agyion-public-v4-lifecycle-state-structure-v1', planSha256: hashPublicLifecyclePlan(plan), contractId: plan.contractId, wasmSha256: plan.wasmSha256, ledger, codeBytesAuthenticated: false, counters, liabilities, nativeReserveStroops: String(reserve), openPrincipalStroops: String(principal), initialSurplusStroops: expected.initialSurplusStroops, donationStroops: expected.donationConfirmed ? '1' : '0', records: observed, accounts, entryMetadata, boundary: 'Coherent RPC structure only; no executable-byte authentication, inclusion-history, fee reconciliation or production guarantee.' };
}
/** Sole snapshot gate: fixed reviewed executable bytes plus coherent state.
 * The trusted caller derives expectations from its journal and authenticates
 * its RPC transport. This is not a trustless ledger or fee proof. */
export function verifyPublicLifecycleSnapshot(input, response) {
  const normalized = responseRows(response), state = verifyPublicLifecycleState(input, normalized), codeKey = publicLifecycleReadbackKeys(input.plan, input.expected)[0];
  const code = Buffer.from(normalized.entries.find(r => bytes(r.key) === bytes(codeKey)).val.contractCode().code());
  ensure(code.length === 26696 && createHash('sha256').update(code).digest('hex') === input.plan.wasmSha256, 'CODE_BYTES');
  return { ...state, schema: 'agyion-public-v4-lifecycle-snapshot-v1', codeBytesAuthenticated: true, boundary: 'Reviewed code and coherent trusted RPC snapshot against runner-supplied expectations; no inclusion-history, fee reconciliation, independent audit or production guarantee.' };
}
