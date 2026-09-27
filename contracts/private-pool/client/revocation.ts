/** Experimental testnet-only public revocation lifecycle. No owner seed or
 * private witness enters this API, RPC payload, or durable public journal. */
import {Buffer} from 'buffer';
import {Account,BASE_FEE,Contract,Keypair,Memo,Networks,StrKey,Transaction,TransactionBuilder,rpc,xdr} from '@stellar/stellar-sdk';
import {Client} from './bindings.ts';
import {fieldBytes} from './adapter.ts';
import {assertPoolReader,type PoolReader} from './reader.ts';
import {assertPoolRelease} from './release.ts';
import {submissionSafety,type SubmissionOptions,type SubmissionOutcome} from './submission.ts';
import {snapshotAttempt,snapshotIntent,revocationIntentId,type JournalAttempt,type RevocationAttempt,type TerminalEvidence} from './journal.ts';
import {revocationTag} from '../../../privacy/src/identity.mjs';
export interface PublicRevocation {
 kind:'UnsubmittedPrivateRevocation';proof:string;publicSignals:readonly string[];ownerKey:string;signature:string;
}
export interface RevocationOptions extends Omit<SubmissionOptions,'reader'> {reader:PoolReader}
export interface RevocationOutcome extends Omit<SubmissionOutcome,'kind'|'recordId'> {kind:'PrivateRevocationOutcome';revocationId:string}
const ensure:(ok:unknown,code:string)=>asserts ok=submissionSafety.ensure;
const {plain,session,sameSession,checkpoint,sameCheckpoint,positiveLedger,functionOf,callDigest,signedTransaction,boundEnvelope,successMeta,failedOperation}=submissionSafety;
function outcome(a:RevocationAttempt,t:TerminalEvidence|null):RevocationOutcome{return Object.freeze({kind:'PrivateRevocationOutcome',hash:a.hash,revocationId:a.recordId,source:a.source,releaseId:a.releaseId,status:t?.status??'pending',ledger:t&&'ledger'in t?t.ledger:null});}
function within(ledger:number,first:number,last:number){ensure(positiveLedger(ledger)&&ledger>=first&&ledger<=last,'TRANSACTION_WINDOW_EXPIRED');}

