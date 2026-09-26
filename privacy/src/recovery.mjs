/**
 * Browser-safe, local archive recovery. No network, storage, proof, signing or
 * submission implementation exists here. reader is a TRUSTED read adapter:
 * it must authenticate the pinned network/pool/profile, accepted indexed
 * records and checkpoint; matching roots alone cannot authenticate an RPC.
 *
 * reader.readState({signal}) -> {root,nextIndex,recordCount,revocationCount,
 *   revocationRoot,snapshotId}, with bigint fields and a64-hex checkpoint hash.
 * readRecordIdAt(index,{snapshotId,signal}) ->64-hex digest;
 * readRecord(id,{snapshotId,signal}) -> {recordId,publicInputs:bigint[157]};
 * readRevocationAt(index,{snapshotId,signal}) -> {tag,oldRoot,newRoot}.
 * Every advertised entry must be available; archival restoration is the
 * adapter's job. This module never skips a missing entry or retries implicitly.
 *
 * A changed final state/checkpoint discards the attempt; the caller explicitly
 * retries. Results describe that snapshot, not future unspent status. Work is
 * limited to100,000 records AND100,000 revocations; larger archives fail rather
 * than truncate. Client/vault are trusted local implementations, not plugins.
 * Fresh client handles remain private until the final check; failure forgets
 * only this attempt's handles. JS cannot promise physical memory erasure.
 */
import {createArchiveRebuilder} from './archive.mjs';
import {exportVaultKeys} from './vault.mjs';
import {domainField} from './identity.mjs';
import {fieldElement,fieldArray,bounded,nullifier} from './model.mjs';
import {record,hex,uint,domain,bindDomain,equal,fail,freeze} from './validation.mjs';

export const RECOVERY_ARCHIVE_LIMIT=100_000n;
const STATE_KEYS=['root','nextIndex','recordCount','revocationCount','revocationRoot','snapshotId'];
function ensure(condition,code){if(!condition)fail(code,'recovery');}
function stateOf(value){
 const s=record(value,STATE_KEYS,'state');
 const state={root:fieldElement(s.root),nextIndex:bounded(s.nextIndex,33),recordCount:bounded(s.recordCount,64),
  revocationCount:bounded(s.revocationCount,64),revocationRoot:fieldElement(s.revocationRoot),snapshotId:hex(s.snapshotId,32,'snapshotId',true)};
 ensure(state.nextIndex<=1n<<32n,'TREE_CAPACITY');
 ensure(state.recordCount<=RECOVERY_ARCHIVE_LIMIT&&state.revocationCount<=RECOVERY_ARCHIVE_LIMIT,'RECOVERY_LIMIT_EXCEEDED');
 return freeze(state);
}
function scopeOf(value){
 const s=record(value,['domain','epoch','profileId'],'scope');
 return freeze({domain:domain(s.domain,'domain'),epoch:uint(s.epoch,32,'epoch',1n),profileId:hex(s.profileId,32,'profileId',true)});
}
function bindScope(actual,expected){
 bindDomain(actual.domain,expected.domain);equal(actual.epoch,expected.epoch,'epoch');equal(actual.profileId,expected.profileId,'profileId');
}
function methods(value,keys){
 ensure(value&&typeof value==='object','LOCAL_CLIENT_REQUIRED');
 const result={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);
  ensure(d&&'value' in d&&typeof d.value==='function','LOCAL_CLIENT_REQUIRED');result[key]=d.value.bind(value);}
 return result;
}
function abortCheck(signal){
 if(signal!==undefined){
  // Use the native brand-checked getter; do not trust an arbitrary "aborted"
  // property or propagate a caller's possibly sensitive abort reason.
  let aborted;try{aborted=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get.call(signal);}
  catch{fail('ABORT_SIGNAL_REQUIRED','signal');}
  ensure(!aborted,'RECOVERY_ABORTED');
 }
}
async function read(call,signal){
 abortCheck(signal);
 let onAbort;
 try{
  const work=Promise.resolve().then(call);
  const value=signal===undefined?await work:await Promise.race([work,new Promise((_,reject)=>{
   onAbort=()=>{try{fail('RECOVERY_ABORTED','recovery');}catch(error){reject(error);}};
   signal.addEventListener('abort',onAbort,{once:true});if(signal.aborted)onAbort();
  })]);
  abortCheck(signal);return value;
 }catch(error){abortCheck(signal);if(error?.code==='RECOVERY_ABORTED')throw error;fail('ARCHIVE_READ_FAILED','reader');}
 finally{if(onAbort)signal.removeEventListener('abort',onAbort);}
}

