import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// These are synthetic ledger/RPC observations, never host execution or live
// authorizations. Default keeps real structural, signature, fee and policy
// checks but substitutes only executable-byte authentication. The opt-in also
// verifies the exact compiled/preserved public WASM bytes and all four pins.
const child = fileURLToPath(new URL('./helpers/public-lifecycle-journal-fixture.mjs', import.meta.url));
const artifactRoot = fileURLToPath(new URL('../../artifacts/', import.meta.url));
for (const realWasm of [false, true]) {
  test(realWasm ? 'local pinned WASM: all39 synthetic journal steps use concrete state, observations and fee policies'
    : 'all38 prefinal synthetic journal steps use concrete state, observations and fee policies; code-auth-only double',
  { skip: realWasm && process.env.PUBLIC_LIFECYCLE_INTEGRATION_WASM !== '1', timeout: 600000 }, async t => {
    fs.mkdirSync(artifactRoot, { recursive: true });
    const home = fs.mkdtempSync(path.join(artifactRoot, 'lifecycle-integration-test-'));
    fs.chmodSync(home, 0o700);
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));
    const { stdout } = await promisify(execFile)(process.execPath,
      ['--experimental-test-module-mocks', child, home, realWasm ? 'real' : 'unit'],
      { timeout: 590000, maxBuffer: 1024 * 1024 });
    const result = JSON.parse(stdout.trim());
    const count = realWasm ? 39 : 38;
    assert.equal(result.completed, count);
    assert.equal(result.sends, count);
    assert.equal(result.signs, count);
    assert.equal(result.netFees, String(count * 400));
    assert.equal(result.recoveryNetworkCalls, 0);
    assert.equal(result.rawTamperRejected, true);
    assert.ok(result.maxPolicyBytes < 2 * 1024 * 1024);
    assert.equal(result.codeBytesAuthenticated, realWasm ? 'actual pinned bytes' : 'unit-only byte-auth double');
    t.diagnostic(JSON.stringify(result));
  });
}
