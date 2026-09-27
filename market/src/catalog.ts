import type { Publication } from '../shared/codec.ts';
import { exact, metadataHash, parsePublication, publicationBytes, sha256, termsHash, verifyPublication, TESTNET_NETWORK_ID, decimal, address, hex32, uint32 } from '../shared/codec.ts';
import { CatalogError } from './types.ts';
import type { MarketEnv, ChainReader, CatalogRecord } from './types.ts';
const MAX_BODY=8192;
function reject(ok:unknown,status:number,code:string):asserts ok { if(!ok) throw new CatalogError(status,code); }
async function body(request:Request):Promise<unknown> {
 reject(request.headers.get('content-type')?.split(';')[0].trim()==='application/json',415,'JSON_REQUIRED');
 const length=request.headers.get('content-length');reject(length===null||(/^[0-9]+$/.test(length)&&Number(length)<=MAX_BODY),413,'BODY_TOO_LARGE');
 reject(request.body,400,'EMPTY_BODY'); const reader=request.body.getReader(); const chunks:Uint8Array[]=[];let size=0;
 let timer:ReturnType<typeof setTimeout>|undefined;
 try {
  return await Promise.race([(async()=>{
   for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;reject(size<=MAX_BODY,413,'BODY_TOO_LARGE');chunks.push(value);}
   const all=new Uint8Array(size);let i=0;for(const chunk of chunks){all.set(chunk,i);i+=chunk.length;}
   return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));
  })(),new Promise<never>((_,no)=>{timer=setTimeout(()=>{void reader.cancel();no(new CatalogError(408,'BODY_TIMEOUT'));},10000);})]);
 } finally {clearTimeout(timer);await reader.cancel().catch(()=>{});reader.releaseLock();}
}
const offerKey=(id:string)=>decimal(id).padStart(20,'0');
function record(row:{record_json:string}|null):CatalogRecord|null {return row?JSON.parse(row.record_json) as CatalogRecord:null;}
export function createCatalog(env:MarketEnv,chain:ChainReader,now=()=>Math.floor(Date.now()/1000)) {
 async function publish(request:Request) {
  const raw=await body(request);let packet:Record<string,unknown>,p:Publication;
  try{packet=exact(raw,['publication','signature']);p=parsePublication(packet.publication);}catch{throw new CatalogError(400,'INVALID_PUBLICATION');}
  reject(typeof packet.signature==='string'&&/^[0-9a-f]{128}$/.test(packet.signature),400,'INVALID_SIGNATURE');
  const signature=packet.signature,time=now();
  reject(p.contract===env.MARKET_CONTRACT,400,'WRONG_MARKET');
  reject(p.issuedAt<=time+60&&p.issuedAt>=time-300&&p.expiresAt>time&&p.metadata.pickupEnd>time,400,'EXPIRED_PUBLICATION');
  reject(await metadataHash(p.metadata)===p.metadataHash,400,'METADATA_MISMATCH');
  const observed=await chain.readOffer(p.offerId,p.seller);
  reject(observed.seller===p.seller&&observed.offerId===p.offerId&&observed.keyEpoch===p.keyEpoch,409,'CHAIN_IDENTITY_MISMATCH');
  reject(observed.termsHash===p.termsHash&&observed.terms.metadata_hash===p.metadataHash&&await termsHash(observed.terms)===p.termsHash,409,'CHAIN_TERMS_MISMATCH');
  reject(Number.isInteger(observed.ledger)&&observed.ledger>0&&observed.ledgerClosedAt<=time+30&&observed.ledgerClosedAt>=time-60,503,'CHAIN_STALE');
  reject(observed.state===0&&observed.deadlineLedger>observed.ledger,409,'OFFER_UNAVAILABLE');
  reject(await verifyPublication(p,signature,observed.merchantKey),401,'INVALID_SIGNATURE');
  reject((await env.WRITE_RATE.limit({key:`merchant:${p.seller}`})).success,429,'RATE_LIMITED');
  const digest=await sha256(publicationBytes(p)),key=offerKey(p.offerId),verifiedAt=now();
  reject(p.expiresAt>verifiedAt&&p.metadata.pickupEnd>verifiedAt,400,'EXPIRED_PUBLICATION');
  reject(observed.ledgerClosedAt>=verifiedAt-60,503,'CHAIN_STALE');
  const output:CatalogRecord={publication:p,signature,merchantKey:observed.merchantKey,chain:observed,verifiedAt,authority:'catalog-only'};
  try {
   await env.DB.prepare(`INSERT INTO publications(network,contract,offer_key,seller,key_epoch,revision,nonce,digest,expires_at,metadata_hash,shop_id,lat_e6,lon_e6,record_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(TESTNET_NETWORK_ID,p.contract,key,p.seller,p.keyEpoch,p.revision,p.nonce,digest,p.expiresAt,p.metadataHash,p.metadata.shopId,p.metadata.latE6,p.metadata.lonE6,JSON.stringify(output)).run();
   return {record:output,idempotent:false};
  } catch(error) {
   // Only the exact signed request at the current revision is an idempotent retry.
   // Database failures must not become false success, nor may old revisions resurrect.
   const current=await env.DB.prepare('SELECT digest,revision,record_json FROM listings WHERE network=? AND contract=? AND offer_key=?').bind(TESTNET_NETWORK_ID,p.contract,key).first<{digest:string;revision:number;record_json:string}>();
   if(current?.revision===p.revision&&current.digest===digest) return {record:record(current),idempotent:true};
   if(error instanceof Error&&/catalog_(revision|metadata)_conflict|UNIQUE constraint failed/.test(error.message)) throw new CatalogError(409,'REVISION_OR_NONCE_CONFLICT');
   throw error;
  }
 }
 async function get(url:URL) {
  if(url.pathname.startsWith('/v1/revisions/')){
   reject(url.search==='',400,'UNEXPECTED_QUERY');const id=url.pathname.slice('/v1/revisions/'.length);let key:string;
   try{key=offerKey(id);reject(BigInt(id)>0n,400,'INVALID_OFFER_ID');}catch{throw new CatalogError(400,'INVALID_OFFER_ID');}
   // Includes expired publications. This only hints the next catalog revision;
   // it neither proves the offer exists nor authorizes a merchant or transaction.
   const row=await env.DB.prepare('SELECT digest,revision,record_json FROM listings WHERE network=? AND contract=? AND offer_key=?').bind(TESTNET_NETWORK_ID,env.MARKET_CONTRACT,key).first<{digest:string;revision:number;record_json:string}>();
   const scope={authority:'publication-revision-hint',networkId:TESTNET_NETWORK_ID,contract:env.MARKET_CONTRACT,offerId:id};
   if(!row)return {revision:{...scope,seller:null,revision:0,digest:null,keyEpoch:null,lastAcceptedAt:null}};
   const accepted=record(row)!,p=parsePublication(accepted.publication),digest=hex32(row.digest),revision=uint32(row.revision,1);
   reject(p.contract===env.MARKET_CONTRACT&&p.offerId===id&&p.revision===revision&&await sha256(publicationBytes(p))===digest,503,'CATALOG_UNAVAILABLE');
   return {revision:{...scope,seller:p.seller,revision,digest,keyEpoch:p.keyEpoch,lastAcceptedAt:uint32(accepted.verifiedAt,1)}};
  }
  if(url.pathname.startsWith('/v1/publications/')){
   reject(url.search==='',400,'UNEXPECTED_QUERY');let digest:string;
   try{digest=hex32(url.pathname.slice('/v1/publications/'.length));}catch{throw new CatalogError(400,'INVALID_PUBLICATION_DIGEST');}
   const row=await env.DB.prepare('SELECT record_json FROM publications WHERE network=? AND contract=? AND digest=?').bind(TESTNET_NETWORK_ID,env.MARKET_CONTRACT,digest).first<{record_json:string}>();
   reject(row,404,'NOT_FOUND');const accepted=record(row)!,p=accepted.publication;
   return {publicationReceipt:{authority:'accepted-publication',networkId:p.networkId,contract:p.contract,offerId:p.offerId,seller:p.seller,keyEpoch:p.keyEpoch,revision:p.revision,digest,signatureHash:await sha256(Uint8Array.from(accepted.signature.match(/../g)!.map(b=>parseInt(b,16)))),expiresAt:p.expiresAt,acceptedAt:accepted.verifiedAt}};
  }
  if(url.pathname.startsWith('/v1/offers/')) {
   reject(url.search==='',400,'UNEXPECTED_QUERY');const id=url.pathname.slice('/v1/offers/'.length);let key:string;
   try {key=offerKey(id);}catch{throw new CatalogError(400,'INVALID_OFFER_ID');}
   const row=await env.DB.prepare('SELECT record_json FROM listings WHERE network=? AND contract=? AND offer_key=? AND expires_at>?').bind(TESTNET_NETWORK_ID,env.MARKET_CONTRACT,key,now()).first<{record_json:string}>();
   reject(row,404,'NOT_FOUND');return {record:record(row)};
  }
  reject(url.pathname==='/v1/offers',404,'NOT_FOUND');
  const allowed=['bbox','shop','seller','after','limit'];for(const key of url.searchParams.keys())reject(allowed.includes(key)&&url.searchParams.getAll(key).length===1,400,'INVALID_QUERY');
  const rawLimit=url.searchParams.get('limit')??'20';reject(/^[1-9][0-9]?$/.test(rawLimit)&&Number(rawLimit)<=50,400,'INVALID_LIMIT');const limit=Number(rawLimit);
  let after='';try {if(url.searchParams.has('after'))after=offerKey(url.searchParams.get('after')!);}catch{throw new CatalogError(400,'INVALID_CURSOR');}
  const filters=['network=?','contract=?','expires_at>?','offer_key>?'],values:unknown[]=[TESTNET_NETWORK_ID,env.MARKET_CONTRACT,now(),after];
  const shop=url.searchParams.get('shop'),seller=url.searchParams.get('seller');
  reject((shop===null)===(seller===null),400,'SHOP_SELLER_REQUIRED');
  if(shop!==null){reject(/^[a-z0-9][a-z0-9-]{0,63}$/.test(shop),400,'INVALID_SHOP');try{address(seller);}catch{throw new CatalogError(400,'INVALID_SELLER');}filters.push('shop_id=? AND seller=?');values.push(shop,seller);}
  const bbox=url.searchParams.get('bbox');if(bbox!==null){
   const parts=bbox.split(',');reject(parts.length===4&&parts.every(x=>/^(0|-?[1-9][0-9]*)$/.test(x)),400,'INVALID_BBOX');
   const [west,south,east,north]=parts.map(Number);reject([west,south,east,north].every(Number.isSafeInteger)&&west>=-180000000&&east<=180000000&&south>=-90000000&&north<=90000000&&west<east&&south<north&&east-west<=5000000&&north-south<=5000000,400,'INVALID_BBOX');
   filters.push('lon_e6>=? AND lon_e6<=? AND lat_e6>=? AND lat_e6<=?');values.push(west,east,south,north);
  }
  const rows=await env.DB.prepare(`SELECT record_json FROM listings WHERE ${filters.join(' AND ')} ORDER BY offer_key ASC LIMIT ?`).bind(...values,limit+1).all<{record_json:string}>();
  const results=rows.results.slice(0,limit).map(r=>record(r)!);return {records:results,next:rows.results.length>limit?results.at(-1)!.publication.offerId:null,authority:'catalog-only'};
 }
 return {async fetch(request:Request):Promise<Response> {
  const headers=new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Access-Control-Allow-Origin':env.ALLOWED_ORIGIN,'Vary':'Origin'});
  try {
   const url=new URL(request.url);reject(url.pathname==='/v1/offers'||/^\/v1\/(offers|publications|revisions)\/[^/]+$/.test(url.pathname),404,'NOT_FOUND');
   reject(url.search.length<=512,400,'INVALID_QUERY');
   if(request.method==='OPTIONS'){headers.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');headers.set('Access-Control-Allow-Headers','Content-Type');return new Response(null,{status:204,headers});}
   reject(request.method==='GET'||(request.method==='POST'&&url.pathname==='/v1/offers'&&!url.search),405,'METHOD_NOT_ALLOWED');
   const write=request.method==='POST';reject(!write||!request.headers.has('origin')||request.headers.get('origin')===env.ALLOWED_ORIGIN,403,'ORIGIN_REJECTED');
   // Provider-local best-effort abuse controls, never an authorization or economic guarantee.
   const limiter=write?env.WRITE_RATE:env.READ_RATE;reject(limiter&&typeof limiter.limit==='function',503,'RATE_LIMIT_UNAVAILABLE');
   const ip=request.headers.get('CF-Connecting-IP')??'unknown';reject((await limiter.limit({key:`${write?'write':'read'}:${ip}`})).success,429,'RATE_LIMITED');
   const result=write?await publish(request):await get(url);return Response.json(result,{status:200,headers});
  } catch(error) {
   const status=error instanceof CatalogError?error.status:error instanceof SyntaxError?400:503;
   return Response.json({error:error instanceof CatalogError?error.code:status===400?'INVALID_JSON':'CATALOG_UNAVAILABLE'},{status,headers});
  }
 }};
}
