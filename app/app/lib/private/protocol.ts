export type * from './protocol-types';
import {Buffer} from 'buffer';
import {Networks,StrKey,Transaction,TransactionBuilder,rpc} from '@stellar/stellar-sdk';
import {createPoolReader,assertPoolReader,type PoolReader} from '../../../../contracts/private-pool/client/reader';
import {assertPoolRelease,type PoolRelease} from '../../../../contracts/private-pool/client/release';
import {createIndexedDbSubmissionJournal,type SubmissionJournal} from '../../../../contracts/private-pool/client/journal';
import {createTestnetSubmissionLifecycle,FeeBudgetExceededError,type SubmissionTransport,type PublicSubmission,type WalletSession,type PrivateWallet} from '../../../../contracts/private-pool/client/submission';
import {createTestnetRevocationLifecycle,type PublicRevocation} from '../../../../contracts/private-pool/client/revocation';
import type {PublicAddresses} from '../../../../contracts/private-pool/client/adapter';
import {createLocalPrivacyClient,type LocalPrivateDraft,type LocalPrivacyClient} from '../../../../privacy/src/client.mjs';
import {recoverPrivateArchive,type RecoveredArchive} from '../../../../privacy/src/recovery.mjs';
import {SparseMerkleTree} from '../../../../privacy/src/model.mjs';
import {assetField} from '../../../../privacy/src/identity.mjs';
import {loadPinnedProverArtifacts} from '../../../../privacy/src/prover-assets.mjs';
import {createLocalGroth16WorkerProver,type LocalWorkerProver} from '../../../../privacy/src/prover-worker-host.mjs';
import {parsePrivateCommand,planPrivateCommand} from '../../../../privacy/src/planner.mjs';
import {receiveDescriptor as describeVault,exportPrivateCredential,checkExportedPrivateCredential,importPrivateCredential,checkPrivateCredential,forgetPrivateCredential,signTriggerAttestation,type PrivateCredentialHandle,type PrivateTriggerAttester,type PrivateTriggerAttestation} from '../../../../privacy/src/credentials.mjs';
import type {PrivacyVaultHandle} from '../privateVault';
import {PRIVATE_PROVER_ASSETS} from '../privateProverAssets';
import {onWalletSessionChange} from '../wallet';
import {WalletSignatureRejectedError} from '../wallet-errors';
import {PrivateFeeConfirmationCancelledError,privateCancellationMessage} from '../private-operation-errors';
import {DEFAULT_PRIVATE_RELEASE_KEY,resolvePrivateRelease,type PrivateReleasePolicy} from './release';
import {bindPrivateWallet,type BoundPrivateWallet} from './wallet-session';
import {summarizePrivateNote} from './note-summary';
import type {PrivateProtocol,PrivateProtocolOptions,PrivateProtocolSnapshot,PrivateCommand,PreparedPrivateOperation,PrivatePendingAttempt,PrivateOperationOutcome,PrivateNoteSummary,PrivateReceiveDescriptor} from './protocol-types';

/** Explicit trusted integration adapters, used by the local/live test harness.
 * Product UI passes only options. No verifier, witness, server prover or release
 * selected by a form/URL is accepted by the browser defaults. */
