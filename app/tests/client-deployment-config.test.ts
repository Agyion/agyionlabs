import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrKey, Networks, Keypair } from '@stellar/stellar-sdk';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_HAK_MODE', 'soroban');
  vi.stubEnv('NEXT_PUBLIC_HAK_CONTRACT_ID', StrKey.encodeContract(Buffer.alloc(32, 3)));
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
describe('public application deployment configuration', () => {
  it.each([undefined, '', '1234', 'AA'.repeat(32)])('does not instantiate an unpinned live client with %s', async pin => {
    vi.stubEnv('NEXT_PUBLIC_HAK_WASM_HASH', pin);
    const { getClient } = await import('../app/lib/client');
    expect(() => getClient()).toThrow(/NEXT_PUBLIC_HAK_WASM_HASH/);
  });
  it('passes the exact configured pin to the live client', async () => {
    vi.stubEnv('NEXT_PUBLIC_HAK_WASM_HASH', '12'.repeat(32));
    const { getClient } = await import('../app/lib/client');
    expect((getClient() as unknown as { cfg: { expectedContractWasmHash: string } }).cfg.expectedContractWasmHash).toBe('12'.repeat(32));
  });
  it.each([
    ['NEXT_PUBLIC_HAK_ASSET_CODE', 'OTHER'],
    ['NEXT_PUBLIC_HAK_ASSET_ADDRESS', Keypair.fromRawEd25519Seed(Buffer.alloc(32, 9)).publicKey()],
    ['NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE', Networks.PUBLIC],
    ['NEXT_PUBLIC_HAK_ASSET_CONTRACT_ID', StrKey.encodeContract(Buffer.alloc(32, 8))],
  ])('rejects inconsistent asset identity in %s', async (name, value) => {
    vi.stubEnv('NEXT_PUBLIC_HAK_WASM_HASH', '12'.repeat(32));
    vi.stubEnv(name, value);
    const { getClient } = await import('../app/lib/client');
    expect(() => getClient()).toThrow(/asset|issuer|SAC/i);
  });
  it('does not require a deployment for the local simulation', async () => {
    vi.stubEnv('NEXT_PUBLIC_HAK_MODE', 'mock');
    vi.stubEnv('NEXT_PUBLIC_HAK_WASM_HASH', undefined);
    const { getClient } = await import('../app/lib/client');
    expect(getClient().constructor.name).toBe('MockAgyionClient');
  });
});
