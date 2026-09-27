import {test} from 'node:test';
import assert from 'node:assert/strict';
import {xdr} from '@stellar/stellar-sdk';
import worker from '../src/worker.ts';
import {chainFixture} from './chain-fixture.ts';
import {sqliteDatabase} from './sqlite.ts';
import {metadataHash,termsHash,termsBytes,publicationBytes,scMap,TESTNET_NETWORK_ID} from '../shared/codec.ts';
import type {Publication} from '../shared/codec.ts';
test('actual Worker entry dispatches signature → pinned SDK-XDR reader → real SQLite → public GET',async()=>{
 const f=await chainFixture(),db=sqliteDatabase(),now=Math.floor(Date.now()/1000);
 const metadata={title:'Bread',quantity:'One bag',allergens:'Wheat',storage:'Collect today',shopId:'bakery',shopName:'Local bakery',address:'Market Street 1',latE6:41000000,lonE6:29000000,pickupStart:now,pickupEnd:now+3600,timezone:'Europe/Istanbul',accessibility:'Ground floor',imageHash:null};
 const mh=await metadataHash(metadata),terms={...f.terms,metadata_hash:mh},th=await termsHash(terms);
 f.data(f.offerKey,scMap({...f.offerFields,terms:xdr.ScVal.fromXDR(Buffer.from(termsBytes(terms))),terms_hash:xdr.ScVal.scvBytes(Buffer.from(th,'hex'))}));
 const env={...f.env,DB:db};const p:Publication={version:1,action:'publish-offer',networkId:TESTNET_NETWORK_ID,contract:f.contract,offerId:'1',seller:f.seller.publicKey(),keyEpoch:1,revision:1,termsHash:th,metadataHash:mh,issuedAt:now,expiresAt:now+300,nonce:'02'.repeat(32),metadata};
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{const r=await f.fetcher(url,init);const body=await r.json() as {result:{closeTime?:string}};if(body.result.closeTime)body.result.closeTime=String(now);return Response.json(body);};
 try{
  const request=new Request('https://catalog.test/v1/offers',{method:'POST',headers:{'content-type':'application/json',origin:env.ALLOWED_ORIGIN},body:JSON.stringify({publication:p,signature:f.seller.sign(Buffer.from(publicationBytes(p))).toString('hex')})});
  const response=await worker.fetch(request,env);assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
  assert.equal(db.sql.prepare('SELECT count(*) n FROM publications').get()!.n,1);
  const detail=await worker.fetch(new Request('https://catalog.test/v1/offers/1'),env);assert.equal(detail.status,200);
  const result=await detail.json() as {record:{publication:Publication;authority:string}};assert.deepEqual(result.record.publication,p);assert.equal(result.record.authority,'catalog-only');
  assert.equal(detail.headers.get('cache-control'),'no-store');assert.equal(detail.headers.get('access-control-allow-credentials'),null);
 }finally{globalThis.fetch=originalFetch;}
});
test('unconfigured release never exposes an empty success catalog or touches a network',async()=>{
 const f=await chainFixture();const result=await worker.fetch(new Request('https://catalog.test/v1/offers'),{...f.env,MARKET_WASM_HASH:''});
 assert.equal(result.status,503);assert.deepEqual(await result.json(),{error:'CATALOG_UNAVAILABLE'});assert.equal(f.calls.length,0);
});
