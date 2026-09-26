import { Account, Keypair, Transaction } from '@stellar/stellar-sdk';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const transport = vi.hoisted(() => ({ loadAccount: vi.fn(), submitTransaction: vi.fn(), lookup: vi.fn() }));
vi.mock('@stellar/stellar-sdk', async original => ({ ...await original<typeof import('@stellar/stellar-sdk')>(), Horizon: { Server: class {
  loadAccount = transport.loadAccount; submitTransaction = transport.submitTransaction;
  transactions() { return { transaction: (hash: string) => ({ call: () => transport.lookup(hash) }) }; }
} } }));
import { installRecoveryLocks } from './recovery-fixture';
import { listAnchorPayments, rememberAnchorPayment, updateAnchorPayment } from '../app/lib/anchorPayments';
import * as ops from '../app/lib/accountOps';
import { unregisterSigner } from '../app/lib/wallet';
import { CONFIG } from '../app/lib/config';
const owner = Keypair.random(), anchor = Keypair.random();
const sign = vi.fn(async (xdr: string, network: string) => { const tx = new Transaction(xdr, network); tx.sign(owner); return tx.toXDR(); });
const signer = { address: async () => owner.publicKey(), signTransaction: sign };
const pay = () => ops.sendAnchorPayment(signer, owner.publicKey(), anchor.publicKey(), '5', 'text', 'withdrawal-memo', 'withdrawal-17');
const records = () => listAnchorPayments(owner.publicKey());
beforeEach(() => {
  const values = new Map<string,string>();
  const storage = { getItem: (key:string) => values.get(key) ?? null, setItem: (key:string,value:string) => values.set(key,value), removeItem: (key:string) => values.delete(key), clear: () => values.clear(), key:(index:number)=>[...values.keys()][index]??null, get length(){return values.size} };
  vi.stubGlobal('localStorage', storage); vi.stubGlobal('window', { localStorage: storage, dispatchEvent: vi.fn() });
  installRecoveryLocks();localStorage.clear(); unregisterSigner(); sign.mockClear();
  transport.loadAccount.mockReset().mockImplementation(async () => new Account(owner.publicKey(), String(transport.submitTransaction.mock.calls.length + 1)));
  transport.submitTransaction.mockReset().mockImplementation(async (tx: Transaction) => ({ hash: tx.hash().toString('hex'), successful: true, ledger: 123 }));
  transport.lookup.mockReset();
});
afterEach(() => vi.unstubAllGlobals());
it('persists the local hash before transport and blocks another payment after a lost response', async () => {
  let localHash = '';
  transport.submitTransaction.mockImplementation(async (tx: Transaction) => {
    localHash = tx.hash().toString('hex');
    expect(records()).toMatchObject([{hash:localHash,status:'pending'}]);
    throw new Error('response lost after acceptance');
  });
  await expect(pay()).rejects.toThrow(/outcome|confirm|unknown/i);
  expect(records()).toMatchObject([{hash: localHash, status: 'unknown', withdrawalId: 'withdrawal-17', amount: '5', account: owner.publicKey()}]);
  await expect(pay()).rejects.toThrow(localHash);
  expect(transport.submitTransaction).toHaveBeenCalledTimes(1); expect(sign).toHaveBeenCalledTimes(1);
  expect(Array.from({length:localStorage.length},(_,i)=>localStorage.getItem(localStorage.key(i)!)).join('')).not.toMatch(/signedXdr|secret|IBAN|envelope/i);
});
it('prevents a second payment for an already confirmed withdrawal even after a module reload', async () => {
  const hash = await pay();
  vi.resetModules(); const reloaded = await import('../app/lib/accountOps');
  await expect(reloaded.sendAnchorPayment(signer, owner.publicKey(), anchor.publicKey(), '5', 'text', 'withdrawal-memo', 'withdrawal-17')).rejects.toThrow(/already.*confirmed/i);
  expect(records()).toMatchObject([{hash, status: 'success'}]); expect(transport.submitTransaction).toHaveBeenCalledTimes(1);
});
it('does not broadcast or record an unknown outcome when the wallet changes before submission', async () => {
  sign.mockImplementationOnce(async (xdr, network) => { const tx = new Transaction(xdr, network); tx.sign(owner); unregisterSigner(); return tx.toXDR(); });
  await expect(pay()).rejects.toThrow(/session changed/i);
  expect(records()).toEqual([]); expect(transport.submitTransaction).not.toHaveBeenCalled();
});
it('refuses broadcast if recovery cannot be durably saved', async () => {
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  await expect(pay()).rejects.toThrow(/storage|recovery/i); expect(transport.submitTransaction).not.toHaveBeenCalled();
});
it('reconciles only the known hash after reload and never treats NOT_FOUND as permission to repay', async () => {
  transport.submitTransaction.mockRejectedValueOnce(new Error('lost response'));
  await expect(pay()).rejects.toThrow(/outcome/); const hash=records()[0].hash;
  vi.resetModules();const reloaded=await import('../app/lib/accountOps');
  transport.lookup.mockRejectedValueOnce({response:{status:404}});
  await reloaded.reconcileAnchorPayments(owner.publicKey());
  await expect(reloaded.sendAnchorPayment(signer,owner.publicKey(),anchor.publicKey(),'5','text','withdrawal-memo','withdrawal-17')).rejects.toThrow(hash);
  transport.lookup.mockResolvedValueOnce({hash,successful:true,ledger_attr:125});
  await reloaded.reconcileAnchorPayments(owner.publicKey());
  expect(records()).toMatchObject([{hash,status:'success',ledger:125}]);
  expect(transport.lookup.mock.calls).toEqual([[hash],[hash]]);expect(transport.submitTransaction).toHaveBeenCalledTimes(1);
});
it('releases a payment only after matching-hash failed chain evidence',async()=>{
  transport.submitTransaction.mockRejectedValueOnce(new Error('lost response'));
  await expect(pay()).rejects.toThrow(/outcome/);const hash=records()[0].hash;
  transport.lookup.mockResolvedValueOnce({hash:'0'.repeat(64),successful:false,ledger_attr:125});
  await ops.reconcileAnchorPayments(owner.publicKey());expect(records()[0].status).toBe('unknown');
  transport.lookup.mockResolvedValueOnce({hash,successful:false,ledger_attr:125});
  await ops.reconcileAnchorPayments(owner.publicKey());expect(records()[0].status).toBe('failed');
  await pay();expect(transport.submitTransaction).toHaveBeenCalledTimes(2);
});
it('does not query or expose another account payment during reconciliation',async()=>{
  transport.submitTransaction.mockRejectedValueOnce(new Error('lost response'));
  await expect(pay()).rejects.toThrow(/outcome/);
  await ops.reconcileAnchorPayments(anchor.publicKey());expect(transport.lookup).not.toHaveBeenCalled();
});
it('holds a same-intent guard while a wallet approval is still pending',async()=>{
  let approve!:()=>void;
  sign.mockImplementationOnce(async(xdr,network)=>{await new Promise<void>(resolve=>{approve=resolve});const tx=new Transaction(xdr,network);tx.sign(owner);return tx.toXDR()});
  const first=pay();await vi.waitFor(()=>expect(approve).toBeTypeOf('function'));
  await expect(pay()).rejects.toThrow(/already awaiting/);approve();await first;
  expect(sign).toHaveBeenCalledTimes(1);expect(transport.submitTransaction).toHaveBeenCalledTimes(1);
});
it('rejects unreadable or malformed existing recovery instead of silently allowing a new payment',async()=>{
  localStorage.setItem('agyion.anchor-payments.v1','[{"status":"success"}]');
  await expect(pay()).rejects.toThrow(/recovery storage/i);expect(sign).not.toHaveBeenCalled();
});
it('does not lose a different withdrawal if another tab writes during persistence',()=>{
 const intent={account:owner.publicKey(),network:CONFIG.networkPassphrase,anchor:new URL(CONFIG.anchorUrl).origin,withdrawalId:'one',destination:anchor.publicKey(),amount:'5',assetCode:CONFIG.assetCode,assetIssuer:CONFIG.assetAddress,memoType:'text',memo:'memo'};
 const set=localStorage.setItem.bind(localStorage);
 vi.spyOn(localStorage,'setItem').mockImplementationOnce((key,value)=>{rememberAnchorPayment({...intent,withdrawalId:'two'},'b'.repeat(64));set(key,value)});
 rememberAnchorPayment(intent,'a'.repeat(64));
 expect(records().map(p=>p.withdrawalId).sort()).toEqual(['one','two']);
 const original=localStorage.setItem.bind(localStorage);
 vi.spyOn(localStorage,'setItem').mockImplementationOnce((key,value)=>{updateAnchorPayment('a'.repeat(64),'success',123);original(key,value)});
 updateAnchorPayment('a'.repeat(64),'unknown',null);
 expect(records().find(p=>p.hash==='a'.repeat(64))).toMatchObject({status:'success',ledger:123});
 expect(records().find(p=>p.hash==='b'.repeat(64))?.status).toBe('pending');
});
it('fails closed before signing when cross-tab coordination is unavailable',async()=>{
 vi.stubGlobal('navigator',{});
 await expect(pay()).rejects.toThrow(/Web Locks/);expect(sign).not.toHaveBeenCalled();expect(transport.submitTransaction).not.toHaveBeenCalled();
});
