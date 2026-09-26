import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,truncateSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const expected={bytes:302083218,sha256:'9693220206afab749e3d88d4ab5fdf5d36120ea102e7e587ccea0e7a5208e711'};
for(const script of ['verify-phase1.mjs','verify-phase1-fast.mjs','prepare-development-keys.mjs']){
 test(`${script} refuses unrelated bytes before transcript verification`,()=>{
  const directory=mkdtempSync(join(tmpdir(),'agyion-phase1-input-'));
  try{
   const file=join(directory,'different.ptau');writeFileSync(file,'unrelated transcript');
   const args=script==='prepare-development-keys.mjs'?[directory,file,join(directory,'keys')]:[file];
   const result=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/'+script,import.meta.url)),...args],{encoding:'utf8',timeout:10000});
   assert.equal(result.error,undefined);
   assert.notEqual(result.status,0);
   assert.match(result.stderr,/UNEXPECTED_PHASE1_ARTIFACT/);
   assert.doesNotMatch(result.stdout,/Full upstream phase1 verification|Prepared public phase1 VERIFIED/);
  }finally{rmSync(directory,{recursive:true,force:true});}
 });
}
test('only the selected exact PSE fingerprint receives its source attribution',async()=>{
 const {selectedPhase1Source}=await import('../scripts/phase1-input.mjs');
 const source=selectedPhase1Source(expected);
 assert.equal(source.source,'https://pse-trusted-setup-ppot.s3.eu-central-1.amazonaws.com/pot28_0080/ppot_0080_18.ptau');
 assert.equal(source.sourceCommit,'b077232729db7c9eb65b63c4aaaa0ac4a1b0bba2');
 assert.equal(Object.hasOwn(source,'verified'),false);
 for(const value of [{...expected,bytes:expected.bytes+1},{...expected,bytes:String(expected.bytes)},
  {...expected,sha256:'00'.repeat(32)},{...expected,sha256:expected.sha256.toUpperCase()}]){
  assert.throws(()=>selectedPhase1Source(value),/UNEXPECTED_PHASE1_ARTIFACT/);
 }
});
test('key preparation rejects provenance that relabels the selected transcript',async()=>{
 const {selectedPhase1Source,checkSelectedPhase1Provenance}=await import('../scripts/phase1-input.mjs');
 const valid={...expected,...selectedPhase1Source(expected),verified:true};
 assert.doesNotThrow(()=>checkSelectedPhase1Provenance(valid));
 for(const key of ['source','sourceRepository','sourceCommit']){
  assert.throws(()=>checkSelectedPhase1Provenance({...valid,[key]:'different-source'}),/UNEXPECTED_PHASE1_PROVENANCE/);
 }
 assert.throws(()=>checkSelectedPhase1Provenance({...valid,verified:false}),/UNEXPECTED_PHASE1_PROVENANCE/);
 assert.throws(()=>checkSelectedPhase1Provenance({...valid,sha256:'00'.repeat(32)}),/UNEXPECTED_PHASE1_ARTIFACT/);
});
test('matching file length cannot replace the actual selected digest',async()=>{
 const {checkSelectedPhase1Input}=await import('../scripts/phase1-input.mjs');
 const directory=mkdtempSync(join(tmpdir(),'agyion-phase1-digest-'));
 try{
  const file=join(directory,'same-length.ptau');writeFileSync(file,'');truncateSync(file,expected.bytes);
  await assert.rejects(checkSelectedPhase1Input(file),/UNEXPECTED_PHASE1_ARTIFACT/);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
