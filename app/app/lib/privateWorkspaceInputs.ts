import { StrKey } from '@stellar/stellar-sdk';
import type { PrivacyVaultScope } from './privateVault';

const SCALE = 10_000_000n;
const MAX_U64 = (1n << 64n) - 1n;
const MAX_U32 = 0xffff_ffff;
export function privateAmount(value: string): string {
  const text = value.trim().replace(',', '.');
  if (!/^\d{1,20}(\.\d{1,7})?$/.test(text)) throw new Error('Enter a positive amount with at most seven decimals.');
  const [whole, fraction = ''] = text.split('.');
  const amount = BigInt(whole) * SCALE + BigInt(fraction.padEnd(7, '0'));
  if (amount <= 0n || amount > MAX_U64) throw new Error('Amount is outside the private pool limit.');
  return amount.toString();
}
export function privateDeadline(ledger: number | null, minutes: string): string {
  if (ledger === null || !Number.isSafeInteger(ledger) || ledger < 1 || ledger > MAX_U32) throw new Error('Refresh the verified pool ledger first.');
  if (!/^\d{1,8}(\.\d{1,3})?$/.test(minutes.trim())) throw new Error('Enter a positive duration in minutes.');
  const duration = Math.ceil(Number(minutes) * 12);
  if (!Number.isSafeInteger(duration) || duration < 1 || ledger + duration > MAX_U32) throw new Error('Duration exceeds the supported ledger range.');
  return String(ledger + duration);
}
export function privateDestination(value: string): Readonly<{ kind: 'account' | 'contract'; id: string }> {
  const address = value.trim();
  if (StrKey.isValidEd25519PublicKey(address)) return Object.freeze({ kind: 'account', id: StrKey.decodeEd25519PublicKey(address).toString('hex') });
  if (StrKey.isValidContract(address)) return Object.freeze({ kind: 'contract', id: StrKey.decodeContract(address).toString('hex') });
  throw new Error('Enter a valid Stellar account or contract address.');
}
export function newPrivateGrantId(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  if (bytes.every(value => value === 0)) throw new Error('Secure grant generation failed. Try again.');
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}
export async function readPrivateFile(file: File): Promise<unknown> {
  const limit = 3 * 1024 * 1024;
  if (typeof File === 'undefined' || !(file instanceof File) || file.size < 1 || file.size > limit) throw new Error('Select a supported file smaller than 3 MiB.');
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength !== file.size || bytes.byteLength > limit) throw new Error('The selected file size changed.');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
}
export async function privateAttestation(value: unknown, noteId: string, scope: PrivacyVaultScope): Promise<readonly [string, string, string]> {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('A signed attestation receipt is required.');
  const receipt = value as Record<string, unknown>;
  const keys = ['version', 'kind', 'scope', 'noteId', 'attestation'];
  if (Object.keys(receipt).length !== keys.length || keys.some(key => !Object.hasOwn(receipt, key)) || receipt.version !== '1' || receipt.kind !== 'PrivateTriggerAttestation' || receipt.noteId !== noteId) throw new Error('The receipt belongs to a different Trigger.');
  const { bindPrivateScope, privateDecimal } = await import('../../../privacy/src/credentials.mjs');
  bindPrivateScope(receipt.scope, scope);
  const values = receipt.attestation;
  if (!Array.isArray(values) || values.length !== 3) throw new Error('A complete attestation signature is required.');
  for (const value of values) privateDecimal(value);
  return Object.freeze([values[0], values[1], values[2]]) as readonly [string, string, string];
}
