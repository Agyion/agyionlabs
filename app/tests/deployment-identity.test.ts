import { Address, Networks, StrKey, xdr, rpc } from '@stellar/stellar-sdk';
import { describe, expect, it, vi } from 'vitest';
import { SorobanAgyionClient } from '../app/lib/agyionClient';

const contract = StrKey.encodeContract(Buffer.alloc(32, 3));
const other = StrKey.encodeContract(Buffer.alloc(32, 4));
const wasm = '12'.repeat(32);
const keyFor = (id: string) => xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
  contract: new Address(id).toScAddress(), key: xdr.ScVal.scvLedgerKeyContractInstance(), durability: xdr.ContractDataDurability.persistent(),
}));
function entry(id = contract, hash = wasm): rpc.Api.LedgerEntryResult {
  return { key: keyFor(id), lastModifiedLedgerSeq: 10, val: xdr.LedgerEntryData.contractData(new xdr.ContractDataEntry({
    ext: new xdr.ExtensionPoint(0), contract: new Address(id).toScAddress(), key: xdr.ScVal.scvLedgerKeyContractInstance(), durability: xdr.ContractDataDurability.persistent(),
    val: xdr.ScVal.scvContractInstance(new xdr.ScContractInstance({ executable: xdr.ContractExecutable.contractExecutableWasm(Buffer.from(hash, 'hex')), storage: null })),
  })) };
}
function fixture() {
  const c = new SorobanAgyionClient({ rpcUrl: 'https://rpc.invalid', contractId: contract, networkPassphrase: Networks.TESTNET, expectedContractWasmHash: wasm });
  const server = (c as unknown as { server: rpc.Server }).server;
  vi.spyOn(server, 'getNetwork').mockResolvedValue({ passphrase: Networks.TESTNET, protocolVersion: '28' });
  vi.spyOn(server, 'getLedgerEntries').mockResolvedValue({ entries: [entry()], latestLedger: 20 });
  const version = vi.fn(async () => ({ result: 3 }));
  vi.spyOn(c as any, 'bindings').mockResolvedValue({ protocol_version: version });
  return { c, server, version };
}
describe('deployment identity pinning', () => {
  it('accepts matching network, instance key, WASM and protocol', async () => {
    const { c, server } = fixture();
    expect(await c.protocolReadiness()).toBe('ready');
    expect(server.getNetwork).toHaveBeenCalledOnce();
    expect(server.getLedgerEntries).toHaveBeenCalledWith(keyFor(contract));
  });
  it('refuses a different network even when protocol_version reports V3', async () => {
    const { c, server, version } = fixture();
    vi.mocked(server.getNetwork).mockResolvedValue({ passphrase: Networks.PUBLIC, protocolVersion: '28' });
    expect(await c.protocolReadiness()).toBe('incompatible');
    expect(version).not.toHaveBeenCalled();
  });
  it('refuses an unreviewed WASM with the correct version', async () => {
    const { c, server, version } = fixture();
    vi.mocked(server.getLedgerEntries).mockResolvedValue({ entries: [entry(contract, '34'.repeat(32))], latestLedger: 20 });
    expect(await c.protocolReadiness()).toBe('incompatible');
    expect(version).not.toHaveBeenCalled();
  });
  it.each(['key', 'address', 'missing', 'extra', 'ledger'] as const)('does not accept malformed %s evidence', async kind => {
    const { c, server, version } = fixture();
    const e = entry();
    if (kind === 'key') e.key = keyFor(other);
    if (kind === 'address') e.val = entry(other).val;
    if (kind === 'ledger') e.lastModifiedLedgerSeq = 21;
    vi.mocked(server.getLedgerEntries).mockResolvedValue({ entries: kind === 'missing' ? [] : kind === 'extra' ? [e,e] : [e], latestLedger: 20 });
    expect(await c.protocolReadiness()).toBe('unavailable');
    expect(version).not.toHaveBeenCalled();
  });
  it('keeps a failed identity lookup unavailable', async () => {
    const { c, server } = fixture();
    vi.mocked(server.getLedgerEntries).mockRejectedValue(new Error('offline'));
    expect(await c.protocolReadiness()).toBe('unavailable');
  });
  it.each(['', '1234', 'gg'.repeat(32)])('rejects an invalid explicit pin %s', pin => {
    expect(() => new SorobanAgyionClient({ rpcUrl: 'https://rpc.invalid', contractId: contract, networkPassphrase: Networks.TESTNET, expectedContractWasmHash: pin })).toThrow(/WASM|hash|pin/i);
  });
});
