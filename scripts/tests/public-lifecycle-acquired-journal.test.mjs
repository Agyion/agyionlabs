import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Explicit opt-in: authenticate existing local WASM and the four original pins.
// Ledger, inclusion, fee/refund and RPC replies remain synthetic. This neither
// executes a Soroban host nor proves live settlement or durable raw sidecars.
const child = fileURLToPath(new URL('./helpers/public-lifecycle-journal-fixture.mjs', import.meta.url));
const root = fileURLToPath(new URL('../../artifacts/', import.meta.url));
test('acquired cases complete and reopen all39 journal steps with decoded net400 fees and actual local pins', {
  skip: process.env.PUBLIC_LIFECYCLE_ACQUIRED_JOURNAL_WASM !== '1', timeout: 600000,
}, async t => {
  fs.mkdirSync(root, { recursive: true });
  const home = fs.mkdtempSync(path.join(root, 'lifecycle-acquired-journal-'));
  fs.chmodSync(home, 0o700);
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const { stdout } = await promisify(execFile)(process.execPath,
    ['--experimental-test-module-mocks', child, home, 'acquired-real'],
    { timeout: 590000, maxBuffer: 1024 * 1024 });
  const result = JSON.parse(stdout.trim());
  assert.equal(result.completed, 39);
  assert.equal(result.sends, 39);
  assert.equal(result.signs, 39);
  assert.equal(result.netFees, '15600');
  assert.equal(result.recoveryNetworkCalls, 0);
  assert.equal(result.rawTamperRejected, true);
  assert.equal(result.codeBytesAuthenticated, 'actual pinned bytes');
  assert.equal(result.acquired.caseScopes, 66);
  assert.equal(result.acquired.simulations, 70);
  assert.equal(result.acquired.controls, 4);
  assert.equal(result.acquired.credentialCalls, 30);
  assert.equal(result.acquired.earlyCaptured, 4);
  assert.equal(result.acquired.earlyConsumed, 4);
  assert.equal(result.acquired.stagedRemaining, 0);
  assert.equal(result.acquired.zeroGetters, 0);
  assert.equal(result.acquired.nativeCaptureHistoryOnly, true);
  assert.equal(result.acquired.projectedTamperRefusals, 3);
  assert.equal(result.acquired.finalPinsVerified, true);
  assert.equal(result.acquired.rawSidecarPersistence, false);
  assert.ok(result.maxPolicyBytes < 2 * 1024 * 1024);
  assert.ok(result.acquired.maxClaimBytes < 2 * 1024 * 1024);
  assert.ok(result.acquired.maxCompletionBytes < 2 * 1024 * 1024);
  assert.ok(result.acquired.maxCaptureBytes < 2 * 1024 * 1024);
  t.diagnostic(JSON.stringify(result));
});
