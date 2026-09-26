import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ed25519,x25519 } from '@noble/curves/ed25519.js';
import { bytesToHex,hexToBytes } from '@noble/hashes/utils.js';
import { THRESHOLD_SUITE,createDealerPackage,deriveTrusteeShare,acceptDkgTranscript,finalizeDkgTranscript,encapsulateRecord,pointToFieldElements,combinePartialDecryptions } from '../src/threshold.mjs';
import { AUDIT_FIELDS,archiveCiphertextDigest,signDisclosureRequest,authorizeDisclosureRequest,createDisclosureOperator,openDisclosureDelivery,disclosurePartialContext } from '../src/authorization.mjs';
import {domainField} from '../src/identity.mjs';
import {buildWitness} from '../src/witness.mjs';
import {makeDepositConfig} from './model-fixtures.mjs';
const seeds=['01','02','03'].map(s=>s.repeat(32)),authoritySeeds=['11','12','13'].map(s=>s.repeat(32));
const pub=s=>bytesToHex(ed25519.getPublicKey(hexToBytes(s)));
const domain={networkId:'21'.repeat(32),contractId:'22'.repeat(32)};
const config={version:'1',suite:THRESHOLD_SUITE,domain,epoch:'1',sessionId:'23'.repeat(32),threshold:'2',trustees:seeds.map((s,i)=>({id:String(i+1),authPublicKey:pub(s)}))};
const dealers=seeds.map((s,i)=>createDealerPackage(config,String(i+1),s));
const packages=dealers.map(d=>d.publicPackage);
const shares=seeds.map((_,i)=>deriveTrusteeShare(config,packages,dealers.map(d=>d.privateShares[i]),String(i+1)));
const epoch=finalizeDkgTranscript(config,packages,shares.map((s,i)=>acceptDkgTranscript(config,packages,s,seeds[i])));
const encrypted=AUDIT_FIELDS.map(()=>encapsulateRecord(epoch));
// Real ciphertexts, with an explicitly local TEST accepted-record adapter.
// These unit tests do not produce a proof or establish ledger inclusion.
const configuration=makeDepositConfig();configuration.domain=domainField(domain);configuration.auditor=pointToFieldElements(epoch.publicKey);
for(const key of ['inNotes','outNotes'])configuration[key]=configuration[key].map(n=>n.map((v,i)=>i===1?configuration.domain:v));
const built=buildWitness(configuration,{testRandomness:{scalars:[1n,2n,...encrypted.map(e=>BigInt('0x'+e.ephemeralScalar))],nonces:[6n,7n,8n,9n,10n]}});
const archive=built.publicInputs.slice(23),acceptedRecord={recordId:built.ciphertextDigest,publicInputs:built.publicInputs};
const profile={domain:configuration.domain,assetPolicyRoot:configuration.assetTree.root,epoch:configuration.epoch,auditor:configuration.auditor};
const requesterSeed='31'.repeat(32),requesterPublicKey=bytesToHex(x25519.getPublicKey(hexToBytes(requesterSeed)));
const policy={version:'2',domain,epoch:'1',dkgTranscriptHash:epoch.transcriptHash,policyDigest:'32'.repeat(32),threshold:'2',authorities:authoritySeeds.map((s,i)=>({id:String(i+1),publicKey:pub(s)})),trusteeIds:['1','2','3'],trusteeThreshold:'2',allowedFields:AUDIT_FIELDS};
const request={version:'2',domain,epoch:'1',ledger:{from:'100',until:'110'},requestId:'33'.repeat(32),recordHash:archiveCiphertextDigest(archive),ciphertextDigest:archiveCiphertextDigest(archive),requesterPublicKey,policyDigest:policy.policyDigest,purposeDigest:'35'.repeat(32),fields:['audit-assets','audit-terms'],trusteeIds:['1','2','3']};
const archivedRecord={recordHash:request.recordHash,ciphertexts:archive};
const approvals=r=>authoritySeeds.slice(0,2).map((s,i)=>signDisclosureRequest(r,String(i+1),s,policy));
const authorized=(r=request)=>authorizeDisclosureRequest(r,approvals(r),policy,'105');
const clone=v=>structuredClone(v);
function operator(index,claim=async()=>true,readCurrentLedger=async()=>'105',readAcceptedRecord=async()=>clone(acceptedRecord)){return createDisclosureOperator({epoch,trusteeShare:shares[index],policy,profile,claimRequest:claim,readCurrentLedger,readAcceptedRecord})}

