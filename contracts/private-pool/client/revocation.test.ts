/** Genuine committed 4-input Groth16 proof and SDK signature/XDR. Network and
 * ledger transport are local unit boundaries; no live chain or wallet access. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {Account,Keypair,Networks,Transaction,TransactionBuilder,SorobanDataBuilder,hash,rpc,xdr} from '@stellar/stellar-sdk';
import {setup,b,sc,dataKey} from './reader-fixture.ts';
import {verifyPoolRelease} from './release.ts';
import {createPoolReader} from './reader.ts';
import {createTestnetRevocationLifecycle,type PublicRevocation} from './revocation.ts';
import {createTestnetSubmissionLifecycle,type SubmissionTransport,type PrivateWallet} from './submission.ts';
import {snapshotAttempt,reservationKeys,intentOf,type JournalIntent,type JournalAttempt,type SubmissionJournal,type TerminalEvidence,type JournalEntry} from './journal.ts';
import {encodeGroth16Proof} from '../../../privacy/src/prover.mjs';

const require=createRequire(new URL('../../../privacy/package.json',import.meta.url));
const {groth16}=require('snarkjs'),{buildBn128}=require('ffjavascript');
const fixture=JSON.parse(readFileSync(new URL('../fixtures/verified-v2/proofs/13-revoke-envoy.json',import.meta.url),'utf8'));
const submitFixture=JSON.parse(readFileSync(new URL('../fixtures/verified-v2/proofs/02-create-pod.json',import.meta.url),'utf8'));
const vk=JSON.parse(readFileSync(new URL('../fixtures/verified-v2/keys/revocation-vk.json',import.meta.url),'utf8'));
const encoded=encodeGroth16Proof(fixture.proof),fields=fixture.publicSignals.map(BigInt);
before(async()=>{(globalThis as any).curve_bn128=await buildBn128(true);});
after(async()=>{await (globalThis as any).curve_bn128?.terminate();(globalThis as any).curve_bn128=null;});
function decode(hex:string){const a=Array.from({length:8},(_,i)=>BigInt('0x'+hex.slice(i*64,(i+1)*64)).toString());return {pi_a:[a[0],a[1],'1'],pi_b:[[a[3],a[2]],[a[5],a[4]],['1','0']],pi_c:[a[6],a[7],'1'],protocol:'groth16',curve:'bn128'};}
const sameIntent=(a:JournalIntent,b:JournalIntent)=>JSON.stringify(intentOf(a))===JSON.stringify(intentOf(b));
class MemoryJournal implements SubmissionJournal {
 rows=new Map<string,JournalEntry>();order:string[]=[];commitHook:(a:JournalAttempt)=>void=()=>{};failCommit=false;failTerminal=false;private tail=Promise.resolve();
 async exclusive<T>(fn:()=>Promise<T>):Promise<T>{const previous=this.tail;let release!:()=>void;this.tail=new Promise(resolve=>{release=resolve});await previous;try{return await fn()}finally{release()}}
 async find(intent:JournalIntent){return [...this.rows.values()].filter(e=>sameIntent(e.attempt,intent)).at(-1)??null;}
 async pending(){return [...this.rows.values()].filter(e=>!e.terminal).map(e=>e.attempt);}
 async conflicts(intent:JournalIntent){const keys=new Set(reservationKeys(intent));return [...this.rows.values()].filter(e=>!e.terminal&&reservationKeys(intentOf(e.attempt)).some(k=>keys.has(k))).map(e=>e.attempt);}
 async commit(value:JournalAttempt){if(this.failCommit)throw Error('STORAGE_UNAVAILABLE');const a=snapshotAttempt(value);assert.equal(this.rows.has(a.hash),false);assert.equal((await this.conflicts(intentOf(a))).length,0);this.rows.set(a.hash,{attempt:a,terminal:null});this.order.push('commit');this.commitHook(a);}
 async get(h:string){return this.rows.get(h)??null}
 async terminal(t:TerminalEvidence){if(this.failTerminal)throw Error('STORAGE_UNAVAILABLE');const e=this.rows.get(t.hash);assert.ok(e);assert.equal(e.terminal,null);this.rows.set(t.hash,{...e,terminal:Object.freeze({...t})});this.order.push(t.status);}
}
function simulation():rpc.Api.SimulateTransactionSuccessResponse{return {id:'local-unit',_parsed:true,latestLedger:1005,events:[],transactionData:new SorobanDataBuilder().setResources(100,100,100).setResourceFee('300'),minResourceFee:'300',result:{auth:[],retval:xdr.ScVal.scvVoid()}};}
function wire(tx:Transaction,status:'SUCCESS'|'FAILED'='SUCCESS'):rpc.Api.RawGetTransactionResponse {
 const rv=xdr.ScVal.scvVoid(),preimage=new xdr.InvokeHostFunctionSuccessPreImage({returnValue:rv,events:[]});
 const result=new xdr.TransactionResult({feeCharged:xdr.Int64.fromString('400'),ext:new xdr.TransactionResultExt(0),result:status==='SUCCESS'
  ?xdr.TransactionResultResult.txSuccess([xdr.OperationResult.opInner(xdr.OperationResultTr.invokeHostFunction(xdr.InvokeHostFunctionResult.invokeHostFunctionSuccess(hash(preimage.toXDR()))))])
  :xdr.TransactionResultResult.txFailed([xdr.OperationResult.opInner(xdr.OperationResultTr.invokeHostFunction(xdr.InvokeHostFunctionResult.invokeHostFunctionTrapped()))])});
 const meta=status==='SUCCESS'?new xdr.TransactionMeta(3,new xdr.TransactionMetaV3({ext:new xdr.ExtensionPoint(0),txChangesBefore:[],txChangesAfter:[],operations:[new xdr.OperationMeta({changes:[]})],sorobanMeta:new xdr.SorobanTransactionMeta({ext:new xdr.SorobanTransactionMetaExt(0),events:[],returnValue:rv,diagnosticEvents:[]})})):new xdr.TransactionMeta(0,[]);
 return {status:status as rpc.Api.GetTransactionStatus,txHash:tx.hash().toString('hex'),latestLedger:1010,latestLedgerCloseTime:1,oldestLedger:1,oldestLedgerCloseTime:1,ledger:1005,createdAt:1,applicationOrder:0,feeBump:false,envelopeXdr:tx.toXDR(),resultXdr:result.toXDR('base64'),resultMetaXdr:meta.toXDR('base64')};
}
async function harness(){
 const f=setup(),release=await verifyPoolRelease(f.manifest,f.dkg),reader=createPoolReader(release,{fetch:f.fetcher});
 assert.equal(release.profile.domain,fields[0]);assert.equal(f.state.revocation_root.toString('hex'),b(fields[1]).toString('hex'));
 const key=Keypair.fromRawEd25519Seed(Buffer.alloc(32,93)),journal=new MemoryJournal();
 let sessionId='session-1',signs=0,sends=0,verifications=0,lastTx:Transaction|null=null;
 const queries:string[]=[],server=new rpc.Server(release.rpcUrl);
 const hooks:{sign?:(tx:Transaction)=>void;send?:(tx:Transaction)=>void;account?:()=>void;latest?:()=>number;simulation?:(tx:Transaction)=>rpc.Api.SimulateTransactionResponse;get?:(hash:string)=>rpc.Api.RawGetTransactionResponse}={};
 let mode:'success'|'missing'|'throw'|'failed'='success';
 function accept(){f.persistent(dataKey('RevocationIndex',xdr.ScVal.scvU64(xdr.Uint64.fromString('0'))),sc('StoredRevocation',{ledger:1005,tag:b(fields[3]),old_root:b(fields[1]),new_root:b(fields[2])}));f.state.revocation_root=b(fields[2]);f.state.revocation_count=1n;f.instance();}
 const wallet:PrivateWallet={session:()=>({id:sessionId,account:key.publicKey(),networkPassphrase:Networks.TESTNET}),signTransaction:async s=>{signs++;const tx=TransactionBuilder.fromXDR(s,Networks.TESTNET) as Transaction;hooks.sign?.(tx);tx.sign(key);return tx.toXDR();}};
 (server as any)._getTransaction=async(h:string)=>hooks.get?hooks.get(h):mode==='missing'?{status:'NOT_FOUND',txHash:h,latestLedger:1010,latestLedgerCloseTime:1,oldestLedger:1,oldestLedgerCloseTime:1}:wire(lastTx!,mode==='failed'?'FAILED':'SUCCESS');
 const transport:SubmissionTransport={getAccount:async a=>{hooks.account?.();return new Account(a,'100')},getLatestLedger:async()=>({sequence:hooks.latest?hooks.latest():1005}),simulateTransaction:async tx=>hooks.simulation?hooks.simulation(tx):simulation(),
  sendTransaction:async tx=>{sends++;journal.order.push('send');assert.ok(journal.rows.has(tx.hash().toString('hex')));lastTx=tx;if(mode==='success'||mode==='throw')accept();hooks.send?.(tx);if(mode==='throw')throw Error('response lost');return {hash:tx.hash().toString('hex'),status:mode==='failed'?'ERROR':'PENDING'};},getTransaction:async h=>{queries.push(h);return server.getTransaction(h)}};
 const options={release,wallet,reader,transport,journal,maxFeeStroops:'10000',verifyLocal:async(p:string,s:readonly string[])=>{verifications++;return groth16.verify(vk,s,decode(p));}};
 const client=createTestnetRevocationLifecycle(options),candidate:PublicRevocation={kind:'UnsubmittedPrivateRevocation',proof:encoded,publicSignals:fixture.publicSignals,ownerKey:fixture.ownerKey,signature:fixture.signature};
 return {f,release,reader,key,journal,hooks,client,candidate,options,transport,accept,queries,get signs(){return signs},get sends(){return sends},get verifications(){return verifications},get lastTx(){return lastTx},setMode:(v:typeof mode)=>{mode=v},changeSession:()=>{sessionId+='-changed'}};
}
test('real four-input revoke proof, owner signature, wallet XDR and exact archive confirm once',async()=>{
 const h=await harness(),result=await h.client.revoke(h.candidate);assert.equal(result.status,'confirmed');assert.equal(result.ledger,1005);
 assert.equal(h.verifications,1);assert.equal(h.signs,1);assert.equal(h.sends,1);assert.deepEqual(h.journal.order,['commit','send','confirmed']);
 assert.equal(h.lastTx!.fee,'400');assert.equal(h.lastTx!.sequence,'101');assert.ok(h.key.verify(h.lastTx!.hash(),h.lastTx!.signatures[0].signature()));
 assert.deepEqual(await h.client.revoke(h.candidate),result);assert.equal(h.signs,1);assert.equal(h.sends,1);
 const persisted=JSON.stringify([...h.journal.rows.values()]);assert.ok(!persisted.includes(encoded));assert.ok(!persisted.includes(fixture.signature));assert.ok(!persisted.includes(h.key.secret()));
});
test('invalid owner signature, changed tag/domain and invalid real Groth16 proof never sign',async()=>{
 for(const variant of ['signature','owner','domain','proof','extra-secret','getter'] as const){
  const h=await harness(),candidate={...h.candidate};let invoked=false;
  if(variant==='signature')candidate.signature='00'.repeat(64);
  if(variant==='owner')candidate.ownerKey=Keypair.random().rawPublicKey().toString('hex');
  if(variant==='domain')candidate.publicSignals=['1',...candidate.publicSignals.slice(1)];
  if(variant==='proof')candidate.proof='00'.repeat(256);
  if(variant==='extra-secret')Object.assign(candidate,{secret:'never accepted'});
  if(variant==='getter')Object.defineProperty(candidate,'signature',{enumerable:true,get(){invoked=true;return fixture.signature}});
  await assert.rejects(h.client.revoke(candidate));assert.equal(h.signs,0);assert.equal(h.sends,0);assert.equal(h.journal.rows.size,0);assert.equal(invoked,false);
 }
 const h=await harness();assert.throws(()=>createTestnetRevocationLifecycle({...h.options,release:{...h.release}}));assert.throws(()=>createTestnetRevocationLifecycle({...h.options,reader:{...h.reader}}));
});
test('fee, non-void return, source authorization, restoration and expired simulation refuse before signing',async()=>{
 for(const variant of ['fee','retval','auth','restore','expired'] as const){
  const h=await harness();h.hooks.simulation=tx=>{const s=simulation();
   if(variant==='fee')s.transactionData.setResourceFee('10001');
   if(variant==='retval')s.result!.retval=xdr.ScVal.scvBytes(Buffer.alloc(32));
   if(variant==='restore')return {...s,restorePreamble:{minResourceFee:'1',transactionData:new SorobanDataBuilder()}};
   if(variant==='expired')s.latestLedger=2000;
   if(variant==='auth'){const op=tx.operations[0];assert.equal(op.type,'invokeHostFunction');s.result!.auth=[new xdr.SorobanAuthorizationEntry({credentials:xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),rootInvocation:new xdr.SorobanAuthorizedInvocation({function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(op.func.invokeContract()),subInvocations:[]})})];}
   return s;
  };
  await assert.rejects(h.client.revoke(h.candidate));assert.equal(h.signs,0,variant);assert.equal(h.sends,0);
 }
});
test('mutated simulation argument cannot change the signed revoke invocation or source',async()=>{
 const h=await harness();h.hooks.simulation=tx=>{(tx as any)._source=Keypair.random().publicKey();const op=tx.operations[0];assert.equal(op.type,'invokeHostFunction');op.func.invokeContract().functionName('submit');return simulation();};
 assert.equal((await h.client.revoke(h.candidate)).status,'confirmed');assert.equal(h.lastTx!.source,h.key.publicKey());
 const op=h.lastTx!.operations[0];assert.equal(op.type,'invokeHostFunction');assert.equal(op.func.invokeContract().functionName().toString(),'revoke');
});
test('wallet session drift, changed payload, unsigned payload and wrong wallet signature refuse send',async()=>{
 for(const variant of ['account-await','sign-await','payload','unsigned','wrong-key','public-network'] as const){const h=await harness();
  if(variant==='account-await')h.hooks.account=h.changeSession;
  if(variant==='sign-await')h.hooks.sign=h.changeSession;
  if(variant==='payload')h.options.wallet.signTransaction=async value=>{const tx=TransactionBuilder.cloneFrom(TransactionBuilder.fromXDR(value,Networks.TESTNET) as Transaction,{fee:'900'}).build();tx.sign(h.key);return tx.toXDR();};
  if(variant==='unsigned')h.options.wallet.signTransaction=async value=>value;
  if(variant==='wrong-key')h.options.wallet.signTransaction=async value=>{const tx=TransactionBuilder.fromXDR(value,Networks.TESTNET) as Transaction;tx.sign(Keypair.random());return tx.toXDR();};
  if(variant==='public-network')h.options.wallet.session=()=>({id:'session-1',account:h.key.publicKey(),networkPassphrase:Networks.PUBLIC});
  await assert.rejects(h.client.revoke(h.candidate));assert.equal(h.sends,0);assert.equal(h.journal.rows.size,0);
 }
});
test('stale revocation root and failed durable write cannot broadcast',async()=>{
 const stale=await harness();stale.f.state.revocation_root=b(1n);stale.f.instance();await assert.rejects(stale.client.revoke(stale.candidate),/STALE_PROOF_CHECKPOINT/);assert.equal(stale.signs,0);
 const h=await harness();h.journal.failCommit=true;await assert.rejects(h.client.revoke(h.candidate),/STORAGE/);assert.equal(h.sends,0);
});
test('after durable commit changed session/checkpoint/window is known not sent; failed terminal persistence remains pending',async()=>{
 for(const variant of ['session','checkpoint','window','terminal-write'] as const){const h=await harness();
  h.journal.commitHook=()=>{if(variant==='session')h.changeSession();else if(variant==='window')h.hooks.latest=()=>2000;else{h.f.state.revocation_root=b(9n);h.f.instance();}};
  h.journal.failTerminal=variant==='terminal-write';const result=await h.client.revoke(h.candidate);
  assert.equal(result.status,variant==='terminal-write'?'pending':'known_not_sent');assert.equal(h.sends,0);
  assert.equal((await h.journal.pending()).length,variant==='terminal-write'?1:0);
 }
});
test('explicit known-not-sent retry creates a new signed hash without deleting prior evidence',async()=>{
 const h=await harness();h.journal.commitHook=h.changeSession;const first=await h.client.revoke(h.candidate);assert.equal(first.status,'known_not_sent');assert.equal(h.sends,0);
 h.journal.commitHook=()=>{};assert.deepEqual(await h.client.revoke(h.candidate),first);assert.equal(h.signs,1);
 const next=await h.client.retryKnownNotSent(first.hash,h.candidate);assert.equal(next.status,'confirmed');assert.notEqual(next.hash,first.hash);assert.equal(h.lastTx!.memo.type,'hash');assert.equal(h.sends,1);
 assert.equal((await h.journal.get(first.hash))!.terminal!.status,'known_not_sent');assert.equal((await h.journal.get(next.hash))!.attempt.retryOf,first.hash);
 await assert.rejects(h.client.retryKnownNotSent(first.hash,h.candidate),/EXPLICIT_NOT_SENT/);assert.equal(h.sends,1);
});
test('lost responses, pending records and failed operation reconcile only the original hash and never resend',async()=>{
 const lost=await harness();lost.setMode('throw');assert.equal((await lost.client.revoke(lost.candidate)).status,'confirmed');assert.equal(lost.sends,1);
 const failed=await harness();failed.setMode('failed');const result=await failed.client.revoke(failed.candidate);assert.equal(result.status,'failed');assert.deepEqual(failed.queries,[result.hash]);assert.equal((await failed.client.revoke(failed.candidate)).status,'failed');assert.equal(failed.sends,1);
 const unknown=await harness();unknown.setMode('missing');const pending=await unknown.client.revoke(unknown.candidate);assert.equal(pending.status,'pending');assert.deepEqual(await unknown.client.revoke(unknown.candidate),pending);assert.equal(unknown.signs,1);assert.equal(unknown.sends,1);await assert.rejects(unknown.client.retryKnownNotSent(pending.hash,unknown.candidate),/EXPLICIT_NOT_SENT/);assert.equal((await unknown.journal.pending()).length,1);
});
test('wrong envelope, return, success hash, revocation archive or missing operation never confirms',async()=>{
 for(const variant of ['other-envelope','wrong-method','wrong-return','wrong-success-hash','missing-archive','different-archive','no-operation','ledger-zero'] as const){const h=await harness();
  h.hooks.get=()=>{const tx=h.lastTx!,w=wire(tx);
   if(variant==='other-envelope'){const other=TransactionBuilder.cloneFrom(tx,{fee:'900'}).build();other.sign(h.key);w.envelopeXdr=other.toXDR();}
   if(variant==='wrong-method'){const other=TransactionBuilder.fromXDR(tx.toXDR(),Networks.TESTNET) as Transaction;const op=other.operations[0];assert.equal(op.type,'invokeHostFunction');op.func.invokeContract().functionName('submit');w.envelopeXdr=other.toXDR();}
   if(variant==='wrong-return'){const meta=xdr.TransactionMeta.fromXDR(w.resultMetaXdr!,'base64');meta.v3().sorobanMeta()!.returnValue(xdr.ScVal.scvBytes(Buffer.alloc(32)));w.resultMetaXdr=meta.toXDR('base64');}
   if(variant==='wrong-success-hash'||variant==='no-operation'){const result=xdr.TransactionResult.fromXDR(w.resultXdr!,'base64');result.result(xdr.TransactionResultResult.txSuccess(variant==='no-operation'?[]:[xdr.OperationResult.opInner(xdr.OperationResultTr.invokeHostFunction(xdr.InvokeHostFunctionResult.invokeHostFunctionSuccess(Buffer.alloc(32,2))))]));w.resultXdr=result.toXDR('base64');}
   if(variant==='missing-archive')h.f.entries.delete(dataKey('RevocationIndex',xdr.ScVal.scvU64(xdr.Uint64.fromString('0'))).toXDR('base64'));
   if(variant==='different-archive')h.f.persistent(dataKey('RevocationIndex',xdr.ScVal.scvU64(xdr.Uint64.fromString('0'))),sc('StoredRevocation',{ledger:1005,tag:b(fields[3]+1n),old_root:b(fields[1]),new_root:b(fields[2])}));
   if(variant==='ledger-zero')w.ledger=0;return w;};
  const result=await h.client.revoke(h.candidate);assert.equal(result.status,'pending',variant);assert.equal((await h.journal.get(result.hash))!.terminal,null);assert.equal((await h.journal.pending()).length,1);
 }
});
test('later valid revocations do not invalidate historical confirmation, but archive alone is never inclusion',async()=>{
 const h=await harness();h.hooks.send=()=>{h.f.state.revocation_count=2n;h.f.state.revocation_root=b(456n);h.f.instance();};assert.equal((await h.client.revoke(h.candidate)).status,'confirmed');
 const absent=await harness();absent.setMode('missing');absent.hooks.send=absent.accept;assert.equal((await absent.client.revoke(absent.candidate)).status,'pending');
});
test('concurrent revokes sign once and share the same immutable attempt',async()=>{
 const h=await harness();const [a,b]=await Promise.all([h.client.revoke(h.candidate),h.client.revoke(h.candidate)]);assert.equal(a.status,'confirmed');assert.deepEqual(a,b);assert.equal(h.signs,1);assert.equal(h.sends,1);
});
test('submit and revoke share source reservation; either lifecycle refuses the other attempt type',async()=>{
 const h=await harness(),a=snapshotAttempt({version:1,hash:'11'.repeat(32),sequence:'101',callHash:'22'.repeat(32),retryOf:null,releaseId:h.release.scope.profileId,pool:h.release.pool,source:h.key.publicKey(),recordId:submitFixture.ciphertextDigest,publicSignals:submitFixture.publicSignals});
 await h.journal.commit(a);await assert.rejects(h.client.revoke(h.candidate),/UNRESOLVED_PRIVATE_ATTEMPT/);assert.equal(h.verifications,0);assert.equal(h.signs,0);await assert.rejects(h.client.reconcile(a.hash),/REVOCATION_ATTEMPT_REQUIRED/);
 const r=await harness();r.setMode('missing');const revocation=await r.client.revoke(r.candidate);
 const publicLifecycle=createTestnetSubmissionLifecycle({...r.options,verifyLocal:async()=>{throw Error('must not verify before reservation check')}});
 await assert.rejects(publicLifecycle.submit({kind:'UnsubmittedPrivateTransition',proof:encodeGroth16Proof(submitFixture.proof),publicSignals:submitFixture.publicSignals,ciphertextDigest:submitFixture.ciphertextDigest},{asset:null,bridgeAccount:null,feeAccount:null}),/UNRESOLVED_PRIVATE_ATTEMPT/);
 await assert.rejects(publicLifecycle.reconcile(revocation.hash),/SUBMISSION_ATTEMPT_REQUIRED/);assert.equal(r.signs,1);assert.equal(r.sends,1);assert.equal((await r.journal.pending()).length,1);
});
test('ERROR, DUPLICATE, missing/mismatched send hash and thrown transport keep revocation reservations',async()=>{
 for(const variant of ['ERROR','DUPLICATE','missing-hash','wrong-hash','response-lost'] as const){const h=await harness();h.setMode('missing');let calls=0;
  h.transport.sendTransaction=async tx=>{calls++;assert.ok(await h.journal.get(tx.hash().toString('hex')));if(variant==='response-lost')throw Error('unknown after send');return {hash:variant==='missing-hash'?undefined:variant==='wrong-hash'?'aa'.repeat(32):tx.hash().toString('hex'),status:variant} as unknown as Awaited<ReturnType<SubmissionTransport['sendTransaction']>>;};
  const result=await h.client.revoke(h.candidate);assert.equal(result.status,'pending');assert.deepEqual(await h.client.revoke(h.candidate),result);assert.equal(calls,1);assert.equal((await h.journal.pending()).length,1);assert.equal((await h.journal.get(result.hash))!.terminal,null);
 }
});
test('external fee-bump void success/failure requires the exact signed revoke inner and consumed operation',async()=>{
 for(const variant of ['success','failed','wrong-pair','outer-failure'] as const){const h=await harness();
  h.hooks.get=()=>{const tx=h.lastTx!,sponsor=Keypair.fromRawEd25519Seed(Buffer.alloc(32,96)),outer=TransactionBuilder.buildFeeBumpTransaction(sponsor,'500',tx,Networks.TESTNET);outer.sign(sponsor);
   const failure=variant==='failed'||variant==='outer-failure',w=wire(tx,failure?'FAILED':'SUCCESS'),base=xdr.TransactionResult.fromXDR(w.resultXdr!,'base64');
   const inner=new xdr.InnerTransactionResult({feeCharged:xdr.Int64.fromString('400'),ext:new xdr.InnerTransactionResultExt(0),result:failure?xdr.InnerTransactionResultResult.txFailed(base.result().results()):xdr.InnerTransactionResultResult.txSuccess(base.result().results())});
   const pair=new xdr.InnerTransactionResultPair({transactionHash:variant==='wrong-pair'?Buffer.alloc(32,9):tx.hash(),result:inner});
   base.result(variant==='outer-failure'?xdr.TransactionResultResult.txBadAuth():failure?xdr.TransactionResultResult.txFeeBumpInnerFailed(pair):xdr.TransactionResultResult.txFeeBumpInnerSuccess(pair));
   return {...w,txHash:outer.hash().toString('hex'),feeBump:true,envelopeXdr:outer.toXDR(),resultXdr:base.toXDR('base64')};
  };
  const result=await h.client.revoke(h.candidate);assert.equal(result.status,variant==='success'?'confirmed':variant==='failed'?'failed':'pending',variant);assert.equal(result.hash,h.lastTx!.hash().toString('hex'));assert.equal(h.sends,1);
 }
});
