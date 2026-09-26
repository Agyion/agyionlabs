/** Experimental TESTNET transaction lifecycle. Public proof/vector only.
 * Local verification, release/ledger reader and wallet are trusted adapters.
 * RPC inclusion/status still relies on the configured provider's honesty.
 * No witness/private key, signed XDR or proof is persisted by this module.
 * It never calls signAndSend, rebuilds an unknown attempt, or retries a send.
 */
import {Buffer} from 'buffer';
import {Account,Address,BASE_FEE,Contract,FeeBumpTransaction,Keypair,Memo,Networks,StrKey,Transaction,TransactionBuilder,hash,nativeToScVal,rpc,xdr} from '@stellar/stellar-sdk';
import {Client} from './bindings.ts';
import {prepareSubmit,fieldBytes,type PublicAddresses} from './adapter.ts';
import {assertPoolRelease,type PoolRelease} from './release.ts';
import {assertPoolReader} from './reader.ts';
import {snapshotAttempt,snapshotIntent,type PublicAttempt,type SubmissionJournal,type TerminalEvidence} from './journal.ts';
import {accountField,assetField} from '../../../privacy/src/identity.mjs';

export interface WalletSession {id:string;account:string;networkPassphrase:string}
export interface PrivateWallet {
  session():WalletSession;
  signTransaction(xdr:string,networkPassphrase:string,account:string):Promise<string>;
}
export interface PoolCheckpoint {root:bigint;nextIndex:bigint;recordCount:bigint;revocationCount:bigint;revocationRoot:bigint;snapshotId:string}
export interface SubmissionReader {
  readState():Promise<PoolCheckpoint>;
  readRecord(id:string,options:{snapshotId:string}):Promise<{recordId:string;publicInputs:readonly bigint[]}>;
}
export interface SubmissionTransport {
  getAccount(address:string):Promise<Account>;
  getLatestLedger():Promise<{sequence:number}>;
  simulateTransaction(tx:Transaction):Promise<rpc.Api.SimulateTransactionResponse>;
  sendTransaction(tx:Transaction):Promise<{hash:string;status:string}>;
  getTransaction(hash:string):Promise<rpc.Api.GetTransactionResponse>;
}
export interface PublicSubmission {kind:'UnsubmittedPrivateTransition';proof:string;publicSignals:readonly string[];ciphertextDigest:string}
export interface SubmissionOutcome {kind:'PrivateSubmissionOutcome';hash:string;recordId:string;source:string;releaseId:string;status:'pending'|'confirmed'|'failed'|'known_not_sent';ledger:number|null}
export interface SubmissionOptions {
  release:PoolRelease;wallet:PrivateWallet;reader:SubmissionReader;transport:SubmissionTransport;journal:SubmissionJournal;
  /** Must be the pinned LOCAL verifier for this release; never a remote prover. */
  verifyLocal(proof:string,publicSignals:readonly string[]):Promise<boolean>;
  /** Explicit caller/user fee budget, including Soroban resource fee, in stroops. */
  maxFeeStroops:string;
}
function ensure(ok:unknown,code:string):asserts ok {if(!ok)throw new Error(code);}
function plain(value:unknown,keys:readonly string[]):Record<string,unknown>{
 ensure(!!value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype,'INVALID_PUBLIC_INPUT');
 ensure(Reflect.ownKeys(value).length===keys.length,'INVALID_PUBLIC_INPUT');const copy:Record<string,unknown>={};
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);ensure(d&&'value'in d&&d.enumerable,'INVALID_PUBLIC_INPUT');copy[key]=d.value;}return copy;
}
function session(wallet:PrivateWallet):WalletSession {
 const s=plain(wallet.session(),['id','account','networkPassphrase']);
 ensure(typeof s.id==='string'&&s.id.length>0&&s.id.length<=128&&typeof s.account==='string'&&StrKey.isValidEd25519PublicKey(s.account)&&s.networkPassphrase===Networks.TESTNET,'TESTNET_WALLET_REQUIRED');
 return Object.freeze(s as unknown as WalletSession);
}
function sameSession(wallet:PrivateWallet,expected:WalletSession){const now=session(wallet);ensure(now.id===expected.id&&now.account===expected.account&&now.networkPassphrase===expected.networkPassphrase,'WALLET_SESSION_CHANGED');}
function checkpoint(value:PoolCheckpoint):PoolCheckpoint {
 const s=plain(value,['root','nextIndex','recordCount','revocationCount','revocationRoot','snapshotId']);
 for(const key of ['root','nextIndex','recordCount','revocationCount','revocationRoot'])fieldBytes(s[key] as bigint);
 ensure((s.nextIndex as bigint)<=1n<<32n&&(s.recordCount as bigint)<1n<<64n&&(s.revocationCount as bigint)<1n<<64n&&typeof s.snapshotId==='string'&&/^[0-9a-f]{64}$/.test(s.snapshotId),'INVALID_POOL_CHECKPOINT');
 return Object.freeze(s as unknown as PoolCheckpoint);
}
function sameCheckpoint(actual:PoolCheckpoint,expected:PoolCheckpoint){ensure(Object.keys(expected).every(k=>actual[k as keyof PoolCheckpoint]===expected[k as keyof PoolCheckpoint]),'POOL_CHECKPOINT_CHANGED');}
const positiveLedger=(value:number)=>Number.isInteger(value)&&value>0&&value<2**32;
function current(ledger:number,fields:readonly bigint[]){ensure(positiveLedger(ledger)&&BigInt(ledger)>=fields[6]&&BigInt(ledger)<=fields[7],'TRANSACTION_WINDOW_EXPIRED');}
function addressId(address:string){return accountField({kind:StrKey.isValidContract(address)?'contract':'account',id:Buffer.from(StrKey.isValidContract(address)?StrKey.decodeContract(address):StrKey.decodeEd25519PublicKey(address)).toString('hex')});}
function candidate(value:PublicSubmission,addresses:PublicAddresses,release:PoolRelease,source:string){
 const v=plain(value,['kind','proof','publicSignals','ciphertextDigest']);ensure(v.kind==='UnsubmittedPrivateTransition','LOCAL_SUBMISSION_REQUIRED');
 const intent=snapshotIntent({releaseId:release.scope.profileId,pool:release.pool,source,recordId:v.ciphertextDigest,publicSignals:v.publicSignals} as Parameters<typeof snapshotIntent>[0]);
 const fields=intent.publicSignals.map(BigInt),args=prepareSubmit(fields,v.proof as string,addresses);
 ensure(fields[0]===release.profile.domain&&fields[1]===release.profile.assetPolicyRoot&&fields[2]===release.profile.epoch&&fields[3]===release.profile.auditor[0]&&fields[4]===release.profile.auditor[1],'RELEASE_PROFILE_MISMATCH');
 if(args.transition.asset)ensure(assetField(StrKey.decodeContract(args.transition.asset).toString('hex'))===fields[17],'ASSET_ID_MISMATCH');
 if(args.transition.bridge_account)ensure(addressId(args.transition.bridge_account)===fields[19],'BRIDGE_ACCOUNT_MISMATCH');
 if(args.transition.fee_account)ensure(addressId(args.transition.fee_account)===fields[21],'FEE_ACCOUNT_MISMATCH');
 ensure(fields[16]!==1n||args.transition.bridge_account===source,'DEPOSIT_SOURCE_MUST_BE_FUNDER');
 ensure(fields[7]<0xffffffffn,'UNSUPPORTED_MAX_LEDGER');
 return {intent,fields,args,proof:v.proof as string};
}
function functionOf(tx:Transaction){ensure(tx.operations.length===1&&tx.operations[0].type==='invokeHostFunction','EXACT_POOL_CALL_REQUIRED');return tx.operations[0];}
function callDigest(tx:Transaction){return hash(functionOf(tx).func.toXDR()).toString('hex');}
function sameScVal(a:xdr.ScVal,b:xdr.ScVal){return a.toXDR().equals(b.toXDR());}
function simulationAuth(tx:Transaction,expected:xdr.HostFunction,release:PoolRelease,fields:readonly bigint[],args:ReturnType<typeof prepareSubmit>){
 const op=functionOf(tx);ensure(!op.source&&op.func.toXDR().equals(expected.toXDR()),'SIMULATION_CHANGED_INVOCATION');
 const auth=op.auth??[];
 if(fields[16]!==1n){ensure(auth.length===0,'UNEXPECTED_AUTHORIZATION');return;}
 ensure(auth.length===1,'SOURCE_AUTHORIZATION_REQUIRED');const entry=auth[0];
 ensure(entry.credentials().switch().name==='sorobanCredentialsSourceAccount','UNSUPPORTED_AUTHORIZATION');
 const root=entry.rootInvocation();ensure(root.function().switch().name==='sorobanAuthorizedFunctionTypeContractFn','UNEXPECTED_AUTHORIZATION');
 const fn=root.function().contractFn(),expectedFn=expected.invokeContract();
 ensure(fn.toXDR().equals(expectedFn.toXDR()),'UNEXPECTED_AUTHORIZATION');
 const subs=root.subInvocations();ensure(subs.length===1&&subs[0].subInvocations().length===0,'UNEXPECTED_AUTHORIZATION');
 const child=subs[0].function();ensure(child.switch().name==='sorobanAuthorizedFunctionTypeContractFn','UNEXPECTED_AUTHORIZATION');
 const transfer=child.contractFn(),asset=args.transition.asset!,funder=args.transition.bridge_account!;
 const wanted=[new Address(funder).toScVal(),new Address(release.pool).toScVal(),nativeToScVal(fields[18],{type:'i128'})];
 ensure(Address.fromScAddress(transfer.contractAddress()).toString()===asset&&transfer.functionName().toString()==='transfer'&&transfer.args().length===3&&transfer.args().every((v,i)=>sameScVal(v,wanted[i])),'UNEXPECTED_AUTHORIZATION');
}
function signedTransaction(requested:Transaction,returned:string,account:string):Transaction {
 ensure(typeof returned==='string'&&returned.length<1_000_000,'INVALID_SIGNED_TRANSACTION');
 const signed=TransactionBuilder.fromXDR(returned,Networks.TESTNET);ensure(signed instanceof Transaction,'FEE_BUMP_UNSUPPORTED');
 ensure(signed.hash().equals(requested.hash())&&signed.source===account,'WALLET_CHANGED_TRANSACTION');
 const key=Keypair.fromPublicKey(account);ensure(signed.signatures.some(s=>key.verify(signed.hash(),s.signature())),'EXPECTED_WALLET_SIGNATURE_REQUIRED');
 return signed;
}
function boundEnvelope(outcome:rpc.Api.GetTransactionResponse,attempt:PublicAttempt):xdr.TransactionResultResult|xdr.InnerTransactionResultResult|null {
 try{
  if(outcome.txHash!==attempt.hash||(outcome.status!=='SUCCESS'&&outcome.status!=='FAILED')||!positiveLedger(outcome.ledger))return null;
  const envelope=TransactionBuilder.fromXDR(outcome.envelopeXdr,Networks.TESTNET);
  const wrapped=envelope instanceof FeeBumpTransaction;if(outcome.feeBump!==wrapped)return null;
  const tx=wrapped?envelope.innerTransaction:envelope;if(!(tx instanceof Transaction)||tx.hash().toString('hex')!==attempt.hash||tx.source!==attempt.source||tx.sequence!==attempt.sequence||callDigest(tx)!==attempt.callHash)return null;
  const invocation=functionOf(tx).func.invokeContract();if(Address.fromScAddress(invocation.contractAddress()).toString()!==attempt.pool||invocation.functionName().toString()!=='submit')return null;
  const key=Keypair.fromPublicKey(attempt.source);if(!tx.signatures.some(s=>key.verify(tx.hash(),s.signature())))return null;
  const result=outcome.resultXdr.result();
  if(wrapped){
   // A third party can wrap the unchanged signed inner transaction. The RPC
   // indexes both hashes but returns the OUTER envelope/result. A failed outer
   // precondition is not evidence that the inner sequence was consumed.
   if(result.switch().name!==(outcome.status==='SUCCESS'?'txFeeBumpInnerSuccess':'txFeeBumpInnerFailed'))return null;
   const pair=result.innerResultPair();if(pair.transactionHash().toString('hex')!==attempt.hash)return null;
   const inner=pair.result().result();return inner.switch().name===(outcome.status==='SUCCESS'?'txSuccess':'txFailed')?inner:null;
  }
  return result.switch().name===(outcome.status==='SUCCESS'?'txSuccess':'txFailed')?result:null;
 }catch{return null;}
}
function successMeta(outcome:rpc.Api.GetSuccessfulTransactionResponse,recordId:string,result:xdr.TransactionResultResult|xdr.InnerTransactionResultResult):boolean {
 try{
  if(result.switch().name!=='txSuccess')return false;
  const operations=result.results();if(operations.length!==1||operations[0].switch().name!=='opInner')return false;
  const op=operations[0].tr();if(op.switch().name!=='invokeHostFunction'||op.invokeHostFunctionResult().switch().name!=='invokeHostFunctionSuccess')return false;
  const meta=outcome.resultMetaXdr,version=meta.switch();
  const rv=version===3?meta.v3().sorobanMeta()?.returnValue():version===4?meta.v4().sorobanMeta()?.returnValue():null;
  if(!rv||rv.switch().name!=='scvBytes'||rv.bytes().toString('hex')!==recordId)return false;
  const events=version===3?meta.v3().sorobanMeta()!.events():meta.v4().operations()[0]?.events();if(!events)return false;
  const preimage=new xdr.InvokeHostFunctionSuccessPreImage({returnValue:rv,events});
  return hash(preimage.toXDR()).equals(op.invokeHostFunctionResult().success());
 }catch{return false;}
}
function failedOperation(result:xdr.TransactionResultResult|xdr.InnerTransactionResultResult):boolean {
 try{
  if(result.switch().name!=='txFailed')return false;
  const ops=result.results();if(ops.length!==1)return false;
  if(ops[0].switch().name!=='opInner')return ops[0].switch().value<0;
  const inner=ops[0].tr();return inner.switch().name==='invokeHostFunction'&&inner.invokeHostFunctionResult().switch().value<0;
 }catch{return false;}
}
function outcome(attempt:PublicAttempt,terminal:TerminalEvidence|null):SubmissionOutcome{return Object.freeze({kind:'PrivateSubmissionOutcome',hash:attempt.hash,recordId:attempt.recordId,source:attempt.source,releaseId:attempt.releaseId,status:terminal?.status??'pending',ledger:terminal&&'ledger'in terminal?terminal.ledger:null});}

