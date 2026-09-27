import { Account, Keypair, Networks, StrKey, rpc, scValToNative, type Transaction } from '@stellar/stellar-sdk';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MockAgyionClient, SorobanAgyionClient } from '../app/lib/agyionClient';
import { podPublicKey, signPodCreation, signPodClaim } from '../app/lib/signers';
import { installRecoveryLocks } from './recovery-fixture';
const seed='37'.repeat(32), funder=Keypair.random().publicKey(), recipient=Keypair.random().publicKey();
const asset=StrKey.encodeContract(Buffer.alloc(32,3)), contractId=StrKey.encodeContract(Buffer.alloc(32,4));
const domain={contractId,networkPassphrase:Networks.TESTNET};
beforeEach(() => {
 const rows = new Map<string, string>();
 const localStorage = { get length() { return rows.size; }, key: (i: number) => [...rows.keys()][i] ?? null,
   getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => { rows.set(key, value); } };
 vi.stubGlobal('window', { localStorage, dispatchEvent: () => true });
 installRecoveryLocks();
});
afterEach(()=>vi.unstubAllGlobals());
it('actual generated bindings simulate only public key/proofs and recipient-bound signature, never the Pod seed',async()=>{
 const wallet=vi.fn();const send=vi.spyOn(rpc.Server.prototype,'sendTransaction').mockRejectedValue(new Error('No broadcast in fixture'));
 vi.spyOn(rpc.Server.prototype,'getAccount').mockResolvedValue(new Account(funder,'1'));
 const captured:{method:string,args:unknown[],wire:Buffer}[]=[];
 vi.spyOn(rpc.Server.prototype,'simulateTransaction').mockImplementation(async(transaction)=>{
   const tx=transaction as Transaction;const op=tx.operations[0];
   if(op.type!=='invokeHostFunction') throw new Error('Unexpected operation');
   const invocation=op.func.invokeContract();
   captured.push({method:Buffer.from(invocation.functionName()).toString(),args:invocation.args().map(scValToNative),wire:Buffer.from(tx.toXDR(),'base64')});
   throw new Error('Stopped at mocked simulation transport');
 });
 const c=new SorobanAgyionClient({...domain,rpcUrl:'https://fixture.invalid',signer:{address:async()=>funder,signTransaction:wallet}});
 vi.spyOn(c,'protocolReadiness').mockResolvedValue('ready');
 const pub=podPublicKey(seed),proof=signPodCreation(seed,funder,asset,7n,500,pub ? domain : undefined);
 const signature=signPodClaim(seed,42n,recipient,domain);
 await expect(c.create_pod(funder,asset,7n,500,pub,proof)).rejects.toThrow('Stopped at mocked simulation transport');
 await expect(c.claim_pod(42n,recipient,signature)).rejects.toThrow('Stopped at mocked simulation transport');
 expect(captured.map(c=>c.method)).toEqual(['create_pod','claim_pod']);
 expect(captured[0].args.slice(0,4)).toEqual([funder,asset,7n,500]);
 expect(Buffer.from(captured[0].args[4] as Uint8Array).toString('hex')).toBe(pub);
 expect(Buffer.from(captured[0].args[5] as Uint8Array).toString('hex')).toBe(proof);
 expect(captured[1].args.slice(0,2)).toEqual([42n,recipient]);
 expect(Buffer.from(captured[1].args[2] as Uint8Array).toString('hex')).toBe(signature);
 for(const {wire} of captured){expect(wire.includes(Buffer.from(seed,'hex'))).toBe(false);expect(wire.includes(Buffer.from(seed))).toBe(false);}
 expect(wallet).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled();
});
it('does not reinterpret legacy hash-locked mock Pods as V3 public keys',async()=>{
 const storage=new Map<string,string>();
 vi.stubGlobal('window',{localStorage:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)}});
 const c=new MockAgyionClient();await c.create_pod(funder,asset,7n,0,podPublicKey(seed),signPodCreation(seed,funder,asset,7n,0));
 const current=storage.get('agyion.mock.v3');expect(current).toBeTruthy();
 storage.set('agyion.mock.v1',current!);storage.delete('agyion.mock.v3');
 expect(await new MockAgyionClient().listPods()).toEqual([]);
});
