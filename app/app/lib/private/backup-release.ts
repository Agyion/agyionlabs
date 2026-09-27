import { readPrivateFile } from '../privateWorkspaceInputs';
import { findPrivateReleaseForScope, type PrivateReleaseSelection } from './release';

/** Unauthenticated file metadata only suggests an existing compiled pool.
 * Restoring still requires the selected vault's complete authenticated backup
 * check. A hint never imports a release, unlocks a vault or carries a password. */
export async function readPrivateBackupRelease(file: File): Promise<PrivateReleaseSelection> {
  const value = await readPrivateFile(file);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('PRIVATE_BACKUP_REQUIRED');
  const backup = value as Record<string, unknown>;
  if (backup.version !== '2' || backup.kind !== 'CompletePrivacyKeyBackup') throw new Error('PRIVATE_BACKUP_REQUIRED');
  return findPrivateReleaseForScope(backup.scope);
}
