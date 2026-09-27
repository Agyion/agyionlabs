// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Fade } from '../app/lib/agyionClient';
import type { WalletState } from '../app/lib/useWallet';

const boundary = vi.hoisted(() => ({ getClient: vi.fn(), mockClient: vi.fn(), generation: 0, fresh: true, ledger: 1000 as number | null }));
vi.mock('../app/lib/config', () => ({ IS_MOCK: false, CONFIG: { mode: 'soroban', decimals: 7, assetCode: 'USDC', assetContractId: 'contract', networkPassphrase: 'Test SDF Network ; September 2015', contractId: `C${'A'.repeat(55)}` } }));
vi.mock('../app/lib/client', () => ({ getClient: boundary.getClient, mockClient: boundary.mockClient, SECONDS_PER_LEDGER: 5 }));
vi.mock('../app/lib/useLedger', () => ({ useLedger: () => boundary.fresh ? boundary.ledger : null, useLedgerStatus: () => ({ ledger: boundary.ledger, fresh: boundary.fresh, status: boundary.fresh ? 'fresh' : 'stale', refresh: vi.fn() }) }));
vi.mock('../app/lib/wallet', () => ({ demoAddress: () => 'GDEMO', onWalletSessionChange: () => () => {}, storedTestSigner: () => null }));
// Crypto is an external boundary here: jsdom/native typed-array realms differ.
// Each generation is distinct so silent form-driven identity changes are visible.
vi.mock('../app/lib/signers', async (original) => ({
  ...await original<typeof import('../app/lib/signers')>(),
  newKeypair: () => { const n = ++boundary.generation; return { secret: `fixture-secret-${n}`, pubkeyHex: String(n).padStart(64, '0'), address: 'GKEYFIXTURE' }; },
  publicKeyHex: (secret: string) => { if (!/^fixture-secret-\d+$/.test(secret)) throw new Error('Invalid fixture secret'); return secret.replace('fixture-secret-', '').padStart(64, '0'); },
  signHandoff: () => 'ab'.repeat(64),
}));
import FadePanel from '../app/components/app/FadePanel';
import { listEntries, recoverTransactionEntries } from '../app/lib/ledgerLog';
import { consumeReceipt, listTransactionAttempts, rememberReceipt, rememberTransactionAttempt, updateTransactionAttempt } from '../app/lib/transactionReceipts';

const wallet: WalletState = { address: `G${'A'.repeat(55)}`, label: 'Fixture wallet, no signer', demo: false, connecting: false, error: null, connectKit: async () => {}, useTestSecret: () => {}, disconnect: async () => {} };
const fade: Fade = { id: 3n, seller: 'GCONNECTED', asset: 'contract', pot: 10000000000n, start_price: 1000000000n, floor_price: -100000000n, start_ledger: 900, deadline_ledger: 1100, handoff_window: 50, slope_num: 10000000n, slope_den: 1n, venue_pubkey: '1'.padStart(64, '0'), state: 0, claimant: null, claimed_at: null };
const claimed: Fade = { ...fade, state: 1, claimant: 'GCLAIMANT', claimed_at: 990 };
let client: { get_fade: ReturnType<typeof vi.fn>; claim: ReturnType<typeof vi.fn>; refund: ReturnType<typeof vi.fn>; confirm_handoff: ReturnType<typeof vi.fn> };
beforeEach(() => {
  sessionStorage.clear(); localStorage.clear(); consumeReceipt('claim', '3'); boundary.generation = 0; boundary.fresh = true; boundary.ledger = 1000;
  history.replaceState(null, '', '/');
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }) });
  client = { get_fade: vi.fn().mockResolvedValue(fade), claim: vi.fn().mockRejectedValue(new Error('User rejected')), refund: vi.fn().mockRejectedValue(new Error('User rejected')), confirm_handoff: vi.fn().mockRejectedValue(new Error('User rejected')) };
  boundary.getClient.mockReset().mockReturnValue(client); boundary.mockClient.mockReset().mockReturnValue(null);
});
afterEach(() => { cleanup(); history.replaceState(null, '', '/'); vi.restoreAllMocks(); });

async function load(record = fade) {
  client.get_fade.mockResolvedValue(record);
  const view = render(<FadePanel wallet={wallet} />);
  fireEvent.change(screen.getByLabelText(/Load Fade by ID/), { target: { value: '3' } });
  fireEvent.click(screen.getByRole('button', { name: /^Load$/ }));
  await screen.findByRole('button', { name: /^New fade$/i });
  return view;
}

