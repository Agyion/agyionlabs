import { Address, Account, Networks, StrKey, TransactionBuilder, Operation, xdr, rpc } from '@stellar/stellar-sdk';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SorobanAgyionClient, type SorobanConfig } from '../app/lib/agyionClient';
import { listTransactionAttempts, reconcileTransactionAttempts } from '../app/lib/transactionReceipts';
import { installRecoveryLocks, recoveryTransactionFixture } from './recovery-fixture';

const contractId = StrKey.encodeContract(Buffer.alloc(32, 3));
const asset = StrKey.encodeContract(Buffer.alloc(32, 4));
const otherAsset = StrKey.encodeContract(Buffer.alloc(32, 5));
const account = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const wasm = '12'.repeat(32);
const key = xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({ contract: new Address(contractId).toScAddress(),
  key: xdr.ScVal.scvLedgerKeyContractInstance(), durability: xdr.ContractDataDurability.persistent() }));
const storageEntry = (name: string, val: xdr.ScVal) => new xdr.ScMapEntry({ key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(name)]), val });
const assetValue = (ids: readonly string[]) => xdr.ScVal.scvVec(ids.map(id => new Address(id).toScVal()));
function instance(storage: xdr.ScMapEntry[] | null = [storageEntry('AccountingVersion', xdr.ScVal.scvU32(4)), storageEntry('Assets', assetValue([asset, otherAsset]))]): rpc.Api.LedgerEntryResult {
  return { key, lastModifiedLedgerSeq: 10, liveUntilLedgerSeq: 40,
    val: xdr.LedgerEntryData.contractData(new xdr.ContractDataEntry({ ext: new xdr.ExtensionPoint(0),
      contract: new Address(contractId).toScAddress(), key: key.contractData().key(), durability: xdr.ContractDataDurability.persistent(),
      val: xdr.ScVal.scvContractInstance(new xdr.ScContractInstance({ executable: xdr.ContractExecutable.contractExecutableWasm(Buffer.from(wasm, 'hex')), storage })) })) };
}
function configuration(overrides: Partial<SorobanConfig> = {}): SorobanConfig {
  return { contractId, rpcUrl: 'https://rpc.invalid', networkPassphrase: Networks.TESTNET,
    expectedContractWasmHash: wasm, expectedProtocolVersion: 4, expectedSupportedAssets: [asset, otherAsset], ...overrides };
}
function readiness(overrides: Partial<SorobanConfig> = {}) {
  const client = new SorobanAgyionClient(configuration(overrides));
  const server = (client as unknown as { server: rpc.Server }).server;
  vi.spyOn(server, 'getNetwork').mockResolvedValue({ passphrase: Networks.TESTNET, protocolVersion: '28' });
  const lookup = vi.spyOn(server, 'getLedgerEntries').mockResolvedValue({ entries: [instance()], latestLedger: 20 });
  const version = vi.fn(async () => ({ result: 4 }));
  vi.spyOn(client as unknown as { bindings(): Promise<unknown> }, 'bindings').mockResolvedValue({ protocol_version: version });
  return { client, lookup, version };
}
beforeEach(() => {
  vi.restoreAllMocks();
  // The suite exercises real SDK/XDR in Node's single Buffer realm. Browser
  // durability itself remains covered by the existing recovery/browser suites.
  const values = new Map<string, string>();
  const storage = { get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); }, clear: () => values.clear() };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { localStorage: storage, dispatchEvent: () => true });
  installRecoveryLocks();
});
afterEach(() => vi.unstubAllGlobals());

