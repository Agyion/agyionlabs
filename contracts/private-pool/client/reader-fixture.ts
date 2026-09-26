/** TEST ONLY: signed public DKG + actual SDK XDR; no live chain or accepting verifier. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {Buffer} from 'buffer';
import {Address,Keypair,StrKey,hash,xdr} from '@stellar/stellar-sdk';
import {Client} from './bindings.ts';
import {TESTNET,RPC_URL} from './release.ts';
import {THRESHOLD_SUITE,parseThresholdConfig,prepareDkgTranscript} from '../../../privacy/src/threshold.mjs';
const require=createRequire(new URL('../../../privacy/package.json',import.meta.url));
const {babyjubjub}=await import(pathToFileURL(require.resolve('@noble/curves/misc.js')).href);
export const host=JSON.parse(readFileSync(new URL('../fixtures/host-config.json',import.meta.url),'utf8'));
export const proof=JSON.parse(readFileSync(new URL('../fixtures/verified-v2/proofs/01-deposit.json',import.meta.url),'utf8'));
export const b=(n:bigint)=>Buffer.from(n.toString(16).padStart(64,'0'),'hex');
const digest=(v:Uint8Array)=>hash(Buffer.from(v)).toString('hex');
const spec=new Client({contractId:host.pool,networkPassphrase:TESTNET,rpcUrl:RPC_URL}).spec;
const udt=(name:string)=>xdr.ScSpecTypeDef.scSpecTypeUdt(new xdr.ScSpecTypeUdt({name}));
export const sc=(name:string,v:unknown)=>spec.nativeToScVal(v,udt(name));
const key=(name:string,v?:xdr.ScVal)=>xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(name),...(v?[v]:[])]);
export const dataKey=(name:string,v?:xdr.ScVal)=>xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({contract:new Address(host.pool).toScAddress(),key:key(name,v),durability:xdr.ContractDataDurability.persistent()}));
const codeBytes=Buffer.from([0,97,115,109,1,0,0,0]); // Encoding fixture; never a deployed/accepting verifier.
export function setup(){
 const seeds=[Buffer.alloc(32,1),Buffer.alloc(32,2)],pairs=seeds.map(s=>Keypair.fromRawEd25519Seed(s));
 const cfg=parseThresholdConfig({version:'1',suite:THRESHOLD_SUITE,domain:{networkId:digest(Buffer.from(TESTNET)),contractId:StrKey.decodeContract(host.pool).toString('hex')},epoch:'1',sessionId:'41'.repeat(32),threshold:'2',trustees:pairs.map((p,i)=>({id:String(i+1),authPublicKey:p.rawPublicKey().toString('hex')}))});
 const encoded=(tag:string,v:unknown)=>Buffer.from(JSON.stringify([THRESHOLD_SUITE,tag,v]));
 const configHash=digest(encoded('config',cfg));
 const packages=pairs.map((p,i)=>{const body={version:'1',configHash,dealerId:String(i+1),commitments:[BigInt(i+3),BigInt(i+1)].map(v=>babyjubjub.Point.BASE.multiply(v).toHex())};return {...body,signature:p.sign(encoded('dealer-package',body)).toString('hex')};});
 const prepared=prepareDkgTranscript(cfg,packages);
 const acceptances=pairs.map((p,i)=>{const body={version:'1',transcriptHash:prepared.transcriptHash,trusteeId:String(i+1)};return {...body,signature:p.sign(encoded('dkg-acceptance',body)).toString('hex')};});
 const manifest={schema:'agyion-private-pool-release-v2',testOnly:true,networkPassphrase:TESTNET,rpcUrl:RPC_URL,protocolVersion:28,pool:host.pool,wasmHash:digest(codeBytes),config:{assets:[host.asset],disclosureEpoch:1,auditor:[BigInt(host.auditorX),BigInt(host.auditorY)],dkgTranscriptHash:prepared.transcriptHash},thresholdConfig:cfg};
 const config={config:{assets:[host.asset],disclosure_epoch:1,auditor_x:b(BigInt(host.auditorX)),auditor_y:b(BigInt(host.auditorY)),dkg_transcript_hash:Buffer.from(prepared.transcriptHash,'hex')},domain:b(BigInt(host.domain)),asset_policy_root:b(BigInt(host.assetPolicyRoot)),asset_ids:[b(BigInt(host.assetId))]};
 const fields=proof.publicSignals.map(BigInt);
 const state={root:b(fields[10]),next_index:1n,revocation_root:b(BigInt(host.emptyRevocationRoot)),roots:[b(BigInt(host.emptyNoteRoot)),b(fields[10])],record_count:1n,revocation_count:0n};
 let head=1010;const entries=new Map<string,any>();
 function put(k:xdr.LedgerKey,data:xdr.LedgerEntryData){entries.set(k.toXDR('base64'),{key:k.toXDR('base64'),xdr:data.toXDR('base64'),lastModifiedLedgerSeq:1000,liveUntilLedgerSeq:5000});}
 function persistent(k:xdr.LedgerKey,val:xdr.ScVal){put(k,xdr.LedgerEntryData.contractData(new xdr.ContractDataEntry({ext:new xdr.ExtensionPoint(0),contract:k.contractData().contract(),key:k.contractData().key(),durability:xdr.ContractDataDurability.persistent(),val})));}
 const instanceKey=xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({contract:new Address(host.pool).toScAddress(),key:xdr.ScVal.scvLedgerKeyContractInstance(),durability:xdr.ContractDataDurability.persistent()}));
 function instance(wasm=manifest.wasmHash){persistent(instanceKey,xdr.ScVal.scvContractInstance(new xdr.ScContractInstance({executable:xdr.ContractExecutable.contractExecutableWasm(Buffer.from(wasm,'hex')),storage:[new xdr.ScMapEntry({key:key('Config'),val:sc('PoolConfig',config)}),new xdr.ScMapEntry({key:key('State'),val:sc('PoolState',state)})]})));}
 instance();
 const wasmKey=xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({hash:Buffer.from(manifest.wasmHash,'hex')}));
 put(wasmKey,xdr.LedgerEntryData.contractCode(new xdr.ContractCodeEntry({ext:new xdr.ContractCodeEntryExt(0),hash:Buffer.from(manifest.wasmHash,'hex'),code:codeBytes})));
 const id=proof.ciphertextDigest;
 persistent(dataKey('RecordIndex',xdr.ScVal.scvU64(xdr.Uint64.fromString('0'))),xdr.ScVal.scvBytes(Buffer.from(id,'hex')));
 persistent(dataKey('Record',xdr.ScVal.scvBytes(Buffer.from(id,'hex'))),sc('StoredRecord',{ledger:1000,public_inputs:fields.map(b)}));
 const calls:string[]=[];
 const fetcher:typeof fetch=async (url,init)=>{assert.equal(String(url),RPC_URL);assert.equal(init?.redirect,'error');assert.equal(init?.credentials,'omit');const req=JSON.parse(String(init?.body));calls.push(req.method);assert.ok(['getNetwork','getLedgerEntries'].includes(req.method));const result=req.method==='getNetwork'?{passphrase:TESTNET,protocolVersion:28}:{latestLedger:head,entries:req.params.keys.map((k:string)=>entries.get(k)).filter(Boolean)};return new Response(JSON.stringify({jsonrpc:'2.0',id:req.id,result}),{status:200,headers:{'content-type':'application/json'}});};
 return {manifest,dkg:{config:cfg,packages,acceptances},config,state,fields,id,entries,instance,instanceKey,wasmKey,persistent,fetcher,calls,setHead:(n:number)=>{head=n;}};
}

