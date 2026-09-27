"use client";

import { createContext, createElement, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import type { PrivacyVaultHandle, PrivacyVaultScope, PublicVaultGrant, VaultGrantSpecification } from '../../../privacy/src/vault.mjs';

export type { PrivacyVaultHandle, PrivacyVaultScope, VaultGrantSpecification } from '../../../privacy/src/vault.mjs';
type VaultModule = typeof import('../../../privacy/src/vault.mjs');
type Operation = 'creating' | 'encrypting' | 'checking' | 'restoring' | 'adding-grant' | 'preparing';
export type PrivateVaultSnapshot = Readonly<{
  status: 'locked' | 'needs-backup' | 'ready';
  busy: Operation | null;
  ownerId: string | null;
  grants: readonly PublicVaultGrant[];
  error: string | null;
}>;
export type EncryptedVaultDownload = Readonly<{ blob: Blob; filename: string }>;
export const MAX_VAULT_FILE_BYTES = 3 * 1024 * 1024;
let modulePromise: Promise<VaultModule> | undefined;
const loadModule = () => modulePromise ??= import('../../../privacy/src/vault.mjs').catch(error => { modulePromise = undefined; throw error; });

async function readSelectedBackup(file: File): Promise<unknown> {
  if (typeof File === 'undefined' || !(file instanceof File) || file.size < 1 || file.size > MAX_VAULT_FILE_BYTES) throw new Error('A bounded backup file is required.');
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength !== file.size || bytes.byteLength > MAX_VAULT_FILE_BYTES) throw new Error('Backup file size changed.');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
}

/** Local-only custody. Public snapshots never contain a password or private key.
 * A ready-looking object cannot authorize access: the checked revision and
 * cryptographic handle live in private fields, invalidated by every key change.
 */
export class PrivateVaultController {
  readonly #scope: PrivacyVaultScope;
  readonly #expectedOwnerId: string | undefined;
  #module: VaultModule | undefined;
  #handle: PrivacyVaultHandle | undefined;
  #revision = 0;
  #checkedRevision: number | null = null;
  #operationId = 0;
  #busy: Operation | null = null;
  #error: string | null = null;
  #listeners = new Set<() => void>();
  #snapshot: PrivateVaultSnapshot = Object.freeze({ status: 'locked', busy: null, ownerId: null, grants: Object.freeze([]), error: null });

  constructor(scope: PrivacyVaultScope, expectedOwnerId?: string) {
    this.#scope = Object.freeze({ domain: Object.freeze({ ...scope.domain }), epoch: scope.epoch, profileId: scope.profileId });
    this.#expectedOwnerId = expectedOwnerId;
  }
  subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  getSnapshot = () => this.#snapshot;

