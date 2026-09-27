/** Pure policy for the fixed inactive V4 lifecycle. The journal authenticates
 * inclusion/fee metadata before projecting its compact completed prefix here.
 * This module derives state, verifies real raw readback/header bytes and funds;
 * it does not authenticate RPC transport, send transactions or trust persisted
 * `verified` flags. Recreate initial/derived provenance from raw data on replay.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { validatePublicLifecyclePlan, hashPublicLifecyclePlan } from './public-lifecycle-plan.mjs';
import { bindPublicLifecycleCall } from './public-lifecycle-call.mjs';
import { verifyPublicLifecycleSnapshot } from './public-lifecycle-readback.mjs';
const { Address, StrKey, xdr } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const roles = ['seller', 'recipient', 'relayer'];
const types = { create_fade: 'Fade', create_pod: 'Pod', create_trigger: 'Trigger', create_mandate: 'Mandate' };
const initialBrands = new WeakMap(), derivedBrands = new WeakSet(), failures = new WeakSet();
const ensure = (ok, code) => { if (!ok) { const error = Error(`LIFECYCLE_STATE_${code}`); failures.add(error); throw error; } };
const frozen = value => { if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); } return value; };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const b64 = value => value.toXDR('base64');
function safe(fn) { try { return fn(); } catch (error) { if (error && failures.has(error)) throw error; throw Error('LIFECYCLE_STATE_INPUT'); } }
// Only already-copied data reaches these fixed local decoders. A hostile proxy
// exception cannot acquire provenance merely by imitating their error prefix.
function trusted(fn) { try { return fn(); } catch (error) { if (error instanceof Error && /^LIFECYCLE_(READBACK|PLAN|CALL)_/.test(error.message)) failures.add(error); throw error; } }
function exact(value, required, optional = []) {
  ensure(value && Object.getPrototypeOf(value) === Object.prototype, 'FIELDS');
  const descriptors = Object.getOwnPropertyDescriptors(value), names = Reflect.ownKeys(descriptors);
  ensure(required.every(k => Object.hasOwn(descriptors, k)) && names.every(k => typeof k === 'string' && [...required, ...optional].includes(k) && descriptors[k].enumerable && Object.hasOwn(descriptors[k], 'value')), 'FIELDS');
}
function copy(value) {
  let nodes = 0, size = 0; const seen = new Set();
  function visit(v, depth) {
    ensure(++nodes <= 20000 && depth <= 20, 'BOUNDS');
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'string') { size += v.length; ensure(v.length <= 65536 && size <= 2097152, 'BOUNDS'); return v; }
    if (typeof v === 'number') { ensure(Number.isSafeInteger(v) && !Object.is(v, -0), 'DATA'); return v; }
    const array = Array.isArray(v); ensure(v && typeof v === 'object' && Object.getPrototypeOf(v) === (array ? Array.prototype : Object.prototype) && !seen.has(v), 'DATA');
    seen.add(v); const descriptors = Object.getOwnPropertyDescriptors(v), names = Reflect.ownKeys(descriptors);
    ensure(names.length <= 128 && names.every(k => typeof k === 'string'), 'DATA');
    let result;
    if (array) {
      const length = descriptors.length?.value; ensure(Number.isInteger(length) && length <= 127 && names.length === length + 1, 'DATA');
      result = Array.from({ length }, (_, i) => { const d = descriptors[i]; ensure(d?.enumerable && Object.hasOwn(d, 'value'), 'DATA'); return visit(d.value, depth + 1); });
    } else result = Object.fromEntries(names.map(k => { const d = descriptors[k]; ensure(d.enumerable && Object.hasOwn(d, 'value'), 'DATA'); return [k, visit(d.value, depth + 1)]; }));
    seen.delete(v); return result;
  }
  return visit(value, 0);
}
const same = (a, b, code) => ensure(JSON.stringify(a) === JSON.stringify(b), code);
function integer(v, bits = 64, positive = false) { ensure(typeof v === 'string' && v.length <= 40 && /^(0|[1-9][0-9]*)$/.test(v), 'INTEGER'); const n = BigInt(v); ensure(n < (1n << BigInt(bits - 1)) && n >= (positive ? 1n : 0n), 'INTEGER'); return n; }
function ledger(v) { ensure(Number.isSafeInteger(v) && v > 0 && v <= 0xffffffff, 'LEDGER'); return v; }
function decode(value, Type, limit = 65536) { ensure(typeof value === 'string' && value.length > 0 && value.length <= limit, 'XDR'); const result = Type.fromXDR(value, 'base64'); ensure(b64(result) === value, 'XDR'); return result; }
function headerChecked(input) {
  exact(input, ['headerEvidence', 'ledger']); const evidence = copy(input.headerEvidence); exact(evidence, ['kind', 'ledger', 'hash', 'headerXdr']);
  ensure(evidence.kind === 'latest' || evidence.kind === 'history', 'HEADER_KIND');
  ensure(ledger(evidence.ledger) === ledger(input.ledger) && typeof evidence.hash === 'string' && /^[0-9a-f]{64}$/.test(evidence.hash), 'HEADER_SCOPE');
  let header;
  if (evidence.kind === 'latest') header = decode(evidence.headerXdr, xdr.LedgerHeader, 4096);
  else { const history = decode(evidence.headerXdr, xdr.LedgerHeaderHistoryEntry, 4096); ensure(history.ext().switch() === 0 && history.hash().toString('hex') === evidence.hash, 'HEADER_HISTORY'); header = history.header(); }
  ensure(header.ledgerSeq() === evidence.ledger && sha(header.toXDR()) === evidence.hash, 'HEADER_HASH');
  const reserve = header.baseReserve(); ensure(Number.isInteger(reserve) && reserve > 0 && reserve <= 0xffffffff, 'HEADER_RESERVE');
  return frozen({ ledger: evidence.ledger, hash: evidence.hash, baseReserveStroops: String(reserve), minimumBalanceStroops: String(BigInt(reserve) * 2n) });
}
/** Latest uses LedgerHeader; history uses LedgerHeaderHistoryEntry. A matching
 * trusted RPC header is required, not an assumed network reserve constant. */
