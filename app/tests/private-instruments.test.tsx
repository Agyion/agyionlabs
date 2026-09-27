// @vitest-environment jsdom
import React from 'react';
import { File as NodeFile } from 'node:buffer';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PreparedPrivateOperation, PrivateProtocolSnapshot } from '../app/lib/private/protocol-types';

const boundary = vi.hoisted(() => ({ workspace: null as unknown, vault: null as unknown }));
vi.mock('../app/components/app/PrivateWorkspaceProvider', () => ({ usePrivateWorkspace: () => boundary.workspace }));
vi.mock('../app/lib/privateVault', () => ({ usePrivateVault: () => boundary.vault }));
vi.mock('../app/components/app/PrivateVault', () => ({ default: () => <div>Vault controls fixture</div> }));
vi.mock('../app/components/app/PrivateTriggerAttester', () => ({ default: () => <div>Attester controls fixture</div> }));
vi.mock('../app/lib/config', () => ({ CONFIG: { decimals: 7, assetCode: 'USDC', assetContractId: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA' } }));
// The SDK's native-asset hash sees a different typed-array realm in JSDOM.
// This UI-only fixture pins the known testnet SAC label; asset identity and
// ledger provenance are exercised by the independent client/chain tests.
vi.mock('@stellar/stellar-sdk', async importOriginal => ({ ...await importOriginal<typeof import('@stellar/stellar-sdk')>(), Asset: { native: () => ({ contractId: () => 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC' }) } }));
import PrivateInstrumentPanel from '../app/components/app/PrivateInstrumentPanel';

const scope = { domain: { networkId: '11'.repeat(32), contractId: '22'.repeat(32) }, epoch: '1', profileId: '33'.repeat(32) };
const prepared: PreparedPrivateOperation = Object.freeze({ id: 'opaque-test-handle', summary: { action: 'deposit', amount: '10000000', asset: '44'.repeat(32) }, maxFeeStroops: '10000000', publicFeePayer: 'fixture-public-account', credentials: [] });
const protocol = { prepare: vi.fn(), submit: vi.fn(), refresh: vi.fn(), refreshPending: vi.fn(), withFeeLimit: vi.fn(), receiveDescriptor: vi.fn(), exportCredential: vi.fn(), checkExportedCredential: vi.fn(), importCredential: vi.fn(), reconcile: vi.fn() };
const vaultState = { status: 'ready', busy: null, grants: [] as { id: string; kind: string }[], ownerId: '55'.repeat(32), error: null };
const vault = { getSnapshot: () => vaultState, addGrant: vi.fn() };
let snapshot: PrivateProtocolSnapshot;
let workspace: { protocol: typeof protocol; vault: typeof vault; snapshot: PrivateProtocolSnapshot; scope: typeof scope; feeLimit: string; setFeeLimit: ReturnType<typeof vi.fn>; reviewId: string | null; setReviewId(value: string | null): void; loading: boolean; error: string | null };
beforeEach(() => {
  snapshot = { status: 'ready', phase: null, ledger: 1000, balances: [], notes: [], pending: [], error: null, feeQuote: null };
  vaultState.status = 'ready'; vaultState.grants = [];
  Object.values(protocol).forEach(fn => fn.mockReset()); vault.addGrant.mockReset().mockResolvedValue(undefined);
  protocol.prepare.mockResolvedValue(prepared); protocol.submit.mockResolvedValue({ status: 'confirmed', hash: '66'.repeat(32), ledger: 1001 });
  protocol.refresh.mockResolvedValue(snapshot); protocol.refreshPending.mockResolvedValue([]);
  protocol.withFeeLimit.mockImplementation((handle: PreparedPrivateOperation, cap: string) => Object.freeze({ ...handle, id: 'revised-test-handle', maxFeeStroops: cap }));
  protocol.receiveDescriptor.mockResolvedValue({ version: '1', kind: 'PrivateReceiveDescriptor', scope, spendingAuthHash: '7', viewPoint: ['1', '2'] });
  protocol.checkExportedCredential.mockResolvedValue(undefined);
  workspace = { protocol, vault, snapshot, scope, feeLimit: '1', setFeeLimit: vi.fn(), reviewId: null, setReviewId(value) { workspace.reviewId = value; }, loading: false, error: null };
  boundary.workspace = workspace; boundary.vault = { state: vaultState, controller: vault };
  vi.stubGlobal('File', NodeFile);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const renderPod = () => render(<PrivateInstrumentPanel kind="pod" address="fixture-public-account" legacy={<button>Public create must remain hidden</button>} />);
async function prepareDeposit() {
  fireEvent.click(screen.getByRole('button', { name: 'Add funds' }));
  fireEvent.click(screen.getByRole('button', { name: 'Prepare private operation' }));
  await screen.findByRole('region', { name: 'Review private operation' });
}

it('defaults to private controls and retains the distinct public Fade agent only after explicit opening', async () => {
  render(<PrivateInstrumentPanel kind="envoy" address="fixture-public-account" legacy={<button>Create public Fade agent</button>} />);
  expect(screen.queryByRole('button', { name: 'Create public Fade agent' })).toBeNull();
  const details = screen.getByText('Fade agent').closest('details')!;
  await act(async () => { details.open = true; details.dispatchEvent(new Event('toggle')); });
  expect(screen.getByRole('button', { name: 'Create public Fade agent' })).toBeTruthy();
  expect(protocol.prepare).not.toHaveBeenCalled();
});
it('does not prepare or submit when the checked vault is unavailable', () => {
  vaultState.status = 'locked'; renderPod();
  expect((screen.getByRole('button', { name: 'Prepare private operation' }) as HTMLButtonElement).disabled).toBe(true);
  expect(protocol.prepare).not.toHaveBeenCalled(); expect(protocol.submit).not.toHaveBeenCalled();
});
it('separates review from submission, binds the opaque handle, and discovers pending records after failure', async () => {
  protocol.submit.mockRejectedValue(new Error('fixture uncertain send'));
  renderPod(); await prepareDeposit();
  expect(protocol.submit).not.toHaveBeenCalled();
  expect(protocol.prepare).toHaveBeenCalledWith(expect.objectContaining({ action: 'deposit', amount: '10000000' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm private operation' }));
  await screen.findByText(/operation did not complete locally/);
  expect(protocol.submit).toHaveBeenCalledExactlyOnceWith(prepared);
  expect(protocol.refreshPending).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm private operation' }));
  expect(protocol.submit).toHaveBeenCalledOnce();
});
it('raises a fee limit only on an explicit action and keeps the prepared proof handle lineage', async () => {
  protocol.submit.mockRejectedValue(new Error('fixture fee cap'));
  renderPod(); await prepareDeposit();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm private operation' }));
  await screen.findByText(/operation did not complete locally/);
  expect(protocol.withFeeLimit).not.toHaveBeenCalled();
  const feeDetails = screen.getByText('Network fee limit').closest('details')!;
  await act(async () => { feeDetails.open = true; });
  fireEvent.change(screen.getByLabelText('Maximum network fee (XLM)'), { target: { value: '8' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply fee limit' }));
  expect(protocol.withFeeLimit).toHaveBeenCalledWith(prepared, '80000000');
  expect(workspace.setFeeLimit).toHaveBeenCalledWith('8');
  expect((screen.getByRole('button', { name: 'Confirm private operation' }) as HTMLButtonElement).disabled).toBe(false);
  expect(protocol.prepare).toHaveBeenCalledOnce();
});
it('requires actual credential file checking before enabling confirmation; no checkbox can replace it', async () => {
  const handle = Object.freeze({ ...prepared, credentials: [{ id: 'credential-one', role: 'claim', recipient: '77' }] });
  protocol.prepare.mockResolvedValue(handle);
  renderPod(); await prepareDeposit();
  const confirm = screen.getByRole('button', { name: 'Confirm private operation' }) as HTMLButtonElement;
  expect(confirm.disabled).toBe(true);
  expect(screen.queryByRole('checkbox')).toBeNull();
  fireEvent.change(screen.getByLabelText('claim credential password'), { target: { value: 'fixture saved password' } });
  const file = new File(['{"kind":"fixture-encrypted"}'], 'saved.json');
  fireEvent.change(screen.getByLabelText('Reselect saved claim credential'), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: 'Check saved credential' }));
  await waitFor(() => expect(confirm.disabled).toBe(false));
  expect(protocol.checkExportedCredential).toHaveBeenCalledWith(handle, 'credential-one', file, 'fixture saved password');
  expect((screen.getByLabelText('claim credential password') as HTMLInputElement).value).toBe('');
  expect(protocol.submit).not.toHaveBeenCalled();
});
it('does not show a late prepared result after its wallet/protocol has changed', async () => {
  let finish!: (value: PreparedPrivateOperation) => void;
  protocol.prepare.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const view = renderPod();
  fireEvent.click(screen.getByRole('button', { name: 'Add funds' }));
  fireEvent.click(screen.getByRole('button', { name: 'Prepare private operation' }));
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  workspace.protocol = { ...protocol };
  view.rerender(<PrivateInstrumentPanel kind="pod" address="different-public-account" legacy={null} />);
  await act(async () => finish(prepared));
  expect(screen.queryByRole('region', { name: 'Review private operation' })).toBeNull();
  expect(protocol.submit).not.toHaveBeenCalled();
});
it('offers only verified note actions and never offers a Pod sender refund', () => {
  workspace.snapshot = { ...snapshot, notes: [{ id: '123', kind: 'pod', asset: '44'.repeat(32), amount: '10000000', notBefore: '1001', deadline: '0', supportedActions: [] }] };
  renderPod();
  expect(screen.queryByRole('button', { name: 'Prepare claim' })).toBeNull();
  expect(screen.queryByRole('button', { name: /refund|reclaim/i })).toBeNull();
});
it.each(['locked', 'needs-backup'])('does not reuse a shared but unsubmitted creation grant after vault %s and restore', async status => {
  vault.addGrant.mockImplementation(async (grant: { id: string; kind: string }) => { vaultState.grants = [grant]; });
  protocol.prepare.mockResolvedValue({ ...prepared, summary: { ...prepared.summary, action: 'pod-create' } });
  const view = renderPod();
  fireEvent.click(screen.getByRole('button', { name: 'Prepare a new Pod key' }));
  await waitFor(() => expect(vault.addGrant).toHaveBeenCalledOnce());
  await waitFor(() => expect((screen.getByRole('button', { name: 'Prepare private operation' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Prepare private operation' }));
  await screen.findByRole('region', { name: 'Review private operation' });
  vaultState.status = status; view.rerender(<PrivateInstrumentPanel kind="pod" address="fixture-public-account" legacy={null} />);
  vaultState.status = 'ready'; view.rerender(<PrivateInstrumentPanel kind="pod" address="fixture-public-account" legacy={null} />);
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Prepare private operation' }));
  await waitFor(() => expect(protocol.refreshPending).toHaveBeenCalledTimes(3));
  expect(protocol.prepare).toHaveBeenCalledOnce();
});
it('clears a received credential password and file when the active vault is locked', async () => {
  const view = renderPod();
  const details = screen.getByText('Open a received credential').closest('details')!;
  await act(async () => { details.open = true; });
  fireEvent.change(screen.getByLabelText('Credential password'), { target: { value: 'typed fixture secret' } });
  fireEvent.change(screen.getByLabelText('Encrypted credential'), { target: { files: [new File(['{}'], 'selected.json')] } });
  vaultState.status = 'locked';
  view.rerender(<PrivateInstrumentPanel kind="pod" address="fixture-public-account" legacy={null} />);
  expect((screen.getByLabelText('Credential password') as HTMLInputElement).value).toBe('');
  vaultState.status = 'ready';
  view.rerender(<PrivateInstrumentPanel kind="pod" address="fixture-public-account" legacy={null} />);
  expect((screen.getByRole('button', { name: 'Open credential locally' }) as HTMLButtonElement).disabled).toBe(true);
});
