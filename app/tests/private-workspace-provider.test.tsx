// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PrivateProtocolOptions, PrivateProtocolSnapshot } from '../app/lib/private/protocol-types';

const boundary = vi.hoisted(() => ({ factory: vi.fn(), release: vi.fn(), pending: vi.fn(), reconcile: vi.fn(), version: 0, listeners: new Set<() => void>() }));
vi.mock('../app/lib/private/protocol', () => ({ createPrivateProtocol: boundary.factory }));
vi.mock('../app/lib/private/release', () => ({
  getPrivatePoolRelease: boundary.release,
  DEFAULT_PRIVATE_RELEASE_KEY: 'private-testnet-original',
  listPrivateReleaseOptions: () => [{ key: 'private-testnet-original', label: 'Earlier vault', policy: 'recovery', accounting: false }, { key: 'private-testnet-accounting', label: 'Current vault', policy: 'funding', accounting: true }],
  resolvePrivateRelease: boundary.release,
  assertPrivateReleaseSelection: () => {},
}));
vi.mock('../app/lib/wallet', () => ({ walletSessionVersion: () => boundary.version, onWalletSessionChange: (listener: () => void) => { boundary.listeners.add(listener); return () => boundary.listeners.delete(listener); } }));
vi.mock('../app/lib/private/pending-recovery', () => ({ listPrivatePendingForAccount: boundary.pending, reconcilePrivatePending: boundary.reconcile }));
import PrivateWorkspaceProvider, { usePrivateWorkspace } from '../app/components/app/PrivateWorkspaceProvider';

