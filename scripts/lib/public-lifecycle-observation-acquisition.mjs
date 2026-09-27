/** One bounded fixed negative observation and its required ENFORCE control.
 * Trusted RPC evidence only.
 * No journal release, persistence, submission, retries or historical freshness
 * authority. Callers must replay complete raw cases through the phase policies.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { hashPublicLifecyclePlan } from './public-lifecycle-plan.mjs';
import { publicLifecycleAcquisitionKeys, verifyPublicLifecycleSnapshot } from './public-lifecycle-readback.mjs';
import { assertPublicLifecycleDerivedState, verifyPublicLifecycleHeader } from './public-lifecycle-state.mjs';
import { publicLifecycleObservationCases, publicLifecycleObservationIntent, publicLifecycleSimulationError, verifyPublicLifecycleObservationCase } from './public-lifecycle-observations.mjs';
import { acquirePublicLifecycleSnapshot } from './public-lifecycle-acquisition.mjs';
import { acquirePublicLifecycleBaseline, verifyPublicLifecycleZeroRead } from './public-lifecycle-baseline.mjs';
import { createPublicLifecycleRpc } from './public-lifecycle-rpc.mjs';
const { Account, Address, Keypair, Operation, TransactionBuilder, nativeToScVal, xdr } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const MAX = 2 * 1024 * 1024, refusals = new WeakMap(), b64 = v => v.toXDR('base64');
const abortedGetter = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted').get;
const addListener = EventTarget.prototype.addEventListener, removeListener = EventTarget.prototype.removeEventListener;
function refusal(code) { const error = Error(`LIFECYCLE_OBSERVATION_ACQUISITION_${code}`); refusals.set(error, code); return error; }
const check = (ok, code) => { if (!ok) throw refusal(code); };
const guarded = (fn, code) => { try { return fn(); } catch { throw refusal(code); } };
const freeze = v => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const canonical = v => v && typeof v === 'object' ? Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' : '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}' : JSON.stringify(v);
const sha = v => createHash('sha256').update(v).digest('hex');
const same = (a, b, code) => check(canonical(a) === canonical(b), code);
function exact(v, required, optional = [], code = 'INPUT') {
  check(v && Object.getPrototypeOf(v) === Object.prototype, code);
  const d = Object.getOwnPropertyDescriptors(v), names = Reflect.ownKeys(d);
  check(required.every(k => Object.hasOwn(d, k)) && names.every(k => typeof k === 'string' && [...required, ...optional].includes(k) && d[k].enumerable && Object.hasOwn(d[k], 'value')), code);
  return Object.fromEntries(names.map(k => [k, d[k].value]));
}
function copy(input) {
  const seen = new Set(); let nodes = 0, bytes = 0;
  function visit(v, depth) {
    check(++nodes <= 20000 && depth <= 32, 'BOUNDS');
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'string') { bytes += Buffer.byteLength(v); check(bytes <= MAX, 'BOUNDS'); return v; }
    if (typeof v === 'number') { check(Number.isSafeInteger(v) && !Object.is(v, -0), 'INPUT'); return v; }
    const array = Array.isArray(v); check(v && typeof v === 'object' && Object.getPrototypeOf(v) === (array ? Array.prototype : Object.prototype) && !seen.has(v), 'INPUT');
    seen.add(v); const d = Object.getOwnPropertyDescriptors(v), names = Reflect.ownKeys(d); check(names.length <= 10001 && names.every(k => typeof k === 'string'), 'BOUNDS'); let out;
    if (array) {
      const n = d.length.value; check(n <= 10000 && names.length === n + 1, 'INPUT');
      out = Array.from({ length: n }, (_, i) => { check(d[i]?.enumerable && Object.hasOwn(d[i], 'value'), 'INPUT'); return visit(d[i].value, depth + 1); });
    } else out = Object.fromEntries(names.map(k => { check(d[k].enumerable && Object.hasOwn(d[k], 'value'), 'INPUT'); bytes += Buffer.byteLength(k); check(bytes <= MAX, 'BOUNDS'); return [k, visit(d[k].value, depth + 1)]; }));
    seen.delete(v); return out;
  }
  const out = visit(input, 0); check(Buffer.byteLength(canonical(out)) <= MAX, 'BOUNDS'); return freeze(out);
}
const now = () => { const n = Math.floor(Date.now() / 1000); check(Number.isSafeInteger(n) && n > 0 && n <= Number.MAX_SAFE_INTEGER - 90, 'TIME'); return n; };
function zeroEvidence(plan, value, state, keys) {
  exact(value, ['acquisition', 'zeroBalanceEvidence', 'zeroRead'], [], 'BEFORE');
  const present = value.acquisition.response.entries.some(row => row.key === b64(keys[6]));
  if (present) { check(value.zeroRead === null && value.zeroBalanceEvidence === null, 'ZERO'); return null; }
  check(!state.expected.fundedHistory && state.expected.records.length === 0 && value.zeroRead !== null, 'ZERO');
  exact(value.zeroRead, ['request', 'response', 'validatedAtSeconds'], [], 'ZERO');
  const derived = guarded(() => verifyPublicLifecycleZeroRead({ plan, snapshot: value.acquisition.response, request: value.zeroRead.request, response: value.zeroRead.response, nowSeconds: value.zeroRead.validatedAtSeconds }), 'ZERO');
  same(derived, value.zeroBalanceEvidence, 'ZERO'); return derived;
}
async function replayCapture(plan, acquisition, keys, signal) {
  const a = exact(acquisition, ['schema', 'planSha256', 'response', 'headerEvidence', 'raw'], [], 'BEFORE');
  exact(a.raw, ['network', 'entries', 'latest', 'history'], [], 'BEFORE');
  const queue = [['getNetwork', {}, a.raw.network], ['getLedgerEntries', { keys: keys.map(b64) }, a.raw.entries], ['getLatestLedger', {}, a.raw.latest]];
  if (a.raw.history !== null) queue.push(['getLedgers', { startLedger: a.raw.entries.latestLedger, pagination: { limit: 1 } }, a.raw.history]);
  let index = 0, reproduced;
  try { reproduced = await acquirePublicLifecycleSnapshot({ plan, ...(signal ? { signal } : {}), rpc: { async request(method, params) { const row = queue[index++]; check(row && row[0] === method, 'BEFORE'); same(row[1], params, 'BEFORE'); return row[2]; } } }); }
  catch { throw refusal('BEFORE'); }
  check(index === queue.length, 'BEFORE'); same(reproduced, acquisition, 'BEFORE');
}
function economic(snapshot) {
  return { counters: snapshot.counters, records: snapshot.records.map(r => ({ record: r.record, id: r.id, creationLedger: r.creationLedger, preparedLedger: r.preparedLedger, value: r.value })), liabilities: snapshot.liabilities.map(r => ({ asset: r.asset, amount: r.amount })), reserve: snapshot.nativeReserveStroops, principal: snapshot.openPrincipalStroops, accounts: snapshot.accounts };
}
function proof(call, credential, result) {
  const args = call.argsXdr.map(s => xdr.ScVal.fromXDR(s, 'base64'));
  if (!credential) return args;
  exact(result, ['role', 'publicKey', 'payloadSha256', 'signatureHex'], [], 'CREDENTIAL');
  check(result.role === credential.role && result.publicKey === credential.publicKey && result.payloadSha256 === sha(Buffer.from(credential.payloadHex, 'hex')) && typeof result.signatureHex === 'string' && /^[0-9a-f]{128}$/.test(result.signatureHex), 'CREDENTIAL');
  const signature = Buffer.from(result.signatureHex, 'hex'), original = Buffer.from(signature); if (credential.corruptFirstByte) original[0] ^= 1;
  const key = Keypair.fromPublicKey(credential.publicKey);
  check(key.verify(Buffer.from(credential.payloadHex, 'hex'), original) && key.verify(Buffer.from(credential.actualPayloadHex, 'hex'), signature) === (!credential.corruptFirstByte && credential.payloadHex === credential.actualPayloadHex), 'CREDENTIAL');
  args[credential.argumentIndex] = xdr.ScVal.scvBytes(signature); return args;
}

/** `before` is the full baseline-shaped capture; ordinary funded acquisition is
 * wrapped with null zero fields. All capabilities are trusted executable code.
 * Snapshot maps use journal canonical hashes. Raw captures/times remain separate
 * data and do not establish retrospective journal freshness or persistence.
 * Clock checks bracket awaited calls, not an independent90-second timer. A
 * never-settling trusted capability requires caller abort; default RPC calls
 * retain their own timeout. Expired work can never return accepted evidence.
 */
