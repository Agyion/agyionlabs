/** UNIT CONTROL-FLOW FIXTURE ONLY. The reader authenticates real SDK-encoded
 * fixture entries, vault/backup crypto and transaction signatures are real.
 * The prover below is explicitly accepting test code: these tests establish
 * coordinator gates, NOT Groth16 validity, deployed acceptance or durability.
 * Those boundaries have separate real prover/live testnet/IndexedDB evidence. */
import {File as NodeFile} from 'node:buffer';
import {createHash} from 'node:crypto';
import {Account,Address,Keypair,Networks,SorobanDataBuilder,StrKey,Transaction,TransactionBuilder,nativeToScVal,rpc,xdr} from '@stellar/stellar-sdk';
import {setup,b,sc,dataKey} from '../../contracts/private-pool/client/reader-fixture';
import type {PrivateReleasePolicy} from '../app/lib/private/release';
import {verifyPoolRelease} from '../../contracts/private-pool/client/release';
import {createPoolReader} from '../../contracts/private-pool/client/reader';
import {snapshotAttempt,intentOf,reservationKeys,type JournalIntent,type JournalAttempt,type SubmissionJournal,type TerminalEvidence,type JournalEntry} from '../../contracts/private-pool/client/journal';
import {createPrivateProtocol,type PrivateProtocolAdapters} from '../app/lib/private/protocol';
import type {FeeConfirmation} from '../app/lib/private/protocol-types';
import {createPrivateVaultController} from '../app/lib/privateVault';
import {createPrivacyVault,backupPrivacyVault,forgetPrivacyVault,type CompletePrivacyKeyBackup} from '../../privacy/src/vault.mjs';
import {SparseMerkleTree} from '../../privacy/src/model.mjs';
import {planPrivateCommand} from '../../privacy/src/planner.mjs';
import {buildWitness} from '../../privacy/src/witness.mjs';

