/** Concrete journal policies. No injected validator, network or filesystem.
 * Prefix authenticity comes from journal replay; each initial/raw state is
 * independently derived here. Serialized `verified` values are not input.
 * One state/observation pair can share the same fresh, immutable derived state;
 * its complete raw context must match and it is consumed once, never on replay.
 */
import { createHash } from 'node:crypto';
import { hashPublicLifecyclePlan } from './public-lifecycle-plan.mjs';
import { initialPublicLifecycleState, derivePublicLifecycleState } from './public-lifecycle-state.mjs';
import { verifyPublicLifecycleObservations } from './public-lifecycle-observations.mjs';

const MAX = 2 * 1024 * 1024;
const ensure = (ok, code) => { if (!ok) throw Error(`LIFECYCLE_POLICY_${code}`); };
function canonical(value, seen = new Set(), depth = 0) {
  ensure(depth <= 32, 'DATA');
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') { ensure(Buffer.byteLength(value) <= MAX, 'DATA'); return JSON.stringify(value); }
  if (typeof value === 'number') { ensure(Number.isSafeInteger(value) && !Object.is(value, -0), 'DATA'); return String(value); }
  ensure(value && typeof value === 'object' && !seen.has(value), 'DATA');
  const array = Array.isArray(value), descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
  ensure(Object.getPrototypeOf(value) === (array ? Array.prototype : Object.prototype) && keys.length <= 10000 && keys.every(k => typeof k === 'string'), 'DATA');
  seen.add(value); let result;
  if (array) {
    ensure(keys.length === value.length + 1, 'DATA');
    result = '[' + Array.from({ length: value.length }, (_, i) => { const d = descriptors[i]; ensure(d && Object.hasOwn(d, 'value') && d.enumerable, 'DATA'); return canonical(d.value, seen, depth + 1); }).join(',') + ']';
  } else result = '{' + keys.sort().map(k => { const d = descriptors[k]; ensure(Object.hasOwn(d, 'value') && d.enumerable, 'DATA'); return JSON.stringify(k) + ':' + canonical(d.value, seen, depth + 1); }).join(',') + '}';
  seen.delete(value); ensure(Buffer.byteLength(result) <= MAX, 'DATA'); return result;
}
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
const CONTEXT = ['plan', 'planSha256', 'stepId', 'phase', 'claim', 'prefix', 'initialEvidence', 'currentInclusion', 'snapshotResponse', 'headerEvidence', 'beforeSnapshot'];
const contextDigest = value => digest(Object.fromEntries(CONTEXT.map(k => [k, value[k]])));
function same(a, b, code) { ensure(canonical(a) === canonical(b), code); }
function scope(input, extra) {
  const value = JSON.parse(canonical(input));
  const keys = [...CONTEXT, ...extra];
  ensure(value && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k)), 'FIELDS');
  ensure(hashPublicLifecyclePlan(value.plan) === value.planSha256, 'PLAN');
  ensure(value.phase === 'before' || value.phase === 'after', 'PHASE');
  ensure(value.claim?.stepId === value.stepId && Array.isArray(value.prefix) && value.plan.steps.findIndex(s => s.id === value.stepId) === value.prefix.length, 'STEP');
  ensure(value.phase === 'before' ? value.currentInclusion === null : value.currentInclusion?.status === 'SUCCESS', 'INCLUSION');
  return value;
}
const inclusion = value => value === null ? null : { status: value.status, ledger: value.ledger, createdId: value.createdId };
function derive(value) {
  const initial = initialPublicLifecycleState({ plan: value.plan, response: value.initialEvidence.response,
    zeroBalanceEvidence: value.initialEvidence.expected.zeroBalanceEvidence,
    headerEvidence: value.initialEvidence.headerEvidence ?? null });
  const prefix = value.prefix.map(row => ({ stepId: row.stepId, binding: row.binding, inclusion: inclusion(row.inclusion),
    fee: { authorizedFee: row.fee.authorizedFee, netFee: row.fee.netFee },
    after: { ledger: row.after.ledger, accounts: row.after.accounts } }));
  return derivePublicLifecycleState({ plan: value.plan, initial, prefix, stepId: value.stepId,
    binding: value.claim.binding, phase: value.phase, inclusion: inclusion(value.currentInclusion),
    response: value.snapshotResponse, headerEvidence: value.headerEvidence });
}

export function createPublicLifecyclePolicies() {
  ensure(arguments.length === 0, 'OPTIONS');
  let pending = null;
  return Object.freeze({
    verifyStateExpectations(input) {
      pending = null;
      const value = scope(input, ['expected']), state = derive(value);
      same(state.expected, value.expected, 'EXPECTED');
      pending = { key: contextDigest(value), state };
      return { planSha256: value.planSha256, stepId: value.stepId, phase: value.phase, expectedSha256: digest(state.expected) };
    },
    verifyObservations(input) {
      const previous = pending; pending = null;
      const value = scope(input, ['snapshot', 'currentFee', 'rawEvidence']);
      const state = previous?.key === contextDigest(value) ? previous.state : derive(value);
      same(state.snapshot, value.snapshot, 'SNAPSHOT');
      ensure(value.phase === 'before' ? value.currentFee === null : value.currentFee !== null, 'FEE');
      return verifyPublicLifecycleObservations({ plan: value.plan, planSha256: value.planSha256, stepId: value.stepId,
        phase: value.phase, claim: value.claim, currentInclusion: value.currentInclusion,
        initialEvidence: value.initialEvidence, state, verifiedPrefix: value.prefix,
        currentFee: value.currentFee, snapshot: value.snapshot, beforeSnapshot: value.beforeSnapshot, rawEvidence: value.rawEvidence });
    },
  });
}
