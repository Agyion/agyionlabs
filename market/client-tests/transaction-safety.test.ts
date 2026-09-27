/** Actual SDK XDR and signatures; synthetic ledger results, never a chain inclusion claim. */
import {expect,it} from 'vitest';
import {Account,Address,Contract,Keypair,Networks,Transaction,TransactionBuilder,hash,nativeToScVal,rpc,xdr} from '@stellar/stellar-sdk';
import {chainFixture} from '../tests/chain-fixture.ts';
import {callHash,transactionEvidence,validateSimulationAuth} from '../client/transaction-safety.ts';
import type {MarketPlan} from '../client/commands.ts';
import type {MarketTransactionAttempt} from '../client/journal.ts';
import {marketSpec} from '../client/spec.ts';
import type {MarketAction} from '../client/journal.ts';
function root(fn:xdr.InvokeContractArgs,children:xdr.SorobanAuthorizedInvocation[]=[]){return new xdr.SorobanAuthorizedInvocation({function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(fn),subInvocations:children});}
async function operation(action:MarketAction,amount='200',positive=true){
 const f=await chainFixture(),source=f.seller.publicKey(),buyer=Keypair.fromRawEd25519Seed(Buffer.alloc(32,8)).publicKey(),receipt={offer_id:1n,claimant:source,terms_hash:Buffer.alloc(32,2),key_epoch:1,sequence:1n,valid_from:100,valid_until:112,max_price:500n,nonce:Buffer.alloc(32,3)};
 const args=action==='register_merchant'?{seller:source,public_key:Buffer.alloc(32,4)}:action==='create_offer'?{seller:source,terms:{...f.terms,pot:BigInt(amount),start_price:600n,floor_price:-150n,slope_num:1n,slope_den:1n,metadata_hash:Buffer.alloc(32,5)}}:action==='reserve'?{permit:{receipt,lease_until:110},signature:Buffer.alloc(64)}:action==='settle_walk_in'||action==='settle_reserved'?{receipt,signature:Buffer.alloc(64)}:action==='cancel_reservation'?{offer_id:1n,claimant:source,sequence:1n}:{offer_id:1n};
 const operation=new Contract(f.contract).call(action,...marketSpec.funcArgsToScVals(action,args)),fn=operation.body().invokeHostFunctionOp().hostFunction().invokeContract();
 const transfers=action==='create_offer'||((action==='settle_walk_in'||action==='settle_reserved')&&positive);
 const child=new xdr.InvokeContractArgs({contractAddress:new Address(f.asset).toScAddress(),functionName:'transfer',args:[new Address(source).toScVal(),new Address(action==='create_offer'?f.contract:buyer).toScVal(),nativeToScVal(BigInt(amount),{type:'i128'})]});
 operation.body().invokeHostFunctionOp().auth(action==='refund'||action==='expire_reservation'?[]:[new xdr.SorobanAuthorizationEntry({credentials:xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),rootInvocation:root(fn,transfers?[root(child)]:[])})]);
 const tx=new TransactionBuilder(new Account(source,'10'),{fee:'100',networkPassphrase:Networks.TESTNET}).addOperation(operation).setTimeout(0).build();tx.sign(f.seller);const op=tx.operations[0];if(op.type!=='invokeHostFunction')throw Error('fixture');
 const command=action==='create_offer'?{action,terms:{...f.terms,pot:amount}}:{action};
 // This minimal plan double isolates the auth checker. Command/reader validation has separate tests.
 const plan={command,summary:{action,source,asset:f.asset,seller:buyer,price:positive?amount:'0'}} as unknown as MarketPlan;
 const attempt:MarketTransactionAttempt={version:1,kind:'transaction',intentId:'11'.repeat(32),releaseId:'22'.repeat(32),contract:f.contract,source,action,hash:tx.hash().toString('hex'),sequence:tx.sequence,callHash:callHash(tx)};
 return{...f,tx,op,fn,plan,attempt};
}
async function response(h:Awaited<ReturnType<typeof operation>>,rv:xdr.ScVal,status:'SUCCESS'|'FAILED'='SUCCESS'){
 const preimage=new xdr.InvokeHostFunctionSuccessPreImage({returnValue:rv,events:[]}),result=new xdr.TransactionResult({feeCharged:xdr.Int64.fromString('100'),ext:new xdr.TransactionResultExt(0),result:status==='SUCCESS'?xdr.TransactionResultResult.txSuccess([xdr.OperationResult.opInner(xdr.OperationResultTr.invokeHostFunction(xdr.InvokeHostFunctionResult.invokeHostFunctionSuccess(hash(preimage.toXDR()))))]):xdr.TransactionResultResult.txFailed([xdr.OperationResult.opInner(xdr.OperationResultTr.invokeHostFunction(xdr.InvokeHostFunctionResult.invokeHostFunctionTrapped()))])});
 const meta=status==='SUCCESS'?new xdr.TransactionMeta(3,new xdr.TransactionMetaV3({ext:new xdr.ExtensionPoint(0),txChangesBefore:[],txChangesAfter:[],operations:[new xdr.OperationMeta({changes:[]})],sorobanMeta:new xdr.SorobanTransactionMeta({ext:new xdr.SorobanTransactionMetaExt(0),events:[],returnValue:rv,diagnosticEvents:[]})})):new xdr.TransactionMeta(0,[]);
 const raw:rpc.Api.RawGetTransactionResponse={status:status as rpc.Api.GetTransactionStatus,txHash:h.attempt.hash,latestLedger:101,latestLedgerCloseTime:1,oldestLedger:1,oldestLedgerCloseTime:1,ledger:100,createdAt:1,applicationOrder:0,feeBump:false,envelopeXdr:h.tx.toXDR(),resultXdr:result.toXDR('base64'),resultMetaXdr:meta.toXDR('base64')};
 async function parse(value:rpc.Api.RawGetTransactionResponse){const server=new rpc.Server('https://rpc.test');server._getTransaction=async()=>value;return server.getTransaction(h.attempt.hash);}
 return{raw,result,meta,parse};
}
it('all eight action trees admit only their expected source authorization and exact token transfer',async()=>{
 for(const action of ['register_merchant','create_offer','settle_walk_in','settle_reserved','reserve','cancel_reservation','expire_reservation','refund']as const){
  const h=await operation(action);expect(()=>validateSimulationAuth(h.tx,h.op.func,h.plan,h.contract)).not.toThrow();
  const other=new Contract(h.contract).call('price',nativeToScVal(1n,{type:'u64'}));expect(()=>validateSimulationAuth(h.tx,other.body().invokeHostFunctionOp().hostFunction(),h.plan,h.contract)).toThrow();
  const parsed=TransactionBuilder.fromXDR(h.tx.toXDR(),Networks.TESTNET) as Transaction;const p=parsed.operations[0];if(p.type!=='invokeHostFunction')throw Error('fixture');p.auth=[...(p.auth??[]),...(h.op.auth?.length?h.op.auth:[new xdr.SorobanAuthorizationEntry({credentials:xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),rootInvocation:root(h.fn)})])];expect(()=>validateSimulationAuth(parsed,h.op.func,h.plan,h.contract)).toThrow();
 }
 for(const action of ['settle_walk_in','settle_reserved']as const){const h=await operation(action,'0',false);expect(()=>validateSimulationAuth(h.tx,h.op.func,h.plan,h.contract)).not.toThrow();}
});
it('foreign destination, amount, asset, nested subtree and missing root source auth refuse',async()=>{
 for(const kind of ['destination','amount','asset','subtree','empty']as const){const h=await operation('create_offer');const op=h.tx.operations[0];if(op.type!=='invokeHostFunction')throw Error('fixture');const entry=op.auth![0],child=entry.rootInvocation().subInvocations()[0];
  if(kind==='empty')op.auth=[];else if(kind==='subtree')child.subInvocations([root(h.fn)]);else{const fn=child.function().contractFn();if(kind==='amount')fn.args()[2]=nativeToScVal(201n,{type:'i128'});if(kind==='destination')fn.args()[1]=new Address(h.seller.publicKey()).toScVal();if(kind==='asset')fn.contractAddress(new Address(h.contract).toScAddress());}
  expect(()=>validateSimulationAuth(h.tx,h.op.func,h.plan,h.contract)).toThrow();
 }
});
it('binds actual created ID and success return preimage to the signed invocation',async()=>{
 const h=await operation('create_offer'),r=await response(h,nativeToScVal(37n,{type:'u64'}));expect(transactionEvidence(await r.parse(r.raw),h.attempt)).toEqual({status:'confirmed',ledger:100,offerId:'37'});
 for(const kind of ['hash','source','call','contract','method','sequence','ledger','return','result']as const){const a={...h.attempt},raw={...r.raw};
  if(kind==='hash')a.hash='00'.repeat(32);if(kind==='source')a.source=Keypair.random().publicKey();if(kind==='call')a.callHash='ff'.repeat(32);if(kind==='contract')a.contract=h.asset;if(kind==='method')a.action='refund';if(kind==='sequence')a.sequence='12';if(kind==='ledger')raw.ledger=0;
  if(kind==='return'){const meta=xdr.TransactionMeta.fromXDR(raw.resultMetaXdr!,'base64');meta.v3().sorobanMeta()!.returnValue(nativeToScVal(38n,{type:'u64'}));raw.resultMetaXdr=meta.toXDR('base64');}
  if(kind==='result'){const result=xdr.TransactionResult.fromXDR(raw.resultXdr!,'base64');result.result(xdr.TransactionResultResult.txSuccess([xdr.OperationResult.opInner(xdr.OperationResultTr.invokeHostFunction(xdr.InvokeHostFunctionResult.invokeHostFunctionSuccess(Buffer.alloc(32,9))))]));raw.resultXdr=result.toXDR('base64');}
  expect(transactionEvidence(await r.parse(raw),a),kind).toBeNull();
 }
 const invalid=await response(h,nativeToScVal(0n,{type:'u64'}));expect(transactionEvidence(await invalid.parse(invalid.raw),h.attempt)).toBeNull();
});
it('accepts only bound failed operation evidence, and validates third-party fee-bump inner result',async()=>{
 const h=await operation('refund'),failed=await response(h,xdr.ScVal.scvVoid(),'FAILED');expect(transactionEvidence(await failed.parse(failed.raw),h.attempt)).toEqual({status:'failed',ledger:100,offerId:null});
 const failResult=xdr.TransactionResult.fromXDR(failed.raw.resultXdr!,'base64');failResult.result(xdr.TransactionResultResult.txBadSeq());expect(transactionEvidence(await failed.parse({...failed.raw,resultXdr:failResult.toXDR('base64')}),h.attempt)).toBeNull();
 const good=await response(h,xdr.ScVal.scvVoid()),sponsor=Keypair.fromRawEd25519Seed(Buffer.alloc(32,30)),outer=TransactionBuilder.buildFeeBumpTransaction(sponsor,'500',h.tx,Networks.TESTNET);outer.sign(sponsor);
 const pair=new xdr.InnerTransactionResultPair({transactionHash:h.tx.hash(),result:new xdr.InnerTransactionResult({feeCharged:xdr.Int64.fromString('100'),ext:new xdr.InnerTransactionResultExt(0),result:xdr.InnerTransactionResultResult.txSuccess(good.result.result().results())})});
 good.result.result(xdr.TransactionResultResult.txFeeBumpInnerSuccess(pair));const raw={...good.raw,feeBump:true,envelopeXdr:outer.toXDR(),resultXdr:good.result.toXDR('base64')};expect(transactionEvidence(await good.parse(raw),h.attempt)?.status).toBe('confirmed');pair.transactionHash(Buffer.alloc(32,9));raw.resultXdr=good.result.toXDR('base64');expect(transactionEvidence(await good.parse(raw),h.attempt)).toBeNull();
});

it('preserves the authenticated registration epoch even when it differs from the earlier expected epoch',async()=>{
 const h=await operation('register_merchant'),type=xdr.ScSpecTypeDef.scSpecTypeUdt(new xdr.ScSpecTypeUdt({name:'Merchant'}));
 const registration={seller:h.attempt.source,public_key:Buffer.alloc(32,4),epoch:3};
 const r=await response(h,marketSpec.nativeToScVal(registration,type));
 expect(transactionEvidence(await r.parse(r.raw),h.attempt)).toEqual({status:'confirmed',ledger:100,offerId:null,registration:{seller:registration.seller,publicKey:registration.public_key.toString('hex'),epoch:3}});
 for(const patch of [{epoch:0},{public_key:Buffer.alloc(32)},{public_key:Buffer.alloc(32,5)},{seller:Keypair.fromRawEd25519Seed(Buffer.alloc(32,99)).publicKey()}]){
  const invalid=await response(h,marketSpec.nativeToScVal({...registration,...patch},type));
  expect(transactionEvidence(await invalid.parse(invalid.raw),h.attempt)).toBeNull();
 }
});
