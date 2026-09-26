// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { rpc } from '@stellar/stellar-sdk';
import { SorobanAgyionClient } from '../app/lib/hakClient';
import { listTransactionAttempts, reconcileTransactionAttempts } from '../app/lib/transactionReceipts';
const account="G"+"A".repeat(55);const contractId='CAVVTPBBNOCMDBC26CVOXKSU7B7MDK33TXQXTVUVKSJHSVKGLZTVJ5N5';
const scope={account,contractId,network:'Test SDF Network ; September 2015'};const hash='d'.repeat(64);
function create(send:()=>Promise<any>){
 const signer={address:async()=>account,signTransaction:vi.fn()};
 const client=new SorobanAgyionClient({rpcUrl:'https://example.com',contractId,networkPassphrase:scope.network,signer});
 const tx={signed:{hash:()=>Buffer.from(hash,'hex')},signAndSend:vi.fn(send)};
 (client as any).bindings=async()=>({protocol_version:async()=>({result:2}),claim:async()=>tx});return {client,tx};
}
beforeEach(()=>{vi.restoreAllMocks();localStorage.clear()});
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
 await reconcileTransactionAttempts({getTransaction:async()=>({status:'FAILED',ledger:12})},scope);
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
