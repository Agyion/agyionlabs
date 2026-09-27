/** Protected, exclusive local preparation for the fixed inactive testnet V4.
 * No funding, RPC, submission or secret export. Load performs no writes or
 * process invocation. Fixed signing is explicit and separately scoped below.
 * Ordinary path access is protected; same-UID/root tampering and
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
import { publicLifecycleCallIntent, bindPublicLifecycleCall } from './public-lifecycle-call.mjs';
import { publicLifecycleObservationCases, publicLifecycleObservationIntent } from './public-lifecycle-observations.mjs';
import { assertPublicLifecycleDerivedState } from './public-lifecycle-state.mjs';
import { validatePublicLifecycleEnvelope, validateSignedPublicLifecycleEnvelope } from './public-lifecycle-envelope.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const BASE = path.join(ROOT, 'artifacts/public-v4-lifecycle');
const { Keypair, TransactionBuilder } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const ROLES = ['recipient', 'relayer', 'venue', 'podTimelock', 'podMixed', 'attester', 'agent'];
const SELLER = 'GBDINNMPHA7LWJDAXS3G3NWCOLYLSPCER2Z4HENF2JE3ZKH7TVLF7PBF';
const MANIFEST = 'e3094fa5482fef6b6efb986d54d2540dcbd5a426c65fc856c1b9565825d0f5fc';
const ORIGINAL_PLAN = '21fb2aebbebd48c5802e89dadba72a2aaceb3d58642dda2d24bd28ae4471b6b7';
const RECEIPT = '147f532e29ebdaecddf357e3f819a73654d40307140b34a694e73fc92d22338f';
const MAX = 2 * 1024 * 1024;
const json = value => JSON.stringify(value, null, 2) + '\n';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const errorCodes = new Set(['INPUT', 'PATH', 'EXISTS', 'STORAGE', 'AUTHORITY', 'IDENTITY', 'KEYS', 'INCOMPLETE', 'MAPPING',
  'REFUSED', 'BINDING', 'CREDENTIAL', 'OBSERVATION', 'ENVELOPE', 'SIGNER', 'SIGNER_USED']);
const errors = new WeakMap();
class RunError extends Error {
  constructor(suffix) { const code = errorCodes.has(suffix) ? suffix : 'REFUSED'; super(`LIFECYCLE_RUN_${code}`); errors.set(this, code); }
}
// Do not inspect untrusted thrown values or preserve a caller-mutated Error.
const publicError = error => new RunError(errors.get(error) ?? 'REFUSED');
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
async function bounded(action) { try { return await action(); } catch (error) { throw publicError(error); } }

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

// Private custody seam only. No caller-provided action or secret-bearing result
// is exported; all fixed actions finish before held directories are rechecked.
async function withRun(options, action) {
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
    const result = await action({ run, plan, planSha256, originalRun: c.originalRun, secrets: keys.value.secrets });
    for (const item of held) check(item);
    return result;
  } finally { close(held); }
}

/** Re-derives public identities and immutable plan; stored flags confer no trust. */
export async function loadPublicLifecycleRun(options) {
  return bounded(() => withRun(options, c => output(c.run, c.plan, c.planSha256)));
}

