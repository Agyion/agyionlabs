import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { publicDeploymentReadbackKeys, verifyPublicDeploymentState, verifyPublicDeploymentReadback } from '../lib/public-deployment-readback.mjs';
const { Address, Contract, nativeToScVal, xdr } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const HASH = 'd101e0fea1852cf057049cc08695b9e26a8b3c6a82db58d4c2706db03a22b186';
const ASSETS = ['CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC', 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA'];
const CONTRACT = 'CAAPJHTCKEOPJAYTDRSIYCMMGH6NQXFLYKRTIJCZES5SQKQHMUS44I7N';
const CONSTRUCTOR = 'AAAAEAAAAAEAAAACAAAAEgAAAAHXkotywnA8z+r365/0701QSlWouXn8m0UOoshCtNHOYQAAABIAAAABUEXNXsBymnaP1a0CUFhS308Cjc6DDlrFIgm6SEg7LwE=';
const enumKey = name => xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(name)]);
function fixture() {
  // SYNTHETIC LEDGER FIXTURE: structural checks only; deliberately not reviewed executable bytes.
  const wasm = Buffer.from('synthetic ledger fixture, not executable code');
  const plan = { schema: 'agyion-public-kernel-offline-plan-v1', testOnly: true, manifestSha256: 'bc'.repeat(32), wasmSha256: HASH, wasmPath: '/synthetic/kernel.wasm', sourceAccount: 'GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57', salt: 'ab'.repeat(32), intendedContractId: CONTRACT, assets: [...ASSETS], constructorXdr: [CONSTRUCTOR], networkPassphrase: 'Test SDF Network ; September 2015', rpcUrl: 'https://soroban-testnet.stellar.org', identityDirectory: '/synthetic/identity' };
  // Build independent expected keys; never construct fixture using the helper under test.
  const keys = [xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: Buffer.from(HASH, 'hex') })), new Contract(CONTRACT).getFootprint(), ...ASSETS.map(a => new Contract(a).getFootprint()), ...ASSETS.map(a => xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({ contract: new Address(CONTRACT).toScAddress(), key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Liability'), new Address(a).toScVal()]), durability: xdr.ContractDataDurability.persistent() })))];
  const storage = [new xdr.ScMapEntry({ key: enumKey('AccountingVersion'), val: xdr.ScVal.scvU32(4) }), new xdr.ScMapEntry({ key: enumKey('Assets'), val: xdr.ScVal.fromXDR(CONSTRUCTOR, 'base64') })];
  const entries = keys.map((key, index) => {
    const val = index === 0 ? xdr.LedgerEntryData.contractCode(new xdr.ContractCodeEntry({ ext: new xdr.ContractCodeEntryExt(0), hash: Buffer.from(HASH, 'hex'), code: wasm })) : xdr.LedgerEntryData.contractData(new xdr.ContractDataEntry({ ext: new xdr.ExtensionPoint(0), contract: key.contractData().contract(), key: key.contractData().key(), durability: key.contractData().durability(), val: index >= 4 ? nativeToScVal(0n, { type: 'i128' }) : xdr.ScVal.scvContractInstance(new xdr.ScContractInstance({ executable: index === 1 ? xdr.ContractExecutable.contractExecutableWasm(Buffer.from(HASH, 'hex')) : xdr.ContractExecutable.contractExecutableStellarAsset(), storage: index === 1 ? storage : null })) }));
    return { key, val, lastModifiedLedgerSeq: 999, liveUntilLedgerSeq: 5000 };
  });
  return { plan, wasm, keys, storage, response: { latestLedger: 1000, entries } };
}

test('public readback requests reviewed code, instance, canonical SACs and both liability keys', () => {
  const f = fixture(); assert.deepEqual(publicDeploymentReadbackKeys(f.plan).map(k => k.toXDR('base64')), f.keys.map(k => k.toXDR('base64')));
});

test('synthetic initial V4 state validates structure but never authenticates executable bytes', () => {
  const f = fixture(), result = verifyPublicDeploymentState(f.plan, f.response);
  assert.equal(result.initialState, true); assert.equal(result.codeBytesAuthenticated, false);
  assert.equal(result.ledger, 1000); assert.deepEqual(result.liabilities.map(l => [l.asset, l.amount]), ASSETS.map(a => [a, '0']));
  assert.throws(() => verifyPublicDeploymentReadback({ plan: f.plan, wasm: f.wasm }, f.response), /WASM/);
});

for (const [name, mutate] of [
  ['missing data', f => { f.response.entries.pop(); }],
  ['extra data', f => { f.response.entries.push(f.response.entries[0]); }],
  ['duplicate key', f => { f.response.entries[1] = f.response.entries[0]; }],
  ['unexpected key', f => { f.response.entries[5].key = new Contract(ASSETS[0]).getFootprint(); }],
  ['zero head', f => { f.response.latestLedger = 0; }],
  ['fractional head', f => { f.response.latestLedger = 1000.5; }],
  ['out-of-range head', f => { f.response.latestLedger = 0x100000000; }],
  ['future modification', f => { f.response.entries[4].lastModifiedLedgerSeq = 1001; }],
  ['zero modification', f => { f.response.entries[4].lastModifiedLedgerSeq = 0; }],
  ['archived TTL zero', f => { f.response.entries[4].liveUntilLedgerSeq = 0; }],
  ['expired TTL', f => { f.response.entries[0].liveUntilLedgerSeq = 999; }],
  ['missing SAC TTL', f => { delete f.response.entries[2].liveUntilLedgerSeq; }],
  ['out-of-range TTL', f => { f.response.entries[2].liveUntilLedgerSeq = 0x100000000; }],
  ['redirected data identity', f => { f.response.entries[4].val.contractData().contract(new Address(ASSETS[0]).toScAddress()); }],
  ['temporary liability', f => { f.response.entries[4].val.contractData().durability(xdr.ContractDataDurability.temporary()); }],
  ['wrong ledger entry type', f => { f.response.entries[4].val = f.response.entries[0].val; }],
  ['wrong code hash', f => { f.response.entries[0].val.contractCode().hash(Buffer.alloc(32)); }],
  ['redirected instance executable', f => { f.response.entries[1].val.contractData().val().instance().executable(xdr.ContractExecutable.contractExecutableWasm(Buffer.alloc(32))); }],
  ['non-SAC asset executable', f => { f.response.entries[2].val.contractData().val().instance().executable(xdr.ContractExecutable.contractExecutableWasm(Buffer.from(HASH, 'hex'))); }],
  ['V3 accounting version', f => { f.storage[0].val(xdr.ScVal.scvU32(3)); }],
  ['noncanonical version type', f => { f.storage[0].val(nativeToScVal(4n, { type: 'i128' })); }],
  ['reordered constructor assets', f => { f.storage[1].val(xdr.ScVal.scvVec([...ASSETS].reverse().map(a => new Address(a).toScVal()))); }],
  ['counter from previously created position', f => { f.storage.push(new xdr.ScMapEntry({ key: enumKey('FadeCount'), val: nativeToScVal(1n, { type: 'u64' }) })); }],
  ['duplicate instance field', f => { f.storage[1].key(enumKey('AccountingVersion')); }],
  ['noncanonical instance key', f => { f.storage[0].key(xdr.ScVal.scvSymbol('AccountingVersion')); }],
  ['nonzero liability', f => { f.response.entries[4].val.contractData().val(nativeToScVal(1n, { type: 'i128' })); }],
  ['negative liability', f => { f.response.entries[4].val.contractData().val(nativeToScVal(-1n, { type: 'i128' })); }],
  ['noncanonical liability type', f => { f.response.entries[4].val.contractData().val(xdr.ScVal.scvU32(0)); }],
  ['liability modified after instance', f => { f.response.entries[4].lastModifiedLedgerSeq = 1000; }],
  ['liability predating constructor instance', f => { f.response.entries[4].lastModifiedLedgerSeq = 998; }],
  ['noncanonical storage ordering', f => { f.storage.reverse(); }],
]) test(`initial public state rejects ${name}`, () => { const f = fixture(); mutate(f); assert.throws(() => verifyPublicDeploymentState(f.plan, f.response)); });

test('same-sized synthetic executable cannot pass the full reviewed bytecode gate', () => {
  const f = fixture(); f.wasm = Buffer.alloc(26696); Buffer.from([0,97,115,109,1,0,0,0]).copy(f.wasm); f.response.entries[0].val.contractCode().code(f.wasm);
  assert.throws(() => verifyPublicDeploymentReadback({ plan: f.plan, wasm: f.wasm }, f.response), /WASM/);
});

test('same-ledger modifications and TTL equal to head remain live, independent of response order', () => {
  const f = fixture();
  for (const row of f.response.entries) { row.lastModifiedLedgerSeq = 1000; row.liveUntilLedgerSeq = 1000; }
  f.response.entries.reverse();
  assert.equal(verifyPublicDeploymentState(f.plan, f.response).initialState, true);
});