it('accepts exact V4 instance configuration, including counters added by later legitimate records', async () => {
  const { client, lookup } = readiness();
  expect(await client.protocolReadiness()).toBe('ready');
  lookup.mockResolvedValue({ entries: [instance([storageEntry('AccountingVersion', xdr.ScVal.scvU32(4)),
    storageEntry('Assets', assetValue([asset, otherAsset])), storageEntry('FadeCount', xdr.ScVal.scvU64(xdr.Uint64.fromString('7')))])], latestLedger: 20 });
  expect(await client.protocolReadiness()).toBe('ready');
});
it.each([3, 5])('does not accept protocol %s for an explicitly pinned V4 selection', async version => {
  const f = readiness(); f.version.mockResolvedValue({ result: version });
  expect(await f.client.protocolReadiness()).toBe('incompatible');
});
it.each([
  ['accounting version', [storageEntry('AccountingVersion', xdr.ScVal.scvU32(3)), storageEntry('Assets', assetValue([asset, otherAsset]))]],
  ['asset order', [storageEntry('AccountingVersion', xdr.ScVal.scvU32(4)), storageEntry('Assets', assetValue([otherAsset, asset]))]],
  ['asset omission', [storageEntry('AccountingVersion', xdr.ScVal.scvU32(4)), storageEntry('Assets', assetValue([asset]))]],
] as const)('refuses a well formed but different %s before version simulation', async (_name, entries) => {
  const f = readiness(); f.lookup.mockResolvedValue({ entries: [instance([...entries])], latestLedger: 20 });
  expect(await f.client.protocolReadiness()).toBe('incompatible'); expect(f.version).not.toHaveBeenCalled();
});
it.each(['missing', 'missing-assets', 'duplicate', 'wrong-version-type', 'wrong-asset-type', 'account-asset', 'expired', 'missing-ttl', 'fractional-ttl', 'future-modified'] as const)(
  'keeps %s instance evidence unavailable, never treating absent accounting as initialized', async kind => {
    const storage = [storageEntry('AccountingVersion', xdr.ScVal.scvU32(4)), storageEntry('Assets', assetValue([asset, otherAsset]))];
    if (kind === 'missing-assets') storage.pop();
    if (kind === 'duplicate') storage.push(storage[0]);
    if (kind === 'wrong-version-type') storage[0] = storageEntry('AccountingVersion', xdr.ScVal.scvI32(4));
    if (kind === 'wrong-asset-type') storage[1] = storageEntry('Assets', xdr.ScVal.scvBytes(Buffer.from(asset)));
    if (kind === 'account-asset') storage[1] = storageEntry('Assets', assetValue([account, otherAsset]));
    const entry = instance(kind === 'missing' ? null : storage);
    if (kind === 'expired') entry.liveUntilLedgerSeq = 19;
    if (kind === 'missing-ttl') delete entry.liveUntilLedgerSeq;
    if (kind === 'fractional-ttl') entry.liveUntilLedgerSeq = 20.5;
    if (kind === 'future-modified') entry.lastModifiedLedgerSeq = 21;
    const f = readiness(); f.lookup.mockResolvedValue({ entries: [entry], latestLedger: 20 });
    expect(await f.client.protocolReadiness()).toBe('unavailable'); expect(f.version).not.toHaveBeenCalled();
  });
it.each([
  { expectedSupportedAssets: undefined }, { expectedSupportedAssets: [] }, { expectedSupportedAssets: [asset, asset] },
  { expectedSupportedAssets: [account] }, { expectedSupportedAssets: ['bad'] },
  { expectedSupportedAssets: new Array<string>(1) },
  { expectedSupportedAssets: Array.from({ length: 9 }, (_, i) => StrKey.encodeContract(Buffer.alloc(32, i + 10))) },
  { expectedContractWasmHash: undefined }, { expectedAssetContractId: StrKey.encodeContract(Buffer.alloc(32, 9)) },
  { expectedProtocolVersion: 2 }, { writePolicy: 'unknown' },
])('refuses incomplete or contradictory release configuration before any RPC', overrides => {
  const lookup = vi.spyOn(rpc.Server.prototype, 'getNetwork');
  expect(() => new SorobanAgyionClient(configuration(overrides as Partial<SorobanConfig>))).toThrow();
  expect(lookup).not.toHaveBeenCalled();
});
it('keeps a copied release policy and asset list independent of caller mutation', async () => {
  const assets = [asset, otherAsset], cfg = configuration({ expectedSupportedAssets: assets });
  const client = new SorobanAgyionClient(cfg); assets.reverse(); cfg.expectedProtocolVersion = 3;
  const server = (client as unknown as { server: rpc.Server }).server;
  vi.spyOn(server, 'getNetwork').mockResolvedValue({ passphrase: Networks.TESTNET, protocolVersion: '28' });
  vi.spyOn(server, 'getLedgerEntries').mockResolvedValue({ entries: [instance()], latestLedger: 20 });
  vi.spyOn(client as unknown as { bindings(): Promise<unknown> }, 'bindings').mockResolvedValue({ protocol_version: async () => ({ result: 4 }) });
  expect(await client.protocolReadiness()).toBe('ready');
});