export async function acquirePublicLifecycleObservationCase(options) {
  let signal, callerSignal, onAbort;
  try {
    const input = exact(options, ['plan', 'state', 'before', 'observationKind', 'caseId'], ['observationCredential', 'rpc', 'signal']);
    const state = guarded(() => assertPublicLifecycleDerivedState(input.state), 'STATE'), data = copy({ plan: input.plan, before: input.before, observationKind: input.observationKind, caseId: input.caseId });
    const { plan, before, observationKind, caseId } = data, planSha256 = guarded(() => hashPublicLifecyclePlan(plan), 'PLAN');
    check(state.planSha256 === planSha256 && state.snapshot.codeBytesAuthenticated === true && state.prefixLength === plan.steps.findIndex(s => s.id === state.stepId), 'STATE');
    const stepId = state.stepId, phase = state.phase, head = state.snapshot.ledger, keys = guarded(() => publicLifecycleAcquisitionKeys(plan), 'PLAN');
    const families = guarded(() => publicLifecycleObservationCases({ plan, stepId, phase }), 'SCOPE'); check(families.some(f => f.observationKind === observationKind && f.caseIds.includes(caseId)), 'SCOPE');
    const makeIntent = (ledger, timestamp) => guarded(() => publicLifecycleObservationIntent({ plan, stepId, observationKind, caseId, ledger, timestamp, recordAnchors: state.recordAnchors }), 'CASE');
    const preIntent = makeIntent(head, '1'), enforce = preIntent.authMode === 'enforce' && preIntent.control !== null && ['fade-claim-wrong-source-enforce', 'positive-handoff-wrong-source-enforce', 'pod-recipient-auth-enforce', 'envoy-owner-mismatch-relayer-authorized'].includes(observationKind);
    check(enforce || preIntent.authMode === 'record' && preIntent.control === null, 'MODE');
    callerSignal = input.signal;
    if (callerSignal !== undefined) check(!abortedGetter.call(callerSignal), 'ABORTED');
    // Pass an owned signal downstream: caller instance overrides cannot escape
    // through an imported helper's listener setup or finally cleanup.
    const controller = callerSignal === undefined ? null : new AbortController(); signal = controller?.signal;
    check(!Object.hasOwn(input, 'observationCredential') || typeof input.observationCredential === 'function', 'INPUT'); const credential = input.observationCredential;
    const rpc = Object.hasOwn(input, 'rpc') ? exact(input.rpc, ['request']) : createPublicLifecycleRpc(signal ? { signal } : {}); check(typeof rpc.request === 'function', 'INPUT'); const invoke = rpc.request.bind(input.rpc ?? rpc);
    if (callerSignal !== undefined) check(!abortedGetter.call(callerSignal), 'ABORTED');
    const aborted = signal && new Promise((_, reject) => { onAbort = () => { controller.abort(); reject(refusal('ABORTED')); }; addListener.call(callerSignal, 'abort', onAbort, { once: true }); });
    let deadlineCheck = () => {};
    async function wait(fn, code) {
      check(!signal?.aborted, 'ABORTED'); let result;
      try { const pending = Promise.resolve().then(() => { check(!signal?.aborted, 'ABORTED'); deadlineCheck(); return fn(); }); result = await (aborted ? Promise.race([pending, aborted]) : pending); }
      catch { check(!signal?.aborted, 'ABORTED'); deadlineCheck(); throw refusal(code); }
      check(!signal?.aborted, 'ABORTED'); deadlineCheck(); return result;
    }
    await wait(() => replayCapture(plan, before.acquisition, keys, signal), 'BEFORE');
    const beforeZero = zeroEvidence(plan, before, state, keys); same(beforeZero, state.expected.zeroBalanceEvidence, 'ZERO');
    const beforeSnapshot = guarded(() => verifyPublicLifecycleSnapshot({ plan, expected: state.expected }, before.acquisition.response), 'SNAPSHOT'); same(beforeSnapshot, state.snapshot, 'STATE');
    const reserve = guarded(() => verifyPublicLifecycleHeader({ headerEvidence: before.acquisition.headerEvidence, ledger: head }), 'HEADER'); same(reserve, state.reserve, 'STATE');
    const startedAtSeconds = now(), timestamp = String(startedAtSeconds), maxTime = startedAtSeconds + 90;
    const clock = () => { const current = now(); check(current >= startedAtSeconds && current < maxTime, 'TIME'); check(!signal?.aborted, 'ABORTED'); return current; };
    deadlineCheck = clock;
    const intent = makeIntent(head, timestamp); let signed = null;
    if (intent.credential) {
      check(typeof credential === 'function', 'CREDENTIAL'); signed = copy(await wait(() => credential({ stepId, phase, observationKind, caseId, ledger: head, timestamp, state }), 'CREDENTIAL')); clock();
    }
    const args = guarded(() => proof(intent.call, intent.credential, signed), 'CREDENTIAL');
    const tree = (target, method, values, children = []) => new xdr.SorobanAuthorizedInvocation({ function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new xdr.InvokeContractArgs({ contractAddress: new Address(target).toScAddress(), functionName: method, args: values })), subInvocations: children });
    function requestFor(call, values) {
      const account = Object.values(beforeSnapshot.accounts).find(a => a.address === call.sourceAccount); check(account, 'SOURCE');
      const children = enforce && call.method === 'confirm_handoff' ? [tree(plan.assets[0], 'transfer', [new Address(plan.actors.recipient).toScVal(), new Address(plan.actors.seller).toScVal(), nativeToScVal(1000000n, { type: 'i128' })])] : [];
      const auth = enforce ? [new xdr.SorobanAuthorizationEntry({ credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(), rootInvocation: tree(call.target, call.method, values, children) })] : [];
      const transaction = new TransactionBuilder(new Account(call.sourceAccount, account.sequence), { fee: '100', networkPassphrase: plan.networkPassphrase })
        .addOperation(Operation.invokeContractFunction({ contract: call.target, function: call.method, args: values, auth })).setTimebounds(0, maxTime).build().toXDR();
      return freeze({ transaction, authMode: intent.authMode });
    }
    const request = requestFor(intent.call, args); let controlRequest;
    if (enforce) {
      const controlArgs = intent.control.argsXdr.map(s => xdr.ScVal.fromXDR(s, 'base64'));
      if (intent.credential) controlArgs[intent.credential.argumentIndex] = args[intent.credential.argumentIndex];
      controlRequest = requestFor(intent.control, controlArgs);
    }
    clock();
    const response = copy(await wait(() => invoke('simulateTransaction', request), 'RPC')), responseValidatedAtSeconds = clock(), ledger = response.latestLedger;
    check(Number.isSafeInteger(ledger) && ledger >= head && ledger <= head + 2, 'BRACKET');
    const actual = makeIntent(ledger, timestamp), shape = i => ({ call: i.call, credential: i.credential, expectedError: i.expectedError, authMode: i.authMode, control: i.control }); same(shape(intent), shape(actual), 'INTENT_DRIFT');
    check(guarded(() => publicLifecycleSimulationError(response), 'CASE') === actual.expectedError, 'CASE');
    const caseRequest = { envelopeXdr: request.transaction, authMode: intent.authMode }; let control, controlResponseValidatedAtSeconds;
    if (enforce) {
      const controlResponse = copy(await wait(() => invoke('simulateTransaction', controlRequest), 'RPC')); controlResponseValidatedAtSeconds = clock();
      control = { request: { envelopeXdr: controlRequest.transaction, authMode: 'enforce' }, response: controlResponse };
    }
    guarded(() => verifyPublicLifecycleObservationCase({ plan, stepId, observationKind, caseId, ledger, timestamp, recordAnchors: state.recordAnchors }, { request: caseRequest, response, ...(enforce ? { control } : {}) }), 'CASE');
    const stableRpc = { async request(method, params) { clock(); const raw = await invoke(method, params); clock(); return raw; } }, acquireOptions = { plan, rpc: stableRpc, ...(signal ? { signal } : {}) };
    const after = state.expected.fundedHistory
      ? { acquisition: await wait(() => acquirePublicLifecycleSnapshot(acquireOptions), 'AFTER'), zeroBalanceEvidence: null, zeroRead: null }
      : await wait(() => acquirePublicLifecycleBaseline(acquireOptions), 'AFTER');
    clock(); const afterZero = zeroEvidence(plan, after, state, keys), afterHead = after.acquisition.response.latestLedger;
    check(head <= ledger && ledger <= afterHead && afterHead - head <= 2, 'BRACKET');
    const afterSnapshot = guarded(() => verifyPublicLifecycleSnapshot({ plan, expected: { ...state.expected, minLedger: afterHead, maxLedger: afterHead, zeroBalanceEvidence: afterZero } }, after.acquisition.response), 'SNAPSHOT');
    const afterReserve = guarded(() => verifyPublicLifecycleHeader({ headerEvidence: after.acquisition.headerEvidence, ledger: afterHead }), 'HEADER'); check(afterReserve.baseReserveStroops === reserve.baseReserveStroops, 'UNCHANGED'); same(economic(beforeSnapshot), economic(afterSnapshot), 'UNCHANGED');
    const batch = value => ({ response: value.acquisition.response, headerEvidence: value.acquisition.headerEvidence, zeroBalanceEvidence: value.zeroBalanceEvidence });
    const first = batch(before), last = batch(after), beforeId = sha(canonical(first)), afterId = sha(canonical(last)), completedAtSeconds = clock();
    return copy({ schema: 'agyion-public-lifecycle-observation-acquisition-v1', planSha256, stepId, phase, observationKind,
      case: { caseId, ledger, timestamp, beforeSnapshot: beforeId, afterSnapshot: afterId, request: caseRequest, response, ...(enforce ? { control } : {}) }, snapshots: { [beforeId]: first, [afterId]: last },
      captures: { before: { raw: before.acquisition.raw, zeroRead: before.zeroRead }, after: { raw: after.acquisition.raw, zeroRead: after.zeroRead } }, timing: { startedAtSeconds, responseValidatedAtSeconds, ...(enforce ? { controlResponseValidatedAtSeconds } : {}), completedAtSeconds } });
  } catch (error) { throw refusal(refusals.get(error) ?? 'INPUT'); }
  finally { if (callerSignal && onAbort) removeListener.call(callerSignal, 'abort', onAbort); }
}
