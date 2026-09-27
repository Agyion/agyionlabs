import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { createPublicLifecycleRpc } from '../lib/public-lifecycle-rpc.mjs';
const { Account, Contract, Networks, StrKey, TransactionBuilder, xdr } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const RPC_URL = 'https://soroban-testnet.stellar.org', CAP = 2 * 1024 * 1024;
const source = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 1));
const target = 'CA3QJJNHN3TDSU3MYWVLO5N2NGFUBY4AO2J77TRPNHFI5VB5P26USEMZ';
const tx = new TransactionBuilder(new Account(source, '0'), { fee: '100', networkPassphrase: Networks.TESTNET })
  .addOperation(new Contract(target).call('version')).setTimebounds(0, 123456).build();
const unsigned = tx.toXDR();
const env = xdr.TransactionEnvelope.fromXDR(unsigned, 'base64');
// This deliberately non-authentic signature tests only transport shape. The
// journal, not this transport, is responsible for cryptographic authorization.
env.v1().signatures([new xdr.DecoratedSignature({ hint: Buffer.alloc(4), signature: Buffer.alloc(64) })]);
const signed = env.toXDR('base64');
const key = xdr.LedgerKey.account(new xdr.LedgerKeyAccount({ accountId: xdr.AccountId.publicKeyTypeEd25519(Buffer.alloc(32, 1)) })).toXDR('base64');
const errorIs = code => error => {
  assert.equal(error.message, `LIFECYCLE_RPC_${code}`); assert.equal(error.code, error.message);
  assert.equal(error.cause, undefined); return true;
};
const reply = (id, result = { status: 'ok' }) => JSON.stringify({ jsonrpc: '2.0', id, result });
const immediate = () => new Promise(resolve => setImmediate(resolve));
function echoFetch(calls, result) {
  return async (url, init) => { calls.push({ url, init }); return new Response(reply(JSON.parse(init.body).id, result)); };
}
async function fixture(route, run) {
  const seen = [], sockets = new Set(); let targetHits = 0;
  const server = createServer(async (req, res) => {
    if (req.url === '/target') { targetHits++; res.end('redirect target'); return; }
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const request = JSON.parse(Buffer.concat(chunks));
    seen.push({ request, method: req.method, headers: req.headers });
    route(req, res, request);
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const nativeFetch = globalThis.fetch;
  const fetch = (url, init) => {
    // Trusted code-only injection adapts this one fixed production destination
    // before I/O. The module itself exposes no URL override or global mutation.
    assert.equal(url, RPC_URL); assert.equal(init.redirect, 'manual');
    assert.equal(init.credentials, 'omit'); assert.equal(init.cache, 'no-store');
    assert.equal(init.method, 'POST'); assert.equal(init.headers['Content-Type'], 'application/json');
    assert.equal(init.headers.Accept, 'application/json'); assert.ok(init.signal instanceof AbortSignal);
    return nativeFetch(origin, init);
  };
  try { await run({ rpc: createPublicLifecycleRpc({ fetch }), fetch, seen, targetHits: () => targetHits }); }
  finally { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); }
}
function padded(id, bytes) { const base = reply(id, { padding: '' }); return base.replace('"padding":""', `"padding":"${'x'.repeat(bytes - Buffer.byteLength(base))}"`); }

const allowed = [
  ['getNetwork', {}], ['getLatestLedger', {}], ['getLedgers', { startLedger: 1, pagination: { limit: 1 } }],
  ['getLedgerEntries', { keys: [key] }], ['simulateTransaction', { transaction: unsigned, authMode: 'record' }],
  ['simulateTransaction', { transaction: unsigned, authMode: 'enforce' }], ['sendTransaction', { transaction: signed }],
  ['getTransaction', { hash: 'a'.repeat(64) }],
];
test('finite methods preserve exact raw results, explicit auth modes and independent IDs', async () => {
  const calls = [], result = { status: 'SUCCESS', createdAt: '1234567890', error: 'contract semantic error' };
  const rpc = createPublicLifecycleRpc({ fetch: echoFetch(calls, result) }); assert.ok(Object.isFrozen(rpc));
  for (const [method, params] of allowed) assert.deepEqual(await rpc.request(method, params), result);
  assert.equal(calls.length, allowed.length);
  calls.forEach(({ url, init }, i) => {
    assert.equal(url, RPC_URL); const body = JSON.parse(init.body);
    assert.deepEqual(body, { jsonrpc: '2.0', id: i + 1, method: allowed[i][0], params: allowed[i][1] });
  });
});
const invalidParams = [
  ['getHealth', {}], ['getNetwork', { url: RPC_URL }], ['getLatestLedger', []],
  ['getLedgers', { startLedger: 0, pagination: { limit: 1 } }],
  ['getLedgers', { startLedger: 0x100000000, pagination: { limit: 1 } }],
  ['getLedgers', { startLedger: 1, pagination: { limit: 2 } }],
  ['getLedgers', { startLedger: 1, pagination: { limit: 1, cursor: '1' } }],
  ['getLedgerEntries', { keys: [] }], ['getLedgerEntries', { keys: [key, key] }],
  ['getLedgerEntries', { keys: Array(27).fill(key) }], ['getLedgerEntries', { keys: [key + '\n'] }],
  ['getLedgerEntries', { keys: ['A'.repeat(8196)] }], ['getLedgerEntries', { keys: ['AAAA'] }],
  ['simulateTransaction', { transaction: unsigned }], ['simulateTransaction', { transaction: unsigned, authMode: 'automatic' }],
  ['simulateTransaction', { transaction: signed, authMode: 'enforce' }],
  ['simulateTransaction', { transaction: unsigned, authMode: 'record', resourceConfig: {} }],
  ['simulateTransaction', { transaction: 'A'.repeat(1024 * 1024 + 4), authMode: 'enforce' }],
  ['simulateTransaction', { transaction: unsigned + '\n', authMode: 'record' }],
  ['sendTransaction', { transaction: unsigned }], ['getTransaction', { hash: 'A'.repeat(64) }],
  ['getTransaction', { hash: 'a'.repeat(63) }], ['getTransaction', { hash: 'a'.repeat(64), retry: true }],
];
for (const [index, [method, params]] of invalidParams.entries()) test(`request allowlist refuses malformed case ${index + 1} before fetch`, async () => {
  const calls = []; await assert.rejects(createPublicLifecycleRpc({ fetch: echoFetch(calls) }).request(method, params), errorIs('INPUT'));
  assert.equal(calls.length, 0);
});
test('only canonical bounded v1 invocation envelopes are accepted', async () => {
  const cases = [];
  const altered = change => { const e = xdr.TransactionEnvelope.fromXDR(unsigned, 'base64'); change(e); return e.toXDR('base64'); };
  cases.push(altered(e => e.v1().tx().operations([])));
  cases.push(altered(e => e.v1().tx().operations([e.v1().tx().operations()[0], e.v1().tx().operations()[0]])));
  cases.push(altered(e => e.v1().tx().cond(xdr.Preconditions.precondNone())));
  cases.push(altered(e => e.v1().tx().cond().timeBounds().maxTime(xdr.Uint64.fromString('0'))));
  for (const transaction of cases) await assert.rejects(createPublicLifecycleRpc({ fetch: () => assert.fail('unexpected fetch') }).request('simulateTransaction', { transaction, authMode: 'enforce' }), errorIs('INPUT'));
});
test('configuration, prototypes, accessors and sparse arrays cannot run user code or weaken policy', async () => {
  for (const option of [{ url: 'https://soroban-rpc.mainnet.stellar.gateway.fm' }, { timeout: 1 }, { maxContentLength: 3 }, { fetch: 3 }, { signal: {} }, Object.create(null)]) assert.throws(() => createPublicLifecycleRpc(option), errorIs('INPUT'));
  let invoked = 0;
  const getter = Object.defineProperty({}, 'fetch', { enumerable: true, get() { invoked++; return fetch; } });
  assert.throws(() => createPublicLifecycleRpc(getter), errorIs('INPUT'));
  const rpc = createPublicLifecycleRpc({ fetch: () => assert.fail('unexpected fetch') });
  const params = Object.defineProperty({}, 'hash', { enumerable: true, get() { invoked++; return 'a'.repeat(64); } });
  await assert.rejects(rpc.request('getTransaction', params), errorIs('INPUT'));
  await assert.rejects(rpc.request('getLedgerEntries', { keys: new Array(1) }), errorIs('INPUT'));
  await assert.rejects(rpc.request('getNetwork', { toJSON() { invoked++; return {}; } }), errorIs('INPUT'));
  assert.equal(invoked, 0);
});

test('native loopback exact 2 MiB is accepted without retries', async () => {
  await fixture((req, res, body) => { const data = padded(body.id, CAP); res.setHeader('Content-Length', Buffer.byteLength(data)); res.end(data); }, async ({ rpc, seen }) => {
    const value = await rpc.request('getNetwork'); assert.ok(value.padding.length > CAP - 100); assert.equal(seen.length, 1);
  });
});
for (const kind of ['chunked-over', 'error-over', 'gzip-over']) test(`native loopback ${kind} refuses oversized decoded response`, async () => {
  await fixture((req, res, body) => {
    const data = padded(body.id, CAP + 1);
    if (kind === 'error-over') res.statusCode = 503;
    if (kind === 'gzip-over') { const compressed = gzipSync(data); assert.ok(compressed.length < CAP); res.setHeader('Content-Encoding', 'gzip'); res.end(compressed); }
    else { res.write(data.slice(0, 100)); res.end(data.slice(100)); }
  }, async ({ rpc, seen }) => {
    await assert.rejects(rpc.request('getNetwork'), errorIs(kind === 'error-over' ? 'HTTP' : 'SIZE')); assert.equal(seen.length, 1);
  });
});
test('native loopback declared oversize aborts the still-open body immediately', async () => {
  let closedResolve; const closed = new Promise(resolve => { closedResolve = resolve; });
  await fixture((req, res) => { res.on('close', closedResolve); res.setHeader('Content-Length', CAP + 1); res.write(' '); }, async ({ rpc }) => {
    await assert.rejects(rpc.request('getNetwork'), errorIs('SIZE'));
    await Promise.race([closed, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('body not closed promptly')), 1500); timer.unref(); })]);
  });
});
for (const status of [302, 307]) test(`native loopback ${status} rejects without following and cancels open body`, async () => {
  let closedResolve; const closed = new Promise(resolve => { closedResolve = resolve; });
  await fixture((req, res) => { res.on('close', closedResolve); res.writeHead(status, { Location: '/target' }); res.write('redirect'); }, async ({ rpc, targetHits }) => {
    await assert.rejects(rpc.request('getNetwork'), errorIs('REDIRECT'));
    await Promise.race([closed, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('redirect body not closed')), 1500); timer.unref(); })]);
    assert.equal(targetHits(), 0);
  });
});
test('native loopback caller cancellation reaches a stalled body', async () => {
  let arrivedResolve, closedResolve; const arrived = new Promise(resolve => { arrivedResolve = resolve; }), closed = new Promise(resolve => { closedResolve = resolve; });
  await fixture((req, res) => { res.on('close', closedResolve); res.writeHead(200); res.write('{'); arrivedResolve(); }, async ({ fetch }) => {
    const caller = new AbortController(); const pending = createPublicLifecycleRpc({ fetch, signal: caller.signal }).request('getNetwork');
    const refusal = assert.rejects(pending, errorIs('ABORTED')); await Promise.race([arrived, refusal]); caller.abort('private abort reason'); await refusal;
    await Promise.race([closed, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('aborted body not closed')), 1500); timer.unref(); })]);
  });
});
for (const stage of ['headers', 'body']) test(`fixed 15000 ms deadline remains active through ${stage}, aborts and cancels`, async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); let signal, cancelled = false;
  const fetch = async (url, init) => {
    signal = init.signal;
    if (stage === 'headers') return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('secret fetch error')), { once: true }));
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); }, cancel() { cancelled = true; } }));
  };
  let settled = false; const pending = createPublicLifecycleRpc({ fetch }).request('getNetwork');
  const refusal = assert.rejects(pending, errorIs('TIMEOUT')).then(() => { settled = true; });
  await Promise.race([immediate(), refusal]); t.mock.timers.tick(14999); await immediate(); assert.equal(settled, false); assert.equal(signal.aborted, false);
  t.mock.timers.tick(1); await refusal; assert.equal(signal.aborted, true); if (stage === 'body') assert.equal(cancelled, true);
});
test('already aborted caller never starts I/O and success clears its deadline', async t => {
  const caller = new AbortController(); caller.abort('private');
  await assert.rejects(createPublicLifecycleRpc({ signal: caller.signal, fetch: () => assert.fail('unexpected fetch') }).request('getNetwork'), errorIs('ABORTED'));
  t.mock.timers.enable({ apis: ['setTimeout'] }); let signal;
  const rpc = createPublicLifecycleRpc({ fetch: async (url, init) => { signal = init.signal; return new Response(reply(JSON.parse(init.body).id)); } });
  assert.deepEqual(await rpc.request('getNetwork'), { status: 'ok' }); t.mock.timers.tick(15000); assert.equal(signal.aborted, false);
});

