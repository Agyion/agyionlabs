import { Account, Asset, Keypair, Networks, Operation, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activeSigner, clearTestSecret, defaultSigner, registerSigner, saveTestSecret, storedTestSigner, TestSecretWallet, unregisterSigner } from '../app/lib/wallet';

const key = Keypair.random();
function payment(network = Networks.TESTNET) {
  return new TransactionBuilder(new Account(key.publicKey(), '1'), { fee: '100', networkPassphrase: network })
    .addOperation(Operation.payment({ destination: Keypair.random().publicKey(), asset: Asset.native(), amount: '1' })).setTimeout(60).build();
}

beforeEach(() => {
  const values = new Map<string, string>();
  const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); }, clear: () => values.clear() };
  vi.stubGlobal('window', { localStorage: storage }); vi.stubGlobal('localStorage', storage);
  unregisterSigner(); clearTestSecret(); localStorage.clear();
});
afterEach(() => { unregisterSigner(); clearTestSecret(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('test wallet custody', () => {
  it('keeps an explicitly supplied test secret in memory without persistent storage', () => {
    const signer = saveTestSecret(key.secret());
    expect(defaultSigner()).toBe(signer);
    expect(localStorage.getItem('agyion.testSecret.v1')).toBeNull();
  });
  it('removes a legacy saved secret without silently restoring it', () => {
    localStorage.setItem('agyion.testSecret.v1', key.secret());
    expect(storedTestSigner()).toBeNull();
    expect(defaultSigner()).toBeNull();
    expect(localStorage.getItem('agyion.testSecret.v1')).toBeNull();
  });
  it('rejects signing on the public network', async () => {
    const signer = new TestSecretWallet(key.secret());
    await expect(signer.signTransaction(payment(Networks.PUBLIC).toXDR(), Networks.PUBLIC)).rejects.toThrow(/testnet/i);
  });
  it('still signs a local fixture on testnet', async () => {
    const signer = new TestSecretWallet(key.secret());
    const signed = new Transaction(await signer.signTransaction(payment().toXDR(), Networks.TESTNET), Networks.TESTNET);
    expect(key.verify(signed.hash(), signed.signatures[0].signature())).toBe(true);
  });
  it('revokes an old test signer when switching to another wallet', async () => {
    const old = saveTestSecret(key.secret());
    const external = { address: async () => key.publicKey(), signTransaction: async (xdr: string) => xdr };
    registerSigner(external);
    expect(activeSigner()).toBe(external);
    expect(storedTestSigner()).toBeNull();
    await expect(old.signTransaction(payment().toXDR(), Networks.TESTNET)).rejects.toThrow(/disconnect|session|active/i);
    unregisterSigner();
    expect(defaultSigner()).toBeNull();
  });
});
