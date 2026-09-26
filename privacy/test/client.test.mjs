import test from 'node:test';
import assert from 'node:assert/strict';
import { poseidon3 } from 'poseidon-lite';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { createLocalPrivacyClient } from '../src/client.mjs';
import { buildWitness, ciphertextBytes } from '../src/witness.mjs';
import { encryptFields } from '../src/encryption.mjs';
import { FIELD, checkedPoint, contextHash, noteCommitment } from '../src/model.mjs';
import { makeDepositConfig, makePolicyConfig, TEST_RANDOMNESS } from './model-fixtures.mjs';

// These callbacks test ONLY the local orchestration boundary. They are not
// Groth16 implementations, valid proofs, live submissions or installed suites.
const UNIT_PROOF = '01'.repeat(256);
const context = { domain: { networkId: '11'.repeat(32), contractId: '22'.repeat(32) }, epoch: '1', ownerId: '33'.repeat(32) };
const password = 'local test recovery password';
function profile(c = makeDepositConfig()) { return { domain: c.domain, assetPolicyRoot: c.assetTree.root, epoch: c.epoch, auditor: c.auditor }; }
function unitClient(overrides = {}) {
  return createLocalPrivacyClient({ profile: profile(),
    prove: async w => ({ proof: UNIT_PROOF, publicSignals: [...w.core, ...w.encrypted].map(String) }),
    verify: async () => true, ...overrides });
}
function archive(c = makePolicyConfig(0n)) {
  const r = buildWitness(c, TEST_RANDOMNESS), core = r.witness.core, encrypted = r.witness.encrypted;
  return { config: c, record: { recordId: r.ciphertextDigest, core, encrypted },
    anchor: { recordId: r.ciphertextDigest, ciphertextDigest: r.ciphertextDigest, core } };
}
function rewrittenEnvelope(a,slot,message,key) {
  const encrypted = a.record.encrypted.slice(), start = slot * 28;
  const shared = checkedPoint(encrypted.slice(start,start+2)).multiply(key), context = contextHash(a.record.core);
  const derived = [shared.x,shared.y].map(n => poseidon3([n,context,BigInt(slot+1)]));
  encrypted.splice(start+3,25,...encryptFields(message,derived,encrypted[start+2]));
  const id = bytesToHex(sha256(ciphertextBytes(encrypted)));
  return { record: {...a.record,recordId:id,encrypted}, anchor: {...a.anchor,recordId:id,ciphertextDigest:id} };
}

test('local drafts hide the witness and return only verified, explicitly unsubmitted public data', async () => {
  let witnessed, verified;
  const client = unitClient({ prove: async w => { witnessed = w; return { proof: UNIT_PROOF, publicSignals: [...w.core, ...w.encrypted].map(String) }; },
    verify: async (proof,publicSignals) => { verified = {proof,publicSignals}; return true; } });
  const draft = client.prepare(makePolicyConfig(1n));
  assert.equal(draft.kind, 'LocalPrivateDraft');
  assert.equal(JSON.stringify(draft).includes('authSecrets'), false);
  assert.equal('witness' in draft, false);
  const result = await client.prepareSubmission(draft);
  assert.equal(witnessed.authSecrets[0], 11n); assert.equal(witnessed.podSecrets[0], 55n);
  assert.equal(result.kind, 'UnsubmittedPrivateTransition');
  assert.equal(result.publicSignals.length, 157); assert.equal(result.proof, UNIT_PROOF);
  assert.deepEqual(verified, { proof: UNIT_PROOF, publicSignals: draft.publicSignals });
  assert.equal('accepted' in result, false); assert.equal('witness' in result, false);
  assert.equal(JSON.stringify(result).includes('authSecrets'), false);
  assert.ok(Object.isFrozen(result.publicSignals));
  assert.throws(() => client.prepare({ ...makeDepositConfig(), epoch: 2n }));
});

