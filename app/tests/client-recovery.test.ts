// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { rpc } from '@stellar/stellar-sdk';
import { SorobanAgyionClient } from '../app/lib/agyionClient';
import { listTransactionAttempts, reconcileTransactionAttempts, unresolvedTransaction } from '../app/lib/transactionReceipts';
import { unregisterSigner } from '../app/lib/wallet';
import { WalletSignatureRejectedError } from '../app/lib/wallet-errors';
import { humanizeError } from '../app/lib/errors';
import { installRecoveryLocks, recoveryTransactionFixture } from './recovery-fixture';
afterEach(()=>vi.unstubAllGlobals());
const account="G"+"A".repeat(55);const contractId='CAVVTPBBNOCMDBC26CVOXKSU7B7MDK33TXQXTVUVKSJHSVKGLZTVJ5N5';
const scope={account,contractId,network:'Test SDF Network ; September 2015'};
const {hash,envelopeXdr}=recoveryTransactionFixture('client-recovery');
function create(send:()=>Promise<any>){
 const signer={address:async()=>account,signTransaction:vi.fn()};
 const client=new SorobanAgyionClient({rpcUrl:'https://example.com',contractId,networkPassphrase:scope.network,signer});
 const tx={signed:{hash:()=>Buffer.from(hash,'hex')},signAndSend:vi.fn(send)};
 (client as any).bindings=async()=>({protocol_version:async()=>({result:3}),claim:async()=>tx,
   create_fade:async()=>tx,create_pod:async()=>tx,create_trigger:async()=>tx,create_mandate:async()=>tx});return {client,tx};
}
beforeEach(()=>{vi.restoreAllMocks();localStorage.clear();installRecoveryLocks()});
it('saves hash and intent before broadcast, and an unknown outcome blocks another submission',async()=>{
 let c:ReturnType<typeof create>;
 const transport=vi.spyOn(rpc.Server.prototype,'sendTransaction').mockImplementation(async()=>{
  expect(listTransactionAttempts(scope)[0]).toMatchObject({hash,action:'claim',refId:'7',status:'pending'});throw new Error('lost response');
 });
 c=create(async()=>{await (c.client as any).server.sendTransaction(c.tx.signed)});
 await expect(c.client.claim(7n,account)).rejects.toThrow(hash);
 const next=create(async()=>{throw new Error('must not send')});
 await expect(next.client.claim(7n,account)).rejects.toThrow(/unresolved/);
 expect(next.tx.signAndSend).not.toHaveBeenCalled();expect(transport).toHaveBeenCalledOnce();
 await reconcileTransactionAttempts({getTransaction:async()=>({txHash:hash,envelopeXdr,status:'FAILED',ledger:12})},scope);
 await expect(next.client.claim(7n,account)).rejects.toThrow();expect(next.tx.signAndSend).toHaveBeenCalledOnce();
});
it('does not broadcast if durable recovery storage is blocked',async()=>{
 const transport=vi.spyOn(rpc.Server.prototype,'sendTransaction').mockResolvedValue({status:'PENDING',hash} as any);
 let c:ReturnType<typeof create>;c=create(async()=>{await (c.client as any).server.sendTransaction(c.tx.signed)});
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('disabled')});
 await expect(c.client.claim(7n,account)).rejects.toThrow(/storage/);expect(transport).not.toHaveBeenCalled();
});
it('does not manufacture a pending transaction when the wallet declines before signing',async()=>{
 const c=create(async()=>{throw new Error('User rejected')});delete (c.tx as any).signed;
 await expect(c.client.claim(7n,account)).rejects.toThrow('User rejected');expect(listTransactionAttempts()).toEqual([]);
});
it('does not manufacture an unknown transaction when a signed request is locally refused before transport',async()=>{
 const transport=vi.spyOn(rpc.Server.prototype,'sendTransaction').mockResolvedValue({status:'PENDING',hash} as any);
 let c:ReturnType<typeof create>;c=create(async()=>{
   unregisterSigner();return (c.client as any).server.sendTransaction(c.tx.signed);
 });
 await expect(c.client.claim(7n,account)).rejects.toThrow(/session changed/i);
 expect(transport).not.toHaveBeenCalled();expect(listTransactionAttempts(scope)).toEqual([]);
});
it('blocks signing when another tab owns the same intent, or Web Locks are unavailable',async()=>{
 let finish!:(result:any)=>void;const c=create(()=>new Promise(resolve=>{finish=resolve}));
 const first=c.client.claim(7n,account);await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));
 const other=create(async()=>{throw new Error('must not sign')});
 await expect(other.client.claim(7n,account)).rejects.toThrow(/another tab/);expect(other.tx.signAndSend).not.toHaveBeenCalled();
 finish({sendTransactionResponse:{hash},getTransactionResponse:{txHash:hash,envelopeXdr,status:'SUCCESS',ledger:4},result:{unwrap:()=>undefined}});await first;
 vi.stubGlobal('navigator',{});
 await expect(other.client.claim(8n,account)).rejects.toThrow(/Web Locks/);expect(other.tx.signAndSend).not.toHaveBeenCalled();
});
it('rechecks another pending hash after a slow signature, before transport',async()=>{
 const {rememberTransactionAttempt}=await import('../app/lib/transactionReceipts');
 const transport=vi.spyOn(rpc.Server.prototype,'sendTransaction').mockResolvedValue({status:'PENDING',hash} as any);
 let c:ReturnType<typeof create>;c=create(async()=>{
   rememberTransactionAttempt({...scope,hash:'e'.repeat(64),action:'claim',refId:'7'});
   return (c.client as any).server.sendTransaction(c.tx.signed);
 });
 await expect(c.client.claim(7n,account)).rejects.toThrow('e'.repeat(64));
 expect(transport).not.toHaveBeenCalled();expect(listTransactionAttempts(scope).map(a=>a.hash)).toEqual(['e'.repeat(64)]);
});
it.each([
 {status:'PENDING'},
 {status:'PENDING',hash:'f'.repeat(64)},
 {status:'ERROR',hash},
 {status:'ERROR',hash:'f'.repeat(64)},
])('keeps the actual hash unresolved after an invalid or rejected send response',async response=>{
 const transport=vi.spyOn(rpc.Server.prototype,'sendTransaction').mockResolvedValue(response as any);
 let c:ReturnType<typeof create>;const unwrap=vi.fn(()=>undefined);
 c=create(async()=>{
  const sendTransactionResponse=await (c.client as any).server.sendTransaction(c.tx.signed);
  if(sendTransactionResponse.status!=='PENDING')throw new Error('SDK send rejected');
  return {sendTransactionResponse,getTransactionResponse:{txHash:hash,envelopeXdr,status:'SUCCESS',ledger:12},result:{unwrap}};
 });
 await expect(c.client.claim(7n,account)).rejects.toThrow(hash);
 expect(listTransactionAttempts(scope)).toMatchObject([{hash,status:'unknown'}]);
 expect(listTransactionAttempts(scope)).toHaveLength(1);expect(unwrap).not.toHaveBeenCalled();
 const retry=create(async()=>{throw new Error('must not send')});
 await expect(retry.client.claim(7n,account)).rejects.toThrow(/unresolved/);
 expect(retry.tx.signAndSend).not.toHaveBeenCalled();expect(transport).toHaveBeenCalledTimes(1);
});
it.each([
 {sendTransactionResponse:undefined,getTransactionResponse:{txHash:hash,envelopeXdr,status:'SUCCESS',ledger:12}},
 {sendTransactionResponse:{hash:'f'.repeat(64)},getTransactionResponse:{txHash:hash,envelopeXdr,status:'SUCCESS',ledger:12}},
 {sendTransactionResponse:{hash},getTransactionResponse:{status:'SUCCESS',ledger:12}},
 {sendTransactionResponse:{hash},getTransactionResponse:{txHash:'f'.repeat(64),status:'SUCCESS',ledger:12}},
 {sendTransactionResponse:{hash},getTransactionResponse:{txHash:'f'.repeat(64),status:'FAILED',ledger:12}},
 {sendTransactionResponse:{hash},getTransactionResponse:{txHash:hash,envelopeXdr,status:'SUCCESS'}},
 {sendTransactionResponse:{hash},getTransactionResponse:{txHash:hash,envelopeXdr,status:'FAILED'}},
 {sendTransactionResponse:{hash},getTransactionResponse:{txHash:hash,envelopeXdr,status:'SUCCESS',ledger:0}},
 {sendTransactionResponse:{hash},getTransactionResponse:{txHash:hash,envelopeXdr,status:'FAILED',ledger:1.5}},
])('does not substitute RPC hashes or accept malformed confirmation evidence',async response=>{
 const unwrap=vi.fn(()=>undefined);const c=create(async()=>({...response,result:{unwrap}}));
 await expect(c.client.claim(7n,account)).rejects.toThrow(hash);
 expect(listTransactionAttempts(scope)).toHaveLength(1);
 expect(listTransactionAttempts(scope)[0]).toMatchObject({hash,status:'unknown',ledger:null});
 expect(unwrap).not.toHaveBeenCalled();
 const retry=create(async()=>{throw new Error('must not send')});
 await expect(retry.client.claim(7n,account)).rejects.toThrow(/unresolved/);
 expect(retry.tx.signAndSend).not.toHaveBeenCalled();
});
it('only releases a rejected send after matching on-chain FAILED evidence',async()=>{
 vi.spyOn(rpc.Server.prototype,'sendTransaction').mockResolvedValue({hash,status:'ERROR'} as any);
 let c:ReturnType<typeof create>;c=create(async()=>{await (c.client as any).server.sendTransaction(c.tx.signed);throw new Error('send error')});
 await expect(c.client.claim(7n,account)).rejects.toThrow(hash);
 expect(listTransactionAttempts(scope)[0].status).toBe('unknown');
 await reconcileTransactionAttempts({getTransaction:async()=>({txHash:hash,envelopeXdr,status:'NOT_FOUND'})},scope);
 expect(listTransactionAttempts(scope)[0].status).toBe('unknown');
 await reconcileTransactionAttempts({getTransaction:async()=>({txHash:hash,envelopeXdr,status:'FAILED',ledger:12})},scope);
 expect(listTransactionAttempts(scope)[0].status).toBe('failed');
 const retry=create(async()=>{throw new Error('wallet declined')});delete (retry.tx as any).signed;
 await expect(retry.client.claim(7n,account)).rejects.toThrow('wallet declined');
 expect(retry.tx.signAndSend).toHaveBeenCalledTimes(1);
});
it('accepts matching terminal failure without reading a success result',async()=>{
 const unwrap=vi.fn(()=>undefined);const c=create(async()=>({sendTransactionResponse:{hash},getTransactionResponse:{txHash:hash,envelopeXdr,status:'FAILED',ledger:12},result:{unwrap}}));
 await expect(c.client.claim(7n,account)).rejects.toThrow(hash);
 expect(listTransactionAttempts(scope)[0]).toMatchObject({hash,status:'failed',ledger:12});expect(unwrap).not.toHaveBeenCalled();
});
it('keeps a lost submission blocked through missing, mismatched and invalid recovery evidence',async()=>{
 const transport=vi.spyOn(rpc.Server.prototype,'sendTransaction').mockRejectedValue(new Error('response lost after send'));
 let c:ReturnType<typeof create>;c=create(async()=>{await (c.client as any).server.sendTransaction(c.tx.signed)});
 await expect(c.client.claim(7n,account)).rejects.toThrow(hash);
 const retry=create(async()=>{throw new Error('must not sign')});
 for(const response of [
  {status:'FAILED',ledger:12},
  {txHash:'f'.repeat(64),status:'FAILED',ledger:12},
  {txHash:hash,envelopeXdr,status:'FAILED'},
  {txHash:hash,envelopeXdr,status:'FAILED',ledger:0},
  {txHash:hash,envelopeXdr,status:'SUCCESS',ledger:Number.MAX_SAFE_INTEGER+1},
 ]){
  await reconcileTransactionAttempts({getTransaction:async()=>response},scope);
  expect(listTransactionAttempts(scope)[0]).toMatchObject({hash,status:'unknown',ledger:null});
  await expect(retry.client.claim(7n,account)).rejects.toThrow(/unresolved/);
 }
 expect(retry.tx.signAndSend).not.toHaveBeenCalled();expect(transport).toHaveBeenCalledOnce();
});
it.each([undefined,{} as any,recoveryTransactionFixture('other-envelope').envelopeXdr])('does not accept a request-echo hash without the matching returned envelope',async returnedEnvelope=>{
 const unwrap=vi.fn(()=>undefined);const c=create(async()=>({sendTransactionResponse:{hash},getTransactionResponse:{txHash:hash,envelopeXdr:returnedEnvelope,status:'SUCCESS',ledger:12},result:{unwrap}}));
 await expect(c.client.claim(7n,account)).rejects.toThrow(hash);
 expect(listTransactionAttempts(scope)[0]).toMatchObject({hash,status:'unknown',ledger:null});
 expect(unwrap).not.toHaveBeenCalled();
});
it('does not claim nothing was sent when outcome storage fails after broadcast',async()=>{
 const original=Storage.prototype.setItem;
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,key,value){
  if(key.startsWith('agyion.transactions.v2:evidence:'))throw new Error('quota');
  original.call(this,key,value);
 });
 const transport=vi.spyOn(rpc.Server.prototype,'sendTransaction').mockResolvedValue({hash,status:'PENDING'} as any);
 let c:ReturnType<typeof create>;c=create(async()=>({
  sendTransactionResponse:await (c.client as any).server.sendTransaction(c.tx.signed),
  getTransactionResponse:{txHash:hash,envelopeXdr,status:'SUCCESS',ledger:12},result:{unwrap:()=>undefined},
 }));
 await expect(c.client.claim(7n,account)).rejects.toThrow(/may have been sent/i);
 expect(transport).toHaveBeenCalledOnce();
 expect(listTransactionAttempts(scope)[0]).toMatchObject({hash,status:'pending'});
 const retry=create(async()=>{throw new Error('must not send')});
 await expect(retry.client.claim(7n,account)).rejects.toThrow(/unresolved/);
 expect(retry.tx.signAndSend).not.toHaveBeenCalled();
});

