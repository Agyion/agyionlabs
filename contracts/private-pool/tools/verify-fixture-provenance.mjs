// Verify that committed PUBLIC proof fixtures belong to the current circuit
// source and immutable verifier pins. Actual proof equations run in Rust tests.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {keyDigest} from './pin-verifiers.mjs';

const pool=fileURLToPath(new URL('../',import.meta.url));
const root=fileURLToPath(new URL('../../../',import.meta.url));
const fixtures=resolve(pool,'fixtures/verified-v2');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const load=file=>JSON.parse(readFileSync(file,'utf8'));
const ensure=(test,message)=>{if(!test)throw new Error(message);};
const manifest=load(resolve(fixtures,'keys/manifest.json'));
ensure(manifest.schema==='agyion-private-development-artifacts-v2'&&manifest.developmentOnly===true&&manifest.phase1.verified===true,'Wrong fixture provenance');
ensure(hash(readFileSync(resolve(root,'privacy/package-lock.json')))===manifest.compilation.lockSha256,'Dependency lock differs from compilation');
const names=['transition.circom','revocation.circom','primitives.circom','poseidon-encryption.circom'];
ensure(Object.keys(manifest.compilation.sources).length===names.length,'Unexpected circuit source list');
for(const name of names)ensure(hash(readFileSync(resolve(root,'privacy/circuits',name)))===manifest.compilation.sources[name],`Circuit source differs: ${name}`);
const pinSource=readFileSync(resolve(pool,'src/pins.rs'),'utf8');
for(const [name,count,pin] of [['transition',157,'MAIN_VK_HASH'],['revocation',4,'REVOCATION_VK_HASH']]){
 const bytes=readFileSync(resolve(fixtures,`keys/${name}-vk.json`));
 ensure(hash(bytes)===manifest.circuits[name].verificationKeySha256,'Verification-key artifact mismatch');
 const values=pinSource.match(new RegExp(`${pin}:[^=]+=[\\s]*\\[([^\\]]+)\\]`))?.[1]?.match(/0x[0-9a-f]{2}/g);
 ensure(values?.length===32&&keyDigest(JSON.parse(bytes),count).toString('hex')===values.map(v=>v.slice(2)).join(''),'Compiled verifier pin mismatch');
}
const chain=load(resolve(fixtures,'proofs/chain.json'));
ensure(chain.testOnly===true&&chain.steps.length===17,'Wrong public proof chain');
for(const step of chain.steps){
 ensure(/^[0-9]{2}-[a-z-]+\.json$/.test(step.file),'Unexpected proof fixture path');
 const proof=load(resolve(fixtures,'proofs',step.file));
 ensure(proof.testOnly===true&&proof.name===step.name&&proof.publicSignals.length===(step.revocation?4:157),'Wrong public proof fixture');
}
console.log('Current circuits, dependency lock, actual verification keys and source pins match the public development proof fixtures.');
