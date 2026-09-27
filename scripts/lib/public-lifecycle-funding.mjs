/** At-most-once fixed Testnet actor bootstrap. A durable role claim precedes all
 * network work, and a durable attempt precedes the single Friendbot request.
 * Recovery only reads the account: it never retries, signs or attributes funds
 * to a transaction. Same-UID/root rollback of private storage is out of scope. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { loadPublicLifecycleRun } from './public-lifecycle-run.mjs';
import { acquirePublicLifecycleFundingAccount } from './public-lifecycle-acquisition.mjs';
import { createPublicLifecycleFriendbot } from './public-lifecycle-friendbot.mjs';
import { verifyPublicLifecycleFundingAccount } from './public-lifecycle-readback.mjs';
import { verifyPublicLifecycleHeader } from './public-lifecycle-state.mjs';
import { claimDeploymentPhase, durableCreate, privateRunDirectory, readPrivateBytes } from './private-deployment.mjs';
const sha = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
class Refusal extends Error { constructor(code) { super(`LIFECYCLE_FUNDING_${code}`); } }
const ensure = (ok, code) => { if (!ok) throw new Refusal(code); };
function exact(value, names) {
  ensure(value && Object.getPrototypeOf(value) === Object.prototype, 'INPUT');
  const d = Object.getOwnPropertyDescriptors(value);
  ensure(Reflect.ownKeys(d).length === names.length && names.every(k => d[k]?.enumerable && Object.hasOwn(d[k], 'value')), 'INPUT');
}
function input(value) {
  exact(value, ['run', 'planSha256', 'role']);
  ensure(typeof value.run === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value.run), 'INPUT');
  ensure(typeof value.planSha256 === 'string' && /^[0-9a-f]{64}$/.test(value.planSha256) && value.planSha256 !== '0'.repeat(64), 'INPUT');
  ensure(value.role === 'recipient' || value.role === 'relayer', 'INPUT');
  return { ...value };
}
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
async function safe(fn) { try { return await fn(); } catch (e) { throw e instanceof Refusal ? e : new Refusal('REFUSED'); } }
function directory(context, role) {
  const dir = privateRunDirectory(context.fundingDirectories[role]);
  ensure(fs.readdirSync(dir).every(name => ['fund.claim', 'fund.attempt.json', 'fund.receipt.json'].includes(name)), 'STORAGE');
  return dir;
}
function capture(context, role, value) {
  exact(value, ['schema', 'planSha256', 'role', 'response', 'headerEvidence', 'raw']);
  ensure(value.schema === 'agyion-public-lifecycle-acquisition-v1' && value.planSha256 === context.planSha256 && value.role === role, 'SCOPE');
  const observed = verifyPublicLifecycleFundingAccount({ plan: context.plan, role }, value.response);
  const reserve = verifyPublicLifecycleHeader({ ledger: observed.ledger, headerEvidence: value.headerEvidence });
  if (observed.account) ensure(BigInt(observed.account.balance) >= BigInt(reserve.minimumBalanceStroops), 'RESERVE');
  return { observed, reserve };
}
function response(context, role, value) {
  exact(value, ['schema', 'provider', 'planSha256', 'role', 'address', 'request', 'httpStatus', 'bodyBase64', 'bodySha256', 'bodyBytes', 'bodyComplete', 'bodyTruncated', 'chainOutcome']);
  const { plan, planSha256 } = context, url = new URL(plan.friendbotUrl); url.searchParams.set('addr', plan.actors[role]);
  exact(value.request, ['method', 'url']);
  ensure(value.schema === 'agyion-public-lifecycle-friendbot-response-v1' && value.provider === plan.friendbotUrl && value.planSha256 === planSha256 && value.role === role && value.address === plan.actors[role] && value.request.method === 'GET' && value.request.url === url.href && value.chainOutcome === 'unknown', 'SCOPE');
  ensure(value.httpStatus === null || (Number.isInteger(value.httpStatus) && value.httpStatus >= 100 && value.httpStatus <= 599), 'RESPONSE');
  ensure(typeof value.bodyBase64 === 'string' && value.bodyBase64.length <= 1398104 && Number.isInteger(value.bodyBytes) && value.bodyBytes >= 0 && value.bodyBytes <= 1048576, 'RESPONSE');
  const bytes = Buffer.from(value.bodyBase64, 'base64');
  ensure(bytes.length === value.bodyBytes && bytes.toString('base64') === value.bodyBase64 && sha(bytes) === value.bodySha256, 'RESPONSE');
  ensure(typeof value.bodyComplete === 'boolean' && typeof value.bodyTruncated === 'boolean' && !(value.bodyComplete && value.bodyTruncated), 'RESPONSE');
  if (value.bodyComplete) new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return value;
}
function accepted(value) {
  ensure(value !== null && value.httpStatus >= 200 && value.httpStatus < 300 && value.bodyComplete === true && value.bodyTruncated === false, 'RESPONSE');
}
function read(dir, name, optional = false) {
  let bytes; try { bytes = readPrivateBytes(path.join(dir, name)); }
  catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
  const value = JSON.parse(bytes.toString('utf8')); ensure(Buffer.from(json(value)).equals(bytes), 'STORAGE'); return value;
}
function scope(context, role, value, schema, names) {
  exact(value, ['schema', 'planSha256', 'role', 'address', ...names]);
  ensure(value.schema === schema && value.planSha256 === context.planSha256 && value.role === role && value.address === context.plan.actors[role], 'SCOPE');
}

export async function fundPublicLifecycleAccount(options) {
  return safe(async () => {
    const selected = input(options), { role } = selected;
    const context = await loadPublicLifecycleRun({ run: selected.run, planSha256: selected.planSha256 });
    const dir = directory(context, role);
    ensure(fs.readdirSync(privateRunDirectory(context.journalRun)).length === 0, 'JOURNAL_STARTED');
    ensure(fs.readdirSync(dir).length === 0, 'CONSUMED');
    claimDeploymentPhase(dir, 'fund', context.planSha256);
    const acquisition = await acquirePublicLifecycleFundingAccount({ plan: context.plan, role });
    const checked = capture(context, role, acquisition); ensure(checked.observed.account === null, 'ACCOUNT_EXISTS');
    durableCreate(dir, 'fund.attempt.json', { schema: 'agyion-public-lifecycle-funding-attempt-v1', planSha256: context.planSha256,
      role, address: context.plan.actors[role], acquisition });
    let raw = null, transportAccepted = false;
    try { raw = response(context, role, await createPublicLifecycleFriendbot().request({ plan: context.plan, role })); accepted(raw); transportAccepted = true; }
    catch (error) {
      // A malformed or missing response is still an unknown chain outcome.
      // Persist only validated fixed-scope evidence, never raw exception text.
      try { if (error?.evidence) raw = response(context, role, error.evidence); } catch { raw = null; }
    }
    durableCreate(dir, 'fund.receipt.json', { schema: 'agyion-public-lifecycle-funding-response-v1', planSha256: context.planSha256,
      role, address: context.plan.actors[role], transportAccepted, response: raw, chainOutcome: 'unknown' });
    return freeze({ schema: 'agyion-public-lifecycle-funding-request-v1', planSha256: context.planSha256, role,
      status: 'outcome-unknown', chainOutcome: 'unknown', transportAccepted, responseRecorded: true,
      boundary: 'One request attempt recorded. Use read-only recovery; account funding and transaction inclusion remain unverified.' });
  });
}

export async function recoverPublicLifecycleFunding(options) {
  return safe(async () => {
    const selected = input(options), { role } = selected;
    const context = await loadPublicLifecycleRun({ run: selected.run, planSha256: selected.planSha256 });
    const dir = directory(context, role), claim = read(dir, 'fund.claim');
    exact(claim, ['schema', 'phase', 'planSha256', 'claimedAt']);
    ensure(claim.schema === 'agyion-private-deployment-claim-v1' && claim.phase === 'fund' && claim.planSha256 === context.planSha256 && typeof claim.claimedAt === 'string' && new Date(claim.claimedAt).toISOString() === claim.claimedAt, 'SCOPE');
    const attempt = read(dir, 'fund.attempt.json', true), receipt = read(dir, 'fund.receipt.json', true);
    ensure(!receipt || attempt, 'STORAGE');
    if (attempt) {
      scope(context, role, attempt, 'agyion-public-lifecycle-funding-attempt-v1', ['acquisition']);
      ensure(capture(context, role, attempt.acquisition).observed.account === null, 'STORAGE');
    }
    if (receipt) {
      scope(context, role, receipt, 'agyion-public-lifecycle-funding-response-v1', ['transportAccepted', 'response', 'chainOutcome']);
      ensure(typeof receipt.transportAccepted === 'boolean' && receipt.chainOutcome === 'unknown' && (!receipt.transportAccepted || receipt.response !== null), 'STORAGE');
      if (receipt.response !== null) response(context, role, receipt.response);
      if (receipt.transportAccepted) accepted(receipt.response);
    }
    const acquisition = await acquirePublicLifecycleFundingAccount({ plan: context.plan, role });
    const checked = capture(context, role, acquisition);
    return freeze({ schema: 'agyion-public-lifecycle-funding-recovery-v1', planSha256: context.planSha256, role,
      status: checked.observed.account === null ? 'account-absent' : 'account-observed',
      attemptRecorded: attempt !== null, responseRecorded: receipt !== null, fundingTransactionAuthenticated: false,
      account: checked.observed.account, reserve: checked.reserve, acquisition,
      boundary: 'Fresh trusted RPC account observation only. No retry, signing, funding-transaction attribution or full lifecycle budget authorization.' });
  });
}
