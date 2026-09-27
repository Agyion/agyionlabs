/** Test-only, synthetic ledger encoding. Never a deployed contract or accepting verifier. */
import {Address,Keypair,Networks,StrKey,nativeToScVal,xdr} from '@stellar/stellar-sdk';
import {scMap,sha256,termsBytes,termsHash} from '../shared/codec.ts';
import type {MarketEnv} from '../src/types.ts';
export async function chainFixture(){
 const now=1790500000,contract=StrKey.encodeContract(Buffer.alloc(32,9)),asset=StrKey.encodeContract(Buffer.alloc(32,10)),seller=Keypair.fromRawEd25519Seed(Buffer.alloc(32,7));
 const wasm=Buffer.from([0,97,115,109,1,0,0,0]),wasmHash=await sha256(wasm);
 const env:MarketEnv={MARKET_CONTRACT:contract,MARKET_WASM_HASH:wasmHash,MARKET_RPC_URL:'https://rpc.test/',MARKET_ASSETS:asset,ALLOWED_ORIGIN:'https://agyionlabs.dev',DB:{prepare(){throw Error('unused');}},READ_RATE:{async limit(){return {success:true};}},WRITE_RATE:{async limit(){return {success:true};}}};
 const enumKey=(name:string,...args:xdr.ScVal[])=>xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(name),...args]);
 const dataKey=(v:xdr.ScVal)=>xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({contract:new Address(contract).toScAddress(),key:v,durability:xdr.ContractDataDurability.persistent()}));
 const instanceKey=dataKey(xdr.ScVal.scvLedgerKeyContractInstance()),codeKey=xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({hash:Buffer.from(wasmHash,'hex')}));
 const merchantKey=dataKey(enumKey('Merchant',new Address(seller.publicKey()).toScVal())),offerKey=dataKey(enumKey('Offer',nativeToScVal(1n,{type:'u64'})));
 const entries=new Map<string,{key:string;xdr:string;lastModifiedLedgerSeq:number;liveUntilLedgerSeq:number}>();
 function put(k:xdr.LedgerKey,v:xdr.LedgerEntryData){entries.set(k.toXDR('base64'),{key:k.toXDR('base64'),xdr:v.toXDR('base64'),lastModifiedLedgerSeq:90,liveUntilLedgerSeq:1000});}
 function data(k:xdr.LedgerKey,v:xdr.ScVal){put(k,xdr.LedgerEntryData.contractData(new xdr.ContractDataEntry({ext:new xdr.ExtensionPoint(0),contract:k.contractData().contract(),key:k.contractData().key(),durability:xdr.ContractDataDurability.persistent(),val:v})));}
 const conf=scMap({assets:xdr.ScVal.scvVec([new Address(asset).toScVal()]),max_offer_ledgers:xdr.ScVal.scvU32(1000000),max_lease_ledgers:xdr.ScVal.scvU32(720),max_receipt_ledgers:xdr.ScVal.scvU32(12)});
 data(instanceKey,xdr.ScVal.scvContractInstance(new xdr.ScContractInstance({executable:xdr.ContractExecutable.contractExecutableWasm(Buffer.from(wasmHash,'hex')),storage:[new xdr.ScMapEntry({key:enumKey('Config'),val:conf}),new xdr.ScMapEntry({key:enumKey('Count'),val:nativeToScVal(1n,{type:'u64'})})]})));
 put(codeKey,xdr.LedgerEntryData.contractCode(new xdr.ContractCodeEntry({ext:new xdr.ContractCodeEntryExt(0),hash:Buffer.from(wasmHash,'hex'),code:wasm})));
 data(merchantKey,scMap({seller:new Address(seller.publicKey()).toScVal(),public_key:xdr.ScVal.scvBytes(seller.rawPublicKey()),epoch:xdr.ScVal.scvU32(1)}));
 const terms={asset,pot:'15000000',start_price:'60000000',floor_price:'-15000000',slope_num:'100000',slope_den:'1',duration_ledgers:1000,lease_ledgers:12,metadata_hash:'2b'.repeat(32)};
 const offerFields={id:nativeToScVal(1n,{type:'u64'}),seller:new Address(seller.publicKey()).toScVal(),terms:xdr.ScVal.fromXDR(Buffer.from(termsBytes(terms))),terms_hash:xdr.ScVal.scvBytes(Buffer.from(await termsHash(terms),'hex')),start_ledger:xdr.ScVal.scvU32(90),deadline_ledger:xdr.ScVal.scvU32(1090),state:xdr.ScVal.scvU32(0),sequence:nativeToScVal(0n,{type:'u64'}),reservation:enumKey('Empty'),settled_to:xdr.ScVal.scvVoid(),settled_price:xdr.ScVal.scvVoid()};data(offerKey,scMap(offerFields));
 const calls:string[]=[];
 const fetcher:typeof fetch=async(url,init)=>{
  if(String(url)!==env.MARKET_RPC_URL||init?.credentials!=='omit'||!['error','manual'].includes(init?.redirect??''))throw Error('Unexpected network boundary');
  const req=JSON.parse(String(init?.body));calls.push(req.method);
  let result:unknown;if(req.method==='getNetwork')result={passphrase:Networks.TESTNET,protocolVersion:28};
  else if(req.method==='getLatestLedger')result={sequence:100,protocolVersion:28,id:'ab'.repeat(32),closeTime:String(now)};
  else if(req.method==='getLedgerEntries')result={latestLedger:100,entries:req.params.keys.map((k:string)=>entries.get(k)).filter(Boolean)};
  else throw Error('Only read methods allowed');return Response.json({jsonrpc:'2.0',id:req.id,result});
 };
 return {env,now,contract,asset,seller,wasm,entries,instanceKey,codeKey,merchantKey,offerKey,offerFields,terms,data,put,fetcher,calls};
}
