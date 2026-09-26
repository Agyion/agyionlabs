import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Buffer} from 'buffer';
import {xdr} from '@stellar/stellar-sdk';
import {verifyPoolRelease} from './release.ts';
import {createPoolReader,readAcceptedPoolRecord,assertPoolReader} from './reader.ts';
import {setup,host,b,sc,dataKey} from './reader-fixture.ts';

test('release verifies the signed DKG and rejects mismatched network, pool, auditor and transcript',async()=>{
 const f=setup();const release=await verifyPoolRelease(f.manifest,f.dkg);
 assert.equal(release.profile.domain,BigInt(host.domain));assert.equal(release.profile.assetPolicyRoot,BigInt(host.assetPolicyRoot));
 for(const change of [{rpcUrl:'https://attacker.invalid'},{networkPassphrase:'Public Global Stellar Network ; September 2015'},{pool:host.asset},{config:{...f.manifest.config,auditor:[1n,2n]}},{config:{...f.manifest.config,dkgTranscriptHash:'11'.repeat(32)}}])await assert.rejects(verifyPoolRelease({...f.manifest,...change},f.dkg));
 const bad=structuredClone(f.dkg);bad.acceptances[0].signature='00'.repeat(64);await assert.rejects(verifyPoolRelease(f.manifest,bad));
 assert.throws(()=>createPoolReader({...release},{fetch:f.fetcher}),/release/i);
});
test('reader decodes actual SDK XDR and keeps checkpoint stable across unrelated head ledgers',async()=>{
 const f=setup(),release=await verifyPoolRelease(f.manifest,f.dkg),reader=createPoolReader(release,{fetch:f.fetcher});
 const a=await reader.readState();assert.equal(a.recordCount,1n);assert.equal(a.nextIndex,1n);
 const options={snapshotId:a.snapshotId};assert.equal(await reader.readRecordIdAt(0n,options),f.id);
 assert.deepEqual((await reader.readRecord(f.id,options)).publicInputs,f.fields);
 f.setHead(1050);assert.deepEqual(await reader.readState(),a);
 assert.deepEqual(await readAcceptedPoolRecord(reader,f.id),{recordId:f.id,publicInputs:f.fields});
 assert.ok(f.calls.length>0);assert.ok(!f.calls.some(x=>/send|simulate|restore/i.test(x)));
});
test('missing advertised archive data and forged records fail instead of returning empty history',async()=>{
 const f=setup(),reader=createPoolReader(await verifyPoolRelease(f.manifest,f.dkg),{fetch:f.fetcher});
 const s=await reader.readState(),options={snapshotId:s.snapshotId};
 const index=dataKey('RecordIndex',xdr.ScVal.scvU64(xdr.Uint64.fromString('0'))).toXDR('base64');f.entries.delete(index);
 await assert.rejects(reader.readRecordIdAt(0n,options),/unavailable|missing/i);
 await assert.rejects(reader.readRecordIdAt(1n,options),/range/i);
 const changed=f.fields.slice();changed[24]+=1n;f.persistent(dataKey('Record',xdr.ScVal.scvBytes(Buffer.from(f.id,'hex'))),sc('StoredRecord',{ledger:1000,public_inputs:changed.map(b)}));
 await assert.rejects(reader.readRecord(f.id,options),/digest/i);
 await assert.rejects(reader.readRecord(f.id,{snapshotId:'12'.repeat(32)}),/snapshot/i);
});
test('checkpoint and final trusted read reject changed state, bytecode or immutable configuration',async()=>{
 const f=setup(),reader=createPoolReader(await verifyPoolRelease(f.manifest,f.dkg),{fetch:f.fetcher});
 const before=await reader.readState();f.state.record_count=2n;f.instance();const after=await reader.readState();assert.notEqual(after.snapshotId,before.snapshotId);
 f.config.config.disclosure_epoch=2;f.instance();await assert.rejects(reader.readState(),/config/i);
 f.config.config.disclosure_epoch=1;f.instance('ff'.repeat(32));await assert.rejects(reader.readState(),/bytecode|wasm/i);
 f.instance();f.entries.delete(f.wasmKey.toXDR('base64'));await assert.rejects(reader.readState(),/unavailable|missing/i);
});

test('actual revocation XDR is enumerable and missing or expired entries require recovery',async()=>{
 const fixture=JSON.parse(readFileSync(new URL('../fixtures/verified-v2/proofs/13-revoke-envoy.json',import.meta.url),'utf8'));
 const [domain,oldRoot,newRoot,tag]=fixture.publicSignals.map(BigInt) as bigint[];
 assert.ok(tag>=(1n<<128n),'The real revocation tag must exercise the full field rather than its tree index');
 const f=setup();f.state.revocation_count=1n;f.state.revocation_root=b(newRoot);f.instance();
 const k=dataKey('RevocationIndex',xdr.ScVal.scvU64(xdr.Uint64.fromString('0')));
 f.persistent(k,sc('StoredRevocation',{ledger:1000,tag:b(tag),old_root:b(oldRoot),new_root:b(newRoot)}));
 const release=await verifyPoolRelease(f.manifest,f.dkg),reader=createPoolReader(release,{fetch:f.fetcher}),s=await reader.readState(),options={snapshotId:s.snapshotId};
 const recovered=await reader.readRevocationAt(0n,options);
 assert.deepEqual(recovered,{tag,oldRoot,newRoot});assert.equal(release.profile.domain,domain);
 const {createArchiveRebuilder}=await import(new URL('../../../privacy/src/archive.mjs',import.meta.url).href);
 // Actual generated proof root checks the existing low128-bit position masking.
 const archive=createArchiveRebuilder(release.profile);archive.appendRevocation(recovered);
 f.entries.get(k.toXDR('base64')).liveUntilLedgerSeq=1009;
 await assert.rejects(reader.readRevocationAt(0n,options),/expired|restoration/i);
 f.entries.delete(k.toXDR('base64'));await assert.rejects(reader.readRevocationAt(0n,options),/unavailable/i);
});

