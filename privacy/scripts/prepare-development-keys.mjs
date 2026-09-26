// DEVELOPMENT ONLY: one operator, not an independent trusted-setup ceremony.
import os from 'node:os';
import { randomBytes, createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zKey } from 'snarkjs';
import { checkSelectedPhase1Input, checkSelectedPhase1Provenance } from './phase1-input.mjs';
const cpus = os.cpus(); os.cpus = () => cpus.slice(0, 8);
const base = fileURLToPath(new URL('../../artifacts/privacy-v2/', import.meta.url));
const directory = resolve(process.argv[2] || resolve(base, 'circuit'));
const ptau = resolve(process.argv[3] || resolve(base, 'ppot_0080_18.ptau'));
const output = resolve(process.argv[4] || resolve(base, 'keys'));
await checkSelectedPhase1Input(ptau);
mkdirSync(output, { recursive: true });
const logger = { log: console.log, info: console.log, warn: console.warn, error: console.error, debug: () => {} };
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const phase1=JSON.parse(readFileSync(ptau+'.provenance.json','utf8'));
checkSelectedPhase1Provenance(phase1);
const compile=JSON.parse(readFileSync(resolve(directory,'compile-manifest.json'),'utf8'));
if(hash(new URL('../package-lock.json',import.meta.url))!==compile.lockSha256)throw new Error('Dependency lock changed since compilation');
const sourceRoot=new URL('../circuits/',import.meta.url);
for(const [name,digest] of Object.entries(compile.sources)){
  if(hash(new URL(name,sourceRoot))!==digest)throw new Error('Circuit sources changed since compilation');
}
for(const [name,digest] of Object.entries(compile.outputs)){
  if(hash(resolve(directory,name))!==digest)throw new Error('Compiled artifact hash mismatch');
}
const manifest = { schema:'agyion-private-development-artifacts-v2', developmentOnly:true,
  ceremony:'Published PPoT phase1; single-operator DEVELOPMENT phase2, no independent Agyion ceremony',
  compiler:'circom2 0.2.23 / circom 2.2.3', compilation:compile,snarkjs:'0.7.6', phase1:{file:basename(ptau),...phase1}, circuits:{} };
for (const [name, count] of [['transition',157],['revocation',4]]) {
  const r1cs=resolve(directory,`${name}.r1cs`), wasm=resolve(directory,`${name}_js/${name}.wasm`);
  const initial=resolve(output,`${name}-initial.zkey`), final=resolve(output,`${name}.zkey`), vkFile=resolve(output,`${name}-vk.json`);
  if ([initial,final,vkFile].some(existsSync)) throw new Error('Refusing to overwrite key artifacts');
  console.log('Creating DEVELOPMENT key',name,new Date().toISOString());
  if (await zKey.newZKey(r1cs,ptau,initial,logger) === -1) throw new Error('Key creation failed');
  await zKey.contribute(initial,final,'Agyion local DEVELOPMENT phase2',randomBytes(64).toString('hex'),logger);
  if (!await zKey.verifyFromR1cs(r1cs,ptau,final,logger)) throw new Error('Key/R1CS/phase1 verification failed');
  const vk = await zKey.exportVerificationKey(final,logger);
  if (vk.nPublic !== count) throw new Error('Unexpected public signal count');
  writeFileSync(vkFile,JSON.stringify(vk,null,2)+'\n',{flag:'wx'});
  manifest.circuits[name]={publicCount:count,r1csSha256:hash(r1cs),wasmSha256:hash(wasm),zkeySha256:hash(final),verificationKeySha256:hash(vkFile)};
  console.log('Verified DEVELOPMENT key',name,new Date().toISOString());
}
writeFileSync(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
await globalThis.curve_bn128?.terminate();
