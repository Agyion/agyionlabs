/** Additive accounting reader. Trusted pinned RPC, not an SCP or solvency proof.
 * No balance inference, simulation, restoration, signing or submission occurs. */
import {Buffer} from 'buffer';
import {Address,hash,scValToNative,StrKey,xdr} from '@stellar/stellar-sdk';
import {Client,type PoolConfig} from './bindings.ts';
import {assertPoolRelease,type PoolRelease} from './release.ts';
import {createPoolReader,PoolReadError,type ReadOptions} from './reader.ts';

export const AccountingErrors=Object.freeze({20:'LiabilityUnavailable',21:'InsufficientBacking',22:'InvalidAccounting',23:'UnexpectedBalance'} as const);
export interface PoolLiability {
 readonly asset:string; readonly amount:bigint; readonly ledger:number;
 readonly liveUntilLedger:number; readonly profileId:string; readonly snapshotId:string;
}
export interface PoolLiabilityReader {readLiability(asset:string,options?:ReadOptions):Promise<PoolLiability>}
const MAX_RESPONSE=128*1024;
function ensure(ok:unknown,message:string,code='INVALID_POOL_DATA'):asserts ok {if(!ok)throw new PoolReadError(code,message);}
const uint32=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=0xffffffff;
const digest=(v:Uint8Array)=>hash(Buffer.from(v)).toString('hex');
async function boundedJson(response:Response):Promise<any>{
 ensure(response.ok,'Pool liability RPC unavailable','RPC_UNAVAILABLE');
 const declared=response.headers.get('content-length');
 if(declared!==null)ensure(/^\d+$/.test(declared)&&Number(declared)<=MAX_RESPONSE,'Pool liability response exceeds bounds');
 ensure(response.body,'Empty pool liability reply');
 const stream=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
 try{for(;;){const{done,value}=await stream.read();if(done)break;size+=value.byteLength;ensure(size<=MAX_RESPONSE,'Pool liability response exceeds bounds');parts.push(value);}}
 catch(error){await stream.cancel().catch(()=>{});throw error;}finally{stream.releaseLock();}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));}
 catch{throw new PoolReadError('INVALID_POOL_DATA','Invalid pool liability JSON');}
}
export function createPoolLiabilityReader(release:PoolRelease,options:{fetch?:typeof globalThis.fetch}={}):PoolLiabilityReader{
 assertPoolRelease(release);
 const fetcher=options.fetch??globalThis.fetch.bind(globalThis),reader=createPoolReader(release,{fetch:fetcher});
 const spec=new Client({contractId:release.pool,networkPassphrase:release.networkPassphrase,rpcUrl:release.rpcUrl}).spec;
 const type=xdr.ScSpecTypeDef.scSpecTypeUdt(new xdr.ScSpecTypeUdt({name:'PoolConfig'}));
 const config=spec.scValToNative<PoolConfig>(xdr.ScVal.fromXDR(release.configXdr,'base64'),type);
 ensure(spec.nativeToScVal(config,type).toXDR('base64')===release.configXdr,'Noncanonical pinned pool configuration');
 const assets=new Set(config.config.assets),contract=new Address(release.pool).toScAddress();
 const persistent=(key:xdr.ScVal)=>xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({contract,key,durability:xdr.ContractDataDurability.persistent()}));
 const instanceKey=persistent(xdr.ScVal.scvLedgerKeyContractInstance());
 let requestId=0,lastLedger=0;
 return Object.freeze({async readLiability(asset:string,readOptions:ReadOptions={}):Promise<PoolLiability>{
  readOptions.signal?.throwIfAborted();
  ensure(typeof asset==='string'&&StrKey.isValidContract(asset)&&assets.has(asset),'Asset is not in the immutable release allowlist','UNKNOWN_ASSET');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new PoolReadError('RPC_UNAVAILABLE','Pool liability read timed out')),15000);
  const cancel=()=>controller.abort(readOptions.signal?.reason);readOptions.signal?.addEventListener('abort',cancel,{once:true});
  if(readOptions.signal?.aborted)cancel();
  const signal=controller.signal;
  try{
   const before=await reader.readState({signal});signal.throwIfAborted();
   // Fetch the counter and its exact instance together. The instance XDR binds
   // this counter observation to the independently pinned bracketed snapshot.
   const counterKey=persistent(xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Liability'),new Address(asset).toScVal()]));
   const keys=[instanceKey,counterKey],encoded=keys.map(k=>k.toXDR('base64')),id=++requestId;
   const response=await fetcher(release.rpcUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method:'getLedgerEntries',params:{keys:encoded}}),credentials:'omit',redirect:'error',cache:'no-store',signal});
   const body=await boundedJson(response);signal.throwIfAborted();
   ensure(body&&body.jsonrpc==='2.0'&&body.id===id&&Object.hasOwn(body,'result')&&!Object.hasOwn(body,'error'),'Invalid pool liability RPC framing','RPC_UNAVAILABLE');
   const result=body.result;
   ensure(result&&uint32(result.latestLedger)&&result.latestLedger>0&&result.latestLedger>=lastLedger,'Pool liability RPC returned an older or invalid ledger');
   const ledger=result.latestLedger;
   ensure(Array.isArray(result.entries)&&result.entries.length<=2,'Unexpected liability ledger entries');
   ensure(result.entries.length===2,'Pool liability or instance unavailable; restoration may be required','ARCHIVE_UNAVAILABLE');
   const rows=new Map<string,any>();
   for(const row of result.entries){
    ensure(row&&typeof row.key==='string'&&encoded.includes(row.key)&&!rows.has(row.key),'Pool liability key mismatch');rows.set(row.key,row);
   }
   function entry(index:number){
    const row=rows.get(encoded[index]);ensure(row,'Pool liability entry unavailable','ARCHIVE_UNAVAILABLE');
    ensure(typeof row.xdr==='string'&&row.xdr.length<=MAX_RESPONSE&&uint32(row.lastModifiedLedgerSeq)&&row.lastModifiedLedgerSeq>0&&row.lastModifiedLedgerSeq<=ledger,'Invalid liability ledger metadata');
    ensure(uint32(row.liveUntilLedgerSeq)&&row.liveUntilLedgerSeq>=ledger,'Pool liability entry expired or missing TTL; restoration required','ARCHIVE_UNAVAILABLE');
    let data:xdr.LedgerEntryData;try{data=xdr.LedgerEntryData.fromXDR(row.xdr,'base64');}catch{throw new PoolReadError('INVALID_POOL_DATA','Invalid liability entry XDR');}
    ensure(data.toXDR('base64')===row.xdr&&data.switch().name==='contractData','Noncanonical liability entry XDR');
    const actual=data.contractData(),expected=keys[index].contractData();
    ensure(actual.contract().toXDR('base64')===expected.contract().toXDR('base64')&&actual.key().toXDR('base64')===expected.key().toXDR('base64')&&actual.durability().value===expected.durability().value,'Pool liability storage identity mismatch');
    return {value:actual.val(),modified:row.lastModifiedLedgerSeq as number,liveUntil:row.liveUntilLedgerSeq as number};
   }
   const instance=entry(0),counter=entry(1);
   ensure(instance.value.switch().name==='scvContractInstance','Pool instance unavailable');
   const snapshotId=digest(Buffer.from(JSON.stringify([release.scope.profileId,instance.value.toXDR('base64')])));
   ensure(snapshotId===before.snapshotId,'Pool snapshot changed during liability read','SNAPSHOT_CHANGED');
   // Every accounting write accompanies an instance state write in this runtime.
   ensure(counter.modified<=instance.modified,'Liability counter is newer than its pool state');
   ensure(counter.value.switch().name==='scvI128','Expected nonnegative i128 liability');
   const amount:unknown=scValToNative(counter.value);
   ensure(typeof amount==='bigint'&&amount>=0n&&amount<(1n<<127n),'Expected nonnegative i128 liability');
   const after=await reader.readState({signal});signal.throwIfAborted();
   ensure(after.snapshotId===before.snapshotId,'Pool snapshot changed during liability read','SNAPSHOT_CHANGED');
   ensure(ledger>=lastLedger,'Pool liability RPC returned an older ledger');lastLedger=ledger;
   return Object.freeze({asset,amount,ledger,liveUntilLedger:counter.liveUntil,profileId:release.scope.profileId,snapshotId});
  }finally{clearTimeout(timer);readOptions.signal?.removeEventListener('abort',cancel);}
 }});
}
