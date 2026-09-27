import {afterEach,describe,expect,it} from 'vitest';
import {Account,Keypair,Networks,Operation,Transaction,TransactionBuilder} from '@stellar/stellar-sdk';
import {registerSigner,unregisterSigner} from '../app/lib/wallet';
import {bindPrivateWallet} from '../app/lib/private/wallet-session';

const key=Keypair.fromRawEd25519Seed(Buffer.alloc(32,98));
const raw=()=>new TransactionBuilder(new Account(key.publicKey(),'100'),{fee:'100',networkPassphrase:Networks.TESTNET}).addOperation(Operation.manageData({name:'private-wallet-test',value:'local-only'})).setTimeout(0).build();
const signer=()=>({address:async()=>key.publicKey(),signTransaction:async(value:string,network:string)=>{const tx=TransactionBuilder.fromXDR(value,network) as Transaction;tx.sign(key);return tx.toXDR()}});
afterEach(()=>unregisterSigner());
describe('private wallet session binding',()=>{
 it('binds the actual source and validates a genuine SDK signature without broadcast',async()=>{
  registerSigner(signer());const bound=await bindPrivateWallet(()=>{}),request=raw();
  expect(bound.account).toBe(key.publicKey());expect(bound.wallet.session().networkPassphrase).toBe(Networks.TESTNET);
  const signed=TransactionBuilder.fromXDR(await bound.wallet.signTransaction(request.toXDR(),Networks.TESTNET,key.publicKey()),Networks.TESTNET) as Transaction;
  expect(signed.hash().equals(request.hash())).toBe(true);expect(key.verify(signed.hash(),signed.signatures[0].signature())).toBe(true);
 });
 it('disconnect/reconnect to the same address invalidates the old authority',async()=>{
  registerSigner(signer());const bound=await bindPrivateWallet(()=>{});unregisterSigner();registerSigner(signer());
  expect(()=>bound.wallet.session()).toThrow();await expect(bound.wallet.signTransaction(raw().toXDR(),Networks.TESTNET,key.publicKey())).rejects.toThrow();
 });
 it('asynchronous account discovery cannot survive replacement',async()=>{
  const current=signer();current.address=async()=>{registerSigner(signer());return key.publicKey()};registerSigner(current);
  await expect(bindPrivateWallet(()=>{})).rejects.toThrow('WALLET_SESSION_CHANGED');
 });
 it('changed account, unsigned payload, altered transaction and vault lock reject',async()=>{
  for(const variant of ['account','unsigned','altered','locked'] as const){const current=signer();let unlocked=true;registerSigner(current);
   const bound=await bindPrivateWallet(()=>{if(!unlocked)throw Error('VAULT_LOCKED')});
   if(variant==='account')current.address=async()=>Keypair.random().publicKey();
   if(variant==='unsigned')current.signTransaction=async v=>v;
   if(variant==='altered')current.signTransaction=async v=>{const tx=TransactionBuilder.cloneFrom(TransactionBuilder.fromXDR(v,Networks.TESTNET) as Transaction,{fee:'900'}).build();tx.sign(key);return tx.toXDR()};
   if(variant==='locked')unlocked=false;
   await expect(bound.wallet.signTransaction(raw().toXDR(),Networks.TESTNET,key.publicKey())).rejects.toThrow();
  }
 });
 it('lock after the signer await cannot return an authorized payload',async()=>{
  let unlocked=true;const current=signer(),original=current.signTransaction;current.signTransaction=async(...args)=>{const result=await original(...args);unlocked=false;return result};registerSigner(current);
  const bound=await bindPrivateWallet(()=>{if(!unlocked)throw Error('VAULT_LOCKED')});await expect(bound.wallet.signTransaction(raw().toXDR(),Networks.TESTNET,key.publicKey())).rejects.toThrow('VAULT_LOCKED');
 });
});