const scope = { domain: { networkId: '11'.repeat(32), contractId: '22'.repeat(32) }, epoch: '1', profileId: '33'.repeat(32) };
const secondScope = { ...scope, domain: { ...scope.domain, contractId: '44'.repeat(32) }, profileId: '55'.repeat(32) };
const selection = (key = 'private-testnet-original') => ({ key, label: key.endsWith('original') ? 'Earlier vault' : 'Current vault', policy: key.endsWith('original') ? 'recovery' : 'funding', accounting: !key.endsWith('original'), assets: [], scope: key.endsWith('original') ? scope : secondScope, release: { scope: key.endsWith('original') ? scope : secondScope } });
const snapshot: PrivateProtocolSnapshot = { status: 'locked', phase: null, ledger: null, balances: [], notes: [], pending: [], error: null, feeQuote: null };
let observed: ReturnType<typeof usePrivateWorkspace>;
function Probe() { observed = usePrivateWorkspace(); return <p>Workspace child</p>; }
beforeEach(() => {
  boundary.pending.mockReset().mockResolvedValue([]); boundary.reconcile.mockReset();
  boundary.version = 0; boundary.listeners.clear(); boundary.release.mockReset().mockImplementation(async (key?: string) => selection(key));
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

it('selects only known releases and retires the old vault, coordinator and fee approval immediately', async () => {
  render(<PrivateWorkspaceProvider address="fixture-public-account"><Probe /></PrivateWorkspaceProvider>);
  await waitFor(() => expect(observed.protocol).not.toBeNull());
  const oldVault = observed.vault!, oldProtocol = observed.protocol!;
  const lock = vi.spyOn(oldVault, 'lock');
  const originalOptions = boundary.factory.mock.calls[0][0] as PrivateProtocolOptions;
  let answer!: Promise<boolean>;
  await act(async () => { answer = originalOptions.confirmFee({ feeStroops: '5', maxFeeStroops: '10', source: 'fixture-public-account', action: 'withdraw', signal: new AbortController().signal }); });
  act(() => observed.selectRelease('private-testnet-accounting'));
  expect(await answer).toBe(false);
  expect(lock).toHaveBeenCalledOnce();
  expect(oldProtocol.dispose).toHaveBeenCalledOnce();
  expect(screen.queryByRole('dialog')).toBeNull();
  await waitFor(() => expect(observed.scope?.profileId).toBe(secondScope.profileId));
  await waitFor(() => expect(observed.protocol).not.toBeNull());
  expect(observed.vault).not.toBe(oldVault);
  expect(boundary.factory.mock.calls.at(-1)?.[0].releaseKey).toBe('private-testnet-accounting');
  expect(await originalOptions.confirmFee({ feeStroops: '5', maxFeeStroops: '10', source: 'fixture-public-account', action: 'withdraw', signal: new AbortController().signal })).toBe(false);
  expect(screen.queryByRole('dialog')).toBeNull();
  const current = observed.vault;
  const calls = boundary.release.mock.calls.length;
  expect(() => observed.selectRelease('https://attacker.invalid/pool')).toThrow(/release/i);
  expect(observed.vault).toBe(current);
  expect(boundary.release).toHaveBeenCalledTimes(calls);
});

it('disposes a coordinator that finishes loading after a profile switch without publishing it', async () => {
  let finish!: (value: unknown) => void;
  boundary.factory.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  render(<PrivateWorkspaceProvider address="fixture-public-account"><Probe /></PrivateWorkspaceProvider>);
  await waitFor(() => expect(boundary.factory).toHaveBeenCalledOnce());
  act(() => observed.selectRelease('private-testnet-accounting'));
  await waitFor(() => expect(observed.protocol).not.toBeNull());
  const current = observed.protocol;
  const late = { dispose: vi.fn(), refreshPending: vi.fn() };
  await act(async () => { finish(late); });
  expect(late.dispose).toHaveBeenCalledOnce();
  expect(late.refreshPending).not.toHaveBeenCalled();
  expect(observed.protocol).toBe(current);
  expect(observed.scope).toEqual(secondScope);
});

it('ignores a release verification that finishes after another known release was selected', async () => {
  let finish!: (value: unknown) => void;
  boundary.release.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  render(<PrivateWorkspaceProvider address="fixture-public-account"><Probe /></PrivateWorkspaceProvider>);
  await waitFor(() => expect(boundary.release).toHaveBeenCalledOnce());
  act(() => observed.selectRelease('private-testnet-accounting'));
  await waitFor(() => expect(observed.scope).toEqual(secondScope));
  await act(async () => { finish(selection()); });
  expect(observed.scope).toEqual(secondScope);
  expect(boundary.factory).toHaveBeenCalledOnce();
  expect(boundary.factory.mock.calls[0][0].releaseKey).toBe('private-testnet-accounting');
});

it('shows old-profile and unknown pending attempts without opening the vault and reconciles the original hash', async () => {
  const attempt = { hash: 'ab'.repeat(32), source: 'fixture-public-account', releaseId: scope.profileId, pool: 'old-pool', operation: 'submit', releaseKey: 'private-testnet-original', releaseLabel: 'Earlier vault', releaseStatus: 'known' };
  const unknown = { ...attempt, hash: 'cd'.repeat(32), releaseId: 'ef'.repeat(32), releaseKey: null, releaseLabel: null, releaseStatus: 'unknown' };
  boundary.pending.mockResolvedValue([attempt, unknown]);
  boundary.reconcile.mockResolvedValue({ status: 'confirmed', hash: attempt.hash, ledger: 1001 });
  render(<PrivateWorkspaceProvider address="fixture-public-account"><Probe /></PrivateWorkspaceProvider>);
  await waitFor(() => expect(observed.accountPending).toEqual([attempt, unknown]));
  act(() => observed.selectRelease('private-testnet-accounting'));
  await waitFor(() => expect(observed.scope).toEqual(secondScope));
  expect(observed.vault?.getSnapshot().status).toBe('locked');
  let result: unknown;
  await act(async () => { result = await observed.reconcilePending(attempt.hash); });
  expect(result).toEqual({ status: 'confirmed', hash: attempt.hash, ledger: 1001 });
  expect(boundary.reconcile).toHaveBeenCalledExactlyOnceWith(attempt.hash, { source: 'fixture-public-account' });
  expect(observed.vault?.getSnapshot().status).toBe('locked');
  expect(observed.accountPending).toContainEqual(unknown);
});

it('never publishes old-account pending data after wallet replacement', async () => {
  let finish!: (value: unknown) => void;
  boundary.pending.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const view = render(<PrivateWorkspaceProvider address="fixture-public-account"><Probe /></PrivateWorkspaceProvider>);
  await waitFor(() => expect(boundary.pending).toHaveBeenCalledOnce());
  view.rerender(<PrivateWorkspaceProvider address="another-public-account"><Probe /></PrivateWorkspaceProvider>);
  await waitFor(() => expect(boundary.pending).toHaveBeenCalledTimes(2));
  await act(async () => { finish([{ hash: 'old-account-private-activity' }]); });
  expect(observed.accountPending).toEqual([]);
});

it('never exposes already-loaded pending records in even the first render of another account', async () => {
  boundary.pending.mockResolvedValueOnce([{hash:'previous-account-attempt'}]);
  const renders: string[][]=[];
  function Observe(){const state=usePrivateWorkspace();renders.push(state.accountPending.map(row=>row.hash));return null;}
  const view=render(<PrivateWorkspaceProvider address="old-account"><Observe/></PrivateWorkspaceProvider>);
  await waitFor(()=>expect(renders.at(-1)).toEqual(['previous-account-attempt']));
  renders.length=0;
  view.rerender(<PrivateWorkspaceProvider address="new-account"><Observe/></PrivateWorkspaceProvider>);
  expect(renders.every(rows=>rows.length===0)).toBe(true);
});

it('survives StrictMode replay with a live coordinator and retires each obsolete owner once',async()=>{
  const view=render(<React.StrictMode><PrivateWorkspaceProvider address="fixture-public-account"><Probe/></PrivateWorkspaceProvider></React.StrictMode>);
  await waitFor(()=>expect(observed.protocol).not.toBeNull());
  const current=observed.protocol!,lock=vi.spyOn(observed.vault!,'lock');
  expect(current.dispose).not.toHaveBeenCalled();
  view.unmount();expect(current.dispose).toHaveBeenCalledOnce();expect(lock).toHaveBeenCalledOnce();
});


it('keeps the newest account pending refresh when an earlier read finishes late',async()=>{
  const view=render(<PrivateWorkspaceProvider address="fixture-public-account"><Probe/></PrivateWorkspaceProvider>);
  await waitFor(()=>expect(observed.vault).not.toBeNull());
  await waitFor(()=>expect(boundary.pending).toHaveBeenCalled());
  let finishOld!:(rows:unknown[])=>void;
  boundary.pending.mockReturnValueOnce(new Promise(resolve=>{finishOld=resolve}));
  const old=observed.refreshPending();
  await waitFor(()=>expect(finishOld).toBeTypeOf('function'));
  boundary.pending.mockResolvedValueOnce([]);
  await act(async()=>{await observed.refreshPending()});
  await act(async()=>{finishOld([{hash:'outdated'}]);await old});
  expect(observed.accountPending).toEqual([]);
  view.unmount();
});

it.each(['account', 'session'] as const)('an obsolete %s refresh cannot cancel the current pending discovery', async change => {
  const view = render(<PrivateWorkspaceProvider address="old-account"><Probe /></PrivateWorkspaceProvider>);
  await waitFor(() => expect(observed.pendingChecked).toBe(true));
  await waitFor(() => expect(observed.protocol).not.toBeNull());
  const obsoleteRefresh = observed.refreshPending;
  const currentAccount = change === 'account' ? 'new-account' : 'old-account';
  const currentAttempt = { hash: 'ab'.repeat(32), source: currentAccount, releaseId: scope.profileId, pool: 'original-pool', operation: 'submit', releaseKey: 'private-testnet-original', releaseLabel: 'Earlier vault', releaseStatus: 'known' };
  let finish!: (rows: unknown[]) => void;
  boundary.pending.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  if (change === 'account') view.rerender(<PrivateWorkspaceProvider address={currentAccount}><Probe /></PrivateWorkspaceProvider>);
  else act(() => { boundary.version++; boundary.listeners.forEach(listener => listener()); });
  await waitFor(() => expect(boundary.pending).toHaveBeenCalledTimes(2));
  expect(boundary.pending).toHaveBeenLastCalledWith({ source: currentAccount });
  expect(observed.pendingChecked).toBe(false);
  // An old PrivateReadyPanel.run finally can invoke this callback after the
  // replacement has already started reading its own journal.
  await act(async () => { await obsoleteRefresh(); });
  expect(boundary.pending).toHaveBeenCalledTimes(2);
  await act(async () => { finish([currentAttempt]); });
  expect(observed).toMatchObject({ accountPending: [currentAttempt], pendingChecked: true, pendingError: null });
  expect(boundary.reconcile).not.toHaveBeenCalled();
  expect(observed.vault?.getSnapshot().status).toBe('locked');
  expect(screen.queryByRole('dialog')).toBeNull();
});