const claimHash = 'ab'.repeat(32);
const claimScope = { account: wallet.address!, network: 'Test SDF Network ; September 2015', contractId: `C${'A'.repeat(55)}` };
function confirmClaimAt(ledger: number) {
  // The RPC submission boundary supplies confirmation evidence, exactly as
  // SorobanClient.submit does. UI history and durable recovery remain real.
  rememberTransactionAttempt({ ...claimScope, action: 'claim', refId: '3', hash: claimHash });
  updateTransactionAttempt(claimHash, claimScope, { status: 'success', ledger });
  rememberReceipt('claim', '3', { ...claimScope, hash: claimHash, ledger });
}

it.each([1, 2, 3] as const)('records the confirmed claim ledger price instead of the pre-submit quote (returned state %s)', async (state) => {
  boundary.ledger = 990; // Display is +10 USDC; the eventual claim at 1005 is -5.
  await load();
  const initialClaimLabel = screen.getByRole('button', { name: /^Claim at 10 USDC/ }).textContent;
  let finishRead!: (value: Fade) => void;
  client.get_fade.mockImplementationOnce(() => new Promise<Fade>(resolve => { finishRead = resolve; }));
  client.claim.mockImplementationOnce(async () => { confirmClaimAt(1005); });
  fireEvent.click(screen.getByRole('button', { name: /^Claim at/ }));
  await waitFor(() => expect(client.get_fade).toHaveBeenCalledTimes(2));
  expect(listEntries()).toEqual([expect.objectContaining({ amount: null, txHash: claimHash })]);
  finishRead({ ...fade, state, claimant: wallet.address, claimed_at: 1005 });
  await waitFor(() => expect(listEntries()).toEqual([expect.objectContaining({
    amount: '-50000000', ledger: 1005, txHash: claimHash, account: wallet.address,
    detail: expect.stringContaining('-5 USDC'),
  })]));
  expect(client.claim).toHaveBeenCalledTimes(1);
  expect(initialClaimLabel).toContain('estimate');
});

it.each([
  { name: 'still-open record', patch: { state: 0, claimant: null, claimed_at: null } },
  { name: 'another claimant', patch: { claimant: 'GOTHER' } },
  { name: 'another listing', patch: { id: 4n } },
  { name: 'missing claim ledger', patch: { claimed_at: null } },
  { name: 'claim before listing', patch: { claimed_at: 899 } },
  { name: 'claim after deadline', patch: { claimed_at: 1101 } },
  { name: 'claim ledger inconsistent with confirmation', patch: { claimed_at: 1004 } },
  { name: 'unknown state', patch: { state: 9 } },
])('keeps confirmed evidence but no invented amount for $name', async ({ patch }) => {
  await load();
  client.claim.mockImplementationOnce(async () => { confirmClaimAt(1005); });
  client.get_fade.mockResolvedValueOnce({ ...fade, state: 1, claimant: wallet.address, claimed_at: 1005, ...patch });
  fireEvent.click(screen.getByRole('button', { name: /^Claim at/ }));
  await screen.findByRole('alert');
  expect(listEntries()).toEqual([expect.objectContaining({ amount: null, txHash: claimHash })]);
  expect(listTransactionAttempts(claimScope)).toEqual([expect.objectContaining({ status: 'success', hash: claimHash })]);
  expect((screen.getByRole('button', { name: /^Claim at/ }) as HTMLButtonElement).disabled).toBe(true);
  client.get_fade.mockResolvedValueOnce({ ...fade, state: 1, claimant: wallet.address, claimed_at: 1005 });
  fireEvent.click(screen.getByRole('button', { name: /^Refresh record$/ }));
  await waitFor(() => expect(listEntries()[0].amount).toBe('-50000000'));
  expect(listEntries()).toHaveLength(1);
  expect(client.claim).toHaveBeenCalledTimes(1);
});

it('keeps the original claimant and receipt when the connected wallet changes during read recovery', async () => {
  const view = await load();
  client.claim.mockImplementationOnce(async () => { confirmClaimAt(1005); });
  client.get_fade.mockRejectedValueOnce(new Error('RPC unavailable'));
  fireEvent.click(screen.getByRole('button', { name: /^Claim at/ }));
  await screen.findByRole('alert');
  view.rerender(<FadePanel wallet={{ ...wallet, address: `G${'B'.repeat(55)}` }} />);
  client.get_fade.mockResolvedValueOnce({ ...fade, state: 1, claimant: wallet.address, claimed_at: 1005 });
  fireEvent.click(screen.getByRole('button', { name: /^Refresh record$/ }));
  await waitFor(() => expect(listEntries()).toEqual([expect.objectContaining({
    account: wallet.address, amount: '-50000000', txHash: claimHash,
  })]));
  expect(client.claim).toHaveBeenCalledTimes(1);
});

