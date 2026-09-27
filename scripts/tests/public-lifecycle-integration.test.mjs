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

test('protected actor signer persists one original attempt and expired recovery cannot recreate it through the journal',
{ timeout: 120000 }, async t => {
  fs.mkdirSync(artifactRoot, { recursive: true });
  const home = fs.mkdtempSync(path.join(artifactRoot, 'lifecycle-signing-integration-'));
  fs.chmodSync(home, 0o700); t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const { stdout } = await promisify(execFile)(process.execPath,
    ['--experimental-test-module-mocks', child, home, 'signing'], { timeout: 110000, maxBuffer: 1024 * 1024 });
  const result = JSON.parse(stdout.trim());
  assert.equal(result.completed, 1); assert.equal(result.pending, 1);
  assert.equal(result.signs, 2); assert.equal(result.sends, 2);
  assert.equal(result.actorSignCalls, 1); assert.equal(result.queries, 2);
  assert.equal(result.replacementCalls, 0); assert.equal(result.generatedKeys, 7);
  assert.equal(result.originalAttemptUnchanged, true);
  assert.equal(result.codeBytesAuthenticated, 'unit-only byte-auth double');
  t.diagnostic(JSON.stringify(result));
});

test('protected actor signer expiry after signature preserves an unretryable claim without pretending an attempt was saved',
{ timeout: 120000 }, async t => {
  fs.mkdirSync(artifactRoot, { recursive: true });
  const home = fs.mkdtempSync(path.join(artifactRoot, 'lifecycle-signing-expiry-'));
  fs.chmodSync(home, 0o700); t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const { stdout } = await promisify(execFile)(process.execPath,
    ['--experimental-test-module-mocks', child, home, 'signing-expiry'], { timeout: 110000, maxBuffer: 1024 * 1024 });
  const result = JSON.parse(stdout.trim());
  assert.equal(result.completed, 1); assert.equal(result.claimedWithoutAttempt, true);
  assert.equal(result.signs, 2); assert.equal(result.sends, 1);
  assert.equal(result.actorSignCalls, 1); assert.equal(result.queries, 0);
  assert.equal(result.replacementCalls, 0); assert.equal(result.generatedKeys, 7);
  assert.equal(result.originalClaimUnchanged, true);
  assert.equal(result.codeBytesAuthenticated, 'unit-only byte-auth double');
  t.diagnostic(JSON.stringify(result));
});
