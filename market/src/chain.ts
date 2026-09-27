/** Read-only, pinned Stellar RPC adapter. RPC is trusted; this is not an SCP inclusion proof. */
import {Address,Networks,scValToNative,xdr} from '@stellar/stellar-sdk';
import {Buffer} from 'buffer';
import {address,hex32,requireValue,sha256,termsBytes,termsHash,uint32,decimal} from '../shared/codec.ts';
import type {OfferTerms} from '../shared/codec.ts';
import type {MarketEnv,ChainReader,ChainObservation} from './types.ts';
const MAX_RPC=2*1024*1024;
const eq=(a:{toXDR():Buffer},b:{toXDR():Buffer})=>a.toXDR().equals(b.toXDR());
const enumKey=(name:string,...args:xdr.ScVal[])=>xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(name),...args]);
function map(value:xdr.ScVal,fields:string[]):Map<string,xdr.ScVal>{
 requireValue(value.switch().name==='scvMap');const rows=value.map();requireValue(rows&&rows.length===fields.length);
 const result=new Map<string,xdr.ScVal>();let previous='';
 for(const row of rows){requireValue(row.key().switch().name==='scvSymbol');const name=row.key().sym().toString();requireValue(fields.includes(name)&&!result.has(name)&&name>previous);previous=name;result.set(name,row.val());}return result;
}
function u32(v:xdr.ScVal):number{requireValue(v.switch().name==='scvU32');return uint32(v.u32());}
function u64(v:xdr.ScVal):string{requireValue(v.switch().name==='scvU64');return decimal(v.u64().toString());}
function i128(v:xdr.ScVal):string{requireValue(v.switch().name==='scvI128');return decimal(String(scValToNative(v)),128,true);}
function addr(v:xdr.ScVal,contract=false):string{requireValue(v.switch().name==='scvAddress');return address(Address.fromScVal(v).toString(),contract);}
function bytes32(v:xdr.ScVal):string{requireValue(v.switch().name==='scvBytes'&&v.bytes().length===32);return v.bytes().toString('hex');}
function decodeTerms(v:xdr.ScVal):OfferTerms{
 const m=map(v,['asset','pot','start_price','floor_price','slope_num','slope_den','duration_ledgers','lease_ledgers','metadata_hash']);
 const result:OfferTerms={asset:addr(m.get('asset')!,true),pot:i128(m.get('pot')!),start_price:i128(m.get('start_price')!),floor_price:i128(m.get('floor_price')!),slope_num:i128(m.get('slope_num')!),slope_den:i128(m.get('slope_den')!),duration_ledgers:u32(m.get('duration_ledgers')!),lease_ledgers:u32(m.get('lease_ledgers')!),metadata_hash:bytes32(m.get('metadata_hash')!)};
 requireValue(Buffer.from(termsBytes(result)).equals(v.toXDR()));return result;
}
function merchant(v:xdr.ScVal){const m=map(v,['seller','public_key','epoch']);const epoch=u32(m.get('epoch')!);requireValue(epoch>0);return {seller:addr(m.get('seller')!),merchantKey:bytes32(m.get('public_key')!),keyEpoch:epoch};}
function reservation(v:xdr.ScVal):void {
 requireValue(v.switch().name==='scvVec');const values=v.vec();requireValue(values&&values.length>=1&&values[0].switch().name==='scvSymbol');
 const name=values[0].sym().toString();if(name==='Empty'){requireValue(values.length===1);return;}
 requireValue(name==='Active'&&values.length===2);const m=map(values[1],['claimant','sequence','price','claimed_at','lease_until','merchant']);
 addr(m.get('claimant')!);u64(m.get('sequence')!);i128(m.get('price')!);u32(m.get('claimed_at')!);u32(m.get('lease_until')!);merchant(m.get('merchant')!);
}
export function validateMarketConfig(env:Pick<MarketEnv,'MARKET_CONTRACT'|'MARKET_WASM_HASH'|'MARKET_RPC_URL'|'MARKET_ASSETS'|'ALLOWED_ORIGIN'>){
 address(env.MARKET_CONTRACT,true);hex32(env.MARKET_WASM_HASH);requireValue(env.MARKET_WASM_HASH!=='00'.repeat(32));
 const rpc=new URL(env.MARKET_RPC_URL);requireValue(rpc.protocol==='https:'&&!rpc.username&&!rpc.password&&!rpc.search&&!rpc.hash);
 const origin=new URL(env.ALLOWED_ORIGIN);requireValue(origin.protocol==='https:'&&origin.origin===env.ALLOWED_ORIGIN&&!origin.username&&!origin.password);
 const assets=env.MARKET_ASSETS.split(',').map(x=>address(x,true));requireValue(assets.length>0&&assets.length<=4&&new Set(assets).size===assets.length);
 return {contract:env.MARKET_CONTRACT,wasmHash:env.MARKET_WASM_HASH,rpcUrl:rpc.href,assets};
}
export function createChainReader(env:MarketEnv,options:{fetch?:typeof fetch;now?:()=>number}={}):ChainReader {
 const config=validateMarketConfig(env),fetcher=options.fetch??globalThis.fetch.bind(globalThis),now=options.now??(()=>Math.floor(Date.now()/1000));
 const contract=new Address(config.contract).toScAddress();let requestId=0;
 const key=(value:xdr.ScVal)=>xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({contract,key:value,durability:xdr.ContractDataDurability.persistent()}));
 const instanceKey=key(xdr.ScVal.scvLedgerKeyContractInstance());
 const codeKey=xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({hash:Buffer.from(config.wasmHash,'hex')}));
 async function rpc(method:string,params:unknown):Promise<Record<string,unknown>>{
  const id=++requestId,timeout=new AbortController();const timer=setTimeout(()=>timeout.abort(),10000);
  try{
   // Workers support manual redirects. Never follow one or accept a followed response.
   const response=await fetcher(config.rpcUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params}),credentials:'omit',redirect:'manual',cache:'no-store',signal:timeout.signal});requireValue(response.ok&&!response.redirected&&response.body);
   const declared=response.headers.get('content-length');requireValue(declared===null||(/^[0-9]+$/.test(declared)&&Number(declared)<=MAX_RPC));
   const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
   try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;requireValue(size<=MAX_RPC);chunks.push(value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
   const raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));requireValue(raw&&raw.jsonrpc==='2.0'&&raw.id===id&&Object.hasOwn(raw,'result')&&!Object.hasOwn(raw,'error')&&raw.result&&typeof raw.result==='object'&&!Array.isArray(raw.result));return raw.result as Record<string,unknown>;
  }finally{clearTimeout(timer);}
 }
 return {async readOffer(offerId:string,seller:string):Promise<ChainObservation>{
  decimal(offerId);address(seller);
  const network=await rpc('getNetwork',{});requireValue(network.passphrase===Networks.TESTNET&&network.protocolVersion===28);
  const head=await rpc('getLatestLedger',{});const headLedger=uint32(head.sequence,1);requireValue(head.protocolVersion===28);hex32(head.id);requireValue(typeof head.closeTime==='string'&&/^[1-9][0-9]{0,10}$/.test(head.closeTime));const closedAt=Number(head.closeTime);
  requireValue(typeof closedAt==='number'&&Number.isSafeInteger(closedAt)&&closedAt>now()-60&&closedAt<=now()+30);
  const merchantKey=key(enumKey('Merchant',new Address(seller).toScVal())),offerKey=key(enumKey('Offer',xdr.ScVal.scvU64(xdr.Uint64.fromString(offerId))));
  const keys=[instanceKey,codeKey,merchantKey,offerKey],encoded=keys.map(x=>x.toXDR('base64'));
  const entries=await rpc('getLedgerEntries',{keys:encoded});const ledger=uint32(entries.latestLedger,1);requireValue(ledger>=headLedger&&ledger<=headLedger+4&&Array.isArray(entries.entries)&&entries.entries.length===4);
  const byKey=new Map<string,xdr.LedgerEntryData>();
  for(const raw of entries.entries){
   requireValue(raw&&typeof raw==='object'&&!Array.isArray(raw));const row=raw as Record<string,unknown>;
   requireValue(typeof row.key==='string'&&encoded.includes(row.key)&&!byKey.has(row.key)&&typeof row.xdr==='string'&&row.xdr.length<=MAX_RPC);
   const modified=uint32(row.lastModifiedLedgerSeq,1),liveUntil=uint32(row.liveUntilLedgerSeq,1);requireValue(modified<=ledger&&liveUntil>=ledger);
   const value=xdr.LedgerEntryData.fromXDR(row.xdr,'base64'),expected=keys[encoded.indexOf(row.key)];requireValue(value.toXDR('base64')===row.xdr);
   if(expected.switch().name==='contractCode'){requireValue(value.switch().name==='contractCode'&&value.contractCode().hash().toString('hex')===config.wasmHash&&await sha256(value.contractCode().code())===config.wasmHash);}
   else {requireValue(value.switch().name==='contractData');const d=value.contractData(),e=expected.contractData();requireValue(eq(d.contract(),e.contract())&&eq(d.key(),e.key())&&d.durability().name==='persistent');}
   byKey.set(row.key,value);
  }
  const instance=byKey.get(encoded[0])!.contractData().val();requireValue(instance.switch().name==='scvContractInstance');
  const executable=instance.instance().executable();requireValue(executable.switch().name==='contractExecutableWasm'&&executable.wasmHash().toString('hex')===config.wasmHash);
  const storage=instance.instance().storage();requireValue(storage&&storage.length===2);const stored=new Map<string,xdr.ScVal>();for(const row of storage){const k=row.key().toXDR('base64');requireValue(!stored.has(k));stored.set(k,row.val());}
  const conf=stored.get(enumKey('Config').toXDR('base64')),count=stored.get(enumKey('Count').toXDR('base64'));requireValue(conf&&count);u64(count);
  const cm=map(conf,['assets','max_offer_ledgers','max_lease_ledgers','max_receipt_ledgers']);requireValue(cm.get('assets')!.switch().name==='scvVec');const assets=cm.get('assets')!.vec();requireValue(assets&&assets.length===config.assets.length);
  requireValue(assets.map(x=>addr(x,true)).sort().join(',')===[...config.assets].sort().join(','));for(const name of ['max_offer_ledgers','max_lease_ledgers','max_receipt_ledgers'])requireValue(u32(cm.get(name)!)>0);
  const registered=merchant(byKey.get(encoded[2])!.contractData().val());requireValue(registered.seller===seller);
  const offer=map(byKey.get(encoded[3])!.contractData().val(),['id','seller','terms','terms_hash','start_ledger','deadline_ledger','state','sequence','reservation','settled_to','settled_price']);
  requireValue(u64(offer.get('id')!)===offerId&&addr(offer.get('seller')!)===seller);u64(offer.get('sequence')!);reservation(offer.get('reservation')!);
  if(offer.get('settled_to')!.switch().name!=='scvVoid')addr(offer.get('settled_to')!);
  if(offer.get('settled_price')!.switch().name!=='scvVoid')i128(offer.get('settled_price')!);
  const terms=decodeTerms(offer.get('terms')!),th=bytes32(offer.get('terms_hash')!);requireValue(config.assets.includes(terms.asset)&&await termsHash(terms)===th);
  const state=u32(offer.get('state')!),startLedger=u32(offer.get('start_ledger')!),deadlineLedger=u32(offer.get('deadline_ledger')!);requireValue(state<=3&&startLedger>0&&startLedger<=ledger&&deadlineLedger===startLedger+terms.duration_ledgers);
  return {ledger,ledgerClosedAt:closedAt,...registered,offerId,terms,termsHash:th,state,startLedger,deadlineLedger};
 }};
}
