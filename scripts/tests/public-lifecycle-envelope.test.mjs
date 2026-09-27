import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { validatePublicLifecycleEnvelope, validateSignedPublicLifecycleEnvelope } from '../lib/public-lifecycle-envelope.mjs';
const { Account, Address, Keypair, Networks, Operation, SorobanDataBuilder, TransactionBuilder, nativeToScVal, xdr } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
// Synthetic, never-funded signing fixtures. Production targets are not overridden.
const seller = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 101));
const recipient = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 102));
const relayer = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 103));
const S = seller.publicKey(), R = recipient.publicKey(), L = relayer.publicKey();
const K = 'CA3QJJNHN3TDSU3MYWVLO5N2NGFUBY4AO2J77TRPNHFI5VB5P26USEMZ';
const A = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const OLD = 'CBIIHFELPAKC2KJD4NCJSB32BQO5QUBNEKHBMISFB4MVDKBVM6AJSRXT';
const NOW = 1790500000;
const a = value => new Address(value).toScVal();
const i = value => nativeToScVal(BigInt(value), { type: 'i128' });
const u = value => nativeToScVal(BigInt(value), { type: 'u64' });
const n = value => nativeToScVal(value, { type: 'u32' });
const b = size => xdr.ScVal.scvBytes(Buffer.alloc(size, 7));
const wire = values => values.map(v => v.toXDR('base64'));
const call = (target, method, args) => new xdr.InvokeContractArgs({ contractAddress: new Address(target).toScAddress(), functionName: method, args });
const tree = (target, method, args, children = []) => new xdr.SorobanAuthorizedInvocation({ function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(call(target, method, args)), subInvocations: children });
const sourceAuth = invocation => new xdr.SorobanAuthorizationEntry({ credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(), rootInvocation: invocation });
function fixture(method = 'claim', args = [u(1), a(R)], sourceAccount = R, children = [], required = true, handoff) {
  const step = { kind: 'kernel', target: K, method, sourceAccount, argsXdr: wire(args), ...(handoff ? { handoff } : {}) };
  const auth = required ? [sourceAuth(tree(K, method, args, children))] : [];
  return { step, args, auth };
}
function envelope(f, { mutate, sign, network = Networks.TESTNET } = {}) {
  const op = Operation.invokeContractFunction({ contract: f.step.target, function: f.step.method, args: f.args, auth: f.auth });
  // SDK adds the 900-stroop resource fee to this 100-stroop inclusion fee.
  const tx = new TransactionBuilder(new Account(f.step.sourceAccount, '9'), { fee: '100', networkPassphrase: network })
    .addOperation(op).setSorobanData(new SorobanDataBuilder().setResourceFee('900').build())
    .setTimebounds(0, NOW + 90).build();
  const env = tx.toEnvelope(); if (mutate) mutate(env.v1().tx(), env);
  const result = TransactionBuilder.fromXDR(env.toXDR('base64'), network);
  if (sign) result.sign(sign);
  return result.toXDR();
}
const options = f => ({ step: f.step, sequence: '10', nowSeconds: NOW });
function verify(f, changes) { return validatePublicLifecycleEnvelope({ ...options(f), envelopeXdr: envelope(f, changes) }); }
const deposited = (method, args) => fixture(method, args, S, [tree(A, 'transfer', [a(S), a(K), i(10000000)])]);
function positive() { return fixture('confirm_handoff', [u(1), u(1234), b(64)], R, [tree(A, 'transfer', [a(R), a(S), i(1000000)])], true, { claimant: R, seller: S, price: '1000000' }); }
function donation() {
  const args = [a(S), a(K), i(1)];
  return { step: { kind: 'donation', target: A, method: 'transfer', sourceAccount: S, argsXdr: wire(args) }, args, auth: [sourceAuth(tree(A, 'transfer', args))] };
}