test('operator refuses a correctly signed but unavailable accepted record before replay claim',async()=>{
 let claims=0,reads=0;const op=operator(0,async()=>{claims++;return true},async()=>'105',async()=>{reads++;return undefined});
 await assert.rejects(op.disclose(authorized(),archivedRecord,'105'),/ACCEPTED_RECORD_UNAVAILABLE/);
 assert.equal(reads,1);assert.equal(claims,0);
});
test('the operator binds accepted record identity, full ciphertext and pinned domain/policy/epoch/auditor',async()=>{
 let claims=0;const claim=async()=>{claims++;return true};
 for(const slot of [0,1,2,3,4,23,156]){
  const changed=clone(acceptedRecord);changed.publicInputs[slot]+=1n;
  await assert.rejects(operator(0,claim,async()=>'105',async()=>changed).disclose(authorized(),archivedRecord,'105'));
 }
 await assert.rejects(operator(0,claim,async()=>'105',async()=>({...acceptedRecord,recordId:'44'.repeat(32)})).disclose(authorized(),archivedRecord,'105'));
 await assert.rejects(operator(0,claim,async()=>'105',async()=>{throw new Error('untrusted provider details')}).disclose(authorized(),archivedRecord,'105'),{code:'ACCEPTED_RECORD_UNAVAILABLE'});
 assert.equal(claims,0);
 const options={epoch,trusteeShare:shares[0],policy,profile,claimRequest:claim,readCurrentLedger:async()=>'105',readAcceptedRecord:async()=>acceptedRecord};
 assert.throws(()=>createDisclosureOperator({...options,readAcceptedRecord:undefined}),/TRUSTED_OPERATOR_ADAPTERS_REQUIRED/);
 for(const changed of [{domain:101n},{epoch:2n},{assetPolicyRoot:0n},{auditor:[1n,2n]}])assert.throws(()=>createDisclosureOperator({...options,profile:{...profile,...changed}}));
});
test('a delayed accepted-record read rechecks disclosure expiry before consuming a replay claim',async()=>{
 let ledger='105',claims=0;const op=operator(0,async()=>{claims++;return true},async()=>ledger,async()=>{ledger='111';return clone(acceptedRecord)});
 await assert.rejects(op.disclose(authorized(),archivedRecord,'105'),/NOT_CURRENT/);assert.equal(claims,0);
 // Historic transaction validity is deliberately separate from request expiry.
 const historic=clone(acceptedRecord);historic.publicInputs[6]=1n;historic.publicInputs[7]=10n;
 await operator(0,async()=>true,async()=>'105',async()=>historic).disclose(authorized(),archivedRecord,'105');
});

test('v2 authorities refuse a record identity different from the exact ciphertext digest',()=>{
 const mismatched={...request,recordHash:'34'.repeat(32)};
 assert.throws(()=>signDisclosureRequest(mismatched,'1',authoritySeeds[0],policy),/BINDING_MISMATCH at recordHash/);
 // Even a mathematically valid signature over an incompatible v2 identity
 // must be rejected by the independent verifier, before quorum evaluation.
 const payload=new TextEncoder().encode(JSON.stringify(['AGYION_DISCLOSURE_V2','signed-request',mismatched]));
 const signed=authoritySeeds.slice(0,2).map((s,i)=>({authorityId:String(i+1),signature:bytesToHex(ed25519.sign(payload,hexToBytes(s)))}));
 assert.throws(()=>authorizeDisclosureRequest(mismatched,signed,policy,'105'),/BINDING_MISMATCH at recordHash/);
});

