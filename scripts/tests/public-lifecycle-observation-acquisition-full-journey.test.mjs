/** Full observation acquisition journey with controlled synthetic RPC responses.
 * All66 acquisition scopes with chronological early captures and fixed ENFORCE controls.
 * Synthetic transitions/netFee100 remain fixture inputs, NOT journal fee authority.
 * Pinned WASM authenticates local bytes only; no host/live wire or complete journal.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire, registerHooks } from 'node:module';
import { createStateFixture } from './helpers/public-lifecycle-state-fixture.mjs';
const SDK = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const { Account, Address, Operation, SorobanDataBuilder, StrKey, TransactionBuilder, nativeToScVal, xdr } = SDK;
const real = process.env.PUBLIC_LIFECYCLE_OBSERVATION_ACQUISITION_WASM === '1';
const readbackURL = new URL('../lib/public-lifecycle-readback.mjs', import.meta.url).href;
const hook = registerHooks({ resolve(specifier, context, next) {
  if (!real && specifier === './public-lifecycle-readback.mjs' && /public-lifecycle-(state|observations|policies|observation-acquisition)\.mjs$/.test(context.parentURL ?? '')) return { url: 'data:text/javascript,' + encodeURIComponent(`export * from ${JSON.stringify(readbackURL)}; import {verifyPublicLifecycleState} from ${JSON.stringify(readbackURL)}; export function verifyPublicLifecycleSnapshot(a,b){return {...verifyPublicLifecycleState(a,b),schema:'agyion-public-v4-lifecycle-snapshot-v1',codeBytesAuthenticated:true};}`), shortCircuit: true };
  return next(specifier, context);
} });
const { acquirePublicLifecycleObservationCase: acquire, acquirePublicLifecycleEarlyObservationCase: acquireEarly } = await import('../lib/public-lifecycle-observation-acquisition.mjs');
const S = await import('../lib/public-lifecycle-state.mjs');
const O = await import('../lib/public-lifecycle-observations.mjs');
const { createPublicLifecyclePolicies } = await import('../lib/public-lifecycle-policies.mjs');
const { acquirePublicLifecycleBaseline } = await import('../lib/public-lifecycle-baseline.mjs');
const { createPublicLifecycleRpc } = await import('../lib/public-lifecycle-rpc.mjs');
hook.deregister();
const f = createStateFixture({ realWasm: real }), { plan } = f;
const MAX = 2 * 1024 * 1024, b64 = v => v.toXDR('base64');
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
const seconds = head => 1800001000 + (head - 1000) * 5, clone = structuredClone;
const tuple = row => [row.step, row.phase, row.kind, row.caseId];
const CASES = [
  {"step":1,"phase":"before","kind":"creation-nonpositive-amount","caseId":"fade-zero","method":"create_fade","source":"seller","args":"F(amount=0)","error":"C3","proof":"none","acquisition":"ordinary","authMode":"record"},
  {"step":1,"phase":"before","kind":"creation-nonpositive-amount","caseId":"fade-negative","method":"create_fade","source":"seller","args":"F(amount=-1)","error":"C3","proof":"none","acquisition":"ordinary","authMode":"record"},
  {"step":1,"phase":"before","kind":"creation-nonpositive-amount","caseId":"pod-zero","method":"create_pod","source":"seller","args":"P(amount=0)","error":"C3","proof":"none","acquisition":"ordinary","authMode":"record"},
  {"step":1,"phase":"before","kind":"creation-nonpositive-amount","caseId":"pod-negative","method":"create_pod","source":"seller","args":"P(amount=-1)","error":"C3","proof":"none","acquisition":"ordinary","authMode":"record"},
  {"step":1,"phase":"before","kind":"creation-nonpositive-amount","caseId":"trigger-zero","method":"create_trigger","source":"seller","args":"Tg(amount=0)","error":"C3","proof":"none","acquisition":"ordinary","authMode":"record"},
  {"step":1,"phase":"before","kind":"creation-nonpositive-amount","caseId":"trigger-negative","method":"create_trigger","source":"seller","args":"Tg(amount=-1)","error":"C3","proof":"none","acquisition":"ordinary","authMode":"record"},
  {"step":1,"phase":"before","kind":"fade-floor-below-pot","caseId":"floor","method":"create_fade","source":"seller","args":"F(floor=-10000001)","error":"C3","proof":"none","acquisition":"ordinary","authMode":"record"},
  {"step":1,"phase":"before","kind":"fade-zero-slope-denominator","caseId":"denominator","method":"create_fade","source":"seller","args":"F(den=0)","error":"C4","proof":"none","acquisition":"ordinary","authMode":"record"},
  {"step":1,"phase":"before","kind":"fade-zero-duration-or-handoff","caseId":"duration","method":"create_fade","source":"seller","args":"F(duration=0)","error":"C4","proof":"none","acquisition":"ordinary","authMode":"record"},
  {"step":1,"phase":"before","kind":"fade-zero-duration-or-handoff","caseId":"handoff","method":"create_fade","source":"seller","args":"F(handoff=0)","error":"C4","proof":"none","acquisition":"ordinary","authMode":"record"},
  {"step":1,"phase":"before","kind":"fade-excessive-span","caseId":"duration","method":"create_fade","source":"seller","args":"F(duration=1000001)","error":"C12","proof":"none","acquisition":"ordinary","authMode":"record"},
  {"step":1,"phase":"before","kind":"fade-excessive-span","caseId":"handoff","method":"create_fade","source":"seller","args":"F(handoff=1000001)","error":"C12","proof":"none","acquisition":"ordinary","authMode":"record"},
  {"step":1,"phase":"before","kind":"zero-credential-key","caseId":"fade","method":"create_fade","source":"seller","args":"F(key=Z32)","error":"C7","proof":"none","acquisition":"ordinary","authMode":"record"},
  {"step":1,"phase":"before","kind":"zero-credential-key","caseId":"pod","method":"create_pod","source":"seller","args":"P(key=Z32)","error":"C7","proof":"none","acquisition":"ordinary","authMode":"record"},
  {"step":1,"phase":"before","kind":"zero-credential-key","caseId":"trigger","method":"create_trigger","source":"seller","args":"Tg(key=Z32)","error":"C7","proof":"none","acquisition":"ordinary","authMode":"record"},
  {"step":1,"phase":"before","kind":"zero-credential-key","caseId":"mandate","method":"create_mandate","source":"recipient","args":"M(key=Z32)","error":"C7","proof":"none","acquisition":"ordinary","authMode":"record"},
  {"step":1,"phase":"before","kind":"trigger-current-past-or-max-deadline","caseId":"current","method":"create_trigger","source":"seller","args":"Tg(deadline=H)","error":"C12","proof":"none","acquisition":"ordinary","authMode":"record"},
  {"step":1,"phase":"before","kind":"trigger-current-past-or-max-deadline","caseId":"past","method":"create_trigger","source":"seller","args":"Tg(deadline=H-1)","error":"C12","proof":"none","acquisition":"ordinary","authMode":"record"},
  {"step":1,"phase":"before","kind":"trigger-current-past-or-max-deadline","caseId":"max","method":"create_trigger","source":"seller","args":"Tg(deadline=4294967295)","error":"C12","proof":"none","acquisition":"ordinary","authMode":"record"},
  {"step":1,"phase":"before","kind":"trigger-kernel-or-asset-beneficiary","caseId":"kernel","method":"create_trigger","source":"seller","args":"Tg(beneficiary=D)","error":"C12","proof":"none","acquisition":"ordinary","authMode":"record"},
  {"step":1,"phase":"before","kind":"trigger-kernel-or-asset-beneficiary","caseId":"asset","method":"create_trigger","source":"seller","args":"Tg(beneficiary=N)","error":"C12","proof":"none","acquisition":"ordinary","authMode":"record"},
  {"step":1,"phase":"before","kind":"unsupported-asset-valid-creation-proof","caseId":"fade","method":"create_fade","source":"seller","args":"F(asset=U)","error":"C14","proof":"none","acquisition":"ordinary","authMode":"record"},
  {"step":1,"phase":"before","kind":"unsupported-asset-valid-creation-proof","caseId":"pod","method":"create_pod","source":"seller","args":"P(asset=U,sig=sigPC(U,H))","error":"C14","proof":"podTimelock: PC(U,H)","acquisition":"ordinary","authMode":"record"},
  {"step":1,"phase":"before","kind":"unsupported-asset-valid-creation-proof","caseId":"trigger","method":"create_trigger","source":"seller","args":"Tg(asset=U)","error":"C14","proof":"none","acquisition":"ordinary","authMode":"record"},
  {"step":2,"phase":"before","kind":"fade-kernel-or-asset-claimant-record-mode","caseId":"kernel","method":"claim","source":"recipient","args":"[1,D]","error":"C12","proof":"none","acquisition":"ordinary","authMode":"record"},
  {"step":2,"phase":"before","kind":"fade-kernel-or-asset-claimant-record-mode","caseId":"asset","method":"claim","source":"recipient","args":"[1,N]","error":"C12","proof":"none","acquisition":"ordinary","authMode":"record"},
  {"step":2,"phase":"before","kind":"fade-claim-wrong-source-enforce","caseId":"source","method":"claim","source":"relayer","args":"[1,R]","error":"Auth/InvalidAction","proof":"none","acquisition":"ordinary","authMode":"enforce","control":{"source":"recipient","args":"[1,R]"}},
  {"step":3,"phase":"before","kind":"fade-second-claim","caseId":"replay","method":"claim","source":"recipient","args":"[1,R]","error":"C2","proof":"none","acquisition":"ordinary","authMode":"record"},
  {"step":3,"phase":"after","kind":"fade-handoff-terminal-replay","caseId":"replay","method":"confirm_handoff","source":"relayer","args":"[1,ts,sigHV(1,ts)]","error":"C2","proof":"venue: HV(1,ts)","acquisition":"ordinary","authMode":"record"},
  {"step":6,"phase":"before","kind":"fade-second-claim","caseId":"replay","method":"claim","source":"recipient","args":"[2,R]","error":"C2","proof":"none","acquisition":"ordinary","authMode":"record"},
  {"step":6,"phase":"after","kind":"fade-handoff-terminal-replay","caseId":"replay","method":"confirm_handoff","source":"relayer","args":"[2,ts,sigHV(2,ts)]","error":"C2","proof":"venue: HV(2,ts)","acquisition":"ordinary","authMode":"record"},
  {"step":10,"phase":"before","kind":"envoy-capped-positive-price","caseId":"capped","method":"envoy_claim","source":"relayer","args":"[1,3,ts,sigEA(1,3,ts)]","error":"C9","proof":"agent: EA(1,3,ts)","acquisition":"ordinary","authMode":"record"},
  {"step":10,"phase":"before","kind":"envoy-permissive-positive-price","caseId":"permissive","method":"envoy_claim","source":"relayer","args":"[2,3,ts,sigEA(2,3,ts)]","error":"C12","proof":"agent: EA(2,3,ts)","acquisition":"ordinary","authMode":"record"},
  {"step":11,"phase":"before","kind":"positive-handoff-wrong-source-enforce","caseId":"source","method":"confirm_handoff","source":"relayer","args":"[3,ts,sigHV(3,ts)]","error":"Auth/InvalidAction","proof":"venue: HV(3,ts)","acquisition":"ordinary","authMode":"enforce","control":{"source":"recipient","args":"[3,ts,sigHV(3,ts)]","transferChild":{"target":"N","method":"transfer","args":"[R,S,i128(1000000)]"}}},
  {"step":11,"phase":"after","kind":"fade-handoff-terminal-replay","caseId":"replay","method":"confirm_handoff","source":"recipient","args":"[3,ts,sigHV(3,ts)]","error":"C2","proof":"venue: HV(3,ts)","acquisition":"ordinary","authMode":"record"},
  {"step":13,"phase":"before","kind":"pod-before-unlock","caseId":"locked","method":"claim_pod","source":"recipient","args":"[1,R,sig(PC1(R))]","error":"C6","proof":"podTimelock: PC1(R)","acquisition":"early","authMode":"record","captureOrigin":{"step":12,"phase":"after","prefixLength":11,"included":1023,"lastEarly":1051,"targetHead":1052}},
  {"step":13,"phase":"before","kind":"pod-crypto-domain","caseId":"recipient","method":"claim_pod","source":"relayer","args":"[1,L,sig(PC1(R))]","error":"CX","proof":"podTimelock: PC1(R)","acquisition":"ordinary","authMode":"record"},
  {"step":13,"phase":"before","kind":"pod-crypto-domain","caseId":"purpose","method":"claim_pod","source":"recipient","args":"[1,R,sig(PC1wrongPurpose)]","error":"CX","proof":"podTimelock: PC1wrongPurpose","acquisition":"ordinary","authMode":"record"},
  {"step":13,"phase":"before","kind":"pod-crypto-domain","caseId":"deployment","method":"claim_pod","source":"recipient","args":"[1,R,sig(PC1wrongDeployment)]","error":"CX","proof":"podTimelock: PC1wrongDeployment","acquisition":"ordinary","authMode":"record"},
  {"step":13,"phase":"before","kind":"pod-crypto-domain","caseId":"legacy","method":"claim_pod","source":"recipient","args":"[1,R,sig(PC1legacy)]","error":"CX","proof":"podTimelock: PC1legacy","acquisition":"ordinary","authMode":"record"},
  {"step":13,"phase":"before","kind":"pod-recipient-auth-enforce","caseId":"source","method":"claim_pod","source":"relayer","args":"[1,R,sig(PC1(R))]","error":"Auth/InvalidAction","proof":"podTimelock: PC1(R)","acquisition":"ordinary","authMode":"enforce","control":{"source":"recipient","args":"[1,R,sig(PC1(R))]"}},
  {"step":13,"phase":"before","kind":"pod-destination-resigned-after-unlock","caseId":"kernel","method":"claim_pod","source":"recipient","args":"[1,D,sig(PC1(D))]","error":"C12","proof":"podTimelock: PC1(D)","acquisition":"ordinary","authMode":"record"},
  {"step":13,"phase":"before","kind":"pod-destination-resigned-after-unlock","caseId":"asset","method":"claim_pod","source":"recipient","args":"[1,N,sig(PC1(N))]","error":"C12","proof":"podTimelock: PC1(N)","acquisition":"ordinary","authMode":"record"},
  {"step":13,"phase":"after","kind":"pod-claim-terminal-replay","caseId":"replay","method":"claim_pod","source":"recipient","args":"[1,R,sig(PC1(R))]","error":"C2","proof":"podTimelock: PC1(R)","acquisition":"ordinary","authMode":"record"},
  {"step":15,"phase":"before","kind":"trigger-crypto-before-attest","caseId":"beneficiary","method":"attest","source":"relayer","args":"[1,ts,sig(AT(1,L,ts,D))]","error":"CX","proof":"attester: AT(1,L,ts,D)","acquisition":"ordinary","authMode":"record"},
  {"step":15,"phase":"before","kind":"trigger-crypto-before-attest","caseId":"deployment","method":"attest","source":"relayer","args":"[1,ts,sig(AT(1,R,ts,U))]","error":"CX","proof":"attester: AT(1,R,ts,U)","acquisition":"ordinary","authMode":"record"},
  {"step":15,"phase":"after","kind":"trigger-attest-terminal-replay","caseId":"replay","method":"attest","source":"relayer","args":"[1,ts,sig(AT(1,R,ts,D))]","error":"C2","proof":"attester: AT(1,R,ts,D)","acquisition":"ordinary","authMode":"record"},
  {"step":17,"phase":"before","kind":"trigger-early-refund","caseId":"early","method":"refund_trigger","source":"relayer","args":"[2]","error":"C5","proof":"none","acquisition":"early","authMode":"record","captureOrigin":{"step":16,"phase":"after","prefixLength":15,"included":1059,"lastEarly":1070,"targetHead":1071}},
  {"step":17,"phase":"before","kind":"trigger-expired-attest-before-refund","caseId":"expired","method":"attest","source":"relayer","args":"[2,ts,sig(AT(2,R,ts,D))]","error":"C5","proof":"attester: AT(2,R,ts,D)","acquisition":"ordinary","authMode":"record"},
  {"step":17,"phase":"after","kind":"trigger-refund-terminal-replay","caseId":"replay","method":"refund_trigger","source":"relayer","args":"[2]","error":"C2","proof":"none","acquisition":"ordinary","authMode":"record"},
  {"step":19,"phase":"before","kind":"fade-unclaimed-early-refund","caseId":"early","method":"refund","source":"relayer","args":"[4]","error":"C5","proof":"none","acquisition":"early","authMode":"record","captureOrigin":{"step":18,"phase":"after","prefixLength":17,"included":1074,"lastEarly":1086,"targetHead":1087}},
  {"step":19,"phase":"before","kind":"fade-late-claim-before-refund","caseId":"late","method":"claim","source":"recipient","args":"[4,R]","error":"C2","proof":"none","acquisition":"ordinary","authMode":"record"},
  {"step":19,"phase":"after","kind":"fade-refund-terminal-replay","caseId":"replay","method":"refund","source":"relayer","args":"[4]","error":"C5","proof":"none","acquisition":"ordinary","authMode":"record"},
  {"step":22,"phase":"before","kind":"fade-claimed-early-refund","caseId":"early","method":"refund","source":"relayer","args":"[5]","error":"C5","proof":"none","acquisition":"early","authMode":"record","captureOrigin":{"step":21,"phase":"after","prefixLength":20,"included":1092,"lastEarly":1104,"targetHead":1105}},
  {"step":22,"phase":"before","kind":"fade-late-handoff-before-refund","caseId":"late","method":"confirm_handoff","source":"relayer","args":"[5,ts,sigHV(5,ts)]","error":"C2","proof":"venue: HV(5,ts)","acquisition":"ordinary","authMode":"record"},
  {"step":22,"phase":"after","kind":"fade-refund-terminal-replay","caseId":"replay","method":"refund","source":"relayer","args":"[5]","error":"C5","proof":"none","acquisition":"ordinary","authMode":"record"},
  {"step":24,"phase":"before","kind":"envoy-invalid-signature-before-claim","caseId":"signature","method":"envoy_claim","source":"relayer","args":"[1,6,ts,flip(sigEA(1,6,ts))]","error":"CX","proof":"agent: EA(1,6,ts), flip once","acquisition":"ordinary","authMode":"record"},
  {"step":25,"phase":"before","kind":"envoy-replay","caseId":"replay","method":"envoy_claim","source":"relayer","args":"[1,6,ts,sigEA(1,6,ts)]","error":"C2","proof":"agent: EA(1,6,ts)","acquisition":"ordinary","authMode":"record"},
  {"step":25,"phase":"after","kind":"fade-handoff-terminal-replay","caseId":"replay","method":"confirm_handoff","source":"relayer","args":"[6,ts,sigHV(6,ts)]","error":"C2","proof":"venue: HV(6,ts)","acquisition":"ordinary","authMode":"record"},
  {"step":26,"phase":"before","kind":"envoy-owner-mismatch-relayer-authorized","caseId":"owner","method":"revoke_mandate","source":"relayer","args":"[L,1]","error":"C11","proof":"none","acquisition":"ordinary","authMode":"enforce","control":{"source":"recipient","args":"[R,1]"}},
  {"step":30,"phase":"before","kind":"envoy-revoked-before-claim","caseId":"revoked","method":"envoy_claim","source":"relayer","args":"[1,7,ts,sigEA(1,7,ts)]","error":"C11","proof":"agent: EA(1,7,ts)","acquisition":"ordinary","authMode":"record"},
  {"step":30,"phase":"before","kind":"envoy-expired-before-claim","caseId":"expired","method":"envoy_claim","source":"relayer","args":"[3,7,ts,sigEA(3,7,ts)]","error":"C10","proof":"agent: EA(3,7,ts)","acquisition":"ordinary","authMode":"record"},
  {"step":31,"phase":"after","kind":"fade-handoff-terminal-replay","caseId":"replay","method":"confirm_handoff","source":"relayer","args":"[7,ts,sigHV(7,ts)]","error":"C2","proof":"venue: HV(7,ts)","acquisition":"ordinary","authMode":"record"},
  {"step":37,"phase":"after","kind":"fade-handoff-terminal-replay","caseId":"replay","method":"confirm_handoff","source":"relayer","args":"[8,ts,sigHV(8,ts)]","error":"C2","proof":"venue: HV(8,ts)","acquisition":"ordinary","authMode":"record"},
  {"step":38,"phase":"after","kind":"pod-claim-terminal-replay","caseId":"replay","method":"claim_pod","source":"recipient","args":"[2,R,sig(PC2(R))]","error":"C2","proof":"podMixed: PC2(R)","acquisition":"ordinary","authMode":"record"},
  {"step":39,"phase":"after","kind":"trigger-attest-terminal-replay","caseId":"replay","method":"attest","source":"relayer","args":"[3,ts,sig(AT(3,R,ts,D))]","error":"C2","proof":"attester: AT(3,R,ts,D)","acquisition":"ordinary","authMode":"record"}
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
  if (row.method === 'revoke_mandate') return [a(parts[0]), u64(parts[1])];
  assert.fail('unknown independent method');
}
function wireHeader(head) {
  const h = xdr.LedgerHeader.fromXDR(f.header(head).headerXdr, 'base64'); h.ledgerVersion(28); h.scpValue().closeTime(xdr.Uint64.fromString(String(seconds(head))));
  const hash = sha(h.toXDR()), entry = new xdr.LedgerHeaderHistoryEntry({ hash: Buffer.from(hash, 'hex'), header: h, ext: new xdr.LedgerHeaderHistoryEntryExt(0) });
  const meta = new xdr.LedgerCloseMeta(0, new xdr.LedgerCloseMetaV0({ ledgerHeader: entry, txSet: new xdr.TransactionSet({ previousLedgerHash: Buffer.alloc(32), txes: [] }), txProcessing: [], upgradesProcessing: [], scpInfo: [] }));
  return { id: hash, sequence: head, protocolVersion: 28, closeTime: String(seconds(head)), headerXdr: b64(h), metadataXdr: b64(meta) };
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
// Construct complete expected requests before the transport receives them. No
// production intent, request echo or historical-observation helper is an oracle.
function caseOracle(row, state, head, stats) {
  const timestamp = String(seconds(head)), c = descriptor(row, head, timestamp);
  const kp = c ? f.keys[f.credentialRoles.indexOf(c.role) + 2] : null;
  const signature = c ? kp.sign(c.signed) : Buffer.alloc(64); if (c?.corrupt) signature[0] ^= 1;
  if (c) { assert.equal(kp.publicKey(),plan.credentialKeys[c.role]); const original = Buffer.from(signature); if (c.corrupt) original[0] ^= 1; assert.equal(kp.verify(c.signed, original), true); assert.equal(kp.verify(c.actual, signature), !c.corrupt && c.actual.equals(c.signed)); }
  const tree = (target, method, args, children = []) => new xdr.SorobanAuthorizedInvocation({ function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new xdr.InvokeContractArgs({contractAddress:new Address(target).toScAddress(),functionName:method,args})),subInvocations:children });
  function request(control) {
    const spec = control ? {...row,...row.control} : row, args = expectedArgs(spec, head, timestamp, signature);
    const child = row.control?.transferChild;
    if (child) assert.deepEqual(child,{target:'N',method:'transfer',args:'[R,S,i128(1000000)]'});
    const children = child ? [tree(N,'transfer',[a('R'),a('S'),i(1000000)])] : [];
    const auth = row.authMode === 'enforce' ? [new xdr.SorobanAuthorizationEntry({credentials:xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),rootInvocation:tree(D,row.method,args,children)})] : [];
    const source = plan.actors[spec.source], account = state.snapshot.accounts[spec.source];
    const transaction = new TransactionBuilder(new Account(source,account.sequence),{fee:'100',networkPassphrase:'Test SDF Network ; September 2015'})
      .addOperation(Operation.invokeContractFunction({contract:D,function:row.method,args,auth})).setTimebounds(0,Number(timestamp)+90).build().toXDR();
    return {params:{transaction,authMode:row.authMode},auth:auth.map(b64),source:spec.source,control};
  }
  const requests = [request(false),...(row.control ? [request(true)] : [])]; let credentialCalls = 0;
  return {row,head,timestamp,requests,get credentialCalls(){return credentialCalls;},async credential(value) {
    assert.ok(c,'a no-credential observation cannot call the signer'); assert.equal(++credentialCalls,1,'one proof is reused by its control');
    assert.equal(value.state,state); assert.equal(value.stepId,plan.steps[row.step-1].id); assert.equal(value.phase,row.phase);
    assert.equal(value.observationKind,row.kind); assert.equal(value.caseId,row.caseId); assert.equal(value.ledger,head); assert.equal(value.timestamp,timestamp);
    stats.credentials[c.role]++; return {role:c.role,publicKey:kp.publicKey(),payloadSha256:sha(c.signed),signatureHex:signature.toString('hex')};
  }};
}
function rawError(row) { return row.error === 'CX' ? 'HostError: Error(Crypto, InvalidInput)' : row.error === 'Auth/InvalidAction' ? 'HostError: Error(Auth, InvalidAction)' : `HostError: Error(Contract, #${row.error.slice(1)})`; }
function transport(model, clock, stats) {
  let pending = []; const calls = [], reads = [];
  const rpc = createPublicLifecycleRpc({fetch:async(url,init)=>{
    assert.equal(url,'https://soroban-testnet.stellar.org'); assert.equal(init.redirect,'manual');
    const q=JSON.parse(init.body); calls.push(q.method); let result;
    if(q.method==='simulateTransaction') {
      const expected=pending.shift(); assert.ok(expected,'no unplanned getter, simulation or retry');
      assert.equal(model.head,expected.oracle.head); assert.deepEqual(q.params,expected.request.params);
      const fn=xdr.TransactionEnvelope.fromXDR(q.params.transaction,'base64').v1().tx().operations()[0].body().invokeHostFunctionOp().hostFunction().invokeContract().functionName().toString();
      if(fn==='balance')stats.zeroGetters++; assert.notEqual(fn,'balance','funded and terminal-zero captures cannot use a getter');
      stats.simulations++; stats.sources[expected.request.source]++;
      if(expected.request.control) {
        stats.controls++; stats.controlSources[expected.request.source]++;
        result={latestLedger:model.head,transactionData:b64(new SorobanDataBuilder().setResourceFee('100').build()),minResourceFee:'100',results:[{xdr:b64(xdr.ScVal.scvVoid()),auth:expected.request.auth}]};
      } else { stats.negatives++;stats.negativeSources[expected.request.source]++;result={latestLedger:model.head,error:rawError(expected.oracle.row)}; }
    } else {
      assert.equal(pending.length,0,'after read cannot precede both simulation legs');
      if(q.method==='getNetwork')result={passphrase:'Test SDF Network ; September 2015',protocolVersion:28};
      else if(q.method==='getLedgerEntries') {
        assert.deepEqual(Object.keys(q.params),['keys']); assert.equal(q.params.keys.length,26); assert.equal(new Set(q.params.keys).size,26);
        const response=f.snapshot(model.head,model.records,model.accounts,'0',model.completed>=35); reads.push({head:model.head,completed:model.completed});
        result={latestLedger:model.head,entries:response.entries.map(({val,...entry})=>({...entry,xdr:val}))};
      } else if(q.method==='getLatestLedger')result=wireHeader(model.head);
      else assert.fail('unexpected RPC method '+q.method);
    }
    assert.equal(clock.value,seconds(model.head)); return new Response(JSON.stringify({jsonrpc:'2.0',id:q.id,result}));
  }});
  return {rpc,calls,reads,begin(oracle){assert.equal(pending.length,0);pending=oracle.requests.map(request=>({request,oracle}));},assertIdle(){assert.equal(pending.length,0);}};
}
function afterOf(result) { const batch=result.snapshots[result.case.afterSnapshot];return {acquisition:{schema:'agyion-public-lifecycle-acquisition-v1',planSha256:result.planSha256,response:batch.response,headerEvidence:batch.headerEvidence,raw:result.captures.after.raw},zeroBalanceEvidence:batch.zeroBalanceEvidence,zeroRead:result.captures.after.zeroRead}; }
function mergeSnapshots(target, source) {
  for(const [id,batch] of Object.entries(source)) { assert.equal(sha(canonical(batch)),id);if(Object.hasOwn(target,id))assert.equal(canonical(target[id]),canonical(batch));else target[id]=batch; }
}
function accountTransition(model,index,ledger) {
  const source=SOURCES[index];assert.equal(plan.steps[index].sourceRole,source);
  for(const [j,role] of ['seller','recipient','relayer'].entries()) {
    const previous=model.accounts[role], delta=BigInt(BUSINESS[index][j]??0)-(role===source?100n:0n);
    const balance=String(BigInt(previous.balance)+delta),sequence=String(BigInt(previous.sequence)+(role===source?1n:0n));
    model.accounts[role]={...previous,balance,sequence,accountEntryXdr:b64(f.account(role,balance,sequence)),lastModifiedLedgerSeq:delta!==0n||role===source?ledger:previous.lastModifiedLedgerSeq};
  }
}
function measure(stats,name,value) { const count=Buffer.byteLength(canonical(value));assert.ok(count<=MAX,`${name}: ${count} exceeds ${MAX}`);stats[name]=Math.max(stats[name],count);return count; }
function observationScope(scope,state,raw) { return {...scope,snapshot:state.snapshot,currentFee:null,rawEvidence:raw}; }
function verifyPhase(scope,state,raw) {
  const policies=createPublicLifecyclePolicies();policies.verifyStateExpectations({...scope,expected:state.expected});
  return policies.verifyObservations(observationScope(scope,state,raw));
}
function measurePhase(stats,scope,state,raw) {
  measure(stats,'maxRawPhaseBytes',raw);measure(stats,'maxPolicyInputBytes',{...scope,expected:state.expected});measure(stats,'maxPolicyInputBytes',observationScope(scope,state,raw));
  // Same expanded options shape as concrete policies, measured without fabricating
  // currentFee or claiming that an after gate got beyond its required refusal.
  measure(stats,'maxExpandedObservationInputBytes',{plan,planSha256:state.planSha256,stepId:scope.stepId,phase:scope.phase,claim:scope.claim,currentInclusion:scope.currentInclusion,initialEvidence:scope.initialEvidence,state,verifiedPrefix:scope.prefix,currentFee:null,snapshot:state.snapshot,beforeSnapshot:null,rawEvidence:raw});
}
function snapshotMap(raw,families) { return raw[families[0].observationKind].snapshots; }

test('66 acquired case scopes across 39 sequential synthetic transitions keep after-fee authority incomplete',{timeout:180000},async t=>{
  assert.equal(typeof acquireEarly,'function');assert.equal(CASES.length,66);assert.equal(new Set(CASES.map(row=>JSON.stringify(tuple(row)))).size,66);
  assert.deepEqual(plan.steps.map(step=>step.sourceRole),SOURCES);assert.deepEqual(Object.fromEntries(['seller','recipient','relayer'].map(role=>[role,SOURCES.filter(r=>r===role).length])),{seller:14,recipient:14,relayer:11});
  const clock={value:seconds(999)};t.mock.method(Date,'now',()=>clock.value*1000);
  const model={head:999,completed:0,records:[],accounts:f.accounts()},prefixRows=[],staged=new Map(),retainedEarly=[],consumedEarly=[],acquired=[],scheduled=[],events=[];
  const stats={simulations:0,negatives:0,controls:0,zeroGetters:0,sources:{seller:0,recipient:0,relayer:0},negativeSources:{seller:0,recipient:0,relayer:0},controlSources:{seller:0,recipient:0,relayer:0},credentials:{venue:0,podTimelock:0,podMixed:0,attester:0,agent:0},economicPhases:0,beforeAggregatesAccepted:0,afterFeeRefusals:0,terminalAfterFeeRefusals:0,afterCases:0,earlyCaptured:0,earlyConsumed:0,earlyMissingRefusals:0,earlyRelabelRefusals:0,crossStageRefusals:0,controlTamperRefusals:0,maxCaseBytes:0,maxEarlyWrapperBytes:0,maxRawPhaseBytes:0,maxPolicyInputBytes:0,maxExpandedObservationInputBytes:0};
  const fx=transport(model,clock,stats),move=head=>{assert.ok(head>=model.head);model.head=head;clock.value=seconds(head);};
  const initialCapture=await acquirePublicLifecycleBaseline({plan,rpc:fx.rpc});
  const initial=S.initialPublicLifecycleState({plan,response:initialCapture.acquisition.response,headerEvidence:initialCapture.acquisition.headerEvidence,zeroBalanceEvidence:null});
  const initialEvidence={expected:initial.expected,response:initialCapture.acquisition.response,headerEvidence:initialCapture.acquisition.headerEvidence};let highest=0n;
  function checkEconomics(state) { assert.equal(S.assertPublicLifecycleDerivedState(state),state);assertEconomics(state.snapshot,economicModel(model.completed),model.records);highest=BigInt(state.snapshot.openPrincipalStroops)>highest?BigInt(state.snapshot.openPrincipalStroops):highest; }
  async function collect(row,state,before,early=false) {
    const beforeHash=sha(canonical(before)),oracle=caseOracle(row,state,model.head,stats),start=fx.calls.length;fx.begin(oracle);
    const options={plan,state,before,rpc:fx.rpc,observationCredential:oracle.credential};
    const wrapper=early?await acquireEarly(options):null;
    const out=early?wrapper.observation:await acquire({...options,observationKind:row.kind,caseId:row.caseId});
    fx.assertIdle();assert.equal(sha(canonical(before)),beforeHash);assert.equal(oracle.credentialCalls,row.proof==='none'?0:1);
    assert.deepEqual(fx.calls.slice(start),[...oracle.requests.map(()=>'simulateTransaction'),'getNetwork','getLedgerEntries','getLatestLedger']);
    assert.equal(out.stepId,plan.steps[row.step-1].id);assert.equal(out.phase,row.phase);assert.equal(out.observationKind,row.kind);assert.equal(out.case.caseId,row.caseId);assert.equal(out.case.ledger,model.head);assert.equal(out.case.timestamp,oracle.timestamp);
    assert.deepEqual(out.case.request,{envelopeXdr:oracle.requests[0].params.transaction,authMode:row.authMode});
    assert.deepEqual(out.timing,{startedAtSeconds:clock.value,responseValidatedAtSeconds:clock.value,...(row.control?{controlResponseValidatedAtSeconds:clock.value}:{}),completedAtSeconds:clock.value});
    if(row.control)assert.deepEqual(out.case.control.request,{envelopeXdr:oracle.requests[1].params.transaction,authMode:'enforce'});else assert.equal(Object.hasOwn(out.case,'control'),false);
    O.verifyPublicLifecycleObservationCase({plan,stepId:out.stepId,observationKind:row.kind,caseId:row.caseId,ledger:out.case.ledger,timestamp:out.case.timestamp,recordAnchors:state.recordAnchors},{request:out.case.request,response:out.case.response,...(row.control?{control:out.case.control}:{})});
    assert.ok(Object.isFrozen(out)&&Object.isFrozen(out.captures.after.raw));assert.deepEqual(afterOf(out),before);measure(stats,'maxCaseBytes',out);
    if(model.completed>0){assert.equal(before.zeroBalanceEvidence,null);assert.equal(before.zeroRead,null);}
    if(early){assert.ok(Object.isFrozen(wrapper)&&Object.isFrozen(wrapper.origin));assert.equal(wrapper.schema,'agyion-public-lifecycle-early-acquisition-v1');assert.equal(wrapper.planSha256,state.planSha256);assert.deepEqual(wrapper.origin,{stepId:plan.steps[row.captureOrigin.step-1].id,phase:'after',prefixLength:row.captureOrigin.prefixLength,snapshotLedger:model.head});measure(stats,'maxEarlyWrapperBytes',wrapper);}
    acquired.push(tuple(row));events.push({kind:'acquire',tuple:tuple(row),originStep:state.stepId,originPhase:state.phase,completed:model.completed,head:model.head});if(row.phase==='after')stats.afterCases++;
    return {out,wrapper};
  }
  for(let index=0;index<39;index++) {
    const step=plan.steps[index],base=f.heads[index];assert.equal(model.completed,index);move(base);
    let binding=f.binding(index,base,model.accounts),included=null;
    for(const phase of ['before','after']) {
      if(phase==='after') {
        // This is the only synthetic transition: no transaction is signed/sent.
        const createdId=f.advance(model.records,index);accountTransition(model,index,base+1);model.completed=index+1;move(base+1);
        included={status:'SUCCESS',ledger:base+1,createdId};events.push({kind:'transition',step:index+1,head:model.head});
      }
      let before=await acquirePublicLifecycleBaseline({plan,rpc:fx.rpc});
      const stateInput={plan,initial,prefix:clone(prefixRows),stepId:step.id,binding,phase,inclusion:phase==='before'?null:included};
      let state=S.derivePublicLifecycleState({...stateInput,response:before.acquisition.response,headerEvidence:before.acquisition.headerEvidence});checkEconomics(state);stats.economicPhases++;
      const families=O.publicLifecycleObservationCases({plan,stepId:step.id,phase}),expected=CASES.filter(row=>row.step===index+1&&row.phase===phase);
      assert.deepEqual(families.flatMap(family=>family.caseIds.map(caseId=>[family.observationKind,caseId])),expected.map(row=>[row.kind,row.caseId]));
      const raw=Object.fromEntries(families.map(family=>[family.observationKind,{cases:[]}])),batches={};let consumedHere=null;
      for(const row of expected) {
        let out;
        if(row.acquisition==='early') {
          const slot=staged.get(row.step);assert.ok(slot,'historical early case must already exist');assert.equal(slot.row.kind,row.kind);assert.equal(sha(canonical(slot.wrapper)),slot.hash);assert.equal(slot.wrapper.origin.snapshotLedger,row.captureOrigin.included);assert.equal(model.head,row.captureOrigin.targetHead);
          assert.ok(slot.wrapper.observation.case.ledger<=row.captureOrigin.lastEarly);assert.equal(prefixRows.length,row.captureOrigin.step);assert.equal(state.phase,'before');
          out=slot.wrapper.observation;assert.equal(out.snapshots[out.case.beforeSnapshot].response.latestLedger,row.captureOrigin.included);
          O.verifyPublicLifecycleObservationCase({plan,stepId:step.id,observationKind:row.kind,caseId:row.caseId,ledger:out.case.ledger,timestamp:out.case.timestamp,recordAnchors:state.recordAnchors},{request:out.case.request,response:out.case.response});
          if(row.step===13){const envelope=xdr.TransactionEnvelope.fromXDR(out.case.request.envelopeXdr,'base64');assert.ok(BigInt(clock.value)>BigInt(envelope.v1().tx().cond().timeBounds().maxTime().toString()),'historical negative request has expired, with no new sending authority');}
          staged.delete(row.step);stats.earlyConsumed++;consumedHere=slot;events.push({kind:'consume-early',targetStep:row.step,head:model.head});
        } else {
          ({out}=await collect(row,state,before));before=afterOf(out);state=S.derivePublicLifecycleState({...stateInput,response:before.acquisition.response,headerEvidence:before.acquisition.headerEvidence});checkEconomics(state);
        }
        raw[row.kind].cases.push(out.case);mergeSnapshots(batches,out.snapshots);scheduled.push(tuple(row));
      }
      if(Object.keys(batches).length)raw[families[0].observationKind].snapshots=batches;
      const scope={plan,planSha256:state.planSha256,stepId:step.id,phase,claim:{stepId:step.id,binding},prefix:clone(prefixRows),initialEvidence,currentInclusion:phase==='before'?null:included,snapshotResponse:before.acquisition.response,headerEvidence:before.acquisition.headerEvidence,beforeSnapshot:null};
      measurePhase(stats,scope,state,raw);
      if(phase==='before') {
        const result=verifyPhase(scope,state,raw);assert.equal(result.evidence.length,families.length);stats.beforeAggregatesAccepted++;
        const unchanged=sha(canonical(raw)),calls=fx.calls.length;
        if(consumedHere) {
          const row=consumedHere.row,missing=clone(raw);missing[row.kind].cases=[];assert.throws(()=>verifyPhase(scope,state,missing),/LIFECYCLE_OBSERVATION_CASES/);stats.earlyMissingRefusals++;
          const relabeled=clone(raw);relabeled[row.kind].cases[0].ledger=model.head;assert.throws(()=>verifyPhase(scope,state,relabeled),/LIFECYCLE_OBSERVATION_BRACKET/);stats.earlyRelabelRefusals++;
          const prior=consumedEarly.find(slot=>slot.row.caseId===row.caseId);
          if(prior){const swapped=clone(raw);swapped[row.kind].cases=[clone(prior.wrapper.observation.case)];mergeSnapshots(snapshotMap(swapped,families),prior.wrapper.observation.snapshots);assert.throws(()=>verifyPhase(scope,state,swapped),/LIFECYCLE_OBSERVATION_SNAPSHOT_LEDGER/);stats.crossStageRefusals++;}
          consumedEarly.push(consumedHere);assert.equal(sha(canonical(consumedHere.wrapper)),consumedHere.hash);
        }
        if(index===1) {
          const kind='fade-claim-wrong-source-enforce';
          for(const [edit,code] of [[request=>{const env=xdr.TransactionEnvelope.fromXDR(request.envelopeXdr,'base64');env.v1().tx().sourceAccount(xdr.MuxedAccount.keyTypeEd25519(StrKey.decodeEd25519PublicKey(plan.actors.relayer)));request.envelopeXdr=b64(env);},'ENVELOPE'],[request=>{const env=xdr.TransactionEnvelope.fromXDR(request.envelopeXdr,'base64');env.v1().tx().seqNum(xdr.SequenceNumber.fromString(String(BigInt(env.v1().tx().seqNum().toString())+1n)));request.envelopeXdr=b64(env);},'SEQUENCE']]) {
            const changed=clone(raw);edit(changed[kind].cases[0].control.request);assert.throws(()=>verifyPhase(scope,state,changed),new RegExp('LIFECYCLE_OBSERVATION_'+code));stats.controlTamperRefusals++;
          }
          const absent=clone(raw);delete absent[kind].cases[0].control;assert.throws(()=>verifyPhase(scope,state,absent),/LIFECYCLE_OBSERVATION_INPUT/);stats.controlTamperRefusals++;
        }
        assert.equal(sha(canonical(raw)),unchanged);assert.equal(fx.calls.length,calls,'retained-copy mutations have no RPC');
      } else {
        // Missing currentFee is deliberate; even empty after families cannot
        // authorize completion. Final39 pins/history are not fabricated here.
        assert.throws(()=>verifyPhase(scope,state,raw),/LIFECYCLE_POLICY_FEE/);stats.afterFeeRefusals++;if(expected.length)stats.terminalAfterFeeRefusals++;
        const early=CASES.find(row=>row.captureOrigin?.step===index+1);
        if(early) {
          assert.equal(expected.length,0);assert.equal(families.length,0);assert.equal(model.head,early.captureOrigin.included);assert.equal(state.prefixLength,early.captureOrigin.prefixLength);assert.equal(state.phase,'after');
          const {wrapper}=await collect(early,state,before,true);assert.equal(staged.has(early.step),false);
          const slot={row:early,wrapper,hash:sha(canonical(wrapper))};staged.set(early.step,slot);retainedEarly.push(slot);stats.earlyCaptured++;
        }
        // Compact fee100 is a synthetic reducer input, not fee metadata proof.
        prefixRows.push({stepId:step.id,binding:clone(binding),inclusion:clone(included),fee:{authorizedFee:'1000',netFee:'100'},after:{ledger:model.head,accounts:clone(state.snapshot.accounts)}});
      }
    }
  }
  fx.assertIdle();assert.equal(staged.size,0);assert.equal(prefixRows.length,39);assert.deepEqual(acquired,CASES.map(tuple));assert.deepEqual(scheduled,CASES.map(tuple));
  for(const slot of retainedEarly) {
    assert.equal(sha(canonical(slot.wrapper)),slot.hash);const origin=slot.row.captureOrigin.step;
    const captured=events.findIndex(event=>event.kind==='acquire'&&event.tuple[0]===slot.row.step&&event.tuple[2]===slot.row.kind);
    const originTransition=events.findIndex(event=>event.kind==='transition'&&event.step===origin),targetTransition=events.findIndex(event=>event.kind==='transition'&&event.step===slot.row.step);
    assert.ok(originTransition<captured&&captured<targetTransition);assert.equal(events[captured].completed,origin);
  }
  assert.equal(stats.negatives,66);assert.equal(stats.controls,4);assert.equal(stats.simulations,70);assert.equal(stats.zeroGetters,0);
  assert.deepEqual(stats.negativeSources,{seller:23,recipient:15,relayer:28});assert.deepEqual(stats.controlSources,{seller:0,recipient:4,relayer:0});assert.deepEqual(stats.sources,{seller:23,recipient:19,relayer:28});
  assert.deepEqual(stats.credentials,{venue:8,podTimelock:10,podMixed:1,attester:5,agent:6});assert.equal(stats.economicPhases,78);assert.equal(stats.beforeAggregatesAccepted,39);assert.equal(stats.afterFeeRefusals,39);assert.equal(stats.terminalAfterFeeRefusals,13);assert.equal(stats.afterCases,13);
  assert.equal(stats.earlyCaptured,4);assert.equal(stats.earlyConsumed,4);assert.equal(stats.earlyMissingRefusals,4);assert.equal(stats.earlyRelabelRefusals,4);assert.equal(stats.crossStageRefusals,2);assert.equal(stats.controlTamperRefusals,3);
  const final=economicModel(39);assert.deepEqual(final.balances,{seller:'958998599',recipient:'1040998600',relayer:'999998900'});assert.deepEqual(final.sequences,{seller:'24',recipient:'24',relayer:'21'});assert.equal(final.principal,'0');assert.equal(final.reserve,'1');assert.equal(highest,30000000n);assert.equal(model.records.length,16);assert.deepEqual(final.counters,{Fade:'8',Pod:'2',Trigger:'3',Mandate:'3'});
  t.diagnostic(JSON.stringify({executable:real?'pinned-local-wasm':'executable-auth-only-double',...stats,allCaseScopesAcquired:true,afterAggregatesAccepted:0,currentFeeMetadataReconciled:false,finalPinsVerified:false,journalComplete:false,hostExecution:false,liveRpcCalls:0,sidecarPersistence:false,journalClaimSizeMeasured:false}));
});
