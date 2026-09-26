import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,readFileSync,writeFileSync } from 'node:fs';
import os, { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildBn128 } from 'ffjavascript';
import { calculateFirstChallengeHash } from '../node_modules/snarkjs/src/powersoftau_utils.js';
import { rngFromBeaconParams } from '../node_modules/snarkjs/src/misc.js';
import { nativeInitialChallengeHash,nativeBeaconRng,compileNativeHashHelper } from '../scripts/phase1-native-hashes.mjs';

test('native BLAKE2b initial challenge exactly matches upstream generator byte streams',async()=>{
 const curve=await buildBn128(true);
 try {for(const power of [0,1,4,10,14])assert.deepEqual(nativeInitialChallengeHash(curve,power),calculateFirstChallengeHash(curve,power));}
 finally{await curve.terminate();}
});
test('native chained SHA256 and resulting ChaCha stream exactly match upstream',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'agyion-native-hash-test-'));
 try{
  const binary=process.env.AGYION_NATIVE_HASH_BINARY||compileNativeHashHelper(dir);
  for(const length of [1,32,96,255])for(const exponent of [0,1,5,10,16]){
   const beacon=Uint8Array.from({length},(_,i)=>(i*71+19)&255);
   const original=await rngFromBeaconParams(beacon,exponent),native=await nativeBeaconRng(beacon,exponent,binary);
   assert.deepEqual(Array.from({length:64},()=>native.nextU32()),Array.from({length:64},()=>original.nextU32()),`length${length}/exponent${exponent}`);
  }
  await assert.rejects(nativeBeaconRng(new Uint8Array([1]),32,binary));
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('isolated native loader retains full prepared-ceremony checks and rejects a changed power point',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'agyion-native-transcript-test-'));
 const cpus=os.cpus;os.cpus=()=>cpus().slice(0,2);
 try{
  const {powersOfTau}=await import('snarkjs'),curve=await buildBn128(true);
  const initial=join(dir,'initial.ptau'),contributed=join(dir,'contributed.ptau'),beacon=join(dir,'beacon.ptau'),prepared=join(dir,'prepared.ptau');
  await powersOfTau.newAccumulator(curve,4,initial);
  await powersOfTau.contribute(initial,contributed,'TEST ONLY','public known test entropy');
  await powersOfTau.beacon(contributed,beacon,'TEST ONLY BEACON','17'.repeat(96),10);
  await powersOfTau.preparePhase2(beacon,prepared);
  assert.equal(await powersOfTau.verify(prepared),true);
  const bytes=readFileSync(prepared),bad=Buffer.from(bytes);let at=12,changed=false;
  while(at<bad.length){const type=bad.readUInt32LE(at),size=Number(bad.readBigUInt64LE(at+4));
   if(type===2){bad[at+12+64]^=1;changed=true;break;}at+=12+size;}
  assert.equal(changed,true);const tampered=join(dir,'tampered.ptau');writeFileSync(tampered,bad);
  const binary=process.env.AGYION_NATIVE_HASH_BINARY||compileNativeHashHelper(dir);
  const loader=new URL('../scripts/phase1-native-loader.mjs',import.meta.url).href;
  const child=`import os from 'node:os';import {register} from 'node:module';const c=os.cpus();os.cpus=()=>c.slice(0,2);register(${JSON.stringify(loader)},import.meta.url,{data:{binary:${JSON.stringify(binary)}}});const{powersOfTau}=await import('snarkjs');try{if(await powersOfTau.verify(${JSON.stringify(prepared)})!==true)throw new Error('Valid transcript rejected');let rejected=false;try{rejected=await powersOfTau.verify(${JSON.stringify(tampered)})!==true;}catch{rejected=true;}if(!rejected)throw new Error('Invalid transcript accepted');}finally{await globalThis.curve_bn128?.terminate();}`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',child],{cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8',timeout:60_000});
  assert.equal(result.status,0,result.stderr||result.stdout);
  await curve.terminate();
 }finally{await globalThis.curve_bn128?.terminate();os.cpus=cpus;rmSync(dir,{recursive:true,force:true});}
});
