/** Pure signing-time validation for the bounded, inactive public V4 lifecycle.
 * No RPC, filesystem, keys, signing or submission. Constants cannot be supplied
 * by callers. This is not a general transaction validator or a recovery API. */
import { createRequire } from 'node:module';
const { Address, Keypair, StrKey, TransactionBuilder, nativeToScVal, xdr } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');

export const PUBLIC_LIFECYCLE_LIMITS = Object.freeze({
  networkPassphrase: 'Test SDF Network ; September 2015',
  contractId: 'CA3QJJNHN3TDSU3MYWVLO5N2NGFUBY4AO2J77TRPNHFI5VB5P26USEMZ',
  nativeAsset: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
  maxFeeStroops: '10000000', principalStroops: '10000000', donationStroops: '1',
  maxSigningHorizonSeconds: 90,
});
const { contractId: KERNEL, nativeAsset: NATIVE, networkPassphrase: TESTNET } = PUBLIC_LIFECYCLE_LIMITS;
class Invalid extends Error { constructor(code) { super(`LIFECYCLE_${code}`); } }
const ensure = (ok, code) => { if (!ok) throw new Invalid(code); };
function guarded(fn) { try { return fn(); } catch (error) { if (error instanceof Invalid) throw error; throw new Invalid('INPUT'); } }
function record(value, required, optional = [], code = 'INPUT') {
  ensure(value && Object.getPrototypeOf(value) === Object.prototype, code);
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
  ensure(keys.every(k => typeof k === 'string' && [...required, ...optional].includes(k)) && required.every(k => Object.hasOwn(descriptors, k)), code);
  const copy = {};
  for (const key of keys) {
    const d = descriptors[key]; ensure(Object.hasOwn(d, 'value') && d.enumerable, code); copy[key] = d.value;
  }
  return copy;
}
function list(value, max, code) {
  ensure(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype, code);
  const d = Object.getOwnPropertyDescriptors(value), length = d.length.value;
  ensure(length <= max && Reflect.ownKeys(d).length === length + 1, code);
  return Array.from({ length }, (_, index) => { const item = d[index]; ensure(item && Object.hasOwn(item, 'value') && item.enumerable, code); return item.value; });
}
function decimal(value, max, code) {
  ensure(typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value), code);
  const n = BigInt(value); ensure(n <= max, code); return n;
}
function account(value, code = 'STEP') {
  ensure(typeof value === 'string' && StrKey.isValidEd25519PublicKey(value) && StrKey.encodeEd25519PublicKey(StrKey.decodeEd25519PublicKey(value)) === value, code);
  return value;
}
function encoded(value, type, max, code) {
  ensure(typeof value === 'string' && value.length > 0 && value.length <= max && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value), code);
  try { const parsed = type.fromXDR(value, 'base64'); ensure(parsed.toXDR('base64') === value, code); return parsed; }
  catch { throw new Invalid(code); }
}
const address = value => new Address(value).toScVal();
const amount = value => nativeToScVal(BigInt(value), { type: 'i128' });
const schemas = Object.freeze({
  create_fade: ['account', 'asset', 'i128', 'i128', 'i128', 'i128', 'i128', 'u32', 'u32', 'bytes32'],
  claim: ['id', 'account'], confirm_handoff: ['id', 'id', 'bytes64'], refund: ['id'],
  create_pod: ['account', 'asset', 'i128', 'u32', 'bytes32', 'bytes64'], claim_pod: ['id', 'account', 'bytes64'],
  create_trigger: ['account', 'asset', 'i128', 'account', 'bytes32', 'u32'], attest: ['id', 'id', 'bytes64'], refund_trigger: ['id'],
  create_mandate: ['account', 'bytes32', 'i128', 'i128', 'u32'], envoy_claim: ['id', 'id', 'id', 'bytes64'], revoke_mandate: ['account', 'id'],
});
function argument(value, kind) {
  const tag = value.switch().name;
  if (kind === 'account' || kind === 'asset') {
    ensure(tag === 'scvAddress', 'STEP'); const id = Address.fromScVal(value).toString();
    return kind === 'account' ? account(id) : (ensure(id === NATIVE, 'STEP'), id);
  }
  if (kind === 'id') { ensure(tag === 'scvU64', 'STEP'); return decimal(value.u64().toString(), (1n << 64n) - 1n, 'STEP'); }
  if (kind === 'u32') { ensure(tag === 'scvU32', 'STEP'); return value.u32(); }
  if (kind === 'i128') { ensure(tag === 'scvI128', 'STEP'); const v = value.i128(); return (BigInt(v.hi().toString()) << 64n) + BigInt(v.lo().toString()); }
  ensure(tag === 'scvBytes' && value.bytes().length === (kind === 'bytes32' ? 32 : 64) && value.bytes().some(byte => byte !== 0), 'STEP');
  return value.bytes();
}
function invocation(target, method, args, children = []) {
  return new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new xdr.InvokeContractArgs({ contractAddress: new Address(target).toScAddress(), functionName: method, args })),
    subInvocations: children,
  });
}
function permitted(value) {
  const step = record(value, ['kind', 'target', 'method', 'argsXdr', 'sourceAccount'], ['handoff'], 'STEP');
  account(step.sourceAccount);
  const args = list(step.argsXdr, 10, 'STEP').map(v => encoded(v, xdr.ScVal, 512, 'STEP'));
  let requiresAuth = false, children = [];
  if (step.kind === 'donation') {
    ensure(step.target === NATIVE && step.method === 'transfer' && !Object.hasOwn(step, 'handoff'), 'STEP');
    const expected = [address(step.sourceAccount), address(KERNEL), amount(1)];
    ensure(args.length === 3 && args.every((v, i) => v.toXDR().equals(expected[i].toXDR())), 'STEP'); requiresAuth = true;
  } else {
    ensure(step.kind === 'kernel' && step.target === KERNEL && typeof step.method === 'string' && Object.hasOwn(schemas, step.method), 'STEP');
    const schema = schemas[step.method]; ensure(args.length === schema.length, 'STEP');
    const values = args.map((v, i) => argument(v, schema[i]));
    ensure(step.method === 'confirm_handoff' || !Object.hasOwn(step, 'handoff'), 'STEP');
    if (['create_fade', 'create_pod', 'create_trigger'].includes(step.method)) {
      ensure(values[0] === step.sourceAccount && values[2] === 10000000n, 'STEP');
      requiresAuth = true; children = [invocation(NATIVE, 'transfer', [address(step.sourceAccount), address(KERNEL), amount(10000000)])];
      if (step.method === 'create_fade') ensure([-1000000n, 0n, 1000000n].includes(values[3]) && values[4] === values[3] && values[5] === 0n && values[6] === 1n && [12, 60, 120, 600].includes(values[7]) && [12, 60].includes(values[8]), 'STEP');
      if (step.method === 'create_trigger') ensure(values[3] !== step.sourceAccount && values[5] > 0 && values[5] < 0xffffffff, 'STEP');
    } else if (step.method === 'claim' || step.method === 'claim_pod') {
      ensure(values[1] === step.sourceAccount, 'STEP'); requiresAuth = true;
    } else if (step.method === 'create_mandate' || step.method === 'revoke_mandate') {
      ensure(values[0] === step.sourceAccount, 'STEP'); requiresAuth = true;
      if (step.method === 'create_mandate') ensure([500000n, 2000000n].includes(values[2]) && values[3] === values[2] && values[4] > 0 && values[4] < 0xffffffff, 'STEP');
    } else if (step.method === 'confirm_handoff') {
      // These public facts must come from the executor's independently validated
      // claimed record, never the simulation's returned authorization tree.
      const h = record(step.handoff, ['claimant', 'seller', 'price'], [], 'STEP');
      account(h.claimant); account(h.seller);
      ensure(h.claimant !== h.seller && ['-1000000', '0', '1000000'].includes(h.price), 'STEP');
      if (h.price === '1000000') {
        ensure(step.sourceAccount === h.claimant, 'STEP'); requiresAuth = true;
        children = [invocation(NATIVE, 'transfer', [address(h.claimant), address(h.seller), amount(h.price)])];
      }
    }
  }
  return { step, args, tree: requiresAuth ? invocation(step.target, step.method, args, children) : null };
}
function parseEnvelope(value) {
  const env = encoded(value, xdr.TransactionEnvelope, 1024 * 1024, 'ENVELOPE');
  ensure(env.switch().name === 'envelopeTypeTx', 'ENVELOPE');
  return env;
}
function check(input, signed = false) {
  const { step, args, tree } = permitted(input.step);
  decimal(input.sequence, (1n << 63n) - 1n, 'SEQUENCE');
  ensure(Number.isSafeInteger(input.nowSeconds) && input.nowSeconds > 0 && input.nowSeconds <= Number.MAX_SAFE_INTEGER - 90, 'TIME');
  ensure(input.restorePreamble === undefined || input.restorePreamble === null, 'RESTORE');
  const env = parseEnvelope(input.envelopeXdr), body = env.v1().tx();
  ensure(body.sourceAccount().switch().name === 'keyTypeEd25519' && StrKey.encodeEd25519PublicKey(body.sourceAccount().ed25519()) === step.sourceAccount, 'SOURCE');
  ensure(body.seqNum().toString() === input.sequence, 'SEQUENCE');
  const fee = BigInt(body.fee()); ensure(fee >= 100n && fee <= 10000000n, 'FEE');
  ensure(body.memo().switch().name === 'memoNone', 'MEMO');
  ensure(body.cond().switch().name === 'precondTime', 'TIME');
  const time = body.cond().timeBounds(), minTime = time.minTime().toString(), maxTime = time.maxTime().toString();
  ensure(minTime === '0' && BigInt(maxTime) > BigInt(input.nowSeconds) && BigInt(maxTime) <= BigInt(input.nowSeconds) + 90n, 'TIME');
  const operations = body.operations(); ensure(operations.length === 1 && !operations[0].sourceAccount() && operations[0].body().switch().name === 'invokeHostFunction', 'OPERATION');
  const op = operations[0].body().invokeHostFunctionOp(), fn = op.hostFunction();
  ensure(fn.switch().name === 'hostFunctionTypeInvokeContract', 'OPERATION');
  const expectedCall = invocation(step.target, step.method, args).function().contractFn();
  ensure(fn.invokeContract().toXDR().equals(expectedCall.toXDR()), 'OPERATION');
  const auth = op.auth();
  if (!tree) ensure(auth.length === 0, 'AUTH');
  else ensure(auth.length === 1 && auth[0].credentials().switch().name === 'sorobanCredentialsSourceAccount' && auth[0].rootInvocation().toXDR().equals(tree.toXDR()), 'AUTH');
  ensure(body.ext().switch() === 1, 'RESOURCE');
  const data = body.ext().sorobanData(), resourceFee = BigInt(data.resourceFee().toString());
  ensure(resourceFee >= 0n && resourceFee <= fee - 100n, 'RESOURCE');
  const ext = data.ext(); ensure(ext.switch() === 0 || ext.switch() === 1, 'RESTORE');
  if (ext.switch() === 1) ensure(ext.resourceExt().archivedSorobanEntries().length === 0, 'RESTORE');
  const tx = TransactionBuilder.fromXDR(input.envelopeXdr, TESTNET), signatures = env.v1().signatures();
  if (signed) {
    const key = Keypair.fromPublicKey(step.sourceAccount);
    ensure(signatures.length === 1 && signatures[0].hint().equals(key.signatureHint()) && key.verify(tx.hash(), signatures[0].signature()), 'SIGNATURE');
  } else ensure(signatures.length === 0, 'SIGNATURE');
  return Object.freeze({ hash: tx.hash().toString('hex'), sourceAccount: step.sourceAccount, sequence: input.sequence, feeStroops: fee.toString(), minTime, maxTime, method: step.method });
}

