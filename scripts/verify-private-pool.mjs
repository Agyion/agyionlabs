// Repeatable LOCAL verification of committed private-pool source and public
// fixtures. No account, funding, deployment, RPC, setup ceremony or secret input.
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'artifacts/private-pool-check', `${new Date().toISOString().replaceAll(':', '-')}-${process.pid}`);
await mkdir(output, { recursive: true });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const report = {
  schema: 'agyion-local-private-pool-check-v2', started: new Date().toISOString(),
  status: 'running', steps: [],
  boundary: 'Committed public development proofs; local native/WASM execution. No new proof generation, browser test, independent audit, live submission, deployment or production acceptance.',
};
const env = { ...process.env,
  PRIVATE_POOL_ARTIFACTS: resolve(root, 'contracts/private-pool/fixtures/verified-v2'),
  PRIVATE_POOL_RESULTS: output, PRIVATE_POOL_WASM: resolve(output, 'private_pool.wasm'),
};
// Artifact-producing/proving tests have their own explicit reproducible commands.
for (const key of ['PRIVACY_CIRCUIT_TESTS', 'PRIVACY_PROVER_TESTS', 'PRIVACY_DISCLOSURE_PROOF_TEST', 'PRIVACY_PROVER_MANIFEST']) delete env[key];
let active, interrupted = false;
async function save() { await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n'); }
async function run(name, command, args) {
  if (interrupted) throw new Error('Local check interrupted');
  const step = { name, command, args, started: new Date().toISOString(), status: 'running' };
  report.steps.push(step); await save();
  console.log(`Checking ${name}…`);
  const chunks = [];
  const result = await new Promise(resolveResult => {
    active = spawn(command, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    active.stdout.on('data', chunk => chunks.push(chunk));
    active.stderr.on('data', chunk => chunks.push(chunk));
    active.once('error', error => resolveResult({ code: null, error: error.message }));
    active.once('close', (code, signal) => resolveResult({ code, signal }));
  });
  active = null;
  const log = Buffer.concat(chunks);
  await writeFile(resolve(output, `${name}.log`), log);
  Object.assign(step, result, { finished: new Date().toISOString(), log: `${name}.log`, sha256: digest(log), status: result.code === 0 && !interrupted ? 'passed' : 'failed' });
  await save();
  if (step.status !== 'passed') {
    console.error(log.toString('utf8').slice(-6000));
    throw new Error(`${name} failed${result.error ? `: ${result.error}` : ''}`);
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  interrupted = true; active?.kill(signal); process.exitCode = 1;
});
try {
  await run('privacy-units', 'npm', ['--prefix', 'privacy', 'test']);
  await run('client', 'npm', ['--prefix', 'contracts/private-pool/client', 'test']);
  await run('tooling', process.execPath, ['--test', 'contracts/private-pool/tools/pin-verifiers.test.mjs', 'contracts/private-pool/tools/prepare-deployment.test.mjs', 'contracts/private-pool/tools/deployment-authority.test.mjs']);
  await run('fixture-provenance', process.execPath, ['contracts/private-pool/tools/verify-fixture-provenance.mjs']);
  await run('wasm-build', 'stellar', ['contract', 'build', '--locked', '--manifest-path', 'contracts/private-pool/Cargo.toml', '--out-dir', output]);
  const wasm = await readFile(env.PRIVATE_POOL_WASM);
  report.wasm = { sha256: digest(wasm), bytes: wasm.length };
  await run('native-and-wasm', 'cargo', ['test', '--locked', '--manifest-path', 'contracts/private-pool/Cargo.toml', '--features', 'wasm-tests']);
  await run('rust-lints', 'cargo', ['clippy', '--locked', '--manifest-path', 'contracts/private-pool/Cargo.toml', '--all-targets', '--all-features', '--', '-D', 'warnings']);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = error.message; process.exitCode = 1;
} finally {
  report.finished = new Date().toISOString(); await save();
  console.log(`Local check ${report.status}: ${resolve(output, 'report.json')}`);
}
