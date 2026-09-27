/** Append-only OFFLINE lifecycle orchestration foundation. No RPC implementation,
 * credentials, funding or runnable CLI. Trusted CODE policies must validate raw
 * observation semantics and expected state against this plan and prior receipts;
 * their return values are not chain evidence. Raw snapshot/fee decoders run here.
 * Every caller must share one protected lockRoot. Deliberately different roots
 * cannot coordinate; a future reviewed CLI must fix that namespace itself. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { privateRunDirectory, readPrivateBytes } from './private-deployment.mjs';
import { hashPublicLifecyclePlan } from './public-lifecycle-plan.mjs';
import { bindPublicLifecycleCall } from './public-lifecycle-call.mjs';
import { validatePublicLifecycleEnvelope, validateSignedPublicLifecycleEnvelope } from './public-lifecycle-envelope.mjs';
import { verifyPublicLifecycleSnapshot } from './public-lifecycle-readback.mjs';
import { reconcilePublicLifecycleFees } from './public-lifecycle-fees.mjs';
const { xdr } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const MAX = 2 * 1024 * 1024, VERSION = 'agyion-public-lifecycle-journal-v1';
const ensure = (ok, code) => { if (!ok) throw Error(`LIFECYCLE_JOURNAL_${code}`); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => sha(canonical(value));
const now = () => Math.floor(Date.now() / 1000);
function canonical(value, seen = new Set(), depth = 0) {
  ensure(depth <= 32, 'DATA');
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') { ensure(Buffer.byteLength(value) <= MAX, 'DATA'); return JSON.stringify(value); }
  if (typeof value === 'number') { ensure(Number.isSafeInteger(value) && !Object.is(value, -0), 'DATA'); return String(value); }
  ensure(value && typeof value === 'object' && !seen.has(value), 'DATA');
  const array = Array.isArray(value), descriptors = Object.getOwnPropertyDescriptors(value), names = Reflect.ownKeys(descriptors);
  ensure(Object.getPrototypeOf(value) === (array ? Array.prototype : Object.prototype) && names.every(k => typeof k === 'string') && names.length <= 10000, 'DATA');
  seen.add(value);
  let out;
  if (array) {
    ensure(names.length === value.length + 1, 'DATA');
    out = '[' + Array.from({ length: value.length }, (_, i) => { const d = descriptors[i]; ensure(d && Object.hasOwn(d, 'value') && d.enumerable, 'DATA'); return canonical(d.value, seen, depth + 1); }).join(',') + ']';
  } else {
    out = '{' + names.sort().map(k => { const d = descriptors[k]; ensure(Object.hasOwn(d, 'value') && d.enumerable, 'DATA'); return JSON.stringify(k) + ':' + canonical(d.value, seen, depth + 1); }).join(',') + '}';
  }
  seen.delete(value); ensure(Buffer.byteLength(out) <= MAX, 'DATA'); return out;
}
function frozen(value) { if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); } return value; }
const copy = value => frozen(JSON.parse(canonical(value)));
function exact(value, required, optional = []) {
  ensure(value && Object.getPrototypeOf(value) === Object.prototype, 'FIELDS');
  const d = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(d);
  ensure(required.every(k => Object.hasOwn(d, k)) && keys.every(k => typeof k === 'string' && [...required, ...optional].includes(k) && Object.hasOwn(d[k], 'value') && d[k].enumerable), 'FIELDS');
  return value;
}
function exists(file) { try { fs.lstatSync(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
function read(dir, name) {
  ensure(/^[a-zA-Z0-9_.-]+\.json$/.test(name), 'FILENAME');
  privateRunDirectory(dir); const file = path.join(dir, name); if (!exists(file)) return null;
  try { const value = JSON.parse(readPrivateBytes(file).toString('utf8')); canonical(value); return frozen(value); }
  catch (e) { if (e instanceof SyntaxError) throw Error('LIFECYCLE_JOURNAL_JSON'); throw e; }
}
function syncDirectory(directory) {
  const fd = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function write(dir, name, value) {
  privateRunDirectory(dir); ensure(/^[a-zA-Z0-9_.-]+\.json$/.test(name), 'FILENAME');
  const bytes = canonical(value) + '\n'; ensure(Buffer.byteLength(bytes) <= MAX, 'RECORD_SIZE');
  const fd = fs.openSync(path.join(dir, name), fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  syncDirectory(dir);
}
function same(a, b, code) { ensure(canonical(a) === canonical(b), code); }
function context(options) {
  const { run, lockRoot } = options; privateRunDirectory(run); privateRunDirectory(lockRoot);
  ensure(run !== lockRoot, 'LOCK_ROOT');
  // The future CLI must durably create any higher ancestor directories too.
  syncDirectory(path.dirname(run)); syncDirectory(path.dirname(lockRoot));
  const plan = copy(options.plan), planSha256 = hashPublicLifecyclePlan(plan); ensure(options.planSha256 === planSha256, 'PLAN_HASH');
  const manifest = { schema: VERSION, planSha256, lockRoot, plan };
  const existing = read(run, 'plan.json');
  if (existing) same(existing, manifest, 'MANIFEST');
  else ensure(fs.readdirSync(run).length === 0, 'MANIFEST_MISSING');
  return { run, lockRoot, plan, planSha256, manifest };
}
function bound(c, stepId, value) {
  const binding = copy(value); exact(binding, ['sequence', 'headLedger', 'argsXdr'], ['timestamp', 'signatureHex']);
  ensure(typeof binding.sequence === 'string' && /^[1-9][0-9]{0,18}$/.test(binding.sequence) && BigInt(binding.sequence) < (1n << 63n), 'SEQUENCE');
  const projection = { plan: c.plan, stepId, headLedger: binding.headLedger };
  for (const key of ['timestamp', 'signatureHex']) if (Object.hasOwn(binding, key)) projection[key] = binding[key];
  const derived = bindPublicLifecycleCall(projection); same(binding.argsXdr, derived.call.argsXdr, 'CALL_BINDING');
  return { binding, derived };
}
function xdrValue(type, value) {
  ensure(typeof value === 'string' && value.length > 0 && value.length < MAX, 'INCLUSION_XDR');
  const result = type.fromXDR(value, 'base64'); ensure(result.toXDR('base64') === value, 'INCLUSION_XDR'); return result;
}
function verifiedAttempt(c, claim, attempt) {
  exact(attempt, ['schema', 'planSha256', 'stepId', 'claimSha256', 'validatedAtSeconds', 'unsignedXdr', 'signedXdr', 'hash', 'feeStroops']);
  ensure(attempt.schema === VERSION && attempt.planSha256 === c.planSha256 && attempt.stepId === claim.stepId && attempt.claimSha256 === digest(claim), 'ATTEMPT_BINDING');
  // Historical time is allowed ONLY for immutable persisted attempt verification.
  // No path from this check can sign or send again.
  const checked = validateSignedPublicLifecycleEnvelope({ unsignedXdr: attempt.unsignedXdr, signedXdr: attempt.signedXdr,
    step: claim.derived.call, sequence: claim.binding.sequence, nowSeconds: attempt.validatedAtSeconds });
  ensure(checked.hash === attempt.hash && checked.feeStroops === attempt.feeStroops, 'ATTEMPT_BINDING');
  return checked;
}
function inclusion(c, claim, attempt, raw) {
  const response = copy(raw); ensure(response.status === 'SUCCESS' || response.status === 'FAILED', 'INCLUSION_STATUS');
  ensure(response.txHash === attempt.hash && response.envelopeXdr === attempt.signedXdr && response.feeBump === false, 'INCLUSION_SCOPE');
  ensure(Number.isSafeInteger(response.ledger) && response.ledger >= claim.binding.headLedger && response.ledger <= 0xffffffff, 'INCLUSION_LEDGER');
  if (response.latestLedger !== undefined) ensure(Number.isSafeInteger(response.latestLedger) && response.latestLedger >= response.ledger, 'INCLUSION_LEDGER');
  const result = xdrValue(xdr.TransactionResult, response.resultXdr), meta = xdrValue(xdr.TransactionMeta, response.resultMetaXdr);
  const fee = BigInt(result.feeCharged().toString()); ensure(fee >= 0n && fee <= BigInt(attempt.feeStroops), 'INCLUSION_FEE');
  ensure(meta.switch() === 4, 'INCLUSION_META');
  let createdId = null;
  if (response.status === 'SUCCESS') {
    ensure(result.result().switch().name === 'txSuccess', 'INCLUSION_RESULT');
    const operations = result.result().results(); ensure(operations.length === 1 && operations[0].switch().name === 'opInner' && operations[0].tr().switch().name === 'invokeHostFunction', 'INCLUSION_RESULT');
    const host = operations[0].tr().invokeHostFunctionResult(), body = meta.v4();
    ensure(host.switch().name === 'invokeHostFunctionSuccess' && body.operations().length === 1 && body.sorobanMeta(), 'INCLUSION_RESULT');
    const rv = body.sorobanMeta().returnValue(), preimage = new xdr.InvokeHostFunctionSuccessPreImage({ returnValue: rv, events: body.operations()[0].events() });
    ensure(sha(preimage.toXDR()) === host.success().toString('hex'), 'INCLUSION_PREIMAGE');
    if (claim.derived.expectedCreatedId !== null) {
      ensure(rv.switch().name === 'scvU64' && BigInt(rv.u64().toString()) > 0n, 'INCLUSION_ID'); createdId = rv.u64().toString();
      ensure(createdId === claim.derived.expectedCreatedId, 'INCLUSION_ID');
    } else ensure(rv.switch().name === 'scvVoid', 'INCLUSION_RETURN');
  } else {
    // Only a fully decoded included host-function failure is terminal here.
    // Unsupported transaction-level result variants remain unresolved.
    ensure(result.result().switch().name === 'txFailed', 'INCLUSION_RESULT');
    const results = result.result().results(); ensure(results.length === 1 && results[0].switch().name === 'opInner' && results[0].tr().switch().name === 'invokeHostFunction' && results[0].tr().invokeHostFunctionResult().switch().value < 0, 'INCLUSION_RESULT');
  }
  return { schema: VERSION, planSha256: c.planSha256, stepId: claim.stepId, attemptSha256: digest(attempt), status: response.status, ledger: response.ledger, createdId, response };
}
function entries(c) {
  const rows = []; let fees = 0n, unfinished = false;
  for (const step of c.plan.steps) {
    const claim = read(c.run, `${step.id}.claim.json`), attempt = read(c.run, `${step.id}.attempt.json`), included = read(c.run, `${step.id}.inclusion.json`), completion = read(c.run, `${step.id}.completion.json`);
    if (!claim) { ensure(!attempt && !included && !completion, 'ORPHAN'); unfinished = true; continue; }
    ensure(!unfinished, 'ORDER');
    exact(claim, ['schema', 'planSha256', 'stepId', 'binding', 'derived', 'predecessors', 'evidence', 'claimedAtSeconds']);
    ensure(claim.schema === VERSION && claim.planSha256 === c.planSha256 && claim.stepId === step.id && Number.isSafeInteger(claim.claimedAtSeconds) && claim.claimedAtSeconds > 0, 'CLAIM_BINDING');
    same(bound(c, step.id, claim.binding).derived, claim.derived, 'CLAIM_BINDING');
    same(claim.predecessors, rows.map(r => ({ stepId: r.claim.stepId, completionSha256: digest(r.completion) })), 'PREDECESSORS');
    if (attempt) { verifiedAttempt(c, claim, attempt); fees += BigInt(attempt.feeStroops); }
    ensure(!included || attempt, 'ORPHAN'); if (included) same(included, inclusion(c, claim, attempt, included.response), 'INCLUSION_BINDING');
    ensure(!completion || included?.status === 'SUCCESS', 'ORPHAN');
    if (completion) {
      exact(completion, ['schema', 'planSha256', 'stepId', 'inclusionSha256', 'evidence', 'verified']);
      ensure(completion.schema === VERSION && completion.planSha256 === c.planSha256 && completion.stepId === step.id && completion.inclusionSha256 === digest(included), 'COMPLETION_BINDING');
    } else unfinished = true;
    rows.push({ claim, attempt, included, completion });
  }
  ensure(fees <= BigInt(c.plan.limits.aggregateFeeStroops), 'AGGREGATE_FEE');
  return { rows, fees };
}
/** Read local immutable records; completion evidence is re-decoded before any
 * new writable work or recovery completion, not authenticated by this summary. */