/** step: {kind, target, method, argsXdr, sourceAccount, handoff?}.
 * handoff: {claimant, seller, price}. It is required only for confirm_handoff.
 * sequence is the intended transaction sequence, a positive canonical decimal.
 * nowSeconds is mandatory signing time; expired envelopes always fail. Standard
 * SDK minTime=0 is required, with no more than 90 seconds remaining. Unsigned
 * XDR has no network field: its hash is calculated in the fixed Testnet domain. */
export function validatePublicLifecycleEnvelope(value) {
  return guarded(() => check(record(value, ['envelopeXdr', 'step', 'sequence', 'nowSeconds'], ['restorePreamble'])));
}

/** Strict pre-send verification, NOT historic receipt/recovery verification.
 * Validates the original unsigned envelope, unchanged signed transaction body,
 * and exactly one genuine source signature over the Testnet transaction hash. */
export function validateSignedPublicLifecycleEnvelope(value) {
  return guarded(() => {
    const input = record(value, ['unsignedXdr', 'signedXdr', 'step', 'sequence', 'nowSeconds'], ['restorePreamble']);
    const common = { step: input.step, sequence: input.sequence, nowSeconds: input.nowSeconds, restorePreamble: input.restorePreamble };
    check({ ...common, envelopeXdr: input.unsignedXdr });
    const unsigned = parseEnvelope(input.unsignedXdr), signed = parseEnvelope(input.signedXdr);
    ensure(unsigned.v1().tx().toXDR().equals(signed.v1().tx().toXDR()), 'BODY');
    return check({ ...common, envelopeXdr: input.signedXdr }, true);
  });
}
