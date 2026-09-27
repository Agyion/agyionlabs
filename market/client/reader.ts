/** Public market state reader. Exact configured provider is trusted; no SCP proof is claimed. */
import {Address,Networks,hash,xdr} from '@stellar/stellar-sdk';
import {Buffer} from 'buffer';
import {address,decimal,requireValue,termsBytes,uint32} from '../shared/codec.ts';
import {assertMarketRelease,getMarketRelease} from './release.ts';
import type {MarketRelease} from './release.ts';
import {marketSpec} from './spec.ts';
import type {ActiveSlot,MarketConfig,Merchant,Offer} from './spec.ts';
export interface MarketState {readonly ledger:number;readonly closedAt:number;readonly config:Readonly<Omit<MarketConfig,'assets'>&{assets:readonly string[]}>;readonly count:bigint;readonly snapshotId:string}
export interface MarketRead<T>{readonly ledger:number;readonly value:T;readonly snapshotId:string}
export interface MarketReader {
 state():Promise<MarketState>;offer(id:string):Promise<MarketRead<Offer>>;
 merchant(seller:string):Promise<MarketRead<Merchant|null>>;active(seller:string,claimant:string):Promise<MarketRead<ActiveSlot|null>>;
}
const brands=new WeakMap<object,MarketRelease>();
export function assertMarketReader(value:unknown,release:MarketRelease):asserts value is MarketReader {requireValue(value&&typeof value==='object'&&brands.get(value)===release,'PINNED_MARKET_READER_REQUIRED');}
const key=(name:string,...args:xdr.ScVal[])=>xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(name),...args]);
const digest=(value:Uint8Array)=>hash(Buffer.from(value)).toString('hex');
const u64=(v:unknown):v is bigint=>typeof v==='bigint'&&v>=0n&&v<1n<<64n;
function readBackoff(milliseconds:number,signal:AbortSignal):Promise<void>{
 signal.throwIfAborted();
 return new Promise((resolve,reject)=>{
  const stop=()=>{clearTimeout(timer);signal.removeEventListener('abort',stop);reject(signal.reason);};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',stop);resolve();},milliseconds);
  signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop();
 });
}
/** Retry transport rejection only. HTTP, body, schema and pin checks are outside
 * this helper. The read keeps its original deadline and never signs or sends. */
