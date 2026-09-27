import { File as NodeFile } from 'node:buffer';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { createPrivacyVault, backupPrivacyVault, exportVaultKeys, forgetPrivacyVault } from '../../privacy/src/vault.mjs';
import type { CompletePrivacyKeyBackup, PrivacyVaultHandle, PrivacyVaultScope } from '../../privacy/src/vault.mjs';
import { createPrivateVaultController, MAX_VAULT_FILE_BYTES } from '../app/lib/privateVault';

const scope: PrivacyVaultScope = { domain: { networkId: '11'.repeat(32), contractId: '22'.repeat(32) }, epoch: '1', profileId: '33'.repeat(32) };
const password = 'local fixture password 2026';
let fixture: CompletePrivacyKeyBackup;
const selectedFile = (value: unknown) => new File([JSON.stringify(value)], 'selected-backup.json', { type: 'application/json' });
beforeAll(async () => {
  vi.stubGlobal('File', NodeFile);
  const handle = createPrivacyVault(scope);
  try { fixture = await backupPrivacyVault(handle, password); } finally { forgetPrivacyVault(handle); }
}, 30000);
afterEach(() => vi.restoreAllMocks());
afterAll(() => vi.unstubAllGlobals());

it('requires a real reselected encrypted backup before exposing a funding capability', async () => {
  const vault = createPrivateVaultController(scope);
  await expect(vault.withCheckedVault(async () => true)).rejects.toThrow(/backup|locked/i);
  await vault.create();
  expect(vault.getSnapshot()).toMatchObject({ status: 'needs-backup', busy: null });
  const download = await vault.downloadBackup(password);
  const raw = await download.blob.text();
  expect(JSON.parse(raw)).toMatchObject({ kind: 'CompletePrivacyKeyBackup', scope });
  await expect(vault.withCheckedVault(async () => true)).rejects.toThrow(/backup/i);
  await vault.checkSavedBackup(new File([raw], 'saved-and-selected.json'), password);
  expect(vault.getSnapshot().status).toBe('ready');
  const keys = await vault.withCheckedVault(async handle => exportVaultKeys(handle));
  expect(raw).not.toContain(keys.spendingSecret.toString(16).padStart(64, '0'));
  expect(raw).not.toContain(keys.viewScalar.toString(16).padStart(64, '0'));
  expect(JSON.stringify(vault.getSnapshot())).not.toMatch(/spendingSecret|viewScalar|podSecret|revocationSeed|password/);
  vault.lock();
  expect(vault.getSnapshot()).toMatchObject({ status: 'locked', ownerId: null, grants: [] });
}, 30000);

it('restores an actual file only in its exact deployment scope and checks all restored keys', async () => {
  const wrongScope = createPrivateVaultController({ ...scope, profileId: '44'.repeat(32) });
  await expect(wrongScope.restore(selectedFile(fixture), password)).rejects.toThrow(/restore/i);
  expect(wrongScope.getSnapshot().status).toBe('locked');
  const wrongOwner = createPrivateVaultController(scope, '55'.repeat(32));
  await expect(wrongOwner.restore(selectedFile(fixture), password)).rejects.toThrow(/restore/i);
  const vault = createPrivateVaultController(scope, fixture.ownerId);
  await expect(vault.restore(selectedFile(fixture), 'wrong fixture password')).rejects.toThrow(/restore/i);
  expect(vault.getSnapshot().status).toBe('locked');
  await vault.restore(selectedFile(fixture), password);
  expect(vault.getSnapshot()).toMatchObject({ status: 'ready', ownerId: fixture.ownerId });
  expect(await vault.withCheckedVault(async handle => handle.scope)).toEqual(scope);
  vault.lock();
}, 30000);

