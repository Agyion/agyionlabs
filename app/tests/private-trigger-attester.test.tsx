// @vitest-environment jsdom
import React from 'react';
import { File as NodeFile, Blob as NodeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => ({ workspace: null as unknown }));
vi.mock('../app/components/app/PrivateWorkspaceProvider', () => ({ usePrivateWorkspace: () => boundary.workspace }));
vi.mock('../app/lib/privateVault', () => ({ usePrivateVault: () => ({ state: { status: 'ready' } }) }));
import PrivateTriggerAttester from '../app/components/app/PrivateTriggerAttester';

const scope = { domain: { networkId: '11'.repeat(32), contractId: '22'.repeat(32) }, epoch: '1', profileId: '33'.repeat(32) };
let workspace: { scope: typeof scope; vault: object; protocol: { signAttestation: ReturnType<typeof vi.fn> }; snapshot: { notes: { id: string; kind: string }[] } };
let downloaded: Blob | null;
beforeEach(() => {
  workspace = { scope, vault: {}, protocol: { signAttestation: vi.fn() }, snapshot: { notes: [{ id: '123', kind: 'trigger' }] } };
  boundary.workspace = workspace; downloaded = null;
  vi.stubGlobal('File', NodeFile); vi.stubGlobal('Blob', NodeBlob); vi.stubGlobal('crypto', webcrypto);
  const BaseURL = URL;
  vi.stubGlobal('URL', class extends BaseURL { static createObjectURL(blob: Blob) { downloaded = blob; return 'blob:reviewer-fixture'; } static revokeObjectURL() {} });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('forgets the reviewer handle when an already-ready vault changes identity or scope', async () => {
  const view = render(<PrivateTriggerAttester active />);
  const details = screen.getByText('Review a Trigger condition').closest('details')!; details.open = true;
  fireEvent.click(screen.getByRole('button', { name: 'Create reviewer key' }));
  await screen.findByLabelText('Reviewer public point');
  workspace = { ...workspace, vault: {}, scope: { ...scope, epoch: '2' } }; boundary.workspace = workspace;
  view.rerender(<PrivateTriggerAttester active />);
  await waitFor(() => expect(screen.queryByLabelText('Reviewer public point')).toBeNull());
  expect(screen.getByRole('button', { name: 'Create reviewer key' })).toBeTruthy();
  expect(workspace.protocol.signAttestation).not.toHaveBeenCalled();
});
it('uses actual encrypted key backup checks before enabling attestation and clears the entered password', async () => {
  const view = render(<PrivateTriggerAttester active />);
  screen.getByText('Review a Trigger condition').closest('details')!.open = true;
  fireEvent.click(screen.getByRole('button', { name: 'Create reviewer key' }));
  await screen.findByLabelText('Reviewer public point');
  const password = screen.getByLabelText('Reviewer key password') as HTMLInputElement;
  fireEvent.change(screen.getByLabelText('Trigger to attest'), { target: { value: '123' } });
  expect((screen.getByRole('button', { name: 'Sign the condition and download receipt' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(password, { target: { value: 'real reviewer fixture password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Download encrypted reviewer key' }));
  expect(password.value).toBe('');
  await waitFor(() => expect(downloaded).not.toBeNull(), { timeout: 30000 });
  const json = await downloaded!.text();
  expect(JSON.parse(json).kind).toBe('EncryptedTriggerAttester');
  expect(json).not.toContain('real reviewer fixture password');
  expect(json).not.toMatch(/secretScalar|privateKey/);
  fireEvent.change(screen.getByLabelText('Saved encrypted reviewer key'), { target: { files: [new File([json], 'saved-key.json')] } });
  fireEvent.change(password, { target: { value: 'real reviewer fixture password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Check saved reviewer key' }));
  expect(password.value).toBe('');
  await waitFor(() => expect((screen.getByRole('button', { name: 'Sign the condition and download receipt' }) as HTMLButtonElement).disabled).toBe(false), { timeout: 30000 });
  expect(workspace.protocol.signAttestation).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Lock reviewer key' }));
  const delayed = new File([json], 'delayed-key.json');
  const bytes = await delayed.arrayBuffer();
  let finish!: (value: ArrayBuffer) => void;
  vi.spyOn(delayed, 'arrayBuffer').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.change(screen.getByLabelText('Saved encrypted reviewer key'), { target: { files: [delayed] } });
  fireEvent.change(password, { target: { value: 'real reviewer fixture password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Restore reviewer key' }));
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  workspace = { ...workspace, vault: {}, scope: { ...scope, epoch: '2' } }; boundary.workspace = workspace;
  view.rerender(<PrivateTriggerAttester active />);
  await act(async () => finish(bytes));
  expect(screen.queryByLabelText('Reviewer public point')).toBeNull();
}, 60000);