it('preserves confirmed evidence if the wallet changes before submission returns', async () => {
  const view = await load();
  let finishClaim!: () => void;
  client.claim.mockImplementationOnce(() => new Promise<void>(resolve => { finishClaim = resolve; }));
  fireEvent.click(screen.getByRole('button', { name: /^Claim at/ }));
  await waitFor(() => expect(client.claim).toHaveBeenCalledTimes(1));
  view.rerender(<FadePanel wallet={{ ...wallet, address: `G${'B'.repeat(55)}` }} />);
  // submit records durable success but skips the in-memory receipt when the
  // signer session changed while its transaction awaited confirmation.
  rememberTransactionAttempt({ ...claimScope, action: 'claim', refId: '3', hash: claimHash });
  updateTransactionAttempt(claimHash, claimScope, { status: 'success', ledger: 1005 });
  client.get_fade.mockResolvedValue({ ...fade, state: 1, claimant: wallet.address, claimed_at: 1005 });
  finishClaim();
  await waitFor(() => expect(listEntries()).toEqual([expect.objectContaining({
    amount: '-50000000', ledger: 1005, txHash: claimHash, ...claimScope,
  })]));
  expect(client.claim).toHaveBeenCalledTimes(1);
});

it('enriches the same hash when generic recovery consumed the in-memory receipt first', async () => {
  await load();
  client.claim.mockImplementationOnce(async () => {
    confirmClaimAt(1005);
    recoverTransactionEntries(claimScope);
  });
  client.get_fade.mockResolvedValue({ ...fade, state: 1, claimant: wallet.address, claimed_at: 1005 });
  fireEvent.click(screen.getByRole('button', { name: /^Claim at/ }));
  await waitFor(() => expect(listEntries()).toEqual([expect.objectContaining({
    amount: '-50000000', ledger: 1005, txHash: claimHash, ...claimScope,
  })]));
});

it.each([
  { name: 'another account', patch: { account: `G${'B'.repeat(55)}` }, status: 'success' as const },
  { name: 'another network', patch: { network: 'Public Global Stellar Network ; September 2015' }, status: 'success' as const },
  { name: 'another contract', patch: { contractId: `C${'B'.repeat(55)}` }, status: 'success' as const },
  { name: 'another action', patch: { action: 'refund' }, status: 'success' as const },
  { name: 'another record', patch: { refId: '4' }, status: 'success' as const },
  { name: 'unconfirmed transaction', patch: {}, status: 'unknown' as const },
  { name: 'failed transaction', patch: {}, status: 'failed' as const },
])('does not substitute $name for missing confirmation evidence', async ({ patch, status }) => {
  await load();
  client.claim.mockImplementationOnce(async () => {
    const unrelated = { ...claimScope, action: 'claim', refId: '3', hash: 'cd'.repeat(32), ...patch };
    rememberTransactionAttempt(unrelated);
    updateTransactionAttempt(unrelated.hash, unrelated, { status, ledger: 1005 });
  });
  client.get_fade.mockResolvedValue({ ...fade, state: 1, claimant: wallet.address, claimed_at: 1005 });
  fireEvent.click(screen.getByRole('button', { name: /^Claim at/ }));
  await screen.findByRole('alert');
  expect(listEntries()).toHaveLength(0);
  expect((screen.getByRole('button', { name: /^Claim at/ }) as HTMLButtonElement).disabled).toBe(true);
  confirmClaimAt(1005);
  fireEvent.click(screen.getByRole('button', { name: /^Refresh record$/ }));
  await waitFor(() => expect(listEntries()).toEqual([expect.objectContaining({ amount: '-50000000', txHash: claimHash, ...claimScope })]));
  expect(client.claim).toHaveBeenCalledTimes(1);
});

it('does not choose an arbitrary hash when exact-scope confirmation evidence is ambiguous', async () => {
  await load();
  client.claim.mockImplementationOnce(async () => {
    confirmClaimAt(1005);
    const ambiguous = { ...claimScope, action: 'claim', refId: '3', hash: 'cd'.repeat(32) };
    rememberTransactionAttempt(ambiguous);
    updateTransactionAttempt(ambiguous.hash, ambiguous, { status: 'success', ledger: 1005 });
  });
  client.get_fade.mockResolvedValue({ ...fade, state: 1, claimant: wallet.address, claimed_at: 1005 });
  fireEvent.click(screen.getByRole('button', { name: /^Claim at/ }));
  await screen.findByRole('alert');
  expect(listEntries()).toHaveLength(0);
  expect(client.claim).toHaveBeenCalledTimes(1);
});

