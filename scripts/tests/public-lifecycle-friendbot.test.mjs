import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setImmediate as immediate } from 'node:timers/promises';
import { createRequire } from 'node:module';
import { buildPublicLifecyclePlan, hashPublicLifecyclePlan } from '../lib/public-lifecycle-plan.mjs';
const moduleUrl = new URL('../lib/public-lifecycle-friendbot.mjs', import.meta.url);
const api = await import(moduleUrl).catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND' && error.url === moduleUrl.href) return {};
  throw error;
});
const { StrKey } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const keys = Array.from({ length: 7 }, (_, i) => StrKey.encodeEd25519PublicKey(Buffer.alloc(32, i + 1)));
const plan = buildPublicLifecyclePlan({ preparedAt: '2026-09-27T20:00:00.000Z', recipient: keys[0], relayer: keys[1], credentialKeys: Object.fromEntries(['venue', 'podTimelock', 'podMixed', 'attester', 'agent'].map((r, i) => [r, keys[i + 2]])) });
const CAP = 1024 * 1024;
const bytes = value => Buffer.from(value);
const sha = value => createHash('sha256').update(value).digest('hex');
function factory(options) {
  assert.equal(typeof api.createPublicLifecycleFriendbot, 'function', 'bounded Friendbot factory must exist');
  return api.createPublicLifecycleFriendbot(options);
}
async function refusal(promise, code) {
  let captured;
  await assert.rejects(promise, error => {
    captured = error; assert.equal(error.message, `LIFECYCLE_FRIENDBOT_${code}`);
    assert.equal(error.code, error.message); return true;
  });
  return captured;
}
function retained(evidence, body, { status = 200, complete = true, truncated = false } = {}) {
  assert.equal(evidence.schema, 'agyion-public-lifecycle-friendbot-response-v1');
  assert.equal(evidence.provider, 'https://friendbot.stellar.org/');
  assert.equal(evidence.planSha256, hashPublicLifecyclePlan(plan));
  assert.equal(evidence.role, 'recipient'); assert.equal(evidence.address, plan.actors.recipient);
  assert.equal(evidence.httpStatus, status); assert.equal(evidence.chainOutcome, 'unknown');
  assert.equal(evidence.bodyBase64, body.toString('base64')); assert.equal(Object.hasOwn(evidence, 'bodyText'), false);
  assert.equal(evidence.bodySha256, sha(body)); assert.equal(evidence.bodyBytes, body.length);
  assert.equal(evidence.bodyComplete, complete); assert.equal(evidence.bodyTruncated, truncated);
  assert.ok(Object.isFrozen(evidence) && Object.isFrozen(evidence.request));
  assert.equal(evidence.request.method, 'GET');
  assert.equal(evidence.request.url, `https://friendbot.stellar.org/?addr=${plan.actors.recipient}`);
}

test('one explicit fixed request preserves exact raw bytes without asserting funding or trusting a hash', async () => {
  const body = bytes(' {"hash":"' + 'ab'.repeat(32) + '","status":"SUCCESS"}\n'); let calls = 0, init;
  const bot = factory({ fetch: async (url, options) => {
    calls++; init = options;
    assert.equal(url, `https://friendbot.stellar.org/?addr=${plan.actors.recipient}`);
    return new Response(body, { status: 200 });
  } });
  assert.equal(calls, 0); assert.ok(Object.isFrozen(bot));
  const result = await bot.request({ plan, role: 'recipient' });
  assert.equal(calls, 1); retained(result, body);
  assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit');
  assert.equal(init.cache, 'no-store'); assert.equal(init.headers.Accept, 'application/json');
  assert.ok(init.signal instanceof AbortSignal); assert.equal(Object.hasOwn(init, 'body'), false);
  assert.equal(Object.hasOwn(result, 'transactionHash'), false); assert.equal(Object.hasOwn(result, 'funded'), false);
});

test('the relayer address is resolved only from the immutable plan', async () => {
  let url;
  const out = await factory({ fetch: async target => { url = target; return new Response('{}'); } }).request({ plan, role: 'relayer' });
  assert.equal(url, `https://friendbot.stellar.org/?addr=${plan.actors.relayer}`);
  assert.equal(out.address, plan.actors.relayer); assert.equal(out.role, 'relayer'); assert.equal(out.chainOutcome, 'unknown');
});