test('rejects changed, reordered, aliased, missing and extra public signals before verification', async () => {
  const mutations = [s => { s[0] = '102'; }, s => { s[23] = (BigInt(s[23]) + 1n).toString(); },
    s => { s[156] = (BigInt(s[156]) + 1n).toString(); },
    s => { [s[12],s[14]] = [s[14],s[12]]; }, s => { s[0] = '0101'; }, s => { s[0] = FIELD.toString(); },
    s => { s[0] = 101n; }, s => s.pop(), s => s.push('0')];
  for (const mutate of mutations) {
    let verified = false;
    const client = unitClient({ prove: async w => { const s = [...w.core,...w.encrypted].map(String); mutate(s); return { proof: UNIT_PROOF, publicSignals: s }; },
      verify: async () => { verified = true; return true; } });
    await assert.rejects(client.prepareSubmission(client.prepare(makeDepositConfig())));
    assert.equal(verified, false);
  }
});

test('requires exact proof response and strict verification true; callbacks cannot supply acceptance', async () => {
  for (const verification of [false, undefined, { accepted: true }, 'true']) {
    const client = unitClient({ verify: async () => verification });
    await assert.rejects(client.prepareSubmission(client.prepare(makeDepositConfig())));
  }
  const client = unitClient({ prove: async () => ({ proof: 'aa', publicSignals: [] }) });
  await assert.rejects(client.prepareSubmission(client.prepare(makeDepositConfig())));
  const extra = unitClient({ prove: async w => ({ proof: UNIT_PROOF, publicSignals: [...w.core,...w.encrypted].map(String), accepted: true }) });
  await assert.rejects(extra.prepareSubmission(extra.prepare(makeDepositConfig())));
  assert.throws(() => createLocalPrivacyClient({ profile: profile(), prove: null, verify: () => true }));
});

test('suppresses local worker error details and refuses response accessors without invoking them', async () => {
  const leaked = 'SENSITIVE TEST AUTH SECRET';
  const client = unitClient({ prove: async () => { throw new Error(leaked); } });
  await assert.rejects(client.prepareSubmission(client.prepare(makeDepositConfig())), error => {
    assert.equal(error.code,'LOCAL_PROVING_FAILED'); assert.equal(String(error).includes(leaked),false); return true;
  });
  let read = false;
  const getter = unitClient({ prove: async () => ({ get proof() { read = true; return UNIT_PROOF; }, publicSignals: [] }) });
  await assert.rejects(getter.prepareSubmission(getter.prepare(makeDepositConfig()))); assert.equal(read,false);
});

test('coalesces concurrent proving, rejects foreign handles and cancels forgotten drafts', async () => {
  let release, calls = 0;
  const gate = new Promise(r => { release = r; });
  const client = unitClient({ prove: async w => { calls++; await gate; return { proof: UNIT_PROOF, publicSignals: [...w.core,...w.encrypted].map(String) }; } });
  const draft = client.prepare(makeDepositConfig());
  const first = client.prepareSubmission(draft), second = client.prepareSubmission(draft);
  assert.equal(calls, 1); release(); assert.strictEqual(await first, await second);
  await assert.rejects(unitClient().prepareSubmission(draft));
  assert.equal(client.forget(draft), true); await assert.rejects(client.prepareSubmission(draft));
  let release2; const gate2 = new Promise(r => { release2 = r; });
  const other = unitClient({ prove: async w => { await gate2; return { proof: UNIT_PROOF, publicSignals: [...w.core,...w.encrypted].map(String) }; } });
  const pendingDraft = other.prepare(makeDepositConfig()), pending = other.prepareSubmission(pendingDraft);
  other.forget(pendingDraft); release2(); await assert.rejects(pending);
});

