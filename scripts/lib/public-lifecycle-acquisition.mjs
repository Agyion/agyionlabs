/** Bounded raw acquisition for the fixed, already funded V4 lifecycle actors.
 * No expected-state, code authentication, consensus or zero-balance authority is
 * returned. Missing future records/Balance remain omissions for full policies.
 * A trusted code-only RPC adapter is optional; production uses the fixed bounded
 * transport. No request retries, historical entry fabrication, signing or send.
 */
import { createRequire } from 'node:module';
import { hashPublicLifecyclePlan } from './public-lifecycle-plan.mjs';
import { publicLifecycleAcquisitionKeys } from './public-lifecycle-readback.mjs';
import { verifyPublicLifecycleHeader } from './public-lifecycle-state.mjs';
import { createPublicLifecycleRpc } from './public-lifecycle-rpc.mjs';
const { Address, xdr } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const MAX = 2 * 1024 * 1024, failures = new WeakSet();
function fail(code) { const error = Error(`LIFECYCLE_ACQUISITION_${code}`); failures.add(error); throw error; }
const check = (ok, code) => { if (!ok) fail(code); };
const b64 = value => value.toXDR('base64');
const frozen = value => { if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); } return value; };
function exact(value, required, optional, code) {
  check(value && Object.getPrototypeOf(value) === Object.prototype, code);
  const d = Object.getOwnPropertyDescriptors(value), names = Reflect.ownKeys(d);
  check(required.every(k => Object.hasOwn(d, k)) && names.every(k => typeof k === 'string' && [...required, ...optional].includes(k) && d[k].enumerable && Object.hasOwn(d[k], 'value')), code);
}
function copy(input) {
  let nodes = 0, size = 0; const seen = new Set();
  function visit(v, depth) {
    check(++nodes <= 10000 && depth <= 20, 'BOUNDS');
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'string') { size += Buffer.byteLength(v); check(size <= MAX, 'BOUNDS'); return v; }
    if (typeof v === 'number') { check(Number.isSafeInteger(v) && !Object.is(v, -0), 'DATA'); return v; }
    const array = Array.isArray(v);
    check(v && typeof v === 'object' && Object.getPrototypeOf(v) === (array ? Array.prototype : Object.prototype) && !seen.has(v), 'DATA');
    seen.add(v); const d = Object.getOwnPropertyDescriptors(v), names = Reflect.ownKeys(d);
    check(names.length <= 1001, 'BOUNDS'); check(names.every(k => typeof k === 'string'), 'DATA');
    let result;
    if (array) {
      const length = d.length?.value; check(Number.isInteger(length) && length >= 0 && length <= 1000, 'BOUNDS'); check(names.length === length + 1, 'DATA');
      result = Array.from({ length }, (_, i) => { check(d[i] && d[i].enumerable && Object.hasOwn(d[i], 'value'), 'DATA'); return visit(d[i].value, depth + 1); });
    } else result = Object.fromEntries(names.map(k => { check(d[k].enumerable && Object.hasOwn(d[k], 'value'), 'DATA'); size += Buffer.byteLength(k); check(size <= MAX, 'BOUNDS'); return [k, visit(d[k].value, depth + 1)]; }));
    seen.delete(v); return result;
  }
  const result = visit(input, 0); check(Buffer.byteLength(JSON.stringify(result)) <= MAX, 'BOUNDS'); return result;
}
const u32 = n => Number.isSafeInteger(n) && n > 0 && n <= 0xffffffff;
const time = n => typeof n === 'string' && /^(0|[1-9][0-9]{0,19})$/.test(n) && BigInt(n) < (1n << 64n);
function decode(value, Type, max, code = 'XDR') {
  check(typeof value === 'string' && value.length > 0 && value.length <= max, code);
  let parsed; try { parsed = Type.fromXDR(value, 'base64'); } catch { fail(code); }
  check(b64(parsed) === value, code); return parsed;
}
function projectEntries(raw, keys, funding) {
  exact(raw, ['latestLedger', 'entries'], [], 'ROWS'); check(u32(raw.latestLedger), 'METADATA');
  check(Array.isArray(raw.entries) && raw.entries.length <= keys.length, 'ROWS');
  const wanted = new Map(keys.map(k => [b64(k), k])), seen = new Set();
  const entries = raw.entries.map(row => {
    exact(row, ['key', 'xdr', 'lastModifiedLedgerSeq'], ['liveUntilLedgerSeq', 'extXdr'], 'ROWS');
    decode(row.key, xdr.LedgerKey, 1024); const key = wanted.get(row.key); check(key && !seen.has(row.key), 'KEY'); seen.add(row.key);
    const value = decode(row.xdr, xdr.LedgerEntryData, 65536), type = key.switch().name;
    check(value.switch().name === type, 'KEY');
    if (type === 'account') check(b64(value.account().accountId()) === b64(key.account().accountId()), 'KEY');
    else if (type === 'contractCode') check(value.contractCode().hash().equals(key.contractCode().hash()), 'KEY');
    else { const a = value.contractData(), b = key.contractData(); check(a.ext().switch() === 0 && b64(a.contract()) === b64(b.contract()) && b64(a.key()) === b64(b.key()) && a.durability().value === b.durability().value, 'KEY'); }
    if (Object.hasOwn(row, 'extXdr')) check(decode(row.extXdr, xdr.LedgerEntryExt, 1024).switch() === 0, 'ROWS');
    check(u32(row.lastModifiedLedgerSeq) && row.lastModifiedLedgerSeq <= raw.latestLedger, 'METADATA');
    if (type !== 'account' || Object.hasOwn(row, 'liveUntilLedgerSeq')) check(u32(row.liveUntilLedgerSeq) && row.liveUntilLedgerSeq >= raw.latestLedger, 'METADATA');
    return { key: row.key, val: row.xdr, lastModifiedLedgerSeq: row.lastModifiedLedgerSeq, ...(Object.hasOwn(row, 'liveUntilLedgerSeq') ? { liveUntilLedgerSeq: row.liveUntilLedgerSeq } : {}) };
  });
  // Nine base keys are mandatory only after the three actor accounts are funded.
  // Balance and the sixteen possible future records cannot imply zero/absence.
  if (!funding) keys.slice(0, 10).forEach((key, i) => check(i === 6 || seen.has(b64(key)), 'MISSING'));
  return { latestLedger: raw.latestLedger, entries };
}
function checkedHeader(row, kind, protocolVersion) {
  const history = kind === 'history';
  exact(row, history ? ['hash', 'sequence', 'ledgerCloseTime', 'headerXdr', 'metadataXdr'] : ['id', 'sequence', 'protocolVersion', 'closeTime', 'headerXdr', 'metadataXdr'], [], 'HEADER');
  const evidence = { kind, ledger: row.sequence, hash: history ? row.hash : row.id, headerXdr: row.headerXdr };
  try { verifyPublicLifecycleHeader({ headerEvidence: evidence, ledger: row.sequence }); } catch { fail('HEADER'); }
  const wrapper = history ? decode(row.headerXdr, xdr.LedgerHeaderHistoryEntry, 4096, 'HEADER') : null;
  const header = wrapper ? wrapper.header() : decode(row.headerXdr, xdr.LedgerHeader, 4096, 'HEADER');
  const closed = history ? row.ledgerCloseTime : row.closeTime;
  check(time(closed) && header.scpValue().closeTime().toString() === closed && header.ledgerVersion() === protocolVersion && (history || row.protocolVersion === protocolVersion), 'HEADER');
  const meta = decode(row.metadataXdr, xdr.LedgerCloseMeta, MAX);
  check([0, 1, 2].includes(meta.switch()), 'HEADER');
  const embedded = meta.value().ledgerHeader();
  check(embedded.ext().switch() === 0 && embedded.hash().toString('hex') === evidence.hash && b64(embedded.header()) === b64(header), 'HEADER');
  return evidence;
}

