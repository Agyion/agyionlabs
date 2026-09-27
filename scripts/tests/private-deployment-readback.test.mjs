import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { encodeConfig, TESTNET, RPC } from '../../contracts/private-pool/tools/prepare-deployment.mjs';
import { deploymentReadbackKeys, verifyDeploymentReadback } from '../lib/private-deployment-readback.mjs';
const { Address, xdr, nativeToScVal } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const host = JSON.parse(fs.readFileSync(new URL('../../contracts/private-pool/fixtures/host-config.json', import.meta.url)));
const field = n => BigInt(n).toString(16).padStart(64, '0'), raw = hex => xdr.ScVal.scvBytes(Buffer.from(hex, 'hex'));
const map = object => xdr.ScVal.scvMap(Object.entries(object).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(k), val: v })));
const root = '2f68a1c58e257e42a17a6c61dff5551ed560b9922ab119d5ac8e184c9734ead9', revoke = '191d14df3bd6bc5fd14b5ca14c60e5ee8dcf3c7d7cf9f421fb3e92312ec2ae7a';
function fixture() {
    const wasm = Buffer.from('synthetic readback byte identity; not executable'), config = { assets: [host.asset], disclosure_epoch: 1, auditor_x: field(host.auditorX), auditor_y: field(host.auditorY), dkg_transcript_hash: host.dkgTranscriptHash };
    const vk = xdr.ScVal.scvU32(1), rev = xdr.ScVal.scvU32(2);
    const plan = { schema: 'agyion-private-pool-offline-plan-v2', testOnly: true, networkPassphrase: TESTNET, rpcUrl: RPC, config, wasmSha256: createHash('sha256').update(wasm).digest('hex'), manifestSha256: 'ab'.repeat(32), sourceAccount: host.funder, salt: 'ab'.repeat(32), intendedContractId: 'CB7UCCOKZZZR5BRM3XNTXS3NRSEFKYT2INAL74MEWIW3XLCRH37LFTVG', constructorXdr: [encodeConfig(config), vk, rev].map(v => v.toXDR('base64')) };
    const poolConfig = map({ config: encodeConfig(config), domain: raw('024228d847c64600881b9f3e2006886031107153430cedd2a5a52799c79dacb8'), asset_ids: xdr.ScVal.scvVec([raw(field(host.assetId))]), asset_policy_root: raw(field(host.assetPolicyRoot)) });
    const state = map({ root: raw(root), revocation_root: raw(revoke), roots: xdr.ScVal.scvVec([raw(root)]), next_index: nativeToScVal(0n, { type: 'u64' }), record_count: nativeToScVal(0n, { type: 'u64' }), revocation_count: nativeToScVal(0n, { type: 'u64' }) });
    const storage = Object.entries({ Config: poolConfig, State: state, Vk: vk, RevocationVk: rev }).map(([k, val]) => new xdr.ScMapEntry({ key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(k)]), val }));
    const keys = deploymentReadbackKeys(plan);
    const rows = keys.map(key => {
        let val;
        if (key.switch().name === 'contractCode')
            val = xdr.LedgerEntryData.contractCode(new xdr.ContractCodeEntry({ ext: new xdr.ContractCodeEntryExt(0), hash: Buffer.from(plan.wasmSha256, 'hex'), code: wasm }));
        else {
            const k = key.contractData(), isPool = k.contract().toXDR().equals(new Address(plan.intendedContractId).toScAddress().toXDR());
            const value = k.key().switch().name === 'scvLedgerKeyContractInstance' ? xdr.ScVal.scvContractInstance(new xdr.ScContractInstance({ executable: isPool ? xdr.ContractExecutable.contractExecutableWasm(Buffer.from(plan.wasmSha256, 'hex')) : xdr.ContractExecutable.contractExecutableStellarAsset(), storage: isPool ? storage : null })) : nativeToScVal(0n, { type: 'i128' });
            val = xdr.LedgerEntryData.contractData(new xdr.ContractDataEntry({ ext: new xdr.ExtensionPoint(0), contract: k.contract(), key: k.key(), durability: k.durability(), val: value }));
        }
        return { key, val, lastModifiedLedgerSeq: 999, liveUntilLedgerSeq: 5000 };
    });
    return { context: { plan, wasm }, response: { latestLedger: 1000, entries: rows }, storage };
}
test('initial readback binds code, all constructor values, verifier keys, roots and zero liabilities', () => {
    const f = fixture(), result = verifyDeploymentReadback(f.context, f.response);
    assert.equal(result.matchesReviewedPlan, true);
    assert.equal(result.initialState, true);
    assert.equal(result.liabilities[0].amount, '0');
    assert.equal(result.ledger, 1000);
});
test('missing, expired, duplicate or redirected data cannot be treated as initialized zero', () => {
    for (const mutate of [f => f.response.entries.pop(), f => { f.response.entries.at(-1).liveUntilLedgerSeq = 999; }, f => { f.response.entries.at(-1).liveUntilLedgerSeq = undefined; }, f => { f.response.entries.at(-1).lastModifiedLedgerSeq = 1001; }, f => { f.response.entries[1] = f.response.entries[0]; }, f => { f.response.entries.at(-1).val.contractData().contract(new Address(host.asset).toScAddress()); }]) {
        const f = fixture();
        mutate(f);
        assert.throws(() => verifyDeploymentReadback(f.context, f.response));
    }
});
test('different bytecode, authorization keys, roots or existing liabilities reject initial activation evidence', () => {
    for (const mutate of [f => f.response.entries[0].val.contractCode().code(Buffer.from('other')), f => f.storage.find(e => e.key().vec()[0].sym().toString() === 'Vk').val(xdr.ScVal.scvU32(9)), f => f.storage.find(e => e.key().vec()[0].sym().toString() === 'State').val().map().find(e => e.key().sym().toString() === 'record_count').val(nativeToScVal(1n, { type: 'u64' })), f => f.response.entries.at(-1).val.contractData().val(nativeToScVal(1n, { type: 'i128' })), f => f.response.entries.at(-1).val.contractData().val(nativeToScVal(0n, { type: 'u64' }))]) {
        const f = fixture();
        mutate(f);
        assert.throws(() => verifyDeploymentReadback(f.context, f.response));
    }
});
