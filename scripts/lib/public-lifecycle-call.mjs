/** Pure call binding for the fixed, inactive V4 test schedule. No keys, RPC,
 * signing or submission. The executor must independently establish initially
 * empty counters and match every inclusion ID and live record to this schedule.
 * IDs here are expectations, not discoveries or proof of current chain state. */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { validatePublicLifecyclePlan } from './public-lifecycle-plan.mjs';
const { Address, Keypair, StrKey, nativeToScVal, xdr } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const ensure = (ok, code) => { if (!ok) throw Error(`LIFECYCLE_CALL_${code}`); };
const timed = new Set(['confirm_handoff', 'attest', 'envoy_claim']);
const credentialMethods = new Set(['create_pod', 'claim_pod', ...timed]);
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
function input(value, binding) {
  ensure(value && Object.getPrototypeOf(value) === Object.prototype, 'INPUT');
  const d = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(d);
  const required = ['plan', 'stepId', 'headLedger'], allowed = [...required, 'timestamp', ...(binding ? ['signatureHex'] : [])];
  ensure(required.every(k => Object.hasOwn(d, k)) && keys.every(k => typeof k === 'string' && allowed.includes(k) && Object.hasOwn(d[k], 'value') && d[k].enumerable), 'INPUT');
  const data = Object.fromEntries(keys.map(k => [k, d[k].value]));
  validatePublicLifecyclePlan(data.plan);
  ensure(typeof data.stepId === 'string', 'STEP');
  const step = data.plan.steps.find(s => s.id === data.stepId); ensure(step, 'STEP');
  ensure(Number.isSafeInteger(data.headLedger) && data.headLedger > 0 && data.headLedger < 0xffffffff, 'LEDGER');
  if (timed.has(step.method)) {
    ensure(typeof data.timestamp === 'string' && /^[1-9][0-9]{0,19}$/.test(data.timestamp) && BigInt(data.timestamp) < (1n << 64n), 'TIME');
  } else ensure(!Object.hasOwn(data, 'timestamp'), 'INPUT');
  if (!credentialMethods.has(step.method)) ensure(!Object.hasOwn(data, 'signatureHex'), 'INPUT');
  return { data, step };
}
const address = value => new Address(value).toScVal();
const i128 = value => nativeToScVal(BigInt(value), { type: 'i128' });
const u64 = value => nativeToScVal(BigInt(value), { type: 'u64' });
const u32 = value => nativeToScVal(value, { type: 'u32' });
const rawKey = (plan, role) => StrKey.decodeEd25519PublicKey(plan.credentialKeys[role]);
const keyArg = (plan, role) => xdr.ScVal.scvBytes(rawKey(plan, role));
const be64 = value => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(value)); return b; };
const be32 = value => { const b = Buffer.alloc(4); b.writeUInt32BE(value); return b; };
function deadline(head, offset) {
  const value = head + offset;
  ensure(Number.isSafeInteger(value) && value < 0xffffffff, 'LEDGER');
  return value;
}
function creation(plan, record) {
  const step = plan.steps.find(s => s.record === record && s.method.startsWith('create_'));
  ensure(step, 'RECORD');
  // The reviewed plan requires zero counters and rejects unexpected creates.
  const prior = plan.steps.slice(0, plan.steps.indexOf(step) + 1);
  return { step, id: String(prior.filter(s => s.method === step.method).length) };
}
function describe(data, step) {
  const { plan, headLedger: head, timestamp } = data, terms = step.terms;
  const A = plan.actors, asset = plan.assets[0];
  const created = step.kind === 'donation' ? null : creation(plan, step.record);
  const id = created?.id, sourceTerms = created?.step.terms;
  const result = { stepId: step.id, headLedger: head, expectedCreatedId: step.method.startsWith('create_') ? id : null,
    credential: null, businessDeltas: { seller: '0', recipient: '0', relayer: '0' } };
  let args, payload, role;
  const prefix = purpose => Buffer.concat([Buffer.from(`agyion:${purpose}\0`), createHash('sha256').update(plan.networkPassphrase).digest(), address(plan.contractId).toXDR()]);
  switch (step.method) {
    case 'create_fade':
      // Also reject a start ledger whose full lifetime could overflow on chain.
      deadline(deadline(head, terms.durationLedgers), terms.handoffWindow);
      args = [address(A.seller), address(asset), i128(terms.amount), i128(terms.price), i128(terms.price), i128(terms.slopeNumerator), i128(terms.slopeDenominator), u32(terms.durationLedgers), u32(terms.handoffWindow), keyArg(plan, 'venue')];
      result.businessDeltas.seller = '-10000000'; break;
    case 'create_pod': {
      const unlock = deadline(head, terms.unlockOffsetLedgers), amount = Buffer.alloc(16); amount.writeBigUInt64BE(BigInt(terms.amount), 8);
      role = terms.credentialRole;
      payload = Buffer.concat([prefix('pod-create:v3'), address(A.seller).toXDR(), address(asset).toXDR(), amount, be32(unlock), rawKey(plan, role)]);
      args = [address(A.seller), address(asset), i128(terms.amount), u32(unlock), keyArg(plan, role)];
      result.businessDeltas.seller = '-10000000'; break;
    }
    case 'create_trigger':
      args = [address(A.seller), address(asset), i128(terms.amount), address(A.recipient), keyArg(plan, 'attester'), u32(deadline(head, terms.deadlineOffsetLedgers))];
      result.businessDeltas.seller = '-10000000'; break;
    case 'create_mandate':
      args = [address(A.recipient), keyArg(plan, 'agent'), i128(terms.maxPerTx), i128(terms.dailyCap), u32(deadline(head, terms.validForLedgers))]; break;
    case 'claim': args = [u64(id), address(A.recipient)]; break;
    case 'claim_pod':
      role = terms.credentialRole;
      payload = Buffer.concat([prefix('pod-claim:v3'), be64(id), address(A.recipient).toXDR()]);
      args = [u64(id), address(A.recipient)]; result.businessDeltas.recipient = '10000000'; break;
    case 'confirm_handoff': {
      role = 'venue';
      payload = Buffer.concat([prefix('handoff:v2'), be64(id), address(A.recipient).toXDR(), be64(timestamp)]);
      args = [u64(id), u64(timestamp)];
      const price = BigInt(sourceTerms.price);
      result.businessDeltas.seller = String(10000000n + price);
      result.businessDeltas.recipient = String(-price); break;
    }
    case 'attest':
      role = 'attester';
      payload = Buffer.concat([prefix('attest:v2'), be64(id), address(A.recipient).toXDR(), be64(timestamp)]);
      args = [u64(id), u64(timestamp)]; result.businessDeltas.recipient = '10000000'; break;
    case 'refund': case 'refund_trigger':
      args = [u64(id)]; result.businessDeltas.seller = '10000000'; break;
    case 'envoy_claim': {
      role = 'agent'; const grantId = creation(plan, terms.mandate).id;
      payload = Buffer.concat([prefix('envoy:v2'), be64(grantId), be64(id), be64(timestamp)]);
      args = [u64(grantId), u64(id), u64(timestamp)]; break;
    }
    case 'revoke_mandate': args = [address(A.recipient), u64(id)]; break;
    case 'transfer':
      args = [address(A.seller), address(plan.contractId), i128('1')]; result.businessDeltas.seller = '-1'; break;
    default: throw Error('LIFECYCLE_CALL_STEP');
  }
  if (payload) result.credential = { role, publicKey: plan.credentialKeys[role], payloadHex: payload.toString('hex') };
  return { result, args, sourceTerms };
}

