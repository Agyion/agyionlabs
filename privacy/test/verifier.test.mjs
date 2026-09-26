import test from 'node:test';
import assert from 'node:assert/strict';
import { installedSuites, activatePrivateTransfers, verifyPrivateProof } from '../src/verifier.mjs';
import { statement, statementContext } from './fixtures.mjs';

test('no plausible artifact manifest, callback or proof creates an installed verifier', async () => {
  const manifest = { audited: true, setupVerified: true, suiteId: 'research-groth16-bn254-v1', verify: () => true };
  assert.deepEqual(installedSuites(), []);
  assert.throws(() => installedSuites().push(manifest), TypeError);
  for (const candidate of [manifest, {}, null]) {
    assert.throws(() => activatePrivateTransfers(candidate), { code: 'NO_INSTALLED_VERIFIER' });
    await assert.rejects(verifyPrivateProof({ manifest: candidate, statement: statement(), context: statementContext(), proof: new Uint8Array(256), verified: true }), { code: 'NO_INSTALLED_VERIFIER' });
  }
  assert.deepEqual(installedSuites(), []);
});

test('environment flags cannot enable proof acceptance and supplied callbacks are never evaluated', async () => {
  const old = process.env.AGYION_ENABLE_PRIVACY; process.env.AGYION_ENABLE_PRIVACY = 'true';
  try {
    const candidate = { get verifier() { throw new Error('untrusted callback evaluated'); } };
    assert.throws(() => activatePrivateTransfers(candidate), { code: 'NO_INSTALLED_VERIFIER' });
    await assert.rejects(verifyPrivateProof(candidate), { code: 'NO_INSTALLED_VERIFIER' });
  } finally { if (old === undefined) delete process.env.AGYION_ENABLE_PRIVACY; else process.env.AGYION_ENABLE_PRIVACY = old; }
});
