import { JSDOM } from 'jsdom';
import { Keypair, Networks } from '@stellar/stellar-sdk';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const kit = vi.hoisted(() => ({ connectWithKit: vi.fn(), disconnectKit: vi.fn() }));
vi.mock('../app/lib/walletsKit', () => kit);
vi.mock('../app/lib/client', () => ({ resetClient: () => {} }));
import { useWallet } from '../app/lib/useWallet';
import { registerSigner, unregisterSigner } from '../app/lib/wallet';
const account = Keypair.random().publicKey();
const testKey = Keypair.random();
const external = { address: async () => account, signTransaction: async (xdr: string) => xdr };
const connection = { address: account, walletName: 'Freighter', walletNetwork: Networks.TESTNET };
let dom: JSDOM;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://app.invalid' });
  vi.stubGlobal('window', dom.window); vi.stubGlobal('document', dom.window.document); vi.stubGlobal('navigator', dom.window.navigator);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  unregisterSigner();
  kit.connectWithKit.mockReset().mockImplementation(async () => { registerSigner(external); return connection; });
  kit.disconnectKit.mockReset().mockImplementation(async () => { unregisterSigner(); });
});
afterEach(() => { cleanup(); unregisterSigner(); dom.window.close(); vi.unstubAllGlobals(); });

describe('wallet hook session state', () => {
  it('shows a successfully connected wallet', async () => {
    const { result } = renderHook(() => useWallet());
    await act(async () => result.current.connectKit());
    expect(result.current.address).toBe(account); expect(result.current.demo).toBe(false);
  });
  it('does not restore a late connection result after disconnect', async () => {
    const finish = deferred<typeof connection>(); kit.connectWithKit.mockReturnValue(finish.promise);
    const { result } = renderHook(() => useWallet());
    let connecting!: Promise<void>;
    act(() => { connecting = result.current.connectKit(); });
    await act(async () => result.current.disconnect());
    await act(async () => { finish.resolve(connection); await connecting; });
    expect(result.current.address).toBeNull(); expect(result.current.connecting).toBe(false);
  });
  it('keeps the newer test wallet when an earlier connect request finishes', async () => {
    const finish = deferred<typeof connection>(); kit.connectWithKit.mockReturnValue(finish.promise);
    const { result } = renderHook(() => useWallet());
    let connecting!: Promise<void>;
    act(() => { connecting = result.current.connectKit(); });
    await act(async () => result.current.useTestSecret(testKey.secret()));
    await act(async () => { finish.resolve(connection); await connecting; });
    expect(result.current.address).toBe(testKey.publicKey()); expect(result.current.demo).toBe(true);
  });
  it('clears the visible account as soon as the active signer is revoked', async () => {
    const { result } = renderHook(() => useWallet());
    await act(async () => result.current.connectKit());
    act(() => unregisterSigner());
    expect(result.current.address).toBeNull();
  });
  it('does not let delayed disconnect cleanup clear a newly connected account', async () => {
    const finish = deferred<void>();
    const { result } = renderHook(() => useWallet());
    await act(async () => result.current.connectKit());
    kit.disconnectKit.mockImplementationOnce(() => { unregisterSigner(); return finish.promise; });
    let disconnecting!: Promise<void>;
    act(() => { disconnecting = result.current.disconnect(); });
    await act(async () => result.current.connectKit());
    await act(async () => { finish.resolve(); await disconnecting; });
    expect(result.current.address).toBe(account);
  });
});
