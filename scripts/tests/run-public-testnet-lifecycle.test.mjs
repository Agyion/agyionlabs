import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { main, parsePublicLifecycleArguments } from '../run-public-testnet-lifecycle.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const script = path.join(root, 'scripts/run-public-testnet-lifecycle.mjs');
const hash = 'a'.repeat(64);

test('plan mode is explicit about pending live execution and needs no run or credential', async () => {
  assert.deepEqual(parsePublicLifecycleArguments([]), { mode: 'plan' });
  assert.deepEqual(parsePublicLifecycleArguments(['--plan']), { mode: 'plan' });
  const plan = await main([]);
  assert.equal(plan.schema, 'agyion-public-lifecycle-cli-plan-v1');
  assert.equal(plan.network, 'testnet');
  assert.equal(plan.plannedCalls, 39);
  assert.equal(plan.liveLifecycleExecuted, false);
  assert.equal(plan.applicationActivation, false);
  assert.deepEqual(plan.newFundableRoles, ['recipient', 'relayer']);
  assert.ok(Object.isFrozen(plan) && Object.isFrozen(plan.newFundableRoles));
});

test('prepare and verify arguments bind exact names and full reviewed hashes', () => {
  assert.deepEqual(parsePublicLifecycleArguments(['--prepare', '/trusted/original', hash, 'run-01']),
    { mode: 'prepare', originalRun: '/trusted/original', manifestSha256: hash, run: 'run-01' });
  assert.deepEqual(parsePublicLifecycleArguments(['--verify', 'run-01', hash]),
    { mode: 'verify', run: 'run-01', planSha256: hash });
});

for (const args of [
  ['--plan', 'extra'], ['--verify'], ['--verify', 'run-01', hash, 'extra'],
  ['--prepare', '/trusted/original', hash], ['--prepare', '/trusted/original', hash, 'run-01', 'extra'],
  ['--rpc-url', 'https://attacker.invalid'], ['--execute-all'], ['--fund', 'seller'],
  ['--verify', '../operator', hash], ['--verify', '/tmp/run', hash], ['--verify', 'a/b', hash],
  ['--verify', '.', hash], ['--verify', '..', hash], ['--verify', 'A'.repeat(65), hash],
  ['--verify', 'run-01', '0'.repeat(64)], ['--verify', 'run-01', 'A'.repeat(64)],
  ['--verify', 'run-01', 'a'.repeat(63)], ['--verify', 'run-01', hash + '\n'],
  ['--prepare', 'relative/original', hash, 'run-01'], ['--prepare', '/tmp/../original', hash, 'run-01'],
  ['--prepare', '/original\u0000path', hash, 'run-01'], ['--verify', 'run\n01', hash],
  ['--verify', 'run-01', 1], ['--verify', 'run-01', { toString() { throw Error('must not coerce'); } }],
]) test(`reject unsupported or ambiguous argument shape ${JSON.stringify(args)}`, () => {
  assert.throws(() => parsePublicLifecycleArguments(args), /^Error: LIFECYCLE_CLI_ARGUMENTS$/);
});

test('argument parser rejects accessors, symbols, sparse and prototype-modified arrays without invoking hooks', () => {
  let calls = 0;
  const getter = []; Object.defineProperty(getter, '0', { enumerable: true, get() { calls++; return '--plan'; } });
  const symbol = ['--plan']; symbol[Symbol('extra')] = true;
  const extra = ['--plan']; extra.toJSON = () => { calls++; return []; };
  const proto = ['--plan']; Object.setPrototypeOf(proto, Object.create(Array.prototype));
  for (const args of [getter, symbol, extra, proto, Array(1), null, '--plan'])
    assert.throws(() => parsePublicLifecycleArguments(args), /^Error: LIFECYCLE_CLI_ARGUMENTS$/);
  assert.equal(calls, 0);
});

