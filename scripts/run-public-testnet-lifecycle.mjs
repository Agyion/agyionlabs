/** Explicit operator entry point for the isolated, inactive public V4 lifecycle.
 * Default mode is public planning only. Effectful dependencies load only after
 * exact command validation. No automatic sequence, funding or submission loop. */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const reject = () => { throw Error('LIFECYCLE_CLI_ARGUMENTS'); };
const hash = value => /^[0-9a-f]{64}$/.test(value) && value !== '0'.repeat(64);
const runName = value => /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
const absolute = value => path.isAbsolute(value) && path.resolve(value) === value;

export function parsePublicLifecycleArguments(args) {
  if (!Array.isArray(args) || Object.getPrototypeOf(args) !== Array.prototype) reject();
  const d = Object.getOwnPropertyDescriptors(args), keys = Reflect.ownKeys(d);
  const length = d.length?.value;
  if (!Number.isSafeInteger(length) || length < 0 || length > 5 || keys.length !== length + 1
    || keys.some(k => typeof k !== 'string' || (k !== 'length' && !/^(0|[1-9][0-9]*)$/.test(k)))) reject();
  const values = Array.from({ length }, (_, i) => {
    const field = d[String(i)];
    if (!field || !Object.hasOwn(field, 'value') || !field.enumerable || typeof field.value !== 'string'
      || field.value.length > 4096 || /[\u0000-\u001f\u007f]/.test(field.value)) reject();
    return field.value;
  });
  if (length === 0 || (length === 1 && values[0] === '--plan')) return Object.freeze({ mode: 'plan' });
  if (length === 4 && values[0] === '--prepare' && absolute(values[1]) && hash(values[2]) && runName(values[3]))
    return Object.freeze({ mode: 'prepare', originalRun: values[1], manifestSha256: values[2], run: values[3] });
  if (length === 3 && values[0] === '--verify' && runName(values[1]) && hash(values[2]))
    return Object.freeze({ mode: 'verify', run: values[1], planSha256: values[2] });
  if (length === 4 && ['--fund', '--recover-fund'].includes(values[0]) && runName(values[1]) && hash(values[2])
    && ['recipient', 'relayer'].includes(values[3]))
    return Object.freeze({ mode: values[0].slice(2), run: values[1], planSha256: values[2], role: values[3] });
  reject();
}

export async function main(args = process.argv.slice(2)) {
  const command = parsePublicLifecycleArguments(args);
  if (command.mode === 'plan') return Object.freeze({
    schema: 'agyion-public-lifecycle-cli-plan-v1', network: 'testnet', plannedCalls: 39,
    newFundableRoles: Object.freeze(['recipient', 'relayer']), liveLifecycleExecuted: false,
    applicationActivation: false,
    commands: Object.freeze(['--plan', '--prepare ORIGINAL_RUN MANIFEST_SHA256 RUN_NAME', '--verify RUN_NAME PLAN_SHA256',
      '--fund RUN_NAME PLAN_SHA256 recipient|relayer', '--recover-fund RUN_NAME PLAN_SHA256 recipient|relayer']),
    boundary: 'Explicit preparation, one-attempt Testnet actor funding and read-only verification/recovery. Lifecycle preflight and one-step contract execution are not supplied by this entry point yet.',
  });
  if (command.mode === 'fund' || command.mode === 'recover-fund') {
    const funding = await import('./lib/public-lifecycle-funding.mjs');
    const { mode, ...input } = command;
    return mode === 'fund' ? funding.fundPublicLifecycleAccount(input) : funding.recoverPublicLifecycleFunding(input);
  }
  const runs = await import('./lib/public-lifecycle-run.mjs');
  if (command.mode === 'prepare') {
    const { mode: _mode, ...input } = command;
    return runs.preparePublicLifecycleRun(input);
  }
  const context = await runs.loadPublicLifecycleRun({ run: command.run, planSha256: command.planSha256 });
  const { readVerifiedPublicLifecycleContext } = await import('./lib/public-lifecycle-journal.mjs');
  const verified = readVerifiedPublicLifecycleContext({ run: context.journalRun, lockRoot: context.lockRoot,
    plan: context.plan, planSha256: context.planSha256 });
  return Object.freeze({ schema: 'agyion-public-lifecycle-cli-verification-v1', planSha256: context.planSha256,
    status: verified.status, completedSteps: verified.prefix.length, nextStepId: verified.nextStepId,
    signedFeesStroops: verified.signedFeesStroops, unfinished: verified.unfinished,
    boundary: 'Historical raw journal verification only; no current chain availability, source release or application activation.',
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.stdout.write(JSON.stringify(await main(), null, 2) + '\n'); }
  catch (error) {
    const code = error?.message === 'LIFECYCLE_CLI_ARGUMENTS' ? 'LIFECYCLE_CLI_ARGUMENTS' : 'LIFECYCLE_CLI_FAILED';
    process.stderr.write(JSON.stringify({ status: 'failed', code }) + '\n'); process.exitCode = 1;
  }
}
