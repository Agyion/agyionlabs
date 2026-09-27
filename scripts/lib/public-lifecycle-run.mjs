/** Protected, exclusive local preparation for the fixed inactive testnet V4.
 * No funding, RPC, signing or secret export. Load performs no writes or process
 * invocation. Ordinary path access is protected; same-UID/root tampering and
 * rollback are outside this boundary. Existing ancestor modes are never changed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { loadDeploymentPlan } from '../deploy-public-testnet.mjs';
import { buildPublicLifecyclePlan, hashPublicLifecyclePlan } from './public-lifecycle-plan.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const BASE = path.join(ROOT, 'artifacts/public-v4-lifecycle');
const { Keypair } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const ROLES = ['recipient', 'relayer', 'venue', 'podTimelock', 'podMixed', 'attester', 'agent'];
const SELLER = 'GBDINNMPHA7LWJDAXS3G3NWCOLYLSPCER2Z4HENF2JE3ZKH7TVLF7PBF';
const MANIFEST = 'e3094fa5482fef6b6efb986d54d2540dcbd5a426c65fc856c1b9565825d0f5fc';
const ORIGINAL_PLAN = '21fb2aebbebd48c5802e89dadba72a2aaceb3d58642dda2d24bd28ae4471b6b7';
const RECEIPT = '147f532e29ebdaecddf357e3f819a73654d40307140b34a694e73fc92d22338f';
const MAX = 2 * 1024 * 1024;
const json = value => JSON.stringify(value, null, 2) + '\n';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
class RunError extends Error { constructor(suffix) { super(`LIFECYCLE_RUN_${suffix}`); } }
const ensure = (condition, suffix) => { if (!condition) throw new RunError(suffix); };
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
function exact(value, names) {
  ensure(value && Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).length === names.length, 'INPUT');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const name of names) ensure(descriptors[name]?.enumerable && Object.hasOwn(descriptors[name], 'value'), 'INPUT');
}
function selector(value) { ensure(typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value), 'INPUT'); }
function hash(value) { ensure(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) && value !== '0'.repeat(64), 'INPUT'); }
function originalPath(value) {
  ensure(typeof value === 'string' && path.isAbsolute(value) && path.resolve(value) === value && !value.includes('\0'), 'PATH');
  const relative = path.relative(path.join(ROOT, 'artifacts'), value);
  ensure(relative && relative !== '..' && !relative.startsWith('../') && !path.isAbsolute(relative), 'PATH');
}
function same(a, b) { return ['ino', 'dev', 'mode', 'uid', 'gid'].every(k => a[k] === b[k]); }

/** Check the whole canonical chain, including parents above a private barrier.
 * A current-UID 0700 ancestor prevents traversal by ordinary group members;
 * below it only current-UID, non-world-writable directories are accepted.
 */
