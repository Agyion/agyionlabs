/** Initial V4 acquisition plus a narrowly bounded, unsigned native SAC getter.
 * This is coherent trusted-RPC evidence, not an authenticated state authority.
 * Full initial state/observation policies remain mandatory. No assembly, signing,
 * send, retry or implicit restoration; a different simulation head is a refusal.
 */
import { createRequire } from 'node:module';
import { acquirePublicLifecycleSnapshot } from './public-lifecycle-acquisition.mjs';
import { hashPublicLifecyclePlan } from './public-lifecycle-plan.mjs';
import { publicLifecycleAcquisitionKeys } from './public-lifecycle-readback.mjs';
import { createPublicLifecycleRpc } from './public-lifecycle-rpc.mjs';
const { Account, Address, Operation, TransactionBuilder, nativeToScVal, xdr } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const MAX = 2 * 1024 * 1024, b64 = v => v.toXDR('base64');
const ZERO = b64(nativeToScVal(0n, { type: 'i128' }));
// Native operations bypass caller-owned getters/methods. Only an owned relay
// reaches acquisition and transport; their cleanup never sees caller overrides.
const Controller = AbortController, abortController = AbortController.prototype.abort;
const controllerSignal = Object.getOwnPropertyDescriptor(AbortController.prototype, 'signal').get;
const signalAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted').get;
const addListener = EventTarget.prototype.addEventListener, removeListener = EventTarget.prototype.removeEventListener;
const isAborted = signal => signal === undefined ? false : Reflect.apply(signalAborted, signal, []);
// Private codes never inspect an untrusted thrown value's prototype or mutable
// fields. Reconstruct even genuine errors: callers can mutate a prior refusal.
const refusals = new WeakMap();
function refusal(code) { const error = Error(`LIFECYCLE_BASELINE_${code}`); refusals.set(error, code); return error; }
const check = (ok, code) => { if (!ok) throw refusal(code); };
const frozen = v => { if (v && typeof v === 'object') { Object.values(v).forEach(frozen); Object.freeze(v); } return v; };
const u32 = n => Number.isSafeInteger(n) && n > 0 && n <= 0xffffffff;
function exact(v, required, optional = [], code = 'INPUT') {
  check(v && Object.getPrototypeOf(v) === Object.prototype, code);
  const d = Object.getOwnPropertyDescriptors(v), names = Reflect.ownKeys(d);
  check(required.every(k => Object.hasOwn(d, k)) && names.every(k => typeof k === 'string' && [...required, ...optional].includes(k) && d[k].enumerable && Object.hasOwn(d[k], 'value')), code);
}
function copy(input) {
  const seen = new Set(); let nodes = 0, bytes = 0;
  function visit(v, depth) {
    check(++nodes <= 10000 && depth <= 20, 'BOUNDS');
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'string') { bytes += Buffer.byteLength(v); check(bytes <= MAX, 'BOUNDS'); return v; }
    if (typeof v === 'number') { check(Number.isSafeInteger(v) && !Object.is(v, -0), 'DATA'); return v; }
    const array = Array.isArray(v);
    check(v && typeof v === 'object' && Object.getPrototypeOf(v) === (array ? Array.prototype : Object.prototype) && !seen.has(v), 'DATA');
    seen.add(v); const d = Object.getOwnPropertyDescriptors(v), names = Reflect.ownKeys(d);
    check(names.length <= 1001, 'BOUNDS'); check(names.every(k => typeof k === 'string'), 'DATA'); let out;
    if (array) {
      const length = d.length.value; check(length <= 1000 && names.length === length + 1, 'DATA');
      out = Array.from({ length }, (_, i) => { check(d[i] && d[i].enumerable && Object.hasOwn(d[i], 'value'), 'DATA'); return visit(d[i].value, depth + 1); });
    } else out = Object.fromEntries(names.map(k => { check(d[k].enumerable && Object.hasOwn(d[k], 'value'), 'DATA'); bytes += Buffer.byteLength(k); check(bytes <= MAX, 'BOUNDS'); return [k, visit(d[k].value, depth + 1)]; }));
    seen.delete(v); return out;
  }
  const out = visit(input, 0); check(Buffer.byteLength(JSON.stringify(out)) <= MAX, 'BOUNDS'); return out;
}
function decode(value, Type, max = 65536) {
  check(typeof value === 'string' && value.length > 0 && value.length <= max, 'XDR');
  let parsed; try { parsed = Type.fromXDR(value, 'base64'); } catch { throw refusal('XDR'); }
  check(b64(parsed) === value, 'XDR'); return parsed;
}
function keysFor(plan) {
  try { hashPublicLifecyclePlan(plan); return publicLifecycleAcquisitionKeys(plan); } catch { throw refusal('PLAN'); }
}
function snapshotFacts(snapshot, keys) {
  exact(snapshot, ['latestLedger', 'entries'], [], 'SNAPSHOT'); check(u32(snapshot.latestLedger), 'SNAPSHOT');
  check(Array.isArray(snapshot.entries) && snapshot.entries.length <= 26, 'SNAPSHOT');
  const wanted = new Map(keys.map(k => [b64(k), k])), seen = new Set(); let sellerSequence;
  for (const row of snapshot.entries) {
    exact(row, ['key', 'val', 'lastModifiedLedgerSeq'], ['liveUntilLedgerSeq'], 'SNAPSHOT');
    decode(row.key, xdr.LedgerKey, 1024); const key = wanted.get(row.key); check(key && !seen.has(row.key), 'SNAPSHOT'); seen.add(row.key);
    const value = decode(row.val, xdr.LedgerEntryData), type = key.switch().name; check(value.switch().name === type, 'SNAPSHOT');
    if (type === 'account') {
      check(b64(value.account().accountId()) === b64(key.account().accountId()), 'SNAPSHOT');
      if (row.key === b64(keys[7])) sellerSequence = BigInt(value.account().seqNum().toString());
    } else if (type === 'contractCode') check(value.contractCode().hash().equals(key.contractCode().hash()), 'SNAPSHOT');
    else { const a = value.contractData(), b = key.contractData(); check(a.ext().switch() === 0 && b64(a.contract()) === b64(b.contract()) && b64(a.key()) === b64(b.key()) && a.durability().value === b.durability().value, 'SNAPSHOT'); }
    check(u32(row.lastModifiedLedgerSeq) && row.lastModifiedLedgerSeq <= snapshot.latestLedger, 'SNAPSHOT');
    if (type !== 'account' || Object.hasOwn(row, 'liveUntilLedgerSeq')) check(u32(row.liveUntilLedgerSeq) && row.liveUntilLedgerSeq >= snapshot.latestLedger, 'SNAPSHOT');
  }
  keys.slice(0, 10).forEach((key, i) => check(i === 6 || seen.has(b64(key)), 'SNAPSHOT'));
  check(!seen.has(b64(keys[6])), 'PRESENT');
  check(sellerSequence !== undefined && sellerSequence >= 0n && sellerSequence < (1n << 63n) - 1n, 'SEQUENCE');
  return String(sellerSequence + 1n);
}
function checkedRequest(request, plan, sequence, nowSeconds) {
  exact(request, ['transaction', 'authMode'], [], 'REQUEST'); check(request.authMode === 'record', 'REQUEST');
  check(Number.isSafeInteger(nowSeconds) && nowSeconds > 0 && nowSeconds <= Number.MAX_SAFE_INTEGER - 90, 'TIME');
  const env = decode(request.transaction, xdr.TransactionEnvelope, 4096);
  check(env.switch().name === 'envelopeTypeTx' && env.v1().signatures().length === 0, 'REQUEST');
  const tx = env.v1().tx(), operations = tx.operations();
  check(tx.sourceAccount().switch().name === 'keyTypeEd25519' && tx.sourceAccount().ed25519().equals(new Address(plan.actors.seller).toScAddress().accountId().ed25519()) && tx.seqNum().toString() === sequence, 'REQUEST');
  check(tx.fee() === 100 && tx.ext().switch() === 0 && tx.memo().switch().name === 'memoNone', 'REQUEST');
  check(tx.cond().switch().name === 'precondTime', 'TIME'); const time = tx.cond().timeBounds();
  check(time.minTime().toString() === '0' && BigInt(time.maxTime().toString()) > BigInt(nowSeconds) && BigInt(time.maxTime().toString()) <= BigInt(nowSeconds) + 90n, 'TIME');
  check(operations.length === 1 && !operations[0].sourceAccount() && operations[0].body().switch().name === 'invokeHostFunction', 'REQUEST');
  const op = operations[0].body().invokeHostFunctionOp(); check(op.auth().length === 0 && op.hostFunction().switch().name === 'hostFunctionTypeInvokeContract', 'AUTH');
  const fn = op.hostFunction().invokeContract();
  check(b64(fn.contractAddress()) === b64(new Address(plan.assets[0]).toScAddress()) && fn.functionName().toString() === 'balance' && fn.args().length === 1 && b64(fn.args()[0]) === b64(new Address(plan.contractId).toScVal()), 'REQUEST');
}
function checkedResponse(raw, head, keys, plan) {
  exact(raw, ['latestLedger', 'transactionData', 'minResourceFee', 'results'], ['events', 'stateChanges'], 'RAW');
  check(u32(raw.latestLedger) && raw.latestLedger === head, 'LEDGER');
  check(Array.isArray(raw.results) && raw.results.length === 1, 'RESULT'); exact(raw.results[0], ['xdr', 'auth'], [], 'RESULT');
  decode(raw.results[0].xdr, xdr.ScVal, 512); check(raw.results[0].xdr === ZERO, 'RESULT');
  check(Array.isArray(raw.results[0].auth) && raw.results[0].auth.length === 0, 'AUTH');
  const data = decode(raw.transactionData, xdr.SorobanTransactionData, 4096), ext = data.ext();
  check(ext.switch() === 0 || (ext.switch() === 1 && ext.resourceExt().archivedSorobanEntries().length === 0), 'RESTORE');
  check(typeof raw.minResourceFee === 'string' && /^(0|[1-9][0-9]{0,7})$/.test(raw.minResourceFee), 'RESOURCE');
  check(BigInt(raw.minResourceFee) === BigInt(data.resourceFee().toString()) && BigInt(raw.minResourceFee) + 100n <= 10000000n, 'RESOURCE');
  const resources = data.resources(), footprint = resources.footprint(), read = footprint.readOnly().map(b64);
  check(read.length === 2 && new Set(read).size === 2 && [keys[2], keys[6]].every(k => read.includes(b64(k))) && footprint.readWrite().length === 0, 'RESOURCE');
  // SAC balance reads can extend TTL in host storage without changing entry
  // data. This narrow getter accepts no writes/restoration/effects. These caps
  // are acceptance policy, not a claim about a live RPC's measured resources.
  check(resources.instructions() > 0 && resources.instructions() <= 10000000 && resources.diskReadBytes() <= 65536 && resources.writeBytes() === 0, 'RESOURCE');
  if (Object.hasOwn(raw, 'stateChanges')) check(Array.isArray(raw.stateChanges) && raw.stateChanges.length === 0, 'EFFECT');
  if (Object.hasOwn(raw, 'events')) {
    check(Array.isArray(raw.events) && raw.events.length <= 16, 'EVENT');
    for (const value of raw.events) {
      const diagnostic = decode(value, xdr.DiagnosticEvent), event = diagnostic.event(), id = event.contractId();
      check(diagnostic.inSuccessfulContractCall() && event.ext().switch() === 0 && event.type().name === 'diagnostic' && event.body().switch() === 0 && (!id || id.equals(new Address(plan.assets[0]).toScAddress().contractId())), 'EVENT');
    }
  }
}

