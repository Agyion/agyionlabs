import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivacyVault, addVaultGrant, exportVaultKeys, backupPrivacyVault,restorePrivacyVault,checkPrivacyVaultBackup } from '../src/vault.mjs';
import { recoverPrivateArchive } from '../src/recovery.mjs';
import { createLocalPrivacyClient } from '../src/client.mjs';
import { planPrivateCommand } from '../src/planner.mjs';
import { receiveDescriptor,exportPrivateCredential,checkExportedPrivateCredential,importPrivateCredential,readPrivateCredential,createTriggerAttester,backupTriggerAttester,checkTriggerAttesterBackup,restoreTriggerAttester,signTriggerAttestation,forgetTriggerAttester } from '../src/credentials.mjs';
import { ed25519 } from '@noble/curves/ed25519.js';
import { hexToBytes,concatBytes } from '@noble/hashes/utils.js';
import { domainField, assetField } from '../src/identity.mjs';
import { SparseMerkleTree, noteCommitment, nullifier } from '../src/model.mjs';
import { buildWitness,revocationLeaf } from '../src/witness.mjs';
const hex = n => n.toString(16).padStart(64,'0');
function fixture() {
 const scope={domain:{networkId:hex(1),contractId:hex(2)},epoch:'1',profileId:hex(3)};
 const vault=createPrivacyVault(scope),recipient=createPrivacyVault(scope),asset=hex(4);
 const assetTree=new SparseMerkleTree(8);assetTree.set(0n,assetField(asset));
 const profile={domain:domainField(scope.domain),assetPolicyRoot:assetTree.root,epoch:1n,auditor:exportPoint(recipient)};
 let noteTree=new SparseMerkleTree(32),revocationTree=new SparseMerkleTree(128),nextIndex=0n,spent=new Set(),notes=[],records=[];
 const state={scope,profile,assets:[asset],source:{kind:'account',id:hex(5)},ledger:BigInt(Math.floor(Date.now()/1000)%100000),vault,credentials:[]};
 const usedGrantIds=()=>state.vault.public.grants.filter(g=>notes.some(n=>n.note[20].toString()===g.viewPoint[0]&&n.note[21].toString()===g.viewPoint[1])).map(g=>g.id);
 const plan=command=>planPrivateCommand({...state,command,usedGrantIds:usedGrantIds(),archive:{kind:'RebuiltArchiveSnapshot',noteTree,revocationTree,nextIndex,isSpent:n=>spent.has(n)},notes});
 const accept=p=>{const result=buildWitness(p.configuration);for(const n of p.configuration.inNotes)if(n[3])spent.add(nullifier(n));noteTree=result.nextTree;for(const n of p.configuration.outNotes)if(n[3])notes.push({id:noteCommitment(n).toString(),index:nextIndex++,note:n});records.push({recordId:result.ciphertextDigest,publicInputs:result.publicInputs});return result;};
 const revoke=p=>{const [domain,oldRoot,newRoot,tag]=p.publicSignals.map(BigInt);assert.equal(revocationTree.root,oldRoot);revocationTree.set(tag&((1n<<128n)-1n),revocationLeaf(domain));assert.equal(revocationTree.root,newRoot);};
 const reader={readState:async()=>({root:noteTree.root,nextIndex,recordCount:BigInt(records.length),revocationCount:0n,revocationRoot:revocationTree.root,snapshotId:hex(901)}),readRecordIdAt:async i=>records[Number(i)].recordId,readRecord:async id=>records.find(r=>r.recordId===id),readRevocationAt:async()=>{throw new Error('No revocations in this fixture');}};
 return {state,plan,accept,asset,recipient,revoke,reader};
}
function exportPoint(v){return v.public.viewPoint.map(BigInt);}
test('dynamic deposit, transfer, consolidation and withdrawal conserve actual note value',()=>{
 const f=fixture();f.accept(f.plan({action:'deposit',asset:f.asset,amount:'120'}));
 f.accept(f.plan({action:'deposit',asset:f.asset,amount:'30'}));
 const merge=f.plan({action:'consolidate',asset:f.asset});assert.equal(merge.configuration.outNotes[0][3],150n);f.accept(merge);
 const send=f.plan({action:'transfer',asset:f.asset,amount:'20',recipient:receiveDescriptor(f.recipient)});
 assert.equal(send.configuration.outNotes[0][5],BigInt(f.recipient.public.spendingAuthHash));assert.equal(send.addresses.asset,null);f.accept(send);
 const withdraw=f.plan({action:'withdraw',asset:f.asset,amount:'10',recipient:f.state.source});
 assert.equal(withdraw.configuration.bridge.amount,10n);f.accept(withdraw);
 assert.throws(()=>f.plan({action:'deposit',asset:f.asset,amount:'5',source:f.state.source}),e=>e.code==='EXACT_FIELDS_REQUIRED');
});
test('a Trigger grant has its own backup-recoverable view key and no revocation/spending key',async()=>{
 const f=fixture(),updated=addVaultGrant(f.state.vault,{id:hex(77),kind:'trigger'}),g=exportVaultKeys(updated).grants[0];
 assert.deepEqual(Object.keys(g).sort(),['id','kind','viewScalar']);
 assert.notEqual(g.viewScalar,exportVaultKeys(updated).viewScalar);
 assert.equal(updated.public.grants[0].kind,'trigger');
 const backup=await backupPrivacyVault(updated,password);assert(await checkPrivacyVaultBackup(updated,backup,password));
 const restored=await restorePrivacyVault(backup,password,f.state.scope,updated.ownerId);assert.equal(exportVaultKeys(restored).grants[0].viewScalar,g.viewScalar);
});