function chain(directory) {
  ensure(path.resolve(directory) === directory, 'PATH');
  const pieces = directory.split(path.sep).filter(Boolean);
  let current = path.parse(directory).root, privateBarrier = false, stickyParent = false;
  for (const piece of [null, ...pieces]) {
    if (piece !== null) current = path.join(current, piece);
    const stat = fs.lstatSync(current), mode = stat.mode & 0o7777;
    ensure(stat.isDirectory() && !stat.isSymbolicLink() && fs.realpathSync(current) === current, 'PATH');
    ensure(privateBarrier ? stat.uid === process.getuid() : [0, process.getuid()].includes(stat.uid), 'PATH');
    if (stickyParent) ensure(stat.uid === process.getuid() && !(mode & 0o022), 'PATH');
    const sticky = !privateBarrier && (mode & 0o1000) !== 0 && !(mode & 0o6000);
    ensure(!(mode & 0o6000) && (privateBarrier ? !(mode & 0o002) : (!(mode & 0o022) || sticky)), 'PATH');
    if (stat.uid === process.getuid() && mode === 0o700) privateBarrier = true;
    stickyParent = sticky;
  }
  ensure(!stickyParent, 'PATH');
}
function directory(value, strict = true) {
  chain(value);
  const stat = fs.lstatSync(value);
  if (strict) ensure(stat.uid === process.getuid() && (stat.mode & 0o7777) === 0o700, 'PATH');
  const fd = fs.openSync(value, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
  try { ensure(same(stat, fs.fstatSync(fd)), 'PATH'); }
  catch (error) { fs.closeSync(fd); throw error; }
  return { path: value, stat, fd };
}
function check(held) {
  chain(held.path);
  ensure(same(held.stat, fs.lstatSync(held.path)) && same(held.stat, fs.fstatSync(held.fd)), 'PATH');
}
function sync(held) { check(held); fs.fsyncSync(held.fd); check(held); }
function close(held) { for (const item of held.reverse()) fs.closeSync(item.fd); }
function make(parent, name, held, exclusive = false) {
  check(parent);
  const value = path.join(parent.path, name);
  try { fs.mkdirSync(value, { mode: 0o700 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; ensure(!exclusive, 'EXISTS'); }
  check(parent);
  const created = directory(value); held.push(created);
  sync(created); sync(parent);
  return created;
}
function write(parent, name, value) {
  check(parent);
  const bytes = Buffer.from(json(value)); ensure(bytes.length <= MAX, 'STORAGE');
  const file = path.join(parent.path, name);
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try {
    const stat = fs.fstatSync(fd);
    ensure(stat.isFile() && stat.uid === process.getuid() && (stat.mode & 0o7777) === 0o600 && stat.nlink === 1, 'STORAGE');
    fs.writeFileSync(fd, bytes); fs.fsyncSync(fd);
    ensure(same(stat, fs.lstatSync(file)) && same(stat, fs.fstatSync(fd)) && fs.fstatSync(fd).size === bytes.length, 'STORAGE');
    check(parent);
  } finally { fs.closeSync(fd); sync(parent); }
  return sha(bytes);
}
function read(file, secret = true) {
  chain(path.dirname(file));
  const stat = fs.lstatSync(file);
  ensure(stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid() && stat.nlink === 1 && stat.size > 0 && stat.size <= MAX, 'STORAGE');
  ensure(secret ? (stat.mode & 0o7777) === 0o600 : !(stat.mode & 0o7002), 'STORAGE');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const opened = fs.fstatSync(fd); ensure(same(stat, opened) && opened.size === stat.size, 'STORAGE');
    const bytes = Buffer.alloc(stat.size + 1); let length = 0;
    while (length < bytes.length) { const count = fs.readSync(fd, bytes, length, bytes.length - length, length); if (!count) break; length += count; }
    ensure(length === stat.size && fs.fstatSync(fd).size === stat.size && same(stat, fs.lstatSync(file)), 'STORAGE');
    return bytes.subarray(0, length);
  } finally { fs.closeSync(fd); }
}
function record(file) {
  const bytes = read(file); let value;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { throw new RunError('STORAGE'); }
  ensure(Buffer.from(json(value)).equals(bytes), 'STORAGE');
  return { value, sha256: sha(bytes) };
}
async function authority(originalRun, manifestSha256) {
  originalPath(originalRun); ensure(manifestSha256 === MANIFEST, 'AUTHORITY');
  const held = directory(originalRun);
  try {
    ensure(sha(read(path.join(ROOT, 'deployments/public-v4-testnet.json'), false)) === RECEIPT, 'AUTHORITY');
    const context = await loadDeploymentPlan(originalRun, manifestSha256), p = context.plan;
    check(held);
    ensure(context.run === originalRun && context.manifestSha256 === MANIFEST && context.planSha256 === ORIGINAL_PLAN, 'AUTHORITY');
    ensure(p.schema === 'agyion-public-kernel-offline-plan-v1' && p.testOnly === true && p.manifestSha256 === MANIFEST && p.sourceAccount === SELLER &&
      p.identityDirectory === path.join(originalRun, 'identity') && p.intendedContractId === 'CA3QJJNHN3TDSU3MYWVLO5N2NGFUBY4AO2J77TRPNHFI5VB5P26USEMZ' &&
      p.wasmSha256 === 'd101e0fea1852cf057049cc08695b9e26a8b3c6a82db58d4c2706db03a22b186' && p.networkPassphrase === 'Test SDF Network ; September 2015' &&
      p.rpcUrl === 'https://soroban-testnet.stellar.org' && json(p.assets) === json(['CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC', 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA']), 'AUTHORITY');
  } finally { fs.closeSync(held.fd); }
}
function alias(originalRun) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('STELLAR_') && !key.startsWith('SOROBAN_')));
  const result = spawnSync('stellar', ['keys', 'address', 'agyion-public-v4-testnet', '--config-dir', path.join(originalRun, 'identity')],
    { env, encoding: 'utf8', timeout: 20000, maxBuffer: 1048576, stdio: ['pipe', 'pipe', 'pipe'] });
  ensure(result.status === 0 && !result.signal && !result.error && typeof result.stdout === 'string' && result.stdout.trim() === SELLER, 'IDENTITY');
}
function derive(secrets, preparedAt) {
  exact(secrets, ROLES);
  const publicKeys = Object.fromEntries(ROLES.map(role => {
    ensure(typeof secrets[role] === 'string', 'KEYS');
    const key = Keypair.fromSecret(secrets[role]); ensure(key.secret() === secrets[role], 'KEYS');
    return [role, key.publicKey()];
  }));
  ensure(new Set([SELLER, ...Object.values(publicKeys)]).size === 8, 'KEYS');
  const plan = buildPublicLifecyclePlan({ preparedAt, recipient: publicKeys.recipient, relayer: publicKeys.relayer,
    credentialKeys: Object.fromEntries(ROLES.slice(2).map(role => [role, publicKeys[role]])) });
  return { publicKeys, plan, planSha256: hashPublicLifecyclePlan(plan) };
}
function output(run, plan, planSha256) {
  return freeze({ schema: 'agyion-public-lifecycle-run-v1', run, plan, planSha256, journalRun: path.join(run, 'journal'),
    lockRoot: path.join(BASE, 'source-locks'), fundingDirectories: { recipient: path.join(run, 'funding/recipient'), relayer: path.join(run, 'funding/relayer') } });
}
async function bounded(action) { try { return await action(); } catch (error) { throw error instanceof RunError ? error : new RunError('REFUSED'); } }

/** Creates a permanent claim before RNG. Any partial run consumes its name. */
export async function preparePublicLifecycleRun(options) {
  return bounded(async () => {
    exact(options, ['originalRun', 'manifestSha256', 'run']);
    const { originalRun, manifestSha256, run } = options;
    selector(run); originalPath(originalRun); ensure(manifestSha256 === MANIFEST, 'AUTHORITY');
    await authority(originalRun, manifestSha256); alias(originalRun);
    const held = [];
    try {
      const artifacts = directory(path.join(ROOT, 'artifacts'), false); held.push(artifacts);
      const base = make(artifacts, 'public-v4-lifecycle', held), runs = make(base, 'runs', held);
      make(base, 'source-locks', held);
      const home = make(runs, run, held, true), preparedAt = new Date().toISOString();
      const claimSha256 = write(home, 'prepare.claim.json', { schema: 'agyion-public-lifecycle-claim-v1', run, originalRun, manifestSha256,
        deploymentPlanSha256: ORIGINAL_PLAN, receiptSha256: RECEIPT, preparedAt });
      const identity = make(home, 'identity', held), funding = make(home, 'funding', held);
      make(funding, 'recipient', held); make(funding, 'relayer', held); make(home, 'journal', held); make(home, 'acquisition', held);
      const secrets = Object.fromEntries(ROLES.map(role => [role, Keypair.random().secret()]));
      const { publicKeys, plan, planSha256 } = derive(secrets, preparedAt);
      write(identity, 'keys.json', { schema: 'agyion-public-lifecycle-secrets-v1', secrets });
      const publicSha256 = write(identity, 'public.json', { schema: 'agyion-public-lifecycle-identities-v1', seller: SELLER, publicKeys, planSha256 });
      write(home, 'lifecycle-plan.json', plan);
      write(home, 'prepared.json', { schema: 'agyion-public-lifecycle-prepared-v1', claimSha256, publicSha256, planSha256 });
      for (const item of held) check(item);
      return output(home.path, plan, planSha256);
    } finally { close(held); }
  });
}

/** Re-derives public identities and immutable plan; stored flags confer no trust. */
export async function loadPublicLifecycleRun(options) {
  return bounded(async () => {
    exact(options, ['run', 'planSha256']); selector(options.run); hash(options.planSha256);
    const run = path.join(BASE, 'runs', options.run), held = [];
    try {
      for (const item of [BASE, path.join(BASE, 'runs'), path.join(BASE, 'source-locks'), run, path.join(run, 'identity'),
        path.join(run, 'funding'), path.join(run, 'funding/recipient'), path.join(run, 'funding/relayer'), path.join(run, 'journal'), path.join(run, 'acquisition')]) held.push(directory(item));
      const claim = record(path.join(run, 'prepare.claim.json')), completion = record(path.join(run, 'prepared.json'));
      exact(claim.value, ['schema', 'run', 'originalRun', 'manifestSha256', 'deploymentPlanSha256', 'receiptSha256', 'preparedAt']);
      exact(completion.value, ['schema', 'claimSha256', 'publicSha256', 'planSha256']);
      const c = claim.value, done = completion.value;
      ensure(c.schema === 'agyion-public-lifecycle-claim-v1' && c.run === options.run && c.manifestSha256 === MANIFEST && c.deploymentPlanSha256 === ORIGINAL_PLAN && c.receiptSha256 === RECEIPT, 'AUTHORITY');
      ensure(done.schema === 'agyion-public-lifecycle-prepared-v1' && done.claimSha256 === claim.sha256 && done.planSha256 === options.planSha256, 'INCOMPLETE');
      await authority(c.originalRun, c.manifestSha256);
      const keys = record(path.join(run, 'identity/keys.json')), mapping = record(path.join(run, 'identity/public.json')), storedPlan = record(path.join(run, 'lifecycle-plan.json'));
      exact(keys.value, ['schema', 'secrets']); ensure(keys.value.schema === 'agyion-public-lifecycle-secrets-v1', 'KEYS');
      const { publicKeys, plan, planSha256 } = derive(keys.value.secrets, c.preparedAt);
      ensure(planSha256 === options.planSha256 && json(storedPlan.value) === json(plan), 'MAPPING');
      ensure(done.publicSha256 === mapping.sha256 && json(mapping.value) === json({ schema: 'agyion-public-lifecycle-identities-v1', seller: SELLER, publicKeys, planSha256 }), 'MAPPING');
      for (const item of held) check(item);
      return output(run, plan, planSha256);
    } finally { close(held); }
  });
}
