import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { keyDigest } from './pin-verifiers.mjs';
const actual = JSON.parse(readFileSync(new URL('../../zk-preimage/artifacts/vk.json', import.meta.url), 'utf8'));
test('host encoding matches the independently pinned real preimage verifier', () => {
  assert.equal(keyDigest(actual, 1).toString('hex'), '3966012757c54284dcf07c3b2d02a9c2c2a136d04e470b8bda75f4d3e84a905c');
});
test('cannot relabel a different circuit or encode degenerate/noncanonical points', () => {
  assert.throws(() => keyDigest(actual, 157));
  for (const change of [
    v => v.IC[1] = ['0', '0', '1'],
    v => v.vk_alpha_1[0] = '-1',
    v => v.vk_beta_2[2] = ['0', '1'],
    v => v.IC[1][0] = '21888242871839275222246405745257275088696311157297823662689037894645226208583',
  ]) { const changed = structuredClone(actual); change(changed); assert.throws(() => keyDigest(changed, 1)); }
});
