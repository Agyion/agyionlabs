/** Initial PUBLIC V4 evidence from one trusted RPC snapshot. No custody,
 * future-solvency, independent-audit or production claim follows from this. */
import { createRequire } from 'node:module';
import { validatePublicDeploymentPlan, validatePublicDeploymentWasm } from './public-deployment-plan.mjs';
const { Address, Contract, xdr } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const ensure = (ok, code) => { if (!ok) throw Error(code); };
const uint32 = n => Number.isInteger(n) && n > 0 && n <= 0xffffffff;
const bytes = value => value.toXDR('base64');
const enumKey = name => xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(name)]);
const zeroI128 = xdr.ScVal.scvI128(new xdr.Int128Parts({ hi: xdr.Int64.fromString('0'), lo: xdr.Uint64.fromString('0') })).toXDR('base64');
function liabilityKey(contract, asset) {
  return xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({ contract: new Address(contract).toScAddress(), key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Liability'), new Address(asset).toScVal()]), durability: xdr.ContractDataDurability.persistent() }));
}

export function publicDeploymentReadbackKeys(plan) {
  validatePublicDeploymentPlan(plan);
  return [xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: Buffer.from(plan.wasmSha256, 'hex') })), new Contract(plan.intendedContractId).getFootprint(), ...plan.assets.map(a => new Contract(a).getFootprint()), ...plan.assets.map(a => liabilityKey(plan.intendedContractId, a))];
}

function checkedRows(plan, response) {
  const keys = publicDeploymentReadbackKeys(plan), ledger = response?.latestLedger;
  ensure(uint32(ledger) && Array.isArray(response.entries) && response.entries.length === keys.length, 'PUBLIC_READBACK_MISSING');
  const wanted = new Map(keys.map(k => [bytes(k), k])), rows = new Map();
  for (const row of response.entries) {
    const key = bytes(row.key), expected = wanted.get(key);
    ensure(expected && !rows.has(key), 'PUBLIC_READBACK_KEY');
    ensure(uint32(row.lastModifiedLedgerSeq) && row.lastModifiedLedgerSeq <= ledger, 'PUBLIC_READBACK_LEDGER');
    ensure(uint32(row.liveUntilLedgerSeq) && row.liveUntilLedgerSeq >= ledger, 'PUBLIC_READBACK_EXPIRED');
    ensure(row.val.switch().name === expected.switch().name, 'PUBLIC_READBACK_TYPE');
    if (expected.switch().name === 'contractCode') {
      ensure(row.val.contractCode().hash().equals(expected.contractCode().hash()), 'PUBLIC_READBACK_KEY');
    } else {
      const actual = row.val.contractData(), expectedData = expected.contractData();
      ensure(bytes(actual.contract()) === bytes(expectedData.contract()) && bytes(actual.key()) === bytes(expectedData.key()) && actual.durability().value === expectedData.durability().value, 'PUBLIC_READBACK_KEY');
    }
    rows.set(key, row);
  }
  return { keys, ledger, get: key => rows.get(bytes(key)) };
}

/** Structural state check ONLY: it does not authenticate executable code bytes.
 * Never use this helper to authorize deployment activation. The full
 * verifyPublicDeploymentReadback function is the sole deployment gate. */
export function verifyPublicDeploymentState(plan, response) {
  const { keys, ledger, get } = checkedRows(plan, response);
  const instanceRow = get(keys[1]), value = instanceRow.val.contractData().val();
  ensure(value.switch().name === 'scvContractInstance', 'PUBLIC_READBACK_INSTANCE');
  const instance = value.instance();
  ensure(instance.executable().switch().name === 'contractExecutableWasm' && instance.executable().wasmHash().toString('hex') === plan.wasmSha256, 'PUBLIC_READBACK_CODE');
  const storage = instance.storage();
  ensure(Array.isArray(storage) && storage.length === 2, 'PUBLIC_READBACK_INITIAL_STORAGE');
  ensure(bytes(storage[0].key()) === bytes(enumKey('AccountingVersion')) && bytes(storage[1].key()) === bytes(enumKey('Assets')), 'PUBLIC_READBACK_INITIAL_STORAGE');
  ensure(bytes(storage[0].val()) === bytes(xdr.ScVal.scvU32(4)), 'PUBLIC_READBACK_VERSION');
  ensure(bytes(storage[1].val()) === plan.constructorXdr[0], 'PUBLIC_READBACK_ASSETS');
  const liabilities = plan.assets.map((asset, index) => {
    const sac = get(keys[2 + index]).val.contractData().val();
    ensure(sac.switch().name === 'scvContractInstance' && sac.instance().executable().switch().name === 'contractExecutableStellarAsset', 'PUBLIC_READBACK_SAC');
    const row = get(keys[4 + index]);
    ensure(bytes(row.val.contractData().val()) === zeroI128, 'PUBLIC_READBACK_INITIAL_LIABILITY');
    ensure(row.lastModifiedLedgerSeq === instanceRow.lastModifiedLedgerSeq, 'PUBLIC_READBACK_INITIAL_LEDGER');
    return { asset, amount: '0', liveUntilLedger: row.liveUntilLedgerSeq };
  });
  return { schema: 'agyion-public-kernel-initial-state-structure-v1', testOnly: true, contractId: plan.intendedContractId, manifestSha256: plan.manifestSha256, wasmSha256: plan.wasmSha256, ledger, accountingVersion: 4, assets: [...plan.assets], initialState: true, codeBytesAuthenticated: false, canonicalSacsObserved: true, liabilities, boundary: 'Trusted RPC initial state structure only; executable bytes are not authenticated; no custody, future solvency or independent audit claim.' };
}

/** Sole activation readback gate: exact reviewed code bytes AND initial state. */
export function verifyPublicDeploymentReadback({ plan, wasm }, response) {
  validatePublicDeploymentPlan(plan);
  validatePublicDeploymentWasm(wasm);
  const state = verifyPublicDeploymentState(plan, response);
  const codeKey = publicDeploymentReadbackKeys(plan)[0];
  const code = response.entries.find(row => bytes(row.key) === bytes(codeKey)).val.contractCode().code();
  ensure(Buffer.from(code).equals(wasm), 'PUBLIC_READBACK_CODE');
  return { ...state, schema: 'agyion-public-kernel-initial-readback-v1', matchesReviewedPlan: true, codeBytesAuthenticated: true, boundary: 'Reviewed bytecode and trusted RPC initial state only; no custody, future solvency, independent audit or production claim.' };
}