export function readPublicLifecycleState(options) {
  exact(options, ['run', 'lockRoot', 'plan', 'planSha256']); const c = context(options), { rows, fees } = entries(c);
  return frozen({ planSha256: c.planSha256, signedFeesStroops: fees.toString(), steps: rows.map(r => ({ stepId: r.claim.stepId,
    status: r.completion ? 'complete' : r.included?.status === 'FAILED' ? 'failed' : r.included ? 'included' : r.attempt ? 'pending' : 'claimed',
    hash: r.attempt?.hash ?? null, createdId: r.included?.createdId ?? null })) });
}
function sourceDirectory(c, source) {
  const key = sha(c.plan.networkPassphrase + '\0' + source), directory = path.join(c.lockRoot, key);
  try { fs.mkdirSync(directory, { mode: 0o700 }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  privateRunDirectory(directory);
  // Also required on EEXIST: another process may have created the child but
  // not yet persisted its entry in the parent directory.
  syncDirectory(c.lockRoot); return directory;
}
function sourceReservation(c, claim) {
  const directory = sourceDirectory(c, claim.derived.call.sourceAccount), names = fs.readdirSync(directory).sort();
  ensure(names.length <= 20000 && names.every(n => /^\d{6}\.(claim|release)\.json$/.test(n)), 'SOURCE_RECORDS');
  let generation = 1;
  while (generation <= 9999) {
    const prefix = String(generation).padStart(6, '0'), prior = read(directory, prefix + '.claim.json'), release = read(directory, prefix + '.release.json');
    if (!prior) { ensure(!release && !names.some(n => Number(n.slice(0, 6)) > generation), 'SOURCE_RECORDS'); break; }
    exact(prior, ['schema', 'run', 'lockRoot', 'planSha256', 'stepId', 'sourceAccount', 'networkPassphrase', 'claimSha256']);
    ensure(c.plan.steps.some(s => s.id === prior.stepId), 'SOURCE_STEP');
    ensure(prior.schema === VERSION && prior.lockRoot === c.lockRoot && prior.sourceAccount === claim.derived.call.sourceAccount && prior.networkPassphrase === c.plan.networkPassphrase, 'SOURCE_SCOPE');
    ensure(release, 'SOURCE_PENDING');
    exact(release, ['schema', 'reservationSha256', 'terminalFile', 'terminalSha256']);
    ensure(release.schema === VERSION && release.reservationSha256 === digest(prior) && release.terminalFile === prior.stepId + '.completion.json', 'SOURCE_RELEASE');
    const terminal = read(prior.run, release.terminalFile); ensure(terminal && digest(terminal) === release.terminalSha256 && terminal.stepId === prior.stepId && terminal.planSha256 === prior.planSha256, 'SOURCE_RELEASE');
    generation++;
  }
  ensure(generation <= 9999, 'SOURCE_CAP');
  const name = String(generation).padStart(6, '0') + '.claim.json';
  const value = { schema: VERSION, run: c.run, lockRoot: c.lockRoot, planSha256: c.planSha256, stepId: claim.stepId,
    sourceAccount: claim.derived.call.sourceAccount, networkPassphrase: c.plan.networkPassphrase, claimSha256: digest(claim) };
  write(directory, name, value); return { directory, name, value };
}
function findReservation(c, claim) {
  const directory = sourceDirectory(c, claim.derived.call.sourceAccount), found = [];
  for (const name of fs.readdirSync(directory).filter(n => /^\d{6}\.claim\.json$/.test(n))) {
    const value = read(directory, name);
    if (value.run === c.run && value.stepId === claim.stepId && value.claimSha256 === digest(claim)) found.push({ directory, name, value });
  }
  ensure(found.length === 1, 'SOURCE_RESERVATION'); return found[0];
}
function guard(c, claim, reservation) {
  same(read(c.run, 'plan.json'), c.manifest, 'MANIFEST'); same(read(c.run, `${claim.stepId}.claim.json`), claim, 'CLAIM_CHANGED');
  same(read(reservation.directory, reservation.name), reservation.value, 'SOURCE_CHANGED');
  ensure(!read(reservation.directory, reservation.name.replace('.claim.', '.release.')), 'SOURCE_RELEASED');
}
const receiptSummaries = rows => frozen(rows.map(r => ({ claim: r.claim, inclusion: r.included })));
function verifyEvidence(c, claim, rows, phase, value, policy) {
  const evidence = copy(value); exact(evidence, ['snapshot', 'observations']); exact(evidence.snapshot, ['expected', 'response']);
  const step = c.plan.steps.find(s => s.id === claim.stepId), index = c.plan.steps.indexOf(step);
  const names = phase === 'before' ? [...(index === 0 ? c.plan.preflightObservations : []), ...step.requiredObservations]
    : [...step.postObservations, ...(index === c.plan.steps.length - 1 ? c.plan.finalObservations : [])];
  exact(evidence.observations, names);
  const scope = frozen({ plan: c.plan, planSha256: c.planSha256, stepId: step.id, phase, claim, receipts: receiptSummaries(rows) });
  const checked = copy(policy.verifyObservations({ ...scope, rawEvidence: evidence.observations }));
  exact(checked, ['planSha256', 'stepId', 'phase', 'evidence']); ensure(checked.planSha256 === c.planSha256 && checked.stepId === step.id && checked.phase === phase, 'OBSERVATION_SCOPE');
  ensure(Array.isArray(checked.evidence) && checked.evidence.length === names.length, 'OBSERVATION_NAMES');
  for (let i = 0; i < names.length; i++) {
    const row = checked.evidence[i]; exact(row, ['observationKind', 'ledger', 'recordRef', 'expectedOutcome', 'evidenceSha256']);
    ensure(row.observationKind === names[i] && row.evidenceSha256 === digest(evidence.observations[names[i]]) && Number.isSafeInteger(row.ledger) && row.ledger > 0 && row.ledger <= (phase === 'before' ? claim.binding.headLedger : evidence.snapshot.response.latestLedger) && row.recordRef === step.record && typeof row.expectedOutcome === 'string' && row.expectedOutcome.length > 0 && row.expectedOutcome.length <= 200, 'OBSERVATION_BINDING');
  }
  if (phase === 'after') {
    const current = rows.find(r => r.claim.stepId === claim.stepId);
    ensure(current?.included, 'OBSERVATION_INCLUSION');
    for (const row of checked.evidence) if (step.postObservations.includes(row.observationKind)) ensure(row.ledger >= current.included.ledger, 'OBSERVATION_INCLUSION');
  }
  const statePolicy = copy(policy.verifyStateExpectations({ ...scope, expected: evidence.snapshot.expected }));
  same(statePolicy, { planSha256: c.planSha256, stepId: step.id, phase, expectedSha256: digest(evidence.snapshot.expected) }, 'STATE_POLICY');
  const snapshot = verifyPublicLifecycleSnapshot({ plan: c.plan, expected: evidence.snapshot.expected }, evidence.snapshot.response);
  ensure(snapshot.planSha256 === c.planSha256 && Number.isSafeInteger(snapshot.ledger) && snapshot.ledger >= claim.binding.headLedger, 'SNAPSHOT_SCOPE');
  if (phase === 'before') {
    ensure(snapshot.ledger === claim.binding.headLedger, 'SNAPSHOT_HEAD');
    const sequence = snapshot.accounts[step.sourceRole].sequence;
    ensure(typeof sequence === 'string' && /^(0|[1-9][0-9]*)$/.test(sequence) && BigInt(claim.binding.sequence) === BigInt(sequence) + 1n, 'SNAPSHOT_SEQUENCE');
  }
  return { snapshot, observations: checked };
}
function verifiedCompletion(c, row, previous, policy) {
  const before = verifyEvidence(c, row.claim, previous, 'before', row.claim.evidence, policy);
  const after = verifyEvidence(c, row.claim, [...previous, row], 'after', row.completion.evidence, policy);
  const fee = reconcilePublicLifecycleFees({ networkPassphrase: c.plan.networkPassphrase, sourceAccount: row.claim.derived.call.sourceAccount,
    signedEnvelopeXdr: row.attempt.signedXdr, transactionHash: row.attempt.hash, inclusionLedger: row.included.ledger, response: row.included.response,
    before: before.snapshot, after: after.snapshot, expectedBusinessDeltas: row.claim.derived.businessDeltas });
  const result = copy({ before, after, fee }); same(row.completion.verified, result, 'COMPLETION_EVIDENCE'); return result;
}
function replayCompleted(c, rows, policy) { const previous = []; for (const row of rows) { if (row.completion) verifiedCompletion(c, row, previous, policy); previous.push(row); } }
function release(c, claim, reservation, completion) {
  const name = reservation.name.replace('.claim.', '.release.'), value = { schema: VERSION, reservationSha256: digest(reservation.value), terminalFile: claim.stepId + '.completion.json', terminalSha256: digest(completion) };
  const prior = read(reservation.directory, name); if (prior) same(prior, value, 'SOURCE_RELEASE'); else write(reservation.directory, name, value);
}
function adapters(options, execution) {
  for (const name of ['getTransaction', 'collectEvidence', 'verifyObservations', 'verifyStateExpectations', ...(execution ? ['prepare', 'sign', 'sendTransaction'] : [])]) ensure(typeof options[name] === 'function', 'ADAPTER');
}
const commonKeys = ['run', 'lockRoot', 'plan', 'planSha256', 'stepId', 'getTransaction', 'collectEvidence', 'verifyObservations', 'verifyStateExpectations'];
async function settle(c, claim, attempt, reservation, rows, options) {
  let included = read(c.run, claim.stepId + '.inclusion.json');
  if (!included) {
    let raw;
    try { raw = await options.getTransaction(attempt.hash); } catch { return frozen({ status: 'pending', hash: attempt.hash }); }
    guard(c, claim, reservation); raw = copy(raw);
    if (raw.status === 'NOT_FOUND') return frozen({ status: 'pending', hash: attempt.hash });
    included = inclusion(c, claim, attempt, raw); write(c.run, claim.stepId + '.inclusion.json', included);
  } else same(included, inclusion(c, claim, attempt, included.response), 'INCLUSION_BINDING');
  // FAILED is preserved but intentionally cannot advance the reviewed success
  // schedule or release the source. Operator policy for abandoning is absent.
  if (included.status === 'FAILED') return frozen({ status: 'failed', hash: attempt.hash, ledger: included.ledger });
  let completion = read(c.run, claim.stepId + '.completion.json');
  const previous = rows.filter(r => r.claim.stepId !== claim.stepId);
  if (!completion) {
    const evidence = copy(await options.collectEvidence(frozen({ plan: c.plan, planSha256: c.planSha256, stepId: claim.stepId, claim, inclusion: included, receipts: receiptSummaries(previous) })));
    guard(c, claim, reservation);
    const before = verifyEvidence(c, claim, previous, 'before', claim.evidence, options);
    const row = { claim, attempt, included, completion: null };
    const after = verifyEvidence(c, claim, [...previous, row], 'after', evidence, options);
    const fee = reconcilePublicLifecycleFees({ networkPassphrase: c.plan.networkPassphrase, sourceAccount: claim.derived.call.sourceAccount, signedEnvelopeXdr: attempt.signedXdr,
      transactionHash: attempt.hash, inclusionLedger: included.ledger, response: included.response, before: before.snapshot, after: after.snapshot, expectedBusinessDeltas: claim.derived.businessDeltas });
    completion = { schema: VERSION, planSha256: c.planSha256, stepId: claim.stepId, inclusionSha256: digest(included), evidence, verified: copy({ before, after, fee }) };
    write(c.run, claim.stepId + '.completion.json', completion);
  } else verifiedCompletion(c, { claim, attempt, included, completion }, previous, options);
  release(c, claim, reservation, completion);
  return frozen({ status: 'complete', hash: attempt.hash, ledger: included.ledger, createdId: included.createdId });
}
/** Permanent claim and source reservation are fsynced synchronously before the
 * first await. Any failure consumes that step; only original-hash recovery is
 * available. No callback can cause the module to sign or send a second time. */
export async function executePublicLifecycleStep(options) {
  exact(options, [...commonKeys, 'binding', 'evidence', 'prepare', 'sign', 'sendTransaction']); adapters(options, true);
  const c = context(options), { rows, fees } = entries(c), step = c.plan.steps.find(s => s.id === options.stepId);
  ensure(step, 'STEP'); ensure(!rows.some(r => r.claim.stepId === step.id), 'CLAIMED');
  ensure(c.plan.steps.indexOf(step) === rows.length && rows.every(r => r.completion), 'PREDECESSOR');
  const { binding, derived } = bound(c, step.id, options.binding), evidence = copy(options.evidence);
  const claim = copy({ schema: VERSION, planSha256: c.planSha256, stepId: step.id, binding, derived,
    predecessors: rows.map(r => ({ stepId: r.claim.stepId, completionSha256: digest(r.completion) })), evidence, claimedAtSeconds: now() });
  if (!read(c.run, 'plan.json')) write(c.run, 'plan.json', c.manifest);
  write(c.run, step.id + '.claim.json', claim);
  const reservation = sourceReservation(c, claim);
  replayCompleted(c, rows, options); verifyEvidence(c, claim, rows, 'before', evidence, options);
  const prepared = copy(await options.prepare(frozen({ plan: c.plan, planSha256: c.planSha256, stepId: step.id, claim })));
  guard(c, claim, reservation); exact(prepared, ['envelopeXdr'], ['restorePreamble']);
  const common = { step: derived.call, sequence: binding.sequence };
  const unsigned = validatePublicLifecycleEnvelope({ ...common, ...prepared, nowSeconds: now() });
  ensure(fees + BigInt(unsigned.feeStroops) <= BigInt(c.plan.limits.aggregateFeeStroops), 'AGGREGATE_FEE');
  const signedXdr = await options.sign(frozen({ unsignedXdr: prepared.envelopeXdr, sourceAccount: derived.call.sourceAccount, hash: unsigned.hash }));
  guard(c, claim, reservation);
  const validatedAtSeconds = now(), signed = validateSignedPublicLifecycleEnvelope({ ...common, unsignedXdr: prepared.envelopeXdr, signedXdr, nowSeconds: validatedAtSeconds, ...(prepared.restorePreamble !== undefined ? { restorePreamble: prepared.restorePreamble } : {}) });
  const attempt = copy({ schema: VERSION, planSha256: c.planSha256, stepId: step.id, claimSha256: digest(claim), validatedAtSeconds,
    unsignedXdr: prepared.envelopeXdr, signedXdr, hash: signed.hash, feeStroops: signed.feeStroops });
  write(c.run, step.id + '.attempt.json', attempt); guard(c, claim, reservation);
  // Fresh signing-time validation still runs after disk persistence. Historical
  // time used by recovery is never used for this submission gate.
  validateSignedPublicLifecycleEnvelope({ ...common, unsignedXdr: attempt.unsignedXdr, signedXdr: attempt.signedXdr, nowSeconds: now() });
  try { await options.sendTransaction(attempt.signedXdr); } catch { /* Unknown transport outcome: query only its persisted hash. */ }
  guard(c, claim, reservation);
  return settle(c, claim, attempt, reservation, rows, options);
}
/** Recovery has no signing/submission adapters, and never resends stored XDR.
 * Expired attempts may be verified at their immutable original validation time
 * solely to decode/read the original transaction. NOT_FOUND stays pending. */
export async function recoverPublicLifecycleStep(options) {
  exact(options, commonKeys); adapters(options, false);
  const c = context(options), { rows } = entries(c), row = rows.find(r => r.claim.stepId === options.stepId); ensure(row, 'NO_CLAIM');
  replayCompleted(c, rows, options);
  if (!row.attempt) return frozen({ status: 'claimed', hash: null });
  const reservation = findReservation(c, row.claim);
  if (row.completion) { release(c, row.claim, reservation, row.completion); return frozen({ status: 'complete', hash: row.attempt.hash, ledger: row.included.ledger, createdId: row.included.createdId }); }
  guard(c, row.claim, reservation); return settle(c, row.claim, row.attempt, reservation, rows, options);
}
