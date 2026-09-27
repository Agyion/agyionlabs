// @vitest-environment jsdom
import React from 'react';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Fade, Mandate, Pod, Trigger } from '../app/lib/hakClient';
import type { WalletState } from '../app/lib/useWallet';

const boundary = vi.hoisted(() => ({ mock: false, signer: null as unknown, walletVersion: 0, walletListeners: new Set<() => void>(), getClient: vi.fn(), mockClient: vi.fn(), listEntries: vi.fn(), buildProofPack: vi.fn(), downloadProofPack: vi.fn(), authenticate: vi.fn(), depositTry: vi.fn(), withdrawTry: vi.fn(), transactionStatus: vi.fn(), sendAnchorPayment: vi.fn(), listAnchorPayments: vi.fn(), reconcileAnchorPayments: vi.fn(), loadAccount: vi.fn(), tryUsdcPrice: vi.fn() }));
vi.mock('../app/lib/config', () => ({ get IS_MOCK() { return boundary.mock; }, CONFIG: { decimals: 7, assetCode: 'USDC', assetContractId: 'contract', anchorUrl: 'https://anchor.invalid', assetAddress: 'issuer' } }));
vi.mock('../app/lib/client', () => ({ getClient: boundary.getClient, mockClient: boundary.mockClient, SECONDS_PER_LEDGER: 5 }));
vi.mock('../app/lib/useLedger', () => ({ useLedger: () => 1000, useLedgerStatus: () => ({ ledger: 1000, fresh: true, status: 'fresh', refresh: vi.fn() }) }));
vi.mock('../app/lib/wallet', () => ({ demoAddress: () => 'GDEMO', defaultSigner: () => boundary.signer, walletSessionVersion: () => boundary.walletVersion, onWalletSessionChange: (listener: () => void) => { boundary.walletListeners.add(listener); return () => boundary.walletListeners.delete(listener); } }));
vi.mock('../app/lib/signers', async (importOriginal) => ({ ...await importOriginal<typeof import('../app/lib/signers')>(), newKeypair: () => ({ secret: 'test-only-secret', pubkeyHex: 'ab'.repeat(32) }), publicKeyHex: () => 'ab'.repeat(32), podPublicKey: (seed:string) => { if (!/^[a-f0-9]{64}$/i.test(seed)) throw new Error('Invalid Pod secret'); return 'ab'.repeat(32); }, signPodCreation: () => 'bc'.repeat(64), signPodClaim: () => 'cd'.repeat(64), signEnvoy: () => 'ef'.repeat(64) }));
vi.mock('../app/lib/ledgerLog', async (importOriginal) => ({ ...await importOriginal<typeof import('../app/lib/ledgerLog')>(), logEntry: vi.fn(), listEntries: boundary.listEntries, clearLog: vi.fn(), buildProofPack: boundary.buildProofPack, downloadProofPack: boundary.downloadProofPack }));
vi.mock('../app/lib/anchor', () => ({ AnchorError: class extends Error {}, sep6Info: async () => ({}), tryUsdcPrice: boundary.tryUsdcPrice, authenticate: boundary.authenticate, depositTry: boundary.depositTry, withdrawTry: boundary.withdrawTry, transactionStatus: boundary.transactionStatus }));
vi.mock('../app/lib/anchorPayments', () => ({ listAnchorPayments: boundary.listAnchorPayments }));
vi.mock('../app/lib/accountOps', () => ({ reconcileAnchorPayments: boundary.reconcileAnchorPayments, sendAnchorPayment: boundary.sendAnchorPayment, createAssetTrustline: vi.fn(), friendbotFund: vi.fn() }));
vi.mock('@stellar/stellar-sdk', async (importOriginal) => { const actual = await importOriginal<typeof import('@stellar/stellar-sdk')>(); return { ...actual, Horizon: { ...actual.Horizon, Server: class { loadAccount = boundary.loadAccount; } } }; });

import PodPanel from '../app/components/app/PodPanel';
import TriggerPanel from '../app/components/app/TriggerPanel';
import EnvoyPanel from '../app/components/app/EnvoyPanel';
import FadePanel from '../app/components/app/FadePanel';
import LedgerPanel from '../app/components/app/LedgerPanel';
import RampPanel from '../app/components/app/RampPanel';
import { InstrumentActivity } from '../app/lib/instrumentActivity';
import { draftAmount } from '../app/components/app/instrumentPresentation';
import { clearLog } from '../app/lib/ledgerLog';

