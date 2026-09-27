import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { expectedInstanceKey, assertObservedKernelReadback } from '../release-kernel-readback.mjs';
const require = createRequire(new URL('../../app/package.json', import.meta.url));
const { Address, StrKey, xdr } = require('@stellar/stellar-sdk');
const expected = { contractId: StrKey.encodeContract(Buffer.alloc(32, 7)), wasmHash: '12'.repeat(32) };
const other = StrKey.encodeContract(Buffer.alloc(32, 8));
const entryData = (id = expected.contractId, hash = expected.wasmHash) => xdr.LedgerEntryData.contractData(new xdr.ContractDataEntry({
  ext: new xdr.ExtensionPoint(0), contract: new Address(id).toScAddress(), key: xdr.ScVal.scvLedgerKeyContractInstance(), durability: xdr.ContractDataDurability.persistent(),
  val: xdr.ScVal.scvContractInstance(new xdr.ScContractInstance({ executable: xdr.ContractExecutable.contractExecutableWasm(Buffer.from(hash, 'hex')), storage: null })),
})).toXDR('base64');
const response = () => ({ result: { latestLedger: 20, entries: [{ key: expectedInstanceKey(expected.contractId), xdr: entryData(), lastModifiedLedgerSeq: 10 }] } });

test('accepts matching browser-observed public RPC instance data and code hash', () => {
  assert.deepEqual(assertObservedKernelReadback(response(), expected), { ...expected, latestLedger: 20, lastModifiedLedgerSeq: 10 });
});

test('rejects wrong-key, wrong-value address, wrong-code and malformed RPC evidence', () => {
  const mutations = [
    r => { r.error = { code: -1 }; },
    r => { r.result.latestLedger = 0; },
    r => { r.result.entries = []; },
    r => { r.result.entries.push(r.result.entries[0]); },
    r => { r.result.entries[0].key = expectedInstanceKey(other); },
    r => { r.result.entries[0].xdr = entryData(other); },
    r => { r.result.entries[0].xdr = entryData(expected.contractId, '34'.repeat(32)); },
    r => { r.result.entries[0].xdr = 'invalid'; },
    r => { r.result.entries[0].lastModifiedLedgerSeq = 21; },
    r => { r.result.entries[0].lastModifiedLedgerSeq = '10'; },
  ];
  for (const mutate of mutations) {
    const raw = response(); mutate(raw);
    assert.throws(() => assertObservedKernelReadback(raw, expected));
  }
});