const invalidResponses = [
  id => '{private-invalid-json', id => reply(id + 1), id => JSON.stringify({ jsonrpc: '1.0', id, result: {} }),
  id => JSON.stringify({ jsonrpc: '2.0', id: String(id), result: {} }), id => JSON.stringify({ jsonrpc: '2.0', id }),
  id => JSON.stringify({ jsonrpc: '2.0', id, result: {}, error: { code: -1, message: 'private' } }),
  id => JSON.stringify({ jsonrpc: '2.0', id, result: {}, extra: true }), id => JSON.stringify({ jsonrpc: '2.0', id, result: null }),
  id => `{"jsonrpc":"2.0","id":${id},"id":${id},"result":{}}`,
  id => `{"jsonrpc":"2.0","id":${id},"result":{"createdAt":"1","createdAt":"2"}}`,
];
for (const [index, make] of invalidResponses.entries()) test(`malformed or ambiguous JSON-RPC response ${index + 1} fails closed`, async () => {
  let signal;
  const rpc = createPublicLifecycleRpc({ fetch: async (url, init) => { signal = init.signal; return new Response(make(JSON.parse(init.body).id)); } });
  await assert.rejects(rpc.request('getNetwork'), errorIs('RESPONSE')); assert.equal(signal.aborted, true);
});
test('JSON-RPC and fetch exception secrets never escape while remote error is distinct', async () => {
  const rpc = createPublicLifecycleRpc({ fetch: async (url, init) => new Response(JSON.stringify({ jsonrpc: '2.0', id: JSON.parse(init.body).id, error: { code: -32000, message: 'secret', data: { credential: 'secret' } } })) });
  await assert.rejects(rpc.request('getNetwork'), errorIs('REMOTE'));
  await assert.rejects(createPublicLifecycleRpc({ fetch: () => { throw new Error('secret'); } }).request('getNetwork'), errorIs('TRANSPORT'));
});
test('declared size rejection explicitly cancels the stream and aborts its controller', async () => {
  let cancelled = false, signal;
  const fetch = async (url, init) => { signal = init.signal; return new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'Content-Length': String(CAP + 1) } }); };
  await assert.rejects(createPublicLifecycleRpc({ fetch }).request('getNetwork'), errorIs('SIZE')); assert.equal(cancelled, true); assert.equal(signal.aborted, true);
});

