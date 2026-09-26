// Development harness only. All trees, accounts, balances and ledger windows
// below are synthetic. Private randomness originates in this browser; this
// module never submits a transaction or sends witness/opening data to HTTP.
import {babyjubjub} from '@noble/curves/misc.js';
import {derivePublicKey,signMessage} from '@zk-kit/eddsa-poseidon';
import {createLocalGroth16WorkerProver} from '../src/prover-worker-host.mjs';
import {createNote24,randomFieldSecret,buildWitness,decryptEnvelope} from '../src/witness.mjs';
import {dummyNote,ownerHash,podSecretHash,noteCommitment,attestationMessage,SparseMerkleTree} from '../src/model.mjs';
import {createLocalPrivacyClient} from '../src/client.mjs';
import {createPrivacyVault,exportVaultKeys,backupPrivacyVault,checkPrivacyVaultBackup,restorePrivacyVault,forgetPrivacyVault} from '../src/vault.mjs';
import {domainField,revocationTag} from '../src/identity.mjs';

const G=babyjubjub.Point.BASE;
const point=scalar=>{const p=G.multiply(scalar);return[p.x,p.y];};
const makeNoteForDomain=domain=>(amount,owner,view,fields={})=>{
 const n=[...dummyNote(domain,202n)];n[3]=amount;n[5]=owner;[n[20],n[21]]=point(view);
 for(const [index,value] of Object.entries(fields))n[Number(index)]=value;
 return createNote24(n);
};
export function createSyntheticBrowserCases(){
 const scope={domain:{networkId:'11'.repeat(32),contractId:'22'.repeat(32)},epoch:'1',profileId:'33'.repeat(32)};
 const domain=domainField(scope.domain),makeNote=makeNoteForDomain(domain);
 const vault=createPrivacyVault(scope,[{id:'41'.repeat(32),kind:'pod'},{id:'42'.repeat(32),kind:'envoy'}]);
 const keys=exportVaultKeys(vault),[podGrant,envoyGrant]=keys.grants;
 // Independent test actors have their own vaults. They are not part of the
 // owner's complete backup and no backup claim is made for those actors.
 const actorVaults=Array.from({length:4},()=>createPrivacyVault(scope));
 const [auditorKeys,refundKeys,agentKeys,recipientKeys]=actorVaults.map(exportVaultKeys);
 const owner=keys.spendingSecret,view=keys.viewScalar,pod=podGrant.podSecret,auditor=auditorKeys.viewScalar;
 const refund=refundKeys.spendingSecret,agent=agentKeys.spendingSecret,recipient=recipientKeys.spendingSecret,recipientView=recipientKeys.viewScalar;
 const envoyRevocationTag=revocationTag(domain,vault.public.grants[1].revocationPublicKey);
 const attesterSeed=globalThis.crypto.getRandomValues(new Uint8Array(32));
 const A=point(auditor),assetTree=new SparseMerkleTree(8);assetTree.set(2n,202n);
 const profile={domain,epoch:1n,assetPolicyRoot:assetTree.root,auditor:A};
 const base=()=>({domain,epoch:1n,auditor:A,validFrom:100n,validUntil:110n,
  inputTree:new SparseMerkleTree(32),appendTree:new SparseMerkleTree(32),assetTree,revocationTree:new SparseMerkleTree(128),
  nextIndex:0n,assetIndex:2n,inNotes:[dummyNote(domain,202n),dummyNote(domain,202n)],outNotes:[dummyNote(domain,202n),dummyNote(domain,202n)],
  inIndices:[0n,0n],authSecrets:[0n,0n],podSecrets:[0n,0n],modes:[0n,0n],attestSignatures:[[G.x,G.y,0n],[G.x,G.y,0n]],
  bridge:{kind:0n,amount:0n,accountId:0n},fee:{amount:0n,accountId:0n}});
 const spend=(note,mode,authority)=>{
  const c=base();c.inNotes[0]=note;c.inputTree.set(0n,noteCommitment(note));c.appendTree=c.inputTree.clone();
  c.nextIndex=1n;c.modes[0]=mode;c.authSecrets[0]=authority;return c;
 };
 const deposit=base();deposit.outNotes[0]=makeNote(100n,ownerHash(owner),view);deposit.bridge={kind:1n,amount:100n,accountId:303n};
 const podConfig=spend(makeNote(100n,ownerHash(owner),podGrant.viewScalar,{4:1n,8:podSecretHash(pod),9:90n}),1n,owner);
 podConfig.podSecrets[0]=pod;podConfig.outNotes[0]=makeNote(100n,ownerHash(owner),view);
 const [attesterX,attesterY]=derivePublicKey(attesterSeed);
 const trigger=spend(makeNote(100n,ownerHash(owner),view,{4:2n,6:ownerHash(refund),10:120n,11:randomFieldSecret(),12:attesterX,13:attesterY}),2n,owner);
 const sig=signMessage(attesterSeed,attestationMessage(trigger.inNotes[0]));trigger.attestSignatures[0]=[...sig.R8,sig.S];
 trigger.outNotes[0]=makeNote(100n,ownerHash(owner),view);attesterSeed.fill(0);
 const [targetX,targetY]=point(recipientView);
 const envoy=spend(makeNote(100n,ownerHash(owner),envoyGrant.viewScalar,{4:3n,7:ownerHash(agent),9:90n,10:120n,14:40n,15:2n,16:envoyRevocationTag,17:ownerHash(recipient),22:targetX,23:targetY}),4n,agent);
 envoy.outNotes[0]=makeNote(30n,ownerHash(recipient),recipientView);
 const successor=[...envoy.inNotes[0]];successor[3]=70n;successor[15]=1n;successor[18]=0n;successor[19]=0n;envoy.outNotes[1]=createNote24(successor);
 return{profile,cases:[
  {name:'Deposit',config:deposit,views:[view]},
  {name:'Pod claim',config:podConfig,views:[view]},
  {name:'Trigger attestation',config:trigger,views:[view]},
  {name:'Envoy payment',config:envoy,views:[recipientView,envoyGrant.viewScalar]},
 ],vault,scope,actorVaults,context:{domain:scope.domain,epoch:scope.epoch,ownerId:vault.ownerId}};
}