test('accepts exactly derived source authorization for each bounded funding and owner action', () => {
  const fixtures = [
    deposited('create_fade', [a(S), a(A), i(10000000), i(-1000000), i(-1000000), i(0), i(1), n(120), n(60), b(32)]),
    deposited('create_pod', [a(S), a(A), i(10000000), n(12345), b(32), b(64)]),
    deposited('create_trigger', [a(S), a(A), i(10000000), a(R), b(32), n(12345)]),
    fixture(), fixture('claim_pod', [u(1), a(R), b(64)]),
    fixture('create_mandate', [a(R), b(32), i(500000), i(500000), n(12345)]),
    fixture('revoke_mandate', [a(R), u(1)]), positive(), donation(),
  ];
  for (const f of fixtures) {
    const result = verify(f);
    assert.equal(result.sourceAccount, f.step.sourceAccount);
    assert.equal(result.sequence, '10'); assert.equal(result.feeStroops, '1000');
    assert.match(result.hash, /^[0-9a-f]{64}$/); assert.ok(Object.isFrozen(result));
    const missing = { ...f, auth: [] };
    assert.throws(() => verify(missing), /LIFECYCLE_AUTH/);
  }
});

test('permissionless refunds, credentials and nonpositive handoff require empty account auth', () => {
  for (const f of [
    fixture('refund', [u(1)], L, [], false), fixture('refund_trigger', [u(1)], L, [], false),
    fixture('attest', [u(1), u(1234), b(64)], L, [], false),
    fixture('envoy_claim', [u(1), u(2), u(1234), b(64)], L, [], false),
    ...['0', '-1000000'].map(price => fixture('confirm_handoff', [u(1), u(1234), b(64)], L, [], false, { claimant: R, seller: S, price })),
  ]) {
    verify(f);
    assert.throws(() => verify({ ...f, auth: [sourceAuth(tree(K, f.step.method, f.args))] }), /LIFECYCLE_AUTH/);
  }
});

test('source auth is exact, including positive claimant payment and every nested call', () => {
  const f = positive();
  for (const changed of [
    [], [tree(A, 'transfer', [a(R), a(S), i(1000001)])],
    [tree(A, 'transfer', [a(R), a(L), i(1000000)])],
    [tree(OLD, 'transfer', [a(R), a(S), i(1000000)])],
    [tree(A, 'approve', [a(R), a(S), i(1000000)])],
    [tree(A, 'transfer', [a(R), a(S), i(1000000)], [tree(K, 'refund', [u(4)])])],
    [tree(A, 'transfer', [a(R), a(S), i(1000000)]), tree(K, 'refund', [u(4)])],
  ]) assert.throws(() => verify({ ...f, auth: [sourceAuth(tree(K, f.step.method, f.args, changed))] }), /LIFECYCLE_AUTH/);
  assert.throws(() => verify({ ...f, auth: [...f.auth, ...f.auth] }), /LIFECYCLE_AUTH/);
  const foreignRoot = [sourceAuth(tree(OLD, f.step.method, f.args))];
  assert.throws(() => verify({ ...f, auth: foreignRoot }), /LIFECYCLE_AUTH/);
});

test('signed acceptance requires exact unsigned body, one source signature and Testnet domain', () => {
  const f = fixture(), unsignedXdr = envelope(f);
  const input = { ...options(f), unsignedXdr, signedXdr: envelope(f, { sign: recipient }) };
  assert.equal(validateSignedPublicLifecycleEnvelope(input).hash, verify(f).hash);
  for (const signedXdr of [unsignedXdr, envelope(f, { sign: seller }), envelope(f, { sign: recipient, network: Networks.PUBLIC }), envelope(f, { sign: recipient, mutate: body => body.fee(1001) })]) {
    assert.throws(() => validateSignedPublicLifecycleEnvelope({ ...input, signedXdr }), /LIFECYCLE_(SIGNATURE|BODY)/);
  }
});

test('rejects address credentials even when their root invocation matches', () => {
  const f = fixture();
  f.auth[0].credentials(xdr.SorobanCredentials.sorobanCredentialsAddress(new xdr.SorobanAddressCredentials({
    address: new Address(R).toScAddress(), nonce: xdr.Int64.fromString('1'), signatureExpirationLedger: 12345, signature: xdr.ScVal.scvVoid(),
  })));
  assert.throws(() => verify(f), /LIFECYCLE_AUTH/);
});

