import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseExpectations, readinessPattern, assertPublishedKernelBundle } from '../release-expectations.mjs';

const contractId = 'CDVLAU6DHK5HXO72WAMJWZD7V5NAOEUT2NQ6OJKJXJM4G4NPKEK2VGMQ';
const wasmHash = 'd06ada3ec51a6d4a47e599a1997a345e9316a717f3259b09bbdc1aa28e69f841';
const ready = { EXPECTED_PROTOCOL_READINESS: 'ready', EXPECTED_HAK_CONTRACT_ID: contractId, EXPECTED_HAK_WASM_HASH: wasmHash };

test('keeps the default old-kernel gate and requires explicit pins for ready', () => {
  const previous = releaseExpectations();
  assert.equal(previous.base, 'https://agyionlabs.dev');
  assert.equal(previous.readiness, 'blocked');
  assert.ok(readinessPattern(previous.readiness).test('incompatible'));
  assert.ok(readinessPattern(previous.readiness).test('unavailable'));
  assert.ok(!readinessPattern(previous.readiness).test('ready'));
  assert.throws(() => releaseExpectations({ EXPECTED_PROTOCOL_READINESS: 'ready' }), /Pinned verification/);
  assert.deepEqual(releaseExpectations({ ...ready, PUBLIC_BASE_URL: 'http://127.0.0.1:4292/' }), {
    base: 'http://127.0.0.1:4292', readiness: 'ready', contractId, wasmHash,
  });
  for (const status of ['unavailable', 'incompatible', 'ready-ish']) assert.ok(!readinessPattern('ready').test(status));
});

test('rejects malformed target, status and incomplete identity before browser work', () => {
  for (const PUBLIC_BASE_URL of ['ftp://example.test', 'https://user:secret@example.test', 'https://example.test/path', 'https://example.test/?x', 'https://example.test/#x']) {
    assert.throws(() => releaseExpectations({ PUBLIC_BASE_URL }));
  }
  for (const env of [
    { EXPECTED_PROTOCOL_READINESS: 'anything' },
    { ...ready, EXPECTED_HAK_CONTRACT_ID: undefined },
    { ...ready, EXPECTED_HAK_WASM_HASH: undefined },
    { ...ready, EXPECTED_HAK_CONTRACT_ID: '../../keys' },
    { ...ready, EXPECTED_HAK_WASM_HASH: wasmHash.toUpperCase() },
    { EXPECTED_HAK_CONTRACT_ID: contractId },
  ]) assert.throws(() => releaseExpectations(env));
});

test('requires expected identity in fetched and byte-verified application bundles', () => {
  const expected = releaseExpectations(ready);
  assert.equal(assertPublishedKernelBundle([], releaseExpectations()), null);
  assert.throws(() => assertPublishedKernelBundle([], expected), /expected contract/);
  assert.throws(() => assertPublishedKernelBundle([{ route: '/one.js', body: Buffer.from(contractId) }, { route: '/two.js', body: Buffer.from(wasmHash) }], expected), /expected contract/);
  assert.throws(() => assertPublishedKernelBundle([{ route: '/one.js', body: Buffer.from(`${contractId} ${'a'.repeat(64)}`) }], expected), /expected contract/);
  assert.deepEqual(assertPublishedKernelBundle([{ route: '/one.js', body: Buffer.from(`${contractId} ${wasmHash}`) }], expected), {
    contractId, wasmHash, matchedScripts: ['/one.js'],
  });
});
