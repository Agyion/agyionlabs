import { afterEach, describe, expect, it, vi } from 'vitest';
import { Keypair, Networks, StrKey } from '@stellar/stellar-sdk';
import { SorobanAgyionClient } from '../app/lib/agyionClient';
import { getClient, resetClient } from '../app/lib/client';
import { CONFIG } from '../app/lib/config';

vi.mock('../app/lib/config', () => ({ IS_MOCK: false, CONFIG: {
  mode: 'soroban', assetCode: 'USDC', decimals: 7,
  assetAddress: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  assetContractId: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
  contractId: 'CAVVTPBBNOCMDBC26CVOXKSU7B7MDK33TXQXTVUVKSJHSVKGLZTVJ5N5',
  contractWasmHash: '12'.repeat(32),
  rpcUrl: 'https://example.invalid', networkPassphrase: 'Test SDF Network ; September 2015',
} }));

const owner = Keypair.random().publicKey();
const otherAsset = StrKey.encodeContract(Buffer.alloc(32, 9));
const record = (asset: string) => ({
  seller: owner, funder: owner, beneficiary: owner, asset, amount: 10_000_000n,
  pot: 10_000_000n, start_price: 10_000_000n, floor_price: 0n,
  start_ledger: 1, deadline_ledger: 100, handoff_window: 10, unlock_ledger: 1,
  slope_num: 0n, slope_den: 1n, venue_pubkey: Buffer.alloc(32, 1),
  claim_pubkey: Buffer.alloc(32, 2), attester_pubkey: Buffer.alloc(32, 3), state: 0,
});
const ok = (asset: string) => ({ result: { isErr: () => false, unwrap: () => record(asset) } });
const getters = ['get_fade', 'get_pod', 'get_trigger'] as const;
function fixture(asset = CONFIG.assetContractId, expectedAssetContractId: string | undefined = CONFIG.assetContractId) {
  const cfg = { rpcUrl: CONFIG.rpcUrl, contractId: CONFIG.contractId,
    networkPassphrase: Networks.TESTNET, expectedAssetContractId,
    signer: { address: async () => owner, signTransaction: vi.fn() } };
  const client = new SorobanAgyionClient(cfg);
  const bindings = {
    protocol_version: vi.fn(async () => ({ result: 3 })),
    get_fade: vi.fn(async () => ok(asset)), get_pod: vi.fn(async () => ok(asset)), get_trigger: vi.fn(async () => ok(asset)),
    create_fade: vi.fn(), create_pod: vi.fn(), create_trigger: vi.fn(),
    fade_price: vi.fn(async () => ({ result: 10_000_000n })),
    claim: vi.fn(), confirm_handoff: vi.fn(), refund: vi.fn(), claim_pod: vi.fn(),
    attest: vi.fn(), refund_trigger: vi.fn(), envoy_claim: vi.fn(),
  };
  vi.spyOn(client as any, 'bindings').mockResolvedValue(bindings);
  const submit = vi.spyOn(client as any, 'submit').mockResolvedValue(undefined);
  return { client, bindings, submit, signer: cfg.signer };
}
afterEach(() => { vi.restoreAllMocks(); resetClient(); });

describe('the application token policy', () => {
  it.each(getters)('rejects a foreign asset returned by %s before a panel can label it as USDC', async method => {
    const { client } = fixture(otherAsset);
    await expect(client[method](1n)).rejects.toThrow(/unsupported asset/i);
  });
  it.each(getters)('returns the configured asset unchanged from %s', async method => {
    const { client } = fixture();
    expect(await client[method](1n)).toMatchObject({ id: 1n, asset: CONFIG.assetContractId });
  });
  it.each(getters)('preserves missing-record and RPC-failure behavior for %s', async method => {
    const { client, bindings } = fixture();
    bindings[method].mockResolvedValueOnce({ result: { isErr: () => true, unwrapErr: () => ({ message: 'NotFound' }) } } as any);
    expect(await client[method](1n)).toBeNull();
    bindings[method].mockRejectedValueOnce(new Error('RPC unavailable'));
    await expect(client[method](1n)).rejects.toThrow(/RPC unavailable/);
  });
  it('pins the real application factory to the configured contract address', async () => {
    const client = getClient() as SorobanAgyionClient;
    vi.spyOn(client as any, 'bindings').mockResolvedValue({ get_fade: async () => ok(otherAsset) });
    await expect(client.get_fade(1n)).rejects.toThrow(/unsupported asset/i);
  });
  it.each(['', owner])('refuses an invalid explicitly configured asset policy', expectedAssetContractId => {
    expect(() => fixture(CONFIG.assetContractId, expectedAssetContractId)).toThrow(/asset.*contract/i);
  });
});

const creates = [
  ['create_fade', (c: SorobanAgyionClient, asset: string) => c.create_fade(owner, asset, 100n, 10n, 0n, 1n, 1n, 20, 10, 'a'.repeat(64))],
  ['create_pod', (c: SorobanAgyionClient, asset: string) => c.create_pod(owner, asset, 100n, 20, 'a'.repeat(64), 'b'.repeat(128))],
  ['create_trigger', (c: SorobanAgyionClient, asset: string) => c.create_trigger(owner, asset, 100n, owner, 'a'.repeat(64), 20)],
] as const;
it.each(creates)('rejects a foreign asset before assembling %s', async (method, invoke) => {
  const { client, bindings, submit } = fixture();
  await expect(invoke(client, otherAsset)).rejects.toThrow(/unsupported asset/i);
  expect(bindings[method]).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
});

const actions = [
  ['fade_price', (c: SorobanAgyionClient) => c.fade_price(1n)],
  ['claim', (c: SorobanAgyionClient) => c.claim(1n, owner)],
  ['confirm_handoff', (c: SorobanAgyionClient) => c.confirm_handoff(1n, 1n, 'b'.repeat(128))],
  ['refund', (c: SorobanAgyionClient) => c.refund(1n)],
  ['claim_pod', (c: SorobanAgyionClient) => c.claim_pod(1n, owner, 'b'.repeat(128))],
  ['attest', (c: SorobanAgyionClient) => c.attest(1n, 1n, 'b'.repeat(128))],
  ['refund_trigger', (c: SorobanAgyionClient) => c.refund_trigger(1n)],
  ['envoy_claim', (c: SorobanAgyionClient) => c.envoy_claim(2n, 1n, 1n, 'b'.repeat(128))],
] as const;
it.each(actions)('checks the stored asset for direct by-ID %s calls', async (method, invoke) => {
  const { client, bindings, submit, signer } = fixture(otherAsset);
  await expect(invoke(client)).rejects.toThrow(/unsupported asset/i);
  expect(bindings[method]).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
  expect(signer.signTransaction).not.toHaveBeenCalled();
});
it.each(actions)('allows direct by-ID %s for the configured asset', async (method, invoke) => {
  const { client, bindings } = fixture();
  await invoke(client);
  expect(bindings[method]).toHaveBeenCalledOnce();
});
