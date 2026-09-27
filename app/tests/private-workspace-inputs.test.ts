import { expect, it, vi } from 'vitest';
import { File as NodeFile } from 'node:buffer';
import { privateAmount, privateAttestation, privateDeadline, privateDestination, readPrivateFile } from '../app/lib/privateWorkspaceInputs';

it('keeps all seven asset decimals without rounding or accepting negative/exponent amounts', () => {
  expect(privateAmount('0.0000001')).toBe('1');
  expect(privateAmount('12,5')).toBe('125000000');
  for (const value of ['-1', '0', '1e4', '0.00000001', 'NaN', '1844674407370.9551616']) {
    expect(() => privateAmount(value)).toThrow();
  }
});
it('uses a verified ledger for bounded future deadlines and never invents a clock when unavailable', () => {
  expect(privateDeadline(1000, '5')).toBe('1060');
  for (const value of [null, 0, -1, 1.5, 2 ** 32]) expect(() => privateDeadline(value, '5')).toThrow();
  expect(() => privateDeadline(2 ** 32 - 1, '1')).toThrow();
});
it('decodes only valid account or contract destination identities', async () => {
  const { Keypair, StrKey } = await import('@stellar/stellar-sdk');
  const account = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 51));
  expect(privateDestination(account.publicKey())).toEqual({ kind: 'account', id: account.rawPublicKey().toString('hex') });
  expect(privateDestination(StrKey.encodeContract(Buffer.alloc(32, 4)))).toEqual({ kind: 'contract', id: '04'.repeat(32) });
  expect(() => privateDestination(account.secret())).toThrow();
  expect(() => privateDestination('G-invalid')).toThrow();
});
it('bounds selected private files and checks actual bytes before handing unknown JSON to the strict crypto parser', async () => {
  vi.stubGlobal('File', NodeFile);
  try {
    expect(await readPrivateFile(new File(['{"kind":"encrypted-fixture"}'], 'fixture.json'))).toEqual({ kind: 'encrypted-fixture' });
    const oversized = new File([new Uint8Array(3 * 1024 * 1024 + 1)], 'huge.json');
    const read = vi.spyOn(oversized, 'arrayBuffer');
    await expect(readPrivateFile(oversized)).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
    await expect(readPrivateFile(new File(['bad-json'], 'bad.json'))).rejects.toThrow();
  } finally { vi.unstubAllGlobals(); }
});
it('rejects a signed receipt for another note or exact deployment before using its public signature', async () => {
  const scope = { domain: { networkId: '11'.repeat(32), contractId: '22'.repeat(32) }, epoch: '1', profileId: '33'.repeat(32) };
  const receipt = { version: '1', kind: 'PrivateTriggerAttestation', scope, noteId: '123', attestation: ['1', '2', '3'] };
  expect(await privateAttestation(receipt, '123', scope)).toEqual(['1', '2', '3']);
  await expect(privateAttestation(receipt, '124', scope)).rejects.toThrow();
  await expect(privateAttestation(receipt, '123', { ...scope, epoch: '2' })).rejects.toThrow();
  await expect(privateAttestation({ ...receipt, attestation: ['1', '2', '1e3'] }, '123', scope)).rejects.toThrow();
});
