/** Offline, public-data-only schedule for the already deployed inactive V4.
 * No keys, directories, RPC clients, funding or signing are created here.
 * This schedule is not an executor or an assertion that any case has passed.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const { StrKey } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const KERNEL = 'CA3QJJNHN3TDSU3MYWVLO5N2NGFUBY4AO2J77TRPNHFI5VB5P26USEMZ';
const NATIVE = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const SELLER = 'GBDINNMPHA7LWJDAXS3G3NWCOLYLSPCER2Z4HENF2JE3ZKH7TVLF7PBF';
const ROLES = ['venue', 'podTimelock', 'podMixed', 'attester', 'agent'];
const ensure = (condition, suffix) => { if (!condition) throw Error(`LIFECYCLE_PLAN_${suffix}`); };
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

/** Canonical bounded JSON, without invoking accessors or toJSON hooks. */
function canonical(value, ancestors = new Set(), depth = 0) {
  ensure(depth <= 20, 'DATA');
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') { ensure(value.length <= 65536, 'DATA'); return JSON.stringify(value); }
  if (typeof value === 'number') { ensure(Number.isSafeInteger(value) && !Object.is(value, -0), 'DATA'); return String(value); }
  ensure(typeof value === 'object' && !ancestors.has(value), 'DATA');
  const array = Array.isArray(value);
  ensure(Object.getPrototypeOf(value) === (array ? Array.prototype : Object.prototype) && Object.getOwnPropertySymbols(value).length === 0, 'DATA');
  const descriptors = Object.getOwnPropertyDescriptors(value), names = Object.keys(descriptors);
  ensure(names.length <= 1000, 'DATA');
  ancestors.add(value);
  let encoded;
  if (array) {
    ensure(value.length <= 1000 && names.length === value.length + 1, 'DATA');
    encoded = '[' + Array.from({ length: value.length }, (_, i) => {
      const d = descriptors[String(i)]; ensure(d && Object.hasOwn(d, 'value') && d.enumerable, 'DATA');
      return canonical(d.value, ancestors, depth + 1);
    }).join(',') + ']';
  } else {
    encoded = '{' + names.sort().map(key => {
      const d = descriptors[key]; ensure(Object.hasOwn(d, 'value') && d.enumerable, 'DATA');
      return JSON.stringify(key) + ':' + canonical(d.value, ancestors, depth + 1);
    }).join(',') + '}';
  }
  ancestors.delete(value);
  ensure(Buffer.byteLength(encoded) <= 65536, 'DATA');
  return encoded;
}
function exact(value, keys) {
  ensure(value && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), 'FIELDS');
}
function publicKey(value) {
  ensure(typeof value === 'string' && StrKey.isValidEd25519PublicKey(value), 'PUBLIC_KEY');
  ensure(!StrKey.decodeEd25519PublicKey(value).equals(Buffer.alloc(32)), 'PUBLIC_KEY');
}

