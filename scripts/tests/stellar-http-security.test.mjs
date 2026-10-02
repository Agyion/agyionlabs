import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// GHSA-vh66-26gq-q6x8: exercise the SDK's own Axios resolution. The prerequisite
// prototype pollution is injected only in an isolated child, against loopback.
// This does not demonstrate a pollution entry point or a live RPC exploit.
const probe = String.raw`
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

const sdkRequire = createRequire(process.argv[1]);
const transportRequire = createRequire(sdkRequire.resolve('@stellar/stellar-sdk'));
const axios = transportRequire('axios');
const received = [];
const server = createServer((request, response) => {
  const observation = {
    method: request.method,
    callerHeader: request.headers['x-caller'] ?? null,
    authorization: request.headers.authorization ?? null,
  };
  received.push(observation);
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(observation));
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const url = 'http://127.0.0.1:' + server.address().port + '/';
const originalHeaders = Object.getOwnPropertyDescriptor(Object.prototype, 'headers');
assert.equal(originalHeaders, undefined);
const request = () => axios.get(url, {
  adapter: 'fetch', headers: { 'X-Caller': 'preserved' }, fetchOptions: {}, timeout: 2000,
});
try {
  await request();
  Object.defineProperty(Object.prototype, 'headers', {
    configurable: true, writable: true, enumerable: true,
    value: { Authorization: 'Bearer synthetic-attacker' },
  });
  await request();
} finally {
  delete Object.prototype.headers;
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
assert.equal(Object.getOwnPropertyDescriptor(Object.prototype, 'headers'), undefined);
process.stdout.write(JSON.stringify({ axiosVersion: axios.VERSION, received }));
`;

for (const component of ['app', 'contracts/private-pool/client', 'market']) {
  test(`${component}: SDK fetch transport preserves caller headers after inherited-header injection`, {
    timeout: 15000,
  }, async t => {
    const packageUrl = new URL(`../../${component}/package.json`, import.meta.url).href;
    const { stdout } = await promisify(execFile)(process.execPath,
      ['--input-type=module', '-e', probe, packageUrl], { timeout: 10000, maxBuffer: 32768 });
    const result = JSON.parse(stdout);
    t.diagnostic(JSON.stringify(result));
    const expected = { method: 'GET', callerHeader: 'preserved', authorization: null };
    assert.equal(result.received.length, 2);
    assert.deepEqual(result.received[0], expected, 'unpolluted positive control');
    assert.deepEqual(result.received[1], expected, 'inherited headers must not replace caller headers');
  });
}
