import type {CompletePrivacyKeyBackup} from '../../privacy/src/vault.mjs';
export type EncryptedBackup=CompletePrivacyKeyBackup['encrypted'];
export type BackupContext=EncryptedBackup['context'];
export function encryptBackup(plaintext:Uint8Array,password:string,context:BackupContext):Promise<EncryptedBackup>;
export function decryptBackup(backup:unknown,password:string,context:BackupContext):Promise<Uint8Array>;
export function parseEncryptedBackup(backup:unknown,context:BackupContext):EncryptedBackup;
