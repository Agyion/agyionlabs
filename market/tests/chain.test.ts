import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Address,Networks,StrKey,xdr} from '@stellar/stellar-sdk';
import {createChainReader,validateMarketConfig} from '../src/chain.ts';
import {chainFixture} from './chain-fixture.ts';
import {scMap} from '../shared/codec.ts';
test('reader decodes one actual SDK-XDR storage checkpoint and only invokes read-only RPC',async()=>{
 const f=await chainFixture();const r=await createChainReader(f.env,{fetch:f.fetcher,now:()=>f.now}).readOffer('1',f.seller.publicKey());
 assert.equal(r.ledger,100);assert.equal(r.seller,f.seller.publicKey());assert.equal(r.keyEpoch,1);assert.deepEqual(r.terms,f.terms);
 assert.deepEqual(f.calls,['getNetwork','getLatestLedger','getLedgerEntries']);
});
test('missing funded entry, wrong response ID, network, bytecode, TTL, storage identity and checkpoint fail closed',async()=>{
 for(const target of ['instanceKey','codeKey','merchantKey','offerKey'] as const){const f=await chainFixture();f.entries.delete(f[target].toXDR('base64'));await assert.rejects(createChainReader(f.env,{fetch:f.fetcher,now:()=>f.now}).readOffer('1',f.seller.publicKey()));}
 for(const kind of ['response-id','mainnet','protocol','stale','missing-close-time','duplicate','wrong-key','expired','regressed','future-modified','future-head','code-bytes','embedded-address','temporary'] as const){
  const f=await chainFixture();const fetcher:typeof fetch=async(url,init)=>{
   const response=await f.fetcher(url,init),v=await response.json() as {id:number;result:Record<string,unknown>};const method=JSON.parse(String(init?.body)).method;
   if(kind==='response-id')v.id++;
   if(method==='getNetwork'){if(kind==='mainnet')v.result.passphrase=Networks.PUBLIC;if(kind==='protocol')v.result.protocolVersion=29;}
   if(method==='getLatestLedger'){if(kind==='stale')v.result.closeTime=String(f.now-61);if(kind==='missing-close-time')delete v.result.closeTime;if(kind==='future-head')v.result.closeTime=String(f.now+31);}
   if(method==='getLedgerEntries'){
    const rows=v.result.entries as {key:string;xdr:string;liveUntilLedgerSeq:number;lastModifiedLedgerSeq:number}[];
    if(kind==='duplicate')rows[3]=rows[0];if(kind==='wrong-key')rows[0].key=f.offerKey.toXDR('base64');if(kind==='expired')rows[0].liveUntilLedgerSeq=99;if(kind==='regressed')v.result.latestLedger=99;if(kind==='future-modified')rows[0].lastModifiedLedgerSeq=101;
    if(kind==='code-bytes'){const code=xdr.LedgerEntryData.fromXDR(rows[1].xdr,'base64');code.contractCode().code(Buffer.from([1]));rows[1].xdr=code.toXDR('base64');}
    if(kind==='embedded-address'||kind==='temporary'){const instance=xdr.LedgerEntryData.fromXDR(rows[0].xdr,'base64');if(kind==='embedded-address')instance.contractData().contract(new Address(StrKey.encodeContract(Buffer.alloc(32,8))).toScAddress());else instance.contractData().durability(xdr.ContractDataDurability.temporary());rows[0].xdr=instance.toXDR('base64');}
   }
   return Response.json(v);
  };
  await assert.rejects(createChainReader(f.env,{fetch:fetcher,now:()=>f.now}).readOffer('1',f.seller.publicKey()),kind);
 }
});
test('wrong configured asset, mismatched offer economics, unknown schema and invalid public configuration refuse',async()=>{
 const f=await chainFixture();
 for(const patch of [{MARKET_ASSETS:StrKey.encodeContract(Buffer.alloc(32,11))},{MARKET_WASM_HASH:'ff'.repeat(32)}])await assert.rejects(createChainReader({...f.env,...patch},{fetch:f.fetcher,now:()=>f.now}).readOffer('1',f.seller.publicKey()));
 for(const patch of [{MARKET_WASM_HASH:''},{MARKET_CONTRACT:f.seller.publicKey()},{MARKET_RPC_URL:'http://localhost'},{MARKET_RPC_URL:'https://x.test/?token=secret'},{ALLOWED_ORIGIN:'https://x.test/path'},{MARKET_ASSETS:''}])assert.throws(()=>validateMarketConfig({...f.env,...patch}));
 f.data(f.offerKey,scMap({...f.offerFields,terms_hash:xdr.ScVal.scvBytes(Buffer.alloc(32,1))}));await assert.rejects(createChainReader(f.env,{fetch:f.fetcher,now:()=>f.now}).readOffer('1',f.seller.publicKey()));
 f.data(f.offerKey,scMap({...f.offerFields,unexpected_private_data:xdr.ScVal.scvString('forbidden')}));await assert.rejects(createChainReader(f.env,{fetch:f.fetcher,now:()=>f.now}).readOffer('1',f.seller.publicKey()));
});
test('HTTP failure, oversized replies, redirects and RPC errors do not fabricate catalog truth',async()=>{
 const f=await chainFixture();
 for(const fetcher of [async()=>new Response('{}',{status:503}),async()=>new Response(' '.repeat(2*1024*1024+1)),async()=>Response.json({jsonrpc:'2.0',id:1,error:{code:-1,message:'test'}})])await assert.rejects(createChainReader(f.env,{fetch:fetcher,now:()=>f.now}).readOffer('1',f.seller.publicKey()));
});
test('edge RPC uses manual redirects and never follows a redirect to another endpoint',async()=>{
 const f=await chainFixture();let attempts=0;
 const edgeFetch:typeof fetch=async(url,init)=>{attempts++;assert.equal(init?.redirect,'manual');return f.fetcher(url,init);};
 const result=await createChainReader(f.env,{fetch:edgeFetch,now:()=>f.now}).readOffer('1',f.seller.publicKey());
 assert.equal(result.ledger,100);assert.equal(attempts,3);
 for(const status of [301,302,303,307,308]){
  attempts=0;const redirected:typeof fetch=async(_url,init)=>{attempts++;assert.equal(init?.redirect,'manual');return new Response(null,{status,headers:{Location:'https://unexpected.test/rpc'}});};
  await assert.rejects(createChainReader(f.env,{fetch:redirected,now:()=>f.now}).readOffer('1',f.seller.publicKey()));assert.equal(attempts,1);
 }
 const followed:typeof fetch=async(url,init)=>{const response=await f.fetcher(url,init);Object.defineProperty(response,'redirected',{value:true});return response;};
 await assert.rejects(createChainReader(f.env,{fetch:followed,now:()=>f.now}).readOffer('1',f.seller.publicKey()));
});