export const password='local coordinator fixture password';
export const grants=[{id:'41'.repeat(32),kind:'pod' as const},{id:'42'.repeat(32),kind:'trigger' as const},{id:'43'.repeat(32),kind:'envoy' as const}];
export const selected=(data:unknown)=>new NodeFile([JSON.stringify(data)],'selected.json') as unknown as File;
const same=(a:JournalIntent,b:JournalIntent)=>JSON.stringify(intentOf(a))===JSON.stringify(intentOf(b));
class MemoryJournal implements SubmissionJournal {
 rows=new Map<string,JournalEntry>();closed=false;fail=false;commitHook=()=>{};tail=Promise.resolve();
 async exclusive<T>(fn:()=>Promise<T>){const previous=this.tail;let release!:()=>void;this.tail=new Promise(r=>{release=r});await previous;try{return await fn()}finally{release()}}
 async conflicts(i:JournalIntent){const keys=new Set(reservationKeys(intentOf(i)));return [...this.rows.values()].filter(e=>!e.terminal&&reservationKeys(intentOf(e.attempt)).some(k=>keys.has(k))).map(e=>e.attempt)}
 async find(i:JournalIntent){return [...this.rows.values()].filter(e=>same(e.attempt,i)).at(-1)??null}
 async pending(){if(this.fail)throw Error('TEST_JOURNAL_UNAVAILABLE');return [...this.rows.values()].filter(e=>!e.terminal).map(e=>e.attempt)}
 async commit(value:JournalAttempt){if(this.fail)throw Error('TEST_JOURNAL_UNAVAILABLE');const a=snapshotAttempt(value);if(this.rows.has(a.hash)||(await this.conflicts(a)).length)throw Error('TEST_CONFLICT');this.rows.set(a.hash,{attempt:a,terminal:null});this.commitHook()}
 async get(hash:string){return this.rows.get(hash)??null}
 async terminal(evidence:TerminalEvidence){const old=this.rows.get(evidence.hash);if(!old||old.terminal)throw Error('TEST_TERMINAL');this.rows.set(evidence.hash,{...old,terminal:evidence})}
 close(){this.closed=true}
}
let backup:CompletePrivacyKeyBackup;
export async function initializeProtocolFixture(){const f=setup(),release=await verifyPoolRelease(f.manifest,f.dkg),vault=createPrivacyVault(release.scope,grants);try{backup=await backupPrivacyVault(vault,password)}finally{forgetPrivacyVault(vault)}}
export async function protocolFixture(overrideBackup?:CompletePrivacyKeyBackup,policy:PrivateReleasePolicy='funding'){
 const f=setup(),release=await verifyPoolRelease(f.manifest,f.dkg),tree=new SparseMerkleTree(32);
 f.state.root=b(tree.root);f.state.next_index=0n;f.state.record_count=0n;f.state.roots=[b(tree.root)];f.instance();
 const vault=createPrivateVaultController(release.scope);await vault.restore(selected(overrideBackup??backup),password);
 const journal=new MemoryJournal(),key=Keypair.fromRawEd25519Seed(Buffer.alloc(32,71)),asset=StrKey.decodeContract(f.manifest.config.assets[0]).toString('hex');
 const reader=createPoolReader(release,{fetch:async(...args)=>{if(hooks.readFailure)throw Error('TEST_READER_UNAVAILABLE');return f.fetcher(...args)}});
 const calls={proves:0,verifies:0,signs:0,sends:0,disposed:0,fees:[] as FeeConfirmation[]};
 const hooks={policy,readFailure:false,resourceFee:'300',acceptFee:true,session:'fixture-session',onFee:async()=>{},onSign:async()=>{},onProve:async()=>{},onGet:async()=>{},walletListener:(()=>{}) as ()=>void};
 let recordId='00'.repeat(32),lastFields:readonly string[]=[];
 const adapters:PrivateProtocolAdapters={get policy(){return hooks.policy},release:async()=>release,assets:f.manifest.config.assets,reader:()=>reader,journal:async()=>journal,
  transport:()=>({getAccount:async a=>new Account(a,'100'),getLatestLedger:async()=>({sequence:1005}),
   simulateTransaction:async tx=>{
    const auth:xdr.SorobanAuthorizationEntry[]=[];
    if(lastFields[16]==='1'){
     const op=tx.operations[0];if(op.type!=='invokeHostFunction')throw Error('TEST_EXACT_CALL_REQUIRED');
     const child=new xdr.InvokeContractArgs({contractAddress:new Address(f.manifest.config.assets[0]).toScAddress(),functionName:'transfer',args:[new Address(key.publicKey()).toScVal(),new Address(release.pool).toScVal(),nativeToScVal(BigInt(lastFields[18]),{type:'i128'})]});
     auth.push(new xdr.SorobanAuthorizationEntry({credentials:xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),rootInvocation:new xdr.SorobanAuthorizedInvocation({function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(xdr.InvokeContractArgs.fromXDR(op.func.invokeContract().toXDR())),subInvocations:[new xdr.SorobanAuthorizedInvocation({function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(child),subInvocations:[]})]})}));
    }
    return{id:'unit-only',_parsed:true,latestLedger:1005,events:[],transactionData:new SorobanDataBuilder().setResources(100,100,100).setResourceFee(hooks.resourceFee),minResourceFee:hooks.resourceFee,result:{auth,retval:xdr.ScVal.scvBytes(Buffer.from(recordId,'hex'))}};
   },
   sendTransaction:async tx=>{calls.sends++;if(!journal.rows.has(tx.hash().toString('hex')))throw Error('DURABLE_WRITE_REQUIRED');return {hash:tx.hash().toString('hex'),status:'PENDING'}},
   getTransaction:async h=>{await hooks.onGet();return{status:rpc.Api.GetTransactionStatus.NOT_FOUND,txHash:h,latestLedger:1005,latestLedgerCloseTime:1,oldestLedger:1,oldestLedgerCloseTime:1}}}),
  wallet:async guard=>{guard();const session=hooks.session;return {account:key.publicKey(),wallet:{session:()=>{guard();if(hooks.session!==session)throw Error('WALLET_SESSION_CHANGED');return{id:session,account:key.publicKey(),networkPassphrase:Networks.TESTNET}},signTransaction:async raw=>{guard();calls.signs++;await hooks.onSign();guard();const tx=TransactionBuilder.fromXDR(raw,Networks.TESTNET) as Transaction;tx.sign(key);return tx.toXDR()}}}},
  onWalletChange:listener=>{hooks.walletListener=listener;return()=>{hooks.walletListener=()=>{}}},
  prover:async()=>({async prove(value){calls.proves++;await hooks.onProve();const w=value as {core:bigint[];encrypted:bigint[]};lastFields=[...w.core,...w.encrypted].map(String);recordId=createHash('sha256').update(Buffer.concat(w.encrypted.map(b))).digest('hex');return{proof:'01'.repeat(256),publicSignals:lastFields}},async verify(){calls.verifies++;return true},dispose(){calls.disposed++}}),
 };
 const protocol=await createPrivateProtocol({vault,maxFeeStroops:'1000',confirmFee:async value=>{calls.fees.push(value);await hooks.onFee();return hooks.acceptFee}},adapters);
 async function fundFixture(amount='100'){
  const output=await vault.withCheckedVault(async handle=>{
   const plan=planPrivateCommand({command:{action:'deposit',asset,amount},profile:release.profile,scope:release.scope,assets:[asset],ledger:1005n,source:{kind:'account',id:key.rawPublicKey().toString('hex')},vault:handle,credentials:[],usedGrantIds:[],notes:[],archive:{kind:'RebuiltArchiveSnapshot',noteTree:tree,revocationTree:new SparseMerkleTree(128),nextIndex:0n,recordCount:0n,revocationCount:0n,isSpent:()=>false}});
   if(plan.kind!=='transition')throw Error('TEST_TRANSITION_REQUIRED');return buildWitness(plan.configuration);
  });
  f.persistent(dataKey('RecordIndex',xdr.ScVal.scvU64(xdr.Uint64.fromString('0'))),xdr.ScVal.scvBytes(Buffer.from(output.ciphertextDigest,'hex')));
  f.persistent(dataKey('Record',xdr.ScVal.scvBytes(Buffer.from(output.ciphertextDigest,'hex'))),sc('StoredRecord',{ledger:1005,public_inputs:output.publicInputs.map(b)}));
  f.state.root=b(output.nextTree.root);f.state.next_index=1n;f.state.record_count=1n;f.state.roots.push(b(output.nextTree.root));f.instance();
 }
 function acceptLastPrepared(){
  const fields=lastFields.map(BigInt),id=recordId,index=f.state.record_count;
  f.persistent(dataKey('RecordIndex',xdr.ScVal.scvU64(xdr.Uint64.fromString(index.toString()))),xdr.ScVal.scvBytes(Buffer.from(id,'hex')));
  f.persistent(dataKey('Record',xdr.ScVal.scvBytes(Buffer.from(id,'hex'))),sc('StoredRecord',{ledger:1005,public_inputs:fields.map(b)}));
  f.state.root=b(fields[10]);f.state.next_index=fields[11]+BigInt(fields.slice(14,16).filter(x=>x!==0n).length);f.state.record_count++;f.state.roots.push(b(fields[10]));f.instance();
 }
 return {protocol,vault,adapters,journal,release,asset,f,calls,hooks,fundFixture,acceptLastPrepared,get fields(){return lastFields},close(){protocol.dispose();vault.lock()}};
}
