// @vitest-environment jsdom
import React from 'react';
import { File as NodeFile, Blob as NodeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PrivateVault from '../app/components/app/PrivateVault';
import { PrivateVaultProvider, usePrivateVault, type PrivacyVaultScope } from '../app/lib/privateVault';

const scope: PrivacyVaultScope = { domain: { networkId: '11'.repeat(32), contractId: '22'.repeat(32) }, epoch: '1', profileId: '33'.repeat(32) };
let downloaded: Blob | undefined;
const captured = vi.fn();
function ObserveGate() { const { state } = usePrivateVault(); return <output data-testid="backup-gate">{state.status}</output>; }
beforeEach(() => {
  downloaded = undefined; captured.mockReset();
  vi.stubGlobal('File', NodeFile); vi.stubGlobal('Blob', NodeBlob); vi.stubGlobal('crypto', webcrypto);
  const BaseURL = URL;
  vi.stubGlobal('URL', class extends BaseURL {
    static createObjectURL(blob: Blob) { downloaded = blob; return 'blob:owned-test-vault'; }
    static revokeObjectURL() {}
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { captured(this.download); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('clears passwords, downloads only encrypted data, and requires actual file reselection before the gate changes', async () => {
  const user = userEvent.setup();
  const persistence = vi.spyOn(Storage.prototype, 'setItem');
  render(<PrivateVaultProvider scope={scope}><PrivateVault /><ObserveGate /></PrivateVaultProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Create a private vault' }));
  await waitFor(() => expect(screen.getByTestId('backup-gate').textContent).toBe('needs-backup'));
  const password = screen.getByLabelText('Backup password') as HTMLInputElement;
  expect(password.type).toBe('password');
  fireEvent.change(password, { target: { value: 'saved fixture password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Download encrypted backup' }));
  expect(password.value).toBe('');
  await waitFor(() => expect(captured).toHaveBeenCalledOnce(), { timeout: 30000 });
  expect(screen.getByTestId('backup-gate').textContent).toBe('needs-backup');
  const bytes = await downloaded!.text();
  expect(bytes).not.toContain('saved fixture password');
  expect(bytes).not.toMatch(/spendingSecret|viewScalar|podSecret|revocationSeed/);
  const input = screen.getByLabelText('Reselect your saved backup');
  await user.upload(input, new File([bytes], 'saved-vault.json'));
  fireEvent.change(password, { target: { value: 'saved fixture password' } });
  expect((screen.getByRole('button', { name: 'Check saved backup' }) as HTMLButtonElement).disabled).toBe(false);
  expect((input as HTMLInputElement).files?.length).toBe(1);
  // JSDOM's internal file-validity state does not see user-event's FileList
  // when backed by Node's real readable File. Dispatch the form submission
  // after selection; real browser required-field validation is a separate gate.
  fireEvent.submit(screen.getByRole('button', { name: 'Check saved backup' }).closest('form')!);
  expect(password.value).toBe('');
  await waitFor(() => expect(screen.getByTestId('backup-gate').textContent).toBe('ready'), { timeout: 30000 });
  expect(screen.queryByText(/spendingSecret|viewScalar|podSecret|revocationSeed/)).toBeNull();
  expect(persistence).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Lock and forget local keys' }));
  expect(screen.getByTestId('backup-gate').textContent).toBe('locked');
}, 60000);

it('clears selected files and passwords when the exact vault scope changes', async () => {
  const user = userEvent.setup();
  const view = render(<PrivateVaultProvider scope={scope}><PrivateVault /><ObserveGate /></PrivateVaultProvider>);
  const input = screen.getByLabelText('Saved vault backup');
  await user.upload(input, new File(['{}'], 'old-scope.json'));
  fireEvent.change(screen.getByLabelText('Backup password'), { target: { value: 'old scope password' } });
  expect((screen.getByRole('button', { name: 'Restore saved vault' }) as HTMLButtonElement).disabled).toBe(false);
  await act(async () => view.rerender(<PrivateVaultProvider scope={{ ...scope, epoch: '2' }}><PrivateVault /><ObserveGate /></PrivateVaultProvider>));
  expect((screen.getByLabelText('Backup password') as HTMLInputElement).value).toBe('');
  expect((screen.getByRole('button', { name: 'Restore saved vault' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByTestId('backup-gate').textContent).toBe('locked');
});
