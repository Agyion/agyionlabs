/** Public metadata only. The same explicit Soroban SCVal XDR is used by signer and catalog. */
import { Address, Networks, StrKey, hash, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
export const TESTNET_NETWORK_ID = hash(Buffer.from(Networks.TESTNET)).toString('hex');
export const PUBLICATION_PURPOSE = 'agyion:market-listing:v1';
export interface Metadata {
 title:string; quantity:string; allergens:string; storage:string; shopId:string; shopName:string;
 address:string; latE6:number; lonE6:number; pickupStart:number; pickupEnd:number;
 timezone:string; accessibility:string; imageHash:string|null;
}
export interface Publication {
 version:1; action:'publish-offer'; networkId:string; contract:string; offerId:string; seller:string;
 keyEpoch:number; revision:number; termsHash:string; metadataHash:string;
 issuedAt:number; expiresAt:number; nonce:string; metadata:Metadata;
}
export interface OfferTerms {
 asset:string; pot:string; start_price:string; floor_price:string; slope_num:string; slope_den:string;
 duration_ledgers:number; lease_ledgers:number; metadata_hash:string;
}
export function requireValue(ok:unknown,message='Invalid public catalog data'):asserts ok { if(!ok) throw new Error(message); }
export function exact(value:unknown,keys:readonly string[]):Record<string,unknown> {
 requireValue(value!==null&&typeof value==='object'&&!Array.isArray(value));
 const actual=Object.keys(value); requireValue(actual.every(k=>{const d=Object.getOwnPropertyDescriptor(value,k);return d&&Object.hasOwn(d,'value');})); requireValue(actual.length===keys.length&&actual.every(k=>keys.includes(k)));
 return value as Record<string,unknown>;
}
export function hex32(v:unknown):string { requireValue(typeof v==='string'&&/^[0-9a-f]{64}$/.test(v));return v; }
export function uint32(v:unknown,minimum=0):number { requireValue(typeof v==='number'&&Number.isInteger(v)&&v>=minimum&&v<=0xffffffff);return v; }
export function decimal(v:unknown,bits=64,signed=false):string {
 requireValue(typeof v==='string'&&(signed?/^(0|-?[1-9][0-9]*)$/:/^(0|[1-9][0-9]*)$/).test(v)&&v.length<=40);
 const n=BigInt(v),bound=1n<<BigInt(signed?bits-1:bits);requireValue(n>=(signed?-bound:0n)&&n<bound);return v;
}
export function address(v:unknown,contractOnly=false):string {
 requireValue(typeof v==='string'&&(StrKey.isValidContract(v)||(!contractOnly&&StrKey.isValidEd25519PublicKey(v))));return v;
}
function text(v:unknown,max:number,empty=false):string {
 requireValue(typeof v==='string'&&v.length<=(max)&&v.length>=(empty?0:1)&&v===v.trim()&&v===v.normalize('NFC')&&!/[<>\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069\ud800-\udfff]/u.test(v));return v;
}
const metadataKeys=['title','quantity','allergens','storage','shopId','shopName','address','latE6','lonE6','pickupStart','pickupEnd','timezone','accessibility','imageHash'] as const;
export function parseMetadata(value:unknown):Metadata {
 const v=exact(value,metadataKeys); const lat=v.latE6,lon=v.lonE6;
 requireValue(typeof lat==='number'&&Number.isInteger(lat)&&Math.abs(lat)<=90000000&&typeof lon==='number'&&Number.isInteger(lon)&&Math.abs(lon)<=180000000);
 const shopId=text(v.shopId,64);requireValue(/^[a-z0-9][a-z0-9-]*$/.test(shopId));
 const timezone=text(v.timezone,64);requireValue(/^[A-Za-z_]+(?:\/[A-Za-z_+-]+){1,2}$/.test(timezone)||timezone==='UTC');
 const start=uint32(v.pickupStart,1),end=uint32(v.pickupEnd,1);requireValue(end>start&&end-start<=7*86400);
 return {title:text(v.title,120),quantity:text(v.quantity,80),allergens:text(v.allergens,240,true),storage:text(v.storage,240,true),shopId,shopName:text(v.shopName,100),address:text(v.address,240),latE6:lat,lonE6:lon,pickupStart:start,pickupEnd:end,timezone,accessibility:text(v.accessibility,160,true),imageHash:v.imageHash===null?null:hex32(v.imageHash)};
}
const publicationKeys=['version','action','networkId','contract','offerId','seller','keyEpoch','revision','termsHash','metadataHash','issuedAt','expiresAt','nonce','metadata'] as const;
export function parsePublication(value:unknown):Publication {
 const v=exact(value,publicationKeys);requireValue(v.version===1&&v.action==='publish-offer'&&v.networkId===TESTNET_NETWORK_ID);
 const issuedAt=uint32(v.issuedAt,1),expiresAt=uint32(v.expiresAt,1);requireValue(expiresAt>issuedAt&&expiresAt-issuedAt<=3600);
 const nonce=hex32(v.nonce);requireValue(nonce!=='00'.repeat(32));
 return {version:1,action:'publish-offer',networkId:TESTNET_NETWORK_ID,contract:address(v.contract,true),offerId:decimal(v.offerId),seller:address(v.seller),keyEpoch:uint32(v.keyEpoch,1),revision:uint32(v.revision,1),termsHash:hex32(v.termsHash),metadataHash:hex32(v.metadataHash),issuedAt,expiresAt,nonce,metadata:parseMetadata(v.metadata)};
}
export function scMap(fields:Record<string,xdr.ScVal>):xdr.ScVal {
 return xdr.ScVal.scvMap(Object.keys(fields).sort().map(key=>new xdr.ScMapEntry({key:xdr.ScVal.scvSymbol(key),val:fields[key]})));
}
const bytes=(v:string)=>xdr.ScVal.scvBytes(Buffer.from(hex32(v),'hex'));
const str=(v:string)=>xdr.ScVal.scvString(v);
export function metadataBytes(value:unknown):Uint8Array {
 const m=parseMetadata(value); const fields:Record<string,xdr.ScVal>={purpose:str('agyion:market-metadata:v1')};
 for(const k of metadataKeys) { const v=m[k]; fields[k]=v===null?xdr.ScVal.scvVoid():typeof v==='number'?nativeToScVal(v,{type:k==='latE6'||k==='lonE6'?'i32':'u32'}):k==='imageHash'?bytes(v):str(v); }
 return scMap(fields).toXDR();
}
export async function sha256(value:Uint8Array):Promise<string> { return Buffer.from(await crypto.subtle.digest('SHA-256',Uint8Array.from(value))).toString('hex'); }
export async function metadataHash(value:unknown):Promise<string> { return sha256(metadataBytes(value)); }
export function termsBytes(t:OfferTerms):Uint8Array {
 exact(t,['asset','pot','start_price','floor_price','slope_num','slope_den','duration_ledgers','lease_ledgers','metadata_hash']);
 const fields:Record<string,xdr.ScVal>={asset:new Address(address(t.asset,true)).toScVal(),metadata_hash:bytes(t.metadata_hash),duration_ledgers:xdr.ScVal.scvU32(uint32(t.duration_ledgers,1)),lease_ledgers:xdr.ScVal.scvU32(uint32(t.lease_ledgers))};
 for(const k of ['pot','start_price','floor_price','slope_num','slope_den'] as const) fields[k]=nativeToScVal(BigInt(decimal(t[k],128,true)),{type:'i128'});
 return scMap(fields).toXDR();
}
export async function termsHash(t:OfferTerms):Promise<string> { return sha256(termsBytes(t)); }
export function publicationBytes(value:Publication):Uint8Array {
 const p=parsePublication(value);
 return scMap({purpose:str(PUBLICATION_PURPOSE),version:xdr.ScVal.scvU32(1),action:str(p.action),networkId:bytes(p.networkId),contract:new Address(p.contract).toScVal(),offerId:nativeToScVal(BigInt(p.offerId),{type:'u64'}),seller:new Address(p.seller).toScVal(),keyEpoch:xdr.ScVal.scvU32(p.keyEpoch),revision:xdr.ScVal.scvU32(p.revision),termsHash:bytes(p.termsHash),metadataHash:bytes(p.metadataHash),issuedAt:xdr.ScVal.scvU32(p.issuedAt),expiresAt:xdr.ScVal.scvU32(p.expiresAt),nonce:bytes(p.nonce)}).toXDR();
}
export async function verifyPublication(p:Publication,signature:string,publicKey:string):Promise<boolean> {
 if(!/^[0-9a-f]{128}$/.test(signature)) return false;
 const key=await crypto.subtle.importKey('raw',Uint8Array.from(Buffer.from(hex32(publicKey),'hex')),'Ed25519',false,['verify']);
 return crypto.subtle.verify('Ed25519',key,Uint8Array.from(Buffer.from(signature,'hex')),Uint8Array.from(publicationBytes(p)));
}

/** Merchant pickup authorization codec. Never reuse a listing signature for a receipt. */
export interface PickupReceipt {
 offer_id:string; claimant:string; terms_hash:string; key_epoch:number; sequence:string;
 valid_from:number; valid_until:number; max_price:string; nonce:string;
}
export type PickupAction='walk-in'|'reserve'|'reserved';
export function receiptBytes(r:PickupReceipt):Uint8Array {
 exact(r,['offer_id','claimant','terms_hash','key_epoch','sequence','valid_from','valid_until','max_price','nonce']);
 const from=uint32(r.valid_from,1),until=uint32(r.valid_until,1);requireValue(until>=from&&until-from<=12&&hex32(r.nonce)!=='00'.repeat(32));
 return scMap({offer_id:nativeToScVal(BigInt(decimal(r.offer_id)),{type:'u64'}),claimant:new Address(address(r.claimant)).toScVal(),terms_hash:bytes(r.terms_hash),key_epoch:xdr.ScVal.scvU32(uint32(r.key_epoch,1)),sequence:nativeToScVal(BigInt(decimal(r.sequence)),{type:'u64'}),valid_from:xdr.ScVal.scvU32(from),valid_until:xdr.ScVal.scvU32(until),max_price:nativeToScVal(BigInt(decimal(r.max_price,128,true)),{type:'i128'}),nonce:bytes(r.nonce)}).toXDR();
}
export function pickupAuthorizationBytes(action:PickupAction,contract:string,receipt:PickupReceipt,leaseUntil?:number):Uint8Array {
 requireValue(['walk-in','reserve','reserved'].includes(action));
 const value=xdr.ScVal.fromXDR(Buffer.from(receiptBytes(receipt)));
 let payload:xdr.ScVal=value;
 if(action==='reserve'){const end=uint32(leaseUntil,1);requireValue(end>receipt.valid_from);payload=scMap({receipt:value,lease_until:xdr.ScVal.scvU32(end)});}
 else requireValue(leaseUntil===undefined);
 return Buffer.concat([Buffer.from(`agyion:market-${action}:v1\0`,'utf8'),Buffer.from(TESTNET_NETWORK_ID,'hex'),new Address(address(contract,true)).toScVal().toXDR(),payload.toXDR()]);
}
