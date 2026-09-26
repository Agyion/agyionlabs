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
  it('contains the unchanged upstream import closure for every retained wallet and modal', () => {
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