/** Public bytes to be signed by the scheduled credential key, never a secret.
 * The returned timestamp is payload-bound only; chain freshness is governed by
 * record deadlines and state transitions, not a wall-clock timestamp check. */
export function publicLifecycleCallIntent(value) {
  const { data, step } = input(value, false);
  return freeze(describe(data, step).result);
}

/** Verifies the credential and produces exact arguments for the envelope gate.
 * A valid binding does not establish that prerequisites hold or permit a send. */
export function bindPublicLifecycleCall(value) {
  const { data, step } = input(value, true), { result, args, sourceTerms } = describe(data, step);
  if (result.credential) {
    ensure(typeof data.signatureHex === 'string' && /^[0-9a-f]{128}$/.test(data.signatureHex), 'SIGNATURE');
    const signature = Buffer.from(data.signatureHex, 'hex');
    ensure(Keypair.fromPublicKey(result.credential.publicKey).verify(Buffer.from(result.credential.payloadHex, 'hex'), signature), 'SIGNATURE');
    args.push(xdr.ScVal.scvBytes(signature));
  }
  const call = { kind: step.kind, target: step.target, method: step.method, sourceAccount: step.sourceAccount, argsXdr: args.map(v => v.toXDR('base64')) };
  if (step.method === 'confirm_handoff') call.handoff = { claimant: data.plan.actors.recipient, seller: data.plan.actors.seller, price: sourceTerms.price };
  return freeze({ ...result, call });
}
