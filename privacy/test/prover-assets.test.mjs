import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadPinnedProverArtifacts } from '../src/prover-assets.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const origin = 'https://example.test';
function fixture() {
  const files = new Map();
  function asset(parts) {
    const chunks = parts.map(part => {
      const bytes = new TextEncoder().encode(part), sha256 = digest(bytes);
      files.set(`${origin}/zk/private/${sha256}.bin`, bytes);
      return { bytes: bytes.length, sha256 };
    });
    const all = new TextEncoder().encode(parts.join(''));
    return { bytes: all.length, sha256: digest(all), chunks };
  }
  const release = { publicCount: 157, wasm: asset(['wasm']), zkey: asset(['first', 'second']), verificationKey: asset(['{"vk":1}']) };
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const body = files.get(url);
    const response = new Response(body, { status: body ? 200 : 404 });
    Object.defineProperty(response, 'url', { value: url });
    return response;
  };
  return { release, files, calls, fetchImpl };
}

test('ordered chunks and full artifact pins are verified before returning prover input', async () => {
  const f = fixture();
  const result = await loadPinnedProverArtifacts(f.release, { origin, fetchImpl: f.fetchImpl });
  assert.equal(new TextDecoder().decode(result.zkey), 'firstsecond');
  assert.equal(result.publicCount, 157);
  assert.equal(result.pins.zkeySha256, f.release.zkey.sha256);
  assert.equal(f.calls.length, 4);
  for (const { url, options } of f.calls) {
    assert.ok(url.startsWith(origin + '/zk/private/'));
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
  }
});

test('changed, reordered, truncated and oversized chunks cannot initialize a prover', async () => {
  for (const mutation of ['changed', 'reordered', 'truncated', 'oversized', 'fullpin', 'missing']) {
    const f = fixture(), chunk = f.release.zkey.chunks[0], url = `${origin}/zk/private/${chunk.sha256}.bin`;
    if (mutation === 'changed') f.files.set(url, new TextEncoder().encode('other'));
    if (mutation === 'reordered') f.release.zkey.chunks.reverse();
    if (mutation === 'truncated') f.files.set(url, new Uint8Array(2));
    if (mutation === 'oversized') f.files.set(url, new Uint8Array(6));
    if (mutation === 'fullpin') f.release.zkey.sha256 = '1'.repeat(64);
    if (mutation === 'missing') f.files.delete(url);
    await assert.rejects(loadPinnedProverArtifacts(f.release, { origin, fetchImpl: f.fetchImpl }), undefined, mutation);
  }
});

test('unbounded, ambiguous or accessor based manifests fail before any network request', async () => {
  for (const change of [
    f => { f.release.zkey.bytes = 512 * 1024 * 1024 + 1; },
    f => { f.release.zkey.chunks[0].bytes = 16 * 1024 * 1024 + 1; },
    f => { f.release.wasm.bytes++; },
    f => { f.release.publicCount = 1; },
    f => { f.release.wasm.url = 'https://attacker.test/secret'; },
    f => { Object.defineProperty(f.release, 'zkey', { enumerable: true, get() { throw new Error('getter executed'); } }); },
  ]) {
    const f = fixture(); change(f);
    await assert.rejects(loadPinnedProverArtifacts(f.release, { origin, fetchImpl: f.fetchImpl }));
    assert.equal(f.calls.length, 0);
  }
});

test('redirects, public HTTP origins and cancellation are rejected', async () => {
  const f = fixture();
  await assert.rejects(loadPinnedProverArtifacts(f.release, { origin: 'http://public.test', fetchImpl: f.fetchImpl }));
  await assert.rejects(loadPinnedProverArtifacts(f.release, { origin, fetchImpl: async url => {
    const response = await f.fetchImpl(url, {});
    Object.defineProperty(response, 'redirected', { value: true });
    return response;
  } }));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(loadPinnedProverArtifacts(f.release, { origin, fetchImpl: f.fetchImpl, signal: controller.signal }));
});

test('a stalled response or body is bounded by an external deadline', async () => {
  const f = fixture();
  await assert.rejects(loadPinnedProverArtifacts(f.release, { origin, fetchImpl: () => new Promise(() => {}), timeoutMs: 25 }), /timed out/);
  await assert.rejects(loadPinnedProverArtifacts(f.release, { origin, timeoutMs: 25, fetchImpl: async url => {
    const response = new Response(new ReadableStream({ pull() { return new Promise(() => {}); } }));
    Object.defineProperty(response, 'url', { value: url });
    return response;
  } }), /timed out/);
});

test('compressed HTTP lengths do not replace bounds on decoded artifact bytes', async () => {
  const f = fixture();
  const result = await loadPinnedProverArtifacts(f.release, { origin, fetchImpl: async url => {
    // Browsers expose decoded bytes, while Content-Length describes the wire body.
    const response = await f.fetchImpl(url, {});
    response.headers.set('content-encoding', 'gzip');
    response.headers.set('content-length', String(f.files.get(url).length + 20));
    return response;
  } });
  assert.equal(new TextDecoder().decode(result.zkey), 'firstsecond');
  await assert.rejects(loadPinnedProverArtifacts(f.release, { origin, fetchImpl: async url => {
    const response = await f.fetchImpl(url, {});
    response.headers.set('content-length', String(f.files.get(url).length + 1));
    return response;
  } }), /response size mismatch/);
  await assert.rejects(loadPinnedProverArtifacts(f.release, { origin, fetchImpl: async url => {
    const response = new Response(new Uint8Array(f.files.get(url).length + 1));
    Object.defineProperty(response, 'url', { value: url });
    response.headers.set('content-encoding', 'br');
    response.headers.set('content-length', '1');
    return response;
  } }), /Oversized/);
});

test('cancelling a pending artifact body releases the reader and rejects promptly', async () => {
  const f = fixture(), controller = new AbortController();
  let cancelCalls = 0, started;
  const bodyStarted = new Promise(resolve => { started = resolve; });
  const pending = loadPinnedProverArtifacts(f.release, { origin, signal: controller.signal,
    fetchImpl: async url => {
      const response = new Response(new ReadableStream({
        pull() { return new Promise(() => {}); },
        cancel() { cancelCalls++; },
      }));
      Object.defineProperty(response, 'url', { value: url });
      const getReader = response.body.getReader.bind(response.body);
      response.body.getReader = () => { const reader = getReader(); started(); return reader; };
      return response;
    },
  });
  await bodyStarted;
  controller.abort();
  await assert.rejects(pending, /cancelled/);
  assert.equal(cancelCalls, 1);
});