async function fetchRead(fetcher:typeof fetch,url:string,init:RequestInit&{signal:AbortSignal}):Promise<Response>{
 for(let attempt=0;;attempt++){
  init.signal.throwIfAborted();
  try{return await fetcher(url,init);}catch(error){
   init.signal.throwIfAborted();if(!(error instanceof TypeError)||attempt>=2)throw error;
   await readBackoff(attempt===0?200:600,init.signal);
  }
 }
}
export function createMarketReader(release:MarketRelease=getMarketRelease(),options:{fetch?:typeof fetch;now?:()=>number}={}):MarketReader {
 assertMarketRelease(release);const fetcher=options.fetch??globalThis.fetch.bind(globalThis),now=options.now??(()=>Math.floor(Date.now()/1000));let requestId=0;
 const dataKey=(value:xdr.ScVal)=>xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({contract:new Address(release.contract).toScAddress(),key:value,durability:xdr.ContractDataDurability.persistent()}));
 const instanceKey=dataKey(xdr.ScVal.scvLedgerKeyContractInstance()),codeKey=xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({hash:Buffer.from(release.wasmHash,'hex')}));
 async function rpc(method:'getNetwork'|'getLatestLedger'|'getLedgerEntries',params:unknown):Promise<Record<string,unknown>>{
  const id=++requestId,control=new AbortController(),timer=setTimeout(()=>control.abort(),10000);
  try{
   const response=await fetchRead(fetcher,release.rpcUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params}),credentials:'omit',redirect:'error',cache:'no-store',signal:control.signal});requireValue(response.ok&&response.body,'MARKET_RPC_UNAVAILABLE');
   const stream=response.body.getReader();const chunks:Uint8Array[]=[];let length=0;
   try{for(;;){const item=await stream.read();if(item.done)break;length+=item.value.byteLength;requireValue(length<=2*1024*1024,'MARKET_RPC_RESPONSE_TOO_LARGE');chunks.push(item.value);}}finally{await stream.cancel().catch(()=>{});stream.releaseLock();}
   control.signal.throwIfAborted();const reply=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(Buffer.concat(chunks)));
   requireValue(reply&&reply.jsonrpc==='2.0'&&reply.id===id&&!Object.hasOwn(reply,'error')&&reply.result&&typeof reply.result==='object'&&!Array.isArray(reply.result),'MARKET_RPC_INVALID_RESPONSE');return reply.result as Record<string,unknown>;
  }finally{clearTimeout(timer);}
 }
 function decode<T>(name:string,value:xdr.ScVal):T {
  const type=xdr.ScSpecTypeDef.scSpecTypeUdt(new xdr.ScSpecTypeUdt({name})),decoded=marketSpec.scValToNative<T>(value,type);
  requireValue(marketSpec.nativeToScVal(decoded,type).toXDR().equals(value.toXDR()),'MARKET_NONCANONICAL_DATA');return decoded;
 }
 async function read(extra?:xdr.LedgerKey):Promise<{state:MarketState;value:xdr.ScVal|null}> {
  const network=await rpc('getNetwork',{});requireValue(network.passphrase===Networks.TESTNET&&network.protocolVersion===28,'MARKET_NETWORK_MISMATCH');
  const head=await rpc('getLatestLedger',{}),sequence=uint32(head.sequence,1);requireValue(head.protocolVersion===28&&typeof head.closeTime==='string'&&/^[1-9][0-9]{0,10}$/.test(head.closeTime),'MARKET_INVALID_HEAD');const closedAt=Number(head.closeTime);requireValue(closedAt>=now()-60&&closedAt<=now()+30,'MARKET_RPC_STALE');
  const keys=[instanceKey,codeKey,...(extra?[extra]:[])],encoded=keys.map(k=>k.toXDR('base64'));const result=await rpc('getLedgerEntries',{keys:encoded}),ledger=uint32(result.latestLedger,1);
  requireValue(ledger>=sequence&&ledger<=sequence+4&&Array.isArray(result.entries)&&result.entries.length<=keys.length,'MARKET_INVALID_CHECKPOINT');
  const entries=new Map<string,xdr.LedgerEntryData>();for(const raw of result.entries){
   requireValue(raw&&typeof raw==='object'&&!Array.isArray(raw));const r=raw as Record<string,unknown>;
   requireValue(typeof r.key==='string'&&encoded.includes(r.key)&&!entries.has(r.key)&&typeof r.xdr==='string'&&r.xdr.length<=2*1024*1024,'MARKET_ENTRY_IDENTITY');
   requireValue(uint32(r.lastModifiedLedgerSeq,1)<=ledger&&uint32(r.liveUntilLedgerSeq,1)>=ledger,'MARKET_ENTRY_ARCHIVED');
   const data=xdr.LedgerEntryData.fromXDR(r.xdr,'base64'),expected=keys[encoded.indexOf(r.key)];requireValue(data.toXDR('base64')===r.xdr,'MARKET_NONCANONICAL_ENTRY');
   if(expected.switch().name==='contractCode')requireValue(data.switch().name==='contractCode'&&data.contractCode().hash().toString('hex')===release.wasmHash&&digest(data.contractCode().code())===release.wasmHash,'MARKET_CODE_MISMATCH');
   else {requireValue(data.switch().name==='contractData');const d=data.contractData(),e=expected.contractData();requireValue(d.contract().toXDR().equals(e.contract().toXDR())&&d.key().toXDR().equals(e.key().toXDR())&&d.durability().name==='persistent','MARKET_STORAGE_IDENTITY');}
   entries.set(r.key,data);
  }
  const instanceEntry=entries.get(encoded[0]),code=entries.get(encoded[1]);requireValue(instanceEntry&&code,'MARKET_DEPLOYMENT_UNAVAILABLE');const value=instanceEntry.contractData().val();requireValue(value.switch().name==='scvContractInstance');
  const instance=value.instance(),executable=instance.executable();requireValue(executable.switch().name==='contractExecutableWasm'&&executable.wasmHash().toString('hex')===release.wasmHash,'MARKET_WASM_MISMATCH');
  const storage=instance.storage();requireValue(storage&&storage.length===2);const map=new Map<string,xdr.ScVal>();for(const row of storage){const k=row.key().toXDR('base64');requireValue(!map.has(k));map.set(k,row.val());}
  const configValue=map.get(key('Config').toXDR('base64')),countValue=map.get(key('Count').toXDR('base64'));requireValue(configValue&&countValue&&countValue.switch().name==='scvU64');const count=BigInt(countValue.u64().toString());
  const config=decode<MarketConfig>('MarketConfig',configValue);requireValue(config.assets.length===release.assets.length&&config.assets.every(a=>release.assets.includes(a))&&new Set(config.assets).size===config.assets.length,'MARKET_ASSET_POLICY_MISMATCH');
  requireValue(config.max_offer_ledgers===1000000&&config.max_lease_ledgers===720&&config.max_receipt_ledgers===12,'MARKET_CONFIG_MISMATCH');
  const extraValue=extra?entries.get(encoded[2])?.contractData().val()??null:null;
  // Unrelated offer creation changes Count but must not invalidate an existing pickup.
  const snapshotId=digest(Buffer.concat([configValue.toXDR(),executable.toXDR(),...(extraValue?[extraValue.toXDR()]:[])]));
  return {state:Object.freeze({ledger,closedAt,config:Object.freeze({...config,assets:Object.freeze([...config.assets])}),count,snapshotId}),value:extraValue};
 }
 const reader:MarketReader=Object.freeze({
  async state(){return (await read()).state;},
  async offer(id:string){decimal(id);requireValue(BigInt(id)>0n,'INVALID_OFFER_ID');const result=await read(dataKey(key('Offer',xdr.ScVal.scvU64(xdr.Uint64.fromString(id)))));requireValue(result.value,'MARKET_OFFER_UNAVAILABLE');
   const value=decode<Offer>('Offer',result.value);requireValue(value.id===BigInt(id)&&u64(value.sequence)&&value.id<=result.state.count,'MARKET_OFFER_IDENTITY');address(value.seller);
   requireValue(release.assets.includes(value.terms.asset)&&value.terms_hash.length===32&&value.terms.metadata_hash.length===32,'MARKET_OFFER_TERMS');
   requireValue(digest(termsBytes({...value.terms,pot:value.terms.pot.toString(),start_price:value.terms.start_price.toString(),floor_price:value.terms.floor_price.toString(),slope_num:value.terms.slope_num.toString(),slope_den:value.terms.slope_den.toString(),metadata_hash:value.terms.metadata_hash.toString('hex')}))===value.terms_hash.toString('hex'),'MARKET_TERMS_HASH');
   requireValue(value.state<=3&&value.deadline_ledger===value.start_ledger+value.terms.duration_ledgers&&value.start_ledger<=result.state.ledger,'MARKET_OFFER_WINDOW');
   return Object.freeze({ledger:result.state.ledger,value,snapshotId:result.state.snapshotId});
  },
  async merchant(seller:string){address(seller);const result=await read(dataKey(key('Merchant',new Address(seller).toScVal())));const value=result.value?decode<Merchant>('Merchant',result.value):null;
   if(value)requireValue(value.seller===seller&&value.epoch>0&&value.public_key.length===32,'MARKET_MERCHANT_IDENTITY');return Object.freeze({ledger:result.state.ledger,value,snapshotId:result.state.snapshotId});
  },
  async active(seller:string,claimant:string){address(seller);address(claimant);const result=await read(dataKey(key('Slot',new Address(seller).toScVal(),new Address(claimant).toScVal())));const value=result.value?decode<ActiveSlot>('ActiveSlot',result.value):null;
   if(value)requireValue(u64(value.offer_id)&&value.offer_id>0n&&u64(value.sequence)&&value.lease_until>0,'MARKET_SLOT_IDENTITY');return Object.freeze({ledger:result.state.ledger,value,snapshotId:result.state.snapshotId});
  },
 });brands.set(reader,release);return reader;
}
