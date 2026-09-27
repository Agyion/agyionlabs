/** Account-wide discovery and read-only recovery of durable public attempts.
 * The selected workspace never changes an attempt's original chain identity.
 * Missing or unauthenticated evidence keeps the shared source reservation. */
import {Networks,StrKey,rpc} from '@stellar/stellar-sdk';
import {createIndexedDbSubmissionJournal,snapshotAttempt,type JournalAttempt,type SubmissionJournal} from '../../../../contracts/private-pool/client/journal';
import {createPoolReader} from '../../../../contracts/private-pool/client/reader';
import {createTestnetSubmissionLifecycle,type SubmissionOutcome,type SubmissionOptions} from '../../../../contracts/private-pool/client/submission';
import {createTestnetRevocationLifecycle,type RevocationOutcome} from '../../../../contracts/private-pool/client/revocation';
import {assertPrivateReleaseSelection,listPrivateReleaseOptions,resolvePrivateRelease,type PrivateReleaseSelection} from './release';

export interface PrivateAccountPendingAttempt {
 readonly hash:string;readonly source:string;readonly releaseId:string;readonly pool:string;
 readonly operation:'submit'|'revoke';readonly releaseKey:string|null;readonly releaseLabel:string|null;
 readonly releaseStatus:'known'|'unknown';
}
export interface PrivatePendingRecoveryOptions {
 readonly source:string;
 /** Internal storage boundary. Omit to use the unchanged shared browser DB. */
 readonly journal?:SubmissionJournal;
}
function ensure(ok:unknown,code:string):asserts ok {if(!ok)throw Error(code)}
function account(value:unknown):asserts value is string {
 ensure(typeof value==='string'&&StrKey.isValidEd25519PublicKey(value),'PRIVATE_PENDING_SOURCE_INVALID');
}
async function withJournal<T>(options:PrivatePendingRecoveryOptions,work:(journal:SubmissionJournal,source:string)=>Promise<T>):Promise<T>{
 const {source,journal:provided}=options;account(source);
 if(provided)return work(provided,source);
 const journal=await createIndexedDbSubmissionJournal();
 try{return await work(journal,source)}finally{journal.close()}
}
async function catalogue():Promise<readonly PrivateReleaseSelection[]>{
 const selections=await Promise.all(listPrivateReleaseOptions().map(option=>resolvePrivateRelease(option.key)));
 selections.forEach(assertPrivateReleaseSelection);return selections;
}
function original(attempt:JournalAttempt,selections:readonly PrivateReleaseSelection[]){
 return selections.find(s=>s.release.scope.profileId===attempt.releaseId&&s.release.pool===attempt.pool);
}
function transactionLookup(server:rpc.Server,hash:string):Promise<rpc.Api.GetTransactionResponse>{
 // The SDK transport aborts its fetch, while this outer bound also releases the
 // UI if a stalled adapter never settles. Uncertainty keeps the durable lock.
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('PRIVATE_RECOVERY_TIMEOUT')),15000);
  Promise.resolve().then(()=>server.getTransaction(hash)).then(value=>{clearTimeout(timer);resolve(value)},error=>{clearTimeout(timer);reject(error)});
 });
}
export async function listPrivatePendingForAccount(options:PrivatePendingRecoveryOptions):Promise<readonly PrivateAccountPendingAttempt[]>{
 return withJournal(options,async(journal,source)=>{
  // Audit/snapshot every row before account filtering. A corrupt foreign row is
  // not evidence that the shared source reservation store is safe to ignore.
  const attempts=(await journal.pending()).map(a=>snapshotAttempt(a)),selections=await catalogue();
  return Object.freeze(attempts.filter(a=>a.source===source).map(a=>{
   const selection=original(a,selections);
   return Object.freeze({hash:a.hash,source:a.source,releaseId:a.releaseId,pool:a.pool,operation:a.version===1?'submit' as const:'revoke' as const,
    releaseKey:selection?.key??null,releaseLabel:selection?.label??null,releaseStatus:selection?'known' as const:'unknown' as const});
  }));
 });
}
export async function reconcilePrivatePending(hash:string,options:PrivatePendingRecoveryOptions):Promise<SubmissionOutcome|RevocationOutcome>{
 ensure(typeof hash==='string'&&/^[0-9a-f]{64}$/.test(hash)&&hash!=='0'.repeat(64),'PRIVATE_PENDING_HASH_INVALID');
 return withJournal(options,async(journal,source)=>{
  const entry=await journal.get(hash);ensure(entry,'PRIVATE_PENDING_ATTEMPT_REQUIRED');
  const attempt=snapshotAttempt(entry.attempt);ensure(attempt.hash===hash,'PRIVATE_PENDING_ATTEMPT_REQUIRED');
  ensure(attempt.source===source,'PRIVATE_PENDING_SOURCE_MISMATCH');
  const selection=original(attempt,await catalogue());ensure(selection,'PRIVATE_PENDING_RELEASE_UNKNOWN');
  const release=selection.release,reader=createPoolReader(release),server=new rpc.Server(release.rpcUrl);
  Object.assign(server.httpClient.defaults,{timeout:15000,maxContentLength:4*1024*1024,maxRedirects:0,fetchOptions:{credentials:'omit',cache:'no-store'}});
  // Reuse the existing exact-envelope, signature, pinned state and accepted
  // archive checks. Even an accidental write path has no signing/proving/send
  // capability here. The constructor fee bound is required but never spent.
  const forbidden=async():Promise<never>=>{throw Error('PRIVATE_RECOVERY_READ_ONLY')};
  const common:SubmissionOptions={release,reader,journal,maxFeeStroops:'1',verifyLocal:forbidden,
   wallet:{session:()=>({id:'public-pending-recovery',account:attempt.source,networkPassphrase:Networks.TESTNET}),signTransaction:forbidden},
   transport:{getAccount:forbidden,getLatestLedger:forbidden,simulateTransaction:forbidden,sendTransaction:forbidden,getTransaction:hash=>transactionLookup(server,hash)},
  };
  return attempt.version===1?createTestnetSubmissionLifecycle(common).reconcile(hash):createTestnetRevocationLifecycle({...common,reader}).reconcile(hash);
 });
}