test('separate authority quorum authenticates the exact one-record request',()=>{
 const a=authorized();assert.equal(a.kind,'AuthorizedDisclosureRequest');assert.ok(Object.isFrozen(a.request.fields));
 assert.throws(()=>authorizeDisclosureRequest(request,approvals(request).slice(0,1),policy,'105'));
 assert.throws(()=>authorizeDisclosureRequest(request,[approvals(request)[0],approvals(request)[0]],policy,'105'));
 assert.throws(()=>signDisclosureRequest(request,'1',seeds[0],policy));
 assert.throws(()=>authorizeDisclosureRequest(request,approvals(request),policy,'99'));
 assert.throws(()=>authorizeDisclosureRequest(request,approvals(request),policy,'111'));
 assert.throws(()=>authorizeDisclosureRequest(request,approvals(request),policy,undefined));
});
test('every authorization binding and field scope is enforced',()=>{
 const signed=approvals(request);
 for(const key of ['requestId','recordHash','ciphertextDigest','requesterPublicKey','policyDigest','purposeDigest']){
  assert.throws(()=>authorizeDisclosureRequest({...request,[key]:'44'.repeat(32)},signed,policy,'105'));
 }
 for(const fields of [[],['audit-terms','audit-assets'],['output0'],['audit-assets','audit-assets']])assert.throws(()=>signDisclosureRequest({...request,fields},'1',authoritySeeds[0],policy));
 assert.throws(()=>authorizeDisclosureRequest({...request,epoch:'2'},signed,policy,'105'));
 assert.throws(()=>authorizeDisclosureRequest({...request,domain:{...domain,contractId:'44'.repeat(32)}},signed,policy,'105'));
 for(const requesterPublicKey of ['00'.repeat(32),'01'+'00'.repeat(31),'ff'.repeat(32)])assert.throws(()=>signDisclosureRequest({...request,requesterPublicKey},'1',authoritySeeds[0],policy));
});
test('operator privately returns only requested U shares; requester combines threshold replies',async()=>{
 const a=authorized();const deliveries=await Promise.all([operator(0).disclose(a,archivedRecord,'105'),operator(1).disclose(a,archivedRecord,'105')]);
 for(const d of deliveries){assert.ok(!JSON.stringify(d).includes('commitmentBase'));assert.equal(d.suite,'x25519-hkdf-sha256-aes256gcm-v1')}
 const replies=await Promise.all(deliveries.map(d=>openDisclosureDelivery(d,a,requesterSeed,epoch,archivedRecord,'105')));
 for(const reply of replies)assert.deepEqual(reply.map(p=>p.field),request.fields);
 for(const field of request.fields){
  const partials=replies.map(r=>r.find(p=>p.field===field).partial);
  assert.equal(combinePartialDecryptions(epoch,disclosurePartialContext(a,archivedRecord,field,'105'),partials),encrypted[AUDIT_FIELDS.indexOf(field)].sharedPoint);
 }
});
test('changed archive, stale authorization and unbranded requests fail before replay claim',async()=>{
 let calls=0;const op=operator(0,async()=>{calls++;return true}),a=authorized();
 const changed=[...archive];changed[56]+=1n;
 await assert.rejects(op.disclose(a,{...archivedRecord,ciphertexts:changed},'105'));
 await assert.rejects(op.disclose(a,{...archivedRecord,recordHash:'77'.repeat(32)},'105'));
 await assert.rejects(op.disclose(a,archivedRecord,'111'));
 await assert.rejects(op.disclose(clone(a),archivedRecord,'105'));
 await assert.rejects(op.disclose(a,archivedRecord));
 assert.equal(calls,0);
});
test('atomic replay claim precedes work and a duplicate request is rejected',async()=>{
 const used=new Set();let calls=0;
 const claim=async key=>{calls++;if(used.has(key))return false;used.add(key);return true};
 const op=operator(0,claim),a=authorized();
 const result=await Promise.allSettled([op.disclose(a,archivedRecord,'105'),op.disclose(a,archivedRecord,'105')]);
 assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(calls,2);
 await assert.rejects(op.disclose(a,archivedRecord,'105'),/REPLAY/);
 await assert.rejects(operator(0,async()=>{throw new Error('storage unavailable')}).disclose(a,archivedRecord,'105'));
});
test('encrypted delivery rejects another requester, context, nonce and authentication tag',async()=>{
 const a=authorized(),d=await operator(0).disclose(a,archivedRecord,'105');
 await assert.rejects(openDisclosureDelivery(d,a,'45'.repeat(32),epoch,archivedRecord,'105'));
 for(const key of ['authorizationDigest','requestId','recordHash','ciphertextDigest','recipientPublicKey','ephemeralPublicKey']){
  await assert.rejects(openDisclosureDelivery({...d,[key]:'44'.repeat(32)},a,requesterSeed,epoch,archivedRecord,'105'));
 }
 await assert.rejects(openDisclosureDelivery({...d,nonce:'00'.repeat(12)},a,requesterSeed,epoch,archivedRecord,'105'));
 const corrupted=clone(d);corrupted.ciphertext=(d.ciphertext.startsWith('00')?'01':'00')+d.ciphertext.slice(2);
 await assert.rejects(openDisclosureDelivery(corrupted,a,requesterSeed,epoch,archivedRecord,'105'));
});
test('expiry after a delayed durable claim consumes the request without producing shares',async()=>{
 let ledger='105',calls=0;
 const op=operator(0,async()=>{calls++;ledger='111';return calls===1},async()=>ledger);
 await assert.rejects(op.disclose(authorized(),archivedRecord,'105'),/NOT_CURRENT/);
 assert.equal(calls,1);
 // Renewed signatures/window with the same requestId cannot release a claim
 // consumed by the earlier delayed operation.
 await assert.rejects(op.disclose(authorized({...request,ledger:{from:'100',until:'120'}}),archivedRecord,'111'),/REPLAY/);
 assert.equal(calls,2);
 await assert.rejects(operator(0,async()=>true,async()=>undefined).disclose(authorized(),archivedRecord,'105'));
});