const password='a separate strong test password';
async function exchange(f,plan,role,recipientVault) {
 const required=plan.requiredCredentialExports.find(x=>x.role===role);assert(required);
 const {id,...item}=required;const spec={...item,vault:f.state.vault};
 const packet=await exportPrivateCredential(spec,password);
 assert.equal(await checkExportedPrivateCredential(spec,packet,password),true);
 const imported=await importPrivateCredential(packet,password,recipientVault);
 return {packet,imported,spec};
}
test('Pod sharing is encrypted, scoped to the intended owner, and cannot create a funder reclaim',async()=>{
 const f=fixture();f.state.vault=addVaultGrant(f.state.vault,{id:hex(21),kind:'pod'});const funder=f.state.vault;
 f.accept(f.plan({action:'deposit',asset:f.asset,amount:'100'}));
 const plan=f.plan({action:'pod-create',asset:f.asset,amount:'60',recipient:receiveDescriptor(f.recipient),unlockLedger:String(f.state.ledger+10n),grantId:hex(21)});
 assert.equal(plan.requiredCredentialExports.length,1);const shared=await exchange(f,plan,'claim',f.recipient);f.accept(plan);
 const noteId=noteCommitment(plan.configuration.outNotes[0]).toString();
 const scanClient=createLocalPrivacyClient({profile:f.state.profile,prove:async()=>{throw new Error('No proving during recovery');},verify:async()=>false});
 const recovery={profile:f.state.profile,scope:f.state.scope,vault:f.recipient,client:scanClient,reader:f.reader};
 assert.equal((await recoverPrivateArchive(recovery)).notes.length,0);
 const recovered=await recoverPrivateArchive({...recovery,credentials:[shared.imported]});assert.equal(recovered.notes.length,1);assert.equal(recovered.notes[0].note.commitment,noteId);
 assert.throws(()=>f.plan({action:'pod-claim',noteId,grantId:hex(21)}),e=>e.code==='SPEND_AUTHORITY');
 await assert.rejects(importPrivateCredential(shared.packet,password,funder),e=>e.code==='BINDING_MISMATCH');
 const wrongScope=structuredClone(shared.packet);wrongScope.scope.profileId=hex(999);
 await assert.rejects(importPrivateCredential(wrongScope,password,f.recipient),e=>e.code==='BINDING_MISMATCH');
 const changed=structuredClone(shared.packet);changed.encrypted.ciphertext=changed.encrypted.ciphertext.slice(0,-2)+'00';
 if(changed.encrypted.ciphertext===shared.packet.encrypted.ciphertext)changed.encrypted.ciphertext=changed.encrypted.ciphertext.slice(0,-2)+'01';
 await assert.rejects(importPrivateCredential(changed,password,f.recipient),e=>e.code==='BACKUP_AUTHENTICATION_FAILED');
 f.state.vault=f.recipient;f.state.credentials=[shared.imported];
 assert.throws(()=>f.plan({action:'pod-claim',noteId,grantId:hex(21)}),e=>e.code==='POD_CONDITION');
 f.state.ledger+=10n;const claim=f.plan({action:'pod-claim',noteId,grantId:hex(21)});assert.equal(claim.configuration.outNotes[0][3],60n);f.accept(claim);
 assert.throws(()=>f.plan({action:'pod-claim',noteId,grantId:hex(21)}),e=>e.code==='UNSPENT_NOTE_REQUIRED');
 assert.throws(()=>f.plan({action:'pod-reclaim',noteId}),e=>e.code==='PRIVATE_COMMAND_REQUIRED');
});
test('Trigger uses an independently backed-up real BabyJub attestation; recipient and refund branches stay separate',async()=>{
 const f=fixture();f.state.vault=addVaultGrant(f.state.vault,{id:hex(22),kind:'trigger'});const funder=f.state.vault,reviewer=createPrivacyVault(f.state.scope);
 const attester=createTriggerAttester(f.state.scope),backup=await backupTriggerAttester(attester,password);assert(await checkTriggerAttesterBackup(attester,backup,password));
 const restored=await restoreTriggerAttester(backup,password,f.state.scope);assert.deepEqual(restored.publicPoint,attester.publicPoint);forgetTriggerAttester(attester);
 f.accept(f.plan({action:'deposit',asset:f.asset,amount:'100'}));
 const command={action:'trigger-create',asset:f.asset,amount:'50',recipient:receiveDescriptor(f.recipient),deadline:String(f.state.ledger+20n),condition:'12345',attester:restored.publicPoint,attesterRecipient:receiveDescriptor(reviewer),grantId:hex(22)};
 const plan=f.plan(command);const claimPackage=await exchange(f,plan,'claim',f.recipient),reviewPackage=await exchange(f,plan,'attest',reviewer);f.accept(plan);
 const noteId=noteCommitment(plan.configuration.outNotes[0]).toString();
 assert.throws(()=>f.plan({action:'trigger-refund',noteId}),e=>e.code==='REFUND_INTERVAL');
 const receipt=signTriggerAttestation(restored,reviewPackage.imported,reviewer);assert.equal(receipt.noteId,noteId);
 f.state.vault=f.recipient;f.state.credentials=[claimPackage.imported];
 const bad=receipt.attestation.slice();bad[2]=(BigInt(bad[2])+1n).toString();
 assert.throws(()=>f.plan({action:'trigger-claim',noteId,attestation:bad}),e=>e.code==='INVALID_ATTESTATION');
 f.accept(f.plan({action:'trigger-claim',noteId,attestation:receipt.attestation}));
 f.state.vault=addVaultGrant(funder,{id:hex(24),kind:'trigger'});f.state.credentials=[];
 const refundPlan=f.plan({...command,amount:'30',grantId:hex(24)});f.accept(refundPlan);const refundId=noteCommitment(refundPlan.configuration.outNotes[0]).toString();f.state.ledger+=21n;
 f.accept(f.plan({action:'trigger-refund',noteId:refundId}));
 assert.throws(()=>f.plan({action:'trigger-claim',noteId:refundId,attestation:receipt.attestation}),e=>e.code==='UNSPENT_NOTE_REQUIRED');
 forgetTriggerAttester(restored);
});
test('Envoy enforces recipient, per-claim limit, count, expiry and owner-only revocation/reclaim without sharing revocation keys',async()=>{
 const f=fixture();f.state.vault=addVaultGrant(f.state.vault,{id:hex(23),kind:'envoy'});const owner=f.state.vault,agent=createPrivacyVault(f.state.scope);
 f.accept(f.plan({action:'deposit',asset:f.asset,amount:'150'}));
 const command={action:'envoy-grant',asset:f.asset,amount:'100',agent:receiveDescriptor(agent),recipient:receiveDescriptor(f.recipient),validFrom:String(f.state.ledger),expiresAt:String(f.state.ledger+30n),maxPerClaim:'30',claims:'2',grantId:hex(23)};
 const plan=f.plan(command),shared=await exchange(f,plan,'agent',agent);f.accept(plan);let noteId=noteCommitment(plan.configuration.outNotes[0]).toString();
 const exposed=readPrivateCredential(shared.imported,agent);assert(!Object.hasOwn(exposed.payload,'revocationSeed'));assert(!Object.hasOwn(exposed.payload,'spendingSecret'));
 f.state.vault=agent;f.state.credentials=[shared.imported];assert.throws(()=>f.plan({action:'envoy-revoke',grantId:hex(23)}),e=>e.code==='VAULT_GRANT_REQUIRED');
 assert.throws(()=>f.plan({action:'envoy-claim',noteId,amount:'31'}),e=>e.code==='ENVOY_CAP');
 const first=f.plan({action:'envoy-claim',noteId,amount:'25'});assert.equal(first.configuration.outNotes[0][5],BigInt(f.recipient.public.spendingAuthHash));f.accept(first);noteId=noteCommitment(first.configuration.outNotes[1]).toString();
 const last=f.plan({action:'envoy-claim',noteId,amount:'20'});assert.equal(last.configuration.outNotes[1][4],0n);assert.equal(last.configuration.outNotes[1][5],BigInt(owner.public.spendingAuthHash));f.accept(last);
 f.state.vault=addVaultGrant(owner,{id:hex(25),kind:'envoy'});const updatedOwner=f.state.vault;f.state.credentials=[];const second=f.plan({...command,amount:'40',grantId:hex(25)});f.accept(second);const secondId=noteCommitment(second.configuration.outNotes[0]).toString();
 const revoke=f.plan({action:'envoy-revoke',grantId:hex(25)});const bytes=concatBytes(new TextEncoder().encode('AGYION_REVOKE_V2\0'),...revoke.publicSignals.map(n=>hexToBytes(BigInt(n).toString(16).padStart(64,'0'))));
 assert(ed25519.verify(hexToBytes(revoke.signature),bytes,hexToBytes(revoke.ownerKey),{zip215:false}));f.revoke(revoke);
 f.state.vault=agent;f.state.credentials=[shared.imported];assert.throws(()=>f.plan({action:'envoy-claim',noteId:secondId,amount:'10'}),e=>e.code==='REVOKED_OR_STALE_ROOT');
 f.state.ledger+=31n;assert.throws(()=>f.plan({action:'envoy-claim',noteId:secondId,amount:'10'}));
 f.state.vault=updatedOwner;f.state.credentials=[];f.accept(f.plan({action:'envoy-reclaim',noteId:secondId}));
});
test('unknown fields, wrong scope, spent notes and insufficient two-note liquidity fail without implicit signing',()=>{
 const f=fixture();for(let i=0;i<3;i++)f.accept(f.plan({action:'deposit',asset:f.asset,amount:'10'}));
 assert.throws(()=>f.plan({action:'withdraw',asset:f.asset,amount:'5',recipient:{kind:'contract',id:f.state.scope.domain.contractId}}),e=>e.code==='POOL_SELF_PAYMENT_FORBIDDEN');
 assert.throws(()=>f.plan({action:'withdraw',asset:f.asset,amount:'25',recipient:f.state.source}),e=>e.code==='CONSOLIDATION_REQUIRED');
 const other={...receiveDescriptor(f.recipient),scope:{...f.state.scope,profileId:hex(999)}};
 assert.throws(()=>f.plan({action:'transfer',asset:f.asset,amount:'5',recipient:other}),e=>e.code==='BINDING_MISMATCH');
 assert.throws(()=>f.plan({action:'deposit',asset:f.asset,amount:'0'}),e=>e.code==='UINT_OUT_OF_RANGE');
 assert.throws(()=>f.plan({action:'deposit',asset:f.asset,amount:'01'}),e=>e.code==='CANONICAL_UINT_REQUIRED');
});