  #publish() {
    this.#snapshot = Object.freeze({
      status: !this.#handle ? 'locked' : this.#checkedRevision === this.#revision ? 'ready' : 'needs-backup',
      busy: this.#busy, ownerId: this.#handle?.ownerId ?? null,
      grants: this.#handle?.public.grants ?? Object.freeze([]), error: this.#error,
    });
    this.#listeners.forEach(listener => listener());
  }
  #assertCurrent(token: number) {
    if (token !== this.#operationId) throw new Error('Vault operation cancelled after locking or replacement.');
  }
  #requireHandle() {
    if (!this.#handle) throw new Error('Vault is locked. Restore its backup first.');
    return this.#handle;
  }
  #requireLocked() {
    if (this.#handle) throw new Error('Lock the current vault before creating or restoring another one.');
  }
  async #run<T>(operation: Operation, work: (token: number) => Promise<T>): Promise<T> {
    if (this.#busy) throw new Error('Vault is busy. Wait for the current operation.');
    const token = ++this.#operationId;
    this.#busy = operation; this.#error = null; this.#publish();
    try {
      const result = await work(token);
      this.#assertCurrent(token);
      return result;
    } catch (error) {
      this.#assertCurrent(token);
      const message = operation === 'preparing'
        ? 'Private preparation did not complete. Check the operation result before retrying.'
        : operation === 'restoring'
          ? 'Vault restore failed. Check the selected file, password and vault scope.'
          : operation === 'checking'
            ? 'Complete backup check failed. Select the current saved backup and its password.'
            : `Vault ${operation} failed. No private operation was enabled.`;
      this.#error = message;
      // The trusted coordinator owns proof/submission recovery. Do not erase
      // its typed errors or transaction evidence; the public snapshot remains
      // generic and never incorporates callback values or key material.
      if (operation === 'preparing') throw error;
      throw new Error(message);
    } finally {
      if (token === this.#operationId) { this.#busy = null; this.#publish(); }
    }
  }
  async #load(token: number) {
    const api = await loadModule();
    this.#assertCurrent(token); this.#module = api;
    return api;
  }
  #replace(handle: PrivacyVaultHandle) {
    if (this.#handle) this.#module!.forgetPrivacyVault(this.#handle);
    this.#handle = handle; this.#revision++; this.#checkedRevision = null;
  }

  async create() {
    this.#requireLocked();
    return this.#run('creating', async token => {
      const api = await this.#load(token);
      const handle = api.createPrivacyVault(this.#scope);
      if (this.#expectedOwnerId && handle.ownerId !== this.#expectedOwnerId) {
        api.forgetPrivacyVault(handle);
        throw new Error('Existing owner requires its matching recovery backup.');
      }
      this.#replace(handle);
    });
  }
  async addGrant(specification: VaultGrantSpecification) {
    return this.#run('adding-grant', async token => {
      const handle = this.#requireHandle(), api = await this.#load(token);
      this.#replace(api.addVaultGrant(handle, specification));
    });
  }
  /** Creates encrypted download bytes, never marks the backup as checked.
   * The component initiates the download; only an actual selected File can be
   * supplied to checkSavedBackup. Browser code cannot prove a disk save occurred.
   */
  async downloadBackup(password: string): Promise<EncryptedVaultDownload> {
    return this.#run('encrypting', async token => {
      const handle = this.#requireHandle(), api = await this.#load(token);
      const backup = await api.backupPrivacyVault(handle, password);
      this.#assertCurrent(token);
      return Object.freeze({ blob: new Blob([JSON.stringify(backup)], { type: 'application/json' }), filename: `agyion-private-vault-${handle.ownerId.slice(0, 12)}.json` });
    });
  }
  async checkSavedBackup(file: File, password: string) {
    return this.#run('checking', async token => {
      const handle = this.#requireHandle();
      this.#checkedRevision = null; this.#publish();
      const backup = await readSelectedBackup(file), api = await this.#load(token);
      await api.checkPrivacyVaultBackup(handle, backup, password);
      this.#assertCurrent(token); this.#checkedRevision = this.#revision;
    });
  }
  async restore(file: File, password: string) {
    this.#requireLocked();
    return this.#run('restoring', async token => {
      const backup = await readSelectedBackup(file), api = await this.#load(token);
      let restored: PrivacyVaultHandle | undefined;
      try {
        restored = await api.restorePrivacyVault(backup, password, this.#scope, this.#expectedOwnerId);
        this.#assertCurrent(token);
        await api.checkPrivacyVaultBackup(restored, backup, password);
        this.#assertCurrent(token);
        this.#replace(restored); this.#checkedRevision = this.#revision; restored = undefined;
      } finally { if (restored) api.forgetPrivacyVault(restored); }
    });
  }
  lock = () => {
    this.#operationId++; this.#revision++; this.#checkedRevision = null;
    if (this.#handle) this.#module!.forgetPrivacyVault(this.#handle);
    this.#handle = undefined; this.#busy = null; this.#error = null; this.#publish();
  };
  /** Local witness/key preparation only. The coordinator must also verify its
   * network/deployment and call assertCurrent immediately before submission.
   * Lock revokes this capability, but JS cannot erase keys a trusted callback
   * has already copied or cancel a transaction already submitted elsewhere.
   */
  async withCheckedVault<T>(work: (handle: PrivacyVaultHandle, assertCurrent: () => void) => Promise<T>): Promise<T> {
    return this.#run('preparing', async token => {
      const handle = this.#requireHandle(), revision = this.#revision;
      const assertCurrent = () => {
        this.#assertCurrent(token);
        if (this.#handle !== handle || this.#revision !== revision || this.#checkedRevision !== revision) throw new Error('The current complete backup must be checked before using private keys.');
      };
      assertCurrent();
      const result = await work(handle, assertCurrent);
      assertCurrent(); return result;
    });
  }
}

export const createPrivateVaultController = (scope: PrivacyVaultScope, expectedOwnerId?: string) => new PrivateVaultController(scope, expectedOwnerId);
const VaultContext = createContext<PrivateVaultController | null>(null);
/** Keeps the app tree stable while its exact release is being verified. Only
 * the private workspace renders vault controls once a controller is present. */
export function PrivateVaultControllerProvider({ controller, children }: { controller: PrivateVaultController | null; children: ReactNode }) {
  return createElement(VaultContext.Provider, { value: controller }, children);
}
export function PrivateVaultProvider({ scope, expectedOwnerId, children }: { scope: PrivacyVaultScope; expectedOwnerId?: string; children: ReactNode }) {
  const { networkId, contractId } = scope.domain;
  const { epoch, profileId } = scope;
  const controller = useMemo(() => createPrivateVaultController({ domain: { networkId, contractId }, epoch, profileId }, expectedOwnerId), [networkId, contractId, epoch, profileId, expectedOwnerId]);
  useEffect(() => () => controller.lock(), [controller]);
  return createElement(VaultContext.Provider, { value: controller }, children);
}
export function usePrivateVault() {
  const controller = useContext(VaultContext);
  if (!controller) throw new Error('Private vault requires one scoped provider.');
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return { state, controller };
}