const creates = [
  ['create_fade', (c: SorobanAgyionClient) => c.create_fade(account, asset, 100n, 10n, 0n, 1n, 1n, 20, 10, 'a'.repeat(64))],
  ['create_pod', (c: SorobanAgyionClient) => c.create_pod(account, asset, 100n, 20, 'a'.repeat(64), 'b'.repeat(128))],
  ['create_trigger', (c: SorobanAgyionClient) => c.create_trigger(account, asset, 100n, account, 'a'.repeat(64), 20)],
  ['create_mandate', (c: SorobanAgyionClient) => c.create_mandate(account, 'a'.repeat(64), 100n, 200n, 20)],
  ['claim', (c: SorobanAgyionClient) => c.claim(1n, account)],
  ['envoy_claim', (c: SorobanAgyionClient) => c.envoy_claim(1n, 2n, 1n, 'a'.repeat(128))],
] as const;
it.each(creates)('blocks recovery-only %s before network simulation, signing or broadcast', async (_action, invoke) => {
  const signer = { address: async () => account, signTransaction: vi.fn() };
  const network = vi.spyOn(rpc.Server.prototype, 'getNetwork').mockRejectedValue(new Error('must stop before RPC'));
  const client = new SorobanAgyionClient(configuration({ expectedProtocolVersion: 3, writePolicy: 'recovery', signer }));
  await expect(invoke(client)).rejects.toThrow(/recovery/i);
  expect(network).not.toHaveBeenCalled(); expect(signer.signTransaction).not.toHaveBeenCalled(); expect(listTransactionAttempts()).toEqual([]);
});
it('rechecks recovery policy at the final submit boundary without inventing a pending hash', async () => {
  const client = new SorobanAgyionClient(configuration({ expectedProtocolVersion: 3, writePolicy: 'recovery', signer: { address: async () => account, signTransaction: vi.fn() } }));
  const tx = { signAndSend: vi.fn() };
  await expect((client as unknown as { submit(tx: unknown, action: string): Promise<unknown> }).submit(tx, 'create_pod')).rejects.toThrow(/recovery/i);
  expect(tx.signAndSend).not.toHaveBeenCalled(); expect(listTransactionAttempts()).toEqual([]);
});
it.each([
  ['confirm_handoff', (c: SorobanAgyionClient) => c.confirm_handoff(1n, 1n, 'a'.repeat(128))],
  ['refund', (c: SorobanAgyionClient) => c.refund(1n)],
  ['claim_pod', (c: SorobanAgyionClient) => c.claim_pod(1n, account, 'a'.repeat(128))],
  ['attest', (c: SorobanAgyionClient) => c.attest(1n, 1n, 'a'.repeat(128))],
  ['refund_trigger', (c: SorobanAgyionClient) => c.refund_trigger(1n)],
  ['revoke_mandate', (c: SorobanAgyionClient) => c.revoke_mandate(account, 1n)],
] as const)('preserves recovery %s with the original contract and real generated ABI', async (method, invoke) => {
  const client = new SorobanAgyionClient({ contractId, networkPassphrase: Networks.TESTNET, rpcUrl: 'https://rpc.invalid', writePolicy: 'recovery', signer: { address: async () => account, signTransaction: vi.fn() } });
  vi.spyOn(client, 'protocolReadiness').mockResolvedValue('ready');
  vi.spyOn(rpc.Server.prototype, 'getAccount').mockResolvedValue(new Account(account, '1'));
  const simulate = vi.spyOn(rpc.Server.prototype, 'simulateTransaction').mockImplementation(async tx => {
    const op = tx.operations[0]; if (op.type !== 'invokeHostFunction') throw new Error('wrong operation');
    const call = op.func.invokeContract();
    expect(Address.fromScAddress(call.contractAddress()).toString()).toBe(contractId);
    expect(call.functionName().toString()).toBe(method);
    throw new Error('stopped at genuine ABI simulation transport');
  });
  await expect(invoke(client)).rejects.toThrow('stopped at genuine ABI simulation transport'); expect(simulate).toHaveBeenCalledOnce();
});
it('retires a pending real binding wallet callback and sends nothing after its late reply', async () => {
  let resolve!: (xdr: string) => void;
  const signer = { address: async () => account, signTransaction: vi.fn(() => new Promise<string>(done => { resolve = done; })) };
  const client = new SorobanAgyionClient({ contractId, rpcUrl: 'https://rpc.invalid', networkPassphrase: Networks.TESTNET, signer });
  const bindings = await (client as unknown as { bindings(): Promise<{ options: { signTransaction(xdr: string, opts: { networkPassphrase: string }): Promise<unknown> } }> }).bindings();
  const wire = new TransactionBuilder(new Account(account, '1'), { networkPassphrase: Networks.TESTNET, fee: '100' })
    .addOperation(Operation.manageData({ name: 'retirement-test', value: null })).setTimeout(0).build().toXDR();
  const pending = bindings.options.signTransaction(wire, { networkPassphrase: Networks.TESTNET });
  const rejection = expect(pending).rejects.toThrow(/retired|selection/i);
  await vi.waitFor(() => expect(signer.signTransaction).toHaveBeenCalledOnce());
  client.retire(); resolve(wire); await rejection;
  expect(listTransactionAttempts()).toEqual([]);
  const send = vi.spyOn(rpc.Server.prototype, 'sendTransaction');
  await expect(client.refund(1n)).rejects.toThrow(/retired|selection/i); expect(send).not.toHaveBeenCalled();
});
it('retirement after broadcast preserves the original uncertain hash for read-only reconciliation', async () => {
  const fixture = recoveryTransactionFixture('retired-after-send');
  vi.spyOn(rpc.Server.prototype, 'sendTransaction').mockImplementation(async () => { client.retire(); throw new Error('response lost'); });
  const client = new SorobanAgyionClient({ contractId, rpcUrl: 'https://rpc.invalid', networkPassphrase: Networks.TESTNET, signer: { address: async () => account, signTransaction: vi.fn() } });
  const server = (client as unknown as { server: rpc.Server }).server;
  const tx = { signed: fixture.signed, signAndSend: async () => { await server.sendTransaction(fixture.signed); throw new Error('unexpected return'); } };
  vi.spyOn(client as unknown as { bindings(): Promise<unknown> }, 'bindings').mockResolvedValue({ protocol_version: async () => ({ result: 3 }), refund: async () => tx });
  await expect(client.refund(1n)).rejects.toThrow(fixture.hash);
  const scope = { account, network: Networks.TESTNET, contractId };
  expect(listTransactionAttempts(scope)).toMatchObject([{ hash: fixture.hash, status: 'unknown' }]);
  await reconcileTransactionAttempts({ getTransaction: async () => ({ txHash: fixture.hash, envelopeXdr: fixture.envelopeXdr, status: 'SUCCESS', ledger: 12 }) }, scope);
  expect(listTransactionAttempts(scope)).toMatchObject([{ hash: fixture.hash, status: 'success', ledger: 12 }]);
});
it('rechecks retirement after lazy signer resolution before simulating a recovery transaction', async () => {
  let resolve!: (value: string) => void;
  const address = vi.fn(() => new Promise<string>(done => { resolve = done; }));
  const client = new SorobanAgyionClient({ contractId, rpcUrl: 'https://rpc.invalid', networkPassphrase: Networks.TESTNET,
    writePolicy: 'recovery', signer: { address, signTransaction: vi.fn() } });
  vi.spyOn(client, 'protocolReadiness').mockResolvedValue('ready');
  const simulation = vi.spyOn(rpc.Server.prototype, 'getAccount').mockRejectedValue(new Error('must not simulate retired release'));
  const pending = client.refund(1n), failure = expect(pending).rejects.toThrow(/retired|selection/i);
  await vi.waitFor(() => expect(address).toHaveBeenCalledOnce()); client.retire(); resolve(account); await failure;
  expect(simulation).not.toHaveBeenCalled(); expect(listTransactionAttempts()).toEqual([]);
});
it('retired signed work cannot reach transport or create a phantom pending record', async () => {
  const send = vi.spyOn(rpc.Server.prototype, 'sendTransaction').mockRejectedValue(new Error('must not send'));
  const client = new SorobanAgyionClient({ contractId, rpcUrl: 'https://rpc.invalid', networkPassphrase: Networks.TESTNET,
    signer: { address: async () => account, signTransaction: vi.fn() } });
  const server = (client as unknown as { server: rpc.Server }).server, fixture = recoveryTransactionFixture('retired-before-send');
  const tx = { signed: fixture.signed, signAndSend: async () => { client.retire(); return server.sendTransaction(fixture.signed); } };
  vi.spyOn(client as unknown as { bindings(): Promise<unknown> }, 'bindings').mockResolvedValue({ protocol_version: async () => ({ result: 3 }), refund: async () => tx });
  await expect(client.refund(1n)).rejects.toThrow(/retired|selection/i);
  expect(send).not.toHaveBeenCalled(); expect(listTransactionAttempts()).toEqual([]);
});
