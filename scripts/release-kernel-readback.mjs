/** Validate public RPC response identity observed by the actual browser. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../app/package.json', import.meta.url));
const { Address, Contract, xdr } = require('@stellar/stellar-sdk');

export const expectedInstanceKey = id => new Contract(id).getFootprint().toXDR('base64');

export function assertObservedKernelReadback(raw, expected) {
  assert.ok(!raw.error && raw.result, 'Kernel RPC response must be successful');
  const { entries, latestLedger } = raw.result;
  assert.ok(Number.isSafeInteger(latestLedger) && latestLedger > 0, 'Invalid kernel response ledger');
  assert.ok(Array.isArray(entries) && entries.length === 1, 'Expected one kernel instance entry');
  const entry = entries[0];
  assert.equal(entry.key, expectedInstanceKey(expected.contractId), 'Returned kernel key differs');
  assert.ok(Number.isSafeInteger(entry.lastModifiedLedgerSeq) && entry.lastModifiedLedgerSeq > 0 && entry.lastModifiedLedgerSeq <= latestLedger, 'Invalid kernel modification ledger');
  const value = xdr.LedgerEntryData.fromXDR(entry.xdr, 'base64');
  assert.equal(value.switch().name, 'contractData', 'Expected contract data');
  const data = value.contractData();
  assert.equal(data.contract().toXDR('base64'), new Address(expected.contractId).toScAddress().toXDR('base64'), 'Returned kernel address differs');
  assert.equal(data.durability().name, 'persistent');
  assert.equal(data.key().switch().name, 'scvLedgerKeyContractInstance');
  assert.equal(data.val().switch().name, 'scvContractInstance');
  const executable = data.val().instance().executable();
  assert.equal(executable.switch().name, 'contractExecutableWasm');
  assert.equal(executable.wasmHash().toString('hex'), expected.wasmHash, 'Returned kernel WASM differs');
  return { contractId: expected.contractId, wasmHash: expected.wasmHash, latestLedger, lastModifiedLedgerSeq: entry.lastModifiedLedgerSeq };
}
