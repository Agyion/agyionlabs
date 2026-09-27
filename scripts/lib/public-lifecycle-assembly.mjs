/** Synchronous local assembly for one exact scheduled public V4 call.
 * No transport, signing, recovery or submission. Raw wire success compatibility
 * is deliberately narrow; an unknown shape is a refusal, never normalization.
 * Callers retain the complete raw request/response and must still use journal
 * state, source reservation, fee budget and immediate signing-time gates. */
import { createRequire } from 'node:module';
import { bindPublicLifecycleCall } from './public-lifecycle-call.mjs';
import { PUBLIC_LIFECYCLE_LIMITS, validatePublicLifecycleEnvelope } from './public-lifecycle-envelope.mjs';
const { TransactionBuilder, rpc, xdr } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const MAX = 2 * 1024 * 1024, INCLUSION_FEE = 100n;
class Refusal extends Error { constructor(code) { super(`LIFECYCLE_ASSEMBLY_${code}`); } }
const ensure = (ok, code) => { if (!ok) throw new Refusal(code); };
function snapshot(value) {
  const seen = new Set(); let nodes = 0, bytes = 0;
  const charge = text => { bytes += Buffer.byteLength(text); ensure(bytes <= MAX, 'DATA'); return text; };
  function encode(v, depth = 0) {
    ensure(depth <= 20 && ++nodes <= 10000, 'DATA');
    if (v === null || typeof v === 'boolean') return charge(JSON.stringify(v));
    if (typeof v === 'string') { ensure(Buffer.byteLength(v) <= MAX, 'DATA'); return charge(JSON.stringify(v)); }
    if (typeof v === 'number') { ensure(Number.isSafeInteger(v) && !Object.is(v, -0), 'DATA'); return charge(String(v)); }
    ensure(v && typeof v === 'object' && !seen.has(v), 'DATA');
    const array = Array.isArray(v), descriptors = Object.getOwnPropertyDescriptors(v), names = Reflect.ownKeys(descriptors);
    ensure(Object.getPrototypeOf(v) === (array ? Array.prototype : Object.prototype) && names.length <= 1001 && names.every(k => typeof k === 'string'), 'DATA');
    seen.add(v); let out;
    if (array) {
      const length = descriptors.length.value; ensure(length <= 1000 && names.length === length + 1, 'DATA');
      out = '[' + Array.from({ length }, (_, i) => { const d = descriptors[i]; ensure(d && Object.hasOwn(d, 'value') && d.enumerable, 'DATA'); return encode(d.value, depth + 1); }).join(',') + ']';
    } else {
      out = '{' + names.sort().map(k => { const d = descriptors[k]; ensure(Object.hasOwn(d, 'value') && d.enumerable, 'DATA'); return charge(JSON.stringify(k)) + ':' + encode(d.value, depth + 1); }).join(',') + '}';
    }
    seen.delete(v); ensure(Buffer.byteLength(out) <= MAX, 'DATA'); return out;
  }
  return JSON.parse(encode(value));
}
function exact(value, required, optional = [], code = 'FIELDS') {
  ensure(value && Object.getPrototypeOf(value) === Object.prototype && required.every(k => Object.hasOwn(value, k)) && Object.keys(value).every(k => [...required, ...optional].includes(k)), code);
}
function vector(value, max, code) { ensure(Array.isArray(value) && value.length <= max, code); return value; }
function decode(value, type, max = 1024 * 1024) {
  ensure(typeof value === 'string' && value.length > 0 && value.length <= max && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value), 'XDR');
  try { const parsed = type.fromXDR(value, 'base64'); ensure(parsed.toXDR('base64') === value, 'XDR'); return parsed; }
  catch { throw new Refusal('XDR'); }
}
function rawSuccess(raw, binding, createdId) {
  exact(raw, ['latestLedger', 'transactionData', 'minResourceFee', 'results'], ['events', 'id', 'stateChanges'], 'RAW');
  ensure(Number.isSafeInteger(raw.latestLedger) && raw.latestLedger > 0 && raw.latestLedger <= 0xffffffff && raw.latestLedger >= binding.headLedger && raw.latestLedger - binding.headLedger <= 2, 'LEDGER');
  if (Object.hasOwn(raw, 'id')) ensure(typeof raw.id === 'string' && raw.id.length > 0 && raw.id.length <= 128, 'RAW');
  const data = decode(raw.transactionData, xdr.SorobanTransactionData), ext = data.ext();
  ensure(ext.switch() === 0 || (ext.switch() === 1 && ext.resourceExt().archivedSorobanEntries().length === 0), 'RESTORE');
  ensure(typeof raw.minResourceFee === 'string' && /^(0|[1-9][0-9]{0,7})$/.test(raw.minResourceFee), 'FEE');
  const fee = BigInt(raw.minResourceFee);
  ensure(fee === BigInt(data.resourceFee().toString()) && fee + INCLUSION_FEE <= BigInt(PUBLIC_LIFECYCLE_LIMITS.maxFeeStroops), 'FEE');
  const results = vector(raw.results, 1, 'RESULT'); ensure(results.length === 1, 'RESULT'); exact(results[0], ['xdr', 'auth'], [], 'RESULT');
  const retval = decode(results[0].xdr, xdr.ScVal, 512);
  ensure(createdId === null ? retval.switch().name === 'scvVoid' : retval.switch().name === 'scvU64' && retval.u64().toString() === createdId, 'RESULT');
  const auth = vector(results[0].auth, 1, 'AUTH').map(s => decode(s, xdr.SorobanAuthorizationEntry, 16384));
  if (Object.hasOwn(raw, 'events')) for (const item of vector(raw.events, 100, 'RAW')) decode(item, xdr.DiagnosticEvent, 65536);
  if (Object.hasOwn(raw, 'stateChanges')) for (const row of vector(raw.stateChanges, 100, 'RAW')) {
    exact(row, ['type', 'key', 'before', 'after'], [], 'RAW');
    // RPC wire uses these strings; the installed SDK declaration says number.
    // This validates representation only, not a committed state transition.
    ensure(['created', 'updated', 'deleted'].includes(row.type), 'RAW');
    ensure(row.type === 'created' ? row.before === null && row.after !== null : row.type === 'updated' ? row.before !== null && row.after !== null : row.before !== null && row.after === null, 'RAW');
    decode(row.key, xdr.LedgerKey, 8192);
    for (const key of ['before', 'after']) if (row[key] !== null) decode(row[key], xdr.LedgerEntry);
  }
  return { data, auth, fee };
}
function checkedEnvelope(envelopeXdr, call, binding, nowSeconds) {
  try { return validatePublicLifecycleEnvelope({ envelopeXdr, step: call, sequence: binding.sequence, nowSeconds }); }
  catch { throw new Refusal('ENVELOPE'); }
}

