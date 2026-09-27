/** Initial deployment evidence from one trusted RPC ledger snapshot.
 * Missing or archived entries are errors, never implicit zero balances.
 * This proves neither future solvency nor proof-system soundness. */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { verifyReadback } from '../../contracts/private-pool/tools/prepare-deployment.mjs';
const { Address, Contract, scValToNative, xdr } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const { poseidon2 } = createRequire(new URL('../../privacy/package.json', import.meta.url))('poseidon-lite');
const ensure = (ok, code) => { if (!ok)
    throw Error(code); };
const hex = bytes => Buffer.from(bytes).toString('hex');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function emptyRoot(depth) { let value = 0n; for (let i = 0; i < depth; i++)
    value = poseidon2([value, value]); return value.toString(16).padStart(64, '0'); }
function counterKey(pool, asset) { return xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({ contract: new Address(pool).toScAddress(), key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Liability'), new Address(asset).toScVal()]), durability: xdr.ContractDataDurability.persistent() })); }
export function deploymentReadbackKeys(plan) {
    return [xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: Buffer.from(plan.wasmSha256, 'hex') })), new Contract(plan.intendedContractId).getFootprint(), ...plan.config.assets.map(asset => new Contract(asset).getFootprint()), ...plan.config.assets.map(asset => counterKey(plan.intendedContractId, asset))];
}
export function verifyDeploymentReadback({ plan, wasm }, response) {
    const keys = deploymentReadbackKeys(plan), ledger = response.latestLedger;
    ensure(Number.isSafeInteger(ledger) && ledger > 0 && Array.isArray(response.entries) && response.entries.length === keys.length, 'DEPLOYMENT_READBACK_MISSING');
    const expected = new Map(keys.map(k => [k.toXDR('base64'), k])), rows = new Map();
    for (const row of response.entries) {
        const key = row.key.toXDR('base64'), wanted = expected.get(key);
        ensure(wanted && !rows.has(key), 'DEPLOYMENT_READBACK_KEY');
        ensure(Number.isSafeInteger(row.lastModifiedLedgerSeq) && row.lastModifiedLedgerSeq > 0 && row.lastModifiedLedgerSeq <= ledger, 'DEPLOYMENT_READBACK_LEDGER');
        ensure(Number.isSafeInteger(row.liveUntilLedgerSeq) && row.liveUntilLedgerSeq >= ledger, 'DEPLOYMENT_READBACK_EXPIRED');
        const type = wanted.switch().name;
        ensure(row.val.switch().name === type, 'DEPLOYMENT_READBACK_TYPE');
        if (type === 'contractCode')
            ensure(row.val.contractCode().hash().equals(wanted.contractCode().hash()), 'DEPLOYMENT_READBACK_KEY');
        else {
            const actual = row.val.contractData(), k = wanted.contractData();
            ensure(actual.contract().toXDR().equals(k.contract().toXDR()) && actual.key().toXDR().equals(k.key().toXDR()) && actual.durability().value === k.durability().value, 'DEPLOYMENT_READBACK_KEY');
        }
        rows.set(key, row);
    }
    const get = key => rows.get(key.toXDR('base64'));
    const code = Buffer.from(get(keys[0]).val.contractCode().code());
    ensure(code.equals(wasm) && sha(code) === plan.wasmSha256, 'DEPLOYMENT_READBACK_CODE');
    const instanceValue = get(keys[1]).val.contractData().val();
    ensure(instanceValue.switch().name === 'scvContractInstance', 'DEPLOYMENT_READBACK_INSTANCE');
    const instance = instanceValue.instance();
    ensure(instance.executable().switch().name === 'contractExecutableWasm' && hex(instance.executable().wasmHash()) === plan.wasmSha256, 'DEPLOYMENT_READBACK_CODE');
    const storage = instance.storage();
    ensure(Array.isArray(storage) && storage.length === 4, 'DEPLOYMENT_READBACK_STORAGE');
    const values = new Map();
    for (const entry of storage) {
        const key = entry.key();
        ensure(key.switch().name === 'scvVec' && key.vec()?.length === 1 && key.vec()[0].switch().name === 'scvSymbol', 'DEPLOYMENT_READBACK_STORAGE');
        const name = key.vec()[0].sym().toString();
        ensure(['Config', 'State', 'Vk', 'RevocationVk'].includes(name) && !values.has(name), 'DEPLOYMENT_READBACK_STORAGE');
        values.set(name, entry.val());
    }
    ensure(values.get('Vk').toXDR('base64') === plan.constructorXdr[1] && values.get('RevocationVk').toXDR('base64') === plan.constructorXdr[2], 'DEPLOYMENT_READBACK_VERIFIER');
    const actual = scValToNative(values.get('Config'));
    const config = { ...actual, domain: hex(actual.domain), asset_ids: actual.asset_ids.map(hex), asset_policy_root: hex(actual.asset_policy_root), config: { ...actual.config, auditor_x: hex(actual.config.auditor_x), auditor_y: hex(actual.config.auditor_y), dkg_transcript_hash: hex(actual.config.dkg_transcript_hash) } };
    const verified = verifyReadback(plan, plan.intendedContractId, code, config);
    const state = scValToNative(values.get('State')), root = emptyRoot(32), revocationRoot = emptyRoot(128);
    ensure(state.next_index === 0n && state.record_count === 0n && state.revocation_count === 0n && hex(state.root) === root && hex(state.revocation_root) === revocationRoot && state.roots.length === 1 && hex(state.roots[0]) === root, 'DEPLOYMENT_READBACK_INITIAL_STATE');
    const liabilities = [];
    for (let i = 0; i < plan.config.assets.length; i++) {
        const asset = plan.config.assets[i], sac = get(keys[2 + i]).val.contractData().val();
        ensure(sac.switch().name === 'scvContractInstance' && sac.instance().executable().switch().name === 'contractExecutableStellarAsset', 'DEPLOYMENT_READBACK_SAC');
        const row = get(keys[2 + plan.config.assets.length + i]), value = row.val.contractData().val();
        ensure(value.switch().name === 'scvI128' && scValToNative(value) === 0n, 'DEPLOYMENT_READBACK_INITIAL_LIABILITY');
        ensure(row.lastModifiedLedgerSeq <= get(keys[1]).lastModifiedLedgerSeq, 'DEPLOYMENT_READBACK_LEDGER');
        liabilities.push({ asset, amount: '0', liveUntilLedger: row.liveUntilLedgerSeq });
    }
    return { ...verified, ledger, initialState: true, verifyingKeysMatch: true, canonicalSacsObserved: true, liabilities, boundary: 'Trusted RPC initial state only; no future solvency, independent audit or production setup claim.' };
}