test('caller abort before the scheduled fetch starts prevents any transport call', async () => {
  const caller = new AbortController(); let calls = 0;
  const rpc = createPublicLifecycleRpc({ signal: caller.signal, fetch: async () => { calls++; return new Response(reply(1)); } });
  const pending = rpc.request('getNetwork'); caller.abort();
  await assert.rejects(pending, errorIs('ABORTED')); assert.equal(calls, 0);
});
test('late fetch completion after deadline disposes its response body', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); let finish, cancelled = false;
  const rpc = createPublicLifecycleRpc({ fetch: () => new Promise(resolve => { finish = resolve; }) });
  const refusal = assert.rejects(rpc.request('getNetwork'), errorIs('TIMEOUT'));
  await immediate(); t.mock.timers.tick(15000); await refusal;
  finish(new Response(new ReadableStream({ cancel() { cancelled = true; } }))); await immediate(); assert.equal(cancelled, true);
});
test('26 canonical distinct keys are accepted and a 27th is rejected', async () => {
  const batch = Array.from({ length: 27 }, (_, i) => xdr.LedgerKey.account(new xdr.LedgerKeyAccount({ accountId: xdr.AccountId.publicKeyTypeEd25519(Buffer.alloc(32, i + 1)) })).toXDR('base64'));
  const calls = [], rpc = createPublicLifecycleRpc({ fetch: echoFetch(calls, { entries: [] }) });
  assert.deepEqual(await rpc.request('getLedgerEntries', { keys: batch.slice(0, 26) }), { entries: [] });
  await assert.rejects(rpc.request('getLedgerEntries', { keys: batch }), errorIs('INPUT')); assert.equal(calls.length, 1);
});
test('noninvocation, unbounded, multsignature and fee-bump envelope forms are refused', async () => {
  const changed = (base, fn) => { const e = xdr.TransactionEnvelope.fromXDR(base, 'base64'); fn(e); return e.toXDR('base64'); };
  const noninvoke = changed(unsigned, e => e.v1().tx().operations()[0].body(xdr.OperationBody.manageData(new xdr.ManageDataOp({ dataName: 'x', dataValue: null }))));
  const backwards = changed(unsigned, e => e.v1().tx().cond().timeBounds().minTime(xdr.Uint64.fromString('123457')));
  const two = changed(signed, e => e.v1().signatures([e.v1().signatures()[0], e.v1().signatures()[0]]));
  const short = changed(signed, e => e.v1().signatures()[0].signature(Buffer.alloc(63)));
  const bump = TransactionBuilder.buildFeeBumpTransaction(source, '100', tx, Networks.TESTNET).toXDR();
  const rpc = createPublicLifecycleRpc({ fetch: () => assert.fail('unexpected fetch') });
  for (const transaction of [noninvoke, backwards, bump]) await assert.rejects(rpc.request('simulateTransaction', { transaction, authMode: 'enforce' }), errorIs('INPUT'));
  for (const transaction of [two, short]) await assert.rejects(rpc.request('sendTransaction', { transaction }), errorIs('INPUT'));
});
test('escaped duplicate names, invalid UTF-8 and excessive nesting are refused', async () => {
  for (const body of ['{"jsonrpc":"2.0","id":1,"result":{"a":1,"\\u0061":2}}',
    Buffer.from([0x7b, 0xff, 0x7d]), `{"jsonrpc":"2.0","id":1,"result":{"x":${'['.repeat(65)}0${']'.repeat(65)}}}`]) {
    await assert.rejects(createPublicLifecycleRpc({ fetch: async () => new Response(body) }).request('getNetwork'), errorIs('RESPONSE'));
  }
});
test('HTTP and streamed overflow rejection cancel and abort, even when cancel throws', async () => {
  for (const kind of ['http', 'overflow']) {
    let signal, cancelled = false;
    const fetch = async (url, init) => {
      signal = init.signal;
      return new Response(new ReadableStream({ start(c) { if (kind === 'overflow') c.enqueue(new Uint8Array(CAP + 1)); }, cancel() { cancelled = true; throw new Error('private cancel detail'); } }), { status: kind === 'http' ? 503 : 200 });
    };
    await assert.rejects(createPublicLifecycleRpc({ fetch }).request('getNetwork'), errorIs(kind === 'http' ? 'HTTP' : 'SIZE'));
    assert.equal(signal.aborted, true); assert.equal(cancelled, true);
  }
});
test('completed caller listener cannot abort a finished successful request', async () => {
  const caller = new AbortController(); let signal;
  const rpc = createPublicLifecycleRpc({ signal: caller.signal, fetch: async (url, init) => { signal = init.signal; return new Response(reply(1)); } });
  await rpc.request('getNetwork'); caller.abort(); assert.equal(signal.aborted, false);
});
