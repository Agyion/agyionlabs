import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { babyjubjub } from '@noble/curves/misc.js';
import { compileCircuit } from './circuit-helpers.mjs';

const INV8 = 2394026564107420727433200628387514462817212225638746351800188703329891451411n;
const xy = p => [p.toAffine().x, p.toAffine().y];

test('circuit proves subgroup membership rather than accepting curve or torsion points', async () => {
  const { dir, calculator } = await compileCircuit('test/subgroup');
  try {
    for (const s of [1n, 7n, 123456789n]) {
      const p = babyjubjub.Point.BASE.multiply(s);
      await calculator.calculateWitness({ point: xy(p), preimage: xy(p.multiply(INV8)) }, true);
    }
    const witness = { point: xy(babyjubjub.Point.BASE), preimage: xy(babyjubjub.Point.BASE.multiply(INV8)) };
    for (const point of [[0n, 1n], [0n, babyjubjub.Point.Fp.ORDER - 1n], [0n, 0n], [1n, 1n]]) {
      await assert.rejects(calculator.calculateWitness({ ...witness, point }, true));
    }
    await assert.rejects(calculator.calculateWitness({ ...witness, preimage: xy(babyjubjub.Point.BASE) }, true));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
