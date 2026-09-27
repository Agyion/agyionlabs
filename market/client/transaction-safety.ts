/** Strict single-invocation authorization and independently bound RPC result evidence. */
import {Address,FeeBumpTransaction,Keypair,Networks,Transaction,TransactionBuilder,hash,nativeToScVal,rpc,xdr} from '@stellar/stellar-sdk';
import {Buffer} from 'buffer';
import {requireValue} from '../shared/codec.ts';
import type {MarketPlan} from './commands.ts';
import type {MarketTransactionAttempt} from './journal.ts';
import {marketSpec} from './spec.ts';
import type {Merchant} from './spec.ts';
export function invocation(tx:Transaction){requireValue(tx.operations.length===1&&tx.operations[0].type==='invokeHostFunction','EXACT_MARKET_CALL_REQUIRED');return tx.operations[0];}
export function callHash(tx:Transaction){return hash(invocation(tx).func.toXDR()).toString('hex');}
export function validateSimulationAuth(tx:Transaction,expected:xdr.HostFunction,plan:MarketPlan,contract:string){
 const op=invocation(tx);requireValue(!op.source&&op.func.toXDR().equals(expected.toXDR()),'SIMULATION_CHANGED_INVOCATION');const auth=op.auth??[],action=plan.command.action;
 if(action==='refund'||action==='expire_reservation'){requireValue(auth.length===0,'UNEXPECTED_AUTHORIZATION');return;}
 requireValue(auth.length===1&&auth[0].credentials().switch().name==='sorobanCredentialsSourceAccount','SOURCE_AUTHORIZATION_REQUIRED');
 const root=auth[0].rootInvocation();requireValue(root.function().switch().name==='sorobanAuthorizedFunctionTypeContractFn'&&root.function().contractFn().toXDR().equals(expected.invokeContract().toXDR()),'UNEXPECTED_ROOT_AUTHORIZATION');
 const amount=action==='create_offer'?BigInt(plan.command.terms.pot):action==='settle_walk_in'||action==='settle_reserved'?BigInt(plan.summary.price!):0n;
 const children=root.subInvocations();if(amount<=0n){requireValue(children.length===0,'UNEXPECTED_TRANSFER_AUTHORIZATION');return;}
 requireValue(children.length===1&&children[0].subInvocations().length===0&&children[0].function().switch().name==='sorobanAuthorizedFunctionTypeContractFn','EXACT_TRANSFER_AUTHORIZATION_REQUIRED');
 const child=children[0].function().contractFn(),to=action==='create_offer'?contract:plan.summary.seller!,asset=plan.summary.asset!;
 const args=[new Address(plan.summary.source).toScVal(),new Address(to).toScVal(),nativeToScVal(amount,{type:'i128'})];
 requireValue(Address.fromScAddress(child.contractAddress()).toString()===asset&&child.functionName().toString()==='transfer'&&child.args().length===3&&child.args().every((a,i)=>a.toXDR().equals(args[i].toXDR())),'TRANSFER_AUTHORIZATION_MISMATCH');
}
export function validateSignedTransaction(requested:Transaction,returned:string,source:string):Transaction{
 requireValue(typeof returned==='string'&&returned.length<1000000,'INVALID_SIGNED_TRANSACTION');const signed=TransactionBuilder.fromXDR(returned,Networks.TESTNET);
 requireValue(signed instanceof Transaction&&signed.hash().equals(requested.hash())&&signed.source===source,'WALLET_CHANGED_TRANSACTION');
 const key=Keypair.fromPublicKey(source);requireValue(signed.signatures.some(s=>key.verify(signed.hash(),s.signature())),'EXPECTED_WALLET_SIGNATURE_REQUIRED');return signed;
}
function wire(value:{toXDR(format:'base64'):string}){const encoded=value.toXDR('base64');requireValue(typeof encoded==='string'&&encoded.length>0&&encoded.length<=16*1024*1024);return encoded;}
export function returnIdentity(action:string,value:xdr.ScVal,fn:xdr.InvokeContractArgs):string|null{
 if(action==='create_offer'){requireValue(value.switch().name==='scvU64'&&BigInt(value.u64().toString())>0n,'INVALID_CREATED_OFFER_ID');return value.u64().toString();}
 if(action==='register_merchant'){
  const type=xdr.ScSpecTypeDef.scSpecTypeUdt(new xdr.ScSpecTypeUdt({name:'Merchant'})),m=marketSpec.scValToNative<Merchant>(value,type);
  requireValue(marketSpec.nativeToScVal(m,type).toXDR().equals(value.toXDR())&&m.epoch>0&&new Address(m.seller).toScVal().toXDR().equals(fn.args()[0].toXDR())&&xdr.ScVal.scvBytes(m.public_key).toXDR().equals(fn.args()[1].toXDR()),'MERCHANT_RETURN_MISMATCH');return null;
 }
 requireValue(value.switch().name==='scvVoid','UNEXPECTED_MARKET_RETURN');return null;
}
export function transactionEvidence(response:rpc.Api.GetTransactionResponse,a:MarketTransactionAttempt):{status:'confirmed'|'failed';ledger:number;offerId:string|null}|null{
 try{
  if((response.status!=='SUCCESS'&&response.status!=='FAILED')||response.txHash!==a.hash||!Number.isInteger(response.ledger)||response.ledger<=0||response.ledger>0xffffffff)return null;
  const envelope=TransactionBuilder.fromXDR(wire(response.envelopeXdr),Networks.TESTNET),wrapped=envelope instanceof FeeBumpTransaction;
  if(response.feeBump!==wrapped)return null;const tx=wrapped?envelope.innerTransaction:envelope;
  if(!(tx instanceof Transaction)||tx.hash().toString('hex')!==a.hash||tx.source!==a.source||tx.sequence!==a.sequence||callHash(tx)!==a.callHash)return null;
  const op=invocation(tx),fn=op.func.invokeContract();if(op.source||Address.fromScAddress(fn.contractAddress()).toString()!==a.contract||fn.functionName().toString()!==a.action)return null;
  const key=Keypair.fromPublicKey(a.source);if(!tx.signatures.some(s=>key.verify(tx.hash(),s.signature())))return null;
  const outer=xdr.TransactionResult.fromXDR(wire(response.resultXdr),'base64').result();let result:xdr.TransactionResultResult|xdr.InnerTransactionResultResult=outer;
  if(wrapped){if(outer.switch().name!==(response.status==='SUCCESS'?'txFeeBumpInnerSuccess':'txFeeBumpInnerFailed'))return null;const pair=outer.innerResultPair();if(pair.transactionHash().toString('hex')!==a.hash)return null;result=pair.result().result();}
  const meta=xdr.TransactionMeta.fromXDR(wire(response.resultMetaXdr),'base64');if(!xdr.TransactionMeta.isValid(meta))return null;
  if(response.status==='FAILED'){
   if(result.switch().name!=='txFailed'||result.results().length!==1)return null;const item=result.results()[0];if(item.switch().name==='opInner'){const inner=item.tr();if(inner.switch().name!=='invokeHostFunction'||inner.invokeHostFunctionResult().switch().value>=0)return null;}else if(item.switch().value>=0)return null;
   return {status:'failed',ledger:response.ledger,offerId:null};
  }
  if(result.switch().name!=='txSuccess'||result.results().length!==1)return null;const item=result.results()[0];if(item.switch().name!=='opInner'||item.tr().switch().name!=='invokeHostFunction')return null;const host=item.tr().invokeHostFunctionResult();if(host.switch().name!=='invokeHostFunctionSuccess')return null;
  const version=meta.switch(),rv=version===3?meta.v3().sorobanMeta()?.returnValue():version===4?meta.v4().sorobanMeta()?.returnValue():null;
  const events=version===3?meta.v3().sorobanMeta()?.events():version===4?meta.v4().operations()[0]?.events():null;if(!rv||!events)return null;
  const preimage=new xdr.InvokeHostFunctionSuccessPreImage({returnValue:rv,events});if(!hash(preimage.toXDR()).equals(host.success()))return null;
  return {status:'confirmed',ledger:response.ledger,offerId:returnIdentity(a.action,rv,fn)};
 }catch{return null;}
}