test('archive scan binds record identity, digest and every core field before recovering a commitment-bound note', () => {
  const client = unitClient(), a = archive();
  const notes = client.scanRecord(a.record, a.anchor, [8n, 7n]);
  assert.equal(notes.length, 1); assert.equal(notes[0].kind, 'RecoveredPrivateNote');
  assert.equal(JSON.stringify(notes).includes('amount'), false);
  assert.deepEqual(client.readNote(notes[0]), a.config.outNotes[0]);
  assert.equal(notes[0].commitment, noteCommitment(a.config.outNotes[0]).toString());
  assert.deepEqual(client.scanRecord(a.record, a.anchor, [8n]), []);
  const wrongId = { ...a.record, recordId: 'ab'.repeat(32) };
  assert.throws(() => client.scanRecord(wrongId, a.anchor, [7n]));
  const changedCore = a.record.core.slice(); changedCore[6]++;
  assert.throws(() => client.scanRecord({ ...a.record, core: changedCore }, a.anchor, [7n]));
  const changedCipher = a.record.encrypted.slice(); changedCipher[27]++;
  assert.throws(() => client.scanRecord({ ...a.record, encrypted: changedCipher }, a.anchor, [7n]));
  assert.throws(() => client.scanRecord(a.record, { ...a.anchor, ciphertextDigest: 'cd'.repeat(32) }, [7n]));
  assert.throws(() => client.readNote({ ...notes[0] }));
  assert.throws(() => client.scanRecord(a.record, a.anchor, [7n, 7n]));
});

test('known dummy scalar1 never recovers a zero sentinel as a note', () => {
  for (const mode of [0n, 1n, 2n, 5n]) {
    const client = unitClient(), a = archive(makePolicyConfig(mode));
    assert.deepEqual(client.scanRecord(a.record, a.anchor, [1n]), []);
    assert.equal(client.scanRecord(a.record, a.anchor, [7n]).length, 1);
  }
});

test('valid cipher tags cannot turn a mismatched opening or the old asset-bearing dummy into a recovered note', () => {
  const client = unitClient(), a = archive();
  const changed = a.config.outNotes[0].slice(); changed[3]--;
  // Deliberately update the digest anchor too: digest integrity alone is not a
  // proof that this plaintext matches the immutable public note commitment.
  const wrongNote = rewrittenEnvelope(a,0,changed,7n);
  assert.throws(() => client.scanRecord(wrongNote.record,wrongNote.anchor,[7n]), {code:'BINDING_MISMATCH'});
  const oldDummy = rewrittenEnvelope(a,1,a.config.outNotes[1],1n);
  assert.throws(() => client.scanRecord(oldDummy.record,oldDummy.anchor,[7n]), {code:'NONZERO_DUMMY_SENTINEL'});
  const realZero = rewrittenEnvelope(a,0,Array(24).fill(0n),7n);
  assert.throws(() => client.scanRecord(realZero.record,realZero.anchor,[7n]));
});

test('draft backup is encrypted, profile-bound and restores a local draft without implying live acceptance', async () => {
  const client = unitClient(), draft = client.prepare(makePolicyConfig(1n));
  const encrypted = await client.backupDraft(draft, password, context);
  assert.equal(JSON.stringify(encrypted).includes('authSecrets'), false);
  client.forget(draft);
  const restored = await client.restoreDraft(encrypted, password, context);
  assert.deepEqual(restored.publicSignals, draft.publicSignals);
  assert.equal((await client.prepareSubmission(restored)).kind, 'UnsubmittedPrivateTransition');
  const wrong = unitClient({ profile: { ...profile(), epoch: 2n } });
  await assert.rejects(wrong.restoreDraft(encrypted, password, context));
});

test('encrypted note-opening backups restore opaque handles, not spend authority or chain status', async () => {
  const client = unitClient(), a = archive(), notes = client.scanRecord(a.record, a.anchor, [7n]);
  const blob = await client.backupNotes(notes, password, context);
  assert.equal(JSON.stringify(blob).includes('note'), false);
  notes.forEach(n => client.forget(n));
  const restored = await client.restoreNotes(blob, password, context);
  assert.equal(restored.length, 1); assert.deepEqual(client.readNote(restored[0]), a.config.outNotes[0]);
  assert.equal('unspent' in restored[0], false); assert.equal('spendSecret' in restored[0], false);
  assert.throws(() => client.readNote(notes[0]));
  await assert.rejects(client.backupNotes([restored[0], restored[0]], password, context));
});