test('rejects altered operations, source, sequence, fee, memo and preconditions before signing', () => {
  const f = fixture();
  for (const [code, mutate] of [
    ['SOURCE', body => body.sourceAccount(xdr.MuxedAccount.keyTypeEd25519(seller.rawPublicKey()))],
    ['SEQUENCE', body => body.seqNum(xdr.SequenceNumber.fromString('11'))],
    ['FEE', body => body.fee(10000001)], ['FEE', body => body.fee(0)],
    ['RESOURCE', body => body.ext().sorobanData().resourceFee(xdr.Int64.fromString('-1'))],
    ['RESOURCE', body => body.ext().sorobanData().resourceFee(xdr.Int64.fromString('1001'))],
    ['RESOURCE', body => body.ext(new xdr.TransactionExt(0))],
    ['MEMO', body => body.memo(xdr.Memo.memoText('unreviewed'))],
    ['OPERATION', body => body.operations([...body.operations(), ...body.operations()])],
    ['OPERATION', body => body.operations()[0].sourceAccount(xdr.MuxedAccount.keyTypeEd25519(recipient.rawPublicKey()))],
    ['OPERATION', body => body.operations()[0].body().invokeHostFunctionOp().hostFunction().invokeContract().contractAddress(new Address(OLD).toScAddress())],
    ['OPERATION', body => body.operations()[0].body().invokeHostFunctionOp().hostFunction().invokeContract().functionName('refund')],
    ['OPERATION', body => body.operations()[0].body().invokeHostFunctionOp().hostFunction().invokeContract().args([u(2), a(R)])],
    ['TIME', body => body.cond(xdr.Preconditions.precondNone())],
    ['TIME', body => body.cond().timeBounds().maxTime(xdr.TimePoint.fromString('0'))],
    ['TIME', body => body.cond().timeBounds().minTime(xdr.TimePoint.fromString('1'))],
    ['TIME', body => body.cond().timeBounds().maxTime(xdr.TimePoint.fromString(String(NOW)))],
    ['TIME', body => body.cond().timeBounds().maxTime(xdr.TimePoint.fromString(String(NOW + 91)))],
    ['TIME', body => body.cond(xdr.Preconditions.precondV2(new xdr.PreconditionsV2({ timeBounds: body.cond().timeBounds(), ledgerBounds: null, minSeqNum: null, minSeqAge: xdr.Duration.fromString('0'), minSeqLedgerGap: 0, extraSigners: [] })))],
  ]) assert.throws(() => verify(f, { mutate }), new RegExp(`LIFECYCLE_${code}`), code);
});

test('refuses automatic restoration inside resource extensions and explicit restore operations', () => {
  const f = fixture();
  const ext = entries => new xdr.SorobanTransactionDataExt(1, new xdr.SorobanResourcesExtV0({ archivedSorobanEntries: entries }));
  verify(f, { mutate: body => body.ext().sorobanData().ext(ext([])) });
  assert.throws(() => verify(f, { mutate: body => body.ext().sorobanData().ext(ext([0])) }), /LIFECYCLE_RESTORE/);
  assert.throws(() => verify(f, { mutate: body => body.operations([Operation.restoreFootprint({})]) }), /LIFECYCLE_OPERATION/);
  assert.throws(() => validatePublicLifecycleEnvelope({ ...options(f), envelopeXdr: envelope(f), restorePreamble: {} }), /LIFECYCLE_RESTORE/);
  // Unsupported resource extension discriminant in otherwise valid encoded XDR.
  const env = xdr.TransactionEnvelope.fromXDR(envelope(f), 'base64'), raw = env.toXDR();
  const offset = raw.length - env.v1().tx().ext().sorobanData().toXDR().length - 4;
  raw.writeInt32BE(2, offset);
  assert.throws(() => validatePublicLifecycleEnvelope({ ...options(f), envelopeXdr: raw.toString('base64') }), /LIFECYCLE_ENVELOPE/);
});