const connected: WalletState = { address: 'GCONNECTED', label: 'Wallet', demo: false, connecting: false, error: null, connectKit: async () => {}, useTestSecret: () => {}, disconnect: async () => {} };
const disconnected = { ...connected, address: null };
const pod: Pod = { id: 7n, funder: 'GCONNECTED', asset: 'contract', amount: 5000000000n, unlock_ledger: 900, claim_pubkey: 'ab'.repeat(32), state: 0 };
const trigger: Trigger = { id: 9n, funder: 'GCONNECTED', asset: 'contract', amount: 7500000000n, beneficiary: 'GBENEFICIARY', attester_pubkey: 'ab'.repeat(32), deadline_ledger: 900, state: 0 };
const fade: Fade = { id: 3n, seller: 'GCONNECTED', asset: 'contract', pot: 10000000000n, start_price: 1000000000n, floor_price: -100000000n, start_ledger: 900, deadline_ledger: 1100, handoff_window: 50, slope_num: 10000000n, slope_den: 1n, venue_pubkey: 'ab'.repeat(32), state: 0, claimant: null, claimed_at: null };
const mandate: Mandate = { id: 4n, owner: 'GCONNECTED', agent_pubkey: 'ab'.repeat(32), max_per_tx: 2000000000n, daily_cap: 5000000000n, daily_used: 0n, window_start: 900, valid_until: 1500, revoked: false, claims_used: 0 };
let client: {
  currentLedger: ReturnType<typeof vi.fn>; create_pod: ReturnType<typeof vi.fn>; get_pod: ReturnType<typeof vi.fn>; claim_pod: ReturnType<typeof vi.fn>;
  create_trigger: ReturnType<typeof vi.fn>; get_trigger: ReturnType<typeof vi.fn>; refund_trigger: ReturnType<typeof vi.fn>;
  get_mandate: ReturnType<typeof vi.fn>; get_fade: ReturnType<typeof vi.fn>;
  envoy_claim: ReturnType<typeof vi.fn>;
  create_fade: ReturnType<typeof vi.fn>; create_mandate: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  boundary.mock = false;
  boundary.signer = null;
  boundary.walletVersion = 0;
  window.sessionStorage.clear();
  vi.stubGlobal('crypto', webcrypto);
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addListener() {}, removeListener() {} }) });
  client = {
    currentLedger: vi.fn().mockResolvedValue(1000), create_pod: vi.fn().mockResolvedValue(7n), get_pod: vi.fn().mockResolvedValue(pod), claim_pod: vi.fn().mockImplementation(async () => { client.get_pod.mockResolvedValue({ ...pod, state: 1 }); }),
    create_trigger: vi.fn().mockResolvedValue(9n), get_trigger: vi.fn().mockResolvedValue(trigger), refund_trigger: vi.fn().mockImplementation(async () => { client.get_trigger.mockResolvedValue({ ...trigger, state: 2 }); }),
    get_mandate: vi.fn().mockResolvedValue(null), get_fade: vi.fn().mockResolvedValue(fade),
    envoy_claim: vi.fn().mockResolvedValue(undefined),
    create_fade: vi.fn().mockResolvedValue(3n), create_mandate: vi.fn().mockResolvedValue(4n),
  };
  boundary.getClient.mockReset().mockReturnValue(client);
  boundary.mockClient.mockReset().mockReturnValue(null);
  boundary.listEntries.mockReset().mockReturnValue([]);
  boundary.buildProofPack.mockReset().mockResolvedValue({ signature: null, signer: null, checksum: 'abc123' });
  boundary.downloadProofPack.mockReset();
  boundary.authenticate.mockReset().mockResolvedValue('session-a');
  boundary.withdrawTry.mockReset().mockResolvedValue({ id: 'withdrawal-a', accountId: 'GANCHOR', memoType: 'text', memo: 'MEMO-A' });
  boundary.depositTry.mockReset().mockResolvedValue({ id: 'deposit-a', bankName: 'Bank A', iban: 'TRTEST', transferMemo: 'DEP-A', how: 'Simulated transfer' });
  boundary.transactionStatus.mockReset().mockResolvedValue({ id: 'withdrawal-a', kind: 'withdrawal', status: 'pending_user_transfer_start' });
  boundary.listAnchorPayments.mockReset().mockReturnValue([]);
  boundary.reconcileAnchorPayments.mockReset().mockResolvedValue(undefined);
  boundary.sendAnchorPayment.mockReset().mockImplementation(async () => { boundary.listAnchorPayments.mockReturnValue([{withdrawalId:'withdrawal-a',hash:'a'.repeat(64),status:'success',amount:'20',assetCode:'USDC'}]); return 'a'.repeat(64); });
  boundary.loadAccount.mockReset().mockResolvedValue({ balances: [] });
  boundary.tryUsdcPrice.mockReset().mockResolvedValue(null);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const preparePod = () => {
  fireEvent.click(screen.getByRole('button', { name: /prepare pod secret/i }));
  fireEvent.click(screen.getByRole('checkbox', { name: /^I saved this secret outside this page/i }));
};