test('default executable accesses only its own source during module loading, with no operational file, random, process or network calls', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agyion-cli-default-'));
  try {
    const hook = path.join(directory, 'deny.mjs');
    fs.writeFileSync(hook, `import fs from 'node:fs'; import crypto from 'node:crypto'; import cp from 'node:child_process'; import {syncBuiltinESMExports} from 'node:module'; import {fileURLToPath} from 'node:url';
const deny=()=>{throw Error('FORBIDDEN_DEFAULT_CAPABILITY')};
const entry=${JSON.stringify(script)}, grants=new Set(['realpathSync','readFileSync','openSync']);
for(const key of ['readFileSync','writeFileSync','mkdirSync','openSync','lstatSync','realpathSync','readdirSync']) {
 const original=fs[key];fs[key]=function(...args){const name=args[0] instanceof URL?fileURLToPath(args[0]):args[0];
  if(name===entry&&grants.has(key)&&(key!=='openSync'||args[1]==='r'||args[1]===0)){grants.delete(key);return Reflect.apply(original,this,args);}return deny();};
}
for(const key of ['readFile','writeFile','mkdir','open','lstat','realpath','readdir']) fs.promises[key]=deny;
for(const key of ['randomBytes','randomFillSync','randomUUID','generateKeyPairSync']) crypto[key]=deny;
for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork']) cp[key]=deny;
globalThis.fetch=deny; syncBuiltinESMExports();\n`);
    const result = spawnSync(process.execPath, ['--import', hook, script], { encoding: 'utf8', cwd: root, timeout: 10000, maxBuffer: 65536 });
    assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, ''); assert.equal(JSON.parse(result.stdout).plannedCalls, 39);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('invalid executable arguments expose a fixed error without echoing supplied sensitive-looking text', () => {
  const sensitive = 'S' + 'A'.repeat(55);
  const result = spawnSync(process.execPath, [script, '--unknown', sensitive], { encoding: 'utf8', cwd: root, timeout: 10000, maxBuffer: 65536 });
  assert.equal(result.status, 1); assert.equal(result.stdout, '');
  assert.equal(result.stderr, '{"status":"failed","code":"LIFECYCLE_CLI_ARGUMENTS"}\n');
  assert.ok(!result.stderr.includes(sensitive));
});

for (const flag of ['--fund', '--recover-fund']) test(`${flag} requires one exact new actor and full plan hash`, () => {
  for (const role of ['recipient', 'relayer']) assert.deepEqual(parsePublicLifecycleArguments([flag, 'run-01', hash, role]),
    { mode: flag.slice(2), run: 'run-01', planSha256: hash, role });
  for (const role of ['seller', 'venue', 'relayer\n', '', 'recipient,relayer'])
    assert.throws(() => parsePublicLifecycleArguments([flag, 'run-01', hash, role]), /LIFECYCLE_CLI_ARGUMENTS/);
});

test('explicit entry modes call only their fixed adapter and preserve the selected run scope', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agyion-cli-routes-'));
  const child = `import assert from 'node:assert/strict';import {mock} from 'node:test';
const calls=[],hash=${JSON.stringify(hash)},run='run-01';
globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN');};
const context={plan:{fixture:true},planSha256:hash,journalRun:'/fixture/journal',lockRoot:'/fixture/locks'};
mock.module(${JSON.stringify(new URL('../lib/public-lifecycle-run.mjs', import.meta.url).href)},{namedExports:{
preparePublicLifecycleRun:async v=>{calls.push(['prepare',v]);return {schema:'prepared-fixture'};},
loadPublicLifecycleRun:async v=>{calls.push(['load',v]);return context;}}});
mock.module(${JSON.stringify(new URL('../lib/public-lifecycle-funding.mjs', import.meta.url).href)},{namedExports:{
fundPublicLifecycleAccount:async v=>{calls.push(['fund',v]);return {status:'outcome-unknown'};},
recoverPublicLifecycleFunding:async v=>{calls.push(['recover-fund',v]);return {status:'account-absent'};}}});
mock.module(${JSON.stringify(new URL('../lib/public-lifecycle-journal.mjs', import.meta.url).href)},{namedExports:{
readVerifiedPublicLifecycleContext:v=>{calls.push(['journal',v]);return {status:'ready',prefix:[{}],nextStepId:'step-2',signedFeesStroops:'100',unfinished:null};}}});
const {main}=await import(${JSON.stringify(new URL('../run-public-testnet-lifecycle.mjs', import.meta.url).href)});
assert.equal((await main(['--prepare','/trusted/original',hash,run])).schema,'prepared-fixture');
assert.deepEqual(calls.splice(0),[['prepare',{originalRun:'/trusted/original',manifestSha256:hash,run}]]);
for(const [flag,status] of [['--fund','outcome-unknown'],['--recover-fund','account-absent']]){
assert.equal((await main([flag,run,hash,'relayer'])).status,status);
assert.deepEqual(calls.splice(0),[[flag.slice(2),{run,planSha256:hash,role:'relayer'}]]);}
const verified=await main(['--verify',run,hash]);assert.equal(verified.completedSteps,1);assert.equal(verified.nextStepId,'step-2');
assert.deepEqual(calls.splice(0),[['load',{run,planSha256:hash}],['journal',{run:context.journalRun,lockRoot:context.lockRoot,plan:context.plan,planSha256:hash}]]);
await assert.rejects(main(['--fund',run,hash,'seller']),/LIFECYCLE_CLI_ARGUMENTS/);assert.equal(calls.length,0);
process.stdout.write('routes verified');\n`;
  try {
    const file = path.join(directory, 'routes.mjs'); fs.writeFileSync(file, child);
    const result = spawnSync(process.execPath, ['--experimental-test-module-mocks', file], { encoding: 'utf8', cwd: root, timeout: 10000, maxBuffer: 65536 });
    assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, 'routes verified');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