test('fixed native principal, donation, args schema and positive-source semantics cannot be overridden', () => {
  const good = fixture();
  for (const step of [
    { ...good.step, target: OLD }, { ...good.step, kind: 'other' }, { ...good.step, method: 'get_fade' },
    { ...good.step, argsXdr: wire([n(1), a(R)]) }, { ...good.step, argsXdr: wire([u(0), a(R)]) },
    { ...good.step, argsXdr: wire([u(1), a(S)]) }, { ...good.step, argsXdr: [...good.step.argsXdr, b(32).toXDR('base64')] },
    { ...good.step, handoff: { claimant: R, seller: S, price: '0' } }, { ...good.step, network: Networks.PUBLIC },
  ]) assert.throws(() => validatePublicLifecycleEnvelope({ ...options(good), step, envelopeXdr: envelope(good) }), /LIFECYCLE_STEP/);
  const badFunding = deposited('create_pod', [a(S), a(A), i(10000001), n(12345), b(32), b(64)]);
  assert.throws(() => verify(badFunding), /LIFECYCLE_STEP/);
  const badAsset = deposited('create_pod', [a(S), a(OLD), i(10000000), n(12345), b(32), b(64)]);
  assert.throws(() => verify(badAsset), /LIFECYCLE_STEP/);
  const badDonation = donation(); badDonation.args[2] = i(2); badDonation.step.argsXdr = wire(badDonation.args);
  assert.throws(() => verify(badDonation), /LIFECYCLE_STEP/);
  const handoff = positive(); delete handoff.step.handoff;
  assert.throws(() => verify(handoff), /LIFECYCLE_STEP/);
  const wrongSource = positive(); wrongSource.step.sourceAccount = L;
  assert.throws(() => verify(wrongSource), /LIFECYCLE_STEP/);
});

test('rejects malformed/canonicality/oversize/accessor inputs without evaluating accessors', () => {
  const f = fixture(), input = { ...options(f), envelopeXdr: envelope(f) };
  for (const envelopeXdr of ['', input.envelopeXdr + '\n', input.envelopeXdr + 'AAAA', 'A'.repeat(1024 * 1024 + 1), null]) {
    assert.throws(() => validatePublicLifecycleEnvelope({ ...input, envelopeXdr }), /LIFECYCLE_ENVELOPE/);
  }
  for (const sequence of ['0', '01', 10, '-1', '9223372036854775808']) assert.throws(() => validatePublicLifecycleEnvelope({ ...input, sequence }), /LIFECYCLE_SEQUENCE/);
  for (const nowSeconds of [0, -1, NaN, Infinity, '1790500000']) assert.throws(() => validatePublicLifecycleEnvelope({ ...input, nowSeconds }), /LIFECYCLE_TIME/);
  let invoked = 0;
  const hostile = { ...input }; Object.defineProperty(hostile, 'step', { get() { invoked++; throw Error('untrusted secret'); }, enumerable: true });
  assert.throws(() => validatePublicLifecycleEnvelope(hostile), /LIFECYCLE_INPUT/);
  const hostileStep = { ...f.step }; Object.defineProperty(hostileStep, 'sourceAccount', { get() { invoked++; throw Error('untrusted secret'); }, enumerable: true });
  assert.throws(() => validatePublicLifecycleEnvelope({ ...input, step: hostileStep }), /LIFECYCLE_STEP/);
  assert.equal(invoked, 0);
});

test('signed path cannot accept unsigned pre-signatures, fee-bumps, bad hints or extra signers', () => {
  const f = fixture(), unsignedXdr = envelope(f), signedXdr = envelope(f, { sign: recipient }), input = { ...options(f), unsignedXdr, signedXdr };
  assert.throws(() => validatePublicLifecycleEnvelope({ ...options(f), envelopeXdr: signedXdr }), /LIFECYCLE_SIGNATURE/);
  for (const change of [env => env.v1().signatures().push(...env.v1().signatures()), env => env.v1().signatures()[0].hint(Buffer.alloc(4)), env => env.v1().signatures()[0].signature(Buffer.alloc(64))]) {
    const env = xdr.TransactionEnvelope.fromXDR(signedXdr, 'base64'); change(env);
    assert.throws(() => validateSignedPublicLifecycleEnvelope({ ...input, signedXdr: env.toXDR('base64') }), /LIFECYCLE_SIGNATURE/);
  }
  const inner = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);
  const bumped = TransactionBuilder.buildFeeBumpTransaction(S, '1000', inner, Networks.TESTNET).toXDR();
  assert.throws(() => validateSignedPublicLifecycleEnvelope({ ...input, signedXdr: bumped }), /LIFECYCLE_ENVELOPE/);
  assert.throws(() => validateSignedPublicLifecycleEnvelope({ ...input, nowSeconds: NOW + 90 }), /LIFECYCLE_TIME/);
});