it.each([
  { method: 'claim' as const, label: /^Claim at/, record: fade },
  { method: 'refund' as const, label: /^Refund to seller/, record: { ...fade, deadline_ledger: 900 } },
  { method: 'confirm_handoff' as const, label: /^Confirm handoff/, record: claimed },
])('$method releases its busy state after a definite rejection and lets the user retry', async ({ method, label, record }) => {
  await load(record);
  if (method === 'confirm_handoff') fireEvent.click(screen.getByRole('button', { name: /^Produce signature$/ }));
  fireEvent.click(screen.getByRole('button', { name: label }));
  expect((await screen.findByRole('alert')).textContent).toContain('Signature declined in the wallet');
  const action = screen.getByRole('button', { name: label }) as HTMLButtonElement;
  expect(action.disabled).toBe(false);
  fireEvent.click(action);
  await waitFor(() => expect(client[method]).toHaveBeenCalledTimes(2));
});

it('keeps the venue identity through unmount and exposes an explicit backup without showing it by default', () => {
  const first = render(<FadePanel wallet={wallet} />);
  const original = (screen.getByLabelText(/^Venue pubkey/) as HTMLInputElement).value;
  expect(screen.queryByLabelText(/^Generated venue secret/)).toBeNull();
  first.unmount(); render(<FadePanel wallet={wallet} />);
  expect((screen.getByLabelText(/^Venue pubkey/) as HTMLInputElement).value).toBe(original);
  fireEvent.click(screen.getByText('Venue signing key'));
  fireEvent.click(screen.getByRole('button', { name: /^Reveal venue secret$/ }));
  expect((screen.getByLabelText(/^Generated venue secret/) as HTMLInputElement).value).toBe('fixture-secret-1');
});