for (const role of ['seller', 'venue', 'podTimelock', 'podMixed', 'attester', 'agent', '', 'Recipient', null, {}]) {
  test(`refuses role ${JSON.stringify(role)} before fetch`, async () => {
    let calls = 0; const bot = factory({ fetch: async () => { calls++; throw Error('MUST_NOT_FETCH'); } });
    await refusal(bot.request({ plan, role }), 'INPUT'); assert.equal(calls, 0);
  });
}
for (const change of [p => { p.actors.recipient = p.actors.seller; }, p => { p.networkPassphrase = 'Public Global Stellar Network ; September 2015'; }, p => { p.friendbotUrl = 'https://evil.invalid/'; }, p => { p.steps.pop(); }]) {
  test('altered authority or scope is refused before any funding request', async () => {
    let calls = 0; const bot = factory({ fetch: async () => { calls++; throw Error('MUST_NOT_FETCH'); } });
    const changed = structuredClone(plan); change(changed);
    await refusal(bot.request({ plan: changed, role: 'recipient' }), 'INPUT'); assert.equal(calls, 0);
  });
}
for (const key of ['address', 'sourceAccount', 'url', 'amount', 'timeoutMs', 'responseBytes', 'fetch', 'signal']) {
  test(`request rejects unknown ${key} instead of accepting an authority override`, async () => {
    let calls = 0; const bot = factory({ fetch: async () => { calls++; throw Error('MUST_NOT_FETCH'); } });
    await refusal(bot.request({ plan, role: 'recipient', [key]: 'override' }), 'INPUT'); assert.equal(calls, 0);
  });
}
test('input and factory accessors are rejected without invocation', async () => {
  let getters = 0, calls = 0;
  const config = {}; Object.defineProperty(config, 'fetch', { enumerable: true, get() { getters++; return globalThis.fetch; } });
  assert.throws(() => factory(config), /LIFECYCLE_FRIENDBOT_INPUT/);
  const bot = factory({ fetch: async () => { calls++; throw Error('MUST_NOT_FETCH'); } });
  const input = { plan }; Object.defineProperty(input, 'role', { enumerable: true, get() { getters++; return 'recipient'; } });
  await refusal(bot.request(input), 'INPUT');
  const altered = structuredClone(plan); Object.defineProperty(altered.actors, 'recipient', { enumerable: true, get() { getters++; return keys[0]; } });
  await refusal(bot.request({ plan: altered, role: 'recipient' }), 'INPUT');
  assert.equal(getters, 0); assert.equal(calls, 0);
});
test('factory has no URL, deadline, byte-cap or arbitrary signal override', () => {
  for (const config of [{ url: 'https://evil.invalid' }, { timeoutMs: 1 }, { responseBytes: CAP * 2 }, { fetch: null }, { signal: {} }, null])
    assert.throws(() => factory(config), /LIFECYCLE_FRIENDBOT_INPUT/);
});
test('an already aborted caller starts no request', async () => {
  const caller = new AbortController(); caller.abort(); let calls = 0;
  const bot = factory({ signal: caller.signal, fetch: async () => { calls++; throw Error('MUST_NOT_FETCH'); } });
  const error = await refusal(bot.request({ plan, role: 'recipient' }), 'ABORTED');
  assert.equal(calls, 0); assert.equal(error.evidence, undefined);
});

for (const stage of ['headers', 'body']) test(`fixed 30-second deadline bounds ${stage} even when abort and cancellation are ignored`, async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); let signal, finish, cancelled = 0, settled = false;
  const body = new ReadableStream({ start(c) { if (stage === 'body') c.enqueue(bytes('{')); }, cancel() { cancelled++; return new Promise(() => {}); } });
  const bot = factory({ fetch: async (url, init) => { signal = init.signal; return stage === 'headers' ? new Promise(resolve => { finish = resolve; }) : new Response(body); } });
  const pending = refusal(bot.request({ plan, role: 'recipient' }), 'TIMEOUT').then(e => { settled = true; return e; });
  await immediate(); t.mock.timers.tick(29999); await immediate(); assert.equal(settled, false); assert.equal(signal.aborted, false);
  t.mock.timers.tick(1); const error = await pending; assert.equal(signal.aborted, true);
  retained(error.evidence, stage === 'body' ? bytes('{') : bytes(''), { status: stage === 'body' ? 200 : null, complete: false });
  if (stage === 'headers') { finish(new Response(body)); await immediate(); }
  assert.equal(cancelled, 1);
});
test('header latency consumes the same deadline used for body draining', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); let finish, settled = false;
  const bot = factory({ fetch: async () => new Promise(resolve => { finish = resolve; }) });
  const pending = refusal(bot.request({ plan, role: 'recipient' }), 'TIMEOUT').then(e => { settled = true; return e; });
  await immediate(); t.mock.timers.tick(29000);
  finish(new Response(new ReadableStream({ start(c) { c.enqueue(bytes('partial')); } }))); await immediate();
  t.mock.timers.tick(999); await immediate(); assert.equal(settled, false);
  t.mock.timers.tick(1); const error = await pending; retained(error.evidence, bytes('partial'), { complete: false });
});
test('caller abort is composed with the internal controller and cancels an uncooperative reader', async () => {
  const caller = new AbortController(); let signal, cancelled = 0, released = 0;
  const body = { getReader() { return { read: () => new Promise(() => {}), cancel() { cancelled++; return new Promise(() => {}); }, releaseLock() { released++; } }; } };
  const bot = factory({ signal: caller.signal, fetch: async (url, init) => { signal = init.signal; return { status: 200, redirected: false, headers: new Headers(), body }; } });
  const pending = refusal(bot.request({ plan, role: 'recipient' }), 'ABORTED');
  await immediate(); caller.abort(); const error = await pending;
  retained(error.evidence, bytes(''), { complete: false }); assert.notEqual(signal, caller.signal);
  assert.equal(signal.aborted, true); assert.equal(cancelled, 1); assert.equal(released, 1);
});
test('success removes the caller listener and deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); const caller = new AbortController(); let signal;
  const bot = factory({ signal: caller.signal, fetch: async (url, init) => { signal = init.signal; return new Response('{}'); } });
  await bot.request({ plan, role: 'recipient' }); caller.abort(); t.mock.timers.tick(30000); assert.equal(signal.aborted, false);
});

