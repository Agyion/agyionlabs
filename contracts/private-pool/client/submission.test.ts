/** Actual public Groth16 fixture + actual SDK XDR/signatures. The RPC/ledger and
 * memory journal here are explicit UNIT transport boundaries, not a live pool.
 * The concrete browser journal has separate real IndexedDB/Web Locks tests. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {Account,Keypair,Networks,Transaction,TransactionBuilder,SorobanDataBuilder,hash,rpc,xdr} from '@stellar/stellar-sdk';
import {setup,b,sc,dataKey} from './reader-fixture.ts';
import {verifyPoolRelease} from './release.ts';
import {createPoolReader} from './reader.ts';
import {createTestnetSubmissionLifecycle,type PublicSubmission,type SubmissionTransport,type PrivateWallet} from './submission.ts';
import {snapshotAttempt,reservationKeys,type PendingIntent,type PublicAttempt,type SubmissionJournal,type TerminalEvidence,type JournalEntry} from './journal.ts';
import {encodeGroth16Proof} from '../../../privacy/src/prover.mjs';

const require=createRequire(new URL('../../../privacy/package.json',import.meta.url));
const {groth16}=require('snarkjs'),{buildBn128}=require('ffjavascript');
const fixture=JSON.parse(readFileSync(new URL('../fixtures/verified-v2/proofs/02-create-pod.json',import.meta.url),'utf8'));
const vk=JSON.parse(readFileSync(new URL('../fixtures/verified-v2/keys/transition-vk.json',import.meta.url),'utf8'));
const encoded=encodeGroth16Proof(fixture.proof),publicFields=fixture.publicSignals.map(BigInt);
// Initialize the real snarkjs verification engine in single-thread mode in
// this isolated test process. This requires only the committed public VK/proof,
// not the private witness, WASM or large ceremony zkey; no accepting mock.
before(async()=>{(globalThis as any).curve_bn128=await buildBn128(true);});
after(async()=>{await (globalThis as any).curve_bn128?.terminate();(globalThis as any).curve_bn128=null;});
function decode(hex:string){const a=Array.from({length:8},(_,i)=>BigInt('0x'+hex.slice(i*64,(i+1)*64)).toString());return {pi_a:[a[0],a[1],'1'],pi_b:[[a[3],a[2]],[a[5],a[4]],['1','0']],pi_c:[a[6],a[7],'1'],protocol:'groth16',curve:'bn128'};}
const intentOf=(a:PendingIntent)=>({releaseId:a.releaseId,pool:a.pool,source:a.source,recordId:a.recordId,publicSignals:a.publicSignals});
const sameIntent=(a:PendingIntent,b:PendingIntent)=>JSON.stringify(intentOf(a))===JSON.stringify(intentOf(b));
class MemoryJournal implements SubmissionJournal {
 rows=new Map<string,JournalEntry>();order:string[]=[];commitHook:(a:PublicAttempt)=>void=()=>{};failCommit=false;failTerminal=false;private tail=Promise.resolve();
 async exclusive<T>(fn:()=>Promise<T>):Promise<T>{const previous=this.tail;let release!:()=>void;this.tail=new Promise(resolve=>{release=resolve});await previous;try{return await fn()}finally{release()}}
 async find(intent:PendingIntent){const matches=[...this.rows.values()].filter(e=>sameIntent(e.attempt,intent));return matches.at(-1)??null;}
 async pending(){return [...this.rows.values()].filter(e=>!e.terminal).map(e=>e.attempt);}
 async conflicts(intent:PendingIntent){const keys=new Set(reservationKeys(intent));return [...this.rows.values()].filter(e=>!e.terminal&&reservationKeys(intentOf(e.attempt)).some(k=>keys.has(k))).map(e=>e.attempt);}
 async commit(value:PublicAttempt){if(this.failCommit)throw Error('STORAGE_UNAVAILABLE');const a=snapshotAttempt(value);assert.equal(this.rows.has(a.hash),false);assert.equal((await this.conflicts(intentOf(a))).length,0);this.rows.set(a.hash,{attempt:a,terminal:null});this.order.push('commit');this.commitHook(a);}
 async get(h:string){return this.rows.get(h)??null}
 async terminal(t:TerminalEvidence){if(this.failTerminal)throw Error('STORAGE_UNAVAILABLE');const e=this.rows.get(t.hash);assert.ok(e);assert.equal(e.terminal,null);this.rows.set(t.hash,{...e,terminal:Object.freeze({...t})});this.order.push(t.status);}
}
function simulation(recordId=fixture.ciphertextDigest):rpc.Api.SimulateTransactionSuccessResponse{return {
 id:'local-unit',_parsed:true,latestLedger:1005,events:[],transactionData:new SorobanDataBuilder().setResources(100,100,100).setResourceFee('300'),minResourceFee:'300',
 result:{auth:[],retval:xdr.ScVal.scvBytes(Buffer.from(recordId,'hex'))},
};}
const trapped=()=>xdr.OperationResult.opInner(xdr.OperationResultTr.invokeHostFunction(xdr.InvokeHostFunctionResult.invokeHostFunctionTrapped()));
function wire(tx:Transaction,recordId=fixture.ciphertextDigest,status:'SUCCESS'|'FAILED'='SUCCESS'):rpc.Api.RawGetTransactionResponse {
 const rv=xdr.ScVal.scvBytes(Buffer.from(recordId,'hex')),preimage=new xdr.InvokeHostFunctionSuccessPreImage({returnValue:rv,events:[]});
 const result=new xdr.TransactionResult({feeCharged:xdr.Int64.fromString('400'),ext:new xdr.TransactionResultExt(0),result:status==='SUCCESS'
  ?xdr.TransactionResultResult.txSuccess([xdr.OperationResult.opInner(xdr.OperationResultTr.invokeHostFunction(xdr.InvokeHostFunctionResult.invokeHostFunctionSuccess(hash(preimage.toXDR()))))])
  :xdr.TransactionResultResult.txFailed([trapped()])});
 const meta=status==='SUCCESS'?new xdr.TransactionMeta(3,new xdr.TransactionMetaV3({ext:new xdr.ExtensionPoint(0),txChangesBefore:[],txChangesAfter:[],operations:[new xdr.OperationMeta({changes:[]})],sorobanMeta:new xdr.SorobanTransactionMeta({ext:new xdr.SorobanTransactionMetaExt(0),events:[],returnValue:rv,diagnosticEvents:[]})})):new xdr.TransactionMeta(0,[]);
 return {status:status as rpc.Api.GetTransactionStatus,txHash:tx.hash().toString('hex'),latestLedger:1010,latestLedgerCloseTime:1,oldestLedger:1,oldestLedgerCloseTime:1,ledger:1005,createdAt:1,applicationOrder:0,feeBump:false,envelopeXdr:tx.toXDR(),resultXdr:result.toXDR('base64'),resultMetaXdr:meta.toXDR('base64')};
}
const emptyAddresses={asset:null,bridgeAccount:null,feeAccount:null};
async function harness(){
 const f=setup(),release=await verifyPoolRelease(f.manifest,f.dkg),reader=createPoolReader(release,{fetch:f.fetcher});
 assert.deepEqual([release.profile.domain,release.profile.assetPolicyRoot,release.profile.epoch,...release.profile.auditor],publicFields.slice(0,5));
 assert.equal(f.state.root.toString('hex'),b(publicFields[9]).toString('hex'));assert.equal(f.state.next_index,publicFields[11]);
 const key=Keypair.fromRawEd25519Seed(Buffer.alloc(32,93)),journal=new MemoryJournal();
 let sessionId='session-1',signs=0,sends=0,verifications=0,lastTx:Transaction|null=null;
 const queries:string[]=[],server=new rpc.Server(release.rpcUrl);
 const hooks:{sign?:(tx:Transaction)=>void;send?:(tx:Transaction)=>void;account?:()=>void;simulation?:(tx:Transaction)=>rpc.Api.SimulateTransactionResponse;get?:(hash:string)=>rpc.Api.RawGetTransactionResponse}={};
 let mode:'success'|'missing'|'throw'|'failed'='success';
 function accept(){f.persistent(dataKey('Record',xdr.ScVal.scvBytes(Buffer.from(fixture.ciphertextDigest,'hex'))),sc('StoredRecord',{ledger:1005,public_inputs:publicFields.map(b)}));f.state.root=b(publicFields[10]);f.state.roots.push(b(publicFields[10]));f.state.next_index=3n;f.state.record_count=2n;f.instance();}
 const wallet:PrivateWallet={session:()=>({id:sessionId,account:key.publicKey(),networkPassphrase:Networks.TESTNET}),signTransaction:async s=>{signs++;const tx=TransactionBuilder.fromXDR(s,Networks.TESTNET) as Transaction;hooks.sign?.(tx);tx.sign(key);return tx.toXDR();}};
 // Use installed SDK's actual getTransaction transformation, including its
 // request-hash echo. No HTTP is performed by this explicitly injected method.
 (server as any)._getTransaction=async(h:string)=>hooks.get?hooks.get(h):mode==='missing'?{status:'NOT_FOUND',txHash:h,latestLedger:1010,latestLedgerCloseTime:1,oldestLedger:1,oldestLedgerCloseTime:1}:wire(lastTx!,fixture.ciphertextDigest,mode==='failed'?'FAILED':'SUCCESS');
 const transport:SubmissionTransport={
  getAccount:async a=>{hooks.account?.();return new Account(a,'100')},getLatestLedger:async()=>({sequence:1005}),
  simulateTransaction:async tx=>hooks.simulation?hooks.simulation(tx):simulation(),
  sendTransaction:async tx=>{sends++;journal.order.push('send');assert.ok(journal.rows.has(tx.hash().toString('hex')));lastTx=tx;hooks.send?.(tx);if(mode==='success'||mode==='throw')accept();if(mode==='throw')throw Error('response lost after transport invoked');return {hash:tx.hash().toString('hex'),status:mode==='failed'?'ERROR':'PENDING'};},
  getTransaction:async h=>{queries.push(h);return server.getTransaction(h)},
 };
 const options={release,wallet,reader,transport,journal,maxFeeStroops:'10000',verifyLocal:async(p:string,s:readonly string[])=>{verifications++;return groth16.verify(vk,s,decode(p));}};
 const client=createTestnetSubmissionLifecycle(options),candidate:PublicSubmission={kind:'UnsubmittedPrivateTransition',proof:encoded,publicSignals:fixture.publicSignals,ciphertextDigest:fixture.ciphertextDigest};
 return {f,release,reader,key,journal,hooks,client,candidate,options,transport,accept,queries,
  get signs(){return signs},get sends(){return sends},get verifications(){return verifications},get lastTx(){return lastTx},setMode:(v:typeof mode)=>{mode=v},changeSession:()=>{sessionId+='-changed'}};
}

test('actual public Groth16 proof, SDK assembled/signature and exact archive vector confirm; repeat never signs or sends again',async()=>{
 const h=await harness(),result=await h.client.submit(h.candidate,emptyAddresses);assert.equal(result.status,'confirmed');assert.equal(result.ledger,1005);
 assert.equal(h.verifications,1);assert.equal(h.signs,1);assert.equal(h.sends,1);assert.deepEqual(h.journal.order,['commit','send','confirmed']);
 assert.equal(h.lastTx!.fee,'400');assert.equal(h.lastTx!.sequence,'101');assert.ok(h.key.verify(h.lastTx!.hash(),h.lastTx!.signatures[0].signature()));
 assert.deepEqual(await h.client.submit(h.candidate,emptyAddresses),result);assert.equal(h.signs,1);assert.equal(h.sends,1);
 const persisted=JSON.stringify([...h.journal.rows.values()]);assert.ok(!persisted.includes(encoded));assert.ok(!persisted.includes('privateKey'));assert.ok(!persisted.includes(h.key.secret()));
});
test('invalid real proof/public vector and copied reader/release never reach signer',async()=>{
 const h=await harness(),fields=[...h.candidate.publicSignals];fields[6]='1001';
 await assert.rejects(h.client.submit({...h.candidate,publicSignals:fields},emptyAddresses),/INVALID_LOCAL_PROOF/);
 assert.throws(()=>createTestnetSubmissionLifecycle({...h.options,release:{...h.release}}));
 assert.throws(()=>createTestnetSubmissionLifecycle({...h.options,reader:{...h.reader}}));assert.equal(h.signs,0);assert.equal(h.sends,0);
});
test('fee, simulation return/auth/restoration and mutable simulation argument are checked before signing',async()=>{
 for(const variant of ['fee','retval','auth','restore','mutation'] as const){
  const h=await harness();h.hooks.simulation=tx=>{const s=simulation();
   if(variant==='fee')s.transactionData.setResourceFee('10001');
   if(variant==='retval')s.result!.retval=xdr.ScVal.scvBytes(Buffer.alloc(32,3));
   if(variant==='restore')return {...s,restorePreamble:{minResourceFee:'1',transactionData:new SorobanDataBuilder()}};
   if(variant==='auth'){const op=tx.operations[0];assert.equal(op.type,'invokeHostFunction');s.result!.auth=[new xdr.SorobanAuthorizationEntry({credentials:xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),rootInvocation:new xdr.SorobanAuthorizedInvocation({function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(op.func.invokeContract()),subInvocations:[]})})];}
   if(variant==='mutation'){(tx as any)._source=Keypair.fromRawEd25519Seed(Buffer.alloc(32,95)).publicKey();const op=tx.operations[0];assert.equal(op.type,'invokeHostFunction');op.func.invokeContract().functionName('other_method');}
   return s;
  };
  if(variant==='mutation'){const result=await h.client.submit(h.candidate,emptyAddresses);assert.equal(result.status,'confirmed');assert.equal(h.lastTx!.source,h.key.publicKey());const op=h.lastTx!.operations[0];assert.equal(op.type,'invokeHostFunction');assert.equal(op.func.invokeContract().functionName().toString(),'submit');}
  else{await assert.rejects(h.client.submit(h.candidate,emptyAddresses));assert.equal(h.signs,0);assert.equal(h.sends,0);}
 }
});
test('changed wallet session, payload and missing expected signature cannot send',async()=>{
 for(const variant of ['account-await','sign-await','payload','unsigned','wrong-key'] as const){const h=await harness();
  if(variant==='account-await')h.hooks.account=h.changeSession;
  if(variant==='sign-await')h.hooks.sign=h.changeSession;
  if(variant==='payload')h.options.wallet.signTransaction=async value=>{const tx=TransactionBuilder.cloneFrom(TransactionBuilder.fromXDR(value,Networks.TESTNET) as Transaction,{fee:'900'}).build();tx.sign(h.key);return tx.toXDR();};
  if(variant==='unsigned')h.options.wallet.signTransaction=async value=>value;
  if(variant==='wrong-key')h.options.wallet.signTransaction=async value=>{const tx=TransactionBuilder.fromXDR(value,Networks.TESTNET) as Transaction;tx.sign(Keypair.fromRawEd25519Seed(Buffer.alloc(32,95)));return tx.toXDR();};
  await assert.rejects(h.client.submit(h.candidate,emptyAddresses));assert.equal(h.sends,0);assert.equal(h.journal.rows.size,0);
 }
});
test('stale pinned state before signature and failed durable commit prevent send',async()=>{
 const stale=await harness();stale.f.state.root=b(1n);stale.f.state.roots.push(b(1n));stale.f.instance();await assert.rejects(stale.client.submit(stale.candidate,emptyAddresses),/STALE_PROOF_CHECKPOINT/);assert.equal(stale.signs,0);
 const failure=await harness();failure.journal.failCommit=true;await assert.rejects(failure.client.submit(failure.candidate,emptyAddresses),/STORAGE/);assert.equal(failure.sends,0);
});
test('known pre-broadcast refusal releases source; only explicit retry creates fresh hash and preserves original evidence',async()=>{
 const h=await harness();h.journal.commitHook=()=>h.changeSession();const first=await h.client.submit(h.candidate,emptyAddresses);assert.equal(first.status,'known_not_sent');assert.equal(h.sends,0);
 h.journal.commitHook=()=>{};assert.deepEqual(await h.client.submit(h.candidate,emptyAddresses),first);assert.equal(h.signs,1);
 const second=await h.client.retryKnownNotSent(first.hash,h.candidate,emptyAddresses);assert.equal(second.status,'confirmed');assert.notEqual(second.hash,first.hash);assert.equal(h.signs,2);assert.equal(h.sends,1);assert.equal(h.lastTx!.memo.type,'hash');
 assert.equal((await h.journal.get(first.hash))!.terminal!.status,'known_not_sent');assert.equal((await h.journal.get(second.hash))!.attempt.retryOf,first.hash);
 assert.deepEqual(await h.client.submit(h.candidate,emptyAddresses),second);await assert.rejects(h.client.retryKnownNotSent(first.hash,h.candidate,emptyAddresses),/EXPLICIT_NOT_SENT/);assert.equal(h.sends,1);
});
test('post-commit pinned checkpoint change is known not sent; terminal write failure stays pending',async()=>{
 for(const failTerminal of [false,true]){const h=await harness();h.journal.failTerminal=failTerminal;h.journal.commitHook=()=>{h.f.state.root=b(9n);h.f.instance()};const result=await h.client.submit(h.candidate,emptyAddresses);assert.equal(result.status,failTerminal?'pending':'known_not_sent');assert.equal(h.sends,0);}
});
test('response lost, send ERROR and duplicate-style response reconcile signed hash without rebroadcast',async()=>{
 const lost=await harness();lost.setMode('throw');assert.equal((await lost.client.submit(lost.candidate,emptyAddresses)).status,'confirmed');assert.equal(lost.sends,1);
 const failed=await harness();failed.setMode('failed');const result=await failed.client.submit(failed.candidate,emptyAddresses);assert.equal(result.status,'failed');assert.deepEqual(failed.queries,[result.hash]);assert.equal((await failed.client.submit(failed.candidate,emptyAddresses)).status,'failed');assert.equal(failed.sends,1);
 const missing=await harness();missing.setMode('missing');const unknown=await missing.client.submit(missing.candidate,emptyAddresses);assert.equal(unknown.status,'pending');assert.equal((await missing.client.submit(missing.candidate,emptyAddresses)).status,'pending');assert.equal(missing.signs,1);assert.equal(missing.sends,1);await assert.rejects(missing.client.retryKnownNotSent(unknown.hash,missing.candidate,emptyAddresses),/EXPLICIT_NOT_SENT/);
});
test('SDK echoed hash cannot bless a different envelope; missing/invalid ledger, wrong meta or missing archive remain pending',async()=>{
 for(const variant of ['other-envelope','ledger-zero','ledger-missing','wrong-return','wrong-result-hash','archive-missing','archive-mismatch'] as const){const h=await harness();
  h.hooks.send=tx=>{h.hooks.get=()=>{const w=wire(tx);if(variant==='other-envelope'){const other=TransactionBuilder.cloneFrom(tx,{fee:'900'}).build();other.sign(h.key);w.envelopeXdr=other.toXDR();w.txHash=other.hash().toString('hex');}
   if(variant==='ledger-zero')w.ledger=0;if(variant==='ledger-missing')delete w.ledger;
   if(variant==='wrong-return')return wire(tx,'77'.repeat(32));
   if(variant==='wrong-result-hash'){const r=xdr.TransactionResult.fromXDR(w.resultXdr!,'base64');r.result(xdr.TransactionResultResult.txSuccess([xdr.OperationResult.opInner(xdr.OperationResultTr.invokeHostFunction(xdr.InvokeHostFunctionResult.invokeHostFunctionSuccess(Buffer.alloc(32,2))))]));const changed=r.toXDR('base64');assert.notEqual(changed,w.resultXdr);w.resultXdr=changed;}
   if(variant==='archive-missing')h.f.entries.delete(dataKey('Record',xdr.ScVal.scvBytes(Buffer.from(fixture.ciphertextDigest,'hex'))).toXDR('base64'));
   if(variant==='archive-mismatch'){const fields=[...publicFields];fields[6]+=1n;h.f.persistent(dataKey('Record',xdr.ScVal.scvBytes(Buffer.from(fixture.ciphertextDigest,'hex'))),sc('StoredRecord',{ledger:1005,public_inputs:fields.map(b)}));}
   return w;};};
  const result=await h.client.submit(h.candidate,emptyAddresses);assert.equal(result.status,'pending',variant);assert.equal(h.queries[0],result.hash);assert.equal((await h.journal.get(result.hash))!.terminal,null);
 }
});
test('another submitter archive and mismatched send hash cannot stand in for matching transaction inclusion',async()=>{
 const h=await harness();h.setMode('missing');h.hooks.send=h.accept;const result=await h.client.submit(h.candidate,emptyAddresses);assert.equal(result.status,'pending');
 const mismatch=await harness();mismatch.transport.sendTransaction=async tx=>{mismatch.journal.order.push('send');return {hash:'99'.repeat(32),status:'PENDING'}};
 const other=await mismatch.client.submit(mismatch.candidate,emptyAddresses);assert.equal(other.status,'pending');assert.notEqual(other.hash,'99'.repeat(32));assert.equal(mismatch.queries.length,0);
});
test('send ERROR/DUPLICATE, absent send hash and thrown transport never release unresolved reservations',async()=>{
 for(const variant of ['ERROR','DUPLICATE','missing-hash','response-lost'] as const){const h=await harness();h.setMode('missing');h.transport.sendTransaction=async tx=>{
  assert.ok(await h.journal.get(tx.hash().toString('hex')));if(variant==='response-lost')throw Error('sent but response unavailable');return {hash:variant==='missing-hash'?undefined:tx.hash().toString('hex'),status:variant} as unknown as Awaited<ReturnType<SubmissionTransport['sendTransaction']>>;
 };const result=await h.client.submit(h.candidate,emptyAddresses);assert.equal(result.status,'pending');assert.equal((await h.journal.pending()).length,1);assert.equal((await h.journal.get(result.hash))!.terminal,null);}
});
test('concurrent submits serialize one immutable attempt/signature/send and return the same known result',async()=>{
 const h=await harness();const [a,b]=await Promise.all([h.client.submit(h.candidate,emptyAddresses),h.client.submit(h.candidate,emptyAddresses)]);assert.equal(a.status,'confirmed');assert.deepEqual(a,b);assert.equal(h.signs,1);assert.equal(h.sends,1);
});
test('external fee-bump reconciles only the exact signed inner and matching consumed inner-result pair',async()=>{
 for(const variant of ['success','failed','wrong-pair','other-inner','precondition','outer-failure','status-disagreement'] as const){const h=await harness();
  h.hooks.send=tx=>{h.hooks.get=()=>{
   let innerTx=tx;if(variant==='other-inner'){innerTx=TransactionBuilder.cloneFrom(tx,{fee:'900'}).build();innerTx.sign(h.key);}
   const sponsor=Keypair.fromRawEd25519Seed(Buffer.alloc(32,96)),outer=TransactionBuilder.buildFeeBumpTransaction(sponsor,'500',innerTx,Networks.TESTNET);outer.sign(sponsor);
   const failure=variant==='failed'||variant==='precondition'||variant==='outer-failure';
   const w=wire(tx,fixture.ciphertextDigest,failure?'FAILED':'SUCCESS'),base=xdr.TransactionResult.fromXDR(w.resultXdr!,'base64');
   const innerResult=new xdr.InnerTransactionResult({feeCharged:xdr.Int64.fromString('400'),ext:new xdr.InnerTransactionResultExt(0),result:variant==='precondition'?xdr.InnerTransactionResultResult.txTooEarly():failure?xdr.InnerTransactionResultResult.txFailed([trapped()]):xdr.InnerTransactionResultResult.txSuccess(base.result().results())});
   const pair=new xdr.InnerTransactionResultPair({transactionHash:variant==='wrong-pair'?Buffer.alloc(32,9):innerTx.hash(),result:innerResult});
   base.result(variant==='outer-failure'?xdr.TransactionResultResult.txBadAuth():failure||variant==='status-disagreement'?xdr.TransactionResultResult.txFeeBumpInnerFailed(pair):xdr.TransactionResultResult.txFeeBumpInnerSuccess(pair));
   return {...w,txHash:outer.hash().toString('hex'),feeBump:true,envelopeXdr:outer.toXDR(),resultXdr:base.toXDR('base64')};
  }};
  const result=await h.client.submit(h.candidate,emptyAddresses);assert.equal(result.status,variant==='success'?'confirmed':variant==='failed'?'failed':'pending',variant);assert.equal(result.hash,h.lastTx!.hash().toString('hex'));assert.equal(h.sends,1);
 }
});
test('a wallet-returned fee-bump is never accepted as the requested signing payload',async()=>{
 const h=await harness();h.options.wallet.signTransaction=async value=>{const inner=TransactionBuilder.fromXDR(value,Networks.TESTNET) as Transaction;inner.sign(h.key);const sponsor=Keypair.fromRawEd25519Seed(Buffer.alloc(32,96)),outer=TransactionBuilder.buildFeeBumpTransaction(sponsor,'500',inner,Networks.TESTNET);outer.sign(sponsor);return outer.toXDR();};
 await assert.rejects(h.client.submit(h.candidate,emptyAddresses),/FEE_BUMP_UNSUPPORTED/);assert.equal(h.sends,0);assert.equal(h.journal.rows.size,0);
});
test('terminal failure requires one failed operation of the actual invoked type, directly and inside fee-bumps',async()=>{
 for(const wrapped of [false,true])for(const variant of ['empty','wrong-operation','successful-operation'] as const){const h=await harness();h.setMode('failed');h.hooks.send=tx=>{h.hooks.get=()=>{
  const w=wire(tx,fixture.ciphertextDigest,'FAILED'),r=xdr.TransactionResult.fromXDR(w.resultXdr!,'base64');
  const ops=variant==='empty'?[]:variant==='wrong-operation'?[xdr.OperationResult.opInner(xdr.OperationResultTr.payment(xdr.PaymentResult.paymentMalformed()))]:[xdr.OperationResult.opInner(xdr.OperationResultTr.invokeHostFunction(xdr.InvokeHostFunctionResult.invokeHostFunctionSuccess(Buffer.alloc(32))))];
  if(wrapped){const sponsor=Keypair.fromRawEd25519Seed(Buffer.alloc(32,96)),outer=TransactionBuilder.buildFeeBumpTransaction(sponsor,'500',tx,Networks.TESTNET);outer.sign(sponsor);w.feeBump=true;w.envelopeXdr=outer.toXDR();r.result(xdr.TransactionResultResult.txFeeBumpInnerFailed(new xdr.InnerTransactionResultPair({transactionHash:tx.hash(),result:new xdr.InnerTransactionResult({feeCharged:xdr.Int64.fromString('400'),ext:new xdr.InnerTransactionResultExt(0),result:xdr.InnerTransactionResultResult.txFailed(ops)})})));}
  else r.result(xdr.TransactionResultResult.txFailed(ops));w.resultXdr=r.toXDR('base64');return w;
 }};assert.equal((await h.client.submit(h.candidate,emptyAddresses)).status,'pending',`${wrapped}/${variant}`);assert.equal((await h.journal.pending()).length,1);}
});