export interface PrivateProtocolAdapters {
 /** Test/integration authority only. Product policy comes from the catalogue. */
 readonly policy?:PrivateReleasePolicy;
 release():Promise<PoolRelease>;
 assets:readonly string[];
 reader(release:PoolRelease):PoolReader;
 transport(release:PoolRelease):SubmissionTransport;
 journal():Promise<SubmissionJournal&{close():void}>;
 wallet(assertCurrent:()=>void):Promise<BoundPrivateWallet>;
 prover(count:157|4,signal:AbortSignal):Promise<LocalWorkerProver>;
 onWalletChange?(listener:()=>void):()=>void;
}
function ensure(ok:unknown,message:string):asserts ok{if(!ok)throw new Error(message);}
function positiveLedger(value:number){ensure(Number.isInteger(value)&&value>0&&value<0xffffffff,'PRIVATE_LEDGER_UNAVAILABLE');return value;}
function bounded<T>(work:Promise<T>,signal:AbortSignal|undefined,timeout=30_000):Promise<T>{
 return new Promise((resolve,reject)=>{
  let done=false;const finish=(callback:()=>void)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);callback()};
  const abort=()=>finish(()=>reject(new Error('PRIVATE_OPERATION_CANCELLED'))),timer=setTimeout(()=>finish(()=>reject(new Error('PRIVATE_OPERATION_TIMEOUT'))),timeout);
  work.then(value=>finish(()=>resolve(value)),error=>finish(()=>reject(error)));
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 });
}
function rpcTransport(release:PoolRelease):SubmissionTransport{
 const server=new rpc.Server(release.rpcUrl,{allowHttp:false,timeout:30_000});
 return {getAccount:address=>bounded(server.getAccount(address),undefined),getLatestLedger:()=>bounded(server.getLatestLedger(),undefined),
  simulateTransaction:tx=>bounded(server.simulateTransaction(tx),undefined),sendTransaction:tx=>bounded(server.sendTransaction(tx),undefined),getTransaction:hash=>bounded(server.getTransaction(hash),undefined)};
}
const browserAdapters:Omit<PrivateProtocolAdapters,'release'|'assets'|'policy'>={
 reader:createPoolReader,transport:rpcTransport,journal:createIndexedDbSubmissionJournal,wallet:bindPrivateWallet,onWalletChange:onWalletSessionChange,
 async prover(count,signal){const config=await loadPinnedProverArtifacts(count===157?PRIVATE_PROVER_ASSETS.transition:PRIVATE_PROVER_ASSETS.revocation,{signal});return createLocalGroth16WorkerProver(config,{signal});},
};
const empty=Object.freeze([]);
const safeError='The private operation could not complete. Check pending activity before trying again.';
interface PreparedState {
 vault:PrivacyVaultHandle;session:WalletSession;generation:number;plan:ReturnType<typeof planPrivateCommand>;
 candidate:PublicSubmission|PublicRevocation;addresses:PublicAddresses|null;draft:LocalPrivateDraft|null;
 checked:Set<string>;result:PrivateOperationOutcome|null;signingStarted:boolean;
}
function address(value:{kind:'account'|'contract';id:string}|null):string|null{
 if(value===null)return null;ensure(/^[0-9a-f]{64}$/.test(value.id),'PRIVATE_ADDRESS_INVALID');
 return value.kind==='account'?StrKey.encodeEd25519PublicKey(Buffer.from(value.id,'hex')):value.kind==='contract'?StrKey.encodeContract(Buffer.from(value.id,'hex')):(()=>{throw Error('PRIVATE_ADDRESS_INVALID')})();
}
function sameSession(actual:WalletSession,expected:WalletSession){ensure(actual.id===expected.id&&actual.account===expected.account&&actual.networkPassphrase===expected.networkPassphrase,'WALLET_SESSION_CHANGED');}