function data(value, required, optional = []) {
  ensure(value && Object.getPrototypeOf(value) === Object.prototype, 'INPUT');
  const d = Object.getOwnPropertyDescriptors(value), names = Reflect.ownKeys(d);
  ensure(required.every(n => Object.hasOwn(d, n)) && names.every(n => typeof n === 'string' && [...required, ...optional].includes(n) && d[n].enumerable && Object.hasOwn(d[n], 'value')), 'INPUT');
  return Object.fromEntries(names.map(n => [n, d[n].value]));
}
function captureBinding(plan, stepId, value) {
  const binding = data(value, ['sequence', 'headLedger', 'argsXdr'], ['timestamp', 'signatureHex']);
  ensure(typeof binding.sequence === 'string' && /^[1-9][0-9]{0,18}$/.test(binding.sequence) && BigInt(binding.sequence) < (1n << 63n), 'BINDING');
  const args = binding.argsXdr; ensure(Array.isArray(args) && Object.getPrototypeOf(args) === Array.prototype, 'BINDING');
  const d = Object.getOwnPropertyDescriptors(args), length = d.length.value;
  ensure(length <= 16 && Reflect.ownKeys(d).length === length + 1, 'BINDING');
  binding.argsXdr = Array.from({ length }, (_, i) => {
    ensure(d[i]?.enumerable && Object.hasOwn(d[i], 'value') && typeof d[i].value === 'string' && d[i].value.length <= 65536, 'BINDING');
    return d[i].value;
  });
  const input = { plan, stepId, headLedger: binding.headLedger };
  for (const key of ['timestamp', 'signatureHex']) if (Object.hasOwn(binding, key)) input[key] = binding[key];
  const derived = bindPublicLifecycleCall(input); ensure(json(binding.argsXdr) === json(derived.call.argsXdr), 'BINDING');
  return freeze({ binding, call: derived.call });
}
function credential(c, intent) {
  if (!intent) return null;
  ensure(ROLES.slice(2).includes(intent.role) && intent.publicKey === c.plan.credentialKeys[intent.role], 'CREDENTIAL');
  const key = Keypair.fromSecret(c.secrets[intent.role]), payload = Buffer.from(intent.payloadHex, 'hex');
  ensure(key.publicKey() === intent.publicKey, 'CREDENTIAL');
  const signature = key.sign(payload); ensure(Keypair.fromPublicKey(intent.publicKey).verify(payload, signature), 'CREDENTIAL');
  return { role: intent.role, publicKey: intent.publicKey, payloadSha256: sha(payload), signatureHex: signature.toString('hex') };
}
function observation(plan, planSha256, value) {
  const input = data(value, ['stepId', 'phase', 'observationKind', 'caseId', 'ledger', 'timestamp', 'state']);
  const state = assertPublicLifecycleDerivedState(input.state), i = plan.steps.findIndex(s => s.id === input.stepId);
  ensure(i >= 0 && state.planSha256 === planSha256 && state.snapshot.codeBytesAuthenticated === true && input.ledger === state.snapshot.ledger, 'OBSERVATION');
  const cases = publicLifecycleObservationCases({ plan, stepId: input.stepId, phase: input.phase });
  ensure(cases.some(c => c.observationKind === input.observationKind && c.caseIds.includes(input.caseId)), 'OBSERVATION');
  const early = [[12, 'pod-before-unlock'], [16, 'trigger-early-refund'], [18, 'fade-unclaimed-early-refund'], [21, 'fade-claimed-early-refund']];
  const staged = input.phase === 'before' && state.phase === 'after' && early.some(([next, kind]) => i === next && input.observationKind === kind && state.stepId === plan.steps[next - 1].id && state.prefixLength === next - 1);
  ensure(staged || (state.stepId === input.stepId && state.phase === input.phase && state.prefixLength === i), 'OBSERVATION');
  return publicLifecycleObservationIntent({ plan, stepId: input.stepId, observationKind: input.observationKind,
    caseId: input.caseId, ledger: input.ledger, timestamp: input.timestamp, recordAnchors: state.recordAnchors });
}
function unsignedAtPresent(call, binding, input) {
  const checked = validatePublicLifecycleEnvelope({ step: call, sequence: binding.sequence, envelopeXdr: input.unsignedXdr, nowSeconds: Math.floor(Date.now() / 1000) });
  ensure(input.sourceAccount === call.sourceAccount && input.hash === checked.hash, 'ENVELOPE');
}
function sellerSignature(c, call, binding, input) {
  ensure(call.sourceAccount === SELLER, 'IDENTITY');
  const held = [];
  try {
    for (const p of [c.originalRun, path.join(c.originalRun, 'identity')]) held.push(directory(p));
    alias(c.originalRun); for (const item of held) check(item);
    unsignedAtPresent(call, binding, input);
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('STELLAR_') && !key.startsWith('SOROBAN_')));
    const result = spawnSync('stellar', ['tx', 'sign', '--sign-with-key', 'agyion-public-v4-testnet', '--config-dir', path.join(c.originalRun, 'identity'),
      '--rpc-url', c.plan.rpcUrl, '--network-passphrase', c.plan.networkPassphrase, '--quiet'],
    { env, input: input.unsignedXdr, encoding: 'utf8', timeout: 20000, maxBuffer: 1048576, stdio: ['pipe', 'pipe', 'pipe'] });
    ensure(result.status === 0 && !result.signal && !result.error && typeof result.stdout === 'string' && Buffer.byteLength(result.stdout) <= 1048576, 'SIGNER');
    for (const item of held) check(item);
    return result.stdout.trim();
  } finally { close(held); }
}