export function verifyPublicLifecycleHeader(input) { return safe(() => headerChecked(input)); }
function rawResponse(input) {
  const response = copy(input); exact(response, ['latestLedger', 'entries']); ledger(response.latestLedger);
  ensure(Array.isArray(response.entries) && response.entries.length <= 26, 'ROWS'); const rows = new Map();
  for (const row of response.entries) {
    exact(row, ['key', 'val', 'lastModifiedLedgerSeq'], ['liveUntilLedgerSeq']);
    const key = decode(row.key, xdr.LedgerKey, 1024), val = decode(row.val, xdr.LedgerEntryData);
    ensure(!rows.has(row.key), 'DUPLICATE'); rows.set(row.key, { key, val });
  }
  return { response, rows };
}
const accountKey = address => b64(xdr.LedgerKey.account(new xdr.LedgerKeyAccount({ accountId: new Address(address).toScAddress().accountId() })));
function nativeKey(plan) { return b64(xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({ contract: new Address(plan.assets[0]).toScAddress(), key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Balance'), new Address(plan.contractId).toScVal()]), durability: xdr.ContractDataDurability.persistent() }))); }
function surplusFromRaw(row) {
  if (!row) return '0'; ensure(row.val.switch().name === 'contractData', 'BALANCE');
  const v = row.val.contractData().val(); ensure(v.switch().name === 'scvMap', 'BALANCE');
  const amount = v.map()?.find(e => e.key().switch().name === 'scvSymbol' && e.key().sym().toString() === 'amount')?.val();
  ensure(amount?.switch().name === 'scvI128', 'BALANCE'); const n = (amount.i128().hi().toBigInt() << 64n) + amount.i128().lo().toBigInt(); ensure(n >= 0n, 'BALANCE'); return String(n);
}
function remaining(plan, index, reserve, accounts) {
  const result = Object.fromEntries(roles.map(r => [r, { gross: 0n, count: 0 }]));
  // The caller has validated the exact immutable schedule. Future gross debits
  // need neither credential payloads nor a full call/plan rebuild per step.
  // Do not offset these needs with later refunds, payouts or other credits.
  for (const step of plan.steps.slice(index)) {
    result[step.sourceRole].count++;
    if (['create_fade', 'create_pod', 'create_trigger'].includes(step.method)) result.seller.gross += BigInt(step.terms.amount);
    if (step.method === 'confirm_handoff' && BigInt(step.terms.price) > 0n) result.recipient.gross += BigInt(step.terms.price);
    if (step.kind === 'donation') result.seller.gross += BigInt(step.terms.amount);
  }
  return Object.fromEntries(roles.map(role => {
    const r = result[role], fees = BigInt(plan.limits.perTransactionFeeStroops) * BigInt(r.count), required = r.gross + fees + BigInt(reserve.minimumBalanceStroops);
    ensure(integer(accounts[role].balance) >= required, 'FUNDS');
    return [role, { grossOutflowStroops: String(r.gross), transactions: r.count, feeCeilingStroops: String(fees), minimumBalanceStroops: reserve.minimumBalanceStroops, requiredStroops: String(required) }];
  }));
}
export function initialPublicLifecycleState(input) { return safe(() => {
  exact(input, ['plan', 'response', 'zeroBalanceEvidence', 'headerEvidence']); const plan = copy(input.plan); trusted(() => validatePublicLifecyclePlan(plan));
  const { response, rows } = rawResponse(input.response), reserve = headerChecked({ headerEvidence: input.headerEvidence, ledger: response.latestLedger });
  const accounts = Object.fromEntries(roles.map(role => { const row = rows.get(accountKey(plan.actors[role])); ensure(row?.val.switch().name === 'account', 'ACCOUNT'); return [role, { sequence: row.val.account().seqNum().toString() }]; }));
  const expected = { minLedger: response.latestLedger, maxLedger: response.latestLedger, initialSurplusStroops: surplusFromRaw(rows.get(nativeKey(plan))), donationConfirmed: false, fundedHistory: false, records: [], accounts, zeroBalanceEvidence: copy(input.zeroBalanceEvidence) };
  const snapshot = trusted(() => verifyPublicLifecycleSnapshot({ plan, expected }, response)), remainingBudget = remaining(plan, 0, reserve, snapshot.accounts);
  const result = frozen({ planSha256: hashPublicLifecyclePlan(plan), expected, snapshot, reserve, remainingBudget }); initialBrands.set(result, result); return result;
}); }
function bound(plan, step, raw) {
  const binding = copy(raw); exact(binding, ['sequence', 'headLedger', 'argsXdr'], ['timestamp', 'signatureHex']); integer(binding.sequence, 64, true); ledger(binding.headLedger);
  const derived = trusted(() => bindPublicLifecycleCall({ plan, stepId: step.id, headLedger: binding.headLedger, ...(Object.hasOwn(binding, 'timestamp') ? { timestamp: binding.timestamp } : {}), ...(Object.hasOwn(binding, 'signatureHex') ? { signatureHex: binding.signatureHex } : {}) }));
  same(binding.argsXdr, derived.call.argsXdr, 'CALL'); return { binding, derived };
}
function included(raw, binding, derived) {
  const result = copy(raw); exact(result, ['status', 'ledger', 'createdId']); ensure(result.status === 'SUCCESS' && ledger(result.ledger) > binding.headLedger, 'INCLUSION');
  ensure(result.createdId === derived.expectedCreatedId, 'CREATED_ID'); return result;
}
function accountProjection(plan, input, head) {
  const accounts = copy(input); exact(accounts, roles);
  for (const role of roles) {
    const a = accounts[role]; exact(a, ['address', 'balance', 'sequence', 'accountEntryXdr', 'lastModifiedLedgerSeq']);
    integer(a.balance); integer(a.sequence); ensure(a.address === plan.actors[role] && ledger(a.lastModifiedLedgerSeq) <= head, 'ACCOUNT');
    const value = decode(a.accountEntryXdr, xdr.AccountEntry, 4096);
    ensure(value.accountId().switch().name === 'publicKeyTypeEd25519' && StrKey.encodeEd25519PublicKey(value.accountId().ed25519()) === a.address && value.balance().toString() === a.balance && value.seqNum().toString() === a.sequence, 'ACCOUNT');
    ensure(value.numSubEntries() === 0 && value.inflationDest() == null && value.flags() === 0 && value.homeDomain().length === 0 && value.thresholds().equals(Buffer.from([1, 0, 0, 0])) && value.signers().length === 0, 'ACCOUNT');
  }
  return accounts;
}
function transition(plan, state, step, binding, inclusion) {
  const t = step.terms, at = inclusion.ledger, type = types[step.method]; let r = state.records.find(r => r.record === step.record);
  if (type) {
    ensure(!r, 'DUPLICATE_RECORD'); const key = StrKey.decodeEd25519PublicKey(plan.credentialKeys[t.credentialRole]).toString('hex'); let value;
    if (type === 'Fade') value = { seller: plan.actors.seller, asset: t.asset, pot: t.amount, start_price: t.price, floor_price: t.price, start_ledger: at, deadline_ledger: at + t.durationLedgers, handoff_window: t.handoffWindow, slope_num: t.slopeNumerator, slope_den: t.slopeDenominator, venue_pubkey: key, state: 0, claimant: null, claimed_at: null };
    if (type === 'Pod') value = { funder: plan.actors.seller, asset: t.asset, amount: t.amount, unlock_ledger: binding.headLedger + t.unlockOffsetLedgers, claim_pubkey: key, state: 0 };
    if (type === 'Trigger') { ensure(binding.headLedger + t.deadlineOffsetLedgers > at, 'DEADLINE'); value = { funder: plan.actors.seller, asset: t.asset, amount: t.amount, beneficiary: t.beneficiary, attester_pubkey: key, deadline_ledger: binding.headLedger + t.deadlineOffsetLedgers, state: 0 }; }
    if (type === 'Mandate') { ensure(binding.headLedger + t.validForLedgers > at, 'DEADLINE'); value = { owner: plan.actors.recipient, agent_pubkey: key, max_per_tx: t.maxPerTx, daily_cap: t.dailyCap, valid_until: binding.headLedger + t.validForLedgers, daily_used: '0', window_start: at, revoked: false, claims_used: 0 }; }
    r = { record: step.record, id: inclusion.createdId, type, creationStepId: step.id, creationLedger: at, preparedLedger: binding.headLedger, lastTransitionStepId: step.id, lastTransitionLedger: at, value }; state.records.push(r);
  } else if (step.kind === 'donation') { ensure(!state.donated, 'DONATION'); state.donated = true; }
  else {
    ensure(r, 'RECORD'); const v = r.value;
    if (step.method === 'claim' || step.method === 'envoy_claim') {
      ensure(v.state === 0 && at <= v.deadline_ledger, 'CLAIM_WINDOW');
      if (step.method === 'envoy_claim') {
        const grant = state.records.find(x => x.record === t.mandate); ensure(grant?.type === 'Mandate', 'MANDATE'); const g = grant.value, price = BigInt(v.start_price);
        ensure(!g.revoked && at <= g.valid_until && g.claims_used < 50 && price <= 0n && price <= BigInt(g.max_per_tx) && BigInt(g.daily_used) + price <= BigInt(g.daily_cap), 'MANDATE');
        ensure(at - g.window_start < 17280, 'MANDATE_WINDOW'); g.claims_used++; grant.lastTransitionStepId = step.id; grant.lastTransitionLedger = at;
      }
      v.state = 1; v.claimant = plan.actors.recipient; v.claimed_at = at;
    } else if (step.method === 'confirm_handoff') { ensure(v.state === 1 && at <= v.claimed_at + v.handoff_window, 'HANDOFF_WINDOW'); v.state = 2; }
    else if (step.method === 'refund') { ensure((v.state === 0 && at > v.deadline_ledger) || (v.state === 1 && at > v.claimed_at + v.handoff_window), 'REFUND_WINDOW'); v.state = 3; }
    else if (step.method === 'claim_pod') { ensure(v.state === 0 && at >= v.unlock_ledger, 'UNLOCK'); v.state = 1; }
    else if (step.method === 'attest') { ensure(v.state === 0 && at <= v.deadline_ledger, 'ATTEST_WINDOW'); v.state = 1; }
    else if (step.method === 'refund_trigger') { ensure(v.state === 0 && at > v.deadline_ledger, 'REFUND_WINDOW'); v.state = 2; }
    else if (step.method === 'revoke_mandate') v.revoked = true;
    else ensure(false, 'METHOD');
    r.lastTransitionStepId = step.id; r.lastTransitionLedger = at;
  }
}
function prefixState(plan, initial, prefix) {
  ensure(Array.isArray(prefix) && prefix.length < plan.steps.length, 'PREFIX');
  const state = { records: [], donated: false, accounts: copy(initial.snapshot.accounts), lastLedger: initial.snapshot.ledger, authorized: 0n };
  for (let index = 0; index < prefix.length; index++) {
    const row = prefix[index], step = plan.steps[index]; exact(row, ['stepId', 'binding', 'inclusion', 'fee', 'after']); ensure(row.stepId === step.id, 'PREFIX');
    const { binding, derived } = bound(plan, step, row.binding); ensure(binding.headLedger >= state.lastLedger && BigInt(binding.sequence) === BigInt(state.accounts[step.sourceRole].sequence) + 1n, 'PREFIX_SEQUENCE');
    const inclusion = included(row.inclusion, binding, derived); transition(plan, state, step, binding, inclusion);
    exact(row.fee, ['authorizedFee', 'netFee']); const authorized = integer(row.fee.authorizedFee, 64, true), fee = integer(row.fee.netFee); ensure(fee <= authorized && authorized <= BigInt(plan.limits.perTransactionFeeStroops), 'FEE');
    state.authorized += authorized; ensure(state.authorized <= BigInt(plan.limits.aggregateFeeStroops), 'FEE');
    exact(row.after, ['ledger', 'accounts']); ensure(ledger(row.after.ledger) >= inclusion.ledger, 'PREFIX_LEDGER'); const after = accountProjection(plan, row.after.accounts, row.after.ledger);
    for (const role of roles) {
      const source = role === step.sourceRole, balance = BigInt(state.accounts[role].balance) + BigInt(derived.businessDeltas[role]) - (source ? fee : 0n), sequence = BigInt(state.accounts[role].sequence) + (source ? 1n : 0n);
      ensure(after[role].balance === String(balance) && after[role].sequence === String(sequence), 'PREFIX_BALANCE');
    }
    state.accounts = after; state.lastLedger = row.after.ledger;
  }
  return state;
}
function finalState(plan, records, donated, head) {
  const count = (type, state) => records.filter(r => r.type === type && r.value.state === state).length;
  ensure(count('Fade', 2) === 6 && count('Fade', 3) === 2 && count('Pod', 1) === 2 && count('Trigger', 1) === 2 && count('Trigger', 2) === 1 && records.filter(r => r.type === 'Mandate' && r.value.revoked).length === 2 && donated, 'FINAL');
  const expiry = records.find(r => r.record === 'grant-expiry'); ensure(expiry && !expiry.value.revoked && expiry.value.claims_used === 0 && head > expiry.value.valid_until, 'FINAL_EXPIRY');
}
/** Prefix is an exact projection of the journal's freshly replayed completions,
 * never an imported JSON authority. Current after-fee authentication intentionally
 * follows this snapshot in the journal's real fee decoder before completion. */
export function derivePublicLifecycleState(input) { return safe(() => {
  exact(input, ['plan', 'initial', 'prefix', 'stepId', 'binding', 'phase', 'inclusion', 'response', 'headerEvidence']);
  const initial = initialBrands.get(input.initial); ensure(initial, 'INITIAL_BRAND'); const plan = copy(input.plan); trusted(() => validatePublicLifecyclePlan(plan)); const planSha256 = hashPublicLifecyclePlan(plan); ensure(planSha256 === initial.planSha256, 'PLAN');
  const prefix = copy(input.prefix), state = prefixState(plan, initial, prefix), step = plan.steps[prefix.length]; ensure(input.stepId === step.id && ['before', 'after'].includes(input.phase), 'STEP');
  const { binding, derived } = bound(plan, step, input.binding); ensure(binding.headLedger >= state.lastLedger && BigInt(binding.sequence) === BigInt(state.accounts[step.sourceRole].sequence) + 1n, 'SEQUENCE');
  const { response } = rawResponse(input.response), reserve = headerChecked({ headerEvidence: input.headerEvidence, ledger: response.latestLedger });
  const beforeAccounts = copy(state.accounts), sequence = Object.fromEntries(roles.map(r => [r, { sequence: state.accounts[r].sequence }]));
  if (input.phase === 'before') ensure(input.inclusion === null && response.latestLedger === binding.headLedger, 'BEFORE');
  else { const inclusion = included(input.inclusion, binding, derived); ensure(response.latestLedger >= inclusion.ledger, 'AFTER'); transition(plan, state, step, binding, inclusion); sequence[step.sourceRole].sequence = binding.sequence; }
  const expected = { minLedger: response.latestLedger, maxLedger: response.latestLedger, initialSurplusStroops: initial.expected.initialSurplusStroops, donationConfirmed: state.donated, fundedHistory: state.records.length > 0, records: state.records.map(({ record, id, creationLedger, preparedLedger, value }) => ({ record, id, creationLedger, preparedLedger, value })), accounts: sequence, zeroBalanceEvidence: state.records.length ? null : initial.expected.zeroBalanceEvidence };
  const snapshot = trusted(() => verifyPublicLifecycleSnapshot({ plan, expected }, response));
  for (const r of state.records) ensure(snapshot.records.find(x => x.record === r.record)?.lastModifiedLedgerSeq >= r.lastTransitionLedger, 'TRANSITION_METADATA');
  for (const role of roles) {
    if (input.phase === 'before') ensure(snapshot.accounts[role].accountEntryXdr === beforeAccounts[role].accountEntryXdr, 'ACCOUNT_CONTINUITY');
    else if (role !== step.sourceRole) ensure(BigInt(snapshot.accounts[role].balance) === BigInt(beforeAccounts[role].balance) + BigInt(derived.businessDeltas[role]), 'ACCOUNT_BALANCE');
  }
  const completed = prefix.length + (input.phase === 'after' ? 1 : 0), remainingBudget = remaining(plan, completed, reserve, snapshot.accounts);
  if (completed === plan.steps.length) finalState(plan, state.records, state.donated, snapshot.ledger);
  const result = frozen({ planSha256, stepId: step.id, phase: input.phase, prefixLength: prefix.length, expected, snapshot, recordAnchors: state.records, accountAnchors: { initial: initial.snapshot.accounts, before: beforeAccounts, expectedSequences: Object.fromEntries(roles.map(r => [r, sequence[r].sequence])), expectedBalancesBefore: Object.fromEntries(roles.map(r => [r, beforeAccounts[r].balance])), currentBusinessDeltas: derived.businessDeltas }, remainingBudget, reserve });
  derivedBrands.add(result); return result;
}); }
export function assertPublicLifecycleDerivedState(state) { ensure(state && derivedBrands.has(state), 'DERIVED_BRAND'); return state; }
