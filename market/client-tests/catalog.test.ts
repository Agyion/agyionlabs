import {afterEach,expect,it,vi} from 'vitest';
import {Keypair,StrKey} from '@stellar/stellar-sdk';
import {metadataHash,termsHash,publicationBytes,TESTNET_NETWORK_ID,sha256} from '../shared/codec.ts';
import type {Publication} from '../shared/codec.ts';
const seller=Keypair.fromRawEd25519Seed(Buffer.alloc(32,7)),now=1790500000;
const pins={schema:'agyion-public-fade-market-v1',network:'testnet',contract:StrKey.encodeContract(Buffer.alloc(32,9)),wasmHash:'ab'.repeat(32),rpcUrl:'https://soroban-testnet.stellar.org',catalogUrl:'https://market.test',assets:[StrKey.encodeContract(Buffer.alloc(32,10))]};
afterEach(()=>{vi.resetModules();vi.doUnmock('../client/pins.ts');});
async function fixture(){
 vi.doMock('../client/pins.ts',()=>({MARKET_RELEASE_PINS:pins}));const {getMarketRelease}=await import('../client/release.ts');const {createMarketCatalog}=await import('../client/catalog.ts');
 const metadata={title:'Bread',quantity:'One bag',allergens:'Wheat',storage:'Collect today',shopId:'bakery',shopName:'Local bakery',address:'Market Street 1',latE6:41000000,lonE6:29000000,pickupStart:now,pickupEnd:now+3600,timezone:'Europe/Istanbul',accessibility:'Ground floor',imageHash:null};
 const mh=await metadataHash(metadata),terms={asset:pins.assets[0],pot:'15000000',start_price:'60000000',floor_price:'-15000000',slope_num:'100000',slope_den:'1',duration_ledgers:1000,lease_ledgers:12,metadata_hash:mh},th=await termsHash(terms);
 const p:Publication={version:1,action:'publish-offer',networkId:TESTNET_NETWORK_ID,contract:pins.contract,offerId:'1',seller:seller.publicKey(),keyEpoch:1,revision:1,termsHash:th,metadataHash:mh,issuedAt:now,expiresAt:now+300,nonce:'02'.repeat(32),metadata};
 const signature=seller.sign(Buffer.from(publicationBytes(p))).toString('hex'),key=seller.rawPublicKey().toString('hex');
 const record={publication:p,signature,merchantKey:key,chain:{ledger:100,ledgerClosedAt:now,seller:p.seller,merchantKey:key,keyEpoch:1,offerId:'1',terms,termsHash:th,state:0,startLedger:90,deadlineLedger:1090},verifiedAt:now,authority:'catalog-only'};
 const fetcher=vi.fn(async()=>Response.json({records:[record],next:null,authority:'catalog-only'}));
 return {record,p,signature,fetcher,client:createMarketCatalog(getMarketRelease(),{fetch:fetcher,now:()=>now}),createMarketCatalog,release:getMarketRelease()};
}
it('verifies actual signatures and immutable terms but labels results catalog-only and never invokes a wallet',async()=>{
 const f=await fixture();const list=await f.client.list({bbox:[28000000,40000000,30000000,42000000],shop:{id:'bakery',seller:f.p.seller}});
 expect(list.records).toHaveLength(1);expect(list.records[0].trust).toBe('signed-catalog-snapshot');expect(Object.isFrozen(list.records[0].publication.metadata)).toBe(true);
 expect(f.fetcher).toHaveBeenCalledWith(expect.stringContaining('https://market.test/v1/offers?'),expect.objectContaining({credentials:'omit',redirect:'error',cache:'no-store'}));
 expect(()=>f.createMarketCatalog({...f.release})).toThrow('PINNED_MARKET_RELEASE_REQUIRED');
});
it('tampered location, economics, signature, contract, asset and expiry reject the whole result',async()=>{
 for(const kind of ['location','terms','signature','scope','asset','expired'] as const){const f=await fixture();
  if(kind==='location')f.record.publication.metadata.latE6++;if(kind==='terms')f.record.chain.terms.pot='1';if(kind==='signature')f.record.signature='00'.repeat(64);if(kind==='scope')f.record.publication.contract=pins.assets[0];if(kind==='asset')f.record.chain.terms.asset=pins.contract;if(kind==='expired')f.record.publication.expiresAt=now;
  await expect(f.client.list()).rejects.toThrow();
 }
});
it('query validation and abort happen before network; duplicate records/cursors do not become navigation',async()=>{
 const f=await fixture();await expect(f.client.list({bbox:[0,0,1.1,2]})).rejects.toThrow();await expect(f.client.list({shop:{id:'../private',seller:f.p.seller}})).rejects.toThrow();
 const control=new AbortController();control.abort();await expect(f.client.list({},control.signal)).rejects.toThrow();expect(f.fetcher).not.toHaveBeenCalled();
 f.fetcher.mockImplementation(async()=>Response.json({records:[f.record,f.record],next:null,authority:'catalog-only'}));await expect(f.client.list()).rejects.toThrow();
 f.fetcher.mockImplementation(async()=>Response.json({records:[f.record],next:'2',authority:'catalog-only'}));await expect(f.client.list()).rejects.toThrow('CATALOG_CURSOR_MISMATCH');
});
it('historical acceptance receipts bind exact payload/signature hashes and scope after listing expiry',async()=>{
 const f=await fixture(),digest=await sha256(publicationBytes(f.p)),signatureHash=await sha256(Buffer.from(f.signature,'hex'));
 const receipt={authority:'accepted-publication',networkId:TESTNET_NETWORK_ID,contract:pins.contract,offerId:'1',seller:f.p.seller,keyEpoch:1,revision:1,digest,signatureHash,expiresAt:now-1,acceptedAt:now-300};
 f.fetcher.mockImplementation(async()=>Response.json({publicationReceipt:receipt}));expect(await f.client.receipt(digest)).toEqual(receipt);
 receipt.contract=pins.assets[0];await expect(f.client.receipt(digest)).rejects.toThrow('PUBLICATION_RECEIPT_SCOPE_MISMATCH');
});
it('detail and publication response cannot swap another offer, and oversized/error replies fail closed',async()=>{
 const f=await fixture();f.fetcher.mockImplementation(async()=>Response.json({record:f.record}));await expect(f.client.detail('2')).rejects.toThrow('CATALOG_OFFER_MISMATCH');
 f.fetcher.mockImplementation(async()=>Response.json({record:f.record,idempotent:false}));expect((await f.client.publish(f.p,f.signature)).publication).toEqual(f.p);
 f.fetcher.mockImplementation(async()=>new Response(' '.repeat(1024*1024+1)));await expect(f.client.list()).rejects.toThrow('CATALOG_RESPONSE_TOO_LARGE');
 f.fetcher.mockImplementation(async()=>new Response('{}',{status:503}));await expect(f.client.list()).rejects.toThrow('CATALOG_UNAVAILABLE');
});
it('current publication is an explicitly untrusted revision hint with exact pinned scope and nullable shape',async()=>{
 const f=await fixture();const empty={authority:'publication-revision-hint',networkId:TESTNET_NETWORK_ID,contract:f.release.contract,offerId:'1',seller:null,revision:0,digest:null,keyEpoch:null,lastAcceptedAt:null};
 f.fetcher.mockImplementation(async()=>Response.json({revision:empty}));expect(await f.client.currentPublication('1')).toEqual(empty);
 const latest={...empty,seller:f.p.seller,revision:2,digest:'12'.repeat(32),keyEpoch:1,lastAcceptedAt:now-400};
 f.fetcher.mockImplementation(async()=>Response.json({revision:latest}));const result=await f.client.currentPublication('1');expect(result).toEqual(latest);expect(Object.isFrozen(result)).toBe(true);
 expect(f.fetcher).toHaveBeenLastCalledWith('https://market.test/v1/revisions/1',expect.objectContaining({credentials:'omit',cache:'no-store',redirect:'error'}));
 for(const patch of [{networkId:'ab'.repeat(32)},{contract:pins.assets[0]},{offerId:'2'},{seller:null},{revision:0},{revision:1.1},{keyEpoch:0},{digest:null},{lastAcceptedAt:0},{authority:'accepted-publication'},{metadata:f.p.metadata}]){
  f.fetcher.mockImplementation(async()=>Response.json({revision:{...latest,...patch}}));await expect(f.client.currentPublication('1')).rejects.toThrow();
 }
 for(const patch of [{seller:f.p.seller},{digest:'12'.repeat(32)},{keyEpoch:1},{lastAcceptedAt:now}]){
  f.fetcher.mockImplementation(async()=>Response.json({revision:{...empty,...patch}}));await expect(f.client.currentPublication('1')).rejects.toThrow();
 }
 const calls=f.fetcher.mock.calls.length;await expect(f.client.currentPublication('0')).rejects.toThrow();await expect(f.client.currentPublication('01')).rejects.toThrow();expect(f.fetcher.mock.calls.length).toBe(calls);
});
it('a correctly signed record outside the requested shop or map bounds is rejected',async()=>{
 const f=await fixture();await expect(f.client.list({shop:{id:'another-shop',seller:f.p.seller}})).rejects.toThrow('CATALOG_QUERY_SCOPE_MISMATCH');
 await expect(f.client.list({shop:{id:'bakery',seller:Keypair.random().publicKey()}})).rejects.toThrow('CATALOG_QUERY_SCOPE_MISMATCH');
 await expect(f.client.list({bbox:[0,0,1000000,1000000]})).rejects.toThrow('CATALOG_QUERY_SCOPE_MISMATCH');
});