test('a spent conditional note still burns its grant for future creations after authenticated recovery',async()=>{
 const f=fixture();f.state.vault=addVaultGrant(f.state.vault,{id:hex(26),kind:'pod'});
 f.accept(f.plan({action:'deposit',asset:f.asset,amount:'100'}));
 const command={action:'pod-create',asset:f.asset,amount:'30',recipient:receiveDescriptor(f.state.vault),unlockLedger:String(f.state.ledger+1n),grantId:hex(26)};
 const first=f.plan(command);f.accept(first);f.state.ledger++;
 f.accept(f.plan({action:'pod-claim',noteId:noteCommitment(first.configuration.outNotes[0]).toString(),grantId:hex(26)}));
 assert.throws(()=>f.plan({...command,recipient:receiveDescriptor(f.recipient),unlockLedger:String(f.state.ledger+1n)}),e=>e.code==='UNUSED_GRANT_REQUIRED');
 const client=createLocalPrivacyClient({profile:f.state.profile,prove:async()=>{throw new Error('No proving during recovery');},verify:async()=>false});
 const recovered=await recoverPrivateArchive({profile:f.state.profile,scope:f.state.scope,vault:f.state.vault,client,reader:f.reader});
 assert.deepEqual(recovered.usedGrantIds,[hex(26)]);
 assert(recovered.notes.every(item=>client.readNote(item.note)[4]===0n));
});
