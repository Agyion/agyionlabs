// Maintainer tool only. Nothing here runs during installation or in the browser.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const integrity = 'sha512-gH+eCIUKvE7DZx9ZFCFog1JSpi5Jf28wHTLa67CzAXoJFQkcqkoQ9j2LilHrZPla8M43MjW0COQiFvrlS/pLMg==';
const output = path.dirname(fileURLToPath(import.meta.url));
const tarball = process.argv[2];
const verify = process.argv[3] === '--verify';
assert(tarball, 'Pass the npm pack tarball for @creit.tech/stellar-wallets-kit@2.7.0');
assert.equal(`sha512-${createHash('sha512').update(fs.readFileSync(tarball)).digest('base64')}`, integrity, 'Unexpected upstream archive');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'agyion-selected-wallets-'));
try {
  const entries = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).trim().split('\n');
  assert(entries.every((entry) => entry.startsWith('package/') && !entry.split('/').includes('..')), 'Unsafe archive path');
  execFileSync('tar', ['-xzf', tarball, '-C', temp]);
  const upstream = path.join(temp, 'package');
  const upstreamPackage = JSON.parse(fs.readFileSync(path.join(upstream, 'package.json'), 'utf8'));
  const exports = Object.fromEntries(['sdk', 'types', ...['freighter', 'xbull', 'lobstr', 'wallet-connect'].map((name) => `modules/${name}`)].map((key) => {
    const source = upstreamPackage.exports[`./${key}`].import;
    return [`./${key}`, { types: source.replace(/\.js$/, '.d.ts'), import: source }];
  }));
  const pending = Object.values(exports).map((entry) => entry.import);
  const files = {};
  const patches = [];
  const imports = new Set();
  while (pending.length) {
    const file = path.posix.normalize(pending.pop());
    if (files[file]) continue;
    assert(file.startsWith('esm/'), 'Import escapes ESM source');
    let contents = fs.readFileSync(path.join(upstream, file));
    if (file === 'esm/sdk/kit.js') {
      const originalSha256 = createHash('sha256').update(contents).digest('hex');
      assert.equal(originalSha256, '97a32644eb15dcbc59897742642075677df7a78489d5b7d68dcd07835e0dd5fb', 'Review the modal patch against changed upstream source');
      const before = contents.toString('utf8');
      const start = '    static async authModal(params) {\n';
      const lateRefresh = '        await StellarWalletsKit.refreshSupportedWallets();\n        const subs = [];';
      assert.equal(before.split(start).length, 2, 'Expected exactly one authModal');
      assert.equal(before.split(lateRefresh).length, 2, 'Expected exactly one late provider refresh');
      contents = Buffer.from(before.replace(start, start + '        await StellarWalletsKit.refreshSupportedWallets();\n').replace(lateRefresh, '        const subs = [];'));
      patches.push({ file, reason: 'Complete provider availability before rendering authModal so its first visible close cannot precede the close-event subscription.', originalSha256, patchedSha256: createHash('sha256').update(contents).digest('hex') });
    }
    if (file === 'esm/state/values.js') {
      const originalSha256 = createHash('sha256').update(contents).digest('hex');
      assert.equal(originalSha256, '3dcb52bda51afb996bbbd5417fc7f26b2591609750cd561aab444eb7356c8662', 'Review cache validation against changed upstream source');
      const before = contents.toString('utf8');
      const hardware = 'const hardwareWalletPathsInitial = localstorage?.getItem(LocalStorageKeys.hardwareWalletPaths);\nexport const hardwareWalletPaths = signal(JSON.parse(hardwareWalletPathsInitial || "[]"));';
      const sessions = 'const wcSessionPathsInitial = localstorage?.getItem(LocalStorageKeys.wcSessionPaths);\nexport const wcSessionPaths = signal(JSON.parse(wcSessionPathsInitial || "[]"));';
      assert.equal(before.split(hardware).length, 2, 'Expected exactly one hardware cache initializer');
      assert.equal(before.split(sessions).length, 2, 'Expected exactly one session cache initializer');
      const safeCache = `// Cached provider metadata is untrusted and is never signing authority.
function readCachedPaths(key, valid) {
    try {
        const raw = localstorage?.getItem(key);
        if (!raw || raw.length > 65536) return [];
        const value = JSON.parse(raw);
        return Array.isArray(value) && value.length <= 128 && value.every(valid) ? value : [];
    } catch { return []; }
}
const cachedAccount = (value) => typeof value === "string" && /^G[A-Z2-7]{55}$/.test(value);
const cachedRow = (row, field) => row !== null && typeof row === "object" && !Array.isArray(row) &&
    Object.keys(row).length === 2 && Object.hasOwn(row, "publicKey") && Object.hasOwn(row, field) && cachedAccount(row.publicKey);
export const hardwareWalletPaths = signal(readCachedPaths(LocalStorageKeys.hardwareWalletPaths, (row) =>
    cachedRow(row, "index") && Number.isInteger(row.index) && row.index >= 0 && row.index < 2147483648));`;
      const safeSessions = `export const wcSessionPaths = signal(readCachedPaths(LocalStorageKeys.wcSessionPaths, (row) =>
    cachedRow(row, "topic") && typeof row.topic === "string" && row.topic.length > 0 && row.topic.length <= 256));`;
      contents = Buffer.from(before.replace(hardware, safeCache).replace(sessions, safeSessions));
      patches.push({ file, reason: 'Bound and validate untrusted cached public session/path metadata before creating state signals; malformed cache must not poison module initialization.', originalSha256, patchedSha256: createHash('sha256').update(contents).digest('hex') });
    }
    if (file === 'esm/components/pages/auth-options.page.js') {
      const originalSha256 = createHash('sha256').update(contents).digest('hex');
      assert.equal(originalSha256, '092e80bbae9f58db4b7b5e6d7abda5c10f90e79c4443970fa6eb8ca165f0bb15', 'Review provider ordering cache validation against changed upstream source');
      const before = contents.toString('utf8');
      const old = '        usedWalletsIds = record ? JSON.parse(record) : [];';
      assert.equal(before.split(old).length, 2, 'Expected exactly one provider ordering cache read');
      contents = Buffer.from(before.replace(old, `        usedWalletsIds = record && record.length <= 16384 ? JSON.parse(record) : [];
        if (!Array.isArray(usedWalletsIds) || usedWalletsIds.length > 128 ||
            !usedWalletsIds.every((id) => typeof id === "string" && id.length > 0 && id.length <= 64)) {
            usedWalletsIds = [];
        }`));
      patches.push({ file, reason: 'Treat malformed or excessive cached provider ordering as empty metadata so the wallet chooser remains usable.', originalSha256, patchedSha256: createHash('sha256').update(contents).digest('hex') });
    }
    files[file] = createHash('sha256').update(contents).digest('hex');
    for (const { fileName: specifier } of ts.preProcessFile(contents.toString('utf8'), true, true).importedFiles) {
      if (specifier.startsWith('.')) pending.push(path.posix.join(path.posix.dirname(file), specifier));
      else imports.add(specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]);
    }
    if (file.endsWith('.js')) pending.push(file.slice(0, -3) + '.d.ts');
    if (verify) assert.equal(createHash('sha256').update(fs.readFileSync(path.join(output, file))).digest('hex'), files[file], file);
    else {
      fs.mkdirSync(path.dirname(path.join(output, file)), { recursive: true });
      fs.writeFileSync(path.join(output, file), contents);
    }
  }
  const dependencies = Object.fromEntries([...imports].sort().map((name) => {
    assert(upstreamPackage.dependencies[name], `Undeclared upstream dependency: ${name}`);
    return [name, upstreamPackage.dependencies[name]];
  }));
  const pkg = {
    name: '@agyion/stellar-wallets-kit', version: '2.7.0-agyion.3', private: true, type: 'module',
    description: 'Selected Stellar Wallets Kit 2.7.0 ESM closure with explicit modal readiness and cached metadata fixes; see UPSTREAM.md',
    license: 'MIT', exports, files: ['esm', 'LICENSE', 'LICENSE.std-encoding', 'PROVENANCE.json', 'UPSTREAM.md'], dependencies,
  };
  const provenance = {
    upstream: { name: upstreamPackage.name, version: upstreamPackage.version, tarball: 'https://registry.npmjs.org/@creit.tech/stellar-wallets-kit/-/stellar-wallets-kit-2.7.0.tgz', integrity },
    selection: ['sdk', 'types', 'freighter', 'xbull', 'lobstr', 'wallet-connect'],
    modifications: 'Package identity, exports and reachable dependencies narrowed; three reviewed modal readiness and cached metadata patches, with all remaining runtime/declaration files unchanged.',
    patches,
    files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))),
  };
  for (const [name, value] of [['package.json', pkg], ['PROVENANCE.json', provenance]]) {
    if (verify) assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output, name), 'utf8')), value, name);
    else fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n');
  }
  console.log(`${verify ? 'Verified' : 'Selected'} ${Object.keys(files).length - patches.length} unchanged upstream files and ${patches.length} explicit patched file; ${imports.size} direct dependency packages.`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