export function createTestnetSubmissionLifecycle(options:SubmissionOptions){
 assertPoolRelease(options.release);assertPoolReader(options.reader,options.release);const {release,wallet,reader,transport,journal,verifyLocal}=options;
 ensure(release.networkPassphrase===Networks.TESTNET&&typeof verifyLocal==='function','TESTNET_RELEASE_REQUIRED');
 ensure(typeof options.maxFeeStroops==='string'&&/^[1-9][0-9]{0,9}$/.test(options.maxFeeStroops)&&BigInt(options.maxFeeStroops)<=0xffffffffn,'EXPLICIT_FEE_BUDGET_REQUIRED');const feeCap=BigInt(options.maxFeeStroops);
 const spec=new Client({contractId:release.pool,networkPassphrase:Networks.TESTNET,rpcUrl:release.rpcUrl}).spec;
 async function reconcileAttempt(attempt:PublicAttempt):Promise<SubmissionOutcome>{
  ensure(attempt.releaseId===release.scope.profileId&&attempt.pool===release.pool,'ATTEMPT_RELEASE_MISMATCH');
  const existing=await journal.get(attempt.hash);ensure(existing,'PENDING_ATTEMPT_REQUIRED');if(existing.terminal)return outcome(attempt,existing.terminal);
  try{
   // Every readState revalidates the pinned network, deployed bytecode/config.
   const before=checkpoint(await reader.readState()),response=await transport.getTransaction(attempt.hash);
   const result=boundEnvelope(response,attempt);if(!result)return outcome(attempt,null);
   let evidence:TerminalEvidence;
   if(response.status==='FAILED'){
    if(!failedOperation(result)||!xdr.TransactionMeta.isValid(response.resultMetaXdr))return outcome(attempt,null);
    evidence={hash:attempt.hash,status:'failed',ledger:response.ledger};
   }else if(response.status==='SUCCESS'){
    if(!successMeta(response,attempt.recordId,result))return outcome(attempt,null);
    const record=await reader.readRecord(attempt.recordId,{snapshotId:before.snapshotId});
    if(record.recordId!==attempt.recordId||record.publicInputs.length!==157||!record.publicInputs.every((n,i)=>typeof n==='bigint'&&n.toString()===attempt.publicSignals[i]))return outcome(attempt,null);
    evidence={hash:attempt.hash,status:'confirmed',ledger:response.ledger};
   }else return outcome(attempt,null);
   sameCheckpoint(checkpoint(await reader.readState()),before);await journal.terminal(evidence);return outcome(attempt,evidence);
  }catch{return outcome(attempt,null);}
 }
 async function submit(value:PublicSubmission,addresses:PublicAddresses,retryOf:string|null):Promise<SubmissionOutcome>{
   const expectedSession=session(wallet),c=candidate(value,addresses,release,expectedSession.account);
   return journal.exclusive(async()=>{
    sameSession(wallet,expectedSession);
    const previous=await journal.find(c.intent);sameSession(wallet,expectedSession);
    if(retryOf===null&&previous)return reconcileAttempt(previous.attempt);
    if(retryOf!==null)ensure(previous?.attempt.hash===retryOf&&previous.terminal?.status==='known_not_sent','EXPLICIT_NOT_SENT_RETRY_REQUIRED');
    const conflicts=await journal.conflicts(c.intent);sameSession(wallet,expectedSession);
    if(conflicts.length){const same=conflicts.find(a=>a.recordId===c.intent.recordId&&a.releaseId===c.intent.releaseId&&a.source===c.intent.source&&a.publicSignals.every((n,i)=>n===c.intent.publicSignals[i]));
     ensure(same&&conflicts.length===1,'UNRESOLVED_PRIVATE_ATTEMPT');return reconcileAttempt(same);}
    ensure(await verifyLocal(c.proof,c.intent.publicSignals)===true,'INVALID_LOCAL_PROOF');sameSession(wallet,expectedSession);
    const initial=checkpoint(await reader.readState());sameSession(wallet,expectedSession);
    ensure(initial.root===c.fields[9]&&initial.nextIndex===c.fields[11]&&initial.revocationRoot===c.fields[5],'STALE_PROOF_CHECKPOINT');
    const account=await transport.getAccount(expectedSession.account);sameSession(wallet,expectedSession);
    ensure(account.accountId()===expectedSession.account&&/^(0|[1-9][0-9]{0,18})$/.test(account.sequenceNumber())&&BigInt(account.sequenceNumber())<(1n<<63n)-1n,'INVALID_SOURCE_ACCOUNT');
    const op=new Contract(release.pool).call('submit',...spec.funcArgsToScVals('submit',c.args));
    const builder=new TransactionBuilder(new Account(expectedSession.account,account.sequenceNumber()),{fee:BASE_FEE,networkPassphrase:Networks.TESTNET})
     .addOperation(op).setTimeout(0).setLedgerbounds(Number(c.fields[6]),Number(c.fields[7]+1n));
    // A deliberate retry gets a fresh public identifier. The prior immutable
    // known-not-sent attempt remains available; no unknown send is ever retried.
    if(retryOf!==null)builder.addMemo(Memo.hash(Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(32)))));
    const raw=builder.build(),rawXdr=raw.toXDR(),expectedFunction=xdr.HostFunction.fromXDR(functionOf(raw).func.toXDR());
    const simulation=await transport.simulateTransaction(TransactionBuilder.fromXDR(rawXdr,Networks.TESTNET) as Transaction);sameSession(wallet,expectedSession);
    ensure(rpc.Api.isSimulationSuccess(simulation)&&!rpc.Api.isSimulationRestore(simulation)&&simulation.result,'SIMULATION_OR_RESTORATION_REQUIRED');
    ensure(simulation.result.retval.switch().name==='scvBytes'&&simulation.result.retval.bytes().toString('hex')===c.intent.recordId,'SIMULATION_RECORD_MISMATCH');
    current(simulation.latestLedger,c.fields);
    const assembled=rpc.assembleTransaction(TransactionBuilder.fromXDR(rawXdr,Networks.TESTNET) as Transaction,simulation).build();
    ensure(BigInt(assembled.fee)<=feeCap,'FEE_BUDGET_EXCEEDED');simulationAuth(assembled,expectedFunction,release,c.fields,c.args);
    sameCheckpoint(checkpoint(await reader.readState()),initial);sameSession(wallet,expectedSession);
    current((await transport.getLatestLedger()).sequence,c.fields);sameSession(wallet,expectedSession);
    const returned=await wallet.signTransaction(assembled.toXDR(),Networks.TESTNET,expectedSession.account);sameSession(wallet,expectedSession);
    const signed=signedTransaction(assembled,returned,expectedSession.account);
    const attempt=snapshotAttempt({version:1,hash:signed.hash().toString('hex'),sequence:signed.sequence,callHash:callDigest(signed),retryOf,...c.intent});
    // Completion of this durable write is mandatory BEFORE calling send.
    await journal.commit(attempt);let sendStarted=false;
    try{
     sameSession(wallet,expectedSession);
     sameCheckpoint(checkpoint(await reader.readState()),initial);sameSession(wallet,expectedSession);
     current((await transport.getLatestLedger()).sequence,c.fields);sameSession(wallet,expectedSession);
     sendStarted=true;
     const sent=await transport.sendTransaction(signed);
     // Never replace our signed hash with an RPC-provided value. Even ERROR
     // or a thrown response may follow an accepted transaction: query only.
     if(sent.hash!==attempt.hash)return outcome(attempt,null);
     return reconcileAttempt(attempt);
    }catch(error){
     if(!sendStarted){
      const message=error instanceof Error?error.message:'';
      const evidence:TerminalEvidence={hash:attempt.hash,status:'known_not_sent',reason:message==='WALLET_SESSION_CHANGED'||message==='TESTNET_WALLET_REQUIRED'?'session_changed':message==='POOL_CHECKPOINT_CHANGED'||message==='TRANSACTION_WINDOW_EXPIRED'?'checkpoint_changed':'read_failed'};
      try{await journal.terminal(evidence);return outcome(attempt,evidence);}catch{return outcome(attempt,null);}
     }
     return reconcileAttempt(attempt);
    }
   });
  }
 return Object.freeze({
  async reconcile(hashValue:string){return journal.exclusive(async()=>{const entry=await journal.get(hashValue);ensure(entry,'PENDING_ATTEMPT_REQUIRED');return reconcileAttempt(snapshotAttempt(entry.attempt));});},
  submit(value:PublicSubmission,addresses:PublicAddresses){return submit(value,addresses,null);},
  retryKnownNotSent(previousHash:string,value:PublicSubmission,addresses:PublicAddresses){ensure(typeof previousHash==='string'&&/^[0-9a-f]{64}$/.test(previousHash),'EXPLICIT_NOT_SENT_RETRY_REQUIRED');return submit(value,addresses,previousHash);},
 });
}
