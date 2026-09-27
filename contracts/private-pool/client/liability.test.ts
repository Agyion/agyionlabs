import test from 'node:test';
import assert from 'node:assert/strict';
import {Address,nativeToScVal,xdr} from '@stellar/stellar-sdk';
import {verifyPoolRelease} from './release.ts';
import {setup,host,dataKey} from './reader-fixture.ts';
import {createPoolLiabilityReader,AccountingErrors} from './liability.ts';

async function fixture(amount=12345678901234567890123456789n){
 const f=setup(),release=await verifyPoolRelease(f.manifest,f.dkg);
 const counter=dataKey('Liability',new Address(host.asset).toScVal());
 f.persistent(counter,nativeToScVal(amount,{type:'i128'}));
 return {...f,release,counter,counterKey:counter.toXDR('base64')};
}
const isCounter=(init?:RequestInit)=>JSON.parse(String(init?.body)).params?.keys?.length===2;
test('additive reader returns exact nonnegative i128 under the pinned checkpoint, including real zero',async()=>{
 const f=await fixture(),reader=createPoolLiabilityReader(f.release,{fetch:f.fetcher});
 const result=await reader.readLiability(host.asset);
 assert.equal(result.amount,12345678901234567890123456789n);assert.equal(result.asset,host.asset);
 assert.equal(result.ledger,1010);assert.equal(result.liveUntilLedger,5000);assert.equal(result.profileId,f.release.scope.profileId);
 assert.ok(Object.isFrozen(result));assert.ok(!f.calls.some(name=>/send|simulate|restore/i.test(name)));
 f.persistent(f.counter,nativeToScVal(0n,{type:'i128'}));assert.equal((await reader.readLiability(host.asset)).amount,0n);
 assert.deepEqual(AccountingErrors,{20:'LiabilityUnavailable',21:'InsufficientBacking',22:'InvalidAccounting',23:'UnexpectedBalance'});
});
test('missing or expired counters never become zero and invalid numeric representations reject',async()=>{
 const f=await fixture(),reader=createPoolLiabilityReader(f.release,{fetch:f.fetcher});
 const original=f.entries.get(f.counterKey);f.entries.delete(f.counterKey);
 await assert.rejects(reader.readLiability(host.asset),/unavailable|restoration/i);
 f.entries.set(f.counterKey,{...original,liveUntilLedgerSeq:1009});await assert.rejects(reader.readLiability(host.asset),/expired|restoration/i);
 f.entries.set(f.counterKey,{...original,liveUntilLedgerSeq:undefined});await assert.rejects(reader.readLiability(host.asset),/TTL|restoration/i);
 for(const value of [nativeToScVal(-1n,{type:'i128'}),nativeToScVal(1n,{type:'u64'}),xdr.ScVal.scvVoid()]){
  f.persistent(f.counter,value);await assert.rejects(reader.readLiability(host.asset),/nonnegative|i128/i);
 }
});
test('asset allowlist and branded release are authority; bad requests perform no fetch',async()=>{
 const f=await fixture();assert.throws(()=>createPoolLiabilityReader({...f.release},{fetch:f.fetcher}),/verified.*release/i);
 const reader=createPoolLiabilityReader(f.release,{fetch:f.fetcher});
 for(const asset of [host.pool,host.funder,'wrong'])await assert.rejects(reader.readLiability(asset),/asset/i);
 const control=new AbortController();control.abort();await assert.rejects(reader.readLiability(host.asset,{signal:control.signal}));
 assert.deepEqual(f.calls,[]);
});
test('counter reply key, returned storage identity, durability, ledger and framing are independently checked',async()=>{
 for(const mutate of [
  (v:any)=>{v.id++;},(v:any)=>{v.error={code:-1};},(v:any)=>{v.result.entries.push(v.result.entries[1]);},
  (v:any)=>{v.result.latestLedger=0;},(v:any)=>{v.result.entries[1].lastModifiedLedgerSeq=1011;},
  (v:any)=>{v.result.entries[1].lastModifiedLedgerSeq=1001;},
  (v:any)=>{v.result.entries[1].key=v.result.entries[0].key;},
  (v:any)=>{const d=xdr.LedgerEntryData.fromXDR(v.result.entries[1].xdr,'base64');d.contractData().durability(xdr.ContractDataDurability.temporary());v.result.entries[1].xdr=d.toXDR('base64');},
  (v:any)=>{const d=xdr.LedgerEntryData.fromXDR(v.result.entries[1].xdr,'base64');d.contractData().contract(new Address(host.asset).toScAddress());v.result.entries[1].xdr=d.toXDR('base64');},
  (v:any)=>{v.result.entries[1].xdr+='AAAA';},
 ]){
  const f=await fixture();let touched=false;
  const reader=createPoolLiabilityReader(f.release,{fetch:async(url,init)=>{const response=await f.fetcher(url,init);if(!isCounter(init))return response;const value=await response.json();mutate(value);touched=true;return new Response(JSON.stringify(value));}});
  await assert.rejects(reader.readLiability(host.asset));assert.ok(touched);
 }
});
test('bytecode/config checks remain active and a state change during counter read rejects',async()=>{
 const f=await fixture();f.instance('ff'.repeat(32));await assert.rejects(createPoolLiabilityReader(f.release,{fetch:f.fetcher}).readLiability(host.asset),/bytecode|WASM/i);
 f.instance();f.config.config.disclosure_epoch=2;f.instance();await assert.rejects(createPoolLiabilityReader(f.release,{fetch:f.fetcher}).readLiability(host.asset),/config/i);
 const changed=await fixture();
 const reader=createPoolLiabilityReader(changed.release,{fetch:async(url,init)=>{const result=await changed.fetcher(url,init);if(isCounter(init)){changed.state.record_count=2n;changed.instance();}return result;}});
 await assert.rejects(reader.readLiability(host.asset),/snapshot changed/i);
});
test('bounded replies, HTTP failures and cancellation never return stale amounts or trigger mutation/retry',async()=>{
 for(const reply of [()=>new Response('x',{status:503}),()=>new Response('{bad'),()=>new Response(' '.repeat(128*1024+1))]){
  const f=await fixture();let counterCalls=0;
  const reader=createPoolLiabilityReader(f.release,{fetch:async(url,init)=>{if(isCounter(init)){counterCalls++;return reply();}return f.fetcher(url,init);}});
  await assert.rejects(reader.readLiability(host.asset));assert.equal(counterCalls,1);
 }
 const f=await fixture(),control=new AbortController();
 const reader=createPoolLiabilityReader(f.release,{fetch:async(url,init)=>{const response=await f.fetcher(url,init);if(isCounter(init))control.abort();return response;}});
 await assert.rejects(reader.readLiability(host.asset,{signal:control.signal}));assert.equal(f.calls.length,4);
});
test('the observed counter ledger cannot regress across later successful reads',async()=>{
 const f=await fixture(),reader=createPoolLiabilityReader(f.release,{fetch:f.fetcher});
 await reader.readLiability(host.asset);f.setHead(1009);await assert.rejects(reader.readLiability(host.asset),/older|ledger/i);
});