/** Fixed-purpose signing only. The trusted executor/journal owns current-step
 * eligibility, fresh ledger evidence, durable claim/reservation and single send.
 * This factory does no RPC/writes and cannot prove callback invocation provenance.
 * Recreated factories are NOT a durable one-shot or a recovery mechanism. */
export async function createPublicLifecycleSigning(options) {
  return bounded(async () => {
    const scope = data(options, ['run', 'planSha256']); selector(scope.run); hash(scope.planSha256); Object.freeze(scope);
    const context = await loadPublicLifecycleRun(scope), { plan, planSha256 } = context;
    return Object.freeze({
      callCredential(value) {
        return bounded(async () => {
          const input = data(value, ['stepId', 'headLedger'], ['timestamp']);
          const intent = publicLifecycleCallIntent({ plan, ...input });
          return withRun(scope, c => {
            const result = credential(c, intent.credential);
            bindPublicLifecycleCall({ plan: c.plan, ...input, ...(result ? { signatureHex: result.signatureHex } : {}) });
            return freeze(result);
          });
        });
      },
      observationCredential(value) {
        return bounded(async () => {
          const intent = observation(plan, planSha256, value);
          return withRun(scope, c => {
            const result = credential(c, intent.credential);
            if (result && intent.credential.corruptFirstByte) {
              const bytes = Buffer.from(result.signatureHex, 'hex'); bytes[0] ^= 1; result.signatureHex = bytes.toString('hex');
              ensure(!Keypair.fromPublicKey(result.publicKey).verify(Buffer.from(intent.credential.payloadHex, 'hex'), bytes), 'CREDENTIAL');
            }
            return freeze(result);
          });
        });
      },
      envelopeSigner(value) {
        try {
          const input = data(value, ['stepId', 'binding']), { binding, call } = captureBinding(plan, input.stepId, input.binding);
          const role = plan.steps.find(s => s.id === input.stepId).sourceRole; let used = false;
          return value => bounded(async () => {
            ensure(!used, 'SIGNER_USED'); used = true;
            const request = data(value, ['unsignedXdr', 'sourceAccount', 'hash']); unsignedAtPresent(call, binding, request);
            return withRun(scope, c => {
              unsignedAtPresent(call, binding, request);
              let signedXdr;
              if (role === 'seller') signedXdr = sellerSignature(c, call, binding, request);
              else {
                ensure(['recipient', 'relayer'].includes(role) && call.sourceAccount === c.plan.actors[role], 'IDENTITY');
                const key = Keypair.fromSecret(c.secrets[role]); ensure(key.publicKey() === call.sourceAccount, 'IDENTITY');
                const tx = TransactionBuilder.fromXDR(request.unsignedXdr, c.plan.networkPassphrase); tx.sign(key); signedXdr = tx.toXDR();
              }
              validateSignedPublicLifecycleEnvelope({ step: call, sequence: binding.sequence, unsignedXdr: request.unsignedXdr,
                signedXdr, nowSeconds: Math.floor(Date.now() / 1000) });
              return signedXdr;
            });
          });
        } catch (error) { throw publicError(error); }
      },
    });
  });
}
