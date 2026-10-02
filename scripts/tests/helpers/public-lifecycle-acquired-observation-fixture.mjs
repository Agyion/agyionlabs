/** Inert acquired-observation journal fixture. Independent finite request oracles
 * are copied from the reviewed66-case journey; no registered test is imported.
 * One current transport captures history chronologically. All replies and keys
 * remain synthetic; actual local WASM authentication does not execute a host.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { acquirePublicLifecycleObservationCase as acquire, acquirePublicLifecycleEarlyObservationCase as acquireEarly } from '../../lib/public-lifecycle-observation-acquisition.mjs';
import { acquirePublicLifecycleBaseline } from '../../lib/public-lifecycle-baseline.mjs';
import { createPublicLifecycleRpc } from '../../lib/public-lifecycle-rpc.mjs';
import { publicLifecycleObservationCases } from '../../lib/public-lifecycle-observations.mjs';
import { loadLocalObservationPinFixture } from './public-lifecycle-observation-fixture.mjs';
const { Account, Address, Operation, SorobanDataBuilder, StrKey, TransactionBuilder, nativeToScVal, xdr } = createRequire(new URL('../../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const MAX = 2 * 1024 * 1024, b64 = value => value.toXDR('base64');
const sha = value => createHash('sha256').update(value).digest('hex');
const canonical = value => value && typeof value === 'object' ? Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}' : JSON.stringify(value);

export function createAcquiredObservationFixture({ fixture, currentSnapshot, currentLedger, nowSeconds }) {
  const f = fixture, { plan } = f;
  const stats = { simulations: 0, negatives: 0, controls: 0, zeroGetters: 0,
    sources: { seller: 0, recipient: 0, relayer: 0 }, negativeSources: { seller: 0, recipient: 0, relayer: 0 }, controlSources: { seller: 0, recipient: 0, relayer: 0 },
    credentials: { venue: 0, podTimelock: 0, podMixed: 0, attester: 0, agent: 0 }, caseScopes: 0, earlyCaptured: 0, earlyConsumed: 0, maxCaptureBytes: 0 };
  const captures = [], staged = new Map();
  const model = { get head() { return currentLedger(); } }, clock = { get value() { return nowSeconds(); } };
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
const seconds = head => 1800000000 + head, clone = structuredClone;
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
        const response=currentSnapshot(); reads.push({head:model.head,completed:model.completed});
        result={latestLedger:model.head,entries:response.entries.map(({val,...entry})=>({...entry,xdr:val}))};
      } else if(q.method==='getLatestLedger')result=wireHeader(model.head);
      else assert.fail('unexpected RPC method '+q.method);
    }
    assert.equal(clock.value,seconds(model.head)); return new Response(JSON.stringify({jsonrpc:'2.0',id:q.id,result}));
  }});
  return {rpc,calls,reads,begin(oracle){assert.equal(pending.length,0);pending=oracle.requests.map(request=>({request,oracle}));},assertIdle(){assert.equal(pending.length,0);}};
}

  const fx = transport(model, clock, stats);
  function retain(value) {
    const size = Buffer.byteLength(canonical(value));
    assert.ok(size <= MAX); stats.maxCaptureBytes = Math.max(stats.maxCaptureBytes, size);
    captures.push(value); assert.ok(Object.isFrozen(value));
  }
  function merge(target, source) {
    for (const [id, batch] of Object.entries(source)) {
      assert.equal(sha(canonical(batch)), id);
      if (Object.hasOwn(target, id)) assert.equal(canonical(target[id]), canonical(batch));
      else target[id] = batch;
    }
  }
  async function collect(row, state, before, early = false) {
    const original = sha(canonical(before)), oracle = caseOracle(row, state, model.head, stats);
    fx.begin(oracle);
    const options = { plan, state, before, rpc: fx.rpc, observationCredential: oracle.credential };
    const wrapper = early ? await acquireEarly(options) : null;
    const out = early ? wrapper.observation : await acquire({ ...options, observationKind: row.kind, caseId: row.caseId });
    fx.assertIdle(); assert.equal(sha(canonical(before)), original);
    assert.equal(oracle.credentialCalls, row.proof === 'none' ? 0 : 1);
    assert.equal(out.stepId, plan.steps[row.step - 1].id); assert.equal(out.phase, row.phase);
    assert.deepEqual(out.case.request, { envelopeXdr: oracle.requests[0].params.transaction, authMode: row.authMode });
    if (row.control) assert.deepEqual(out.case.control.request, { envelopeXdr: oracle.requests[1].params.transaction, authMode: 'enforce' });
    retain(wrapper ?? out); stats.caseScopes++;
    return { out, wrapper };
  }
  async function capture(state) {
    const before = await acquirePublicLifecycleBaseline({ plan, rpc: fx.rpc });
    assert.equal(before.acquisition.response.latestLedger, state.snapshot.ledger);
    assert.equal(model.head, state.snapshot.ledger);
    return before;
  }
  const headerEvidence = head => {
    const raw = wireHeader(head);
    return { kind: 'latest', ledger: head, hash: raw.id, headerXdr: raw.headerXdr };
  };
  return {
    stats, captures, headerEvidence,
    get stagedRemaining() { return staged.size; },
    async collectPhase({ index, phase, state, response, headerEvidence: header }) {
      assert.equal(model.head, state.snapshot.ledger);
      const before = await capture(state);
      assert.deepEqual(before.acquisition.response, response); assert.deepEqual(before.acquisition.headerEvidence, header);
      const families = publicLifecycleObservationCases({ plan, stepId: plan.steps[index].id, phase });
      const rows = CASES.filter(row => row.step === index + 1 && row.phase === phase);
      assert.deepEqual(families.flatMap(family => family.caseIds.map(caseId => [family.observationKind, caseId])), rows.map(row => [row.kind, row.caseId]));
      const observations = Object.fromEntries(families.map(family => [family.observationKind, { cases: [] }])), batches = {};
      for (const row of rows) {
        let out;
        if (row.acquisition === 'early') {
          const slot = staged.get(row.step); assert.ok(slot && slot.completionSha256, 'completed precursor evidence must already exist');
          assert.equal(sha(canonical(slot.wrapper)), slot.sha256);
          assert.equal(slot.wrapper.origin.snapshotLedger, row.captureOrigin.included);
          assert.equal(slot.wrapper.origin.prefixLength, row.captureOrigin.prefixLength);
          assert.equal(model.head, row.captureOrigin.targetHead);
          assert.equal(slot.wrapper.observation.case.ledger, row.captureOrigin.included);
          assert.equal(state.prefixLength, row.step - 1);
          assert.equal(slot.sourceState.stepId, plan.steps[row.captureOrigin.step - 1].id);
          assert.equal(slot.sourceState.phase, 'after');
          out = slot.wrapper.observation; staged.delete(row.step); stats.earlyConsumed++;
        } else ({ out } = await collect(row, state, before));
        observations[row.kind].cases.push(out.case); merge(batches, out.snapshots);
      }
      if (families.length) observations[families[0].observationKind].snapshots = batches;
      if (index === 38 && phase === 'after') observations['original-public-private-and-market-pins-unchanged'].pins = loadLocalObservationPinFixture({ ledger: model.head });
      return { snapshot: { expected: state.expected, response, headerEvidence: header }, observations };
    },
    async stageEarly({ index, state }) {
      const row = CASES.find(row => row.captureOrigin?.step === index + 1); if (!row) return;
      assert.equal(state.phase, 'after'); assert.equal(state.prefixLength, row.captureOrigin.prefixLength);
      assert.equal(model.head, row.captureOrigin.included); assert.equal(staged.has(row.step), false);
      const before = await capture(state), { wrapper } = await collect(row, state, before, true);
      assert.deepEqual(wrapper.origin, { stepId: state.stepId, phase: 'after', prefixLength: state.prefixLength, snapshotLedger: model.head });
      staged.set(row.step, { wrapper, sourceState: state, sha256: sha(canonical(wrapper)), completionSha256: null }); stats.earlyCaptured++;
    },
    completeSource(index, completion) {
      const row = CASES.find(row => row.captureOrigin?.step === index + 1); if (!row) return;
      const slot = staged.get(row.step); assert.ok(slot);
      assert.deepEqual(slot.sourceState.snapshot, completion.verified.after.snapshot);
      assert.equal(completion.verified.fee.netFee, '400');
      slot.completionSha256 = sha(canonical(completion));
    },
  };
}