test('non-string method objects are rejected without invoking user-controlled coercion', () => {
  const f = fixture(); let coercions = 0;
  const method = { toString() { coercions++; return 'claim'; } };
  assert.throws(() => validatePublicLifecycleEnvelope({ ...options(f), step: { ...f.step, method }, envelopeXdr: envelope(f) }), /LIFECYCLE_STEP/);
  assert.equal(coercions, 0);
});

test('a valid fee ceiling and empty archival extension still pass while forbidden forms fail', () => {
  const f = fixture();
  assert.equal(verify(f, { mutate: body => { body.fee(10000000); body.ext().sorobanData().resourceFee(xdr.Int64.fromString('9999900')); } }).feeStroops, '10000000');
  const data = { ...options(f), envelopeXdr: envelope(f) };
  const sparse = [...f.step.argsXdr]; delete sparse[0];
  const extra = [...f.step.argsXdr]; extra.unexpected = 'no';
  for (const argsXdr of [sparse, extra, null, [...f.step.argsXdr.slice(0, 1), f.step.argsXdr[1] + '\n']]) {
    assert.throws(() => validatePublicLifecycleEnvelope({ ...data, step: { ...f.step, argsXdr } }), /LIFECYCLE_STEP/);
  }
  const muxed = body => body.sourceAccount(xdr.MuxedAccount.keyTypeMuxedEd25519(new xdr.MuxedAccountMed25519({ id: xdr.Uint64.fromString('5'), ed25519: recipient.rawPublicKey() })));
  assert.throws(() => verify(f, { mutate: muxed }), /LIFECYCLE_SOURCE/);
  const differentAuthArgs = { ...f, auth: [sourceAuth(tree(K, 'claim', [u(2), a(R)]))] };
  assert.throws(() => verify(differentAuthArgs), /LIFECYCLE_AUTH/);
});

test('bounded creation terms cannot smuggle another principal, mutable curve, key or beneficiary', () => {
  const fadeArgs = [a(S), a(A), i(10000000), i(0), i(0), i(0), i(1), n(120), n(60), b(32)];
  for (const [index, value] of [[3, i(1000001)], [4, i(-1)], [5, i(1)], [6, i(0)], [7, n(1000001)], [8, n(0)], [9, xdr.ScVal.scvBytes(Buffer.alloc(32))]]) {
    const args = [...fadeArgs]; args[index] = value;
    assert.throws(() => verify(deposited('create_fade', args)), /LIFECYCLE_STEP/);
  }
  for (const args of [
    [a(S), a(A), i(10000000), a(K), b(32), n(12345)],
    [a(S), a(A), i(10000000), a(S), b(32), n(12345)],
    [a(S), a(A), i(10000000), a(R), b(31), n(12345)],
    [a(S), a(A), i(10000000), a(R), b(32), n(0xffffffff)],
  ]) assert.throws(() => verify(deposited('create_trigger', args)), /LIFECYCLE_STEP/);
  for (const args of [
    [a(R), b(32), i(500001), i(500001), n(12345)],
    [a(R), b(32), i(500000), i(2000000), n(12345)],
    [a(S), b(32), i(500000), i(500000), n(12345)],
  ]) assert.throws(() => verify(fixture('create_mandate', args)), /LIFECYCLE_STEP/);
  const badDonation = donation(); badDonation.args[1] = a(R); badDonation.step.argsXdr = wire(badDonation.args);
  assert.throws(() => verify(badDonation), /LIFECYCLE_STEP/);
});