const creations = [
 ['create_fade',(c:SorobanAgyionClient)=>c.create_fade(account,contractId,100n,10n,0n,1n,1n,20,10,'a'.repeat(64))],
 ['create_pod',(c:SorobanAgyionClient)=>c.create_pod(account,contractId,100n,20,'a'.repeat(64),'b'.repeat(128))],
 ['create_trigger',(c:SorobanAgyionClient)=>c.create_trigger(account,contractId,100n,account,'a'.repeat(64),20)],
 ['create_mandate',(c:SorobanAgyionClient)=>c.create_mandate(account,'a'.repeat(64),100n,200n,20)],
] as const;
it.each(creations)('keeps a confirmed %s duplicate-blocking when the SDK cannot decode its record ID',async(action,invoke)=>{
 const c=create(async()=>({sendTransactionResponse:{hash},getTransactionResponse:{txHash:hash,envelopeXdr,status:'SUCCESS',ledger:12},
   get result(){throw new Error('Transaction failed! Cannot parse result.')}}));
 let message='';try{await invoke(c.client)}catch(error){message=(error as Error).message}
 expect(message).toMatch(/confirmed/i);expect(message).toContain(hash);expect(message).toMatch(/record ID|recovery/i);
 expect(listTransactionAttempts(scope)[0]).toMatchObject({hash,status:'success',ledger:12,refId:null});
 expect(unresolvedTransaction({...scope,action,refId:null})?.hash).toBe(hash);
 const retry=create(async()=>{throw new Error('must not sign')});
 await expect(invoke(retry.client)).rejects.toThrow(/confirmed/i);
 expect(retry.tx.signAndSend).not.toHaveBeenCalled();
});
it.each([undefined,null,'17',17,0n,-1n,0x1_0000_0000_0000_0000n])('preserves confirmed creation and blocks retry for invalid decoded ID %s',async value=>{
 const c=create(async()=>({sendTransactionResponse:{hash},getTransactionResponse:{txHash:hash,envelopeXdr,status:'SUCCESS',ledger:12},result:{unwrap:()=>value}}));
 await expect(creations[1][1](c.client)).rejects.toThrow(/confirmed/i);
 expect(listTransactionAttempts(scope)[0]).toMatchObject({status:'success',ledger:12,refId:null});
 expect(unresolvedTransaction({...scope,action:'create_pod',refId:null})?.hash).toBe(hash);
});
it.each([1n,0xffff_ffff_ffff_ffffn])('accepts the confirmed positive u64 creation ID %s',async id=>{
 const c=create(async()=>({sendTransactionResponse:{hash},getTransactionResponse:{txHash:hash,envelopeXdr,status:'SUCCESS',ledger:12},result:{unwrap:()=>id}}));
 expect(await creations[1][1](c.client)).toBe(id);
 expect(listTransactionAttempts(scope)[0]).toMatchObject({status:'success',ledger:12,refId:String(id)});
 expect(unresolvedTransaction({...scope,action:'create_pod',refId:null})).toBeUndefined();
});
it('releases a definitively failed creation and leaves ordinary void successes valid',async()=>{
 const failed=create(async()=>({sendTransactionResponse:{hash},getTransactionResponse:{txHash:hash,envelopeXdr,status:'FAILED',ledger:12},result:{unwrap:()=>{throw new Error('no result')}}}));
 await expect(creations[1][1](failed.client)).rejects.toThrow(/failed on the network/);
 expect(unresolvedTransaction({...scope,action:'create_pod',refId:null})).toBeUndefined();
 const retry=create(async()=>{throw new Error('new approval declined')});delete (retry.tx as any).signed;
 await expect(creations[1][1](retry.client)).rejects.toThrow('new approval declined');
 expect(retry.tx.signAndSend).toHaveBeenCalledOnce();
 localStorage.clear();
 const claim=create(async()=>({sendTransactionResponse:{hash},getTransactionResponse:{txHash:hash,envelopeXdr,status:'SUCCESS',ledger:12},result:{unwrap:()=>undefined}}));
 await expect(claim.client.claim(7n,account)).resolves.toBeUndefined();
 expect(listTransactionAttempts(scope)[0]).toMatchObject({action:'claim',status:'success',refId:'7'});
});

it('keeps a signing decline separate from a cancellation-shaped error after broadcast',async()=>{
 const declined=new WalletSignatureRejectedError();
 const before=create(async()=>{throw declined;});delete (before.tx as any).signed;
 await expect(before.client.claim(7n,account)).rejects.toBe(declined);
 expect(humanizeError(declined)).toMatch(/declined.*wallet/i);expect(listTransactionAttempts()).toEqual([]);
 const transport=vi.spyOn(rpc.Server.prototype,'sendTransaction').mockRejectedValue(declined);
 let after:ReturnType<typeof create>;after=create(async()=>{await (after.client as any).server.sendTransaction(after.tx.signed);});
 const error=await after.client.claim(7n,account).catch(error=>error);
 expect(humanizeError(error)).toContain(hash);expect(humanizeError(error)).not.toMatch(/not submitted|nothing was sent|declined.*wallet/i);
 expect(listTransactionAttempts(scope)).toMatchObject([{hash,status:'unknown'}]);
 await expect(after.client.claim(7n,account)).rejects.toThrow(/unresolved/);expect(transport).toHaveBeenCalledOnce();
});
