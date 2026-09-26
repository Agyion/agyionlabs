import { Account, Keypair, Networks, Transaction, TransactionBuilder, Operation, Asset } from '@stellar/stellar-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const horizon = vi.hoisted(() => ({ loadAccount: vi.fn(), submitTransaction: vi.fn() }));
vi.mock('@stellar/stellar-sdk', async (original) => ({ ...await original<typeof import('@stellar/stellar-sdk')>(), Horizon: { Server: class { loadAccount = horizon.loadAccount; submitTransaction = horizon.submitTransaction; } } }));
import { createAssetTrustline, friendbotFund } from '../app/lib/accountOps';
import { unregisterSigner } from '../app/lib/wallet';

const owner = Keypair.random(); const other = Keypair.random();
beforeEach(() => {
  unregisterSigner();
  horizon.loadAccount.mockReset().mockImplementation(async()=>new Account(owner.publicKey(), '1'));
  horizon.submitTransaction.mockReset().mockImplementation(async(tx:Transaction)=>({hash:tx.hash().toString('hex'),successful:true,ledger:123}));
});
describe('classic transaction boundary', () => {
  it('does not report arbitrary friendbot bad requests as successful funding', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('invalid request', { status: 400 })));
    try { await expect(friendbotFund(owner.publicKey())).rejects.toThrow(/Friendbot|400/i); } finally { vi.unstubAllGlobals(); }
  });
  it('rejects a signer that does not own the requested source before submission', async () => {
    const signer = { address: async () => other.publicKey(), signTransaction: async (xdr: string) => xdr };
    await expect(createAssetTrustline(signer, owner.publicKey())).rejects.toThrow(/account|source|wallet/i);
    expect(horizon.submitTransaction).not.toHaveBeenCalled();
  });
  it('rejects a wallet replacing the requested trustline with a payment', async () => {
    const signer = { address: async () => owner.publicKey(), signTransaction: async () => {
      const tx = new TransactionBuilder(new Account(owner.publicKey(), '1'), { fee: '100', networkPassphrase: Networks.TESTNET })
        .addOperation(Operation.payment({ destination: other.publicKey(), asset: Asset.native(), amount: '10' })).setTimeout(60).build(); tx.sign(owner); return tx.toXDR();
    } };
    await expect(createAssetTrustline(signer, owner.publicKey())).rejects.toThrow(/different|match/i);
    expect(horizon.submitTransaction).not.toHaveBeenCalled();
  });
  it('submits an unchanged locally signed fixture to the mocked transport', async () => {
    let signedHash='';
    const signer = { address: async () => owner.publicKey(), signTransaction: async (xdr: string, network: string) => { const tx = new Transaction(xdr, network); tx.sign(owner); signedHash=tx.hash().toString('hex'); return tx.toXDR(); } };
    expect(await createAssetTrustline(signer, owner.publicKey())).toBe(signedHash);
    expect(signedHash).toMatch(/^[a-f0-9]{64}$/);
    expect(horizon.submitTransaction).toHaveBeenCalledOnce();
  });
  it('does not submit if the wallet disconnects while awaiting its signature', async () => {
    const signer = { address: async () => owner.publicKey(), signTransaction: async (xdr: string, network: string) => { const tx = new Transaction(xdr, network); tx.sign(owner); unregisterSigner(); return tx.toXDR(); } };
    await expect(createAssetTrustline(signer, owner.publicKey())).rejects.toThrow(/session|disconnect|changed/i);
    expect(horizon.submitTransaction).not.toHaveBeenCalled();
  });
  it.each([
    {hash:'f'.repeat(64)}, {hash:undefined}, {successful:false}, {successful:undefined}, {successful:'true'},
    {ledger:undefined}, {ledger:0}, {ledger:-1}, {ledger:1.5}, {ledger:NaN}, {ledger:Number.MAX_SAFE_INTEGER+1},
  ])('does not confirm a malformed trustline response %j, and preserves the signed hash for recovery',async malformed=>{
    let signedHash='';
    const signer={address:async()=>owner.publicKey(),signTransaction:vi.fn(async(xdr:string,network:string)=>{
      const tx=new Transaction(xdr,network);tx.sign(owner);signedHash=tx.hash().toString('hex');return tx.toXDR();
    })};
    horizon.submitTransaction.mockImplementationOnce(async(tx:Transaction)=>({hash:tx.hash().toString('hex'),successful:true,ledger:123,...malformed}));
    const error=await createAssetTrustline(signer,owner.publicKey()).then(()=>null,error=>error);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain(signedHash);
    expect(error.message).toMatch(/could not be confirmed/);
    expect(error.message).toMatch(/check.*before retrying|do not.*until.*check/i);
    expect(error.message).not.toMatch(/nothing.*sent|failed on-chain/i);
    expect(horizon.submitTransaction).toHaveBeenCalledOnce();
    expect(signer.signTransaction).toHaveBeenCalledOnce();
  });
  it('retains the local trustline hash after a lost submission response without signing or sending again',async()=>{
    let signedHash='';
    const signer={address:async()=>owner.publicKey(),signTransaction:vi.fn(async(xdr:string,network:string)=>{
      const tx=new Transaction(xdr,network);tx.sign(owner);signedHash=tx.hash().toString('hex');return tx.toXDR();
    })};
    horizon.submitTransaction.mockRejectedValueOnce(new Error('connection lost after acceptance'));
    const error=await createAssetTrustline(signer,owner.publicKey()).then(()=>null,error=>error);
    expect(error.message).toContain(signedHash);
    expect(error.message).toMatch(/could not be confirmed/);
    expect(error.message).toMatch(/check.*before retrying|do not.*until.*check/i);
    expect(horizon.submitTransaction).toHaveBeenCalledOnce();
    expect(signer.signTransaction).toHaveBeenCalledOnce();
  });
});
