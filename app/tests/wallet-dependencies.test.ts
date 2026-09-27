import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const base = path.resolve('vendor/stellar-wallets-kit');
const read = (file: string) => readFileSync(path.join(base, file), 'utf8');
const json = (file: string) => JSON.parse(read(file));
const packageName = (specifier: string) => specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];

describe('selected wallet dependency boundary', () => {
  it('contains the verified selected import closure and only the declared modal and cache patches', () => {
    const provenance = json('PROVENANCE.json');
    const pkg = json('package.json');
    const pending = Object.values(pkg.exports).map((entry) => (entry as { import: string }).import);
    const seen = new Set<string>();
    const dependencies = new Set<string>();
    while (pending.length) {
      const file = path.posix.normalize(pending.pop()!);
      if (seen.has(file)) continue;
      seen.add(file);
      expect(file.startsWith('esm/')).toBe(true);
      const contents = read(file);
      expect(createHash('sha256').update(contents).digest('hex')).toBe(provenance.files[file]);
      for (const { fileName: specifier } of ts.preProcessFile(contents, true, true).importedFiles) {
        if (specifier.startsWith('.')) pending.push(path.posix.join(path.posix.dirname(file), specifier));
        else dependencies.add(packageName(specifier));
      }
      if (file.endsWith('.js')) pending.push(file.slice(0, -3) + '.d.ts');
    }
    expect([...seen].sort()).toEqual(Object.keys(provenance.files).sort());
    expect([...dependencies].sort()).toEqual(Object.keys(pkg.dependencies).sort());
    expect(seen.has('esm/components/pages/auth-options.page.js')).toBe(true);
    expect(pkg.name).toBe('@agyion/stellar-wallets-kit');
    expect(provenance.upstream.version).toBe('2.7.0');
    expect(pkg.version).toBe('2.7.0-agyion.3');
    const originals = {
      'esm/sdk/kit.js': '97a32644eb15dcbc59897742642075677df7a78489d5b7d68dcd07835e0dd5fb',
      'esm/state/values.js': '3dcb52bda51afb996bbbd5417fc7f26b2591609750cd561aab444eb7356c8662',
      'esm/components/pages/auth-options.page.js': '092e80bbae9f58db4b7b5e6d7abda5c10f90e79c4443970fa6eb8ca165f0bb15',
    };
    expect(provenance.patches.map((patch: { file: string }) => patch.file).sort()).toEqual(Object.keys(originals).sort());
    for (const [file, originalSha256] of Object.entries(originals)) {
      expect(provenance.patches.find((patch: { file: string }) => patch.file === file)).toEqual({
        file, reason: expect.any(String), originalSha256, patchedSha256: provenance.files[file],
      });
      expect(originalSha256).not.toBe(provenance.files[file]);
    }
  });

  it('physically excludes unsupported wallet modules and their vulnerable dependency chains', async () => {
    expect(readdirSync(path.join(base, 'esm/sdk/modules')).sort()).toEqual(
      ['freighter', 'lobstr', 'wallet-connect', 'xbull'].flatMap((name) => [`${name}.module.d.ts`, `${name}.module.js`]).sort(),
    );
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    const removed = ['@creit.tech/stellar-wallets-kit', '@hot-wallet/sdk', '@near-js/crypto', '@solana/web3.js', 'elliptic', 'secp256k1', 'jayson', 'stream-json'];
    for (const name of removed) {
      expect(Object.keys(lock.packages).some((entry) => entry.endsWith(`/node_modules/${name}`) || entry === `node_modules/${name}`)).toBe(false);
    }
    // An unsupported adapter must not silently become loadable through a broad barrel export.
    const omittedModule = '@agyion/stellar-wallets-kit/modules/hotwallet';
    await expect(import(omittedModule)).rejects.toThrow();
  });
});