function schedule(actors) {
  const rows = [];
  const add = (record, method, sourceRole, terms = {}, requiredObservations = []) => {
    const kind = method === 'transfer' ? 'donation' : 'kernel';
    const id = `${String(rows.length + 1).padStart(2, '0')}-${record}-${method}`;
    const replay = { confirm_handoff: 'fade-handoff-terminal-replay', claim_pod: 'pod-claim-terminal-replay', attest: 'trigger-attest-terminal-replay', refund_trigger: 'trigger-refund-terminal-replay', refund: 'fade-refund-terminal-replay' };
    rows.push({ id, record, kind, target: kind === 'donation' ? NATIVE : KERNEL, method, sourceRole, sourceAccount: actors[sourceRole],
      predecessors: rows.length ? [rows.at(-1).id] : [], requiredObservations, postObservations: replay[method] ? [replay[method]] : [], terms });
  };
  const fade = (record, price, durationLedgers = 120, handoffWindow = 60) => add(record, 'create_fade', 'seller', {
    amount: '10000000', asset: NATIVE, price, slopeNumerator: '0', slopeDenominator: '1', durationLedgers, handoffWindow, credentialRole: 'venue',
  });
  const claim = (record, checks = []) => add(record, 'claim', 'recipient', {}, record === 'fade-negative' ? ['fade-kernel-or-asset-claimant-record-mode', 'fade-claim-wrong-source-enforce', ...checks] : checks);
  const handoff = (record, price, checks = []) => add(record, 'confirm_handoff', price === '1000000' ? 'recipient' : 'relayer', { price, credentialRole: 'venue' }, checks);
  for (const [record, price] of [['fade-negative', '-1000000'], ['fade-zero', '0']]) {
    fade(record, price); claim(record); handoff(record, price, ['fade-second-claim']);
  }
  const grant = (record, maxPerTx, validForLedgers) => add(record, 'create_mandate', 'recipient', { maxPerTx, dailyCap: maxPerTx, validForLedgers, credentialRole: 'agent' });
  grant('grant-capped', '500000', 1000); grant('grant-permissive', '2000000', 1000);
  fade('fade-positive', '1000000');
  claim('fade-positive', ['envoy-capped-positive-price', 'envoy-permissive-positive-price']);
  handoff('fade-positive', '1000000', ['positive-handoff-wrong-source-enforce']);
  add('pod-timelock', 'create_pod', 'seller', { amount: '10000000', asset: NATIVE, unlockOffsetLedgers: 30, credentialRole: 'podTimelock' });
  add('pod-timelock', 'claim_pod', 'recipient', { credentialRole: 'podTimelock' }, ['pod-before-unlock', 'pod-crypto-domain', 'pod-recipient-auth-enforce', 'pod-destination-resigned-after-unlock']);
  const trigger = (record, deadlineOffsetLedgers) => add(record, 'create_trigger', 'seller', { amount: '10000000', asset: NATIVE, beneficiary: actors.recipient, deadlineOffsetLedgers, credentialRole: 'attester' });
  trigger('trigger-execution', 120);
  add('trigger-execution', 'attest', 'relayer', { credentialRole: 'attester' }, ['trigger-crypto-before-attest']);
  trigger('trigger-timeout', 12);
  add('trigger-timeout', 'refund_trigger', 'relayer', {}, ['trigger-early-refund', 'trigger-expired-attest-before-refund']);
  fade('fade-unclaimed', '0', 12, 12);
  add('fade-unclaimed', 'refund', 'relayer', {}, ['fade-unclaimed-early-refund', 'fade-late-claim-before-refund']);
  fade('fade-no-show', '0', 60, 12); claim('fade-no-show');
  add('fade-no-show', 'refund', 'relayer', {}, ['fade-claimed-early-refund', 'fade-late-handoff-before-refund']);
  fade('fade-delegated', '-1000000');
  add('fade-delegated', 'envoy_claim', 'relayer', { mandate: 'grant-capped', credentialRole: 'agent' }, ['envoy-invalid-signature-before-claim']);
  handoff('fade-delegated', '-1000000', ['envoy-replay']);
  add('grant-capped', 'revoke_mandate', 'recipient', {}, ['envoy-owner-mismatch-relayer-authorized']);
  add('grant-permissive', 'revoke_mandate', 'recipient');
  fade('fade-cleanup', '0'); grant('grant-expiry', '2000000', 12);
  claim('fade-cleanup', ['envoy-revoked-before-claim', 'envoy-expired-before-claim']);
  handoff('fade-cleanup', '0');
  fade('fade-mixed', '0', 600, 60);
  add('pod-mixed', 'create_pod', 'seller', { amount: '10000000', asset: NATIVE, unlockOffsetLedgers: 0, credentialRole: 'podMixed' });
  trigger('trigger-mixed', 120);
  add('native-donation', 'transfer', 'seller', { amount: '1', recipient: KERNEL }, ['mixed-three-obligations-backed']);
  claim('fade-mixed'); handoff('fade-mixed', '0');
  add('pod-mixed', 'claim_pod', 'recipient', { credentialRole: 'podMixed' });
  add('trigger-mixed', 'attest', 'relayer', { credentialRole: 'attester' });
  return rows;
}

/** All variable input is public. The original private identity is bound later
 * by the future runner's exact deployment plan check, never opened here. */