it('invalidates the backup and old handle when a grant is added; an older complete backup cannot re-enable funding', async () => {
  const vault = createPrivateVaultController(scope);
  await vault.restore(selectedFile(fixture), password);
  await expect(vault.create()).rejects.toThrow(/lock/i);
  await expect(vault.restore(selectedFile(fixture), password)).rejects.toThrow(/lock/i);
  const oldHandle = await vault.withCheckedVault(async handle => handle);
  await vault.addGrant({ id: '66'.repeat(32), kind: 'pod' });
  expect(vault.getSnapshot()).toMatchObject({ status: 'needs-backup', grants: [{ id: '66'.repeat(32), kind: 'pod' }] });
  expect(() => exportVaultKeys(oldHandle)).toThrow(/HANDLE/);
  await expect(vault.withCheckedVault(async () => true)).rejects.toThrow(/backup/i);
  await expect(vault.checkSavedBackup(selectedFile(fixture), password)).rejects.toThrow(/backup/i);
  expect(vault.getSnapshot().status).toBe('needs-backup');
  const fresh = await vault.downloadBackup(password);
  await vault.checkSavedBackup(new File([await fresh.blob.text()], 'saved-current-grant.json'), password);
  expect(vault.getSnapshot().status).toBe('ready');
  vault.lock();
}, 60000);

it('cannot resurrect a vault from a file read which finishes after locking', async () => {
  const vault = createPrivateVaultController(scope);
  await vault.create();
  const file = selectedFile(fixture);
  let finish!: (buffer: ArrayBuffer) => void;
  vi.spyOn(file, 'arrayBuffer').mockImplementation(() => new Promise<ArrayBuffer>(resolve => { finish = resolve; }));
  const check = vault.checkSavedBackup(file, password);
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  vault.lock();
  finish(new TextEncoder().encode(JSON.stringify(fixture)).buffer);
  await expect(check).rejects.toThrow(/cancelled|locked/i);
  expect(vault.getSnapshot()).toMatchObject({ status: 'locked', busy: null, ownerId: null });
  await expect(vault.withCheckedVault(async () => true)).rejects.toThrow(/backup|locked/i);
});

it('rejects malformed or oversized files before expensive decryption and keeps snapshots immutable', async () => {
  const vault = createPrivateVaultController(scope);
  const large = new File([new Uint8Array(MAX_VAULT_FILE_BYTES + 1)], 'oversized.json');
  const read = vi.spyOn(large, 'arrayBuffer');
  await expect(vault.restore(large, password)).rejects.toThrow(/restore/i);
  expect(read).not.toHaveBeenCalled();
  await expect(vault.restore(new File(['{bad-json'], 'broken.json'), password)).rejects.toThrow(/restore/i);
  expect(() => Object.defineProperty(vault.getSnapshot(), 'status', { value: 'ready' })).toThrow();
  await expect(vault.withCheckedVault(async () => true)).rejects.toThrow(/backup|locked/i);
});

it('revokes an outstanding local capability on lock and does not replace an active vault silently', async () => {
  const vault = createPrivateVaultController(scope);
  await vault.restore(selectedFile(fixture), password);
  let handle: PrivacyVaultHandle | undefined;
  let assertCurrent: (() => void) | undefined;
  let finish!: () => void;
  const preparing = vault.withCheckedVault(async (current, guard) => {
    handle = current; assertCurrent = guard;
    await new Promise<void>(resolve => { finish = resolve; });
    guard();
  });
  await vi.waitFor(() => expect(assertCurrent).toBeTypeOf('function'));
  await expect(vault.addGrant({ id: '77'.repeat(32), kind: 'envoy' })).rejects.toThrow(/busy/i);
  vault.lock();
  expect(() => assertCurrent!()).toThrow(/cancelled|locked/i);
  expect(() => exportVaultKeys(handle!)).toThrow(/HANDLE/);
  finish();
  await expect(preparing).rejects.toThrow(/cancelled|locked/i);
}, 30000);

it('preserves the coordinator error object without exposing it in the public snapshot', async () => {
  const vault = createPrivateVaultController(scope);
  await vault.restore(selectedFile(fixture), password);
  const recoveryEvidence = new Error('coordinator-only recovery evidence');
  await expect(vault.withCheckedVault(async () => { throw recoveryEvidence; })).rejects.toBe(recoveryEvidence);
  expect(vault.getSnapshot().error).not.toContain('coordinator-only');
  expect(vault.getSnapshot().status).toBe('ready');
  vault.lock();
}, 30000);
