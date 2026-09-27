export type PrivacyVaultScope = Readonly<{
  domain: Readonly<{ networkId: string; contractId: string }>;
  epoch: string;
  profileId: string;
}>;
export type VaultGrantSpecification = Readonly<{ id: string; kind: 'pod' | 'trigger' | 'envoy' }>;
type Point = readonly [string, string];
export type PublicVaultGrant = Readonly<{ id: string; kind: 'pod'; viewPoint: Point; podHash: string }>
  | Readonly<{ id: string; kind: 'trigger'; viewPoint: Point }>
  | Readonly<{ id: string; kind: 'envoy'; viewPoint: Point; revocationPublicKey: string }>;
declare const vaultHandleBrand: unique symbol;
export type PrivacyVaultHandle = Readonly<{
  [vaultHandleBrand]: true;
  kind: 'PrivateKeyVault';
  scope: PrivacyVaultScope;
  ownerId: string;
  public: Readonly<{ spendingAuthHash: string; viewPoint: Point; grants: readonly PublicVaultGrant[] }>;
}>;
export type PrivacyVaultKeys = Readonly<{
  spendingSecret: bigint;
  viewScalar: bigint;
  grants: readonly (
    Readonly<{ id: string; kind: 'pod'; viewScalar: bigint; podSecret: bigint }>
    | Readonly<{ id: string; kind: 'trigger'; viewScalar: bigint }>
    | Readonly<{ id: string; kind: 'envoy'; viewScalar: bigint; revocationSeed: string }>
  )[];
}>;
export type CompletePrivacyKeyBackup = Readonly<{
  version: '2';
  kind: 'CompletePrivacyKeyBackup';
  scope: PrivacyVaultScope;
  ownerId: string;
  encrypted: Readonly<{
    version: '1'; suite: 'argon2id-aes256gcm-v1';
    context: Readonly<{ domain: PrivacyVaultScope['domain']; epoch: string; ownerId: string }>;
    kdf: Readonly<{ version: '19'; memoryKiB: '65536'; iterations: '3'; parallelism: '1' }>;
    salt: string; nonce: string; ciphertext: string;
  }>;
}>;
export type LocallyCheckedKeyBackup = Readonly<{
  kind: 'LocallyCheckedKeyBackup'; scope: PrivacyVaultScope; ownerId: string; grantIds: readonly string[];
}>;
export function createPrivacyVault(scope: PrivacyVaultScope, grants?: readonly VaultGrantSpecification[]): PrivacyVaultHandle;
export function addVaultGrant(handle: PrivacyVaultHandle, specification: VaultGrantSpecification): PrivacyVaultHandle;
export function exportVaultKeys(handle: PrivacyVaultHandle): PrivacyVaultKeys;
export function forgetPrivacyVault(handle: PrivacyVaultHandle): boolean;
export function backupPrivacyVault(handle: PrivacyVaultHandle, password: string): Promise<CompletePrivacyKeyBackup>;
export function restorePrivacyVault(backup: unknown, password: string, scope: PrivacyVaultScope, expectedOwnerId?: string): Promise<PrivacyVaultHandle>;
export function checkPrivacyVaultBackup(handle: PrivacyVaultHandle, backup: unknown, password: string): Promise<LocallyCheckedKeyBackup>;