export function buildPublicLifecyclePlan(input) {
  canonical(input);
  exact(input, ['preparedAt', 'recipient', 'relayer', 'credentialKeys']);
  exact(input.credentialKeys, ROLES);
  ensure(typeof input.preparedAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.preparedAt) && Number.isFinite(Date.parse(input.preparedAt)) && new Date(input.preparedAt).toISOString() === input.preparedAt, 'TIME');
  const identities = [SELLER, input.recipient, input.relayer, ...ROLES.map(role => input.credentialKeys[role])];
  identities.forEach(publicKey);
  ensure(new Set(identities).size === identities.length, 'SEPARATE_ROLES');
  const actors = { seller: SELLER, recipient: input.recipient, relayer: input.relayer };
  return freeze({ schema: 'agyion-public-v4-lifecycle-plan-v1', testOnly: true, preparedAt: input.preparedAt,
    contractId: KERNEL, wasmSha256: 'd101e0fea1852cf057049cc08695b9e26a8b3c6a82db58d4c2706db03a22b186', protocolVersion: 4,
    networkPassphrase: 'Test SDF Network ; September 2015', rpcUrl: 'https://soroban-testnet.stellar.org', friendbotUrl: 'https://friendbot.stellar.org/',
    assets: [NATIVE, 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA'],
    receiptSha256: '147f532e29ebdaecddf357e3f819a73654d40307140b34a694e73fc92d22338f',
    deploymentManifestSha256: 'e3094fa5482fef6b6efb986d54d2540dcbd5a426c65fc856c1b9565825d0f5fc',
    deploymentPlanSha256: '21fb2aebbebd48c5802e89dadba72a2aaceb3d58642dda2d24bd28ae4471b6b7',
    actors, credentialKeys: { ...input.credentialKeys }, fundingRoles: ['recipient', 'relayer'],
    limits: { perTransactionFeeStroops: '10000000', aggregateFeeStroops: '400000000', outstandingPrincipalStroops: '30000000', grossPrincipalStroops: '130000000', nonFundingTransactions: 39, fundingRequests: 2, maxTimeAheadSeconds: 90 },
    preflightObservations: ['initial-reviewed-code-and-empty-accounting', 'distinct-actor-authority-and-remaining-funds', 'creation-nonpositive-amount', 'fade-floor-below-pot', 'fade-zero-slope-denominator', 'fade-zero-duration-or-handoff', 'fade-excessive-span', 'zero-credential-key', 'trigger-current-past-or-max-deadline', 'trigger-kernel-or-asset-beneficiary', 'unsupported-asset-valid-creation-proof'],
    steps: schedule(actors),
    finalState: { fade: { confirmed: 6, refunded: 2 }, pod: { opened: 2 }, trigger: { executed: 2, refunded: 1 }, mandate: { revoked: 2, expiredUnused: 1 }, liabilities: ['0', '0'], nativeSurplusIncrease: '1' },
    finalObservations: ['all-required-simulations-have-matching-errors-and-prerequisites', 'all-39-original-inclusions-and-fee-metadata-reconciled', 'all-final-records-counters-and-live-ttls', 'both-liabilities-zero-and-native-surplus-increased-by-one', 'original-public-private-and-market-pins-unchanged'],
    evidenceBoundary: 'Planned offline schedule only. No identities, funding, signatures, simulation, inclusion or accounting verification. No application activation or production guarantee.',
  });
}

export function validatePublicLifecyclePlan(plan) {
  const encoded = canonical(plan);
  ensure(plan && !Array.isArray(plan) && plan.actors && plan.credentialKeys, 'FIELDS');
  const expected = buildPublicLifecyclePlan({ preparedAt: plan.preparedAt, recipient: plan.actors.recipient, relayer: plan.actors.relayer, credentialKeys: plan.credentialKeys });
  ensure(encoded === canonical(expected), 'MISMATCH');
  return true;
}

export function hashPublicLifecyclePlan(plan) {
  validatePublicLifecyclePlan(plan);
  return createHash('sha256').update(canonical(plan)).digest('hex');
}
