/** Real lifecycle/reader validation over local SDK XDR fixtures. The compiled
 * catalogue is replaced only in this unit test; no chain or proof is submitted. */
import {readFileSync} from 'node:fs';
import {Account,Contract,Keypair,Networks,StrKey,TransactionBuilder,hash,rpc,xdr} from '@stellar/stellar-sdk';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {setup,b,sc,dataKey} from '../../contracts/private-pool/client/reader-fixture';
import {verifyPoolRelease} from '../../contracts/private-pool/client/release';
import {snapshotAttempt,revocationIntentId,type JournalAttempt,type JournalEntry,type SubmissionJournal,type TerminalEvidence} from '../../contracts/private-pool/client/journal';
import type {PrivateReleaseSelection} from '../app/lib/private/release';
import {listPrivatePendingForAccount,reconcilePrivatePending} from '../app/lib/private/pending-recovery';

const catalogue=vi.hoisted(()=>({options:[] as {key:string}[],values:new Map<string,unknown>(),resolve:vi.fn()}));
vi.mock('../app/lib/private/release',()=>({
 DEFAULT_PRIVATE_RELEASE_KEY:'new-default',
 listPrivateReleaseOptions:()=>catalogue.options,
 resolvePrivateRelease:(key:string)=>catalogue.resolve(key),
 assertPrivateReleaseSelection:(value:unknown)=>{if(![...catalogue.values.values()].includes(value))throw Error('UNVERIFIED_SELECTION');},
}));
const journalFactory=vi.hoisted(()=>vi.fn());
vi.mock('../../contracts/private-pool/client/journal',async original=>({...await original<object>(),createIndexedDbSubmissionJournal:()=>journalFactory()}));
const sourceKey=Keypair.fromRawEd25519Seed(Buffer.alloc(32,109)),source=sourceKey.publicKey();
const other=Keypair.fromRawEd25519Seed(Buffer.alloc(32,110)).publicKey();
const revoke=JSON.parse(readFileSync(new URL('../../contracts/private-pool/fixtures/verified-v2/proofs/13-revoke-envoy.json',import.meta.url),'utf8'));
class MemoryJournal implements SubmissionJournal {
 rows=new Map<string,JournalEntry>();close=vi.fn();terminal=vi.fn(async(value:TerminalEvidence)=>{
  const entry=this.rows.get(value.hash);if(!entry||entry.terminal)throw Error('IMMUTABLE_TERMINAL');this.rows.set(value.hash,{...entry,terminal:value});
 });
 async exclusive<T>(fn:()=>Promise<T>){return fn()}
 async pending(){return [...this.rows.values()].filter(r=>!r.terminal).map(r=>r.attempt)}
 async get(hash:string){return this.rows.get(hash)??null}
 async find(){return null}async conflicts(){return []}
 async commit(){throw Error('RECOVERY_MUST_NOT_COMMIT')}
 add(value:JournalAttempt){const attempt=snapshotAttempt(value);this.rows.set(attempt.hash,{attempt,terminal:null});return attempt}
}
let f:ReturnType<typeof setup>,selection:PrivateReleaseSelection,journal:MemoryJournal;
let query:ReturnType<typeof vi.spyOn>,forbidden:()=>never;
beforeEach(async()=>{
 f=setup();const release=await verifyPoolRelease(f.manifest,f.dkg);
 selection=Object.freeze({key:'original',label:'Original recovery',policy:'recovery',assets:Object.freeze([...f.manifest.config.assets]),release,accounting:false});
 const next={...selection,key:'new-default',label:'New funding',policy:'funding',release:{...release,pool:StrKey.encodeContract(Buffer.alloc(32,121)),scope:{...release.scope,profileId:'ab'.repeat(32)}}};
 catalogue.options=[{key:'new-default'},{key:'original'}];catalogue.values=new Map([['new-default',next],['original',selection]]);
 catalogue.resolve.mockImplementation(async key=>{const value=catalogue.values.get(key);if(!value)throw Error('UNKNOWN_RELEASE');return value});
 journal=new MemoryJournal();journalFactory.mockResolvedValue(journal);vi.stubGlobal('fetch',f.fetcher);
 query=vi.spyOn(rpc.Server.prototype,'getTransaction').mockImplementation(async txHash=>({status:rpc.Api.GetTransactionStatus.NOT_FOUND,txHash,latestLedger:1010,latestLedgerCloseTime:1,oldestLedger:1,oldestLedgerCloseTime:1}));
 forbidden=vi.fn(()=>{throw Error('FORBIDDEN_RECOVERY_WRITE')});
 for(const method of ['getAccount','getLatestLedger','simulateTransaction','sendTransaction'] as const)vi.spyOn(rpc.Server.prototype,method).mockImplementation(async()=>forbidden());
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.clearAllMocks();vi.useRealTimers()});
function entry(operation:'submit'|'revoke'='submit'){
 const base={hash:'10'.repeat(32),sequence:'101',callHash:'20'.repeat(32),retryOf:null,releaseId:selection.release.scope.profileId,pool:selection.release.pool,source};
 return journal.add(operation==='submit'?{...base,version:1,recordId:f.id,publicSignals:f.fields.map(String)}:
  {...base,version:2,operation:'revoke',recordId:revocationIntentId(revoke.publicSignals,revoke.ownerKey),publicSignals:revoke.publicSignals,ownerKey:revoke.ownerKey,revocationIndex:'0'});
}
it.each(['submit','revoke'] as const)('lists original %s across a different default without vault or network',async operation=>{
 const old=entry(operation);journal.add({...old,source:other,hash:'12'.repeat(32)});
 const rows=await listPrivatePendingForAccount({source,journal});
 expect(rows).toEqual([{hash:old.hash,source,releaseId:old.releaseId,pool:old.pool,operation,releaseKey:'original',releaseLabel:'Original recovery',releaseStatus:'known'}]);
 expect(Object.isFrozen(rows)&&Object.isFrozen(rows[0])).toBe(true);
 expect(query).not.toHaveBeenCalled();expect(f.calls).toEqual([]);expect(forbidden).not.toHaveBeenCalled();expect(journal.close).not.toHaveBeenCalled();
});
it.each(['unknown-profile','wrong-pool'] as const)('retains %s as blocked public metadata without an arbitrary release lookup',async kind=>{
 const old=entry();journal.rows.clear();const unknown=journal.add({...old,...(kind==='unknown-profile'?{releaseId:'ee'.repeat(32)}:{pool:StrKey.encodeContract(Buffer.alloc(32,119))})});
 expect((await listPrivatePendingForAccount({source,journal}))[0]).toMatchObject({hash:unknown.hash,pool:unknown.pool,releaseId:unknown.releaseId,releaseStatus:'unknown',releaseKey:null});
 await expect(reconcilePrivatePending(unknown.hash,{source,journal})).rejects.toThrow('PRIVATE_PENDING_RELEASE_UNKNOWN');
 expect(catalogue.resolve.mock.calls.every(([key])=>key==='original'||key==='new-default')).toBe(true);
 expect(query).not.toHaveBeenCalled();expect(f.calls).toEqual([]);expect(journal.terminal).not.toHaveBeenCalled();
});
it('rejects corrupt rows before filtering by account and never downgrades a storage audit failure to an empty list',async()=>{
 const old=entry();journal.rows.set(old.hash,{attempt:{...old,source:other,recordId:'00'.repeat(32)},terminal:null});
 await expect(listPrivatePendingForAccount({source,journal})).rejects.toThrow();
 journal.pending=async()=>{throw Error('CORRUPT_JOURNAL')};await expect(listPrivatePendingForAccount({source,journal})).rejects.toThrow('CORRUPT_JOURNAL');
 expect(journal.terminal).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled();
});
it('validates source/hash before opening storage and rejects a valid but different source before reading chain data',async()=>{
 await expect(listPrivatePendingForAccount({source:'invalid'})).rejects.toThrow('PRIVATE_PENDING_SOURCE_INVALID');
 await expect(reconcilePrivatePending('not-a-hash',{source})).rejects.toThrow('PRIVATE_PENDING_HASH_INVALID');expect(journalFactory).not.toHaveBeenCalled();
 const old=entry();await expect(reconcilePrivatePending(old.hash,{source:other,journal})).rejects.toThrow('PRIVATE_PENDING_SOURCE_MISMATCH');
 expect(query).not.toHaveBeenCalled();expect(f.calls).toEqual([]);expect(journal.terminal).not.toHaveBeenCalled();
});
it('snapshots the requested account before awaiting storage or catalogue resolution',async()=>{
 entry();const options={source,journal},pending=listPrivatePendingForAccount(options);options.source=other;
 expect(await pending).toHaveLength(1);
});
it('fails closed if a known compiled release cannot be authenticated',async()=>{
 entry();catalogue.resolve.mockRejectedValue(new Error('INVALID_COMPILED_RELEASE'));
 await expect(listPrivatePendingForAccount({source,journal})).rejects.toThrow('INVALID_COMPILED_RELEASE');
 expect(journal.terminal).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled();
});
it.each(['submit','revoke'] as const)('reconciles %s against original hash/pool only; unavailable evidence stays pending without signing or resending',async operation=>{
 const old=entry(operation);const result=await reconcilePrivatePending(old.hash,{source,journal});
 expect(result).toMatchObject({hash:old.hash,source,releaseId:old.releaseId,status:'pending',ledger:null});expect(query).toHaveBeenCalledExactlyOnceWith(old.hash);
 expect(f.calls).toContain('getLedgerEntries');expect(forbidden).not.toHaveBeenCalled();expect(journal.terminal).not.toHaveBeenCalled();
 query.mockRejectedValue(new Error('RPC_UNAVAILABLE'));expect((await reconcilePrivatePending(old.hash,{source,journal})).status).toBe('pending');
 expect(journal.terminal).not.toHaveBeenCalled();expect(await journal.pending()).toHaveLength(1);
});
it('pin or archive failure retains the reservation and does not query an unvalidated chain',async()=>{
 const old=entry();f.entries.delete(f.instanceKey.toXDR('base64'));
 expect((await reconcilePrivatePending(old.hash,{source,journal})).status).toBe('pending');expect(query).not.toHaveBeenCalled();expect(journal.terminal).not.toHaveBeenCalled();
});
it('closes only its own default database connection after successful or failed reads',async()=>{
 entry();expect(await listPrivatePendingForAccount({source})).toHaveLength(1);expect(journal.close).toHaveBeenCalledTimes(1);
 journal.pending=async()=>{throw Error('STORAGE_CORRUPT')};await expect(listPrivatePendingForAccount({source})).rejects.toThrow('STORAGE_CORRUPT');expect(journal.close).toHaveBeenCalledTimes(2);
});
function included(old:JournalAttempt,status:'SUCCESS'|'FAILED'){
 const tx=new TransactionBuilder(new Account(source,'100'),{networkPassphrase:Networks.TESTNET,fee:'400'}).addOperation(new Contract(old.pool).call(old.version===1?'submit':'revoke')).setTimeout(60).build();
 // Only synthetic signing material creates an already-included response fixture.
 tx.sign(sourceKey);const op=tx.operations[0];if(op.type!=='invokeHostFunction')throw Error('TEST_CALL');
 const attempt=snapshotAttempt({...old,hash:tx.hash().toString('hex'),callHash:hash(op.func.toXDR()).toString('hex')});journal.rows.clear();journal.add(attempt);
 const rv=old.version===1?xdr.ScVal.scvBytes(Buffer.from(old.recordId,'hex')):xdr.ScVal.scvVoid();
 const success=xdr.OperationResult.opInner(xdr.OperationResultTr.invokeHostFunction(xdr.InvokeHostFunctionResult.invokeHostFunctionSuccess(hash(new xdr.InvokeHostFunctionSuccessPreImage({returnValue:rv,events:[]}).toXDR()))));
 const failure=xdr.OperationResult.opInner(xdr.OperationResultTr.invokeHostFunction(xdr.InvokeHostFunctionResult.invokeHostFunctionTrapped()));
 const resultXdr=new xdr.TransactionResult({feeCharged:xdr.Int64.fromString('400'),ext:new xdr.TransactionResultExt(0),result:status==='SUCCESS'?xdr.TransactionResultResult.txSuccess([success]):xdr.TransactionResultResult.txFailed([failure])});
 const resultMetaXdr=status==='SUCCESS'?new xdr.TransactionMeta(3,new xdr.TransactionMetaV3({ext:new xdr.ExtensionPoint(0),txChangesBefore:[],txChangesAfter:[],operations:[new xdr.OperationMeta({changes:[]})],sorobanMeta:new xdr.SorobanTransactionMeta({ext:new xdr.SorobanTransactionMetaExt(0),events:[],returnValue:rv,diagnosticEvents:[]})})):new xdr.TransactionMeta(0,[]);
 if(old.version===2){f.state.revocation_count=1n;f.state.revocation_root=b(BigInt(old.publicSignals[2]));f.instance();f.persistent(dataKey('RevocationIndex',xdr.ScVal.scvU64(xdr.Uint64.fromString('0'))),sc('StoredRevocation',{ledger:1005,tag:b(BigInt(old.publicSignals[3])),old_root:b(BigInt(old.publicSignals[1])),new_root:b(BigInt(old.publicSignals[2]))}));}
 const response={status,txHash:attempt.hash,latestLedger:1010,latestLedgerCloseTime:1,oldestLedger:1,oldestLedgerCloseTime:1,ledger:1005,createdAt:1,applicationOrder:0,feeBump:false,envelopeXdr:tx.toEnvelope(),resultXdr,resultMetaXdr};
 query.mockResolvedValue(response);return {attempt,response};
}
it.each([['submit','SUCCESS'],['revoke','SUCCESS'],['submit','FAILED'],['revoke','FAILED']] as const)('only validated original %s %s evidence can close the journal entry',async(operation,status)=>{
 const {attempt}=included(entry(operation),status);const result=await reconcilePrivatePending(attempt.hash,{source,journal});
 expect(result.status).toBe(status==='SUCCESS'?'confirmed':'failed');expect(journal.terminal).toHaveBeenCalledExactlyOnceWith({hash:attempt.hash,status:result.status,ledger:1005});
 expect(await journal.pending()).toEqual([]);expect(forbidden).not.toHaveBeenCalled();
});
it('an RPC success label with another hash cannot release the pending source lock',async()=>{
 const {attempt,response}=included(entry(),'SUCCESS');query.mockResolvedValue({...response,txHash:'fe'.repeat(32)});
 expect((await reconcilePrivatePending(attempt.hash,{source,journal})).status).toBe('pending');expect(journal.terminal).not.toHaveBeenCalled();
});
it('a stalled transaction lookup times out without releasing the original reservation',async()=>{
 const old=entry();query.mockImplementation(()=>new Promise(()=>{}));vi.useFakeTimers();
 let finished=false;const pending=reconcilePrivatePending(old.hash,{source,journal}).then(value=>{finished=true;return value;});
 await vi.waitFor(()=>expect(query).toHaveBeenCalledOnce());await vi.advanceTimersByTimeAsync(15001);
 expect(finished).toBe(true);expect((await pending).status).toBe('pending');expect(journal.terminal).not.toHaveBeenCalled();expect(await journal.pending()).toHaveLength(1);
});
