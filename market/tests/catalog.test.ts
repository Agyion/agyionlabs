import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Keypair,StrKey} from '@stellar/stellar-sdk';
import {metadataHash,termsHash,publicationBytes,parsePublication,TESTNET_NETWORK_ID} from '../shared/codec.ts';
import type {Publication} from '../shared/codec.ts';
import {createCatalog} from '../src/catalog.ts';
import type {MarketEnv,ChainObservation} from '../src/types.ts';
import {sqliteDatabase} from './sqlite.ts';
const now=1790500000,merchant=Keypair.fromRawEd25519Seed(Buffer.alloc(32,7));
async function fixture(){
 const db=sqliteDatabase();const contract=StrKey.encodeContract(Buffer.alloc(32,9));
 const metadata={title:'Bread pickup',quantity:'One bag',allergens:'Wheat',storage:'Collect today',shopId:'bakery-01',shopName:'Local bakery',address:"Market Street ' OR 1=1 --",latE6:41000000,lonE6:29000000,pickupStart:now,pickupEnd:now+3600,timezone:'Europe/Istanbul',accessibility:'Ground floor',imageHash:null};
 const mh=await metadataHash(metadata),terms={asset:StrKey.encodeContract(Buffer.alloc(32,10)),pot:'15000000',start_price:'60000000',floor_price:'-15000000',slope_num:'100000',slope_den:'1',duration_ledgers:1000,lease_ledgers:12,metadata_hash:mh};
 const p:Publication={version:1,action:'publish-offer',networkId:TESTNET_NETWORK_ID,contract,offerId:'1',seller:merchant.publicKey(),keyEpoch:1,revision:1,termsHash:await termsHash(terms),metadataHash:mh,issuedAt:now,expiresAt:now+300,nonce:'01'.repeat(32),metadata};
 const observation:ChainObservation={ledger:100,ledgerClosedAt:now,seller:p.seller,merchantKey:merchant.rawPublicKey().toString('hex'),keyEpoch:1,offerId:'1',terms,termsHash:p.termsHash,state:0,startLedger:90,deadlineLedger:1090};
 let reads=0;const rate={async limit(){return {success:true};}};
 const env:MarketEnv={DB:db,READ_RATE:rate,WRITE_RATE:rate,MARKET_CONTRACT:contract,MARKET_WASM_HASH:'aa'.repeat(32),MARKET_RPC_URL:'https://soroban-testnet.stellar.org',MARKET_ASSETS:terms.asset,ALLOWED_ORIGIN:'https://agyionlabs.dev'};
 const reader={async readOffer(){reads++;return observation;}};
 const catalog=createCatalog(env,reader,()=>now);
 function request(value:Publication=p,override?:unknown){return new Request('https://catalog.test/v1/offers',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(override??{publication:value,signature:merchant.sign(Buffer.from(publicationBytes(value))).toString('hex')})});}
 return {db,env,p,observation,reader,catalog,request,reads:()=>reads};
}
test('real SQLite admits signed verified listing and exact concurrent retries once; returns public scope and bound economics',async()=>{
 const f=await fixture();const results=await Promise.all(Array.from({length:10},()=>f.catalog.fetch(f.request())));
 assert.deepEqual(results.map(x=>x.status),Array(10).fill(200));const bodies=await Promise.all(results.map(x=>x.json())) as {idempotent:boolean}[];
 assert.equal(bodies.filter(x=>!x.idempotent).length,1);assert.equal(f.db.sql.prepare('SELECT count(*) n FROM publications').get()!.n,1);
 const detail=await f.catalog.fetch(new Request('https://catalog.test/v1/offers/1'));const value=await detail.json() as {record:{authority:string;chain:ChainObservation}};
 assert.equal(detail.status,200);assert.equal(value.record.authority,'catalog-only');assert.equal(value.record.chain.terms.start_price,'60000000');
 assert.equal(f.reads(),10); // An idempotency response is not used to skip fresh chain authentication.
});
test('racing conflicting revisions cannot overwrite or consume a nonce; newer revision invalidates old retry',async()=>{
 const f=await fixture();assert.equal((await f.catalog.fetch(f.request())).status,200);
 const p2={...f.p,revision:2,nonce:'02'.repeat(32)};
 const results=await Promise.all([f.catalog.fetch(f.request(p2)),f.catalog.fetch(f.request({...p2,nonce:'03'.repeat(32)}))]);
 assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);assert.equal(f.db.sql.prepare('SELECT count(*) n FROM publications').get()!.n,2);
 assert.equal((await f.catalog.fetch(f.request())).status,409);
 assert.equal((await f.catalog.fetch(f.request({...f.p,revision:4,nonce:'04'.repeat(32)}))).status,409);
});
test('forged signer, seller, key epoch, economic commitment, metadata, settled state, stale chain and unknown offer never publish',async()=>{
 for(const mutate of [
  (f:Awaited<ReturnType<typeof fixture>>)=>{f.observation.merchantKey='12'.repeat(32);},
  (f:Awaited<ReturnType<typeof fixture>>)=>{f.observation.seller=Keypair.random().publicKey();},
  (f:Awaited<ReturnType<typeof fixture>>)=>{f.observation.keyEpoch=2;},
  (f:Awaited<ReturnType<typeof fixture>>)=>{f.observation.terms.start_price='1';},
  (f:Awaited<ReturnType<typeof fixture>>)=>{f.observation.terms.metadata_hash='11'.repeat(32);},
  (f:Awaited<ReturnType<typeof fixture>>)=>{f.observation.state=2;},
  (f:Awaited<ReturnType<typeof fixture>>)=>{f.observation.deadlineLedger=100;},
  (f:Awaited<ReturnType<typeof fixture>>)=>{f.observation.ledgerClosedAt=now-61;},
  (f:Awaited<ReturnType<typeof fixture>>)=>{f.observation.offerId='2';}
 ]){const f=await fixture();mutate(f);const response=await f.catalog.fetch(f.request());assert.notEqual(response.status,200);assert.equal(f.db.sql.prepare('SELECT count(*) n FROM publications').get()!.n,0);}
 const f=await fixture();f.reader.readOffer=async()=>{throw new Error('RPC down with internal URL details');};const response=await f.catalog.fetch(f.request());assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'CATALOG_UNAVAILABLE'});
});
test('same nonce cannot sign another offer; later key epoch registration can republish same immutable metadata',async()=>{
 const f=await fixture();assert.equal((await f.catalog.fetch(f.request())).status,200);f.observation.offerId='2';
 assert.equal((await f.catalog.fetch(f.request({...f.p,offerId:'2'}))).status,409);
 f.observation.offerId='1';f.observation.keyEpoch=2;
 assert.equal((await f.catalog.fetch(f.request({...f.p,keyEpoch:2,revision:2}))).status,200);
});
test('public list bounds bbox, shop, pagination and expiry without wallet; SQL-looking address stays plain data',async()=>{
 const f=await fixture();await f.catalog.fetch(f.request());
 for(const query of ['bbox=28000000,40000000,30000000,42000000',`shop=bakery-01&seller=${f.p.seller}`,'limit=1']){
  const r=await f.catalog.fetch(new Request(`https://catalog.test/v1/offers?${query}`));assert.equal(r.status,200);assert.equal(((await r.json()) as {records:unknown[]}).records.length,1);
 }
 for(const query of ['bbox=-180000000,-90000000,180000000,90000000','bbox=1.1,2,3,4','limit=51','limit=1&limit=2','after=01','shop=x%27%20OR%201=1','secret=private'])assert.equal((await f.catalog.fetch(new Request(`https://catalog.test/v1/offers?${query}`))).status,400);
 assert.equal((await createCatalog(f.env,f.reader,()=>now+301).fetch(new Request('https://catalog.test/v1/offers/1'))).status,404);
});
test('invalid bodies, extra private fields, oversized streams and wrong origins fail before chain/database',async()=>{
 const f=await fixture();
 const valid={publication:f.p,signature:'00'.repeat(64)};
 for(const payload of [{...valid,credentials:'private'},{...valid,publication:{...f.p,networkId:'ff'.repeat(32)}},{...valid,publication:{...f.p,metadata:{...f.p.metadata,title:'<img>'}}}])assert.equal((await f.catalog.fetch(f.request(f.p,payload))).status,400);
 assert.equal((await f.catalog.fetch(new Request('https://catalog.test/v1/offers',{method:'POST',headers:{'content-type':'application/json'},body:' '.repeat(9000)}))).status,413);
 const req=f.request();req.headers.set('origin','https://evil.test');assert.equal((await f.catalog.fetch(req)).status,403);assert.equal(f.reads(),0);
});
test('expired/future publication and missing rate control fail closed; database errors are not success',async()=>{
 const f=await fixture();assert.equal((await f.catalog.fetch(f.request({...f.p,issuedAt:now+61,expiresAt:now+90}))).status,400);
 f.env.WRITE_RATE={async limit(){return {success:false};}};assert.equal((await f.catalog.fetch(f.request())).status,429);assert.equal(f.reads(),0);
 f.env.WRITE_RATE={async limit(){return {success:true};}};f.env.DB={prepare(){throw new Error('DB credentials must not leak');}};
 const r=await f.catalog.fetch(f.request());assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'CATALOG_UNAVAILABLE'});
});
test('publication that expires while RPC is pending never reaches the database',async()=>{
 const f=await fixture();let clock=now;
 const chain={async readOffer(){clock=now+10;return {...f.observation,ledgerClosedAt:clock};}};
 const response=await createCatalog(f.env,chain,()=>clock).fetch(f.request({...f.p,expiresAt:now+5}));
 assert.equal(response.status,400);assert.equal(f.db.sql.prepare('SELECT count(*) n FROM publications').get()!.n,0);
});
test('shop lookup requires its on-chain seller identity rather than merging identical user-chosen shop names',async()=>{
 const f=await fixture();await f.catalog.fetch(f.request());
 assert.equal((await f.catalog.fetch(new Request('https://catalog.test/v1/offers?shop=bakery-01'))).status,400);
 const valid=await f.catalog.fetch(new Request(`https://catalog.test/v1/offers?shop=bakery-01&seller=${f.p.seller}`));assert.equal(valid.status,200);assert.equal(((await valid.json()) as {records:unknown[]}).records.length,1);
 const other=await f.catalog.fetch(new Request(`https://catalog.test/v1/offers?shop=bakery-01&seller=${Keypair.random().publicKey()}`));assert.equal(other.status,200);assert.equal(((await other.json()) as {records:unknown[]}).records.length,0);
});
test('historical publication receipt recovers a lost HTTP result after expiry without republishing',async()=>{
 const f=await fixture();await f.catalog.fetch(f.request()); // Response is deliberately not used as recovery evidence.
 const {sha256}=await import('../shared/codec.ts');const digest=await sha256(publicationBytes(f.p));
 const expired=createCatalog(f.env,f.reader,()=>now+400);
 assert.equal((await expired.fetch(new Request('https://catalog.test/v1/offers/1'))).status,404);
 const response=await expired.fetch(new Request(`https://catalog.test/v1/publications/${digest}`));assert.equal(response.status,200);
 const receipt=await response.json() as {publicationReceipt:{digest:string;revision:number;offerId:string;contract:string;signatureHash:string}};
 assert.deepEqual({digest:receipt.publicationReceipt.digest,revision:receipt.publicationReceipt.revision,offerId:receipt.publicationReceipt.offerId,contract:receipt.publicationReceipt.contract},{digest,revision:1,offerId:'1',contract:f.p.contract});
 assert.equal(receipt.publicationReceipt.signatureHash,await sha256(merchant.sign(Buffer.from(publicationBytes(f.p)))));
 assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(f.reads(),1);assert.equal(f.db.sql.prepare('SELECT count(*) n FROM publications').get()!.n,1);
 for(const bad of ['ab'.repeat(32).toUpperCase(),'ab'.repeat(33),'../../secret'])assert.notEqual((await expired.fetch(new Request(`https://catalog.test/v1/publications/${bad}`))).status,200);
 assert.equal((await expired.fetch(new Request(`https://catalog.test/v1/publications/${'ff'.repeat(32)}`))).status,404);
 const other=createCatalog({...f.env,MARKET_CONTRACT:StrKey.encodeContract(Buffer.alloc(32,11))},f.reader,()=>now+400);assert.equal((await other.fetch(new Request(`https://catalog.test/v1/publications/${digest}`))).status,404);
});
test('revision hints include expired latest publications without exposing metadata or authorizing a write',async()=>{
 const f=await fixture(),url='https://catalog.test/v1/revisions/1';
 const empty=await f.catalog.fetch(new Request(url));assert.equal(empty.status,200);
 assert.deepEqual(await empty.json(),{revision:{authority:'publication-revision-hint',networkId:TESTNET_NETWORK_ID,contract:f.p.contract,offerId:'1',seller:null,revision:0,digest:null,keyEpoch:null,lastAcceptedAt:null}});
 await f.catalog.fetch(f.request());const p2={...f.p,revision:2,nonce:'03'.repeat(32)};await f.catalog.fetch(f.request(p2));
 const expired=createCatalog(f.env,f.reader,()=>now+400),response=await expired.fetch(new Request(url));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 const {sha256}=await import('../shared/codec.ts');assert.deepEqual(await response.json(),{revision:{authority:'publication-revision-hint',networkId:TESTNET_NETWORK_ID,contract:f.p.contract,offerId:'1',seller:f.p.seller,revision:2,digest:await sha256(publicationBytes(p2)),keyEpoch:1,lastAcceptedAt:now}});
 assert.equal(f.reads(),2);assert.equal(f.db.sql.prepare('SELECT count(*) n FROM publications').get()!.n,2);
 for(const id of ['0','01','18446744073709551616','1?extra=x','1/extra'])assert.notEqual((await expired.fetch(new Request('https://catalog.test/v1/revisions/'+id))).status,200);
 const other=createCatalog({...f.env,MARKET_CONTRACT:StrKey.encodeContract(Buffer.alloc(32,11))},f.reader,()=>now+400);assert.equal(((await (await other.fetch(new Request(url))).json()) as {revision:{revision:number}}).revision.revision,0);
 f.env.READ_RATE={async limit(){return {success:false};}};assert.equal((await expired.fetch(new Request(url))).status,429);
});
