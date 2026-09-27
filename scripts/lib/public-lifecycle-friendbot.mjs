/** One bounded Friendbot HTTP request for a fixed-plan fresh Testnet actor.
 * The caller MUST durably consume its role-bound funding claim before calling.
 * This transport cannot enforce at-most-once funding across explicit calls.
 * Any HTTP result, timeout or lost reply leaves chain outcome UNKNOWN; recovery
 * must read the original account/hash and must never call Friendbot again.
 * Injected fetch is trusted executable test code, not operator configuration. */
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { hashPublicLifecyclePlan } from './public-lifecycle-plan.mjs';

const PROVIDER = 'https://friendbot.stellar.org/';
const DEADLINE_MS = 30000, BODY_CAP = 1024 * 1024;
class Refusal extends Error {
  constructor(code, evidence) {
    super(`LIFECYCLE_FRIENDBOT_${code}`); this.code = this.message;
    if (evidence !== undefined) Object.defineProperty(this, 'evidence', { value: evidence, enumerable: true });
  }
}
const ensure = (ok, code = 'INPUT') => { if (!ok) throw new Refusal(code); };
function exact(value, required, optional = []) {
  ensure(value && Object.getPrototypeOf(value) === Object.prototype);
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
  ensure(required.every(k => Object.hasOwn(descriptors, k)));
  const copy = {};
  for (const key of keys) {
    const d = descriptors[key];
    ensure(typeof key === 'string' && [...required, ...optional].includes(key) && Object.hasOwn(d, 'value') && d.enumerable);
    copy[key] = d.value;
  }
  return copy;
}
function cancel(response, reader) {
  // Cleanup is invoked, but a never-settling cancel cannot delay refusal.
  try { Promise.resolve((reader ?? response?.body)?.cancel()).catch(() => {}); } catch { /* no raw error propagation */ }
}
const decode = data => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data);

/** request({plan,role}) resolves only recipient or relayer from the exact plan.
 * Returns immutable raw HTTP evidence, never a funding/inclusion acknowledgment.
 * Refusals after request setup carry the same bounded .evidence shape. Bytes are
 * retained as base64; bodySha256 hashes only those retained bytes. bodyComplete
 * requires EOF and valid UTF-8; bodyTruncated marks a known size refusal.
 * No JSON/hash field is interpreted and no duplicate body text is serialized.
 * The retained base64 plus fixed metadata fits the existing 2-MiB record cap. */
export function createPublicLifecycleFriendbot(options = {}) {
  let fetchImpl, caller;
  try {
    const config = exact(options, [], ['fetch', 'signal']);
    ensure(!Object.hasOwn(config, 'fetch') || typeof config.fetch === 'function');
    ensure(!Object.hasOwn(config, 'signal') || config.signal instanceof AbortSignal);
    fetchImpl = config.fetch ?? globalThis.fetch; caller = config.signal;
    ensure(typeof fetchImpl === 'function');
  } catch { throw new Refusal('INPUT'); }
  return Object.freeze({ async request(value) {
    let planSha256, role, address, url;
    try {
      const input = exact(value, ['plan', 'role']);
      ensure(input.role === 'recipient' || input.role === 'relayer');
      planSha256 = hashPublicLifecyclePlan(input.plan); role = input.role; address = input.plan.actors[role];
      url = new URL(PROVIDER); url.searchParams.set('addr', address); url = url.href;
    } catch { throw new Refusal('INPUT'); }
    if (caller?.aborted) throw new Refusal('ABORTED');

    const controller = new AbortController(), retained = Buffer.alloc(BODY_CAP), expiresAt = performance.now() + DEADLINE_MS;
    let reason, response, reader, httpStatus = null, length = 0, bodyComplete = false, bodyTruncated = false;
    const evidence = () => {
      const data = retained.subarray(0, length);
      return Object.freeze({ schema: 'agyion-public-lifecycle-friendbot-response-v1', provider: PROVIDER,
        planSha256, role, address, request: Object.freeze({ method: 'GET', url }), httpStatus,
        bodyBase64: data.toString('base64'), bodySha256: createHash('sha256').update(data).digest('hex'),
        bodyBytes: length, bodyComplete, bodyTruncated, chainOutcome: 'unknown' });
    };
    const abort = code => { if (!controller.signal.aborted) { reason = code; controller.abort(); } };
    const onCaller = () => abort('ABORTED'); caller?.addEventListener('abort', onCaller, { once: true });
    let onAbort;
    const aborted = new Promise((_, reject) => {
      onAbort = () => reject(new Refusal(reason)); controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    const timer = setTimeout(() => abort('TIMEOUT'), DEADLINE_MS);
    const current = () => {
      if (performance.now() >= expiresAt) abort('TIMEOUT');
      if (controller.signal.aborted) throw new Refusal(reason);
    };
    try {
      if (caller?.aborted) abort('ABORTED');
      const pending = Promise.resolve().then(() => {
        current(); return fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' },
          redirect: 'error', credentials: 'omit', cache: 'no-store', signal: controller.signal });
      });
      pending.then(late => { if (controller.signal.aborted) cancel(late); }, () => {});
      response = await Promise.race([pending, aborted]); current();
      const status = response?.status;
      ensure(Number.isInteger(status) && status >= 100 && status <= 599, 'RESPONSE'); httpStatus = status;
      ensure(!response.redirected && !(status >= 300 && status < 400), 'REDIRECT');
      const declared = response.headers.get('content-length');
      if (declared !== null) {
        ensure(typeof declared === 'string' && /^(0|[1-9][0-9]*)$/.test(declared), 'RESPONSE');
        if (BigInt(declared) > BigInt(BODY_CAP)) { bodyTruncated = true; throw new Refusal('SIZE'); }
      }
      if (response.body !== null) {
        ensure(response.body && typeof response.body.getReader === 'function', 'RESPONSE'); reader = response.body.getReader();
        while (true) {
          current(); const part = await Promise.race([reader.read(), aborted]); current();
          ensure(part && typeof part.done === 'boolean', 'RESPONSE'); if (part.done) break;
          ensure(part.value instanceof Uint8Array && part.value.byteLength > 0, 'RESPONSE');
          const room = BODY_CAP - length, copied = Math.min(room, part.value.byteLength);
          retained.set(part.value.subarray(0, copied), length); length += copied;
          if (part.value.byteLength > room) { bodyTruncated = true; throw new Refusal('SIZE'); }
        }
      }
      try { decode(retained.subarray(0, length)); } catch { throw new Refusal('UTF8'); }
      bodyComplete = true; current(); ensure(status >= 200 && status < 300, 'HTTP');
      return evidence();
    } catch (error) {
      const code = reason ?? (error instanceof Refusal ? error.code.slice('LIFECYCLE_FRIENDBOT_'.length) : 'TRANSPORT');
      controller.abort(); cancel(response, reader);
      throw new Refusal(code, evidence());
    } finally {
      clearTimeout(timer); caller?.removeEventListener('abort', onCaller); controller.signal.removeEventListener('abort', onAbort);
      try { reader?.releaseLock(); } catch { /* outstanding cancellation may retain the lock */ }
    }
  } });
}
