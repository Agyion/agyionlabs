// Packages existing public DEVELOPMENT proving artifacts. This script neither
// generates setup material nor certifies an independent ceremony or deployment.
import { readFile, writeFile, stat, realpath, mkdir, rename, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, join, sep } from 'node:path';
import { keyDigest } from '../contracts/private-pool/tools/pin-verifiers.mjs';
import { inspectAcquiredProver } from './fetch-private-prover.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHUNK_MAX = 16 * 1024 * 1024;
const LIMITS = { wasm: 32 * 1024 * 1024, zkey: 512 * 1024 * 1024, verificationKey: 1024 * 1024 };
const CIRCUITS = [['transition', 157, 'MAIN_VK_HASH'], ['revocation', 4, 'REVOCATION_VK_HASH']];
const SOURCES = ['transition.circom', 'revocation.circom', 'primitives.circom', 'poseidon-encryption.circom'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function ensure(ok, message) { if (!ok) throw new Error(message); }
function hash(value) { ensure(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value), 'Invalid artifact hash pin'); return value; }
function exactKeys(value, keys, message) {
  ensure(value !== null && typeof value === 'object' && !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()), message);
}
async function boundedFile(base, name, maximum) {
  const canonicalBase = await realpath(base), file = await realpath(resolve(base, name));
  ensure(file.startsWith(canonicalBase + sep), 'Artifact path escapes its source directory');
  const info = await stat(file);
  ensure(info.isFile() && info.size > 0 && info.size <= maximum, 'Invalid artifact file size');
  const bytes = await readFile(file);
  ensure(bytes.length === info.size && bytes.length <= maximum, 'Artifact changed during read');
  return bytes;
}
const jsonFile = async (base, name) => JSON.parse(await boundedFile(base, name, 1024 * 1024));

export function chunkPinnedArtifact(value, expectedHash, { chunkBytes = CHUNK_MAX } = {}) {
  ensure(Number.isSafeInteger(chunkBytes) && chunkBytes > 0 && chunkBytes <= CHUNK_MAX, 'Invalid chunk size');
  ensure(value instanceof Uint8Array && value.byteLength > 0 && value.byteLength <= LIMITS.zkey, 'Invalid artifact size');
  const bytes = Buffer.from(value);
  ensure(digest(bytes) === hash(expectedHash), 'Actual artifact hash mismatch');
  const chunks = [], blobs = new Map();
  for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkBytes, bytes.length));
    const sha256 = digest(chunk);
    chunks.push({ bytes: chunk.length, sha256 }); blobs.set(sha256, chunk);
  }
  ensure(chunks.length <= 32, 'Too many artifact chunks');
  return { manifest: { bytes: bytes.length, sha256: expectedHash, chunks }, blobs };
}

export async function inspectDevelopmentProver({ root = ROOT, artifactRoot = resolve(root, 'artifacts/privacy-v2') } = {}) {
  // The checked-in fixture manifest is the release trust root, not downloaded or
  // freshly generated metadata adjacent to arbitrary artifact files.
  const trusted = await jsonFile(root, 'contracts/private-pool/fixtures/verified-v2/keys/manifest.json');
  const development = await jsonFile(artifactRoot, 'keys/manifest.json');
  ensure(JSON.stringify(development) === JSON.stringify(trusted), 'Development manifest differs from reviewed fixture provenance');
  ensure(development.schema === 'agyion-private-development-artifacts-v2' && development.developmentOnly === true &&
    development.phase1?.verified === true, 'Verified development provenance required');
  const compilation = await jsonFile(artifactRoot, 'circuit/compile-manifest.json');
  ensure(JSON.stringify(compilation) === JSON.stringify(development.compilation), 'Compilation provenance differs');
  ensure(compilation.compilerPackage === 'circom2@0.2.23' && compilation.optimization === 'O2' &&
    compilation.version === 'circom2 npm package 0.2.23\ncircom compiler 2.2.3', 'Unsupported development compilation');
  ensure(digest(await boundedFile(root, 'privacy/package-lock.json', 2 * 1024 * 1024)) === hash(compilation.lockSha256), 'Dependency lock differs from compilation');
  exactKeys(compilation.sources, SOURCES, 'Unexpected circuit source list');
  for (const source of SOURCES)
    ensure(digest(await boundedFile(root, `privacy/circuits/${source}`, 1024 * 1024)) === hash(compilation.sources[source]), `Circuit source differs: ${source}`);
  const cases = await jsonFile(artifactRoot, 'prover-cases.json');
  exactKeys(cases, ['transition', 'revocation'], 'Unexpected prover circuit list');
  const pinSource = (await boundedFile(root, 'contracts/private-pool/src/pins.rs', 64 * 1024)).toString('utf8');
  const releases = {}, blobs = new Map();
  for (const [name, publicCount, pinName] of CIRCUITS) {
    const entry = cases[name], pinned = development.circuits[name];
    ensure(pinned?.publicCount === publicCount, 'Circuit public count mismatch');
    exactKeys(entry, ['wasm', 'zkey', 'verificationKey', 'pins'], 'Unexpected prover artifact metadata');
    exactKeys(entry.pins, ['wasmSha256', 'zkeySha256', 'verificationKeySha256'], 'Unexpected prover artifact pins');
    const paths = { wasm: `circuit/${name}_js/${name}.wasm`, zkey: `keys/${name}.zkey`, verificationKey: `keys/${name}-vk.json` };
    const release = { publicCount };
    for (const [kind, path] of Object.entries(paths)) {
      ensure(entry[kind] === path, 'Unexpected prover artifact path');
      const expected = hash(pinned[`${kind}Sha256`]);
      ensure(entry.pins[`${kind}Sha256`] === expected, 'Prover cases differ from reviewed pins');
      const bytes = await boundedFile(artifactRoot, path, LIMITS[kind]);
      const chunks = chunkPinnedArtifact(bytes, expected);
      release[kind] = chunks.manifest;
      for (const [sha256, chunk] of chunks.blobs) blobs.set(sha256, chunk);
      if (kind === 'wasm') ensure(compilation.outputs[`${name}_js/${name}.wasm`] === expected, 'Compiled WASM pin mismatch');
      if (kind === 'verificationKey') {
        const sourceValues = pinSource.match(new RegExp(`${pinName}:\\s*\\[u8;\\s*32\\]\\s*=\\s*\\[([^\\]]+)\\]`))?.[1]?.match(/0x[0-9a-f]{2}/g);
        ensure(sourceValues?.length === 32 && keyDigest(JSON.parse(bytes), publicCount).toString('hex') === sourceValues.map(v => v.slice(2)).join(''), 'Compiled verifier pin mismatch');
      }
    }
    const r1csPin = hash(pinned.r1csSha256);
    ensure(compilation.outputs[`${name}.r1cs`] === r1csPin && digest(await boundedFile(artifactRoot, `circuit/${name}.r1cs`, 256 * 1024 * 1024)) === r1csPin, 'Compiled constraint system differs');
    releases[name] = release;
  }
  return { releases, blobs, provenance: {
    fixtureManifestSha256: digest(await boundedFile(root, 'contracts/private-pool/fixtures/verified-v2/keys/manifest.json', 1024 * 1024)),
    dependencyLockSha256: compilation.lockSha256,
    circuitSourceSha256: compilation.sources,
  } };
}

