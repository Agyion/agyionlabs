import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { bn254 } from '@noble/curves/bn254.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { encodeGroth16Proof, decodeGroth16Proof, canonicalVerificationKeyBytes, createLocalGroth16Prover } from '../src/prover.mjs';

const fq = bn254.G1.Point.Fp.ORDER;
const g1 = p => { const a = p.toAffine(); return [String(a.x), String(a.y), '1']; };
const g2 = p => { const a = p.toAffine(); return [[String(a.x.c0),String(a.x.c1)],[String(a.y.c0),String(a.y.c1)],['1','0']]; };
// Valid curve points for codec/shape tests only. This is NOT a valid proof.
const transport = () => ({ pi_a:g1(bn254.G1.Point.BASE.multiply(2n)), pi_b:g2(bn254.G2.Point.BASE.multiply(3n)),
  pi_c:g1(bn254.G1.Point.BASE.multiply(4n)), protocol:'groth16', curve:'bn128' });
function key() {
  return { protocol:'groth16',curve:'bn128',nPublic:4,vk_alpha_1:g1(bn254.G1.Point.BASE),
    vk_beta_2:g2(bn254.G2.Point.BASE),vk_gamma_2:g2(bn254.G2.Point.BASE),vk_delta_2:g2(bn254.G2.Point.BASE),
    vk_alphabeta_12:Array.from({length:2},()=>Array.from({length:3},()=>['1','0'])),IC:Array.from({length:5},()=>g1(bn254.G1.Point.BASE)) };
}
const hash = bytes => bytesToHex(sha256(bytes));
function config(vk=key()) {
  const wasm = new Uint8Array([0,97,115,109,1,0,0,0]), zkey = new Uint8Array([1,2,3]);
  const verificationKey = canonicalVerificationKeyBytes(vk);
  return {wasm,zkey,verificationKey,publicCount:4,pins:{wasmSha256:hash(wasm),zkeySha256:hash(zkey),verificationKeySha256:hash(verificationKey)}};
}
test('proof transport is exactly256 bytes and uses imaginary-first G2 coordinates', () => {
  const p=transport(),hex=encodeGroth16Proof(p);
  const word=n=>BigInt(n).toString(16).padStart(64,'0');
  assert.equal(hex,[p.pi_a[0],p.pi_a[1],p.pi_b[0][1],p.pi_b[0][0],p.pi_b[1][1],p.pi_b[1][0],p.pi_c[0],p.pi_c[1]].map(word).join(''));
  assert.equal(hex.length,512);assert.deepEqual(decodeGroth16Proof(hex),p);
});
test('proof codec rejects noncanonical coordinates, identity, invalid curve points and framing aliases', () => {
  const good=encodeGroth16Proof(transport());
  for(const bad of ['0x'+good,good.toUpperCase(),good.slice(2),good+'00','0'.repeat(512)])assert.throws(()=>decodeGroth16Proof(bad));
  for(const bad of [fq.toString(),'01','-1',1,'1.0']) {const p=transport();p.pi_a[0]=bad;assert.throws(()=>encodeGroth16Proof(p));}
  for(const mutate of [p=>p.pi_a[2]='2',p=>p.pi_b[2]=['0','0'],p=>p.pi_a=['1','1','1'],p=>p.extra=1,p=>p.curve='bls12381']) {
    const p=transport();mutate(p);assert.throws(()=>encodeGroth16Proof(p));
  }
});
test('verification key canonicalization binds its public count and rejects extra fields and accessors', () => {
  const a=key(),b=Object.fromEntries(Object.entries(a).reverse());
  assert.deepEqual(canonicalVerificationKeyBytes(a),canonicalVerificationKeyBytes(b));
  for(const mutate of [k=>k.nPublic=157,k=>k.IC.pop(),k=>k.extra='x',k=>k.protocol='plonk']){
    const k=key();mutate(k);assert.throws(()=>canonicalVerificationKeyBytes(k));
  }
  let read=false;const k=key();Object.defineProperty(k,'curve',{enumerable:true,get(){read=true;return 'bn128';}});
  assert.throws(()=>canonicalVerificationKeyBytes(k));assert.equal(read,false);
});
test('all artifact pins fail closed before malformed artifacts can reach the prover', async () => {
  for(const pin of ['wasmSha256','zkeySha256','verificationKeySha256']){
    const c=config();c.pins[pin]='00'.repeat(32);
    await assert.rejects(createLocalGroth16Prover(c),/ARTIFACT_HASH_MISMATCH/);
  }
  const c=config();c.publicCount=5;await assert.rejects(createLocalGroth16Prover(c),/PUBLIC_COUNT/);
  const mismatch=config();mismatch.publicCount=157;await assert.rejects(createLocalGroth16Prover(mismatch),/PUBLIC_COUNT/);
});
test('artifact loading rejects filenames, shared/proxy byte views and JSON code-like fields', async () => {
  for(const wasm of ['https://invalid.example/circuit.wasm',new Uint8Array(new SharedArrayBuffer(8)),new Proxy(new Uint8Array(8),{})]){
    const c=config();c.wasm=wasm;await assert.rejects(createLocalGroth16Prover(c),/ARTIFACT_BYTES/);
  }
  const c=config();c.verificationKey=new TextEncoder().encode('{"__proto__":{"polluted":true}}');c.pins.verificationKeySha256=hash(c.verificationKey);
  await assert.rejects(createLocalGroth16Prover(c));assert.equal({}.polluted,undefined);
});
test('malformed proof/public vectors return false; malformed witness errors contain no private value', async () => {
  const adapter=await createLocalGroth16Prover(config());
  assert.equal(await adapter.verify('00',Array(4).fill('0')),false);
  for(const signals of [Array(3).fill('0'),['01','0','0','0'],[0n,0n,0n,0n],['-1','0','0','0']]){
    assert.equal(await adapter.verify(encodeGroth16Proof(transport()),signals),false);
  }
  const secret='PRIVATE_DO_NOT_LEAK';
  await assert.rejects(adapter.prove({core:[secret],path:[]}),err=>err.message==='LOCAL_PROOF_FAILED'&&!err.stack.includes(secret));
});
test('verification does not create or depend on the ffjavascript global worker pool', async () => {
  const adapter=await createLocalGroth16Prover(config()),before=globalThis.curve_bn128;
  // Bound the OLD failing implementation during the regression test itself.
  // Acceptance still requires no pool/cache creation whatsoever.
  const cpus=os.cpus;os.cpus=()=>cpus().slice(0,2);
  try {
    assert.equal(await adapter.verify(encodeGroth16Proof(transport()),Array(4).fill('1')),false);
    assert.equal(globalThis.curve_bn128===before,true,'verification must not create a global curve or worker pool');
  } finally {await globalThis.curve_bn128?.terminate();os.cpus=cpus;}
});
test('identity IC and zero aggregate are only neutral pairing terms, never an early success',async()=>{
  // Known-scalar algebra fixture ONLY, not a circuit-generated private-pool
  // proof or installed VK. The pool's immutable key pin cannot accept this key.
  const k=key(),G=bn254.G1.Point.BASE;
  k.IC=[g1(G),g1(G.negate()),['0','1','0'],['0','1','0'],['0','1','0']];
  const adapter=await createLocalGroth16Prover(config(k));
  const p={pi_a:g1(G.double()),pi_b:g2(bn254.G2.Point.BASE),pi_c:g1(G),protocol:'groth16',curve:'bn128'};
  const inputs=['1','0','0','0'];
  assert.equal(await adapter.verify(encodeGroth16Proof(p),inputs),true);
  assert.equal(await adapter.verify(encodeGroth16Proof({...p,pi_a:g1(G.multiply(3n))}),inputs),false);
  assert.equal(await adapter.verify(encodeGroth16Proof(p),['0','0','0','0']),false);
  for(const alias of [['0','0','0'],['0','1','1'],['00','1','0'],['0','1','2']]){
    const bad=structuredClone(k);bad.IC[2]=alias;
    assert.throws(()=>canonicalVerificationKeyBytes(bad),'only exact canonical IC identity is allowed');
  }
});
