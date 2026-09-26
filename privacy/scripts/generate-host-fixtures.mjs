// Public deterministic TEST keys only. Proofs exercise the real circuit; these
// keys, notes and ledger windows are never used with a live account or funds.
import os from 'node:os';
import { createRequire } from 'node:module';
import { readFileSync,writeFileSync,mkdirSync,existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { groth16 } from 'snarkjs';
import { ed25519 } from '@noble/curves/ed25519.js';
import { poseidon2 } from 'poseidon-lite';
import { BASE8,SparseMerkleTree,dummyNote,ownerHash,podSecretHash,noteCommitment,attestationMessage } from '../src/model.mjs';
import { buildWitness,buildRevocationWitness } from '../src/witness.mjs';
import { pointFor,TEST_RANDOMNESS } from '../test/model-fixtures.mjs';
const cpus=os.cpus();os.cpus=()=>cpus.slice(0,8);
const {derivePublicKey,signMessage}=createRequire(import.meta.url)('@zk-kit/eddsa-poseidon');
const base=resolve(process.argv[2]||'../artifacts/privacy-v2');
const checkOnly=process.argv.includes('--check');
const host=JSON.parse(readFileSync(resolve(base,'host-config.json'),'utf8'));
const out=resolve(base,'proofs');mkdirSync(out,{recursive:true});
const json=value=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n';
const domain=BigInt(host.domain),asset=BigInt(host.assetId),assets=new SparseMerkleTree(8);assets.set(0n,asset);
if(assets.root!==BigInt(host.assetPolicyRoot))throw new Error('Host asset tree mismatch');
const transitionVk=checkOnly?null:JSON.parse(readFileSync(resolve(base,'keys/transition-vk.json'),'utf8'));
const revokeVk=checkOnly?null:JSON.parse(readFileSync(resolve(base,'keys/revocation-vk.json'),'utf8'));
const require=createRequire(import.meta.url);
const calculator=checkOnly?await require(resolve(base,'circuit/transition_js/witness_calculator.js'))(readFileSync(resolve(base,'circuit/transition_js/transition.wasm'))):null;
let tree=new SparseMerkleTree(32),revocations=new SparseMerkleTree(128),cursor=0n,rho=10000n;
const dummy=()=>[...dummyNote(domain,asset)];
function cash(amount,secret=11n,view=7n){const n=dummy();n[3]=amount;n[5]=ownerHash(secret);n[18]=++rho;n[19]=++rho;[n[20],n[21]]=pointFor(view);return n;}
const emptySignature=()=>[...BASE8,0n];
function configuration(){return {domain,epoch:1n,auditor:[BigInt(host.auditorX),BigInt(host.auditorY)],validFrom:1000n,validUntil:1010n,
 inputTree:tree,appendTree:tree,assetTree:assets,revocationTree:revocations,nextIndex:cursor,assetIndex:0n,
 inNotes:[dummy(),dummy()],outNotes:[dummy(),dummy()],inIndices:[0n,0n],authSecrets:[0n,0n],podSecrets:[0n,0n],modes:[0n,0n],
 attestSignatures:[emptySignature(),emptySignature()],bridge:{kind:0n,amount:0n,accountId:0n},fee:{amount:0n,accountId:0n}};}
const chain=[];
async function execute(name,c,bridgeAccount=null,feeAccount=null){
 const file=resolve(out,`${name}.json`);if(existsSync(file))throw new Error('Refusing to overwrite proof fixture');
 const built=buildWitness(c,TEST_RANDOMNESS);const start=Date.now();
 console.log('Proving',name,new Date().toISOString());
 const result=checkOnly?{publicSignals:(await calculator.calculateWitness(built.witness,true)).slice(1,158).map(String)}:
  await groth16.fullProve(built.witness,resolve(base,'circuit/transition_js/transition.wasm'),resolve(base,'keys/transition.zkey'));
 if(result.publicSignals.length!==157||result.publicSignals.some((x,i)=>x!==built.publicInputs[i].toString()))throw new Error('Witness/public signal mismatch');
 if(!checkOnly&&!await groth16.verify(transitionVk,result.publicSignals,result.proof))throw new Error('Real proof verification failed');
 const outputs=c.outNotes.map((n,i)=>({note:n,index:cursor+BigInt(i)}));
 const fixture={name,testOnly:true,...result,bridgeAccount,feeAccount,ciphertextDigest:built.ciphertextDigest,proofDurationMs:Date.now()-start};
 if(!checkOnly)writeFileSync(file,json(fixture),{flag:'wx'});chain.push({name,file:`${name}.json`,bridgeAccount,feeAccount});
 tree=built.nextTree;cursor+=BigInt(c.outNotes.filter(n=>n[3]>0n).length);
 console.log('Verified',name,fixture.proofDurationMs,'ms');return outputs;
}
function input(c,entry,mode=0n,secret=11n){c.inNotes[0]=entry.note;c.inIndices[0]=entry.index;c.modes[0]=mode;c.authSecrets[0]=secret;}
// One continuous note tree. Fees stay public and separately proof-bound.
let c=configuration();c.outNotes[0]=cash(1000n);c.bridge={kind:1n,amount:1000n,accountId:BigInt(host.funderId)};
let [wallet]=await execute('01-deposit',c,host.funder);
c=configuration();input(c,wallet);const pod=cash(400n);pod[4]=1n;pod[8]=podSecretHash(55n);pod[9]=1000n;c.outNotes=[pod,cash(600n)];
let [podEntry,remainder]=await execute('02-create-pod',c);
c=configuration();input(c,podEntry,1n);c.podSecrets[0]=55n;c.outNotes[0]=cash(400n);
let [podCash]=await execute('03-claim-pod',c);
c=configuration();input(c,podCash);c.bridge={kind:2n,amount:395n,accountId:BigInt(host.recipientId)};c.fee={amount:5n,accountId:BigInt(host.feeId)};
await execute('04-withdraw-pod',c,host.recipient,host.fee);
const attestSeed=Buffer.alloc(32,37);
c=configuration();input(c,remainder);const trigger=cash(200n);trigger[4]=2n;trigger[6]=ownerHash(22n);trigger[10]=1010n;trigger[11]=888n;[trigger[12],trigger[13]]=derivePublicKey(attestSeed);c.outNotes=[trigger,cash(400n)];
let [triggerEntry,remaining]=await execute('05-create-trigger',c);
c=configuration();input(c,triggerEntry,2n);const sig=signMessage(attestSeed,attestationMessage(triggerEntry.note));c.attestSignatures[0]=[...sig.R8,sig.S];c.outNotes[0]=cash(200n);
let [triggerCash]=await execute('06-attest-trigger',c);
c=configuration();input(c,triggerCash);c.bridge={kind:2n,amount:200n,accountId:BigInt(host.recipientId)};
await execute('07-withdraw-trigger',c,host.recipient);
const revokeSeed=new Uint8Array(32).fill(23),revokePublic=ed25519.getPublicKey(revokeSeed);
const fieldBytes=n=>Buffer.from(n.toString(16).padStart(64,'0'),'hex');
const tagDigest=createHash('sha256').update(Buffer.concat([Buffer.from('AGYION_REVOKE_KEY_V2\0'),fieldBytes(domain),revokePublic])).digest('hex');
const tag=poseidon2([BigInt('0x'+tagDigest.slice(0,32)),BigInt('0x'+tagDigest.slice(32))]);
c=configuration();input(c,remaining);const envoy=cash(100n);envoy[4]=3n;envoy[7]=ownerHash(33n);envoy[9]=1000n;envoy[10]=1020n;envoy[14]=40n;envoy[15]=2n;envoy[16]=tag;envoy[17]=ownerHash(44n);[envoy[22],envoy[23]]=pointFor(19n);c.outNotes=[envoy,cash(300n)];
let [grant,lastWallet]=await execute('08-create-envoy',c);
c=configuration();input(c,grant,4n,33n);const successor=grant.note.slice();successor[3]=70n;successor[15]=1n;successor[18]=++rho;successor[19]=++rho;c.outNotes=[cash(30n,44n,19n),successor];
let [payment1,grant2]=await execute('09-spend-envoy',c);
c=configuration();input(c,grant2,4n,33n);c.outNotes=[cash(20n,44n,19n),cash(50n)];
let [payment2,ownerChange]=await execute('10-exhaust-envoy',c);
c=configuration();input(c,payment1,0n,44n);c.inNotes[1]=payment2.note;c.inIndices[1]=payment2.index;c.authSecrets[1]=44n;c.bridge={kind:2n,amount:50n,accountId:BigInt(host.recipientId)};
await execute('11-withdraw-envoy-recipient',c,host.recipient);
// Create a new grant and revoke before owner reclaim. A fresh grant must use a
// new revoke key in production; sharing here deliberately tests tag-wide revoke.
c=configuration();input(c,lastWallet);const revocable=[...envoy];revocable[18]=++rho;revocable[19]=++rho;c.outNotes=[revocable,cash(200n)];
let [revocableEntry,refundWallet]=await execute('12-create-revocable-envoy',c);
const revoke=buildRevocationWitness({domain,tree:revocations,tag});
console.log('Proving revocation',new Date().toISOString());
const revokeCalculator=checkOnly?await require(resolve(base,'circuit/revocation_js/witness_calculator.js'))(readFileSync(resolve(base,'circuit/revocation_js/revocation.wasm'))):null;
const revokeResult=checkOnly?{publicSignals:(await revokeCalculator.calculateWitness(revoke.witness,true)).slice(1,5).map(String)}:
 await groth16.fullProve(revoke.witness,resolve(base,'circuit/revocation_js/revocation.wasm'),resolve(base,'keys/revocation.zkey'));
if(revokeResult.publicSignals.some((x,i)=>x!==revoke.publicInputs[i].toString())||(!checkOnly&&!await groth16.verify(revokeVk,revokeResult.publicSignals,revokeResult.proof)))throw new Error('Revocation proof failed');
const revokeMessage=Buffer.concat([Buffer.from('AGYION_REVOKE_V2\0'),...revoke.publicInputs.map(fieldBytes)]);
if(!checkOnly)writeFileSync(resolve(out,'13-revoke-envoy.json'),json({name:'13-revoke-envoy',testOnly:true,...revokeResult,ownerKey:Buffer.from(revokePublic).toString('hex'),signature:Buffer.from(ed25519.sign(revokeMessage,revokeSeed)).toString('hex')}),{flag:'wx'});
chain.push({name:'13-revoke-envoy',file:'13-revoke-envoy.json',revocation:true});revocations=revoke.nextTree;
c=configuration();input(c,revocableEntry,5n);c.outNotes[0]=cash(100n);await execute('14-reclaim-revoked-envoy',c);
c=configuration();input(c,refundWallet);const refundTrigger=cash(200n);refundTrigger[4]=2n;refundTrigger[6]=ownerHash(22n);refundTrigger[10]=999n;refundTrigger[11]=888n;[refundTrigger[12],refundTrigger[13]]=derivePublicKey(attestSeed);c.outNotes[0]=refundTrigger;
let [refundable]=await execute('15-create-expired-trigger',c);
c=configuration();input(c,refundable,3n,22n);c.outNotes[0]=cash(200n,22n);let [refundCash]=await execute('16-refund-trigger',c);
c=configuration();input(c,refundCash,0n,22n);c.bridge={kind:2n,amount:200n,accountId:BigInt(host.recipientId)};
await execute('17-withdraw-refund',c,host.recipient);
if(!checkOnly)writeFileSync(resolve(out,'chain.json'),json({testOnly:true,host,steps:chain,expectedBalances:{pool:'150',recipient:'845',fee:'5',funderDelta:'-1000'},finalRoot:tree.root,finalIndex:cursor,finalRevocationRoot:revocations.root}),{flag:'wx'});
console.log(checkOnly?'Actual WASM witness chain checked (NO proofs generated)':'All genuine host fixtures verified',chain.length);
await globalThis.curve_bn128?.terminate();
