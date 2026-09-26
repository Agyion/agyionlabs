// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { nativeToScVal, rpc, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import { listTransactionAttempts, rememberTransactionAttempt, updateTransactionAttempt, unresolvedTransaction, reconcileTransactionAttempts } from '../app/lib/transactionReceipts';
import { recoveryTransactionFixture } from './recovery-fixture';
const scope = { account:'G'+'A'.repeat(55), network:'Test SDF Network ; September 2015', contractId:'C'+'A'.repeat(55) };
const {hash,envelopeXdr}=recoveryTransactionFixture('transaction-recovery');
const draft = { ...scope, action:'create_pod', refId:null, hash };
beforeEach(()=>{vi.restoreAllMocks();localStorage.clear()});
it('persists only allowlisted public recovery metadata across a module reload',async()=>{
 rememberTransactionAttempt({...draft, preimage:'never-store-this', signedXdr:'never-store-xdr'} as any);
 vi.resetModules();const reloaded=await import('../app/lib/transactionReceipts');
 expect(reloaded.listTransactionAttempts(scope)).toHaveLength(1);
 expect(Array.from({length:localStorage.length},(_,i)=>localStorage.getItem(localStorage.key(i)!)).join('')).not.toMatch(/never-store|preimage|signedXdr/);
 expect(reloaded.unresolvedTransaction({...scope,action:'create_pod',refId:null})?.hash).toBe(draft.hash);
 expect(reloaded.listTransactionAttempts({...scope,network:'other'})).toEqual([]);
});
it('not found and failed RPC retain uncertainty; only chain evidence resolves it',async()=>{
 rememberTransactionAttempt(draft);
 const server={getTransaction:vi.fn().mockResolvedValueOnce({txHash:draft.hash,envelopeXdr,status:'NOT_FOUND'}).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({txHash:draft.hash,envelopeXdr,status:'SUCCESS',ledger:42,returnValue:nativeToScVal(17n,{type:'u64'})})};
 await reconcileTransactionAttempts(server,scope);expect(listTransactionAttempts(scope)[0].status).toBe('unknown');
 await reconcileTransactionAttempts(server,scope);expect(unresolvedTransaction({...scope,action:'create_pod',refId:null})).toBeDefined();
 await reconcileTransactionAttempts(server,scope);
 expect(listTransactionAttempts(scope)[0]).toMatchObject({status:'success',refId:'17',ledger:42});
 expect(unresolvedTransaction({...scope,action:'create_pod',refId:null})).toBeUndefined();
 expect(server.getTransaction).toHaveBeenCalledTimes(3);
});
it('does not resolve or query another account/network and never resubmits',async()=>{
 rememberTransactionAttempt(draft);const server={getTransaction:vi.fn(),sendTransaction:vi.fn()};
 await reconcileTransactionAttempts(server,{...scope,account:'G'+'B'.repeat(55)});expect(server.getTransaction).not.toHaveBeenCalled();expect(server.sendTransaction).not.toHaveBeenCalled();
});
it('failed chain outcome releases matching intent; unrelated actions remain separate',()=>{
 rememberTransactionAttempt({...draft,action:'claim',refId:'4'});
 expect(unresolvedTransaction({...scope,action:'claim',refId:'5'})).toBeUndefined();
 updateTransactionAttempt(draft.hash,scope,{status:'failed',ledger:8});
 expect(unresolvedTransaction({...scope,action:'claim',refId:'4'})).toBeUndefined();
});
it('fails closed on malformed stored attempts and blocks broadcast persistence when storage fails',()=>{
 localStorage.setItem('agyion.transactions.v1','[{},null]');expect(()=>listTransactionAttempts()).toThrow(/recovery|storage/i);
 localStorage.clear();
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota')});
 expect(()=>rememberTransactionAttempt(draft)).toThrow(/storage|save|recovery/i);
});
it('cannot lose an unrelated pending hash when two tabs interleave metadata writes',()=>{
 const original=Storage.prototype.setItem;
 vi.spyOn(Storage.prototype,'setItem').mockImplementationOnce(function(this:Storage,key,value){
   rememberTransactionAttempt({...draft,hash:'b'.repeat(64),action:'claim',refId:'4'});
   original.call(this,key,value);
 });
 rememberTransactionAttempt(draft);
 expect(listTransactionAttempts(scope).map(a=>a.hash).sort()).toEqual([hash,'b'.repeat(64)].sort());
});
it('late interleaved uncertainty cannot overwrite terminal evidence from another tab',()=>{
 rememberTransactionAttempt(draft);const original=Storage.prototype.setItem;
 vi.spyOn(Storage.prototype,'setItem').mockImplementationOnce(function(this:Storage,key,value){
   updateTransactionAttempt(draft.hash,scope,{status:'success',refId:'17',ledger:42});original.call(this,key,value);
 });
 updateTransactionAttempt(draft.hash,scope,{status:'unknown',ledger:null});
 expect(listTransactionAttempts(scope)[0]).toMatchObject({status:'success',refId:'17',ledger:42});
});
it('cannot downgrade confirmed evidence when a concurrent pending poll finishes late',()=>{
 rememberTransactionAttempt(draft);updateTransactionAttempt(draft.hash,scope,{status:'success',refId:'2',ledger:7});
 updateTransactionAttempt(draft.hash,scope,{status:'unknown',ledger:null});
 expect(listTransactionAttempts(scope)[0]).toMatchObject({status:'success',refId:'2',ledger:7});
});
it('keeps a confirmed create ID when an older success lookup lacks a return value',async()=>{
 rememberTransactionAttempt(draft);let finish!:(value:any)=>void;
 const pending=reconcileTransactionAttempts({getTransaction:()=>new Promise(r=>{finish=r})},scope);
 updateTransactionAttempt(draft.hash,scope,{status:'success',refId:'17',ledger:42});
 finish({txHash:draft.hash,envelopeXdr,status:'SUCCESS',ledger:42});await pending;
 expect(listTransactionAttempts(scope)[0]).toMatchObject({status:'success',refId:'17',ledger:42});
});
it.each([
 {txHash:'b'.repeat(64),status:'FAILED',ledger:7},
 {txHash:'b'.repeat(64),status:'SUCCESS',ledger:7},
 {status:'FAILED',ledger:7},
 {txHash:draft.hash,envelopeXdr,status:'FAILED'},
 {txHash:draft.hash,envelopeXdr,status:'SUCCESS',ledger:0},
 {txHash:draft.hash,envelopeXdr,status:'FAILED',ledger:-1},
 {txHash:draft.hash,envelopeXdr,status:'FAILED',ledger:1.5},
])('never resolves an attempt from mismatched or malformed terminal evidence',async response=>{
 rememberTransactionAttempt(draft);
 await reconcileTransactionAttempts({getTransaction:async()=>response},scope);
 expect(listTransactionAttempts(scope)[0].status).toBe('unknown');
 expect(unresolvedTransaction(draft)?.hash).toBe(draft.hash);
});
it('keeps a confirmed creation queryable until its record ID is recovered without downgrading confirmation',async()=>{
 rememberTransactionAttempt(draft);
 const server={getTransaction:vi.fn()
  .mockResolvedValueOnce({txHash:draft.hash,envelopeXdr,status:'SUCCESS',ledger:42})
  .mockResolvedValueOnce({txHash:draft.hash,envelopeXdr,status:'NOT_FOUND'})
  .mockResolvedValueOnce({txHash:draft.hash,envelopeXdr,status:'SUCCESS',ledger:42,returnValue:nativeToScVal(17n,{type:'u64'})})};
 await reconcileTransactionAttempts(server,scope);
 expect(listTransactionAttempts(scope)[0]).toMatchObject({status:'success',refId:null,ledger:42});
 await reconcileTransactionAttempts(server,scope);
 expect(listTransactionAttempts(scope)[0]).toMatchObject({status:'success',refId:null,ledger:42});
 await reconcileTransactionAttempts(server,scope);
 expect(listTransactionAttempts(scope)[0]).toMatchObject({status:'success',refId:'17',ledger:42});
 await reconcileTransactionAttempts(server,scope);
 expect(server.getTransaction).toHaveBeenCalledTimes(3);
});
it.each(['success','failed'] as const)('rechecks legacy %s records that have no terminal ledger',async status=>{
 localStorage.setItem('agyion.transactions.v1',JSON.stringify([{...draft,status,refId:status==='success'?'17':null,ledger:null,createdAt:1,checkedAt:2}]));
 expect(listTransactionAttempts(scope)[0]).toMatchObject({status:'unknown',refId:null,ledger:null});
 expect(unresolvedTransaction(draft)?.hash).toBe(draft.hash);
 await reconcileTransactionAttempts({getTransaction:async()=>({txHash:draft.hash,envelopeXdr,status:'FAILED',ledger:12})},scope);
 expect(listTransactionAttempts(scope)[0]).toMatchObject({status:'failed',ledger:12});
});
it.each(['success','failed'] as const)('does not release retry from stored %s evidence without a terminal ledger',status=>{
 rememberTransactionAttempt(draft);
 localStorage.setItem('agyion.transactions.v2:evidence:legacy',JSON.stringify({...scope,hash:draft.hash,checkedAt:2,update:{status,refId:'17',ledger:0}}));
 expect(listTransactionAttempts(scope)[0]).toMatchObject({status:'unknown',refId:null,ledger:null});
 expect(unresolvedTransaction(draft)?.hash).toBe(draft.hash);
 updateTransactionAttempt(draft.hash,scope,{status:'success',refId:'17',ledger:12});
 expect(listTransactionAttempts(scope)[0]).toMatchObject({status:'success',refId:'17',ledger:12});
});
it.each([
 undefined,{} as any,recoveryTransactionFixture('other-envelope').envelopeXdr,
])('keeps a synthesized matching hash unresolved without the expected envelope',async returnedEnvelope=>{
 rememberTransactionAttempt(draft);
 await reconcileTransactionAttempts({getTransaction:async()=>({txHash:hash,envelopeXdr:returnedEnvelope,status:'FAILED',ledger:12})},scope);
 expect(unresolvedTransaction(draft)?.hash).toBe(hash);
 expect(listTransactionAttempts(scope)[0]).toMatchObject({status:'unknown',ledger:null});
});
it('hashes returned envelopes using the attempt network',async()=>{
 const otherScope={...scope,network:'wrong network'},otherDraft={...draft,...otherScope};
 rememberTransactionAttempt(otherDraft);
 await reconcileTransactionAttempts({getTransaction:async()=>({txHash:hash,envelopeXdr,status:'FAILED',ledger:12})},otherScope);
 expect(unresolvedTransaction(otherDraft)?.hash).toBe(hash);
});
it('rejects the installed SDK request-echo hash when raw RPC evidence contains another envelope',async()=>{
 rememberTransactionAttempt(draft);
 const other=recoveryTransactionFixture('raw-other-envelope');
 const server=new rpc.Server('https://example.com');
 const raw=vi.spyOn(server as any,'_getTransaction').mockResolvedValue({
  status:'FAILED',txHash:other.hash,ledger:12,createdAt:1,applicationOrder:0,feeBump:false,
  latestLedger:12,latestLedgerCloseTime:1,oldestLedger:1,oldestLedgerCloseTime:1,
  envelopeXdr:other.signed.toXDR(),
  resultXdr:new xdr.TransactionResult({feeCharged:xdr.Int64.fromString('100'),result:xdr.TransactionResultResult.txFailed([]),ext:new xdr.TransactionResultExt(0)}).toXDR('base64'),
  resultMetaXdr:new xdr.TransactionMeta(0,[]).toXDR('base64'),
 });
 const response=await server.getTransaction(hash);
 expect(response.txHash).toBe(hash);
 if(response.status==='NOT_FOUND')throw new Error('fixture must contain an envelope');
 expect(TransactionBuilder.fromXDR(response.envelopeXdr,scope.network).hash().toString('hex')).toBe(other.hash);
 await reconcileTransactionAttempts(server,scope);
 expect(unresolvedTransaction(draft)?.hash).toBe(hash);
 expect(listTransactionAttempts(scope)[0].status).toBe('unknown');
 expect(raw).toHaveBeenCalledTimes(2);
});