export function createTestnetRevocationLifecycle(options:RevocationOptions){
 assertPoolRelease(options.release);assertPoolReader(options.reader,options.release);
 const {release,reader,wallet,transport,journal,verifyLocal}=options;
 ensure(release.networkPassphrase===Networks.TESTNET&&typeof verifyLocal==='function','TESTNET_RELEASE_REQUIRED');
 ensure(typeof options.maxFeeStroops==='string'&&/^[1-9][0-9]{0,9}$/.test(options.maxFeeStroops)&&BigInt(options.maxFeeStroops)<=0xffffffffn,'EXPLICIT_FEE_BUDGET_REQUIRED');
 const feeCap=BigInt(options.maxFeeStroops),spec=new Client({contractId:release.pool,networkPassphrase:Networks.TESTNET,rpcUrl:release.rpcUrl}).spec;
 function candidate(value:PublicRevocation,source:string){
  const v=plain(value,['kind','proof','publicSignals','ownerKey','signature']);
  ensure(v.kind==='UnsubmittedPrivateRevocation'&&typeof v.proof==='string'&&/^[0-9a-f]{512}$/.test(v.proof),'LOCAL_REVOCATION_REQUIRED');
  const intent=snapshotIntent({operation:'revoke',releaseId:release.scope.profileId,pool:release.pool,source,ownerKey:v.ownerKey as string,publicSignals:v.publicSignals as readonly string[],recordId:revocationIntentId(v.publicSignals as readonly string[],v.ownerKey as string)});
  const fields=intent.publicSignals.map(BigInt);
  ensure(fields[0]===release.profile.domain,'RELEASE_PROFILE_MISMATCH');
  ensure(revocationTag(fields[0],intent.ownerKey)===fields[3],'REVOCATION_OWNER_MISMATCH');
  ensure(typeof v.signature==='string'&&/^[0-9a-f]{128}$/.test(v.signature),'OWNER_SIGNATURE_REQUIRED');
  const message=Buffer.concat([Buffer.from('AGYION_REVOKE_V2\0'),...fields.map(fieldBytes)]);
  ensure(Keypair.fromPublicKey(StrKey.encodeEd25519PublicKey(Buffer.from(intent.ownerKey,'hex'))).verify(message,Buffer.from(v.signature,'hex')),'INVALID_OWNER_SIGNATURE');
  return {intent,fields,proof:v.proof,args:{tag:fieldBytes(fields[3]),old_root:fieldBytes(fields[1]),new_root:fieldBytes(fields[2]),owner_key:Buffer.from(intent.ownerKey,'hex'),signature:Buffer.from(v.signature,'hex'),proof:Buffer.from(v.proof,'hex')}};
 }
 async function reconcileAttempt(value:JournalAttempt):Promise<RevocationOutcome>{
  ensure(value.version===2,'REVOCATION_ATTEMPT_REQUIRED');const a=snapshotAttempt(value);
  ensure(a.releaseId===release.scope.profileId&&a.pool===release.pool,'ATTEMPT_RELEASE_MISMATCH');
  const existing=await journal.get(a.hash);ensure(existing,'PENDING_ATTEMPT_REQUIRED');if(existing.terminal)return outcome(a,existing.terminal);
  try{
   const before=checkpoint(await reader.readState()),response=await transport.getTransaction(a.hash),result=boundEnvelope(response,a);
   if(!result)return outcome(a,null);let evidence:TerminalEvidence;
   if(response.status==='FAILED'){
    if(!failedOperation(result)||!submissionSafety.validTransactionMeta(response.resultMetaXdr))return outcome(a,null);
    evidence={hash:a.hash,status:'failed',ledger:response.ledger};
   }else if(response.status==='SUCCESS'){
    if(!successMeta(response,null,result)||before.revocationCount<=BigInt(a.revocationIndex))return outcome(a,null);
    const accepted=await reader.readRevocationAt(BigInt(a.revocationIndex),{snapshotId:before.snapshotId});
    if(accepted.oldRoot.toString()!==a.publicSignals[1]||accepted.newRoot.toString()!==a.publicSignals[2]||accepted.tag.toString()!==a.publicSignals[3])return outcome(a,null);
    evidence={hash:a.hash,status:'confirmed',ledger:response.ledger};
   }else return outcome(a,null);
   sameCheckpoint(checkpoint(await reader.readState()),before);await journal.terminal(evidence);return outcome(a,evidence);
  }catch{return outcome(a,null);}
 }
 async function revoke(value:PublicRevocation,retryOf:string|null):Promise<RevocationOutcome>{
  const expectedSession=session(wallet),c=candidate(value,expectedSession.account);
  return journal.exclusive(async()=>{
   sameSession(wallet,expectedSession);const previous=await journal.find(c.intent);sameSession(wallet,expectedSession);
   if(retryOf===null&&previous)return reconcileAttempt(previous.attempt);
   if(retryOf!==null)ensure(previous?.attempt.hash===retryOf&&previous.terminal?.status==='known_not_sent','EXPLICIT_NOT_SENT_RETRY_REQUIRED');
   ensure((await journal.conflicts(c.intent)).length===0,'UNRESOLVED_PRIVATE_ATTEMPT');sameSession(wallet,expectedSession);
   ensure(await verifyLocal(c.proof,c.intent.publicSignals)===true,'INVALID_LOCAL_PROOF');sameSession(wallet,expectedSession);
   const initial=checkpoint(await reader.readState());sameSession(wallet,expectedSession);
   ensure(initial.revocationRoot===c.fields[1]&&initial.revocationCount<(1n<<64n)-1n,'STALE_PROOF_CHECKPOINT');
   const first=(await transport.getLatestLedger()).sequence;sameSession(wallet,expectedSession);
   ensure(positiveLedger(first)&&first<0xffffffff-120,'TRANSACTION_WINDOW_EXPIRED');const last=first+120;
   const account=await transport.getAccount(expectedSession.account);sameSession(wallet,expectedSession);
   ensure(account.accountId()===expectedSession.account&&/^(0|[1-9][0-9]{0,18})$/.test(account.sequenceNumber())&&BigInt(account.sequenceNumber())<(1n<<63n)-1n,'INVALID_SOURCE_ACCOUNT');
   const builder=new TransactionBuilder(new Account(expectedSession.account,account.sequenceNumber()),{fee:BASE_FEE,networkPassphrase:Networks.TESTNET})
    .addOperation(new Contract(release.pool).call('revoke',...spec.funcArgsToScVals('revoke',c.args))).setTimeout(0).setLedgerbounds(first,last+1);
   if(retryOf!==null)builder.addMemo(Memo.hash(Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(32)))));
   const raw=builder.build(),rawXdr=raw.toXDR(),expectedFunction=xdr.HostFunction.fromXDR(functionOf(raw).func.toXDR());
   const simulation=await transport.simulateTransaction(TransactionBuilder.fromXDR(rawXdr,Networks.TESTNET) as Transaction);sameSession(wallet,expectedSession);
   ensure(rpc.Api.isSimulationSuccess(simulation)&&!rpc.Api.isSimulationRestore(simulation)&&simulation.result,'SIMULATION_OR_RESTORATION_REQUIRED');
   ensure(simulation.result.retval.switch().name==='scvVoid','SIMULATION_REVOCATION_MISMATCH');within(simulation.latestLedger,first,last);
   const assembled=rpc.assembleTransaction(TransactionBuilder.fromXDR(rawXdr,Networks.TESTNET) as Transaction,simulation).build(),op=functionOf(assembled);
   submissionSafety.enforceFeeBudget(assembled.fee,feeCap);
   ensure(!op.source&&op.func.toXDR().equals(expectedFunction.toXDR()),'SIMULATION_CHANGED_INVOCATION');ensure((op.auth??[]).length===0,'UNEXPECTED_AUTHORIZATION');
   sameCheckpoint(checkpoint(await reader.readState()),initial);sameSession(wallet,expectedSession);
   within((await transport.getLatestLedger()).sequence,first,last);sameSession(wallet,expectedSession);
   const returned=await wallet.signTransaction(assembled.toXDR(),Networks.TESTNET,expectedSession.account);sameSession(wallet,expectedSession);
   const signed=signedTransaction(assembled,returned,expectedSession.account);
   const attempt=snapshotAttempt({version:2,hash:signed.hash().toString('hex'),sequence:signed.sequence,callHash:callDigest(signed),retryOf,revocationIndex:initial.revocationCount.toString(),...c.intent});
   await journal.commit(attempt);let sendStarted=false;
   try{
    sameSession(wallet,expectedSession);sameCheckpoint(checkpoint(await reader.readState()),initial);sameSession(wallet,expectedSession);
    within((await transport.getLatestLedger()).sequence,first,last);sameSession(wallet,expectedSession);sendStarted=true;
    const sent=await transport.sendTransaction(signed);if(sent.hash!==attempt.hash)return outcome(attempt,null);
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
  revoke(value:PublicRevocation){return revoke(value,null);},
  async reconcile(hashValue:string){return journal.exclusive(async()=>{const entry=await journal.get(hashValue);ensure(entry,'PENDING_ATTEMPT_REQUIRED');return reconcileAttempt(entry.attempt);});},
  retryKnownNotSent(previousHash:string,value:PublicRevocation){ensure(typeof previousHash==='string'&&/^[0-9a-f]{64}$/.test(previousHash),'EXPLICIT_NOT_SENT_RETRY_REQUIRED');return revoke(value,previousHash);},
 });
}