/** binding is the journal's exact {sequence,headLedger,argsXdr,timestamp?,
 * signatureHex?}. The result is verification metadata plus unsigned XDR only;
 * it is not an inclusion, an authority brand or permission to send. Expired
 * input time bounds fail. This function must never be used to rebuild recovery. */
export function assemblePublicLifecycleTransaction(value) {
  try {
    const input = snapshot(value); exact(input, ['plan', 'stepId', 'binding', 'unsignedXdr', 'simulation', 'nowSeconds']);
    const { plan, stepId, binding, nowSeconds } = input;
    exact(binding, ['sequence', 'headLedger', 'argsXdr'], ['timestamp', 'signatureHex']);
    const projection = { plan, stepId, headLedger: binding.headLedger };
    for (const key of ['timestamp', 'signatureHex']) if (Object.hasOwn(binding, key)) projection[key] = binding[key];
    let derived; try { derived = bindPublicLifecycleCall(projection); } catch { throw new Refusal('BINDING'); }
    ensure(JSON.stringify(binding.argsXdr) === JSON.stringify(derived.call.argsXdr), 'BINDING');
    const original = decode(input.unsignedXdr, xdr.TransactionEnvelope);
    ensure(original.switch().name === 'envelopeTypeTx' && original.v1().signatures().length === 0, 'REQUEST');
    const tx = original.v1().tx(), operations = tx.operations();
    ensure(tx.ext().switch() === 0 && BigInt(tx.fee()) === INCLUSION_FEE && operations.length === 1 && operations[0].body().switch().name === 'invokeHostFunction', 'REQUEST');
    const operation = operations[0].body().invokeHostFunctionOp();
    ensure(operation.hostFunction().switch().name === 'hostFunctionTypeInvokeContract' && operation.auth().length === 0, 'REQUEST');
    const { data, auth, fee } = rawSuccess(input.simulation, binding, derived.expectedCreatedId);
    // Build the ONLY permitted delta directly from raw XDR, validate it before
    // calling the SDK, and then require the SDK result to match every byte.
    const expected = decode(input.unsignedXdr, xdr.TransactionEnvelope), body = expected.v1().tx();
    body.fee(Number(INCLUSION_FEE + fee)); body.ext(new xdr.TransactionExt(1, data));
    body.operations()[0].body().invokeHostFunctionOp().auth(auth);
    const expectedXdr = expected.toXDR('base64'); checkedEnvelope(expectedXdr, derived.call, binding, nowSeconds);
    const assembled = rpc.assembleTransaction(TransactionBuilder.fromXDR(input.unsignedXdr, PUBLIC_LIFECYCLE_LIMITS.networkPassphrase), input.simulation).build();
    const envelopeXdr = assembled.toXDR(); ensure(envelopeXdr === expectedXdr, 'PRESERVATION');
    const checked = checkedEnvelope(envelopeXdr, derived.call, binding, nowSeconds);
    return Object.freeze({ envelopeXdr, hash: checked.hash, feeStroops: checked.feeStroops, resourceFeeStroops: fee.toString(), simulationLedger: input.simulation.latestLedger, expectedCreatedId: derived.expectedCreatedId });
  } catch (error) { if (error instanceof Refusal) throw error; throw new Refusal('INPUT'); }
}
