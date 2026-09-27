import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { preparePublicDeployment, readPublicDeploymentWasm, validatePublicDeploymentManifest, validatePublicDeploymentPlan, encodePublicConstructor, TESTNET, RPC } from '../lib/public-deployment-plan.mjs';
const { xdr, scValToNative } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const HASH = 'd101e0fea1852cf057049cc08695b9e26a8b3c6a82db58d4c2706db03a22b186';
const ASSETS = ['CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC', 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA'];
const SOURCE = 'GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57';
const CONTRACT = 'CAAPJHTCKEOPJAYTDRSIYCMMGH6NQXFLYKRTIJCZES5SQKQHMUS44I7N';
const CONSTRUCTOR = 'AAAAEAAAAAEAAAACAAAAEgAAAAHXkotywnA8z+r365/0701QSlWouXn8m0UOoshCtNHOYQAAABIAAAABUEXNXsBymnaP1a0CUFhS308Cjc6DDlrFIgm6SEg7LwE=';
function manifest() { return { schema: 'agyion-public-kernel-testnet-release-v1', testOnly: true, networkPassphrase: TESTNET, rpcUrl: RPC, wasm: { path: './kernel.wasm', sha256: HASH }, sourceAccount: SOURCE, salt: 'ab'.repeat(32), intendedContractId: CONTRACT, assets: [...ASSETS] }; }
function plan() { return { schema: 'agyion-public-kernel-offline-plan-v1', testOnly: true, manifestSha256: 'bc'.repeat(32), wasmSha256: HASH, wasmPath: '/synthetic/kernel.wasm', sourceAccount: SOURCE, salt: 'ab'.repeat(32), intendedContractId: CONTRACT, assets: [...ASSETS], constructorXdr: [CONSTRUCTOR], networkPassphrase: TESTNET, rpcUrl: RPC, identityDirectory: '/synthetic/identity' }; }
function files(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agyion-public-plan-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const identity = path.join(dir, 'identity'); fs.mkdirSync(identity, { mode: 0o700 });
  const file = path.join(dir, 'manifest.json'); fs.writeFileSync(file, JSON.stringify(manifest()));
  return { dir, identity, file, wasm: path.join(dir, 'kernel.wasm') };
}

test('reviewed public authority produces one canonical ordered vector constructor', () => {
  const result = validatePublicDeploymentManifest(manifest());
  assert.equal(result.intendedContractId, CONTRACT);
  assert.deepEqual(result.constructorXdr, [CONSTRUCTOR]);
  assert.deepEqual(scValToNative(encodePublicConstructor(ASSETS)), ASSETS);
  assert.equal(xdr.ScVal.fromXDR(result.constructorXdr[0], 'base64').switch().name, 'scvVec');
  assert.equal(validatePublicDeploymentPlan(plan()), true);
});

for (const [name, mutate] of [
  ['mainnet', m => { m.networkPassphrase = 'Public Global Stellar Network ; September 2015'; }],
  ['alternate RPC', m => { m.rpcUrl += '/'; }],
  ['non-test release', m => { m.testOnly = false; }],
  ['legacy schema', m => { m.schema = 'agyion-public-kernel-testnet-release-v0'; }],
  ['unknown fields', m => { m.secret = 'do-not-read'; }],
  ['missing fields', m => { delete m.assets; }],
  ['unreviewed bytecode', m => { m.wasm.sha256 = 'cd'.repeat(32); }],
  ['unknown WASM fields', m => { m.wasm.size = 26696; }],
  ['missing WASM path', m => { m.wasm.path = ''; }],
  ['zero salt', m => { m.salt = '0'.repeat(64); }],
  ['noncanonical salt', m => { m.salt = 'AB'.repeat(32); }],
  ['redirected contract', m => { m.intendedContractId = ASSETS[0]; }],
  ['contract source', m => { m.sourceAccount = ASSETS[0]; }],
  ['reordered assets', m => { m.assets.reverse(); }],
  ['duplicate assets', m => { m.assets[1] = m.assets[0]; }],
  ['omitted USDC', m => { m.assets.pop(); }],
  ['additional asset', m => { m.assets.push(CONTRACT); }],
]) test(`offline public manifest rejects ${name}`, () => { const m = manifest(); mutate(m); assert.throws(() => validatePublicDeploymentManifest(m)); });

test('constructor or plan mutation cannot bypass the manifest authority checks', () => {
  for (const mutate of [p => { p.constructorXdr = [CONSTRUCTOR, CONSTRUCTOR]; }, p => { p.constructorXdr = [CONSTRUCTOR + '\n']; }, p => { p.assets.reverse(); }, p => { p.manifestSha256 = ''; }, p => { p.salt = 'cd'.repeat(32); }, p => { p.wasmSha256 = 'cd'.repeat(32); }, p => { p.schema = 'other'; }]) {
    const p = plan(); mutate(p); assert.throws(() => validatePublicDeploymentPlan(p));
  }
});

test('pure constructor and manifest reject sparse or non-array assets with the asset validation error', () => {
  const sparse = [ASSETS[0], ASSETS[1]]; delete sparse[1];
  for (const assets of [sparse, {}, null, undefined, 'assets']) {
    assert.throws(() => encodePublicConstructor(assets), /PUBLIC_ASSETS/);
    const m = manifest(); m.assets = assets;
    assert.throws(() => validatePublicDeploymentManifest(m), /PUBLIC_ASSETS/);
  }
});

test('loader rejects unprotected, linked or noncanonical identity directories before artifact loading', async t => {
  const f = files(t); fs.chmodSync(f.identity, 0o755);
  await assert.rejects(preparePublicDeployment(f.file, f.identity), /IDENTITY/);
  fs.chmodSync(f.identity, 0o700);
  const link = path.join(f.dir, 'identity-link'); fs.symlinkSync(f.identity, link);
  await assert.rejects(preparePublicDeployment(f.file, link), /IDENTITY/);
  await assert.rejects(preparePublicDeployment(f.file, f.identity + '/..'), /IDENTITY/);
  await assert.rejects(preparePublicDeployment(f.file, 'identity'), /IDENTITY/);
});

test('loader refuses linked, oversized or malformed public manifests', async t => {
  const f = files(t), linked = path.join(f.dir, 'manifest-link.json'); fs.symlinkSync(f.file, linked);
  await assert.rejects(preparePublicDeployment(linked, f.identity), /FILE/);
  fs.writeFileSync(f.file, ' '.repeat(65537));
  await assert.rejects(preparePublicDeployment(f.file, f.identity), /FILE/);
  fs.writeFileSync(f.file, '{invalid');
  await assert.rejects(preparePublicDeployment(f.file, f.identity), /JSON/);
});

test('loader refuses symlinked WASM and symlinked artifact ancestors', async t => {
  const f = files(t), target = path.join(f.dir, 'other.wasm'); fs.writeFileSync(target, Buffer.alloc(26696)); fs.symlinkSync(target, f.wasm);
  await assert.rejects(preparePublicDeployment(f.file, f.identity), /FILE/);
  fs.unlinkSync(f.wasm);
  const real = path.join(f.dir, 'real'); fs.mkdirSync(real); fs.writeFileSync(path.join(real, 'kernel.wasm'), Buffer.alloc(26696)); fs.symlinkSync(real, path.join(f.dir, 'linked'));
  const m = manifest(); m.wasm.path = './linked/kernel.wasm'; fs.writeFileSync(f.file, JSON.stringify(m));
  await assert.rejects(preparePublicDeployment(f.file, f.identity), /FILE/);
});

test('loader rejects wrong-sized and same-sized synthetic WASM without weakening reviewed pin', async t => {
  const f = files(t); fs.writeFileSync(f.wasm, Buffer.from('synthetic non-WASM'));
  await assert.rejects(preparePublicDeployment(f.file, f.identity), /WASM/);
  const synthetic = Buffer.alloc(26696); Buffer.from([0,97,115,109,1,0,0,0]).copy(synthetic); fs.writeFileSync(f.wasm, synthetic);
  await assert.rejects(preparePublicDeployment(f.file, f.identity), /WASM/);
  fs.truncateSync(f.wasm, 26697);
  await assert.rejects(preparePublicDeployment(f.file, f.identity), /FILE/);
});

test('WASM descriptor substitution or concurrent growth never enters an unbounded read', t => {
  const f = files(t), originalOpen = fs.openSync, originalRead = fs.readSync;
  fs.writeFileSync(f.wasm, Buffer.alloc(26696));
  try {
    fs.openSync = (file, flags, ...rest) => {
      const fd = originalOpen(file, flags, ...rest);
      if (file === f.wasm) {
        const writable = originalOpen(f.wasm, 'r+');
        try { fs.ftruncateSync(writable, 26697); } finally { fs.closeSync(writable); }
      }
      return fd;
    };
    assert.throws(() => readPublicDeploymentWasm(f.wasm), /FILE/);
  } finally { fs.openSync = originalOpen; }
  fs.truncateSync(f.wasm, 26696);
  let bufferSize;
  try {
    fs.readSync = (fd, buffer, ...rest) => {
      bufferSize = buffer.length;
      fs.truncateSync(f.wasm, 1024 * 1024);
      return originalRead(fd, buffer, ...rest);
    };
    assert.throws(() => readPublicDeploymentWasm(f.wasm), /FILE/);
    assert.equal(bufferSize, 26697);
  } finally { fs.readSync = originalRead; }
});
