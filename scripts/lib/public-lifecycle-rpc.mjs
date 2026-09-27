/** Bounded raw JSON-RPC transport for the inactive public Testnet lifecycle.
 * No signing, retries, polling or SDK response normalization. Injected fetch is
 * trusted executable test/host code, never serialized operator configuration.
 * Result semantics, ledger trust and send authority belong to the journal and
 * its pure validators. A send transport error is an UNKNOWN inclusion outcome. */
import { createRequire } from 'node:module';
const { xdr } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const RPC = 'https://soroban-testnet.stellar.org';
const DEADLINE_MS = 15000, RESPONSE_BYTES = 2 * 1024 * 1024, ENVELOPE_CHARS = 1024 * 1024;
class Refusal extends Error {
  constructor(code) { super(`LIFECYCLE_RPC_${code}`); this.code = this.message; }
}
const ensure = (ok, code = 'INPUT') => { if (!ok) throw new Refusal(code); };
function record(value, required, optional = [], code = 'INPUT') {
  ensure(value && Object.getPrototypeOf(value) === Object.prototype, code);
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
  ensure(keys.every(k => typeof k === 'string' && [...required, ...optional].includes(k)) && required.every(k => Object.hasOwn(descriptors, k)), code);
  const copy = {};
  for (const key of keys) { const d = descriptors[key]; ensure(Object.hasOwn(d, 'value') && d.enumerable, code); copy[key] = d.value; }
  return copy;
}
function encoded(value, type, max) {
  ensure(typeof value === 'string' && value.length > 0 && value.length <= max && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value));
  const parsed = type.fromXDR(value, 'base64'); ensure(parsed.toXDR('base64') === value); return parsed;
}
function keys(value) {
  ensure(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype);
  const d = Object.getOwnPropertyDescriptors(value), length = d.length.value;
  ensure(length > 0 && length <= 26 && Reflect.ownKeys(d).length === length + 1);
  const result = Array.from({ length }, (_, i) => {
    ensure(d[i] && Object.hasOwn(d[i], 'value') && d[i].enumerable);
    encoded(d[i].value, xdr.LedgerKey, 8192); return d[i].value;
  });
  ensure(new Set(result).size === result.length); return result;
}
function envelope(value, signed) {
  const env = encoded(value, xdr.TransactionEnvelope, ENVELOPE_CHARS);
  ensure(env.switch().name === 'envelopeTypeTx');
  const tx = env.v1().tx(), operations = tx.operations(), signatures = env.v1().signatures();
  ensure(operations.length === 1 && operations[0].body().switch().name === 'invokeHostFunction');
  ensure(operations[0].body().invokeHostFunctionOp().hostFunction().switch().name === 'hostFunctionTypeInvokeContract');
  ensure(tx.cond().switch().name === 'precondTime');
  const bounds = tx.cond().timeBounds();
  ensure(BigInt(bounds.maxTime().toString()) > 0n && BigInt(bounds.minTime().toString()) <= BigInt(bounds.maxTime().toString()));
  ensure(signed ? signatures.length === 1 && signatures[0].signature().length === 64 : signatures.length === 0);
  return value;
}
function paramsFor(method, value) {
  if (method === 'getNetwork' || method === 'getLatestLedger') return record(value, []);
  if (method === 'getLedgers') {
    const p = record(value, ['startLedger', 'pagination']), pagination = record(p.pagination, ['limit']);
    ensure(Number.isInteger(p.startLedger) && p.startLedger > 0 && p.startLedger <= 0xffffffff && pagination.limit === 1);
    return { startLedger: p.startLedger, pagination };
  }
  if (method === 'getLedgerEntries') { const p = record(value, ['keys']); return { keys: keys(p.keys) }; }
  if (method === 'simulateTransaction' || method === 'sendTransaction') {
    const simulation = method === 'simulateTransaction';
    const p = record(value, simulation ? ['transaction', 'authMode'] : ['transaction']);
    envelope(p.transaction, !simulation);
    if (simulation) ensure(p.authMode === 'record' || p.authMode === 'enforce');
    return p;
  }
  ensure(method === 'getTransaction');
  const p = record(value, ['hash']); ensure(typeof p.hash === 'string' && /^[a-f0-9]{64}$/.test(p.hash)); return p;
}
function parseResponse(text, id) {
  const value = JSON.parse(text);
  // JSON.parse alone silently accepts duplicate names. Scan its already valid
  // grammar to reject ambiguous names at every depth, including escaped names.
  const stack = []; let index = 0;
  while (index < text.length) {
    const ch = text[index];
    if (ch === '"') {
      const start = index++;
      while (text[index] !== '"') { if (text[index] === '\\') index++; index++; }
      index++;
      const frame = stack.at(-1);
      if (frame?.object && frame.key) {
        const key = JSON.parse(text.slice(start, index)); ensure(!frame.names.has(key), 'RESPONSE'); frame.names.add(key); frame.key = false;
      }
      continue;
    }
    if (ch === '{' || ch === '[') { ensure(stack.length < 64, 'RESPONSE'); stack.push({ object: ch === '{', key: true, names: new Set() }); }
    else if (ch === '}' || ch === ']') stack.pop();
    else if (ch === ',' && stack.at(-1)?.object) stack.at(-1).key = true;
    index++;
  }
  const response = record(value, ['jsonrpc', 'id'], ['result', 'error'], 'RESPONSE');
  ensure(response.jsonrpc === '2.0' && response.id === id && Object.hasOwn(response, 'result') !== Object.hasOwn(response, 'error'), 'RESPONSE');
  if (Object.hasOwn(response, 'error')) {
    const error = record(response.error, ['code', 'message'], ['data'], 'RESPONSE');
    ensure(Number.isSafeInteger(error.code) && typeof error.message === 'string', 'RESPONSE'); throw new Refusal('REMOTE');
  }
  ensure(response.result && Object.getPrototypeOf(response.result) === Object.prototype, 'RESPONSE');
  return response.result;
}
function cancel(body) {
  // Invoke cleanup immediately, but a hostile injected implementation cannot
  // postpone a bounded refusal by returning a never-settling cancel promise.
  try { Promise.resolve(body?.cancel()).catch(() => {}); } catch { /* fixed refusal remains authoritative */ }
}

