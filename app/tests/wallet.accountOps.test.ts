import { Account, Keypair, Networks, Transaction, TransactionBuilder, Operation, Asset } from '@stellar/stellar-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const horizon = vi.hoisted(() => ({ loadAccount: vi.fn(), submitTransaction: vi.fn() }));
vi.mock('@stellar/stellar-sdk', async (original) => ({ ...await original<typeof import('@stellar/stellar-sdk')>(), Horizon: { Server: class { loadAccount = horizon.loadAccount; submitTransaction = horizon.submitTransaction; } } }));
import { createAssetTrustline, friendbotFund } from '../app/lib/accountOps';
import { unregisterSigner } from '../app/lib/wallet';

const owner = Keypair.random(); const other = Keypair.random();
beforeEach(() => { unregisterSigner(); horizon.loadAccount.mockReset().mockResolvedValue(new Account(owner.publicKey(), '1')); horizon.submitTransaction.mockReset().mockResolvedValue({ hash: 'fixture-hash' }); });
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
    const signer = { address: async () => owner.publicKey(), signTransaction: async (xdr: string, network: string) => { const tx = new Transaction(xdr, network); tx.sign(owner); return tx.toXDR(); } };
    expect(await createAssetTrustline(signer, owner.publicKey())).toBe('fixture-hash');
  });
  it('does not submit if the wallet disconnects while awaiting its signature', async () => {
    const signer = { address: async () => owner.publicKey(), signTransaction: async (xdr: string, network: string) => { const tx = new Transaction(xdr, network); tx.sign(owner); unregisterSigner(); return tx.toXDR(); } };
    await expect(createAssetTrustline(signer, owner.publicKey())).rejects.toThrow(/session|disconnect|changed/i);
    expect(horizon.submitTransaction).not.toHaveBeenCalled();
  });
});