test('declared oversize aborts and cancels immediately without awaiting cleanup', async () => {
  let cancelled = 0, signal;
  const body = new ReadableStream({ cancel() { cancelled++; return new Promise(() => {}); } });
  const bot = factory({ fetch: async (url, init) => { signal = init.signal; return new Response(body, { headers: { 'Content-Length': String(CAP + 1) } }); } });
  const error = await refusal(bot.request({ plan, role: 'recipient' }), 'SIZE');
  retained(error.evidence, bytes(''), { complete: false, truncated: true }); assert.equal(signal.aborted, true); assert.equal(cancelled, 1);
});
test('decoded streamed overflow retains only the exact bounded prefix and hashes that prefix', async () => {
  const body = Buffer.alloc(CAP + 1, 97); let cancelled = 0, signal;
  const stream = new ReadableStream({ start(c) { c.enqueue(body.subarray(0, 7)); c.enqueue(body.subarray(7)); }, cancel() { cancelled++; throw Error('private cancel failure'); } });
  const bot = factory({ fetch: async (url, init) => { signal = init.signal; return new Response(stream, { headers: { 'Content-Length': '1', 'Content-Encoding': 'gzip' } }); } });
  const error = await refusal(bot.request({ plan, role: 'recipient' }), 'SIZE');
  retained(error.evidence, body.subarray(0, CAP), { complete: false, truncated: true });
  assert.equal(cancelled, 1); assert.equal(signal.aborted, true);
});
test('an exact one-MiB decoded body is accepted without interpreting its text', async () => {
  const body = Buffer.alloc(CAP, 120), out = await factory({ fetch: async () => new Response(body) }).request({ plan, role: 'recipient' });
  retained(out, body);
});
test('malformed UTF-8 retains exact bytes and digest with no complete usable body', async () => {
  const body = Buffer.from([0x61, 0xc3, 0x28]);
  const error = await refusal(factory({ fetch: async () => new Response(body) }).request({ plan, role: 'recipient' }), 'UTF8');
  retained(error.evidence, body, { complete: false });
});
test('full control-character bodies retain every byte while serialized success and failure evidence stay under two MiB', async () => {
  const body = Buffer.alloc(CAP);
  const out = await factory({ fetch: async () => new Response(body) }).request({ plan, role: 'recipient' });
  const error = await refusal(factory({ fetch: async () => new Response(body, { status: 503 }) }).request({ plan, role: 'recipient' }), 'HTTP');
  for (const evidence of [out, error.evidence]) {
    assert.equal(evidence.bodyBytes, CAP); assert.deepEqual(Buffer.from(evidence.bodyBase64, 'base64'), body);
    assert.ok(Buffer.byteLength(JSON.stringify(evidence)) <= 2 * CAP);
    assert.equal(Object.hasOwn(evidence, 'bodyText'), false);
  }
});
test('UTF-8 BOM and non-JSON text are preserved without normalization or inferred funding', async () => {
  const body = Buffer.from('\ufeffnot JSON\r\n');
  retained(await factory({ fetch: async () => new Response(body) }).request({ plan, role: 'recipient' }), body);
});
test('chunks are copied when observed so a reused upstream buffer cannot rewrite retained bytes', async () => {
  const value = bytes('ok'); let reads = 0;
  const response = { status: 200, redirected: false, headers: new Headers(), body: { getReader() { return { async read() { if (reads++ === 0) return { done: false, value }; value[0] = 120; return { done: true }; }, releaseLock() {} }; } } };
  retained(await factory({ fetch: async () => response }).request({ plan, role: 'recipient' }), bytes('ok'));
});
for (const status of [400, 429, 500, 599]) test(`HTTP ${status} retains its complete raw response and remains unknown without retry`, async () => {
  const body = bytes('{"detail":"unknown funding outcome"}'); let calls = 0;
  const bot = factory({ fetch: async () => { calls++; return new Response(body, { status }); } });
  const error = await refusal(bot.request({ plan, role: 'recipient' }), 'HTTP'); retained(error.evidence, body, { status }); assert.equal(calls, 1);
});
for (const [status, redirected] of [[302, false], [307, false], [200, true]]) test(`redirect ${status}/${redirected} is rejected and its stream is cancelled`, async () => {
  let cancelled = 0;
  const body = new ReadableStream({ cancel() { cancelled++; return new Promise(() => {}); } });
  const response = { status, redirected, headers: new Headers(), body };
  const error = await refusal(factory({ fetch: async () => response }).request({ plan, role: 'recipient' }), 'REDIRECT');
  retained(error.evidence, bytes(''), { status, complete: false }); assert.equal(cancelled, 1);
});
for (const status of [0, 99, 600, '200', NaN]) test(`invalid HTTP status ${String(status)} never becomes an observed success`, async () => {
  const error = await refusal(factory({ fetch: async () => ({ status, redirected: false, headers: new Headers(), body: null }) }).request({ plan, role: 'recipient' }), 'RESPONSE');
  retained(error.evidence, bytes(''), { status: null, complete: false });
});
test('malformed content length is a bounded refusal with retained response scope', async () => {
  const error = await refusal(factory({ fetch: async () => new Response('{}', { headers: { 'Content-Length': '-1' } }) }).request({ plan, role: 'recipient' }), 'RESPONSE');
  retained(error.evidence, bytes(''), { complete: false });
});
test('transport failure sanitizes exception details and never retries', async () => {
  let calls = 0;
  const error = await refusal(factory({ fetch: async () => { calls++; throw Error('PRIVATE_TOKEN=never expose'); } }).request({ plan, role: 'recipient' }), 'TRANSPORT');
  retained(error.evidence, bytes(''), { status: null, complete: false }); assert.equal(calls, 1);
  assert.equal(JSON.stringify(error).includes('PRIVATE_TOKEN'), false);
});
test('a response body accessor failure remains sanitized even when cleanup reads it again', async () => {
  const response = { status: 200, redirected: false, headers: new Headers(), get body() { throw Error('PRIVATE_BODY_DETAIL'); } };
  const error = await refusal(factory({ fetch: async () => response }).request({ plan, role: 'recipient' }), 'TRANSPORT');
  retained(error.evidence, bytes(''), { complete: false });
});
test('late response accessor errors cannot escape cleanup after the deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); let finish;
  const bot = factory({ fetch: async () => new Promise(resolve => { finish = resolve; }) });
  const pending = refusal(bot.request({ plan, role: 'recipient' }), 'TIMEOUT');
  await immediate(); t.mock.timers.tick(30000); await pending;
  finish({ get body() { throw Error('PRIVATE_LATE_BODY_DETAIL'); } }); await immediate();
});
test('reader failure retains its observed prefix and sanitizes transport errors', async () => {
  let reads = 0, cancelled = 0;
  const response = { status: 200, redirected: false, headers: new Headers(), body: { getReader() { return {
    async read() { if (reads++ === 0) return { done: false, value: bytes('partial') }; throw Error('PRIVATE_READ_DETAIL'); },
    cancel() { cancelled++; }, releaseLock() {},
  }; } } };
  const error = await refusal(factory({ fetch: async () => response }).request({ plan, role: 'recipient' }), 'TRANSPORT');
  retained(error.evidence, bytes('partial'), { complete: false }); assert.equal(cancelled, 1);
});
test('zero-byte progress is refused instead of starving the deadline with an endless read loop', async () => {
  let cancelled = 0;
  const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array()); }, cancel() { cancelled++; } });
  const error = await refusal(factory({ fetch: async () => new Response(stream) }).request({ plan, role: 'recipient' }), 'RESPONSE');
  retained(error.evidence, bytes(''), { complete: false }); assert.equal(cancelled, 1);
});
test('empty successful HTTP body remains merely an observed response', async () => {
  retained(await factory({ fetch: async () => new Response(null, { status: 204 }) }).request({ plan, role: 'recipient' }), bytes(''), { status: 204 });
});
test('separate explicit calls each issue one request; transport provides no durable at-most-once claim', async () => {
  let calls = 0; const bot = factory({ fetch: async () => { calls++; return new Response('{}', { status: calls === 1 ? 503 : 200 }); } });
  await refusal(bot.request({ plan, role: 'recipient' }), 'HTTP'); assert.equal(calls, 1);
  const out = await bot.request({ plan, role: 'recipient' }); assert.equal(calls, 2); assert.equal(out.chainOutcome, 'unknown');
});