export async function recoverPrivateArchive(value,signal){
 const o=record(value,['profile','scope','vault','client','reader'],'recoveryOptions');
 // Snapshot caller configuration and authenticate the vault brand before any
 // await/read. Other profile facts must come from a pinned release, not RPC.
 const p=record(o.profile,['domain','assetPolicyRoot','epoch','auditor'],'profile');
 const profile=freeze({...p,auditor:fieldArray(p.auditor,2,'auditor')});
 const scope=scopeOf(o.scope),keys=exportVaultKeys(o.vault);bindScope(o.vault.scope,scope);
 equal(profile.domain,domainField(scope.domain),'domain');equal(profile.epoch,BigInt(scope.epoch),'epoch');
 const rebuild=createArchiveRebuilder(profile),client=methods(o.client,['scanRecord','readNote','forget']);
 const reader=record(o.reader,['readState','readRecordIdAt','readRecord','readRevocationAt'],'reader');
 ensure(Object.values(reader).every(fn=>typeof fn==='function'),'TRUSTED_READER_REQUIRED');
 const viewKeys=[...new Set([keys.viewScalar,...keys.grants.map(g=>g.viewScalar)])];
 const batches=[];for(let i=0;i<viewKeys.length;i+=32)batches.push(Object.freeze(viewKeys.slice(i,i+32)));
 const created=new Set(),found=new Map();
 try{
  const state=stateOf(await read(()=>reader.readState({signal}),signal));
  const options=Object.freeze({snapshotId:state.snapshotId,signal});
  for(let index=0n;index<state.revocationCount;index++){
   const item=await read(()=>reader.readRevocationAt(index,options),signal);
   ensure(item!==undefined&&item!==null,'ARCHIVE_REVOCATION_MISSING');rebuild.appendRevocation(item);
  }
  for(let index=0n;index<state.recordCount;index++){
   const id=await read(()=>reader.readRecordIdAt(index,options),signal);
   ensure(id!==undefined&&id!==null,'ARCHIVE_RECORD_ID_MISSING');hex(id,32,'recordId',true);
   const raw=await read(()=>reader.readRecord(id,options),signal);ensure(raw!==undefined&&raw!==null,'ARCHIVE_RECORD_MISSING');
   const r=record(raw,['recordId','publicInputs'],'record'),fields=fieldArray(r.publicInputs,157,'publicInputs');
   equal(r.recordId,id,'recordId');rebuild.appendRecord({recordId:id,publicInputs:fields});
   const core=fields.slice(0,23),encrypted=fields.slice(23);
   // This anchor is authoritative ONLY because reader authenticated this exact
   // accepted record. Copying untrusted data into both arguments is not trust.
   const entry=freeze({recordId:id,core,encrypted}),anchor=freeze({recordId:id,ciphertextDigest:id,core});
   for(const batch of batches){
    abortCheck(signal);
    const handles=client.scanRecord(entry,anchor,batch);
    for(const handle of handles){
     created.add(handle);equal(handle.recordId,id,'recordId');ensure(handle.slot===0||handle.slot===1,'INCOMING_SLOT_REQUIRED');
     const commitment=core[14+handle.slot];equal(handle.commitment,commitment.toString(),'commitment');
     if(found.has(handle.commitment)){client.forget(handle);created.delete(handle);continue;}
     found.set(handle.commitment,{note:handle,index:core[11]+BigInt(handle.slot),nullifier:nullifier(client.readNote(handle))});
    }
    // Cached readers may resolve entirely as microtasks. Yield a browser task
    // between bounded batches so user cancellation/input can actually run.
    await new Promise(resolve=>setTimeout(resolve,0));abortCheck(signal);
   }
  }
  const {snapshotId,...expected}=state,archive=rebuild.finish(expected);
  const finalState=stateOf(await read(()=>reader.readState({signal}),signal));
  ensure(STATE_KEYS.every(key=>finalState[key]===state[key]),'RECOVERY_SNAPSHOT_CHANGED');abortCheck(signal);
  const notes=[];
  for(const item of found.values()){
   if(archive.isSpent(item.nullifier)){client.forget(item.note);created.delete(item.note);}
   else notes.push(freeze({note:item.note,index:item.index}));
  }
  // No await after the final state check/publication. No plaintext note or
  // nullifier is returned; note openings require the client's explicit API.
  return Object.freeze({kind:'RecoveredPrivateArchive',state,archive,notes:Object.freeze(notes)});
 }catch(error){for(const handle of created)client.forget(handle);throw error;}
}
