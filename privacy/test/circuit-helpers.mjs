import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

export async function compileCircuit(name) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'agyion-circuit-'));
  const source = join(root, 'circuits', name + '.circom');
  const output = execFileSync(process.execPath, [join(root, 'node_modules/circom2/cli.js'), source, '--wasm', '--r1cs', '--sym', '--O2', '-o', dir], { timeout: 180000, encoding: 'utf8' });
  const base = name.split('/').pop();
  const generated = join(dir, base + '_js');
  const factory = createRequire(import.meta.url)(join(generated, 'witness_calculator.js'));
  const calculator = await factory(readFileSync(join(generated, base + '.wasm')));
  return { dir, output, calculator };
}
