/** Discovery only. A catalog key/signature is not on-chain merchant verification. */
import {Buffer} from 'buffer';
import {address,decimal,exact,hex32,metadataHash,parsePublication,publicationBytes,requireValue,sha256,termsHash,uint32,verifyPublication,TESTNET_NETWORK_ID} from '../shared/codec.ts';
import type {OfferTerms,Publication} from '../shared/codec.ts';
import {assertMarketRelease,getMarketRelease} from './release.ts';
import type {MarketRelease} from './release.ts';
export interface CatalogListing {
 readonly publication:Publication;readonly signature:string;readonly merchantKey:string;
 readonly terms:OfferTerms;readonly observedLedger:number;readonly indexedAt:number;
 readonly trust:'signed-catalog-snapshot';
}
export interface PublicationReceipt {
 readonly authority:'accepted-publication';readonly networkId:string;readonly contract:string;readonly offerId:string;
 readonly seller:string;readonly keyEpoch:number;readonly revision:number;readonly digest:string;
 readonly signatureHash:string;readonly expiresAt:number;readonly acceptedAt:number;
}
/** A catalog-only hint. A returned revision is not on-chain authority or proof. */
export interface CurrentPublication {
 readonly authority:'publication-revision-hint';readonly networkId:string;readonly contract:string;readonly offerId:string;
 readonly seller:string|null;readonly revision:number;readonly digest:string|null;
 readonly keyEpoch:number|null;readonly lastAcceptedAt:number|null;
}
export interface MarketQuery {bbox?:readonly [number,number,number,number];shop?:{id:string;seller:string};after?:string;limit?:number}
function terms(value:unknown):OfferTerms {
 const v=exact(value,['asset','pot','start_price','floor_price','slope_num','slope_den','duration_ledgers','lease_ledgers','metadata_hash']);
 return {asset:address(v.asset,true),pot:decimal(v.pot,128,true),start_price:decimal(v.start_price,128,true),floor_price:decimal(v.floor_price,128,true),slope_num:decimal(v.slope_num,128,true),slope_den:decimal(v.slope_den,128,true),duration_ledgers:uint32(v.duration_ledgers,1),lease_ledgers:uint32(v.lease_ledgers),metadata_hash:hex32(v.metadata_hash)};
}
async function listing(value:unknown,release:MarketRelease,now:number):Promise<CatalogListing>{
 const r=exact(value,['publication','signature','merchantKey','chain','verifiedAt','authority']);requireValue(r.authority==='catalog-only','UNEXPECTED_CATALOG_AUTHORITY');
 const p=parsePublication(r.publication);requireValue(p.contract===release.contract&&p.expiresAt>now&&p.issuedAt<=now+60,'STALE_OR_WRONG_CATALOG_SCOPE');
 requireValue(typeof r.signature==='string'&&/^[0-9a-f]{128}$/.test(r.signature));const key=hex32(r.merchantKey);
 const c=exact(r.chain,['ledger','ledgerClosedAt','seller','merchantKey','keyEpoch','offerId','terms','termsHash','state','startLedger','deadlineLedger']);
 const t=terms(c.terms),ledger=uint32(c.ledger,1),indexedAt=uint32(r.verifiedAt,1);
 requireValue(c.seller===p.seller&&c.merchantKey===key&&c.keyEpoch===p.keyEpoch&&c.offerId===p.offerId&&c.termsHash===p.termsHash&&t.metadata_hash===p.metadataHash&&release.assets.includes(t.asset),'CATALOG_BINDING_MISMATCH');
 uint32(c.ledgerClosedAt,1);uint32(c.startLedger,1);uint32(c.deadlineLedger,1);requireValue(uint32(c.state)<=3&&indexedAt<=now+60);
 requireValue(await metadataHash(p.metadata)===p.metadataHash&&await termsHash(t)===p.termsHash&&await verifyPublication(p,r.signature,key),'INVALID_CATALOG_SIGNATURE');
 // This checks integrity against the key carried by the catalog. The wallet
 // lifecycle separately obtains the registered key and state from the pinned chain.
 return Object.freeze({publication:Object.freeze({...p,metadata:Object.freeze(p.metadata)}),signature:r.signature,merchantKey:key,terms:Object.freeze(t),observedLedger:ledger,indexedAt,trust:'signed-catalog-snapshot'});
}
export function createMarketCatalog(release:MarketRelease=getMarketRelease(),options:{fetch?:typeof fetch;now?:()=>number}={}){
 assertMarketRelease(release);const fetcher=options.fetch??globalThis.fetch.bind(globalThis),now=options.now??(()=>Math.floor(Date.now()/1000));
 async function request(path:string,init:RequestInit={},signal?:AbortSignal):Promise<unknown>{
  signal?.throwIfAborted();const control=new AbortController(),cancel=()=>control.abort(signal?.reason);signal?.addEventListener('abort',cancel,{once:true});const timer=setTimeout(()=>control.abort(new Error('MARKET_REQUEST_TIMEOUT')),15000);
  try{
   const response=await fetcher(release.catalogUrl+path,{...init,headers:{'Content-Type':'application/json'},credentials:'omit',redirect:'error',cache:'no-store',signal:control.signal});
   requireValue(response.ok&&response.body,'CATALOG_UNAVAILABLE');const reader=response.body.getReader();const chunks:Uint8Array[]=[];let length=0;
   try{for(;;){const item=await reader.read();if(item.done)break;length+=item.value.byteLength;requireValue(length<=1024*1024,'CATALOG_RESPONSE_TOO_LARGE');chunks.push(item.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
   control.signal.throwIfAborted();return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
 }
 async function receipt(digest:string,signal?:AbortSignal):Promise<PublicationReceipt>{
  hex32(digest);const response=exact(await request('/v1/publications/'+digest,{},signal),['publicationReceipt']);const r=exact(response.publicationReceipt,['authority','networkId','contract','offerId','seller','keyEpoch','revision','digest','signatureHash','expiresAt','acceptedAt']);
  requireValue(r.authority==='accepted-publication'&&r.networkId===release.networkId&&r.contract===release.contract&&r.digest===digest,'PUBLICATION_RECEIPT_SCOPE_MISMATCH');
  return Object.freeze({authority:'accepted-publication',networkId:TESTNET_NETWORK_ID,contract:release.contract,offerId:decimal(r.offerId),seller:address(r.seller),keyEpoch:uint32(r.keyEpoch,1),revision:uint32(r.revision,1),digest,signatureHash:hex32(r.signatureHash),expiresAt:uint32(r.expiresAt,1),acceptedAt:uint32(r.acceptedAt,1)});
 }
 return Object.freeze({
  async currentPublication(id:string,signal?:AbortSignal):Promise<CurrentPublication>{
   decimal(id);requireValue(BigInt(id)>0n,'INVALID_OFFER_ID');
   const response=exact(await request('/v1/revisions/'+id,{},signal),['revision']);
   const r=exact(response.revision,['authority','networkId','contract','offerId','seller','revision','digest','keyEpoch','lastAcceptedAt']);
   requireValue(r.authority==='publication-revision-hint'&&r.networkId===release.networkId&&r.contract===release.contract&&r.offerId===id,'PUBLICATION_REVISION_SCOPE_MISMATCH');
   const revision=uint32(r.revision),scope={authority:'publication-revision-hint' as const,networkId:release.networkId,contract:release.contract,offerId:id};
   if(revision===0){requireValue(r.seller===null&&r.digest===null&&r.keyEpoch===null&&r.lastAcceptedAt===null,'PUBLICATION_REVISION_SHAPE');return Object.freeze({...scope,seller:null,revision:0,digest:null,keyEpoch:null,lastAcceptedAt:null});}
   return Object.freeze({...scope,seller:address(r.seller),revision,digest:hex32(r.digest),keyEpoch:uint32(r.keyEpoch,1),lastAcceptedAt:uint32(r.lastAcceptedAt,1)});
  },
  async list(query:MarketQuery={},signal?:AbortSignal){
   requireValue(query&&typeof query==='object'&&Object.keys(query).every(k=>['bbox','shop','after','limit'].includes(k)),'INVALID_MARKET_QUERY');const params=new URLSearchParams();
   if(query.limit!==undefined){requireValue(Number.isInteger(query.limit)&&query.limit>0&&query.limit<=50);params.set('limit',String(query.limit));}
   if(query.after!==undefined)params.set('after',decimal(query.after));
   if(query.bbox){const [west,south,east,north]=query.bbox;requireValue(query.bbox.length===4&&query.bbox.every(Number.isSafeInteger)&&west>=-180000000&&east<=180000000&&south>=-90000000&&north<=90000000&&west<east&&south<north&&east-west<=5000000&&north-south<=5000000);params.set('bbox',query.bbox.join(','));}
   if(query.shop){exact(query.shop,['id','seller']);requireValue(/^[a-z0-9][a-z0-9-]{0,63}$/.test(query.shop.id));params.set('shop',query.shop.id);params.set('seller',address(query.shop.seller));}
   const requestedShop=query.shop?{...query.shop}:null,requestedBox=query.bbox?[...query.bbox]:null;
   const r=exact(await request('/v1/offers'+(params.size?'?'+params:''),{},signal),['records','next','authority']);requireValue(r.authority==='catalog-only'&&Array.isArray(r.records)&&r.records.length<=(query.limit??20));
   const records=await Promise.all(r.records.map(v=>listing(v,release,now())));requireValue(new Set(records.map(r=>r.publication.offerId)).size===records.length);
   for(const row of records){const p=row.publication,m=p.metadata;requireValue(!requestedShop||(p.seller===requestedShop.seller&&m.shopId===requestedShop.id),'CATALOG_QUERY_SCOPE_MISMATCH');requireValue(!requestedBox||(m.lonE6>=requestedBox[0]&&m.latE6>=requestedBox[1]&&m.lonE6<=requestedBox[2]&&m.latE6<=requestedBox[3]),'CATALOG_QUERY_SCOPE_MISMATCH');}
   for(let i=0;i<records.length;i++)requireValue(BigInt(records[i].publication.offerId)>BigInt(i?records[i-1].publication.offerId:query.after??'-1'),'CATALOG_ORDER_MISMATCH');
   const next=r.next===null?null:decimal(r.next);requireValue(next===null||(records.length>0&&next===records.at(-1)!.publication.offerId),'CATALOG_CURSOR_MISMATCH');
   return Object.freeze({records:Object.freeze(records),next});
  },
  async detail(id:string,signal?:AbortSignal){decimal(id);const r=exact(await request('/v1/offers/'+id,{},signal),['record']);const result=await listing(r.record,release,now());requireValue(result.publication.offerId===id,'CATALOG_OFFER_MISMATCH');return result;},
  receipt,
  /** Used by the durable publication lifecycle, never an automatic retry. */
  async publish(p:Publication,signature:string,signal?:AbortSignal){
   const publication=parsePublication(p);requireValue(publication.contract===release.contract&&/^[0-9a-f]{128}$/.test(signature));requireValue(await metadataHash(publication.metadata)===publication.metadataHash);
   const value=exact(await request('/v1/offers',{method:'POST',body:JSON.stringify({publication,signature})},signal),['record','idempotent']);requireValue(typeof value.idempotent==='boolean');
   const accepted=await listing(value.record,release,now());requireValue(await sha256(publicationBytes(accepted.publication))===await sha256(publicationBytes(publication))&&accepted.signature===signature,'PUBLICATION_RESPONSE_MISMATCH');return accepted;
  },
 });
}