// CPU-only bundle smoke check. It exposes counts, never the generated opening,
// keys or witness, and cannot stand in for the actual worker proof run.
export function validateSyntheticBrowserCases(){
 const fixture=createSyntheticBrowserCases();
 try{return fixture.cases.map(({name,config})=>{
   const result=buildWitness(config);
   if(result.publicInputs.length!==157)throw new Error('EXACT_PUBLIC_INPUTS_REQUIRED');
   return{name,publicCount:result.publicInputs.length,modelValidated:true};
  });
 }finally{[fixture.vault,...fixture.actorVaults].forEach(forgetPrivacyVault);}
}

async function run(){
 const report={status:'running',stage:'artifacts',checks:[],flows:[],timings:{},workerModel:'one dedicated worker; single-thread proving and Noble verification; no navigator override',
  boundary:'Synthetic local trees and time windows; generated test units. Complete owner vault backup includes Pod and Envoy grant keys; independent test actor vaults are outside that backup. No chain call, custody service, accepted transaction or production privacy claim.'};
 globalThis.__localProverReport=report;
 const status=document.querySelector('#status'),details=document.querySelector('#result');
 const render=()=>{details.textContent=JSON.stringify(report,null,2);};
 function check(name,value){if(value!==true)throw new Error('BROWSER_CHECK_FAILED');report.checks.push({name,passed:true});render();}
 function stage(name){report.stage=name;status.textContent=name;render();}
 let adapter,fixture,restoredVault;
 try{
  const settings=await fetch('/case.json').then(r=>{if(!r.ok)throw new Error();return r.json();});
  const load=async url=>{const r=await fetch(url);if(!r.ok)throw new Error();return new Uint8Array(await r.arrayBuffer());};
  const [wasm,zkey,verificationKey]=await Promise.all(['/circuit.wasm','/circuit.zkey','/verification-key.json'].map(load));
  const start=performance.now();stage('Initializing local worker');
  adapter=await createLocalGroth16WorkerProver({wasm,zkey,verificationKey,pins:settings.pins,publicCount:157});
  report.timings.workerInitMs=performance.now()-start;
  fixture=createSyntheticBrowserCases();
  const password=Array.from(globalThis.crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
  stage('Encrypting and restoring the local key vault');
  const backup=await backupPrivacyVault(fixture.vault,password);
  const checkedBackup=await checkPrivacyVaultBackup(fixture.vault,backup,password);
  check('complete vault backup checked including both grant keysets',checkedBackup.kind==='LocallyCheckedKeyBackup'&&checkedBackup.grantIds.length===2);
  restoredVault=await restorePrivacyVault(backup,password,fixture.scope,fixture.vault.ownerId);
  check('encrypted vault restores the exact local keys',JSON.stringify(restoredVault.public)===JSON.stringify(fixture.vault.public));
  const keys=exportVaultKeys(restoredVault),[podGrant,envoyGrant]=keys.grants;
  check('original complete vault forgotten',forgetPrivacyVault(fixture.vault));
  let refused=false;try{await restorePrivacyVault(backup,password+'x',fixture.scope,restoredVault.ownerId);}catch{refused=true;}
  check('wrong vault password rejected',refused);
  for(const item of fixture.cases){
   // Spend using the restored vault values, not just a matching backup label.
   if(item.name==='Pod claim'){
    item.config.authSecrets[0]=keys.spendingSecret;item.config.podSecrets[0]=podGrant.podSecret;
   }else if(item.name==='Trigger attestation')item.config.authSecrets[0]=keys.spendingSecret;
   else if(item.name==='Envoy payment')item.config.authSecrets[0]=exportVaultKeys(fixture.actorVaults[2]).spendingSecret;
   const flow={name:item.name,status:'running'};report.flows.push(flow);stage(item.name+': preparing private draft');
   const client=createLocalPrivacyClient({profile:fixture.profile,prove:adapter.prove,verify:adapter.verify});
   let draft=client.prepare(item.config);
   if(item.name==='Pod claim'){
    const encryptedDraft=await client.backupDraft(draft,password,fixture.context),before=draft.publicSignals;
    check('original Pod draft forgotten',client.forget(draft));
    draft=await client.restoreDraft(encryptedDraft,password,fixture.context);
    check('restored Pod draft preserves all157 public bindings',draft.publicSignals.every((field,i)=>field===before[i]));
   }
   stage(item.name+': generating and verifying real proof');const began=performance.now();
   const result=await client.prepareSubmission(draft);flow.proveAndVerifyMs=performance.now()-began;
   check(item.name+': exact157 public signals',result.publicSignals.length===157&&result.publicSignals.every((n,i)=>n===draft.publicSignals[i]));
   check(item.name+': canonical256-byte proof',/^[0-9a-f]{512}$/.test(result.proof));
   check(item.name+': explicitly unsubmitted',result.kind==='UnsubmittedPrivateTransition'&&!Object.hasOwn(result,'accepted'));
   const verifyBegan=performance.now();
   check(item.name+': bounded standalone verification',await adapter.verify(result.proof,result.publicSignals)===true);
   flow.verifyMs=performance.now()-verifyBegan;
   const changed=result.publicSignals.slice();changed[0]=changed[0]==='102'?'103':'102';
   check(item.name+': changed public statement rejected',await adapter.verify(result.proof,changed)===false);
   const fields=result.publicSignals.map(BigInt),record={recordId:result.ciphertextDigest,core:fields.slice(0,23),encrypted:fields.slice(23)};
   const views=item.name==='Envoy payment'?[exportVaultKeys(fixture.actorVaults[3]).viewScalar,envoyGrant.viewScalar]:[keys.viewScalar];
   // The fixture anchors its own public bytes. This verifies local recovery,
   // not independent archive authenticity or a ledger inclusion claim.
   const notes=client.scanRecord(record,{recordId:record.recordId,ciphertextDigest:record.recordId,core:record.core},views);
   check(item.name+': recovered each actual output note',notes.length===item.views.length&&notes.every((h,i)=>client.readNote(h).every((n,j)=>n===item.config.outNotes[i][j])));
   if(notes.length===1)check(item.name+': dummy reveals no asset',decryptEnvelope(record.core,record.encrypted,1,1n).every(n=>n===0n));
   if(item.name==='Pod claim'){
    const encryptedNotes=await client.backupNotes(notes,password,fixture.context);notes.forEach(note=>client.forget(note));
    const restored=await client.restoreNotes(encryptedNotes,password,fixture.context);
    check('restored Pod note opening remains commitment-bound',restored.length===1&&client.readNote(restored[0]).every((n,i)=>n===item.config.outNotes[0][i]));
   }
   flow.status='passed';render();
  }
  stage('Cancelling an actual in-flight proof');
  const cancelWitness=buildWitness(fixture.cases[0].config).witness;
  let responseBeforeCancel=false;
  const cancellation=adapter.prove(cancelWitness).then(()=>{responseBeforeCancel=true;return'UNEXPECTED_PROOF_RESULT';},error=>error.message);
  await new Promise(resolve=>setTimeout(resolve,50));
  check('cancellation starts while proof remains pending',responseBeforeCancel===false);
  adapter.dispose();
  check('in-flight worker termination rejects without a proof result',await cancellation==='LOCAL_WORKER_CLOSED');
  check('closed worker refuses further verification',await adapter.verify('00',[])===false);
  report.publicCount=157;report.proofBytes=256;report.status='passed';stage('Four local proof flows, vault recovery and cancellation verified');
 }catch{report.status='failed';report.failedStage=report.stage;report.error='LOCAL_BROWSER_PROVER_FAILED';stage('Local proof check failed');}
 finally{
  adapter?.dispose();
  [restoredVault,fixture?.vault,...(fixture?.actorVaults||[])].filter(Boolean).forEach(forgetPrivacyVault);
  render();
 }
}
if(typeof document!=='undefined')void run();
