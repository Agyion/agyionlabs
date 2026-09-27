/** Offline PUBLIC V4 release authority. No network, secret loading or execution. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { deriveContractId } from '../../contracts/private-pool/tools/prepare-deployment.mjs';
const { Address, StrKey, xdr } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
export const TESTNET = 'Test SDF Network ; September 2015';
export const RPC = 'https://soroban-testnet.stellar.org';
export const PUBLIC_CANDIDATE_WASM = 'd101e0fea1852cf057049cc08695b9e26a8b3c6a82db58d4c2706db03a22b186';
const WASM_SIZE = 26696;
const ASSETS = Object.freeze(['CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC', 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA']);
const ensure = (ok, code) => { if (!ok) throw Error(code); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hash32 = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) && value !== '0'.repeat(64);
function exact(value, keys) {
  ensure(value && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k)), 'PUBLIC_MANIFEST_FIELDS');
}

/** One Vec<Address> constructor argument in the reviewed native-XLM/USDC order. */
export function encodePublicConstructor(assets) {
  ensure(Array.isArray(assets) && assets.length === 2 && ASSETS.every((a, i) => Object.hasOwn(assets, i) && assets[i] === a), 'PUBLIC_ASSETS');
  return xdr.ScVal.scvVec(assets.map(a => new Address(a).toScVal()));
}

/** Pure validation; does not authenticate an artifact or inspect a directory. */
export function validatePublicDeploymentManifest(m) {
  exact(m, ['schema', 'testOnly', 'networkPassphrase', 'rpcUrl', 'wasm', 'sourceAccount', 'salt', 'intendedContractId', 'assets']);
  ensure(m.schema === 'agyion-public-kernel-testnet-release-v1' && m.testOnly === true && m.networkPassphrase === TESTNET && m.rpcUrl === RPC, 'PUBLIC_TESTNET');
  exact(m.wasm, ['path', 'sha256']);
  ensure(typeof m.wasm.path === 'string' && m.wasm.path.length > 0 && m.wasm.path.length <= 4096 && !m.wasm.path.includes('\0') && m.wasm.sha256 === PUBLIC_CANDIDATE_WASM, 'PUBLIC_WASM');
  ensure(typeof m.sourceAccount === 'string' && StrKey.isValidEd25519PublicKey(m.sourceAccount) && hash32(m.salt), 'PUBLIC_AUTHORITY');
  ensure(m.intendedContractId === deriveContractId(m.sourceAccount, m.salt), 'PUBLIC_CONTRACT_ID');
  const constructorXdr = [encodePublicConstructor(m.assets).toXDR('base64')];
  return { sourceAccount: m.sourceAccount, salt: m.salt, intendedContractId: m.intendedContractId, assets: [...m.assets], constructorXdr };
}

/** Revalidate all signing-relevant fields before deriving keys or verifying state. */
export function validatePublicDeploymentPlan(plan) {
  ensure(plan?.schema === 'agyion-public-kernel-offline-plan-v1' && hash32(plan.manifestSha256), 'PUBLIC_PLAN');
  const checked = validatePublicDeploymentManifest({ schema: 'agyion-public-kernel-testnet-release-v1', testOnly: plan.testOnly, networkPassphrase: plan.networkPassphrase, rpcUrl: plan.rpcUrl, wasm: { path: plan.wasmPath, sha256: plan.wasmSha256 }, sourceAccount: plan.sourceAccount, salt: plan.salt, intendedContractId: plan.intendedContractId, assets: plan.assets });
  ensure(Array.isArray(plan.constructorXdr) && plan.constructorXdr.length === 1 && plan.constructorXdr[0] === checked.constructorXdr[0], 'PUBLIC_CONSTRUCTOR');
  return true;
}

function privateIdentityDirectory(value) {
  ensure(typeof value === 'string' && path.isAbsolute(value) && path.resolve(value) === value, 'PUBLIC_IDENTITY');
  const stat = fs.lstatSync(value);
  ensure(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o777) === 0o700 && fs.realpathSync(value) === value, 'PUBLIC_IDENTITY');
  return value;
}

/** Bounded descriptor read; reject symlinks, substitutions and concurrent growth. */
function readBounded(file, max) {
  ensure(typeof file === 'string' && file.length > 0, 'PUBLIC_FILE');
  const resolved = path.resolve(file), stat = fs.lstatSync(resolved);
  ensure(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= max && fs.realpathSync(resolved) === resolved, 'PUBLIC_FILE');
  const fd = fs.openSync(resolved, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const opened = fs.fstatSync(fd);
    ensure(opened.isFile() && opened.ino === stat.ino && opened.dev === stat.dev && opened.size === stat.size && opened.mode === stat.mode && opened.uid === stat.uid, 'PUBLIC_FILE');
    const buffer = Buffer.alloc(opened.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const count = fs.readSync(fd, buffer, length, buffer.length - length, length);
      if (count === 0) break;
      length += count;
    }
    ensure(length === opened.size && fs.fstatSync(fd).size === opened.size, 'PUBLIC_FILE');
    return buffer.subarray(0, length);
  } finally { fs.closeSync(fd); }
}

/** Exact reviewed byte identity, shared by the loader and full readback gate. */
export function validatePublicDeploymentWasm(bytes) {
  ensure(Buffer.isBuffer(bytes) && bytes.length === WASM_SIZE && bytes.subarray(0, 8).equals(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0])) && sha(bytes) === PUBLIC_CANDIDATE_WASM, 'PUBLIC_WASM');
  return true;
}

export function readPublicDeploymentWasm(file) {
  const bytes = readBounded(file, WASM_SIZE);
  validatePublicDeploymentWasm(bytes);
  return bytes;
}

export async function preparePublicDeployment(manifestPath, identityDirectory) {
  privateIdentityDirectory(identityDirectory);
  const manifestBytes = readBounded(manifestPath, 65536);
  let manifest;
  try { manifest = JSON.parse(manifestBytes.toString('utf8')); } catch { throw Error('PUBLIC_MANIFEST_JSON'); }
  const authority = validatePublicDeploymentManifest(manifest);
  const wasmPath = path.resolve(path.dirname(path.resolve(manifestPath)), manifest.wasm.path);
  readPublicDeploymentWasm(wasmPath);
  return { schema: 'agyion-public-kernel-offline-plan-v1', testOnly: true, manifestSha256: sha(manifestBytes), wasmPath, wasmSha256: PUBLIC_CANDIDATE_WASM, networkPassphrase: TESTNET, rpcUrl: RPC, identityDirectory, ...authority };
}
