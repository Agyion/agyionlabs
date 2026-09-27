// The caller pins this manifest in the application release. Downloaded metadata
// is never a trust root. Artifact URLs are derived only from content hashes.
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { record, list, hex } from './validation.mjs';

const CHUNK_MAX = 16 * 1024 * 1024;
const digest = bytes => bytesToHex(sha256(bytes));
function ensure(ok, message) { if (!ok) throw new Error(message); }
function size(value, max) {
  ensure(Number.isSafeInteger(value) && value > 0 && value <= max, 'Invalid prover artifact size');
  return value;
}
function asset(value, max) {
  const a = record(value, ['bytes', 'sha256', 'chunks'], 'artifact');
  const bytes = size(a.bytes, max), hash = hex(a.sha256, 32, 'artifact.sha256');
  const chunks = list(a.chunks, 32, 'artifact.chunks').map(value => {
    const c = record(value, ['bytes', 'sha256'], 'chunk');
    return { bytes: size(c.bytes, CHUNK_MAX), sha256: hex(c.sha256, 32, 'chunk.sha256') };
  });
  ensure(chunks.length > 0 && chunks.reduce((sum, c) => sum + c.bytes, 0) === bytes, 'Prover chunk lengths differ from artifact');
  return { bytes, sha256: hash, chunks };
}
function snapshot(value) {
  const r = record(value, ['publicCount', 'wasm', 'zkey', 'verificationKey'], 'prover release');
  ensure(r.publicCount === 157 || r.publicCount === 4, 'Unsupported prover statement');
  return { publicCount: r.publicCount, wasm: asset(r.wasm, 32 * 1024 * 1024), zkey: asset(r.zkey, 512 * 1024 * 1024), verificationKey: asset(r.verificationKey, 1024 * 1024) };
}

/** Load one circuit lazily. No witness, key, wallet or application state is sent. */
export async function loadPinnedProverArtifacts(trustedRelease, {
  origin = globalThis.location?.origin, fetchImpl = globalThis.fetch, signal,
  timeoutMs = 120000,
} = {}) {
  const release = snapshot(trustedRelease);
  const base = new URL(origin);
  ensure(base.origin === origin && (base.protocol === 'https:' || (base.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(base.hostname))), 'Prover assets require a secure application origin');
  ensure(typeof fetchImpl === 'function', 'Artifact transport unavailable');
  ensure(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 300000, 'Invalid artifact deadline');
  const controller = new AbortController();
  let timer, rejectDeadline;
  const deadline = new Promise((_, reject) => { rejectDeadline = reject; });
  // Attach the rejection handler before registering an already aborted signal.
  const bound = promise => Promise.race([promise, deadline]);
  deadline.catch(() => {});
  const stop = message => { controller.abort(); rejectDeadline(new Error(message)); };
  const cancel = () => stop('Prover asset loading cancelled');
  timer = setTimeout(() => stop('Prover asset loading timed out'), timeoutMs);
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    if (signal?.aborted) { cancel(); await deadline; }
    async function load(description) {
      const output = new Uint8Array(description.bytes);
      let offset = 0;
      for (const chunk of description.chunks) {
        const url = `${origin}/zk/private/${chunk.sha256}.bin`;
        const response = await bound(Promise.resolve().then(() => fetchImpl(url, {
          method: 'GET', credentials: 'omit', redirect: 'error', cache: 'force-cache',
          referrerPolicy: 'no-referrer', signal: controller.signal,
        })));
        ensure(response.status === 200 && !response.redirected && response.url === url, 'Prover artifact response rejected');
        const length = response.headers.get('content-length');
        const encoding = response.headers.get('content-encoding');
        // Fetch exposes decoded bytes; a compressed wire length is not their size.
        // The bounded stream and both hashes below remain mandatory for every encoding.
        if (encoding === null || encoding.trim().toLowerCase() === 'identity')
          ensure(length === null || (/^(0|[1-9][0-9]*)$/.test(length) && Number(length) === chunk.bytes), 'Prover chunk response size mismatch');
        ensure(response.body, 'Missing prover artifact body');
        const reader = response.body.getReader();
        const start = offset;
        try {
          for (;;) {
            const { done, value } = await bound(reader.read());
            if (done) break;
            ensure(value instanceof Uint8Array && value.byteLength <= chunk.bytes - (offset - start), 'Oversized prover artifact response');
            output.set(value, offset); offset += value.byteLength;
          }
        } catch (error) { void reader.cancel().catch(() => {}); throw error; }
        finally { reader.releaseLock(); }
        ensure(offset - start === chunk.bytes, 'Truncated prover artifact response');
        ensure(digest(output.subarray(start, offset)) === chunk.sha256, 'Prover chunk hash mismatch');
      }
      ensure(offset === description.bytes && digest(output) === description.sha256, 'Prover artifact hash mismatch');
      return output;
    }
    const wasm = await load(release.wasm);
    const zkey = await load(release.zkey);
    const verificationKey = await load(release.verificationKey);
    ensure(!controller.signal.aborted, 'Prover asset loading cancelled');
    return { wasm, zkey, verificationKey, publicCount: release.publicCount, pins: {
      wasmSha256: release.wasm.sha256, zkeySha256: release.zkey.sha256,
      verificationKeySha256: release.verificationKey.sha256,
    } };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    controller.abort();
  }
}
