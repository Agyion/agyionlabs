// Explicit development-artifact integration; never creates a ceremony/key.
// PRIVACY_PROVER_TESTS=1 PRIVACY_PROVER_MANIFEST=/absolute/cases.json node --test privacy/test/prover-integration.test.mjs
// cases.json: {transition:{wasm,zkey,verificationKey,pins},revocation:{...}}.
// Paths resolve relative to that manifest. pins has the3 SHA256 field names
// accepted by createLocalGroth16Prover and must be independently supplied.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { bn254 } from '@noble/curves/bn254.js';
import { createLocalGroth16Prover, decodeGroth16Proof, encodeGroth16Proof } from '../src/prover.mjs';
import { buildWitness, buildRevocationWitness } from '../src/witness.mjs';
import { FIELD, SparseMerkleTree } from '../src/model.mjs';
import { makeDepositConfig, TEST_RANDOMNESS } from './model-fixtures.mjs';

test('pinned real transition and revocation Groth16 roundtrips reject changed signals and valid-point proof tampering',{
  skip:process.env.PRIVACY_PROVER_TESTS==='1'?false:'Set PRIVACY_PROVER_TESTS=1 with a pinned artifact manifest',timeout:300_000,
},async t=>{
  assert.ok(process.env.PRIVACY_PROVER_MANIFEST,'Enabled integration requires PRIVACY_PROVER_MANIFEST');
  const manifestPath=resolve(process.env.PRIVACY_PROVER_MANIFEST),manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
  try {
    for(const [name,n,result] of [
      ['transition',157,buildWitness(makeDepositConfig(),TEST_RANDOMNESS)],
      ['revocation',4,buildRevocationWitness({domain:101n,tree:new SparseMerkleTree(128),tag:555n})],
    ])await t.test(name,async()=>{
      const source=manifest[name];assert.ok(source,`Missing ${name} artifact case`);
      const raw=key=>new Uint8Array(readFileSync(resolve(dirname(manifestPath),source[key])));
      const adapter=await createLocalGroth16Prover({wasm:raw('wasm'),zkey:raw('zkey'),verificationKey:raw('verificationKey'),pins:source.pins,publicCount:n});
      const proof=await adapter.prove(result.witness);
      assert.deepEqual(proof.publicSignals,result.publicInputs.map(String));
      assert.equal(await adapter.verify(proof.proof,proof.publicSignals),true);
      const signals=proof.publicSignals.slice();signals[0]=((BigInt(signals[0])+1n)%FIELD).toString();
      assert.equal(await adapter.verify(proof.proof,signals),false);
      const decoded=structuredClone(decodeGroth16Proof(proof.proof));
      const changed=bn254.G1.Point.fromAffine({x:BigInt(decoded.pi_a[0]),y:BigInt(decoded.pi_a[1])}).double().toAffine();
      decoded.pi_a=[String(changed.x),String(changed.y),'1'];
      assert.equal(await adapter.verify(encodeGroth16Proof(decoded),proof.publicSignals),false);
    });
  } finally {
    // snarkjs0.7.6 verification caches Node worker threads globally. This
    // isolated test process owns those workers; the production adapter never
    // silently terminates another caller's curve or mutates shared globals.
    await globalThis.curve_bn128?.terminate();
  }
});