test('RPC response identity, returned storage identity and bytecode bytes are independently checked',async()=>{
 const f=setup(),release=await verifyPoolRelease(f.manifest,f.dkg);
 for(const mutation of [
  (v:any,m:string)=>{if(m==='getNetwork')v.result.passphrase='other network';},
  (v:any,m:string)=>{if(m==='getNetwork')v.result.protocolVersion=29;},
  (v:any)=>{v.id+=1;},
  (v:any,m:string)=>{if(m==='getLedgerEntries')v.result.entries.push(v.result.entries[0]);},
  (v:any,m:string)=>{if(m==='getLedgerEntries')v.result.entries[0].key=f.wasmKey.toXDR('base64');},
 ]){
  const fetcher:typeof fetch=async(url,init)=>{const v=await(await f.fetcher(url,init)).json();mutation(v,JSON.parse(String(init?.body)).method);return new Response(JSON.stringify(v));};
  await assert.rejects(createPoolReader(release,{fetch:fetcher}).readState());
 }
 const row=f.entries.get(f.instanceKey.toXDR('base64'));
 const altered=xdr.LedgerEntryData.fromXDR(row.xdr,'base64');altered.contractData().durability(xdr.ContractDataDurability.temporary());row.xdr=altered.toXDR('base64');
 await assert.rejects(createPoolReader(release,{fetch:f.fetcher}).readState(),/storage identity/i);
 f.instance();const code=f.entries.get(f.wasmKey.toXDR('base64')),bad=xdr.LedgerEntryData.fromXDR(code.xdr,'base64');bad.contractCode().code(Buffer.from([0]));code.xdr=bad.toXDR('base64');
 await assert.rejects(createPoolReader(release,{fetch:f.fetcher}).readState(),/bytecode content/i);
});

test('operator record read rejects an intervening state change and nonbranded readers',async()=>{
 const f=setup(),release=await verifyPoolRelease(f.manifest,f.dkg);let changed=false;
 const fetcher:typeof fetch=async(url,init)=>{
  const response=await f.fetcher(url,init);const req=JSON.parse(String(init?.body));
  if(!changed&&req.method==='getLedgerEntries'&&req.params.keys[0]===dataKey('Record',xdr.ScVal.scvBytes(Buffer.from(f.id,'hex'))).toXDR('base64')){changed=true;f.state.record_count=2n;f.instance();}
  return response;
 };
 const reader=createPoolReader(release,{fetch:fetcher});
 await assert.rejects(readAcceptedPoolRecord(reader,f.id),/snapshot changed/i);
 await assert.rejects(readAcceptedPoolRecord({...reader},f.id),/verified reader/i);
 const other=await verifyPoolRelease(f.manifest,f.dkg);assert.throws(()=>assertPoolReader(reader,other),/this pool release/i);
});

test('release accessors are never invoked, abort sends no request, and oversized RPC replies fail closed',async()=>{
 const f=setup();let called=false;const poison={...f.manifest};Object.defineProperty(poison,'pool',{enumerable:true,get(){called=true;return host.pool;}});
 await assert.rejects(verifyPoolRelease(poison,f.dkg),/data properties/i);assert.equal(called,false);
 const release=await verifyPoolRelease(f.manifest,f.dkg),reader=createPoolReader(release,{fetch:f.fetcher});
 const control=new AbortController();control.abort();await assert.rejects(reader.readState({signal:control.signal}));assert.deepEqual(f.calls,[]);
 const oversized=createPoolReader(release,{fetch:async()=>new Response(' '.repeat(1024*1024+1))});
 await assert.rejects(oversized.readState(),/bounds/i);
});

test('cancellation during a read prevents later requests and archive reads cannot regress ledger height',async()=>{
 const f=setup(),release=await verifyPoolRelease(f.manifest,f.dkg),control=new AbortController();
 const cancelled=createPoolReader(release,{fetch:async(url,init)=>{const response=await f.fetcher(url,init);control.abort();return response;}});
 await assert.rejects(cancelled.readState({signal:control.signal}));assert.deepEqual(f.calls,['getNetwork']);
 const reader=createPoolReader(release,{fetch:f.fetcher}),s=await reader.readState();f.setHead(1009);
 await assert.rejects(reader.readRecord(f.id,{snapshotId:s.snapshotId}),/older or invalid ledger/i);
});