/** request(method, params) accepts only the seven fixed lifecycle RPC methods.
 * Raw getLedgerEntries rows use `xdr`; the replay adapter explicitly maps that
 * property to the snapshot verifier's `val`. getTransaction createdAt remains a
 * string. No network-passphrase assertion is implied by this transport alone. */
export function createPublicLifecycleRpc(options = {}) {
  let fetchImpl, caller;
  try {
    const config = record(options, [], ['fetch', 'signal']);
    ensure(!Object.hasOwn(config, 'fetch') || typeof config.fetch === 'function');
    ensure(!Object.hasOwn(config, 'signal') || config.signal instanceof AbortSignal);
    fetchImpl = config.fetch ?? globalThis.fetch; caller = config.signal; ensure(typeof fetchImpl === 'function');
  } catch { throw new Refusal('INPUT'); }
  let nextId = 0;
  return Object.freeze({ async request(method, params = {}) {
    let body, id;
    try {
      const clean = paramsFor(method, params); ensure(nextId < Number.MAX_SAFE_INTEGER); id = ++nextId;
      body = JSON.stringify({ jsonrpc: '2.0', id, method, params: clean }); ensure(Buffer.byteLength(body) <= 2 * 1024 * 1024);
    } catch { throw new Refusal('INPUT'); }
    if (caller?.aborted) throw new Refusal('ABORTED');
    const controller = new AbortController(); let reason, response, reader;
    const abort = code => { if (!controller.signal.aborted) { reason = code; controller.abort(); } };
    const onCaller = () => abort('ABORTED'); caller?.addEventListener('abort', onCaller, { once: true });
    let onAbort;
    const aborted = new Promise((_, reject) => { onAbort = () => reject(new Refusal(reason)); controller.signal.addEventListener('abort', onAbort, { once: true }); });
    const timer = setTimeout(() => abort('TIMEOUT'), DEADLINE_MS);
    try {
      const pending = Promise.resolve().then(() => {
        if (controller.signal.aborted) throw new Refusal(reason);
        return fetchImpl(RPC, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body, redirect: 'manual', credentials: 'omit', cache: 'no-store', signal: controller.signal,
        });
      });
      // A trusted custom fetch can still finish late after an abort. Dispose its
      // response rather than leaving that body open outside this request.
      pending.then(late => { if (controller.signal.aborted) cancel(late?.body); }, () => {});
      response = await Promise.race([pending, aborted]);
      ensure(!response.redirected && !(response.status >= 300 && response.status < 400), 'REDIRECT');
      ensure(response.status >= 200 && response.status < 300, 'HTTP');
      const declared = response.headers.get('content-length');
      if (declared !== null) { ensure(/^(0|[1-9][0-9]*)$/.test(declared), 'RESPONSE'); ensure(BigInt(declared) <= BigInt(RESPONSE_BYTES), 'SIZE'); }
      ensure(response.body && typeof response.body.getReader === 'function', 'RESPONSE'); reader = response.body.getReader();
      const chunks = []; let length = 0;
      while (true) {
        const part = await Promise.race([reader.read(), aborted]);
        if (part.done) break;
        ensure(part.value instanceof Uint8Array && part.value.byteLength > 0, 'RESPONSE');
        length += part.value.byteLength; ensure(length <= RESPONSE_BYTES, 'SIZE'); chunks.push(part.value);
      }
      const bytes = Buffer.concat(chunks, length);
      let result;
      try { result = parseResponse(new TextDecoder('utf-8', { fatal: true }).decode(bytes), id); }
      catch (error) { throw error instanceof Refusal ? error : new Refusal('RESPONSE'); }
      return result;
    } catch (error) {
      const refusal = reason ? new Refusal(reason) : error instanceof Refusal ? error : new Refusal('TRANSPORT');
      // Abort and cancel on every rejection, including early header checks.
      controller.abort(); cancel(reader ?? response?.body); throw refusal;
    } finally {
      clearTimeout(timer); caller?.removeEventListener('abort', onCaller); controller.signal.removeEventListener('abort', onAbort);
      try { reader?.releaseLock(); } catch { /* cancellation may still be completing */ }
    }
  } });
}