/** Pure replay of one retained raw zero read at its recorded validation time.
 * snapshot is the canonical {latestLedger,entries:[{key,val,...}]} projection.
 * No invented expected-state or serialized success marker is trusted. The
 * compact result alone does not make existing journal replay revalidate raw.
 */
export function verifyPublicLifecycleZeroRead(value) {
  try {
    const input = copy(value); exact(input, ['plan', 'snapshot', 'request', 'response', 'nowSeconds']);
    const keys = keysFor(input.plan), sequence = snapshotFacts(input.snapshot, keys);
    checkedRequest(input.request, input.plan, sequence, input.nowSeconds); checkedResponse(input.response, input.snapshot.latestLedger, keys, input.plan);
    return Object.freeze({ envelopeXdr: input.request.transaction, ledger: input.snapshot.latestLedger, resultXdr: ZERO });
  } catch (error) { throw refusal(refusals.get(error) ?? 'INPUT'); }
}

/** At most four acquisition calls plus one fixed getter if Balance is absent.
 * Production uses the fixed Testnet transport. rpc is optional trusted code,
 * never a URL/clock/policy override. Complete output is capped at two MiB.
 * Rebuild initial authority from this final same-head result before first use.
 */
export async function acquirePublicLifecycleBaseline(options) {
  let caller, signal, onCaller, onAbort;
  try {
    exact(options, ['plan'], ['rpc', 'signal']); const plan = copy(options.plan), keys = keysFor(plan);
    caller = options.signal; check(!isAborted(caller), 'ABORTED');
    if (caller !== undefined) {
      const controller = new Controller(); signal = Reflect.apply(controllerSignal, controller, []);
      onCaller = () => Reflect.apply(abortController, controller, []);
      Reflect.apply(addListener, caller, ['abort', onCaller, { once: true }]);
    }
    const rpc = Object.hasOwn(options, 'rpc') ? options.rpc : createPublicLifecycleRpc(signal ? { signal } : {});
    exact(rpc, ['request']); check(typeof rpc.request === 'function', 'INPUT'); const invoke = rpc.request.bind(rpc), stableRpc = { request: invoke };
    let acquisition; try { acquisition = await acquirePublicLifecycleSnapshot({ plan, rpc: stableRpc, ...(signal ? { signal } : {}) }); }
    catch { if (isAborted(signal)) throw refusal('ABORTED'); throw refusal('ACQUISITION'); }
    check(!isAborted(signal), 'ABORTED'); let zeroBalanceEvidence = null, zeroRead = null;
    if (!acquisition.response.entries.some(row => row.key === b64(keys[6]))) {
      const sequence = snapshotFacts(acquisition.response, keys), now = Math.floor(Date.now() / 1000);
      check(Number.isSafeInteger(now) && now > 0 && now <= Number.MAX_SAFE_INTEGER - 90, 'TIME');
      const transaction = new TransactionBuilder(new Account(plan.actors.seller, String(BigInt(sequence) - 1n)), { fee: '100', networkPassphrase: plan.networkPassphrase })
        .addOperation(Operation.invokeContractFunction({ contract: plan.assets[0], function: 'balance', args: [new Address(plan.contractId).toScVal()], auth: [] })).setTimebounds(0, now + 90).build().toXDR();
      const request = frozen({ transaction, authMode: 'record' }); checkedRequest(request, plan, sequence, now);
      const aborted = signal && new Promise((_, reject) => { onAbort = () => reject(refusal('ABORTED')); Reflect.apply(addListener, signal, ['abort', onAbort, { once: true }]); });
      let response;
      try { const pending = Promise.resolve().then(() => { check(!isAborted(signal), 'ABORTED'); return invoke('simulateTransaction', request); }); response = await (aborted ? Promise.race([pending, aborted]) : pending); }
      catch { if (isAborted(signal)) throw refusal('ABORTED'); throw refusal('RPC'); }
      check(!isAborted(signal), 'ABORTED'); response = copy(response); const validatedAtSeconds = Math.floor(Date.now() / 1000);
      zeroBalanceEvidence = verifyPublicLifecycleZeroRead({ plan, snapshot: acquisition.response, request, response, nowSeconds: validatedAtSeconds });
      zeroRead = { request, response, validatedAtSeconds };
    }
    const result = { acquisition, zeroBalanceEvidence, zeroRead }; check(Buffer.byteLength(JSON.stringify(result)) <= MAX, 'BOUNDS'); return frozen(result);
  } catch (error) { throw refusal(refusals.get(error) ?? 'INPUT'); }
  finally {
    try {
      if (signal && onAbort) Reflect.apply(removeListener, signal, ['abort', onAbort]);
      if (caller && onCaller) Reflect.apply(removeListener, caller, ['abort', onCaller]);
    } catch { throw refusal('INPUT'); }
  }
}
