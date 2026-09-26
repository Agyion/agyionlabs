// Actual local key backup, BabyJub/Poseidon ciphertexts and archive replay.
// The in-memory reader is a TEST accepted-ledger assumption, not a proof,
// deployed pool, RPC authentication mechanism or live funding evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPrivacyVault,exportVaultKeys,backupPrivacyVault,restorePrivacyVault,forgetPrivacyVault} from '../src/vault.mjs';
import {createLocalPrivacyClient} from '../src/client.mjs';
import {domainField} from '../src/identity.mjs';
import {recoverPrivateArchive,RECOVERY_ARCHIVE_LIMIT} from '../src/recovery.mjs';
import {buildWitness,buildRevocationWitness} from '../src/witness.mjs';
import {dummyNote,nullifier,podSecretHash} from '../src/model.mjs';
import {makeDepositConfig,makeCashNote,TEST_RANDOMNESS} from './model-fixtures.mjs';

const scope={domain:{networkId:'11'.repeat(32),contractId:'22'.repeat(32)},epoch:'1',profileId:'33'.repeat(32)};
const password='local test recovery flow password';
const clone=structuredClone,DOMAIN=domainField(scope.domain);
function cash(...args){const n=makeCashNote(...args);n[1]=DOMAIN;return n;}
function baseConfig(){const c=makeDepositConfig();c.domain=DOMAIN;for(const key of ['inNotes','outNotes'])c[key]=c[key].map(n=>n.map((v,i)=>i===1?DOMAIN:v));return c;}
function fixture(grantCount=1){
 const specs=Array.from({length:grantCount},(_,i)=>({id:BigInt(i+1).toString(16).padStart(64,'0'),kind:'pod'}));
 const vault=createPrivacyVault(scope,specs),keys=exportVaultKeys(vault),grant=keys.grants.at(-1);
 const c=baseConfig();
 const cashNote=cash(60n,keys.spendingSecret,333n,keys.viewScalar);
 const pod=cash(40n,keys.spendingSecret,334n,grant.viewScalar);
 pod[4]=1n;pod[8]=podSecretHash(grant.podSecret);pod[9]=90n;c.outNotes=[cashNote,pod];
 const deposit=buildWitness(c,TEST_RANDOMNESS);
 const s=baseConfig();s.inputTree=deposit.nextTree;s.appendTree=deposit.nextTree;s.nextIndex=2n;
 s.inNotes=[cashNote,dummyNote(DOMAIN,202n)];s.authSecrets=[keys.spendingSecret,0n];
 s.outNotes=[cash(10n,88n,335n,89n),cash(50n,keys.spendingSecret,336n,keys.viewScalar)];
 s.bridge={kind:0n,amount:0n,accountId:0n};const spend=buildWitness(s,TEST_RANDOMNESS);
 const x=baseConfig();x.inputTree=spend.nextTree;x.appendTree=spend.nextTree;x.nextIndex=4n;
 x.inNotes=[s.outNotes[1],dummyNote(DOMAIN,202n)];x.inIndices=[3n,0n];x.authSecrets=[keys.spendingSecret,0n];
 x.outNotes=[dummyNote(DOMAIN,202n),dummyNote(DOMAIN,202n)];x.bridge={kind:2n,amount:50n,accountId:303n};
 const exit=buildWitness(x,TEST_RANDOMNESS),revoked=buildRevocationWitness({domain:DOMAIN,tree:c.revocationTree,tag:99n});
 return {vault,profile:{domain:c.domain,assetPolicyRoot:c.assetTree.root,epoch:c.epoch,auditor:c.auditor},
  records:[deposit,spend,exit].map(b=>({recordId:b.ciphertextDigest,publicInputs:b.publicInputs})),
  revocations:[{tag:99n,oldRoot:revoked.publicInputs[1],newRoot:revoked.publicInputs[2]}],
  state:{root:exit.nextTree.root,nextIndex:4n,recordCount:3n,revocationCount:1n,revocationRoot:revoked.nextTree.root,snapshotId:'88'.repeat(32)}};
 // No private note opening or raw key is returned by this history builder.
}
function reader(f,overrides={}){
 const check=o=>{assert.equal(o.snapshotId,f.state.snapshotId);assert.equal('viewScalar' in o,false)};
 return {readState:async()=>clone(f.state),
  readRecordIdAt:async(i,o)=>{check(o);return f.records[Number(i)]?.recordId},
  readRecord:async(id,o)=>{check(o);return clone(f.records.find(r=>r.recordId===id))},
  readRevocationAt:async(i,o)=>{check(o);return clone(f.revocations[Number(i)])},...overrides};
}
function clientFor(f){return createLocalPrivacyClient({profile:f.profile,
 prove:async()=>assert.fail('Recovery must not call a prover'),verify:async()=>assert.fail('Recovery must not verify or claim a proof')});}
