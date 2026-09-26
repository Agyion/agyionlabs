// @vitest-environment jsdom
import { Account, Asset, Networks, Operation, StrKey, TransactionBuilder } from '@stellar/stellar-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  freighter: { isConnected: vi.fn(), requestAccess: vi.fn(), getAddress: vi.fn(), getNetwork: vi.fn(), signTransaction: vi.fn(), signAuthEntry: vi.fn(), signMessage: vi.fn() },
  xbull: { connect: vi.fn(), sign: vi.fn(), closeConnections: vi.fn() },
  lobstr: { isConnected: vi.fn(), getPublicKey: vi.fn(), signTransaction: vi.fn(), signMessage: vi.fn() },
  wc: { on: vi.fn(), connect: vi.fn(), request: vi.fn(), disconnect: vi.fn(), session: { values: [] } },
  modal: { open: vi.fn(), close: vi.fn() },
}));
vi.mock('@stellar/freighter-api', () => api.freighter);
vi.mock('@creit.tech/xbull-wallet-connect', () => ({ xBullWalletConnect: class { connect = api.xbull.connect; sign = api.xbull.sign; closeConnections = api.xbull.closeConnections; } }));
vi.mock('@lobstrco/signer-extension-api', () => api.lobstr);
vi.mock('@walletconnect/sign-client', () => ({ SignClient: { init: async () => api.wc } }));
vi.mock('@reown/appkit/core', () => ({ createAppKit: () => api.modal }));
vi.mock('@reown/appkit/networks', () => ({ mainnet: {} }));

// Keep the actual selected adapters, SDK, signals and rendered modal. Only wallet
// transport boundaries are synthetic; these tests never connect or broadcast.
import { StellarWalletsKit } from '@agyion/stellar-wallets-kit/sdk';
import { KitEventType } from '@agyion/stellar-wallets-kit/types';
import { FreighterModule } from '@agyion/stellar-wallets-kit/modules/freighter';
import { xBullModule } from '@agyion/stellar-wallets-kit/modules/xbull';
import { LobstrModule } from '@agyion/stellar-wallets-kit/modules/lobstr';
import { WalletConnectModule, WalletConnectTargetChain } from '@agyion/stellar-wallets-kit/modules/wallet-connect';

const publicKey = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 7));
const tx = new TransactionBuilder(new Account(publicKey, '1'), { networkPassphrase: Networks.TESTNET, fee: '100' })
  .addOperation(Operation.payment({ destination: publicKey, asset: Asset.native(), amount: '0.009' })).setTimeout(60).build().toXDR();
const opts = { address: publicKey, networkPassphrase: Networks.TESTNET };

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  api.freighter.isConnected.mockResolvedValue({ isConnected: true });
  api.freighter.requestAccess.mockResolvedValue({ address: publicKey });
  api.freighter.getAddress.mockResolvedValue({ address: publicKey });
  api.freighter.getNetwork.mockResolvedValue({ network: 'testnet', networkPassphrase: Networks.TESTNET });
  api.freighter.signTransaction.mockResolvedValue({ signedTxXdr: tx, signerAddress: publicKey });
  api.xbull.connect.mockResolvedValue(publicKey); api.xbull.sign.mockResolvedValue(tx);
  api.lobstr.isConnected.mockResolvedValue(true); api.lobstr.getPublicKey.mockResolvedValue(publicKey); api.lobstr.signTransaction.mockResolvedValue(tx);
  StellarWalletsKit.init({ modules: [new FreighterModule(), new xBullModule(), new LobstrModule()], network: Networks.TESTNET, authModal: { showInstallLabel: true } });
});
afterEach(async () => { await StellarWalletsKit.disconnect(); document.body.replaceChildren(); });

