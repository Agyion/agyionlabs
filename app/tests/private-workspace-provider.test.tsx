// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PrivateProtocolOptions, PrivateProtocolSnapshot } from '../app/lib/private/protocol-types';

const boundary = vi.hoisted(() => ({ factory: vi.fn(), release: vi.fn(), version: 0, listeners: new Set<() => void>() }));
vi.mock('../app/lib/private/protocol', () => ({ createPrivateProtocol: boundary.factory }));
vi.mock('../app/lib/private/release', () => ({ getPrivatePoolRelease: boundary.release }));
vi.mock('../app/lib/wallet', () => ({ walletSessionVersion: () => boundary.version, onWalletSessionChange: (listener: () => void) => { boundary.listeners.add(listener); return () => boundary.listeners.delete(listener); } }));
import PrivateWorkspaceProvider, { usePrivateWorkspace } from '../app/components/app/PrivateWorkspaceProvider';

const scope = { domain: { networkId: '11'.repeat(32), contractId: '22'.repeat(32) }, epoch: '1', profileId: '33'.repeat(32) };
const snapshot: PrivateProtocolSnapshot = { status: 'locked', phase: null, ledger: null, balances: [], notes: [], pending: [], error: null, feeQuote: null };
let observed: ReturnType<typeof usePrivateWorkspace>;
function Probe() { observed = usePrivateWorkspace(); return <p>Workspace child</p>; }
beforeEach(() => {
  boundary.version = 0; boundary.listeners.clear(); boundary.release.mockReset().mockResolvedValue({ scope });
  boundary.factory.mockReset().mockImplementation(async () => ({ subscribe: () => () => {}, getSnapshot: () => snapshot, refreshPending: vi.fn().mockResolvedValue([]), dispose: vi.fn() }));
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute('open'); } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal'); Reflect.deleteProperty(HTMLDialogElement.prototype, 'close'); });

it('never initializes a private signer for a disconnected wallet or falls back when release verification fails', async () => {
  boundary.release.mockRejectedValue(new Error('fixture release rejected'));
  render(<PrivateWorkspaceProvider address={null}><Probe /></PrivateWorkspaceProvider>);
  await waitFor(() => expect(observed.error).toMatch(/deployment could not be verified/));
  expect(observed.vault).toBeNull();
  expect(boundary.factory).not.toHaveBeenCalled();
  expect(screen.getByText('Workspace child')).toBeTruthy();
});
it('requires an explicit exact-fee choice and cancels when its transaction signal aborts', async () => {
  render(<PrivateWorkspaceProvider address="fixture-public-account"><Probe /></PrivateWorkspaceProvider>);
  await waitFor(() => expect(boundary.factory).toHaveBeenCalledOnce());
  const options = boundary.factory.mock.calls[0][0] as PrivateProtocolOptions;
  expect(options.maxFeeStroops).toBe('10000000');
  const abort = new AbortController();
  let settled = false;
  let answer!: Promise<boolean>;
  await act(async () => { answer = options.confirmFee({ feeStroops: '73034788', maxFeeStroops: '80000000', source: 'fixture-public-account', action: 'deposit', signal: abort.signal }); answer.then(() => { settled = true; }); });
  expect(screen.getByRole('dialog', { name: 'Confirm the network fee' })).toBeTruthy();
  expect(screen.getByText('7.3034788 XLM')).toBeTruthy();
  expect(settled).toBe(false);
  await act(async () => abort.abort());
  expect(await answer).toBe(false);
  expect(screen.queryByRole('dialog')).toBeNull();
  let accepted!: Promise<boolean>;
  await act(async () => { accepted = options.confirmFee({ feeStroops: '5', maxFeeStroops: '10', source: 'fixture-public-account', action: 'withdraw', signal: new AbortController().signal }); });
  fireEvent.click(screen.getByRole('button', { name: 'Continue to wallet' }));
  expect(await accepted).toBe(true);
});
it('keeps the protocol and proof lifecycle when the user explicitly changes the fee cap', async () => {
  render(<PrivateWorkspaceProvider address="fixture-public-account"><Probe /></PrivateWorkspaceProvider>);
  await waitFor(() => expect(observed.protocol).not.toBeNull());
  const protocol = observed.protocol;
  act(() => observed.setFeeLimit('8'));
  expect(observed.feeLimit).toBe('8');
  expect(observed.protocol).toBe(protocol);
  expect(boundary.factory).toHaveBeenCalledOnce();
});
it('locks the old vault and disposes the coordinator on wallet session change', async () => {
  render(<PrivateWorkspaceProvider address="fixture-public-account"><Probe /></PrivateWorkspaceProvider>);
  await waitFor(() => expect(observed.protocol).not.toBeNull());
  const oldVault = observed.vault!, oldProtocol = observed.protocol!;
  const lock = vi.spyOn(oldVault, 'lock');
  act(() => { boundary.version++; boundary.listeners.forEach(listener => listener()); });
  await waitFor(() => expect(boundary.factory).toHaveBeenCalledTimes(2));
  expect(lock).toHaveBeenCalledOnce();
  expect(oldProtocol.dispose).toHaveBeenCalledOnce();
  expect(observed.vault).not.toBe(oldVault);
});
