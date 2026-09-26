// Actual independently generated development proof fixtures, not fake engines.
// Enable with PRIVACY_PROVER_TESTS=1 and PRIVACY_PROVER_MANIFEST.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {bn254} from '@noble/curves/bn254.js';
import {createLocalGroth16Prover,encodeGroth16Proof,decodeGroth16Proof} from '../src/prover.mjs';

test('bounded verifier agrees with snarkjs on all17 real proofs and rejects statement/valid-point mutations',{
 skip:process.env.PRIVACY_PROVER_TESTS==='1'?false:'Requires independently pinned actual development proof fixtures',timeout:180_000,
},async t=>{
 assert.ok(process.env.PRIVACY_PROVER_MANIFEST,'Enabled differential test requires pinned artifact manifest');
 const manifestPath=resolve(process.env.PRIVACY_PROVER_MANIFEST),base=dirname(manifestPath);
 const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
 const chain=JSON.parse(readFileSync(resolve(base,'proofs/chain.json'),'utf8'));
 assert.equal(chain.steps.length,17);
 const adapters={},keys={};
 for(const name of ['transition','revocation']){
  const source=manifest[name],raw=key=>new Uint8Array(readFileSync(resolve(base,source[key])));
  keys[name]=JSON.parse(new TextDecoder().decode(raw('verificationKey')));
  adapters[name]=await createLocalGroth16Prover({wasm:raw('wasm'),zkey:raw('zkey'),verificationKey:raw('verificationKey'),pins:source.pins,publicCount:name==='transition'?157:4});
 }
 const before=globalThis.curve_bn128,cases=[],durations=[];
 for(const step of chain.steps){
  const fixture=JSON.parse(readFileSync(resolve(base,'proofs',step.file),'utf8'));
  assert.equal(fixture.testOnly,true);const name=step.revocation?'revocation':'transition';
  const proof=encodeGroth16Proof(fixture.proof),decoded=decodeGroth16Proof(proof);
  assert.deepEqual(decoded,fixture.proof,'transport must preserve all real fixture coordinates');
  const began=performance.now();assert.equal(await adapters[name].verify(proof,fixture.publicSignals),true,step.name);
  durations.push({name:step.name,verifyMs:performance.now()-began});
  const changedSignals=fixture.publicSignals.slice();changedSignals[0]=((BigInt(changedSignals[0])+1n)%bn254.G1.Point.Fn.ORDER).toString();
  const changedProof=structuredClone(decoded),A=bn254.G1.Point.fromAffine({x:BigInt(decoded.pi_a[0]),y:BigInt(decoded.pi_a[1])}).double().toAffine();
  changedProof.pi_a=[String(A.x),String(A.y),'1'];
  assert.equal(await adapters[name].verify(proof,changedSignals),false,step.name+' statement mutation');
  assert.equal(await adapters[name].verify(encodeGroth16Proof(changedProof),fixture.publicSignals),false,step.name+' valid-point mutation');
  assert.equal(globalThis.curve_bn128===before,true,'bounded verifier must leave ffjavascript global state untouched');
  cases.push({name,fixture,changedSignals,changedProof});
 }
 // The independent comparison engine owns a bounded test-only Node pool.
 // The adapter above must not create/reuse it and has already been checked.
 const cpus=os.cpus;os.cpus=()=>cpus().slice(0,2);
 try{
  const {groth16}=await import('snarkjs');
  for(const {name,fixture,changedSignals,changedProof} of cases){
   assert.equal(await groth16.verify(keys[name],fixture.publicSignals,fixture.proof),true);
   assert.equal(await groth16.verify(keys[name],changedSignals,fixture.proof),false);
   assert.equal(await groth16.verify(keys[name],fixture.publicSignals,changedProof),false);
  }
 }finally{await globalThis.curve_bn128?.terminate();os.cpus=cpus;}
 t.diagnostic(JSON.stringify({actualProofs:cases.length,validPointMutations:cases.length,statementMutations:cases.length,boundedVerifierDurations:durations}));
});