it('keeps a prepared handoff signature through a stale ledger and disables all writes until fresh again', async () => {
  const view = await load(claimed);
  fireEvent.click(screen.getByRole('button', { name: /^Produce signature$/ }));
  const signature = (screen.getByLabelText(/^Signature \(hex/) as HTMLInputElement).value;
  expect(signature).toHaveLength(128);
  boundary.fresh = false; view.rerender(<FadePanel wallet={wallet} />);
  expect((screen.getByLabelText(/^Signature \(hex/) as HTMLInputElement).value).toBe(signature);
  expect((screen.getByRole('button', { name: /^Confirm handoff$/ }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: /^Confirm handoff$/ }));
  expect(client.confirm_handoff).not.toHaveBeenCalled();
  boundary.fresh = true; view.rerender(<FadePanel wallet={wallet} />);
  expect((screen.getByRole('button', { name: /^Confirm handoff$/ }) as HTMLButtonElement).disabled).toBe(false);
  expect((screen.getByLabelText(/^Signature \(hex/) as HTMLInputElement).value).toBe(signature);
});

it.each(['error', 'missing'])('does not resubmit a confirmed claim if its record refresh returns %s', async (failure) => {
  await load(); client.claim.mockImplementationOnce(async () => { confirmClaimAt(1005); });
  if (failure === 'error') client.get_fade.mockRejectedValueOnce(new Error('RPC unavailable'));
  else client.get_fade.mockResolvedValueOnce(null);
  fireEvent.click(screen.getByRole('button', { name: /^Claim at/ }));
  await screen.findByRole('alert');
  expect(listEntries()).toEqual([expect.objectContaining({ amount: null, txHash: claimHash })]);
  expect(listTransactionAttempts(claimScope)[0].status).toBe('success');
  expect((screen.getByRole('button', { name: /^Claim at/ }) as HTMLButtonElement).disabled).toBe(true);
  client.get_fade.mockResolvedValueOnce({ ...fade, state: 1, claimant: wallet.address, claimed_at: 1005 });
  fireEvent.click(screen.getByRole('button', { name: /^Refresh record$/ }));
  await waitFor(() => expect(client.get_fade).toHaveBeenCalledTimes(3));
  await waitFor(() => expect(listEntries()[0]).toMatchObject({ amount: '-50000000', txHash: claimHash }));
  expect(listEntries()).toHaveLength(1);
  expect(client.claim).toHaveBeenCalledTimes(1);
});

it('loads a valid shared record URL read-only and rejects out-of-range record events', async () => {
  history.replaceState(null, '', '/app/?tab=fade&ref=3');
  render(<FadePanel wallet={wallet} />);
  await screen.findByRole('button', { name: /^New fade$/i });
  expect(client.get_fade).toHaveBeenCalledWith(3n);
  expect(client.claim).not.toHaveBeenCalled();
  fireEvent(window, new CustomEvent('agyion:open-record', { detail: { tab: 'fade', id: '18446744073709551616' } }));
  fireEvent(window, new CustomEvent('agyion:open-record', { detail: { tab: 'pod', id: '7' } }));
  expect(client.get_fade).toHaveBeenCalledTimes(1);
  client.get_fade.mockResolvedValue({ ...fade, id: 7n });
  fireEvent(window, new CustomEvent('agyion:open-record', { detail: { tab: 'fade', id: '7' } }));
  await screen.findByText('fade #7');
  expect(client.get_fade).toHaveBeenLastCalledWith(7n);
});

it('recovers the saved venue for an older record even when a different legacy identity exists', async () => {
  sessionStorage.setItem('agyion.venueSecret', 'fixture-secret-7');
  const initial = render(<FadePanel wallet={wallet} />);
  expect((screen.getByLabelText(/^Venue pubkey/) as HTMLInputElement).value).toBe('7'.padStart(64, '0'));
  initial.unmount();
  sessionStorage.setItem('agyion.venueSecret', 'fixture-secret-9');
  await load({ ...claimed, venue_pubkey: '7'.padStart(64, '0') });
  expect((screen.getByLabelText(/^Venue secret \(demo signer/) as HTMLInputElement).value).toBe('fixture-secret-7');
});

it.each([
  { state: 1 as const, claimedAt: 990, amount: '10USDC', receives: false },
  { state: 1 as const, claimedAt: 1005, amount: '-5USDC', receives: true },
  { state: 2 as const, claimedAt: 990, amount: '10USDC', receives: false },
])('keeps the claim price and payment direction when ledger advances: $state / $claimedAt', async ({ state, claimedAt, amount, receives }) => {
  // The curve starts at 100 USDC at ledger 900 and falls 1 USDC per ledger.
  // At ledger 1010 it is -10, but the claim at 990 owes 10, or at 1005 receives 5.
  boundary.ledger = 1010;
  const view = await load({ ...claimed, state, claimed_at: claimedAt });
  const quote = () => view.container.querySelector('.instrument-main .tnum.display')?.textContent;
  expect(quote()).toBe(amount);
  expect(screen.queryByText(/Below zero/)).toBeNull();
  expect(screen.queryByText(/Claimant receives the frozen amount/) !== null).toBe(receives);
  expect(screen.queryByText(/Claimant pays the frozen amount/) !== null).toBe(state === 1 && !receives);
  boundary.ledger = 1020;
  view.rerender(<FadePanel wallet={wallet} />);
  expect(quote()).toBe(amount);
});

it('keeps an open listing price live and identifies curve scrubbing as a preview', async () => {
  boundary.ledger = 990;
  const view = await load();
  const quote = () => view.container.querySelector('.instrument-main .tnum.display')?.textContent;
  expect(quote()).toBe('10USDC');
  boundary.ledger = 1005;
  view.rerender(<FadePanel wallet={wallet} />);
  expect(quote()).toBe('-5USDC');
  expect(screen.getByText(/Below zero/)).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('slider', { name: 'Preview ledger' }), { key: 'Home' });
  expect(quote()).toBe('100USDC');
  expect(screen.getByText(/Preview at dragged ledger/)).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('slider', { name: 'Preview ledger' }), { key: 'Escape' });
  expect(quote()).toBe('-5USDC');
});

it('keeps the actual frozen amount visible while previewing another ledger', async () => {
  boundary.ledger = 1010;
  const view = await load(claimed);
  fireEvent.keyDown(screen.getByRole('slider', { name: 'Preview ledger' }), { key: 'Home' });
  expect(view.container.querySelector('.instrument-main .tnum.display')?.textContent).toBe('100USDC');
  expect(screen.getByText('Frozen price').parentElement?.textContent).toBe('Frozen price10 USDC');
  expect(screen.getByText(/Preview at dragged ledger/)).toBeTruthy();
  expect(client.confirm_handoff).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole('slider', { name: 'Preview ledger' }), { key: 'Escape' });
  expect(view.container.querySelector('.instrument-main .tnum.display')?.textContent).toBe('10USDC');
  expect(screen.getByRole('slider', { name: 'Preview ledger' }).getAttribute('aria-valuetext')).toBe('Ledger 990. Frozen at claim');
});