describe('retained upstream wallet behavior', () => {
  it('forwards Freighter transaction/account/network and supports nonprompting session checks', async () => {
    const wallet = new FreighterModule();
    expect(await wallet.getAddress({ skipRequestAccess: true })).toEqual({ address: publicKey });
    expect(api.freighter.requestAccess).not.toHaveBeenCalled();
    expect(await wallet.getNetwork()).toEqual({ network: 'testnet', networkPassphrase: Networks.TESTNET });
    expect(await wallet.signTransaction(tx, opts)).toEqual({ signedTxXdr: tx, signerAddress: publicKey });
    expect(api.freighter.signTransaction).toHaveBeenCalledWith(tx, opts);
  });
  it('preserves a Freighter access rejection without requesting a signature', async () => {
    api.freighter.requestAccess.mockResolvedValue({ error: { code: -4, message: 'User declined access' } });
    await expect(new FreighterModule().getAddress({})).rejects.toMatchObject({ code: -4, message: 'User declined access' });
    expect(api.freighter.signTransaction).not.toHaveBeenCalled();
  });
  it('closes xBull bridges on successful signing and wallet rejection', async () => {
    const wallet = new xBullModule();
    expect(await wallet.getAddress()).toEqual({ address: publicKey });
    expect(await wallet.signTransaction(tx, opts)).toEqual({ signedTxXdr: tx, signerAddress: publicKey });
    expect(api.xbull.sign).toHaveBeenCalledWith({ xdr: tx, publicKey, network: Networks.TESTNET });
    api.xbull.sign.mockRejectedValue(new Error('User declined signature'));
    await expect(wallet.signTransaction(tx, opts)).rejects.toMatchObject({ message: 'User declined signature' });
    expect(api.xbull.closeConnections).toHaveBeenCalledTimes(3);
    await expect(wallet.getNetwork()).rejects.toMatchObject({ code: -3 });
  });
  it('retains LOBSTR address/transaction forwarding and its unsupported network signal', async () => {
    const wallet = new LobstrModule();
    expect(await wallet.getAddress()).toEqual({ address: publicKey });
    expect(await wallet.signTransaction(tx)).toEqual({ signedTxXdr: tx });
    expect(api.lobstr.signTransaction).toHaveBeenCalledWith(tx);
    await expect(wallet.getNetwork()).rejects.toMatchObject({ code: -3 });
  });
  it('retains optional WalletConnect Testnet namespaces and sign-only requests', async () => {
    api.wc.connect.mockResolvedValue({ uri: 'wc:test-fixture', approval: async () => ({ topic: 'test-topic', namespaces: { stellar: { accounts: [`stellar:testnet:${publicKey}`] } } }) });
    api.wc.request.mockResolvedValue({ signedXDR: tx });
    const wallet = new WalletConnectModule({ projectId: 'test-fixture-not-live', metadata: { name: 'Test', description: 'Local fixture', url: 'https://example.test', icons: [] }, allowedChains: [WalletConnectTargetChain.TESTNET] });
    await vi.waitFor(async () => expect(await wallet.isAvailable()).toBe(true));
    expect(await wallet.getAddress()).toEqual({ address: publicKey });
    expect(api.wc.connect).toHaveBeenCalledWith(expect.objectContaining({ requiredNamespaces: { stellar: { methods: ['stellar_signXDR'], chains: ['stellar:testnet'], events: [] } } }));
    expect(await wallet.signTransaction(tx, opts)).toEqual({ signedTxXdr: tx });
    expect(api.wc.request).toHaveBeenCalledWith({ topic: 'test-topic', chainId: 'stellar:testnet', request: { method: 'stellar_signXDR', params: { xdr: tx } } });
    await expect(wallet.getNetwork()).rejects.toMatchObject({ code: -3 });
  });
});

describe('retained upstream wallet modal', () => {
  it('handles the first visible close immediately even when a provider probe is slow', async () => {
    // The app checks wrapper availability before opening the chooser, so the
    // cached provider rows are already visible during its second probe.
    await StellarWalletsKit.refreshSupportedWallets();
    let finishProbe!: (value: { isConnected: boolean }) => void;
    api.freighter.isConnected.mockReturnValue(new Promise((resolve) => { finishProbe = resolve; }));
    const result = StellarWalletsKit.authModal();
    let outcome: unknown;
    void result.then((value) => { outcome = value; }, (error) => { outcome = error; });
    try {
      await vi.waitFor(() => expect(document.querySelector('.stellar-wallets-kit header button')).not.toBeNull(), { timeout: 2000 });
      const close = document.querySelectorAll<HTMLButtonElement>('.stellar-wallets-kit header button');
      close[close.length - 1].click();
      await vi.waitFor(() => expect(document.querySelector('.stellar-wallets-kit')).toBeNull(), { timeout: 200 });
      expect(outcome).toMatchObject({ message: 'The user closed the modal.' });
      expect(api.freighter.requestAccess).not.toHaveBeenCalled();
    } finally {
      finishProbe({ isConnected: false });
      await new Promise((resolve) => setTimeout(resolve, 10));
      const remainingClose = document.querySelectorAll<HTMLButtonElement>('.stellar-wallets-kit header button');
      remainingClose[remainingClose.length - 1]?.click();
      await result.catch(() => undefined);
    }
  });
  it('renders only configured providers and resolves selection through the actual SDK events', async () => {
    const selected = vi.fn(); const state = vi.fn();
    const stopSelected = StellarWalletsKit.on(KitEventType.WALLET_SELECTED, selected);
    const stopState = StellarWalletsKit.on(KitEventType.STATE_UPDATED, state);
    try {
      const result = StellarWalletsKit.authModal();
      await vi.waitFor(() => expect([...document.querySelectorAll('li p')].map((node) => node.textContent)).toEqual(['Freighter', 'xBull', 'LOBSTR']));
      expect(document.querySelector('h1')?.textContent?.trim()).toBe('Connect Wallet');
      const wallet = [...document.querySelectorAll('li')].find((node) => node.textContent?.includes('Freighter'))!;
      wallet.click();
      expect(await result).toEqual({ address: publicKey });
      expect(StellarWalletsKit.selectedModule.productId).toBe('freighter');
      expect(selected).toHaveBeenLastCalledWith({ eventType: KitEventType.WALLET_SELECTED, payload: { id: 'freighter' } });
      expect(state).toHaveBeenLastCalledWith({ eventType: KitEventType.STATE_UPDATED, payload: { address: publicKey, networkPassphrase: Networks.TESTNET } });
      expect(document.querySelector('.stellar-wallets-kit')).toBeNull();
    } finally { stopSelected(); stopState(); }
  });
  it('shows the install state and rejects cancellation without connecting', async () => {
    api.freighter.isConnected.mockResolvedValue({ isConnected: false });
    const result = StellarWalletsKit.authModal();
    const rejection = expect(result).rejects.toMatchObject({ message: 'The user closed the modal.' });
    await vi.waitFor(() => expect([...document.querySelectorAll('li')].find((node) => node.textContent?.includes('Freighter'))?.textContent).toContain('Install'));
    const close = document.querySelectorAll<HTMLButtonElement>('header button');
    close[close.length - 1].click();
    await rejection;
    expect(api.freighter.requestAccess).not.toHaveBeenCalled();
    expect(document.querySelector('.stellar-wallets-kit')).toBeNull();
  });
});