const source=fixture();
const args=(f=source,extra={})=>({profile:f.profile,scope,vault:f.vault,client:clientFor(f),reader:reader(f),...extra});

test('a saved complete key backup recovers the sole unspent grant note after a new session',async t=>{
 const f=fixture(),originalPublic=f.vault.public,ownerId=f.vault.ownerId;
 const directory=await mkdtemp(join(tmpdir(),'agyion-recovery-test-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const backup=await backupPrivacyVault(f.vault,password),file=join(directory,'keys.encrypted.json');
 await writeFile(file,JSON.stringify(backup),{mode:0o600});
 forgetPrivacyVault(f.vault);assert.throws(()=>exportVaultKeys(f.vault));
 const restored=await restorePrivacyVault(JSON.parse(await readFile(file,'utf8')),password,scope,ownerId);
 t.after(()=>forgetPrivacyVault(restored));assert.deepEqual(restored.public,originalPublic);
 const client=clientFor(f),result=await recoverPrivateArchive(args(f,{vault:restored,client}));
 assert.equal(result.kind,'RecoveredPrivateArchive');assert.equal('accepted' in result,false);
 assert.equal(result.notes.length,1);assert.equal(result.notes[0].index,1n);
 const note=client.readNote(result.notes[0].note),keys=exportVaultKeys(restored);
 assert.equal(note[3],40n);assert.equal(note[4],1n);assert.equal(note[8],podSecretHash(keys.grants[0].podSecret));
 assert.equal(result.archive.isSpent(nullifier(note)),false);
 assert.equal(result.archive.noteTree.get(1n),BigInt(result.notes[0].note.commitment));
 assert.equal(result.archive.recordCount,3n);assert.equal(result.archive.nextIndex,4n);
 assert.equal(result.archive.revocationCount,1n);assert.equal(result.archive.revocationTree.root,f.state.revocationRoot);
 // Full restored key material plus reconstructed membership is sufficient to
 // PREPARE a new local Pod claim. No proof or chain submission occurs here.
 const claim=baseConfig();claim.inputTree=result.archive.noteTree;claim.appendTree=result.archive.noteTree;
 claim.revocationTree=result.archive.revocationTree;claim.nextIndex=result.archive.nextIndex;
 claim.inNotes=[note,dummyNote(DOMAIN,202n)];claim.inIndices=[1n,0n];claim.authSecrets=[keys.spendingSecret,0n];
 claim.podSecrets=[keys.grants[0].podSecret,0n];claim.modes=[1n,0n];claim.bridge={kind:0n,amount:0n,accountId:0n};
 claim.outNotes=[cash(40n,keys.spendingSecret,998n,keys.viewScalar),dummyNote(DOMAIN,202n)];
 const draft=client.prepare(claim);assert.equal(draft.kind,'LocalPrivateDraft');client.forget(draft);
});

test('every indexed entry is mandatory, including a zero-output exit with an unchanged tree root',async()=>{
 assert.equal(source.records[1].publicInputs[10],source.records[2].publicInputs[10]);
 for(const overrides of [
  {readRecordIdAt:async i=>i===2n?undefined:source.records[Number(i)].recordId},
  {readRecord:async id=>id===source.records[1].recordId?null:clone(source.records.find(r=>r.recordId===id))},
  {readRevocationAt:async()=>undefined},
 ])await assert.rejects(recoverPrivateArchive(args(source,{reader:reader(source,overrides)})),/MISSING/);
});

test('wrong identities, ciphertexts, ordering, roots and counts fail without silent skips',async()=>{
 for(const mutation of ['recordId','cipher','core','reorder','root','nextIndex','revocationRoot','revocationCount']){
  const f={...source,records:clone(source.records),revocations:clone(source.revocations),state:clone(source.state)};
  if(mutation==='recordId')f.records[0].recordId='77'.repeat(32);
  else if(mutation==='cipher')f.records[0].publicInputs[23]+=1n;
  else if(mutation==='core')f.records[0].publicInputs[14]+=1n;
  else if(mutation==='reorder')[f.records[0],f.records[1]]=[f.records[1],f.records[0]];
  else f.state[mutation]+=1n;
  await assert.rejects(recoverPrivateArchive(args(f)),undefined,mutation);
 }
 const base=reader(source);await assert.rejects(recoverPrivateArchive(args(source,{reader:{...base,
  readRecord:async(id,o)=>({...await base.readRecord(id,o),recordId:'77'.repeat(32)})}})),/BINDING_MISMATCH/);
});

test('changed final state or checkpoint invalidates all new handles while preserving preexisting notes',async()=>{
 const client=clientFor(source),r=source.records[0],core=r.publicInputs.slice(0,23),encrypted=r.publicInputs.slice(23);
 const preexisting=client.scanRecord({recordId:r.recordId,core,encrypted},{recordId:r.recordId,ciphertextDigest:r.recordId,core},[exportVaultKeys(source.vault).viewScalar])[0];
 for(const changed of [{snapshotId:'99'.repeat(32)},{recordCount:4n},{root:1n}]){
  const created=[],wrapped={...client,scanRecord(...a){const found=client.scanRecord(...a);created.push(...found);return found}};
  let reads=0;const io=reader(source,{readState:async()=>({...clone(source.state),...++reads>1?changed:{}})});
  await assert.rejects(recoverPrivateArchive(args(source,{client:wrapped,reader:io})),/RECOVERY_SNAPSHOT_CHANGED/);
  assert.ok(created.length>=3);for(const handle of created)assert.throws(()=>client.readNote(handle),/UNKNOWN_PRIVATE_NOTE/);
  assert.equal(client.readNote(preexisting)[3],60n);
 }
 client.forget(preexisting);
});

test('an abort interrupts pending reads and removes this attempt\'s handles without releasing partial results',async()=>{
 const controller=new AbortController(),client=clientFor(source),created=[];let pending;
 const entered=new Promise(resolve=>{pending=resolve});
 const io=reader(source,{readRecordIdAt:async i=>{if(i===1n){pending();return new Promise(()=>{})}return source.records[Number(i)].recordId}});
 const wrapped={...client,scanRecord(...a){const found=client.scanRecord(...a);created.push(...found);return found}};
 const result=recoverPrivateArchive(args(source,{client:wrapped,reader:io}),controller.signal);
 await entered;controller.abort('Do not copy this arbitrary abort reason into an error');
 await assert.rejects(result,{code:'RECOVERY_ABORTED'});assert.ok(created.length>0);
 for(const handle of created)assert.throws(()=>client.readNote(handle));
 let read=false;await assert.rejects(recoverPrivateArchive(args(source,{reader:reader(source,{readState:async()=>{read=true;return source.state}})}),controller.signal),{code:'RECOVERY_ABORTED'});
 assert.equal(read,false);
});

test('all vault keys are scanned in bounded batches and each commitment is returned once',async()=>{
 const f=fixture(32),client=clientFor(f),sizes=[];
 const wrapped={...client,scanRecord(...a){sizes.push(a[2].length);return client.scanRecord(...a)}};
 const result=await recoverPrivateArchive(args(f,{client:wrapped}));
 assert.equal(result.notes.length,1);assert.equal(client.readNote(result.notes[0].note)[3],40n);
 assert.deepEqual(sizes,[32,1,32,1,32,1]);assert.equal(new Set(result.notes.map(n=>n.note.commitment)).size,result.notes.length);
 forgetPrivacyVault(f.vault);
});

test('scope mismatch, bounded workloads, malformed snapshots and failed reads reject before returning notes',async()=>{
 let reads=0;const io=reader(source,{readState:async()=>{reads++;return clone(source.state)}});
 for(const changed of [{...scope,profileId:'44'.repeat(32)},{...scope,epoch:'2'},
  {...scope,domain:{...scope.domain,networkId:'55'.repeat(32)}}])await assert.rejects(recoverPrivateArchive(args(source,{scope:changed,reader:io})),/BINDING_MISMATCH/);
 assert.equal(reads,0);
 for(const changed of [{domain:101n},{epoch:2n}])await assert.rejects(recoverPrivateArchive(args(source,{profile:{...source.profile,...changed},reader:io})),/BINDING_MISMATCH/);
 assert.equal(reads,0);
 for(const key of ['recordCount','revocationCount'])await assert.rejects(recoverPrivateArchive(args(source,{reader:reader(source,{readState:async()=>({...source.state,[key]:RECOVERY_ARCHIVE_LIMIT+1n})})})),/RECOVERY_LIMIT_EXCEEDED/);
 for(const changed of [{nextIndex:(1n<<32n)+1n},{snapshotId:'not-an-authenticated-checkpoint'},{recordCount:3}])
  await assert.rejects(recoverPrivateArchive(args(source,{reader:reader(source,{readState:async()=>({...source.state,...changed})})})));
 await assert.rejects(recoverPrivateArchive(args(source,{reader:reader(source,{readState:async()=>{throw new Error('provider URL or secret data')}})})),{code:'ARCHIVE_READ_FAILED'});
});