/** One snapshot read and an exact same-ledger header; at most four requests.
 * The complete result also fits two MiB, in addition to each RPC's existing cap.
 * An injected adapter is trusted executable code, never serialized authority.
 * Callers must run the full state/observation policies on the returned projection.
 */
async function acquire(options, funding) {
  let signal, onAbort;
  try {
    exact(options, funding ? ['plan', 'role'] : ['plan'], ['rpc', 'signal'], 'INPUT');
    const role = funding ? options.role : null;
    if (funding) check(role === 'recipient' || role === 'relayer', 'INPUT');
    signal = options.signal; check(signal === undefined || signal instanceof AbortSignal, 'INPUT');
    const plan = copy(options.plan); let planSha256, keys;
    try { planSha256 = hashPublicLifecyclePlan(plan); keys = funding ? [xdr.LedgerKey.account(new xdr.LedgerKeyAccount({ accountId: new Address(plan.actors[role]).toScAddress().accountId() }))] : publicLifecycleAcquisitionKeys(plan); } catch { fail('INPUT'); }
    const rpc = Object.hasOwn(options, 'rpc') ? options.rpc : createPublicLifecycleRpc(signal ? { signal } : {});
    exact(rpc, ['request'], [], 'INPUT'); check(typeof rpc.request === 'function', 'INPUT'); const invoke = rpc.request.bind(rpc);
    check(!signal?.aborted, 'ABORTED');
    const aborted = signal && new Promise((_, reject) => { onAbort = () => { try { fail('ABORTED'); } catch (error) { reject(error); } }; signal.addEventListener('abort', onAbort, { once: true }); });
    let rawBytes = 0;
    async function request(method, params = {}) {
      check(!signal?.aborted, 'ABORTED'); let result;
      try { const pending = Promise.resolve().then(() => { check(!signal?.aborted, 'ABORTED'); return invoke(method, params); }); result = await (aborted ? Promise.race([pending, aborted]) : pending); }
      catch (error) { if (signal?.aborted) fail('ABORTED'); if (failures.has(error)) throw error; fail('RPC'); }
      check(!signal?.aborted, 'ABORTED'); const raw = copy(result);
      rawBytes += Buffer.byteLength(JSON.stringify(raw)); check(rawBytes <= MAX, 'BOUNDS'); return raw;
    }
    const network = await request('getNetwork');
    exact(network, ['passphrase', 'protocolVersion'], ['friendbotUrl'], 'NETWORK');
    check(network.passphrase === plan.networkPassphrase && u32(network.protocolVersion) && (!Object.hasOwn(network, 'friendbotUrl') || network.friendbotUrl === plan.friendbotUrl), 'NETWORK');
    const entries = await request('getLedgerEntries', { keys: keys.map(b64) }), response = projectEntries(entries, keys, funding);
    const latest = await request('getLatestLedger'); let headerEvidence = checkedHeader(latest, 'latest', network.protocolVersion), history = null;
    check(latest.sequence >= response.latestLedger, 'DRIFT');
    if (latest.sequence > response.latestLedger) {
      history = await request('getLedgers', { startLedger: response.latestLedger, pagination: { limit: 1 } });
      exact(history, ['ledgers', 'latestLedger', 'latestLedgerCloseTime', 'oldestLedger', 'oldestLedgerCloseTime', 'cursor'], [], 'HEADER');
      check(Array.isArray(history.ledgers) && history.ledgers.length === 1 && u32(history.oldestLedger) && history.oldestLedger <= response.latestLedger && u32(history.latestLedger) && history.latestLedger >= latest.sequence && history.cursor === String(response.latestLedger), 'HEADER');
      const row = history.ledgers[0]; check(row.sequence === response.latestLedger, 'HEADER');
      headerEvidence = checkedHeader(row, 'history', network.protocolVersion);
      check(Number.isSafeInteger(history.oldestLedgerCloseTime) && history.oldestLedgerCloseTime >= 0 && Number.isSafeInteger(history.latestLedgerCloseTime) && history.latestLedgerCloseTime >= history.oldestLedgerCloseTime && BigInt(history.oldestLedgerCloseTime) <= BigInt(row.ledgerCloseTime) && BigInt(history.latestLedgerCloseTime) >= BigInt(latest.closeTime), 'HEADER');
    }
    check(!signal?.aborted, 'ABORTED');
    const result = { schema: 'agyion-public-lifecycle-acquisition-v1', ...(funding ? { role } : {}), planSha256, response, headerEvidence, raw: { network, entries, latest, history } };
    check(Buffer.byteLength(JSON.stringify(result)) <= MAX, 'BOUNDS'); return frozen(result);
  } catch (error) { if (error && failures.has(error)) throw error; fail('INPUT'); }
  finally { if (signal && onAbort) signal.removeEventListener('abort', onAbort); }
}

export function acquirePublicLifecycleSnapshot(options) { return acquire(options, false); }
/** Actor funding readback only: zero or one recipient/relayer Account row.
 * This is not funded/pristine-authority/balance validation; callers must apply
 * those pure policies. Seller and credential-role funding are never selected.
 */
export function acquirePublicLifecycleFundingAccount(options) { return acquire(options, true); }