export async function packagePrivateProver({ root = ROOT, artifactRoot, developmentOnly = false, acquiredRuntime = false } = {}) {
  ensure(developmentOnly === true, 'Packaging requires explicit development mode');
  // Finish verification before creating any published output.
  const source = artifactRoot ?? resolve(root, acquiredRuntime ? 'artifacts/private-prover-runtime' : 'artifacts/privacy-v2');
  const { releases, blobs, provenance } = acquiredRuntime
    ? await inspectAcquiredProver({ root, artifactRoot: source })
    : await inspectDevelopmentProver({ root, artifactRoot: source });
  const output = resolve(root, 'app/public/zk/private'), moduleDir = resolve(root, 'app/app/lib');
  await mkdir(output, { recursive: true }); await mkdir(moduleDir, { recursive: true });
  for (const [sha256, chunk] of blobs) {
    const target = join(output, `${sha256}.bin`);
    try { await writeFile(target, chunk, { flag: 'wx' }); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existing = await boundedFile(output, `${sha256}.bin`, CHUNK_MAX);
      ensure(existing.length === chunk.length && digest(existing) === sha256, 'Existing chunk differs from its content address');
    }
  }
  const code = '// Generated by scripts/package-private-prover.mjs --development.\n' +
    '// Public development artifact pins only. Review this source with the release.\n' +
    '// No independent phase2 ceremony or production readiness is claimed.\n' +
    'export const PRIVATE_PROVER_DEVELOPMENT_ONLY = true as const;\n' +
    `export const PRIVATE_PROVER_PROVENANCE = ${JSON.stringify(provenance, null, 2)} as const;\n` +
    `export const PRIVATE_PROVER_ASSETS = ${JSON.stringify(releases, null, 2)} as const;\n`;
  const temp = join(moduleDir, `.privateProverAssets.${randomUUID()}.tmp`);
  try { await writeFile(temp, code, { flag: 'wx' }); await rename(temp, join(moduleDir, 'privateProverAssets.ts')); }
  finally { await rm(temp, { force: true }); }
  return { developmentOnly: true, artifactCount: 6, chunkCount: blobs.size,
    totalChunkBytes: [...blobs.values()].reduce((sum, bytes) => sum + bytes.length, 0),
    manifestSha256: digest(code), releases };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  ensure(args.shift() === '--development',
    'Usage: package-private-prover.mjs --development [--acquired-runtime] [local-artifact-directory]');
  const acquiredRuntime=args[0]==='--acquired-runtime';if(acquiredRuntime)args.shift();
  ensure(args.length<=1&&!args[0]?.startsWith('--'),'Unknown packaging arguments');
  const result = await packagePrivateProver({ developmentOnly: true,
    acquiredRuntime,...(args[0] ? { artifactRoot: resolve(args[0]) } : {}) });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
