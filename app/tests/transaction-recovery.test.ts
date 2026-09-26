// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { nativeToScVal } from '@stellar/stellar-sdk';
import { listTransactionAttempts, rememberTransactionAttempt, updateTransactionAttempt, unresolvedTransaction, reconcileTransactionAttempts } from '../app/lib/transactionReceipts';
const scope = { account:'G'+'A'.repeat(55), network:'Test SDF Network ; September 2015', contractId:'C'+'A'.repeat(55) };
const draft = { ...scope, action:'create_pod', refId:null, hash:'a'.repeat(64) };
beforeEach(()=>{vi.restoreAllMocks();localStorage.clear()});
it('persists only allowlisted public recovery metadata across a module reload',async()=>{
 rememberTransactionAttempt({...draft, preimage:'never-store-this', signedXdr:'never-store-xdr'} as any);
 vi.resetModules();const reloaded=await import('../app/lib/transactionReceipts');
 expect(reloaded.listTransactionAttempts(scope)).toHaveLength(1);
 expect(localStorage.getItem('agyion.transactions.v1')).not.toMatch(/never-store|preimage|signedXdr/);
 expect(reloaded.unresolvedTransaction({...scope,action:'create_pod',refId:null})?.hash).toBe(draft.hash);
 expect(reloaded.listTransactionAttempts({...scope,network:'other'})).toEqual([]);
});
it('not found and failed RPC retain uncertainty; only chain evidence resolves it',async()=>{
 rememberTransactionAttempt(draft);
 const server={getTransaction:vi.fn().mockResolvedValueOnce({status:'NOT_FOUND'}).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({status:'SUCCESS',ledger:42,returnValue:nativeToScVal(17n,{type:'u64'})})};
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
it('ignores malformed stored attempts and blocks broadcast persistence when storage fails',()=>{
 localStorage.setItem('agyion.transactions.v1','[{},null]');expect(listTransactionAttempts()).toEqual([]);
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota')});
 expect(()=>rememberTransactionAttempt(draft)).toThrow(/storage|save|recovery/i);
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
 finish({status:'SUCCESS'});await pending;
 expect(listTransactionAttempts(scope)[0]).toMatchObject({status:'success',refId:'17',ledger:42});
});
