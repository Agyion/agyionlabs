// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Fade } from '../app/lib/hakClient';
import type { WalletState } from '../app/lib/useWallet';

const boundary = vi.hoisted(() => ({ getClient: vi.fn(), mockClient: vi.fn(), generation: 0, fresh: true, ledger: 1000 as number | null }));
vi.mock('../app/lib/config', () => ({ IS_MOCK: false, CONFIG: { mode: 'soroban', decimals: 7, assetCode: 'USDC', assetContractId: 'contract' } }));
vi.mock('../app/lib/client', () => ({ getClient: boundary.getClient, mockClient: boundary.mockClient, SECONDS_PER_LEDGER: 5 }));
vi.mock('../app/lib/useLedger', () => ({ useLedger: () => boundary.fresh ? boundary.ledger : null, useLedgerStatus: () => ({ ledger: boundary.ledger, fresh: boundary.fresh, status: boundary.fresh ? 'fresh' : 'stale', refresh: vi.fn() }) }));
vi.mock('../app/lib/wallet', () => ({ demoAddress: () => 'GDEMO', onWalletSessionChange: () => () => {} }));
vi.mock('../app/lib/ledgerLog', () => ({ logEntry: vi.fn() }));
// Crypto is an external boundary here: jsdom/native typed-array realms differ.
// Each generation is distinct so silent form-driven identity changes are visible.
vi.mock('../app/lib/signers', async (original) => ({
  ...await original<typeof import('../app/lib/signers')>(),
  newKeypair: () => { const n = ++boundary.generation; return { secret: `fixture-secret-${n}`, pubkeyHex: String(n).padStart(64, '0'), address: 'GKEYFIXTURE' }; },
  publicKeyHex: (secret: string) => { if (!/^fixture-secret-\d+$/.test(secret)) throw new Error('Invalid fixture secret'); return secret.replace('fixture-secret-', '').padStart(64, '0'); },
  signHandoff: () => 'ab'.repeat(64),
}));
import FadePanel from '../app/components/app/FadePanel';

const wallet: WalletState = { address: 'GCONNECTED', label: 'Fixture wallet, no signer', demo: false, connecting: false, error: null, connectKit: async () => {}, useTestSecret: () => {}, disconnect: async () => {} };
const fade: Fade = { id: 3n, seller: 'GCONNECTED', asset: 'contract', pot: 10000000000n, start_price: 1000000000n, floor_price: -100000000n, start_ledger: 900, deadline_ledger: 1100, handoff_window: 50, slope_num: 10000000n, slope_den: 1n, venue_pubkey: '1'.padStart(64, '0'), state: 0, claimant: null, claimed_at: null };
const claimed: Fade = { ...fade, state: 1, claimant: 'GCLAIMANT', claimed_at: 990 };
let client: { get_fade: ReturnType<typeof vi.fn>; claim: ReturnType<typeof vi.fn>; refund: ReturnType<typeof vi.fn>; confirm_handoff: ReturnType<typeof vi.fn> };
beforeEach(() => {
  sessionStorage.clear(); boundary.generation = 0; boundary.fresh = true; boundary.ledger = 1000;
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
  await load(); client.claim.mockResolvedValue(undefined);
  if (failure === 'error') client.get_fade.mockRejectedValueOnce(new Error('RPC unavailable'));
  else client.get_fade.mockResolvedValueOnce(null);
  fireEvent.click(screen.getByRole('button', { name: /^Claim at/ }));
  await screen.findByRole('alert');
  expect((screen.getByRole('button', { name: /^Claim at/ }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: /^Refresh record$/ }));
  await waitFor(() => expect(client.get_fade).toHaveBeenCalledTimes(3));
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
