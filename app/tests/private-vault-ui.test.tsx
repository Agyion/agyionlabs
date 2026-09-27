// @vitest-environment jsdom
import React from 'react';
import { File as NodeFile, Blob as NodeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const releases = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../app/lib/private/backup-release', () => ({ readPrivateBackupRelease: releases.read }));
import PrivateVault from '../app/components/app/PrivateVault';
import { PrivateVaultProvider, PrivateVaultControllerProvider, createPrivateVaultController, usePrivateVault, type PrivacyVaultScope } from '../app/lib/privateVault';

const scope: PrivacyVaultScope = { domain: { networkId: '11'.repeat(32), contractId: '22'.repeat(32) }, epoch: '1', profileId: '33'.repeat(32) };
let downloaded: Blob | undefined;
const captured = vi.fn();
function ObserveGate() { const { state } = usePrivateVault(); return <output data-testid="backup-gate">{state.status}</output>; }
beforeEach(() => {
  downloaded = undefined; captured.mockReset(); releases.read.mockReset();
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


it('does not create a new vault in recovery mode',()=>{
  render(<PrivateVaultProvider scope={scope}><PrivateVault allowCreate={false}/></PrivateVaultProvider>);
  expect(screen.queryByRole('button',{name:'Create a private vault'})).toBeNull();
  expect(screen.getByRole('button',{name:'Restore saved vault'})).toBeTruthy();
});
it('treats a backup profile as a hint and requires explicit pool switching with cleared inputs',async()=>{
  const select=vi.fn();releases.read.mockResolvedValue({key:'earlier',label:'Earlier private pool'});
  render(<PrivateVaultProvider scope={scope}><PrivateVault releaseKey="current" selectRelease={select}/></PrivateVaultProvider>);
  fireEvent.change(screen.getByLabelText('Backup password'),{target:{value:'fixture temporary password'}});
  fireEvent.change(screen.getByLabelText('Saved vault backup'),{target:{files:[new File(['{}'],'earlier.json')]}});
  const button=await screen.findByRole('button',{name:'Switch to Earlier private pool'});
  expect(select).not.toHaveBeenCalled();
  expect((screen.getByLabelText('Backup password') as HTMLInputElement).value).toBe('');
  expect((screen.getByRole('button',{name:'Restore saved vault'}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(button);expect(select).toHaveBeenCalledExactlyOnceWith('earlier');
  expect(captured).not.toHaveBeenCalled();
});
it('rejects an unknown backup without retaining its password or exposing supplied errors',async()=>{
  releases.read.mockRejectedValue(Error('attacker supplied secret'));const select=vi.fn();
  render(<PrivateVaultProvider scope={scope}><PrivateVault releaseKey="current" selectRelease={select}/></PrivateVaultProvider>);
  fireEvent.change(screen.getByLabelText('Backup password'),{target:{value:'fixture temporary password'}});
  fireEvent.change(screen.getByLabelText('Saved vault backup'),{target:{files:[new File(['{}'],'unknown.json')]}});
  expect(await screen.findByText('This backup does not identify a supported private pool.')).toBeTruthy();
  expect((screen.getByLabelText('Backup password') as HTMLInputElement).value).toBe('');
  expect(screen.queryByText(/attacker supplied/)).toBeNull();expect(select).not.toHaveBeenCalled();
});
it('ignores a late backup hint after the controller changes',async()=>{
  let finish!:(value:unknown)=>void;releases.read.mockReturnValue(new Promise(resolve=>{finish=resolve}));const select=vi.fn();
  const view=render(<PrivateVaultProvider scope={scope}><PrivateVault releaseKey="current" selectRelease={select}/></PrivateVaultProvider>);
  fireEvent.change(screen.getByLabelText('Saved vault backup'),{target:{files:[new File(['{}'],'pending.json')]}});
  await waitFor(()=>expect(releases.read).toHaveBeenCalledOnce());
  view.rerender(<PrivateVaultProvider scope={{...scope,epoch:'2'}}><PrivateVault releaseKey="replacement" selectRelease={select}/></PrivateVaultProvider>);
  await act(async()=>finish({key:'earlier',label:'Earlier private pool'}));
  expect(screen.queryByRole('button',{name:'Switch to Earlier private pool'})).toBeNull();expect(select).not.toHaveBeenCalled();
  expect((screen.getByRole('button',{name:'Restore saved vault'}) as HTMLButtonElement).disabled).toBe(true);
});


it('does not download an earlier controller backup after the vault is replaced',async()=>{
  const first=createPrivateVaultController(scope),second=createPrivateVaultController({...scope,epoch:'2'});await first.create();
  let finish!:(value:{blob:Blob;filename:string})=>void;
  vi.spyOn(first,'downloadBackup').mockReturnValue(new Promise(resolve=>{finish=resolve}));
  const view=render(<PrivateVaultControllerProvider controller={first}><PrivateVault/></PrivateVaultControllerProvider>);
  fireEvent.change(screen.getByLabelText('Backup password'),{target:{value:'fixture temporary password'}});
  fireEvent.click(screen.getByRole('button',{name:'Download encrypted backup'}));
  view.rerender(<PrivateVaultControllerProvider controller={second}><PrivateVault/></PrivateVaultControllerProvider>);
  await act(async()=>finish({blob:new Blob(['encrypted']),filename:'earlier-vault.json'}));
  expect(captured).not.toHaveBeenCalled();expect(downloaded).toBeUndefined();first.lock();second.lock();
});