export async function createPrivateProtocol(options:PrivateProtocolOptions,integration?:PrivateProtocolAdapters):Promise<PrivateProtocol>{
 ensure(typeof options.confirmFee==='function','PRIVATE_FEE_CONFIRMATION_REQUIRED');
 ensure(/^[1-9][0-9]{0,9}$/.test(options.maxFeeStroops)&&BigInt(options.maxFeeStroops)<=0xffffffffn,'EXPLICIT_FEE_BUDGET_REQUIRED');
 // Resolve compiled policy, assets and scope as one authority before opening any
 // wallet, storage or network resource. Untrusted selectors cannot supply pins.
 const selected=integration?null:await resolvePrivateRelease(options.releaseKey??DEFAULT_PRIVATE_RELEASE_KEY);
 const adapters:PrivateProtocolAdapters=integration??{...browserAdapters,release:async()=>selected!.release,assets:selected!.assets,policy:selected!.policy};
 const recoveryActions=new Set(['consolidate','withdraw','pod-claim','trigger-claim','trigger-refund','envoy-claim','envoy-reclaim','envoy-revoke']);
 function assertAction(action:string){
  const policy=adapters.policy??'funding';ensure(policy==='funding'||policy==='recovery','PRIVATE_RELEASE_POLICY_REQUIRED');
  ensure(policy==='funding'||recoveryActions.has(action),'PRIVATE_RELEASE_RECOVERY_ONLY');
 }
 const release=await adapters.release();assertPoolRelease(release);ensure(release.networkPassphrase===Networks.TESTNET,'PRIVATE_TESTNET_REQUIRED');
 const reader=adapters.reader(release);assertPoolReader(reader,release);const transport=adapters.transport(release);
 ensure(Array.isArray(adapters.assets)&&adapters.assets.length>0&&adapters.assets.length<=8&&new Set(adapters.assets).size===adapters.assets.length,'PRIVATE_ASSET_POLICY_REQUIRED');
 const assets=adapters.assets.map(a=>{ensure(StrKey.isValidContract(a),'PRIVATE_ASSET_POLICY_REQUIRED');return StrKey.decodeContract(a).toString('hex')});
 const tree=new SparseMerkleTree(8),assetNames=new Map<string,string>();assets.forEach((a,i)=>{const id=assetField(a);tree.set(BigInt(i),id);assetNames.set(id.toString(),a)});
 ensure(tree.root===release.profile.assetPolicyRoot,'PRIVATE_ASSET_POLICY_MISMATCH');
 const journal=await adapters.journal();let disposed=false,busy=false,generation=0,abort:AbortController|null=null;
 let state:PrivateProtocolSnapshot=Object.freeze({status:options.vault.getSnapshot().status==='ready'?'idle':'locked',phase:null,ledger:null,balances:empty,notes:empty,pending:empty,error:null,feeQuote:null});
 const listeners=new Set<()=>void>(),prepared=new Map<PreparedPrivateOperation,PreparedState>(),completed=new WeakMap<PreparedPrivateOperation,PrivateOperationOutcome>();
 const reconciled=new Map<string,PrivateOperationOutcome>();
 const credentials:PrivateCredentialHandle[]=[];
 let recovered:RecoveredArchive|null=null,prover:{count:157|4;value:LocalWorkerProver}|null=null;
 function publish(next:Partial<PrivateProtocolSnapshot>){if(disposed)return;state=Object.freeze({...state,...next});listeners.forEach(listener=>listener());}
 function disposeProver(){prover?.value.dispose();prover=null;}
 function clearRecovery(){if(recovered)for(const item of recovered.notes)client.forget(item.note);recovered=null;}
 function clearPrepared(){for(const entry of prepared.values())if(entry.draft)client.forget(entry.draft);prepared.clear();}
 function invalidate(){generation++;abort?.abort();disposeProver();clearPrepared();clearRecovery();for(const handle of credentials)forgetPrivateCredential(handle);credentials.length=0;publish({status:'locked',phase:null,ledger:null,balances:empty,notes:empty,pending:empty,error:null,feeQuote:null});}
 function current(){ensure(!disposed,'PRIVATE_PROTOCOL_DISPOSED');}
 async function localProver(count:157|4,signal:AbortSignal):Promise<LocalWorkerProver>{
  current();if(prover?.count===count)return prover.value;disposeProver();const created=await adapters.prover(count,signal);
  if(disposed||signal.aborted){created.dispose();throw Error('PRIVATE_OPERATION_CANCELLED');}
  prover={count,value:created};return created;
 }
 const client:LocalPrivacyClient=createLocalPrivacyClient({profile:release.profile,
  prove:async witness=>{ensure(abort,'PRIVATE_OPERATION_REQUIRED');return (await localProver(157,abort.signal)).prove(witness)},
  verify:async(proof,signals)=>{ensure(abort,'PRIVATE_OPERATION_REQUIRED');return (await localProver(157,abort.signal)).verify(proof,signals)},
 });
 const detachVault=options.vault.subscribe(()=>{if(options.vault.getSnapshot().status!=='ready')invalidate()});
 const detachWallet=adapters.onWalletChange?.(invalidate);
 async function pending():Promise<readonly PrivatePendingAttempt[]>{
  current();const version=generation,bound=await adapters.wallet(current),who=bound.wallet.session();const rows=await journal.pending();current();
  ensure(generation===version,'PRIVATE_OPERATION_CANCELLED');sameSession(bound.wallet.session(),who);
  const value=Object.freeze(rows.filter(a=>a.releaseId===release.scope.profileId&&a.pool===release.pool&&a.source===who.account).map(a=>Object.freeze({hash:a.hash,operation:a.version===1?'submit' as const:'revoke' as const,source:a.source,releaseId:a.releaseId})));
  publish({pending:value});return value;
 }
 async function run<T>(phase:PrivateProtocolSnapshot['phase'],work:(vault:PrivacyVaultHandle,assertCurrent:()=>void,signal:AbortSignal)=>Promise<T>):Promise<T>{
  current();ensure(!busy,'PRIVATE_OPERATION_BUSY');busy=true;const own=new AbortController(),version=generation;abort=own;
  const priorStatus=state.status;
  publish({status:'checking',phase,error:null});
  try{const completed=await options.vault.withCheckedVault(async(vault,assertVault)=>{
   const assertCurrent=()=>{current();assertVault();ensure(version===generation&&!own.signal.aborted,'PRIVATE_OPERATION_CANCELLED');
    ensure(vault.scope.profileId===release.scope.profileId&&vault.scope.epoch===release.scope.epoch&&vault.scope.domain.networkId===release.scope.domain.networkId&&vault.scope.domain.contractId===release.scope.domain.contractId,'PRIVATE_VAULT_SCOPE_MISMATCH');};
   assertCurrent();const result=await work(vault,assertCurrent,own.signal);assertCurrent();return result;
  });if(state.status==='checking')publish({status:priorStatus==='ready'?'ready':'idle'});return completed;}catch(error){
   disposeProver();
   if(!disposed&&version===generation){
    if(phase==='signing'&&options.vault.getSnapshot().status==='ready'&&privateCancellationMessage(error)!==null)
     publish({status:priorStatus==='ready'?'ready':'idle',phase:null,error:null});
    else publish({status:options.vault.getSnapshot().status==='ready'?'unavailable':'locked',phase:null,ledger:null,balances:empty,notes:empty,error:safeError});
   }
   throw error;
  }
  finally{busy=false;if(abort===own)abort=null;if(!disposed&&version===generation)publish({phase:null});}
 }
 async function recover(vault:PrivacyVaultHandle,assertCurrent:()=>void,signal:AbortSignal){
  clearRecovery();const result=await recoverPrivateArchive({profile:release.profile,scope:release.scope,vault,client,reader,credentials},signal);
  assertCurrent();recovered=result;const ledger=positiveLedger((await transport.getLatestLedger()).sequence);assertCurrent();
  const notes:PrivateNoteSummary[]=[],balances=new Map<string,bigint>();
  for(const item of result.notes){const n=client.readNote(item.note),asset=assetNames.get(n[2].toString());ensure(asset,'PRIVATE_ARCHIVE_ASSET_MISMATCH');
   const kind=(['cash','pod','trigger','envoy'] as const)[Number(n[4])];ensure(kind,'PRIVATE_NOTE_KIND_INVALID');
   notes.push(summarizePrivateNote(item.note.commitment,n,asset,BigInt(ledger),vault,credentials,result.archive.revocationTree));
   if(kind==='cash'&&n[5].toString()===vault.public.spendingAuthHash)balances.set(asset,(balances.get(asset)??0n)+n[3]);
  }
  publish({status:'ready',ledger,notes:Object.freeze(notes),balances:Object.freeze(assets.map(asset=>Object.freeze({asset,amount:(balances.get(asset)??0n).toString()}))),error:null});
  return {result,ledger};
 }
 async function makeLifecycles(wallet:PrivateWallet,signal:AbortSignal,maxFeeStroops=options.maxFeeStroops){
  const common={release,reader,wallet,transport,journal,maxFeeStroops};
  return {submit:createTestnetSubmissionLifecycle({...common,verifyLocal:async(p,s)=>(await localProver(157,signal)).verify(p,s)}),
   revoke:createTestnetRevocationLifecycle({...common,verifyLocal:async(p,s)=>(await localProver(4,signal)).verify(p,s)})};
 }
 async function prepare(value:PrivateCommand):Promise<PreparedPrivateOperation>{current();const command=parsePrivateCommand(value,release.scope);assertAction(command.action);return run('recovering',async(vault,assertCurrent,signal)=>{
  clearPrepared();const bound=await adapters.wallet(assertCurrent);assertCurrent();const walletSession=bound.wallet.session();
  const {result,ledger}=await recover(vault,assertCurrent,signal);assertCurrent();assertAction(command.action);
  const plan=planPrivateCommand({command,profile:release.profile,scope:release.scope,assets,ledger:BigInt(ledger),source:{kind:'account',id:StrKey.decodeEd25519PublicKey(bound.account).toString('hex')},archive:result.archive,notes:result.notes.map(item=>({id:item.note.commitment,index:item.index,note:client.readNote(item.note)})),usedGrantIds:result.usedGrantIds,vault,credentials});
  publish({phase:'proving'});let draft:LocalPrivateDraft|null=null,candidate:PublicSubmission|PublicRevocation,addresses:PublicAddresses|null=null;
  if(plan.kind==='transition'){
   draft=client.prepare(plan.configuration);try{candidate=await client.prepareSubmission(draft)}catch(error){client.forget(draft);throw error;}
   addresses={asset:plan.addresses.asset===null?null:StrKey.encodeContract(Buffer.from(plan.addresses.asset,'hex')),bridgeAccount:address(plan.addresses.bridgeAccount),feeAccount:address(plan.addresses.feeAccount)};
  }else{
   const proof=await (await localProver(4,signal)).prove(plan.witness);assertCurrent();
   ensure(proof.publicSignals.length===4&&proof.publicSignals.every((n,i)=>n===plan.publicSignals[i]),'PRIVATE_REVOCATION_SIGNAL_MISMATCH');
   candidate={kind:'UnsubmittedPrivateRevocation',...proof,ownerKey:plan.ownerKey,signature:plan.signature};
  }
  assertCurrent();assertAction(command.action);sameSession(bound.wallet.session(),walletSession);
  const handle=Object.freeze({id:globalThis.crypto.randomUUID(),summary:Object.freeze({...plan.summary}),publicFeePayer:bound.account,maxFeeStroops:options.maxFeeStroops,
   credentials:Object.freeze(plan.requiredCredentialExports.map(item=>Object.freeze({id:item.id,role:item.role,recipient:item.recipient.spendingAuthHash})))});
  prepared.set(handle,{vault,session:walletSession,generation,plan,candidate,addresses,draft,checked:new Set(),result:null,signingStarted:false});publish({status:'ready',feeQuote:null});return handle;
 });}
 async function submit(handle:PreparedPrivateOperation):Promise<PrivateOperationOutcome>{
  current();const known=completed.get(handle);if(known)return reconciled.get(known.hash)??known;
  const entry=prepared.get(handle);ensure(entry,'PRIVATE_PREPARATION_REQUIRED');if(entry.result)return entry.result;
  assertAction(entry.plan.summary.action);
  try{return await run('signing',async(vault,assertCurrent,signal)=>{
   ensure(entry.vault===vault&&entry.generation===generation,'PRIVATE_PREPARATION_CHANGED');
   ensure(entry.plan.requiredCredentialExports.every(item=>entry.checked.has(item.id)),'PRIVATE_CREDENTIAL_BACKUP_REQUIRED');
   const bound=await adapters.wallet(assertCurrent);assertCurrent();assertAction(entry.plan.summary.action);sameSession(bound.wallet.session(),entry.session);
   const wallet:PrivateWallet={session:()=>{assertCurrent();return bound.wallet.session()},async signTransaction(value,network,account){
    assertCurrent();assertAction(entry.plan.summary.action);const tx=TransactionBuilder.fromXDR(value,Networks.TESTNET);ensure(tx instanceof Transaction,'PRIVATE_SIGNING_PAYLOAD_INVALID');
    ensure(BigInt(tx.fee)<=BigInt(handle.maxFeeStroops),'FEE_BUDGET_EXCEEDED');publish({phase:'confirming-fee',feeQuote:{feeStroops:tx.fee,maxFeeStroops:handle.maxFeeStroops}});
    const accepted=await bounded(Promise.resolve().then(()=>{assertCurrent();return options.confirmFee(Object.freeze({feeStroops:tx.fee,maxFeeStroops:handle.maxFeeStroops,source:account,action:handle.summary.action,signal}))}),signal,120_000);
    assertCurrent();assertAction(entry.plan.summary.action);sameSession(bound.wallet.session(),entry.session);
    if(accepted===false)throw new PrivateFeeConfirmationCancelledError();
    ensure(accepted===true,'INVALID_PRIVATE_FEE_CONFIRMATION');publish({phase:'signing'});
    entry.signingStarted=true;
    try{const signed=await bound.wallet.signTransaction(value,network,account);assertCurrent();return signed;}
    catch(error){
     // An explicit wallet decline precedes receipt of signed bytes and the
     // durable submission record. Unknown outcomes keep repricing disabled.
     if(error instanceof WalletSignatureRejectedError){assertCurrent();entry.signingStarted=false;}
     throw error;
    }
   }};
   const lifecycles=await makeLifecycles(wallet,signal,handle.maxFeeStroops),outcome=entry.candidate.kind==='UnsubmittedPrivateTransition'
    ?await lifecycles.submit.submit(entry.candidate,entry.addresses!):await lifecycles.revoke.revoke(entry.candidate);
   entry.result=outcome;if(entry.draft){client.forget(entry.draft);entry.draft=null;}prepared.delete(handle);completed.set(handle,outcome);
   // The public outcome remains in the durable journal even if lock/cancellation
   // subsequently invalidates this checked-vault callback.
   publish({status:'idle',ledger:null,balances:empty,notes:empty});return outcome;
  });}catch(error){if(error instanceof FeeBudgetExceededError)publish({feeQuote:Object.freeze({feeStroops:error.feeStroops,maxFeeStroops:error.maxFeeStroops})});throw error;}finally{await pending().catch(()=>{});disposeProver();}
 }
 async function reconcile(hash:string):Promise<PrivateOperationOutcome>{
  current();ensure(!busy,'PRIVATE_OPERATION_BUSY');busy=true;const version=generation;
  const assertCurrent=()=>{current();ensure(version===generation,'PRIVATE_OPERATION_CANCELLED')};
  try{
   const entry=await journal.get(hash);assertCurrent();ensure(entry&&entry.attempt.releaseId===release.scope.profileId&&entry.attempt.pool===release.pool,'PRIVATE_ATTEMPT_REQUIRED');
   const bound=await adapters.wallet(assertCurrent);assertCurrent();ensure(bound.account===entry.attempt.source,'PRIVATE_ATTEMPT_SOURCE_MISMATCH');const session=bound.wallet.session();
   const signal=new AbortController().signal,life=await makeLifecycles(bound.wallet,signal);
   const result=entry.attempt.version===1?await life.submit.reconcile(hash):await life.revoke.reconcile(hash);
   assertCurrent();sameSession(bound.wallet.session(),session);reconciled.set(hash,result);return result;
  }finally{busy=false;await pending().catch(()=>{});}
 }
 async function selectedFile(file:File):Promise<unknown>{
  ensure(typeof File==='function'&&file instanceof File&&file.size>0&&file.size<=3*1024*1024,'PRIVATE_CREDENTIAL_FILE_REQUIRED');
  const bytes=await file.arrayBuffer();ensure(bytes.byteLength===file.size&&bytes.byteLength<=3*1024*1024,'PRIVATE_CREDENTIAL_FILE_INVALID');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown;
 }
 function exportSpec(handle:PreparedPrivateOperation,id:string,vault:PrivacyVaultHandle){
  const entry=prepared.get(handle);ensure(entry&&entry.vault===vault&&entry.generation===generation&&!entry.result,'PRIVATE_PREPARATION_CHANGED');
  const item=entry.plan.requiredCredentialExports.find(item=>item.id===id);ensure(item,'PRIVATE_CREDENTIAL_EXPORT_REQUIRED');
  return {entry,spec:{vault,grantId:item.grantId,recipient:item.recipient,role:item.role,note:item.note}};
 }
 const credentialMethods={
  exportCredential(handle:PreparedPrivateOperation,id:string,password:string){return run(null,async(vault,assertCurrent)=>{
   const {spec}=exportSpec(handle,id,vault);const packet=await exportPrivateCredential(spec,password);assertCurrent();
   return Object.freeze({blob:new Blob([JSON.stringify(packet)],{type:'application/json'}),filename:`agyion-private-${spec.grantId}-${spec.role}.json`});
  });},
  checkExportedCredential(handle:PreparedPrivateOperation,id:string,file:File,password:string){return run(null,async(vault,assertCurrent)=>{
   const {entry,spec}=exportSpec(handle,id,vault);entry.checked.delete(id);const packet=await selectedFile(file);assertCurrent();
   ensure(await checkExportedPrivateCredential(spec,packet,password)===true,'PRIVATE_CREDENTIAL_CHECK_FAILED');assertCurrent();entry.checked.add(id);
  });},
  importCredential(file:File,password:string){return run(null,async(vault,assertCurrent)=>{
   ensure(credentials.length<64,'PRIVATE_CREDENTIAL_CAPACITY');const packet=await selectedFile(file);assertCurrent();let imported:PrivateCredentialHandle|undefined;
   try{imported=await importPrivateCredential(packet,password,vault);assertCurrent();ensure(await checkPrivateCredential(imported,packet,password,vault)===true,'PRIVATE_CREDENTIAL_CHECK_FAILED');assertCurrent();
    ensure(!credentials.some(c=>c.grantId===imported!.grantId&&c.role===imported!.role&&c.noteId===imported!.noteId),'PRIVATE_CREDENTIAL_ALREADY_IMPORTED');
    credentials.push(imported);imported=undefined;clearPrepared();clearRecovery();publish({status:'idle',ledger:null,balances:empty,notes:empty});
   }finally{if(imported)forgetPrivateCredential(imported);}
  });},
  signAttestation(attester:PrivateTriggerAttester,noteId:string):Promise<PrivateTriggerAttestation>{return run(null,async vault=>{
   const credential=credentials.find(c=>c.noteId===noteId&&c.role==='attest');ensure(credential,'PRIVATE_ATTESTER_CREDENTIAL_REQUIRED');return signTriggerAttestation(attester,credential,vault);
  });},
 };
 return Object.freeze({
  subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener)}},getSnapshot:()=>state,
  async refresh(){try{await run('recovering',async(vault,assertCurrent,signal)=>{await recover(vault,assertCurrent,signal)})}finally{await pending().catch(()=>{});}return state;},
  async refreshPending(){try{return await pending()}catch(error){publish({status:'unavailable',ledger:null,balances:empty,notes:empty,error:'Pending private activity could not be checked. Do not resubmit an unknown transaction.'});throw error;}},
  receiveDescriptor(){return run(null,async vault=>describeVault(vault) as PrivateReceiveDescriptor)},
  prepare,submit,reconcile,...credentialMethods,
  withFeeLimit(handle:PreparedPrivateOperation,maxFeeStroops:string){
   current();ensure(!busy,'PRIVATE_OPERATION_BUSY');const entry=prepared.get(handle);ensure(entry&&!entry.result&&!entry.signingStarted&&entry.generation===generation,'PRIVATE_PREPARATION_REQUIRED');
   ensure(/^[1-9][0-9]{0,9}$/.test(maxFeeStroops)&&BigInt(maxFeeStroops)<=0xffffffffn,'EXPLICIT_FEE_BUDGET_REQUIRED');
   const next=Object.freeze({...handle,id:globalThis.crypto.randomUUID(),maxFeeStroops});prepared.delete(handle);prepared.set(next,entry);return next;
  },
  dispose(){if(disposed)return;invalidate();disposed=true;detachVault();detachWallet?.();journal.close();listeners.clear();reconciled.clear();},
 });
}
