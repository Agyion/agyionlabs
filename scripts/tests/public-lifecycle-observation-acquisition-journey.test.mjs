/** Synthetic 39-state acquisition coverage with independent request/economic
 * expectations. Responses/inclusions are fixtures; pinned WASM authenticates
 * bytes only. No host/live-wire, full fee or complete after-release proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire, registerHooks } from 'node:module';
import { createStateFixture } from './helpers/public-lifecycle-state-fixture.mjs';
const SDK = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const { Address, Keypair, StrKey, nativeToScVal, xdr } = SDK;
const real = process.env.PUBLIC_LIFECYCLE_OBSERVATION_ACQUISITION_WASM === '1';
const readbackURL = new URL('../lib/public-lifecycle-readback.mjs', import.meta.url).href;
const hook = registerHooks({ resolve(specifier, context, next) {
  if (!real && specifier === './public-lifecycle-readback.mjs' && /public-lifecycle-(state|observations|policies|observation-acquisition)\.mjs$/.test(context.parentURL ?? '')) return { url: 'data:text/javascript,' + encodeURIComponent(`export * from ${JSON.stringify(readbackURL)}; import {verifyPublicLifecycleState} from ${JSON.stringify(readbackURL)}; export function verifyPublicLifecycleSnapshot(a,b){return {...verifyPublicLifecycleState(a,b),schema:'agyion-public-v4-lifecycle-snapshot-v1',codeBytesAuthenticated:true};}`), shortCircuit: true };
  return next(specifier, context);
} });
const { acquirePublicLifecycleObservationCase: acquire } = await import('../lib/public-lifecycle-observation-acquisition.mjs');
const S = await import('../lib/public-lifecycle-state.mjs');
const O = await import('../lib/public-lifecycle-observations.mjs');
const { createPublicLifecyclePolicies } = await import('../lib/public-lifecycle-policies.mjs');
const { acquirePublicLifecycleBaseline } = await import('../lib/public-lifecycle-baseline.mjs');
const { createPublicLifecycleRpc } = await import('../lib/public-lifecycle-rpc.mjs');
hook.deregister();
const f = createStateFixture({ realWasm: real }), { plan } = f, journey = f.journey(S);
const MAX = 2 * 1024 * 1024, clockBase = 1800000000, b64 = v => v.toXDR('base64');
const sha = v => createHash('sha256').update(v).digest('hex');
const canonical = v => v && typeof v === 'object' ? Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' : '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}' : JSON.stringify(v);
const D = 'CA3QJJNHN3TDSU3MYWVLO5N2NGFUBY4AO2J77TRPNHFI5VB5P26USEMZ';
const N = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const U = 'CBIIHFELPAKC2KJD4NCJSB32BQO5QUBNEKHBMISFB4MVDKBVM6AJSRXT';
const symbolic = { S: plan.actors.seller, R: plan.actors.recipient, L: plan.actors.relayer, D, N, U };
const a = v => new Address(symbolic[v] ?? v).toScVal(), i = v => nativeToScVal(BigInt(v), { type: 'i128' });
const u = v => xdr.ScVal.scvU32(Number(v)), u64 = v => nativeToScVal(BigInt(v), { type: 'u64' });
const bytes = v => xdr.ScVal.scvBytes(v), key = role => StrKey.decodeEd25519PublicKey(plan.credentialKeys[role]);
const be = (v, size) => { let n = BigInt(v); if (n < 0n) n += 1n << BigInt(size * 8); const out = Buffer.alloc(size); for (let j = size - 1; j >= 0; j--) { out[j] = Number(n & 255n); n >>= 8n; } assert.equal(n, 0n); return out; };
const prefix = (purpose, deployment = D) => Buffer.concat([Buffer.from('agyion:' + purpose + '\0'), Buffer.from(sha('Test SDF Network ; September 2015'), 'hex'), a(deployment).toXDR()]);
const payload = (purpose, fields, deployment = D) => Buffer.concat([prefix(purpose, deployment), ...fields]);
const EXCLUDED = [
  [2, 'fade-claim-wrong-source-enforce', 'source'], [11, 'positive-handoff-wrong-source-enforce', 'source'],
  [13, 'pod-before-unlock', 'locked'], [13, 'pod-recipient-auth-enforce', 'source'],
  [17, 'trigger-early-refund', 'early'], [19, 'fade-unclaimed-early-refund', 'early'],
  [22, 'fade-claimed-early-refund', 'early'], [26, 'envoy-owner-mismatch-relayer-authorized', 'owner'],
];
const CASES = [
  {"step":1,"phase":"before","kind":"creation-nonpositive-amount","caseId":"fade-zero","method":"create_fade","source":"seller","args":"F(amount=0)","error":"C3","proof":"none"},
  {"step":1,"phase":"before","kind":"creation-nonpositive-amount","caseId":"fade-negative","method":"create_fade","source":"seller","args":"F(amount=-1)","error":"C3","proof":"none"},
  {"step":1,"phase":"before","kind":"creation-nonpositive-amount","caseId":"pod-zero","method":"create_pod","source":"seller","args":"P(amount=0)","error":"C3","proof":"none"},
  {"step":1,"phase":"before","kind":"creation-nonpositive-amount","caseId":"pod-negative","method":"create_pod","source":"seller","args":"P(amount=-1)","error":"C3","proof":"none"},
  {"step":1,"phase":"before","kind":"creation-nonpositive-amount","caseId":"trigger-zero","method":"create_trigger","source":"seller","args":"Tg(amount=0)","error":"C3","proof":"none"},
  {"step":1,"phase":"before","kind":"creation-nonpositive-amount","caseId":"trigger-negative","method":"create_trigger","source":"seller","args":"Tg(amount=-1)","error":"C3","proof":"none"},
  {"step":1,"phase":"before","kind":"fade-floor-below-pot","caseId":"floor","method":"create_fade","source":"seller","args":"F(floor=-10000001)","error":"C3","proof":"none"},
  {"step":1,"phase":"before","kind":"fade-zero-slope-denominator","caseId":"denominator","method":"create_fade","source":"seller","args":"F(den=0)","error":"C4","proof":"none"},
  {"step":1,"phase":"before","kind":"fade-zero-duration-or-handoff","caseId":"duration","method":"create_fade","source":"seller","args":"F(duration=0)","error":"C4","proof":"none"},
  {"step":1,"phase":"before","kind":"fade-zero-duration-or-handoff","caseId":"handoff","method":"create_fade","source":"seller","args":"F(handoff=0)","error":"C4","proof":"none"},
  {"step":1,"phase":"before","kind":"fade-excessive-span","caseId":"duration","method":"create_fade","source":"seller","args":"F(duration=1000001)","error":"C12","proof":"none"},
  {"step":1,"phase":"before","kind":"fade-excessive-span","caseId":"handoff","method":"create_fade","source":"seller","args":"F(handoff=1000001)","error":"C12","proof":"none"},
  {"step":1,"phase":"before","kind":"zero-credential-key","caseId":"fade","method":"create_fade","source":"seller","args":"F(key=Z32)","error":"C7","proof":"none"},
  {"step":1,"phase":"before","kind":"zero-credential-key","caseId":"pod","method":"create_pod","source":"seller","args":"P(key=Z32)","error":"C7","proof":"none"},
  {"step":1,"phase":"before","kind":"zero-credential-key","caseId":"trigger","method":"create_trigger","source":"seller","args":"Tg(key=Z32)","error":"C7","proof":"none"},
  {"step":1,"phase":"before","kind":"zero-credential-key","caseId":"mandate","method":"create_mandate","source":"recipient","args":"M(key=Z32)","error":"C7","proof":"none"},
  {"step":1,"phase":"before","kind":"trigger-current-past-or-max-deadline","caseId":"current","method":"create_trigger","source":"seller","args":"Tg(deadline=H)","error":"C12","proof":"none"},
  {"step":1,"phase":"before","kind":"trigger-current-past-or-max-deadline","caseId":"past","method":"create_trigger","source":"seller","args":"Tg(deadline=H-1)","error":"C12","proof":"none"},
  {"step":1,"phase":"before","kind":"trigger-current-past-or-max-deadline","caseId":"max","method":"create_trigger","source":"seller","args":"Tg(deadline=4294967295)","error":"C12","proof":"none"},
  {"step":1,"phase":"before","kind":"trigger-kernel-or-asset-beneficiary","caseId":"kernel","method":"create_trigger","source":"seller","args":"Tg(beneficiary=D)","error":"C12","proof":"none"},
  {"step":1,"phase":"before","kind":"trigger-kernel-or-asset-beneficiary","caseId":"asset","method":"create_trigger","source":"seller","args":"Tg(beneficiary=N)","error":"C12","proof":"none"},
  {"step":1,"phase":"before","kind":"unsupported-asset-valid-creation-proof","caseId":"fade","method":"create_fade","source":"seller","args":"F(asset=U)","error":"C14","proof":"none"},
  {"step":1,"phase":"before","kind":"unsupported-asset-valid-creation-proof","caseId":"pod","method":"create_pod","source":"seller","args":"P(asset=U,sig=sigPC(U,H))","error":"C14","proof":"podTimelock: PC(U,H)"},
  {"step":1,"phase":"before","kind":"unsupported-asset-valid-creation-proof","caseId":"trigger","method":"create_trigger","source":"seller","args":"Tg(asset=U)","error":"C14","proof":"none"},
  {"step":2,"phase":"before","kind":"fade-kernel-or-asset-claimant-record-mode","caseId":"kernel","method":"claim","source":"recipient","args":"[1,D]","error":"C12","proof":"none"},
  {"step":2,"phase":"before","kind":"fade-kernel-or-asset-claimant-record-mode","caseId":"asset","method":"claim","source":"recipient","args":"[1,N]","error":"C12","proof":"none"},
  {"step":3,"phase":"before","kind":"fade-second-claim","caseId":"replay","method":"claim","source":"recipient","args":"[1,R]","error":"C2","proof":"none"},
  {"step":3,"phase":"after","kind":"fade-handoff-terminal-replay","caseId":"replay","method":"confirm_handoff","source":"relayer","args":"[1,ts,sigHV(1,ts)]","error":"C2","proof":"venue: HV(1,ts)"},
  {"step":6,"phase":"before","kind":"fade-second-claim","caseId":"replay","method":"claim","source":"recipient","args":"[2,R]","error":"C2","proof":"none"},
  {"step":6,"phase":"after","kind":"fade-handoff-terminal-replay","caseId":"replay","method":"confirm_handoff","source":"relayer","args":"[2,ts,sigHV(2,ts)]","error":"C2","proof":"venue: HV(2,ts)"},
  {"step":10,"phase":"before","kind":"envoy-capped-positive-price","caseId":"capped","method":"envoy_claim","source":"relayer","args":"[1,3,ts,sigEA(1,3,ts)]","error":"C9","proof":"agent: EA(1,3,ts)"},
  {"step":10,"phase":"before","kind":"envoy-permissive-positive-price","caseId":"permissive","method":"envoy_claim","source":"relayer","args":"[2,3,ts,sigEA(2,3,ts)]","error":"C12","proof":"agent: EA(2,3,ts)"},
  {"step":11,"phase":"after","kind":"fade-handoff-terminal-replay","caseId":"replay","method":"confirm_handoff","source":"recipient","args":"[3,ts,sigHV(3,ts)]","error":"C2","proof":"venue: HV(3,ts)"},
  {"step":13,"phase":"before","kind":"pod-crypto-domain","caseId":"recipient","method":"claim_pod","source":"relayer","args":"[1,L,sig(PC1(R))]","error":"CX","proof":"podTimelock: PC1(R)"},
  {"step":13,"phase":"before","kind":"pod-crypto-domain","caseId":"purpose","method":"claim_pod","source":"recipient","args":"[1,R,sig(PC1wrongPurpose)]","error":"CX","proof":"podTimelock: PC1wrongPurpose"},
  {"step":13,"phase":"before","kind":"pod-crypto-domain","caseId":"deployment","method":"claim_pod","source":"recipient","args":"[1,R,sig(PC1wrongDeployment)]","error":"CX","proof":"podTimelock: PC1wrongDeployment"},
  {"step":13,"phase":"before","kind":"pod-crypto-domain","caseId":"legacy","method":"claim_pod","source":"recipient","args":"[1,R,sig(PC1legacy)]","error":"CX","proof":"podTimelock: PC1legacy"},
  {"step":13,"phase":"before","kind":"pod-destination-resigned-after-unlock","caseId":"kernel","method":"claim_pod","source":"recipient","args":"[1,D,sig(PC1(D))]","error":"C12","proof":"podTimelock: PC1(D)"},
  {"step":13,"phase":"before","kind":"pod-destination-resigned-after-unlock","caseId":"asset","method":"claim_pod","source":"recipient","args":"[1,N,sig(PC1(N))]","error":"C12","proof":"podTimelock: PC1(N)"},
  {"step":13,"phase":"after","kind":"pod-claim-terminal-replay","caseId":"replay","method":"claim_pod","source":"recipient","args":"[1,R,sig(PC1(R))]","error":"C2","proof":"podTimelock: PC1(R)"},
  {"step":15,"phase":"before","kind":"trigger-crypto-before-attest","caseId":"beneficiary","method":"attest","source":"relayer","args":"[1,ts,sig(AT(1,L,ts,D))]","error":"CX","proof":"attester: AT(1,L,ts,D)"},
  {"step":15,"phase":"before","kind":"trigger-crypto-before-attest","caseId":"deployment","method":"attest","source":"relayer","args":"[1,ts,sig(AT(1,R,ts,U))]","error":"CX","proof":"attester: AT(1,R,ts,U)"},
  {"step":15,"phase":"after","kind":"trigger-attest-terminal-replay","caseId":"replay","method":"attest","source":"relayer","args":"[1,ts,sig(AT(1,R,ts,D))]","error":"C2","proof":"attester: AT(1,R,ts,D)"},
  {"step":17,"phase":"before","kind":"trigger-expired-attest-before-refund","caseId":"expired","method":"attest","source":"relayer","args":"[2,ts,sig(AT(2,R,ts,D))]","error":"C5","proof":"attester: AT(2,R,ts,D)"},
  {"step":17,"phase":"after","kind":"trigger-refund-terminal-replay","caseId":"replay","method":"refund_trigger","source":"relayer","args":"[2]","error":"C2","proof":"none"},
  {"step":19,"phase":"before","kind":"fade-late-claim-before-refund","caseId":"late","method":"claim","source":"recipient","args":"[4,R]","error":"C2","proof":"none"},
  {"step":19,"phase":"after","kind":"fade-refund-terminal-replay","caseId":"replay","method":"refund","source":"relayer","args":"[4]","error":"C5","proof":"none"},
  {"step":22,"phase":"before","kind":"fade-late-handoff-before-refund","caseId":"late","method":"confirm_handoff","source":"relayer","args":"[5,ts,sigHV(5,ts)]","error":"C2","proof":"venue: HV(5,ts)"},
  {"step":22,"phase":"after","kind":"fade-refund-terminal-replay","caseId":"replay","method":"refund","source":"relayer","args":"[5]","error":"C5","proof":"none"},
  {"step":24,"phase":"before","kind":"envoy-invalid-signature-before-claim","caseId":"signature","method":"envoy_claim","source":"relayer","args":"[1,6,ts,flip(sigEA(1,6,ts))]","error":"CX","proof":"agent: EA(1,6,ts), flip once"},
  {"step":25,"phase":"before","kind":"envoy-replay","caseId":"replay","method":"envoy_claim","source":"relayer","args":"[1,6,ts,sigEA(1,6,ts)]","error":"C2","proof":"agent: EA(1,6,ts)"},
  {"step":25,"phase":"after","kind":"fade-handoff-terminal-replay","caseId":"replay","method":"confirm_handoff","source":"relayer","args":"[6,ts,sigHV(6,ts)]","error":"C2","proof":"venue: HV(6,ts)"},
  {"step":30,"phase":"before","kind":"envoy-revoked-before-claim","caseId":"revoked","method":"envoy_claim","source":"relayer","args":"[1,7,ts,sigEA(1,7,ts)]","error":"C11","proof":"agent: EA(1,7,ts)"},
  {"step":30,"phase":"before","kind":"envoy-expired-before-claim","caseId":"expired","method":"envoy_claim","source":"relayer","args":"[3,7,ts,sigEA(3,7,ts)]","error":"C10","proof":"agent: EA(3,7,ts)"},
  {"step":31,"phase":"after","kind":"fade-handoff-terminal-replay","caseId":"replay","method":"confirm_handoff","source":"relayer","args":"[7,ts,sigHV(7,ts)]","error":"C2","proof":"venue: HV(7,ts)"},
  {"step":37,"phase":"after","kind":"fade-handoff-terminal-replay","caseId":"replay","method":"confirm_handoff","source":"relayer","args":"[8,ts,sigHV(8,ts)]","error":"C2","proof":"venue: HV(8,ts)"},
  {"step":38,"phase":"after","kind":"pod-claim-terminal-replay","caseId":"replay","method":"claim_pod","source":"recipient","args":"[2,R,sig(PC2(R))]","error":"C2","proof":"podMixed: PC2(R)"},
  {"step":39,"phase":"after","kind":"trigger-attest-terminal-replay","caseId":"replay","method":"attest","source":"relayer","args":"[3,ts,sig(AT(3,R,ts,D))]","error":"C2","proof":"attester: AT(3,R,ts,D)"},
];

// Small, finite table-token decoder. It encodes this independent table only;
// it never derives expected values from the production observation registry.
function signedPayload(token, H, ts) {
  if (token === 'PC(U,H)') return payload('pod-create:v3', [a('S').toXDR(), a('U').toXDR(), be(10000000, 16), be(H + 30, 4), key('podTimelock')]);
  const pod = /^PC([12])\(([RDLN])\)$/.exec(token);
  if (pod) return payload('pod-claim:v3', [be(pod[1], 8), a(pod[2]).toXDR()]);
  if (token === 'PC1wrongPurpose') return payload('handoff:v2', [be(1, 8), a('R').toXDR()]);
  if (token === 'PC1wrongDeployment') return payload('pod-claim:v3', [be(1, 8), a('R').toXDR()], U);
  if (token === 'PC1legacy') return payload('pod-claim:v2', [be(1, 8), a('R').toXDR()]);
  let m = /^HV\((\d+),ts\)$/.exec(token);
  if (m) return payload('handoff:v2', [be(m[1], 8), a('R').toXDR(), be(ts, 8)]);
  m = /^AT\((\d+),([RL]),ts,([DU])\)$/.exec(token);
  if (m) return payload('attest:v2', [be(m[1], 8), a(m[2]).toXDR(), be(ts, 8)], symbolic[m[3]]);
  m = /^EA\((\d+),(\d+),ts\)$/.exec(token);
  if (m) return payload('envoy:v2', [be(m[1], 8), be(m[2], 8), be(ts, 8)]);
  assert.fail('unmapped independent credential token: ' + token);
}
function descriptor(row, H, ts) {
  if (row.proof === 'none') return null;
  const [role, token] = row.proof.split(': '), corrupt = token.endsWith(', flip once');
  const signed = signedPayload(token.replace(', flip once', ''), H, ts);
  let actual = signed;
  if (row.method === 'claim_pod') {
    const parts = row.args.slice(1, -1).split(','); actual = payload('pod-claim:v3', [be(parts[0], 8), a(parts[1]).toXDR()]);
  } else if (row.method === 'attest') {
    const id = row.args.match(/^\[(\d+),/)[1]; actual = payload('attest:v2', [be(id, 8), a('R').toXDR(), be(ts, 8)]);
  }
  return { role, signed, actual, corrupt };
}
function expectedArgs(row, H, ts, signature = Buffer.alloc(64)) {
  const sig = bytes(signature), z = bytes(Buffer.alloc(32));
  if (row.step === 1) {
    const values = Object.fromEntries([...row.args.matchAll(/(amount|floor|den|duration|handoff|key|deadline|beneficiary|asset)=([^,)]+)/g)].map(m => [m[1], m[2]]));
    const number = (name, fallback) => values[name] === 'H' ? H : values[name] === 'H-1' ? H - 1 : Number(values[name] ?? fallback);
    const asset = values.asset ?? 'N';
    if (row.method === 'create_fade') return [a('S'), a(asset), i(number('amount', 10000000)), i(0), i(number('floor', 0)), i(0), i(number('den', 1)), u(number('duration', 120)), u(number('handoff', 60)), values.key ? z : bytes(key('venue'))];
    if (row.method === 'create_pod') return [a('S'), a(asset), i(number('amount', 10000000)), u(H + 30), values.key ? z : bytes(key('podTimelock')), row.proof === 'none' ? bytes(Buffer.alloc(64)) : sig];
    if (row.method === 'create_trigger') return [a('S'), a(asset), i(number('amount', 10000000)), a(values.beneficiary ?? 'R'), values.key ? z : bytes(key('attester')), u(number('deadline', H + 120))];
    if (row.method === 'create_mandate') return [a('R'), z, i(500000), i(500000), u(H + 1000)];
    assert.fail('unknown constructor');
  }
  const parts = row.args.slice(1, -1).split(','), id = parts[0];
  if (row.method === 'claim') return [u64(id), a(parts[1])];
  if (row.method === 'claim_pod') return [u64(id), a(parts[1]), sig];
  if (['confirm_handoff', 'attest'].includes(row.method)) return [u64(id), u64(ts), sig];
  if (row.method === 'envoy_claim') return [u64(id), u64(parts[1]), u64(ts), sig];
  if (['refund', 'refund_trigger'].includes(row.method)) return [u64(id)];
  assert.fail('unknown independent method');
}
function inspectRequest(params, row, head, timestamp, accounts) {
  assert.deepEqual(Object.keys(params).sort(), ['authMode', 'transaction']); assert.equal(params.authMode, 'record');
  const envelope = xdr.TransactionEnvelope.fromXDR(params.transaction, 'base64'); assert.equal(b64(envelope), params.transaction); assert.equal(envelope.switch().name, 'envelopeTypeTx');
  const e = envelope.v1(), tx = e.tx(); assert.equal(e.signatures().length, 0); assert.equal(tx.operations().length, 1); assert.equal(tx.ext().switch(), 0); assert.equal(tx.fee(), 100); assert.equal(tx.memo().switch().name, 'memoNone');
  assert.equal(StrKey.encodeEd25519PublicKey(tx.sourceAccount().ed25519()), plan.actors[row.source]); assert.equal(tx.seqNum().toString(), String(BigInt(accounts[row.source].sequence) + 1n));
  assert.equal(tx.cond().switch().name, 'precondTime'); assert.equal(tx.cond().timeBounds().minTime().toString(), '0'); assert.equal(tx.cond().timeBounds().maxTime().toString(), String(Number(timestamp) + 90));
  const op = tx.operations()[0]; assert.equal(op.sourceAccount() == null, true); assert.equal(op.body().switch().name, 'invokeHostFunction');
  const invoke = op.body().invokeHostFunctionOp(), fn = invoke.hostFunction().invokeContract(); assert.equal(invoke.auth().length, 0); assert.equal(b64(fn.contractAddress()), b64(new Address(D).toScAddress())); assert.equal(fn.functionName().toString(), row.method);
  const c = descriptor(row, head, timestamp); let signature = Buffer.alloc(64);
  if (c) {
    signature = fn.args().at(-1).bytes(); assert.equal(signature.length, 64); const original = Buffer.from(signature); if (c.corrupt) original[0] ^= 1;
    const publicKey = Keypair.fromPublicKey(plan.credentialKeys[c.role]); assert.equal(publicKey.verify(c.signed, original), true); assert.equal(publicKey.verify(c.actual, signature), !c.corrupt && c.actual.equals(c.signed));
  }
  assert.deepEqual(fn.args().map(b64), expectedArgs(row, head, timestamp, signature).map(b64));
}
function wireHeader(head) {
  const h = xdr.LedgerHeader.fromXDR(f.header(head).headerXdr, 'base64'); h.ledgerVersion(28); h.scpValue().closeTime(xdr.Uint64.fromString(String(clockBase + head)));
  const hash = sha(h.toXDR()), entry = new xdr.LedgerHeaderHistoryEntry({ hash: Buffer.from(hash, 'hex'), header: h, ext: new xdr.LedgerHeaderHistoryEntryExt(0) });
  const meta = new xdr.LedgerCloseMeta(0, new xdr.LedgerCloseMetaV0({ ledgerHeader: entry, txSet: new xdr.TransactionSet({ previousLedgerHash: Buffer.alloc(32), txes: [] }), txProcessing: [], upgradesProcessing: [], scpInfo: [] }));
  return { id: hash, sequence: head, protocolVersion: 28, closeTime: String(clockBase + head), headerXdr: b64(h), metadataXdr: b64(meta) };
}
const SOURCES = ['seller','recipient','relayer','seller','recipient','relayer','recipient','recipient','seller','recipient','recipient','seller','recipient','seller','relayer','seller','relayer','seller','relayer','seller','recipient','relayer','seller','relayer','relayer','recipient','recipient','seller','recipient','recipient','relayer','seller','seller','seller','seller','recipient','relayer','recipient','relayer'];
const BUSINESS = [[-10000000,0],[0,0],[9000000,1000000],[-10000000,0],[0,0],[10000000,0],[0,0],[0,0],[-10000000,0],[0,0],[11000000,-1000000],[-10000000,0],[0,10000000],[-10000000,0],[0,10000000],[-10000000,0],[10000000,0],[-10000000,0],[10000000,0],[-10000000,0],[0,0],[10000000,0],[-10000000,0],[0,0],[9000000,1000000],[0,0],[0,0],[-10000000,0],[0,0],[0,0],[10000000,0],[-10000000,0],[-10000000,0],[-10000000,0],[-1,0],[0,0],[10000000,0],[0,10000000],[0,10000000]];
const DEPOSITS = [1,4,9,12,14,16,18,20,23,28,32,33,34], RELEASES = [3,6,11,13,15,17,19,22,25,31,37,38,39];
const CREATES = {Fade:[1,4,9,18,20,23,28,32],Pod:[12,33],Trigger:[14,16,34],Mandate:[7,8,29]};
function economicModel(completed) {
  const balances = [1000000000n,1000000000n,1000000000n], seq = [10,10,10], roles = ['seller','recipient','relayer'];
  for (let i = 0; i < completed; i++) for (let r = 0; r < 3; r++) { balances[r] += BigInt(BUSINESS[i][r] ?? 0); if (SOURCES[i] === roles[r]) { balances[r] -= 100n; seq[r]++; } }
  const principal = 10000000n * BigInt(DEPOSITS.filter(i => i <= completed).length - RELEASES.filter(i => i <= completed).length);
  return { counters: Object.fromEntries(Object.entries(CREATES).map(([type, steps])=>[type,String(steps.filter(n=>n<=completed).length)])), balances: Object.fromEntries(roles.map((r, i) => [r, String(balances[i])])), sequences: Object.fromEntries(roles.map((r, i) => [r, String(seq[i])])), principal: String(principal), reserve: String(principal + (completed >= 35 ? 1n : 0n)) };
}
function assertEconomics(snapshot, model, records) {
  assert.deepEqual(snapshot.counters,model.counters);
  assert.deepEqual(Object.fromEntries(Object.entries(snapshot.accounts).map(([r,a]) => [r,a.balance])), model.balances);
  assert.deepEqual(Object.fromEntries(Object.entries(snapshot.accounts).map(([r,a]) => [r,a.sequence])), model.sequences);
  assert.equal(snapshot.openPrincipalStroops, model.principal); assert.equal(snapshot.nativeReserveStroops, model.reserve);
  assert.deepEqual(snapshot.liabilities.map(v => v.amount), [model.principal, '0']);
  assert.deepEqual(snapshot.records.map(r => ({ record:r.record,id:r.id,creationLedger:r.creationLedger,preparedLedger:r.preparedLedger,value:r.value })), records.map(({record,id,creationLedger,preparedLedger,value}) => ({record,id,creationLedger,preparedLedger,value})));
}
function afterOf(result) { const b = result.snapshots[result.case.afterSnapshot]; return { acquisition: { schema:'agyion-public-lifecycle-acquisition-v1',planSha256:result.planSha256,response:b.response,headerEvidence:b.headerEvidence,raw:result.captures.after.raw },zeroBalanceEvidence:b.zeroBalanceEvidence,zeroRead:result.captures.after.zeroRead }; }
function phaseScope(stage, phase, initialEvidence, binding, before, state) {
  return { plan,planSha256:state.planSha256,stepId:stage.before.stepId,phase,claim:{stepId:stage.before.stepId,binding},prefix:stage.before.prefix,initialEvidence,currentInclusion:phase==='before'?null:stage.after.inclusion,snapshotResponse:before.acquisition.response,headerEvidence:before.acquisition.headerEvidence,beforeSnapshot:null };
}
function transport(model, at, setClock, stats) {
  const target = { head:at, row:null, advance:at, timestamp:null,omitBalance:false,removeBalanceAfter:false };
  const responseAt = head => { const r=f.snapshot(head,model.records,model.accounts,'0',model.completed>=35);if(target.omitBalance)r.entries.splice(6,1);return r; };
  const rpc = createPublicLifecycleRpc({ fetch: async (url, init) => {
    assert.equal(url, 'https://soroban-testnet.stellar.org'); assert.equal(init.redirect, 'manual'); const q = JSON.parse(init.body); let result;
    if (q.method === 'getNetwork') result = { passphrase:plan.networkPassphrase,protocolVersion:28 };
    else if (q.method === 'getLedgerEntries') { const r = responseAt(target.head); result = {latestLedger:r.latestLedger,entries:r.entries.map(({val,...v}) => ({...v,xdr:val}))}; }
    else if (q.method === 'getLatestLedger') result = wireHeader(target.head);
    else if (q.method === 'simulateTransaction') {
      const functionName=xdr.TransactionEnvelope.fromXDR(q.params.transaction,'base64').v1().tx().operations()[0].body().invokeHostFunctionOp().hostFunction().invokeContract().functionName().toString();
      if(functionName==='balance')stats.zeroGetters++;assert.notEqual(functionName,'balance','funded omissions must not trigger a zero getter');
      assert.ok(target.row, 'no unplanned getter or simulation'); inspectRequest(q.params,target.row,target.head,target.timestamp,model.accounts);
      stats.simulations++;stats.sources[target.row.source]++;const error=target.row.error==='CX'?'HostError: Error(Crypto, InvalidInput)':`HostError: Error(Contract, #${target.row.error.slice(1)})`;
      result={latestLedger:target.head,error};target.head=target.advance;target.omitBalance=target.removeBalanceAfter;setClock(target.head);
    } else assert.fail('unplanned transport method '+q.method);
    return new Response(JSON.stringify({jsonrpc:'2.0',id:q.id,result}));
  } });
  return {rpc,target};
}
for (const mode of ['stable', 'forward']) test(`58 independent acquisitions across39 synthetic state transitions: ${mode}`, async t => {
  let nowHead=999,lastHead=999; t.mock.method(Date,'now',()=>(clockBase+nowHead)*1000);
  const initialResponse=f.snapshot(999),wh=wireHeader(999),initialHeader={kind:'latest',ledger:999,hash:wh.id,headerXdr:wh.headerXdr};
  const initial=S.initialPublicLifecycleState({plan,response:initialResponse,headerEvidence:initialHeader,zeroBalanceEvidence:null});
  const initialEvidence={expected:initial.expected,response:initialResponse,headerEvidence:initialHeader};
  const stats={simulations:0,zeroGetters:0,economicPhases:0,sources:{seller:0,recipient:0,relayer:0},credentials:{venue:0,podTimelock:0,podMixed:0,attester:0,agent:0},afterAcquisitions:0,afterFeeRefusals:0,incompleteBefore:0,advanced:0,maxCaseBytes:0,maxRawPhaseBytes:0};
  assert.deepEqual(plan.steps.map(s=>s.sourceRole),SOURCES);assert.deepEqual(Object.fromEntries(['seller','recipient','relayer'].map(r=>[r,SOURCES.filter(v=>v===r).length])),{seller:14,recipient:14,relayer:11});assert.equal(CASES.length,58);
  const seen=[];let highest=0n;
  for(let index=0;index<39;index++)for(const phase of ['before','after']){
    const stage=journey.stages[index],facts=phase==='before'?stage.pre:stage.post,completed=index+(phase==='after'?1:0),model={records:facts.recordAnchors,accounts:facts.snapshot.accounts,completed};
    const expected=CASES.filter(r=>r.step===index+1&&r.phase===phase),base=f.heads[index],windowFloor=({13:1052,17:1071,19:1087,22:1105,30:1132})[index+1]??0;
    let head=phase==='after'?base+1:mode==='forward'&&expected.length?Math.max(base-1,lastHead,windowFloor):base;
    assert.ok(head>=lastHead);nowHead=head;const end=phase==='after'?base+(mode==='forward'?2:1):base;
    const fx=transport(model,head,h=>{nowHead=h;},stats);let before=await acquirePublicLifecycleBaseline({plan,rpc:fx.rpc});
    const derive=at=>{const binding=phase==='before'?f.binding(index,at,model.accounts):stage.before.binding;const state=S.derivePublicLifecycleState({...stage[phase],initial,binding,response:before.acquisition.response,headerEvidence:before.acquisition.headerEvidence});return{state,binding};};
    let {state,binding}=derive(head);assertEconomics(state.snapshot,economicModel(completed),model.records);stats.economicPhases++;highest=BigInt(state.snapshot.openPrincipalStroops)>highest?BigInt(state.snapshot.openPrincipalStroops):highest;const families=O.publicLifecycleObservationCases({plan,stepId:stage.before.stepId,phase});
    const excluded=phase==='before'?EXCLUDED.filter(r=>r[0]===index+1):[];
    assert.deepEqual(families.flatMap(f=>f.caseIds.map(id=>[f.observationKind,id])).filter(([kind,id])=>!excluded.some(r=>r[1]===kind&&r[2]===id)),expected.map(r=>[r.kind,r.caseId]));
    const raw=Object.fromEntries(families.map(f=>[f.observationKind,{cases:[]}])),batches={};
    for(const row of expected){
      const prior=state,previousHead=head;fx.target.row=row;fx.target.timestamp=String(clockBase+head);fx.target.advance=mode==='forward'?Math.min(head+1,end):head;
      const out=await acquire({plan,state,before,observationKind:row.kind,caseId:row.caseId,rpc:fx.rpc,observationCredential:async v=>{
        assert.equal(v.state,prior);assert.equal(v.stepId,stage.before.stepId);assert.equal(v.phase,phase);assert.equal(v.caseId,row.caseId);assert.equal(v.observationKind,row.kind);assert.equal(v.ledger,previousHead);assert.equal(v.timestamp,String(clockBase+previousHead));
        const c=descriptor(row,v.ledger,v.timestamp);assert.ok(c);stats.credentials[c.role]++;const kp=f.keys[f.credentialRoles.indexOf(c.role)+2],sig=kp.sign(c.signed);if(c.corrupt)sig[0]^=1;
        return{role:c.role,publicKey:kp.publicKey(),payloadSha256:sha(c.signed),signatureHex:sig.toString('hex')};
      }});
      assert.equal(out.stepId,stage.before.stepId);assert.equal(out.phase,phase);assert.equal(out.case.caseId,row.caseId);assert.equal(out.case.control,undefined);assert.ok(Object.isFrozen(out.captures.after.raw));
      const size=Buffer.byteLength(canonical(out));assert.ok(size<=MAX);stats.maxCaseBytes=Math.max(stats.maxCaseBytes,size);
      raw[row.kind].cases.push(out.case);Object.assign(batches,out.snapshots);before=afterOf(out);head=before.acquisition.response.latestLedger;
      assert.equal(head-previousHead,mode==='forward'&&previousHead<end?1:0);if(head>previousHead)stats.advanced++;
      if(phase==='before'&&head!==previousHead)assert.throws(()=>S.derivePublicLifecycleState({...stage.before,initial,binding,response:before.acquisition.response,headerEvidence:before.acquisition.headerEvidence}),/LIFECYCLE_STATE_BEFORE/);
      ({state,binding}=derive(head));assertEconomics(state.snapshot,economicModel(completed),model.records);highest=BigInt(state.snapshot.openPrincipalStroops)>highest?BigInt(state.snapshot.openPrincipalStroops):highest;
      if(completed>0){assert.equal(before.zeroRead,null);assert.equal(before.zeroBalanceEvidence,null);}if(phase==='after')stats.afterAcquisitions++;
      seen.push([index+1,phase,row.kind,row.caseId]);
    }
    if(Object.keys(batches).length)raw[families[0].observationKind].snapshots=batches;
    const scoped=phaseScope(stage,phase,initialEvidence,binding,before,state),policies=createPublicLifecyclePolicies();policies.verifyStateExpectations({...scoped,expected:state.expected});
    const obs={...scoped,snapshot:state.snapshot,currentFee:null,rawEvidence:raw};
    if(phase==='after'){
      // All after aggregates, including empty ones, lack authenticated currentFee.
      // No fee schema/hash is fabricated to make this state-only journey pass.
      assert.throws(()=>policies.verifyObservations(obs),/LIFECYCLE_POLICY_FEE/);if(expected.length)stats.afterFeeRefusals++;
    }else if(excluded.length){assert.throws(()=>policies.verifyObservations(obs),/LIFECYCLE_OBSERVATION_CASES/);stats.incompleteBefore++;}
    else{const result=policies.verifyObservations(obs);assert.equal(result.evidence.length,families.length);}
    if(phase==='before')assert.equal(binding.headLedger,base);
    const phaseBytes=Buffer.byteLength(canonical(raw));assert.ok(phaseBytes<=MAX);stats.maxRawPhaseBytes=Math.max(stats.maxRawPhaseBytes,phaseBytes);lastHead=head;
  }
  assert.deepEqual(seen,CASES.map(r=>[r.step,r.phase,r.kind,r.caseId]));assert.equal(stats.simulations,58);assert.equal(stats.zeroGetters,0);assert.equal(stats.economicPhases,78);assert.deepEqual(stats.sources,{seller:23,recipient:14,relayer:21});
  assert.deepEqual(stats.credentials,{venue:7,podTimelock:8,podMixed:1,attester:5,agent:6});assert.equal(stats.afterAcquisitions,13);assert.equal(stats.afterFeeRefusals,13);assert.equal(stats.incompleteBefore,7);assert.equal(stats.advanced,mode==='forward'?21:0);
  const final=economicModel(39);assert.deepEqual(final.balances,{seller:'958998599',recipient:'1040998600',relayer:'999998900'});assert.deepEqual(final.sequences,{seller:'24',recipient:'24',relayer:'21'});assert.equal(final.principal,'0');assert.equal(final.reserve,'1');assert.equal(highest,30000000n);
  const terminal=journey.stages[38].post.snapshot;assert.equal(terminal.records.length,16);assert.deepEqual(terminal.counters,{Fade:'8',Pod:'2',Trigger:'3',Mandate:'3'});assertEconomics(terminal,final,journey.stages[38].post.recordAnchors);
  t.diagnostic(JSON.stringify({mode,executable:real?'pinned-local-wasm':'executable-auth-only-double',...stats,fullAfterAggregateVerified:false,feeMetadataReconciled:false,full66:false,liveRpcCalls:0}));
});

// Funded history includes terminal zero liability; neither absence can use a
// native balance getter. These mutations affect after-capture only, after one
// independently checked negative request; no economic row is fabricated.
test('funded first-record and terminal-zero Balance omissions refuse without a getter', async t => {
  let nowHead=999;t.mock.method(Date,'now',()=>(clockBase+nowHead)*1000);
  const wh=wireHeader(999),initial=S.initialPublicLifecycleState({plan,response:f.snapshot(999),headerEvidence:{kind:'latest',ledger:999,hash:wh.id,headerXdr:wh.headerXdr},zeroBalanceEvidence:null});
  for(const [index,phase] of [[1,'before'],[38,'after']]){
    const stage=journey.stages[index],facts=phase==='before'?stage.pre:stage.post,head=f.heads[index]+(phase==='after'?1:0),model={records:facts.recordAnchors,accounts:facts.snapshot.accounts,completed:index+(phase==='after'?1:0)};
    nowHead=head;const stats={simulations:0,zeroGetters:0,sources:{seller:0,recipient:0,relayer:0}},fx=transport(model,head,h=>{nowHead=h;},stats),before=await acquirePublicLifecycleBaseline({plan,rpc:fx.rpc});
    const state=S.derivePublicLifecycleState({...stage[phase],initial,response:before.acquisition.response,headerEvidence:before.acquisition.headerEvidence});assert.equal(state.expected.fundedHistory,true);assert.equal(state.snapshot.openPrincipalStroops,index===1?'10000000':'0');
    const row=CASES.find(r=>r.step===index+1&&r.phase===phase);fx.target.row=row;fx.target.timestamp=String(clockBase+head);fx.target.removeBalanceAfter=true;
    await assert.rejects(acquire({plan,state,before,observationKind:row.kind,caseId:row.caseId,rpc:fx.rpc,observationCredential:async v=>{
      const c=descriptor(row,v.ledger,v.timestamp),kp=f.keys[f.credentialRoles.indexOf(c.role)+2];return{role:c.role,publicKey:kp.publicKey(),payloadSha256:sha(c.signed),signatureHex:kp.sign(c.signed).toString('hex')};
    }}),/^Error: LIFECYCLE_OBSERVATION_ACQUISITION_ZERO$/);assert.equal(stats.simulations,1);assert.equal(stats.zeroGetters,0);
  }
});
