import { Account, Asset, Keypair, Networks, Operation, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const kit = vi.hoisted(() => ({ init: vi.fn(), selectedModule: null as unknown, refreshSupportedWallets: vi.fn(), authModal: vi.fn(), getAddress: vi.fn(), fetchAddress: vi.fn(), getNetwork: vi.fn(), signTransaction: vi.fn(), disconnect: vi.fn(), on: vi.fn(() => () => {}), setWallet: vi.fn() }));
vi.mock('@creit.tech/stellar-wallets-kit/sdk', () => ({ StellarWalletsKit: kit }));
vi.mock('@creit.tech/stellar-wallets-kit/types', () => ({ Networks: { TESTNET: 'Test SDF Network ; September 2015' }, KitEventType: { STATE_UPDATED: 'STATE_UPDATE', WALLET_SELECTED: 'WALLET_SELECTED', DISCONNECT: 'DISCONNECT' } }));
vi.mock('@creit.tech/stellar-wallets-kit/modules/freighter', () => ({ FreighterModule: class {} }));
vi.mock('@creit.tech/stellar-wallets-kit/modules/xbull', () => ({ xBullModule: class {} }));
vi.mock('@creit.tech/stellar-wallets-kit/modules/lobstr', () => ({ LobstrModule: class {} }));
vi.mock('@creit.tech/stellar-wallets-kit/modules/wallet-connect', () => ({ WalletConnectModule: class {}, WalletConnectTargetChain: { TESTNET: 'testnet' } }));

import { connectWithKit, disconnectKit } from '../app/lib/walletsKit';
import { activeSigner, defaultSigner, unregisterSigner } from '../app/lib/wallet';

const key = Keypair.random();
const recipient = Keypair.random();
function payment(amount = '1') {
  return new TransactionBuilder(new Account(key.publicKey(), '1'), { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.payment({ destination: recipient.publicKey(), asset: Asset.native(), amount })).setTimeout(60).build().toXDR();
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }

beforeEach(() => {
  unregisterSigner(); vi.clearAllMocks();
  kit.selectedModule = { productId: 'freighter', productName: 'Freighter', getAddress: kit.getAddress, getNetwork: kit.getNetwork, signTransaction: kit.signTransaction };
  kit.refreshSupportedWallets.mockResolvedValue([]);
  kit.authModal.mockResolvedValue({ address: key.publicKey() });
  kit.getAddress.mockResolvedValue({ address: key.publicKey() });
  kit.fetchAddress.mockImplementation(() => kit.getAddress());
  kit.getNetwork.mockResolvedValue({ network: 'testnet', networkPassphrase: Networks.TESTNET });
  kit.disconnect.mockResolvedValue(undefined);
  kit.signTransaction.mockImplementation(async (xdr: string, opts: { networkPassphrase: string }) => { const tx = new Transaction(xdr, opts.networkPassphrase); tx.sign(key); return { signedTxXdr: tx.toXDR(), signerAddress: key.publicKey() }; });
});
afterEach(() => { unregisterSigner(); });

describe('wallet network and identity', () => {
  it('connects and accepts an unchanged testnet transaction signed by the connected account', async () => {
    const connected = await connectWithKit();
    expect(connected.address).toBe(key.publicKey());
    const signed = await defaultSigner()!.signTransaction(payment(), Networks.TESTNET);
    const tx = new Transaction(signed, Networks.TESTNET);
    expect(key.verify(tx.hash(), tx.signatures[0].signature())).toBe(true);
  });
  it.each(['mainnet', 'unknown'] as const)('fails closed for a %s wallet network', async (kind) => {
    if (kind === 'mainnet') kit.getNetwork.mockResolvedValue({ networkPassphrase: Networks.PUBLIC });
    else kit.getNetwork.mockRejectedValue(new Error('network unavailable'));
    await expect(connectWithKit()).rejects.toThrow(/network|testnet/i);
    expect(defaultSigner()).toBeNull();
  });
  it('rechecks the network before every signature', async () => {
    await connectWithKit(); const signer = defaultSigner()!;
    kit.getNetwork.mockResolvedValue({ networkPassphrase: Networks.PUBLIC });
    await expect(signer.signTransaction(payment(), Networks.TESTNET)).rejects.toThrow(/network|testnet/i);
    expect(kit.signTransaction).not.toHaveBeenCalled();
  });
  it('rejects a changed wallet account before requesting a signature', async () => {
    await connectWithKit(); const signer = defaultSigner()!;
    kit.getAddress.mockResolvedValue({ address: recipient.publicKey() });
    await expect(signer.signTransaction(payment(), Networks.TESTNET)).rejects.toThrow(/account|session|changed/i);
    expect(kit.signTransaction).not.toHaveBeenCalled();
  });
  it('rejects a wallet response with a changed payment amount', async () => {
    await connectWithKit();
    kit.signTransaction.mockImplementation(async () => { const tx = new Transaction(payment('2'), Networks.TESTNET); tx.sign(key); return { signedTxXdr: tx.toXDR() }; });
    await expect(defaultSigner()!.signTransaction(payment('1'), Networks.TESTNET)).rejects.toThrow(/different|changed|match/i);
  });
  it('rejects a signature made over the public network payload', async () => {
    await connectWithKit();
    kit.signTransaction.mockImplementation(async (xdr) => { const tx = new Transaction(xdr, Networks.PUBLIC); tx.sign(key); return { signedTxXdr: tx.toXDR() }; });
    await expect(defaultSigner()!.signTransaction(payment(), Networks.TESTNET)).rejects.toThrow(/signature|network/i);
  });
  it('revokes a captured signer immediately when disconnect starts', async () => {
    await connectWithKit(); const signer = defaultSigner()!;
    const finish = deferred<void>(); kit.disconnect.mockReturnValue(finish.promise);
    const disconnecting = disconnectKit();
    expect(activeSigner()).toBeNull();
    await expect(signer.signTransaction(payment(), Networks.TESTNET)).rejects.toThrow(/session|disconnect/i);
    finish.resolve(); await disconnecting;
  });
  it('does not register a connect result that completes after disconnect', async () => {
    const finish = deferred<{ address: string }>(); kit.authModal.mockReturnValue(finish.promise);
    const connecting = connectWithKit();
    await vi.waitFor(() => expect(kit.authModal).toHaveBeenCalled());
    await disconnectKit(); finish.resolve({ address: key.publicKey() });
    await expect(connecting).rejects.toThrow(/cancel|session|disconnect|changed/i);
    expect(defaultSigner()).toBeNull();
  });
});
