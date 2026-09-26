// Complete upstream snarkjs PPoT verification with byte-identical native hashes.
// No npm source edits, cached challenges, reduced rounds or skipped checks.
import os from 'node:os';
import {register} from 'node:module';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileNativeHashHelper} from './phase1-native-hashes.mjs';
import {checkSelectedPhase1Input,selectedPhase1Source} from './phase1-input.mjs';

const cpus=os.cpus();os.cpus=()=>cpus.slice(0,8);
const file=resolve(process.argv[2]||fileURLToPath(new URL('../../artifacts/privacy-v2/ppot_0080_18.ptau',import.meta.url)));
await checkSelectedPhase1Input(file);
const work=mkdtempSync(join(os.tmpdir(),'agyion-phase1-native-')),binary=compileNativeHashHelper(work);
const started=new Date().toISOString(),hashFile=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
try{
 const test=fileURLToPath(new URL('../test/phase1-native-hashes.test.mjs',import.meta.url));
 const parity=spawnSync(process.execPath,['--test',test],{stdio:'inherit',env:{...process.env,AGYION_NATIVE_HASH_BINARY:binary}});
 if(parity.status!==0)throw new Error('Native/upstream hash parity failed');
 register(new URL('./phase1-native-loader.mjs',import.meta.url),import.meta.url,{data:{binary}});
 const {powersOfTau}=await import('snarkjs');
 const logger={log:console.log,info:console.log,warn:console.warn,error:console.error,debug:message=>{
  if(/Computing initial|Validating contribution|Verifying powers|Lagrange/i.test(message))console.log(message);
 }};
 console.log('Full upstream phase1 verification; exact native hashes',started);
 if(await powersOfTau.verify(file,logger)!==true)throw new Error('Phase1 verification failed');
 const sha=createHash('sha256'),blake=createHash('blake2b512');let bytes=0;
 for await(const chunk of createReadStream(file)){sha.update(chunk);blake.update(chunk);bytes+=chunk.length;}
 const sha256=sha.digest('hex');
 const provenance={...selectedPhase1Source({bytes,sha256}),
  bytes,sha256,blake2b512:blake.digest('hex'),verified:true,
  verifiedBy:'snarkjs0.7.6 powersOfTau.verify; exact native BLAKE2b/SHA256 acceleration only',started,finished:new Date().toISOString(),
  native:{helperSourceSha256:hashFile(new URL('./phase1-sha256-chain.c',import.meta.url)),binarySha256:hashFile(binary),
   hashModuleSha256:hashFile(new URL('./phase1-native-hashes.mjs',import.meta.url)),loaderSha256:hashFile(new URL('./phase1-native-loader.mjs',import.meta.url)),parity:'5 initial powers;20 beacon length/exponent vectors;64 ChaCha words each;full prepared power4 transcript accepted and changed power point rejected'},
  boundary:'Full public PPoT phase1 transcript/powers/Lagrange checks retained. Agyion phase2 remains a single-operator DEVELOPMENT contribution.'};
 writeFileSync(file+'.provenance.json',JSON.stringify(provenance,null,2)+'\n',{flag:'wx'});
 console.log('Prepared public phase1 VERIFIED',provenance.finished);
}finally{await globalThis.curve_bn128?.terminate();rmSync(work,{recursive:true,force:true});}