describe('read-only instrument drafts', () => {
  it.each([
    ['0.009', '0.009 USDC'],
    ['-0.009', '-0.009 USDC'],
    ['0.0000001', '0.0000001 USDC'],
    ['1200', '1,200 USDC'],
    ['NaN', 'Enter a valid amount'],
  ])('keeps draft display precision for %s', (input, expected) => {
    expect(draftAmount(input)).toBe(expected);
  });
  it('updates the Fade curve from entered terms without submitting a transaction', () => {
    render(<FadePanel wallet={connected} />);
    fireEvent.change(screen.getByLabelText(/^start price/i), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText(/^floor price/i), { target: { value: '-25' } });
    fireEvent.change(screen.getByLabelText(/^duration \(minutes\)/i), { target: { value: '10' } });
    expect(screen.getByRole('img', { name: 'Draft price curve from 100 to -25 USDC over 120 ledgers' })).toBeTruthy();
    expect(client.create_fade).not.toHaveBeenCalled();
    expect(client.currentLedger).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/^floor price/i), { target: { value: '150' } });
    expect(screen.queryByRole('img', { name: /draft price curve/i })).toBeNull();
    expect(screen.getByText(/floor must not exceed the start price/i)).toBeTruthy();
    expect(client.create_fade).not.toHaveBeenCalled();
  });

  it('preserves signed sub-cent prices in Fade draft curve labels and its accessible name', () => {
    render(<FadePanel wallet={connected} />);
    fireEvent.change(screen.getByLabelText(/^start price/i), { target: { value: '0.009' } });
    fireEvent.change(screen.getByLabelText(/^floor price/i), { target: { value: '-0.001' } });
    const curve = screen.getByRole('img', { name: /^Draft price curve from 0\.009 to -0\.001 USDC/ });
    expect(Array.from(curve.querySelectorAll('.curve-value')).map((label) => label.textContent)).toEqual(['0.009', '-0.001']);
    expect(client.create_fade).not.toHaveBeenCalled();
    expect(client.currentLedger).not.toHaveBeenCalled();
  });

  it('shows the actual minimum Pod ledger delay without inventing an unlock date', () => {
    render(<PodPanel wallet={connected} />);
    fireEvent.change(screen.getByLabelText(/^unlock in \(minutes\)/i), { target: { value: '0.25' } });
    expect(screen.getByText('~50s · 10 ledgers')).toBeTruthy();
    expect(client.create_pod).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/generated pod secret/i)).toBeNull();
  });

  it('projects Pod secret preparation and acknowledgement without exposing its value in the diagram', () => {
    render(<PodPanel wallet={connected} />);
    expect(screen.getByRole('img', { name: /Pod draft.*Secret: Not prepared/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /prepare pod secret/i }));
    const secret = (screen.getByLabelText('Generated Pod secret') as HTMLInputElement).value;
    expect(screen.getByRole('img', { name: /Pod draft.*Secret: Save the secret/ }).outerHTML).not.toContain(secret);
    fireEvent.click(screen.getByRole('checkbox', { name: /^I saved this secret outside this page/i }));
    expect(screen.getByRole('img', { name: /Pod draft.*Secret: Marked as saved/ })).toBeTruthy();
    expect(client.create_pod).not.toHaveBeenCalled();
  });

  it('shows the entered Trigger beneficiary and key as terms, without claiming proof verification', () => {
    render(<TriggerPanel wallet={connected} />);
    fireEvent.change(screen.getByLabelText(/^Beneficiary/), { target: { value: 'GBENEFICIARY' } });
    fireEvent.change(screen.getByLabelText(/^Attester pubkey/), { target: { value: 'ab'.repeat(32) } });
    const gate = screen.getByRole('img', { name: /Draft escrow:.*pays GBENEFICIARY.*entered, not verified/ });
    expect(gate.getAttribute('aria-label')).toContain('after the deadline the funder may refund');
    expect(client.create_trigger).not.toHaveBeenCalled();
  });

  it('keeps secondary contract monetary fields precise and clears invalid capacity', () => {
    render(<EnvoyPanel wallet={connected} />);
    fireEvent.click(screen.getByText('Contract monetary fields'));
    screen.getByText('Contract monetary fields').closest('details')!.open = true;
    fireEvent.change(screen.getByLabelText(/^Max per tx/), { target: { value: '125' } });
    fireEvent.change(screen.getByLabelText(/^Daily cap/), { target: { value: '500' } });
    const diagram = screen.getByRole('img', { name: /Draft authority:.*Per claim 125 USDC, daily cap 500 USDC/ });
    expect((diagram.querySelector('.mandate-limits__track i') as HTMLElement).style.width).toBe('25%');
    expect(diagram.getAttribute('aria-label')).toContain('not spending');
    fireEvent.change(screen.getByLabelText(/^Max per tx/), { target: { value: 'invalid' } });
    expect(diagram.querySelector('.mandate-limits__track i')).toBeNull();
    expect(client.create_mandate).not.toHaveBeenCalled();
  });

  it('preserves sub-cent Envoy limits in its secondary contract diagram and accessible description', () => {
    render(<EnvoyPanel wallet={connected} />);
    fireEvent.click(screen.getByText('Contract monetary fields'));
    screen.getByText('Contract monetary fields').closest('details')!.open = true;
    fireEvent.change(screen.getByLabelText(/^Max per tx/), { target: { value: '0.009' } });
    fireEvent.change(screen.getByLabelText(/^Daily cap/), { target: { value: '0.018' } });
    const diagram = screen.getByRole('img', { name: /Draft authority:.*Per claim 0\.009 USDC, daily cap 0\.018 USDC/ });
    expect(diagram.textContent).toContain('0.009 USDC');
    expect(diagram.textContent).toContain('0.018 USDC');
    expect((diagram.querySelector('.mandate-limits__track i') as HTMLElement).style.width).toBe('50%');
    expect(client.create_mandate).not.toHaveBeenCalled();
  });

  it('keeps Ramp draft directions separate from exchange quotes and preserves both amounts', () => {
    render(<RampPanel wallet={disconnected} />);
    fireEvent.change(screen.getByLabelText(/^TRY amount/), { target: { value: '1750' } });
    expect(screen.getByRole('img', { name: /^Draft deposit: 1,750 TRY to USDC on Stellar testnet/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    fireEvent.change(screen.getByLabelText(/^Amount \(USDC\)/), { target: { value: '32' } });
    expect(screen.getByRole('img', { name: /^Draft withdraw: 32 USDC to simulated TRY payout/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Deposit' }));
    expect(screen.getByRole('img', { name: /^Draft deposit: 1,750 TRY/ })).toBeTruthy();
    expect(boundary.depositTry).not.toHaveBeenCalled();
    expect(boundary.withdrawTry).not.toHaveBeenCalled();
  });

  it('counts only actual local Ledger entries and recorded hashes without calling them verified', () => {
    const entry = { seq: 1, ts: '2026-09-25T00:00:00Z', ledger: 1000, template: 'fade', action: 'create_fade', refId: '3', amount: '10000000000', status: 'locked', detail: 'Local record', txHash: null };
    boundary.listEntries.mockReturnValue([entry, { ...entry, seq: 2, txHash: 'ab'.repeat(32) }]);
    render(<LedgerPanel wallet={connected} />);
    const summary = screen.getByLabelText('Local record summary');
    expect(Array.from(summary.querySelectorAll('dd')).map((node) => node.textContent)).toEqual(['2', '1', 'This browser']);
    expect(summary.textContent).not.toMatch(/verified|confirmed/i);
    fireEvent.click(screen.getByRole('button', { name: 'Clear history' }));
    expect(Array.from(summary.querySelectorAll('dd')).map((node) => node.textContent)).toEqual(['0', '0', 'This browser']);
    expect(boundary.buildProofPack).not.toHaveBeenCalled();
  });

  it('retains Ledger history and shows the clear error when its durable marker cannot be saved', () => {
    boundary.listEntries.mockReturnValue([{ seq: 1, ts: '2026-09-25T00:00:00Z', ledger: 1000, template: 'fade', action: 'create_fade', refId: '3', amount: '10000000000', status: 'locked', detail: 'Local record', txHash: null }]);
    vi.mocked(clearLog).mockImplementationOnce(() => { throw new Error('Clear marker could not be saved.'); });
    render(<LedgerPanel wallet={connected} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear history' }));
    expect(screen.getByText('Clear marker could not be saved.')).toBeTruthy();
    expect(screen.getByLabelText('Local record summary').querySelector('dd')?.textContent).toBe('1');
    expect(screen.getByRole('button', { name: 'Clear history' }).hasAttribute('disabled')).toBe(false);
  });

  it('preserves a valid sub-cent Ramp amount in the visual and accessible draft', () => {
    render(<RampPanel wallet={disconnected} />);
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    fireEvent.change(screen.getByLabelText(/^Amount \(USDC\)/), { target: { value: '0.009' } });
    const fractional = screen.getByRole('img', { name: /^Draft withdraw: 0\.009 USDC/ });
    expect(fractional.querySelector('.exchange-route__amount')?.textContent).toBe('0.009');
    fireEvent.change(screen.getByLabelText(/^Amount \(USDC\)/), { target: { value: '20' } });
    const whole = screen.getByRole('img', { name: /^Draft withdraw: 20 USDC/ });
    expect(whole.querySelector('.exchange-route__amount')?.textContent).toBe('20');
    expect(boundary.withdrawTry).not.toHaveBeenCalled();
    expect(boundary.sendAnchorPayment).not.toHaveBeenCalled();
  });
});

describe('Pod secret recovery', () => {
  it('clears prepared and entered credentials when the workspace closes or wallet session changes',async()=>{
    const view=render(<InstrumentActivity.Provider value={true}><PodPanel wallet={connected}/></InstrumentActivity.Provider>);
    preparePod();
    fireEvent.change(screen.getByLabelText(/load pod by id/i),{target:{value:'7'}});fireEvent.click(screen.getByRole('button',{name:/^load$/i}));
    await screen.findByRole('heading',{name:'Pod #7'});
    fireEvent.change(screen.getByLabelText(/^Pod secret/i),{target:{value:'11'.repeat(32)}});
    view.rerender(<InstrumentActivity.Provider value={false}><PodPanel wallet={connected}/></InstrumentActivity.Provider>);
    expect(screen.queryByLabelText(/generated Pod secret/i)).toBeNull();expect((screen.getByLabelText(/^Pod secret/i) as HTMLInputElement).value).toBe('');
    view.rerender(<InstrumentActivity.Provider value={true}><PodPanel wallet={connected}/></InstrumentActivity.Provider>);preparePod();
    act(()=>{boundary.walletVersion++;boundary.walletListeners.forEach(listener=>listener())});
    expect(screen.queryByLabelText(/generated Pod secret/i)).toBeNull();
  });
  it('does not continue creation after closing while the ledger check is pending',async()=>{
    let finish!:(ledger:number)=>void;client.currentLedger.mockImplementation(()=>new Promise<number>(r=>{finish=r}));
    const view=render(<InstrumentActivity.Provider value={true}><PodPanel wallet={connected}/></InstrumentActivity.Provider>);
    preparePod();fireEvent.click(screen.getByRole('button',{name:/bury the pod/i}));
    view.rerender(<InstrumentActivity.Provider value={false}><PodPanel wallet={connected}/></InstrumentActivity.Provider>);
    await act(async()=>{finish(1000)});expect(client.create_pod).not.toHaveBeenCalled();
  });

  it('requires saving the secret before submission and retains it after an ambiguous timeout', async () => {
    let failSubmission!: (error: Error) => void;
    client.create_pod.mockImplementation(() => new Promise<bigint>((_resolve, reject) => { failSubmission = reject; }));
    render(<PodPanel wallet={connected} />);
    expect((screen.getByRole('button', { name: /bury the pod/i }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /prepare pod secret/i }));
    const secret = (screen.getByLabelText(/generated pod secret/i) as HTMLInputElement).value;
    expect(secret).toMatch(/^[a-f0-9]{64}$/);
    expect(client.create_pod).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: /bury the pod/i }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /^I saved this secret outside this page/i }));
    fireEvent.click(screen.getByRole('button', { name: /bury the pod/i }));
    await waitFor(() => expect(client.create_pod).toHaveBeenCalledTimes(1));
    expect(client.create_pod.mock.calls[0].map(String)).not.toContain(secret);
    expect(client.create_pod.mock.calls[0].slice(4)).toEqual(['ab'.repeat(32),'bc'.repeat(64)]);
    expect((screen.getByLabelText(/generated pod secret/i) as HTMLInputElement).value).toBe(secret);
    await act(async () => { failSubmission(new Error('Submission timed out')); });
    expect((await screen.findByRole('alert')).textContent).toMatch(/network request failed|could not be confirmed/i);
    expect(screen.getByRole('alert').textContent).not.toMatch(/retry/i);
    expect(screen.getByText(/submission may still confirm/i)).toBeTruthy();
    expect((screen.getByLabelText(/generated pod secret/i) as HTMLInputElement).value).toBe(secret);
    expect((screen.getByRole('button', { name: /bury the pod/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /prepare another pod/i }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /saved this secret and checked the previous transaction/i }));
    fireEvent.click(screen.getByRole('button', { name: /prepare another pod/i }));
    expect((screen.getByLabelText(/generated pod secret/i) as HTMLInputElement).value).not.toBe(secret);
    expect((screen.getByRole('checkbox', { name: /^I saved this secret outside this page/i }) as HTMLInputElement).checked).toBe(false);
    expect(client.create_pod).toHaveBeenCalledTimes(1);
  });
});

describe('create duration validation in mock mode', () => {
  const cases = [
    { name: 'Pod', Panel: PodPanel, label: /unlock in \(minutes\)/i, action: /bury the pod/i, method: 'create_pod' as const, prepare: preparePod },
    { name: 'Trigger', Panel: TriggerPanel, label: /deadline \(minutes\)/i, action: /lock the escrow/i, method: 'create_trigger' as const, prepare: () => fireEvent.click(screen.getByRole('button', { name: /generate demo key/i })) },
    { name: 'Envoy', Panel: EnvoyPanel, label: /valid for \(minutes\)/i, action: /grant mandate/i, method: 'create_mandate' as const, prepare: () => fireEvent.click(screen.getByRole('button', { name: /generate agent key/i })) },
    { name: 'Fade duration', Panel: FadePanel, label: /duration \(minutes\)/i, action: /lock the pot/i, method: 'create_fade' as const, prepare: () => {} },
    { name: 'Fade handoff', Panel: FadePanel, label: /handoff window \(minutes\)/i, action: /lock the pot/i, method: 'create_fade' as const, prepare: () => {} },
  ];
  it.each(cases.flatMap((item) => ['NaN', 'Infinity', '-1', '0', '1e50'].map((value) => ({ ...item, value }))))('$name rejects $value before calling the write method', async ({ Panel, label, action, method, prepare, value }) => {
    boundary.mock = true;
    render(<Panel wallet={connected} />);
    prepare();
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: action }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/minutes|duration|ledger|handoff|validity|deadline|unlock/i);
    expect(client[method]).not.toHaveBeenCalled();
  });

  it.each(cases.filter((item) => item.name !== 'Fade handoff'))('$name rejects a deadline beyond its final usable ledger', async ({ Panel, label, action, method, prepare }) => {
    boundary.mock = true;
    client.currentLedger.mockResolvedValue(0xffff_fffa);
    render(<Panel wallet={connected} />);
    prepare();
    fireEvent.change(screen.getByLabelText(label), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: action }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/ledger/i);
    expect(client[method]).not.toHaveBeenCalled();
  });

  it.each(cases)('$name still accepts a finite positive duration', async ({ Panel, label, action, method, prepare }) => {
    boundary.mock = true;
    render(<Panel wallet={connected} />);
    prepare();
    fireEvent.change(screen.getByLabelText(label), { target: { value: '0.25' } });
    fireEvent.click(screen.getByRole('button', { name: action }));
    await waitFor(() => expect(client[method]).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each(cases.filter((item) => item.name.startsWith('Fade')))('$name enforces the contract limit of one million ledgers', async ({ Panel, label, action, method, prepare }) => {
    boundary.mock = true;
    render(<Panel wallet={connected} />);
    prepare();
    fireEvent.change(screen.getByLabelText(label), { target: { value: '100000' } });
    fireEvent.click(screen.getByRole('button', { name: action }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/ledger duration/i);
    expect(client[method]).not.toHaveBeenCalled();
  });

  it('leaves a ledger after the Trigger deadline for refund', async () => {
    boundary.mock = true;
    client.currentLedger.mockResolvedValue(0xffff_ffff - 12);
    render(<TriggerPanel wallet={connected} />);
    fireEvent.click(screen.getByRole('button', { name: /generate demo key/i }));
    fireEvent.change(screen.getByLabelText(/deadline \(minutes\)/i), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /lock the escrow/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/final usable ledger/i);
    expect(client.create_trigger).not.toHaveBeenCalled();
  });

  it('leaves a ledger after the Fade handoff window for refund', async () => {
    boundary.mock = true;
    client.currentLedger.mockResolvedValue(0xffff_ffff - 66);
    render(<FadePanel wallet={connected} />);
    fireEvent.change(screen.getByLabelText(/duration \(minutes\)/i), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /lock the pot/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/final usable ledger/i);
    expect(client.create_fade).not.toHaveBeenCalled();
  });
});

describe('record loading', () => {
  it.each([{ name: 'Pod', Panel: PodPanel, label: /load pod by id/i, method: 'get_pod' as const }, { name: 'Envoy', Panel: EnvoyPanel, label: /load mandate by id/i, method: 'get_mandate' as const }])('$name rejects a malformed ID visibly without calling the client', async ({ Panel, label, method }) => {
    render(<Panel wallet={connected} />);
    fireEvent.change(screen.getByLabelText(label), { target: { value: 'not-an-id' } });
    fireEvent.click(screen.getByRole('button', { name: /^load$/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/id/i);
    expect((screen.getByRole('button', { name: /^load$/i }) as HTMLButtonElement).disabled).toBe(false);
    expect(client[method]).not.toHaveBeenCalled();
  });

  it.each([{ name: 'Pod', Panel: PodPanel, label: /load pod by id/i }, { name: 'Envoy', Panel: EnvoyPanel, label: /load mandate by id/i }])('$name catches a synchronous missing-wallet error and allows retry', async ({ Panel, label }) => {
    render(<Panel wallet={disconnected} />);
    boundary.getClient.mockImplementation(() => { throw new Error('Connect a wallet first'); });
    fireEvent.change(screen.getByLabelText(label), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: /^load$/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/wallet/i);
    expect((screen.getByRole('button', { name: /^load$/i }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('testnet records after actions', () => {
  it('keeps a confirmed Fade ID and retries only its read after a refresh failure', async () => {
    client.get_fade.mockRejectedValueOnce(new Error('RPC unavailable'));
    render(<FadePanel wallet={connected} />);
    fireEvent.click(screen.getByRole('button', { name: /lock the pot/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Fade #3.*created.*load/i);
    expect(screen.getByRole('status').textContent).toMatch(/Fade #3/i);
    expect((screen.getByLabelText(/load fade by id/i) as HTMLInputElement).value).toBe('3');
    expect((screen.getByRole('button', { name: /lock the pot/i }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /^load$/i }));
    expect(await screen.findByRole('slider', { name: /preview ledger/i })).toBeTruthy();
    expect(client.create_fade).toHaveBeenCalledTimes(1);
  });

  it('uses the connected wallet as the default Trigger beneficiary on testnet', async () => {
    render(<TriggerPanel wallet={connected} />);
    fireEvent.click(screen.getByRole('button', { name: /generate demo key/i }));
    fireEvent.click(screen.getByRole('button', { name: /lock the escrow/i }));
    await waitFor(() => expect(client.create_trigger).toHaveBeenCalledTimes(1));
    expect(client.create_trigger.mock.calls[0][3]).toBe('GCONNECTED');
  });

  it('shows the newly created Pod and updates its card after claiming', async () => {
    render(<PodPanel wallet={connected} />);
    preparePod();
    fireEvent.click(screen.getByRole('button', { name: /bury the pod/i }));
    expect(await screen.findByRole('heading', { name: 'Pod #7' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Pod secret/i), { target: { value: '11'.repeat(32) } });
    await waitFor(() => expect((screen.getByRole('button', { name: /open capsule/i }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: /open capsule/i }));
    expect(await screen.findByText('opened')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /open capsule/i })).toBeNull();
  });

  it('preserves the created Pod ID and secret if its subsequent read fails', async () => {
    client.get_pod.mockRejectedValue(new Error('RPC unavailable'));
    render(<PodPanel wallet={connected} />);
    preparePod();
    fireEvent.click(screen.getByRole('button', { name: /bury the pod/i }));
    expect((await screen.findByRole('status')).textContent).toMatch(/Pod #7/);
    expect(await screen.findByText(/Your Pod secret/)).toBeTruthy();
    expect((await screen.findByRole('alert')).textContent).toMatch(/refresh|load|read/i);
  });

  it('rechecks the unlock ledger before sending a recipient-bound signature', async () => {
    render(<PodPanel wallet={connected} />);
    fireEvent.change(screen.getByLabelText(/load pod by id/i), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: /^load$/i }));
    await screen.findByRole('heading', { name: 'Pod #7' });
    fireEvent.change(screen.getByLabelText(/^Pod secret/i), { target: { value: '11'.repeat(32) } });
    expect((screen.getByRole('button', { name: /open capsule/i }) as HTMLButtonElement).disabled).toBe(false);
    client.currentLedger.mockResolvedValue(899);
    fireEvent.click(screen.getByRole('button', { name: /open capsule/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/unlock ledger/i);
    expect(client.claim_pod).not.toHaveBeenCalled();
  });

  it('shows the newly created Trigger and updates its card after refunding', async () => {
    render(<TriggerPanel wallet={connected} />);
    fireEvent.click(screen.getByRole('button', { name: /generate demo key/i }));
    fireEvent.click(screen.getByRole('button', { name: /lock the escrow/i }));
    expect(await screen.findByRole('heading', { name: 'Escrow #9' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /refund to funder/i }));
    expect(await screen.findByText('refunded')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /refund to funder/i })).toBeNull();
  });

  it('loads an existing Trigger by ID so it can be used after revisiting the tab', async () => {
    render(<TriggerPanel wallet={connected} />);
    fireEvent.change(screen.getByLabelText(/load trigger by id/i), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: /^load$/i }));
    expect(await screen.findByRole('heading', { name: 'Escrow #9' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /refund to funder/i })).toBeTruthy();
  });
});

describe('wallet prerequisites', () => {
  it.each([{ name: 'Fade', Panel: FadePanel, action: /create|list the fade|lock the pot/i }, { name: 'Pod', Panel: PodPanel, action: /bury the pod/i }, { name: 'Trigger', Panel: TriggerPanel, action: /lock the escrow/i }, { name: 'Envoy', Panel: EnvoyPanel, action: /grant mandate/i }])('$name explains and disables signing before a wallet connects', ({ Panel, action }) => {
    render(<Panel wallet={disconnected} />);
    expect((screen.getByRole('button', { name: action }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/connect a wallet.*submit/i)).toBeTruthy();
  });

  it('keeps anonymous mock Pod creation available', () => {
    boundary.mock = true;
    render(<PodPanel wallet={disconnected} />);
    preparePod();
    expect((screen.getByRole('button', { name: /bury the pod/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('requires a wallet for external Ramp actions even in mock instrument mode', () => {
    boundary.mock = true;
    render(<RampPanel wallet={disconnected} />);
    expect((screen.getByRole('button', { name: /get deposit instructions/i }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /^withdraw$/i }));
    expect((screen.getByRole('button', { name: /register withdrawal/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Fade preview control', () => {
  const load = async () => {
    render(<FadePanel wallet={connected} />);
    fireEvent.change(screen.getByPlaceholderText(/fade id/i), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /^load$/i }));
    return screen.findByRole('slider', { name: /preview ledger/i });
  };
  it('supports arrows and range bounds from the keyboard', async () => {
    const slider = await load();
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(slider.getAttribute('aria-valuenow')).toBe('1001');
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(slider.getAttribute('aria-valuenow')).toBe('900');
    fireEvent.keyDown(slider, { key: 'End' });
    expect(slider.getAttribute('aria-valuenow')).toBe('1150');
    expect(slider.getAttribute('aria-valuemin')).toBe('900');
    expect(slider.getAttribute('aria-valuemax')).toBe('1150');
  });
  it('returns to the live ledger when a pointer preview ends', async () => {
    const slider = await load();
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 900, top: 0, height: 300, right: 900, bottom: 300, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent(slider, new MouseEvent('pointerdown', { clientX: 250, bubbles: true }));
    expect(slider.getAttribute('aria-valuenow')).not.toBe('1000');
    fireEvent.pointerUp(slider);
    expect(slider.getAttribute('aria-valuenow')).toBe('1000');
    expect(screen.getByText('now: drag me')).toBeTruthy();
  });
});

describe('Proof Pack feedback', () => {
  it('reports an export failure and permits retry', async () => {
    boundary.buildProofPack.mockRejectedValueOnce(new Error('Export unavailable'));
    render(<LedgerPanel wallet={connected} />);
    fireEvent.click(screen.getByRole('button', { name: /download proof pack/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/export unavailable/i);
    fireEvent.click(screen.getByRole('button', { name: /download proof pack/i }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/unsigned/i));
    expect(screen.getByRole('status').textContent).not.toMatch(/connect a test key/i);
  });
});

describe('Ramp wallet and payment boundaries', () => {
  const withSigner = () => { boundary.signer = { address: async () => 'GCONNECTED', signTransaction: vi.fn() }; };
  it('revalidates cached authentication before a subsequent action', async () => {
    withSigner();
    boundary.authenticate.mockResolvedValueOnce('session-a').mockResolvedValueOnce('fresh-session');
    render(<RampPanel wallet={connected} />);
    fireEvent.click(screen.getByRole('button', { name: /get deposit instructions/i }));
    await screen.findByText('Bank A');
    fireEvent.click(screen.getByRole('button', { name: /^withdraw$/i }));
    fireEvent.click(screen.getByRole('button', { name: /register withdrawal/i }));
    await screen.findByRole('button', { name: /send 20 USDC/i });
    expect(boundary.authenticate).toHaveBeenCalledTimes(2);
    expect(boundary.withdrawTry).toHaveBeenCalledWith('fresh-session', '20', 'TR330006100519786457841326');
  });

  it('refreshes the selected withdrawal after a deposit already exists', async () => {
    withSigner();
    render(<RampPanel wallet={connected} />);
    fireEvent.click(screen.getByRole('button', { name: /get deposit instructions/i }));
    await screen.findByText('Bank A');
    fireEvent.click(screen.getByRole('button', { name: /^withdraw$/i }));
    expect(screen.queryByRole('heading', { name: 'Transfer status' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^refresh$/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /register withdrawal/i }));
    await screen.findByRole('button', { name: /send 20 USDC/i });
    fireEvent.click(screen.getByRole('button', { name: /^refresh$/i }));
    await waitFor(() => expect(boundary.transactionStatus).toHaveBeenCalledWith('session-a', 'withdrawal-a'));
    expect(boundary.transactionStatus).not.toHaveBeenCalledWith('session-a', 'deposit-a');
    expect(await screen.findByText('pending_user_transfer_start')).toBeTruthy();
  });

  it('does not show a pending deposit status response after switching to Withdraw', async () => {
    withSigner();
    let finishStatus!: (value: { id: string; kind: string; status: string; message: string }) => void;
    boundary.transactionStatus.mockImplementation(() => new Promise(resolve => { finishStatus = resolve; }));
    render(<RampPanel wallet={connected} />);
    fireEvent.click(screen.getByRole('button', { name: /get deposit instructions/i }));
    await screen.findByText('Bank A');
    fireEvent.click(screen.getByRole('button', { name: /^withdraw$/i }));
    fireEvent.click(screen.getByRole('button', { name: /register withdrawal/i }));
    await screen.findByRole('button', { name: /send 20 USDC/i });
    fireEvent.click(screen.getByRole('button', { name: /^deposit$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^refresh$/i }));
    await waitFor(() => expect(boundary.transactionStatus).toHaveBeenCalledWith('session-a', 'deposit-a'));
    fireEvent.click(screen.getByRole('button', { name: /^withdraw$/i }));
    await act(async () => { finishStatus({ id: 'deposit-a', kind: 'deposit', status: 'completed', message: 'Deposit-only completion' }); });
    expect(screen.queryByText('Deposit-only completion')).toBeNull();
    expect(screen.queryByText('completed')).toBeNull();
    expect(screen.getByText('Refresh to check this transfer with the anchor.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^deposit$/i }));
    expect(screen.getByText('Deposit-only completion')).toBeTruthy();
  });

  it('pays the registered withdrawal amount even if the form is edited afterwards', async () => {
    withSigner();
    render(<RampPanel wallet={connected} />);
    fireEvent.click(screen.getByRole('button', { name: /^withdraw$/i }));
    fireEvent.click(screen.getByRole('button', { name: /register withdrawal/i }));
    await screen.findByRole('button', { name: /send 20 USDC/i });
    fireEvent.change(screen.getByLabelText(/^Amount \(USDC\)/i), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /send 20 USDC/i }));
    await waitFor(() => expect(boundary.sendAnchorPayment).toHaveBeenCalledWith(boundary.signer, 'GCONNECTED', 'GANCHOR', '20', 'text', 'MEMO-A', 'withdrawal-a'));
  });

  it('disables a confirmed withdrawal after payment and after reopening the panel', async () => {
    withSigner();const view=render(<RampPanel wallet={connected} />);
    fireEvent.click(screen.getByRole('button',{name:/^withdraw$/i}));fireEvent.click(screen.getByRole('button',{name:/register withdrawal/i}));
    fireEvent.click(await screen.findByRole('button',{name:/send 20 USDC/i}));
    await waitFor(()=>expect((screen.getByRole('button',{name:/payment confirmed/i}) as HTMLButtonElement).disabled).toBe(true));
    view.unmount();render(<RampPanel wallet={connected} />);
    fireEvent.click(screen.getByRole('button',{name:/^withdraw$/i}));fireEvent.click(screen.getByRole('button',{name:/register withdrawal/i}));
    await waitFor(()=>expect((screen.getByRole('button',{name:/payment confirmed/i}) as HTMLButtonElement).disabled).toBe(true));
    expect(boundary.sendAnchorPayment).toHaveBeenCalledTimes(1);
  });

  it('keeps an uncertain payment blocked and offers read-only hash recovery', async () => {
    withSigner();boundary.listAnchorPayments.mockReturnValue([{withdrawalId:'withdrawal-a',hash:'b'.repeat(64),status:'unknown',amount:'20',assetCode:'USDC'}]);
    render(<RampPanel wallet={connected} />);
    fireEvent.click(screen.getByRole('button',{name:/^withdraw$/i}));fireEvent.click(screen.getByRole('button',{name:/register withdrawal/i}));
    await waitFor(()=>expect((screen.getByRole('button',{name:/payment unresolved/i}) as HTMLButtonElement).disabled).toBe(true));
    fireEvent.click(screen.getByRole('button',{name:/check payment status/i}));
    await waitFor(()=>expect(boundary.reconcileAnchorPayments).toHaveBeenCalledWith('GCONNECTED'));
    expect(screen.getByText('b'.repeat(64))).toBeTruthy();expect(boundary.sendAnchorPayment).not.toHaveBeenCalled();
  });

  it('never offers a provider-controlled alternate payment link', async () => {
    withSigner();boundary.withdrawTry.mockResolvedValue({ id:'withdrawal-a',accountId:'GANCHOR',memoType:'text',memo:'MEMO-A',paymentUri:'https://unrelated.invalid/approve' });
    render(<RampPanel wallet={connected} />);
    fireEvent.click(screen.getByRole('button',{name:/^withdraw$/i}));fireEvent.click(screen.getByRole('button',{name:/register withdrawal/i}));
    await screen.findByRole('button',{name:/send 20 USDC/i});
    expect(screen.queryByRole('link',{name:/payment URI/i})).toBeNull();
  });

  it('clears authenticated instructions when the wallet disconnects', async () => {
    withSigner();
    const view = render(<RampPanel wallet={connected} />);
    fireEvent.click(screen.getByRole('button', { name: /get deposit instructions/i }));
    await screen.findByText('Bank A');
    boundary.signer = null;
    boundary.walletVersion += 1;
    view.rerender(<RampPanel wallet={disconnected} />);
    expect(screen.queryByText('Bank A')).toBeNull();
    expect(screen.queryByText('SEP-10 authenticated')).toBeNull();
    expect(screen.queryByRole('button', { name: /^refresh$/i })).toBeNull();
  });

  it('clears anchor state when the same address starts a different wallet session', async () => {
    withSigner();
    render(<RampPanel wallet={connected} />);
    fireEvent.click(screen.getByRole('button', { name: /get deposit instructions/i }));
    await screen.findByText('Bank A');
    act(() => { boundary.walletVersion += 1; boundary.walletListeners.forEach((listener) => listener()); });
    expect(screen.queryByText('Bank A')).toBeNull();
    expect(screen.queryByText('SEP-10 authenticated')).toBeNull();
  });

  it('does not continue a pending deposit after the wallet session changes', async () => {
    withSigner();
    let finishAuth!: (token: string) => void;
    boundary.authenticate.mockImplementation(() => new Promise<string>((resolve) => { finishAuth = resolve; }));
    const view = render(<RampPanel wallet={connected} />);
    fireEvent.click(screen.getByRole('button', { name: /get deposit instructions/i }));
    boundary.signer = null;
    boundary.walletVersion += 1;
    view.rerender(<RampPanel wallet={disconnected} />);
    await act(async () => { finishAuth('stale-session'); });
    expect(boundary.depositTry).not.toHaveBeenCalled();
    expect(screen.queryByText('Bank A')).toBeNull();
  });
});

describe('Envoy agent attempts', () => {
  const load = async () => {
    client.get_mandate.mockResolvedValue(mandate);
    const view = render(<EnvoyPanel wallet={connected} />);
    fireEvent.click(screen.getByRole('button', { name: /generate agent key/i }));
    fireEvent.change(screen.getByLabelText(/load mandate by id/i), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: /^load$/i }));
    await screen.findByRole('heading', { name: 'Mandate #4' });
    return view;
  };
  it('reports a malformed target and stops the loop without an unhandled rejection', async () => {
    await load();
    fireEvent.change(screen.getByLabelText(/^fade id/i), { target: { value: 'bad-id' } });
    fireEvent.click(screen.getByRole('button', { name: /run the agent/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/id|bigint/i);
    expect(screen.getByRole('button', { name: /run the agent/i })).toBeTruthy();
  });
  it('does not start a second wallet request while a claim is still pending', async () => {
    await load();
    fireEvent.change(screen.getByLabelText(/^fade id/i), { target: { value: '3' } });
    let finishClaim!: () => void;
    client.envoy_claim.mockImplementation(() => new Promise<void>((resolve) => { finishClaim = resolve; }));
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: /run the agent/i }));
    await act(async () => { await vi.advanceTimersByTimeAsync(6_000); });
    expect(client.envoy_claim).toHaveBeenCalledTimes(1);
    await act(async () => { finishClaim(); });
  });
});


describe('Ramp estimate provenance', () => {
  const price = (amount = '1000') => ({ price: '40', totalPrice: '40', sellAmount: amount, buyAmount: String(Number(amount) / 40), feeTotal: '1', feeAsset: 'iso4217:TRY' });
  it('binds the estimate to the deposit amount and shows request time without implying a booked rate', async () => {
    boundary.tryUsdcPrice.mockResolvedValue(price());
    render(<RampPanel wallet={disconnected} />);
    await screen.findByText('25.00 USDC');
    expect(screen.getByText(/Indicative only; not a booked rate/i)).toBeTruthy();
    expect(screen.getByText(/Requested at/i).querySelector('time')?.getAttribute('dateTime')).toMatch(/^\d{4}-/);
    fireEvent.change(screen.getByLabelText(/^TRY amount/), { target: { value: '1750' } });
    expect(screen.queryByText('25.00 USDC')).toBeNull();
    boundary.tryUsdcPrice.mockResolvedValue(price('1750'));
    fireEvent.click(screen.getByRole('button', { name: /refresh estimate/i }));
    await screen.findByText('43.75 USDC');
    expect(boundary.tryUsdcPrice).toHaveBeenLastCalledWith('1750');
    expect(boundary.depositTry).not.toHaveBeenCalled();
  });
  it('ignores an old amount even if the user later returns to the same draft amount', async () => {
    let finish!: (value: ReturnType<typeof price>) => void;
    boundary.tryUsdcPrice.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<RampPanel wallet={disconnected} />);
    fireEvent.change(screen.getByLabelText(/^TRY amount/), { target: { value: '2000' } });
    fireEvent.change(screen.getByLabelText(/^TRY amount/), { target: { value: '1000' } });
    await act(async () => { finish(price()); });
    expect(screen.queryByText('25.00 USDC')).toBeNull();
    expect(screen.getByRole('button', { name: /refresh estimate/i }).hasAttribute('disabled')).toBe(false);
  });
  it('invalidates a late deposit estimate when direction changes and explains the unsupported reverse quote', async () => {
    let finish!: (value: ReturnType<typeof price>) => void;
    boundary.tryUsdcPrice.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<RampPanel wallet={disconnected} />);
    fireEvent.click(screen.getByRole('button', { name: /^withdraw$/i }));
    await act(async () => { finish(price()); });
    expect(screen.queryByText('25.00 USDC')).toBeNull();
    expect(screen.getByText(/No USDC.to.TRY estimate is available/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^deposit$/i }));
    expect(screen.queryByText('25.00 USDC')).toBeNull();
  });
  it('keeps the newest estimate when an older request finishes afterwards', async () => {
    let finish!: (value: ReturnType<typeof price>) => void;
    boundary.tryUsdcPrice.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<RampPanel wallet={disconnected} />);
    fireEvent.change(screen.getByLabelText(/^TRY amount/), { target: { value: '2000' } });
    boundary.tryUsdcPrice.mockResolvedValue(price('2000'));
    fireEvent.click(screen.getByRole('button', { name: /refresh estimate/i }));
    await screen.findByText('50.00 USDC');
    await act(async () => { finish(price()); });
    expect(screen.getByText('50.00 USDC')).toBeTruthy();
    expect(screen.queryByText('25.00 USDC')).toBeNull();
  });
});

describe('Envoy visible scope and local runner lifecycle', () => {
  const load = async () => {
    client.get_mandate.mockResolvedValue(mandate);
    const view = render(<EnvoyPanel wallet={connected} />);
    fireEvent.click(screen.getByRole('button', { name: /generate agent key/i }));
    fireEvent.change(screen.getByLabelText(/load mandate by id/i), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: /^load$/i }));
    await screen.findByRole('heading', { name: 'Mandate #4' });
    fireEvent.change(screen.getByLabelText(/^fade id/i), { target: { value: '3' } });
    return view;
  };
  it('puts the nonpositive price scope, claim count, expiry and fixed recipient above monetary fields', () => {
    render(<EnvoyPanel wallet={connected} />);
    const scope = screen.getByRole('region', { name: 'Claim permission' });
    expect(scope.textContent).toMatch(/zero or a negative price/i);
    expect(scope.textContent).toMatch(/50/);
    expect(scope.textContent).toMatch(/Valid for/);
    expect(scope.textContent).toMatch(/Recipient/);
    expect(scope.textContent).toMatch(/owner/i);
    const secondary = screen.getByText('Contract monetary fields').closest('details');
    expect(secondary?.open).toBe(false);
    expect(screen.getByRole('img', { name: /Per claim 200 USDC, daily cap 500 USDC/ }).closest('details')).toBe(secondary);
    expect(scope.querySelector('.mandate-limits')).toBeNull();
  });
  it('stops watching when the panel becomes inactive and does not resume on return', async () => {
    const view = await load();
    client.get_fade.mockResolvedValue({ ...fade, start_price: 5000000000n, floor_price: 5000000000n });
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: /run the agent/i }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    const reads = client.get_fade.mock.calls.length;
    view.rerender(<EnvoyPanel wallet={connected} active={false} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(client.get_fade).toHaveBeenCalledTimes(reads);
    expect(client.envoy_claim).not.toHaveBeenCalled();
    view.rerender(<EnvoyPanel wallet={connected} active />);
    expect(screen.getByText(/Stopped when you left Envoy/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /run the agent/i })).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(client.get_fade).toHaveBeenCalledTimes(reads);
  });
  it('does not submit a claim when an awaited Fade lookup returns after the panel was hidden', async () => {
    const view = await load();
    let finish!: (value: Fade) => void;
    client.get_fade.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: /run the agent/i }));
    view.rerender(<EnvoyPanel wallet={connected} active={false} />);
    await act(async () => { finish(fade); });
    expect(client.envoy_claim).not.toHaveBeenCalled();
  });
  it('cancels a lookup on explicit local stop without submitting its late result', async () => {
    await load();
    let finish!: (value: Fade) => void;
    client.get_fade.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: /run the agent/i }));
    fireEvent.click(screen.getByRole('button', { name: /stop agent/i }));
    await act(async () => { finish(fade); });
    expect(client.envoy_claim).not.toHaveBeenCalled();
    expect(screen.getByText(/Stopped locally. The mandate on the network remains active/i)).toBeTruthy();
  });
  it('reports an already requested claim honestly after leaving and never submits another automatically', async () => {
    const view = await load();
    let finish!: () => void;
    client.envoy_claim.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: /run the agent/i }));
    await waitFor(() => expect(client.envoy_claim).toHaveBeenCalledTimes(1));
    view.rerender(<EnvoyPanel wallet={connected} active={false} />);
    expect(screen.getByText(/Stopping cannot cancel a wallet request/i)).toBeTruthy();
    await act(async () => { finish(); });
    view.rerender(<EnvoyPanel wallet={connected} active />);
    expect(screen.getByText(/Stopped when you left Envoy/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /run the agent/i })).toBeTruthy();
    vi.useFakeTimers();
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(client.envoy_claim).toHaveBeenCalledTimes(1);
  });
  it('waits for a nonpositive price instead of submitting a positive-price automatic claim', async () => {
    await load();
    client.get_fade.mockResolvedValue({ ...fade, start_price: 100000000n, floor_price: 100000000n });
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: /run the agent/i }));
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(client.envoy_claim).not.toHaveBeenCalled();
    expect(screen.getAllByText(/only claims at zero or a negative price/i).length).toBeGreaterThan(0);
  });
});
