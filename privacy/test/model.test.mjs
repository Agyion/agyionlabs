import test from 'node:test';
import assert from 'node:assert/strict';
import { babyjubjub } from '@noble/curves/misc.js';
import { poseidon2 } from 'poseidon-lite';
import { createRequire } from 'node:module';
import { FIELD, parseNote24, dummyNote, noteCommitment, nullifier, ownerHash, podSecretHash,
  contextHash, attestationMessage, rootFromPath, SparseMerkleTree, evaluateTransition } from '../src/model.mjs';
import { buildWitness } from '../src/witness.mjs';
import { makePolicyConfig, TEST_RANDOMNESS } from './model-fixtures.mjs';
const { derivePublicKey, signMessage } = createRequire(import.meta.url)('@zk-kit/eddsa-poseidon');

const G = babyjubjub.Point.BASE;
function cash(amount = 100n, secret = 11n) {
  const n = Array(24).fill(0n);
  [n[0], n[1], n[2], n[3], n[5], n[18], n[19], n[20], n[21]] = [2n, 101n, 202n, amount, ownerHash(secret), 13n, 17n, G.x, G.y];
  return n;
}
function transition(input, output, mode = 0n, auth = 11n) {
  output = output.slice(); if (output[3] > 0n) { output[18] += 1000n; output[19] += 1000n; }
  const inNotes = [input, dummyNote(101n, 202n)], outNotes = [output, dummyNote(101n, 202n)];
  const core = [101n, 1n, 1n, G.x, G.y, new SparseMerkleTree(128).root, 100n, 110n, 2n, 3n, 4n, 0n,
    ...inNotes.map(nullifier), ...outNotes.map(noteCommitment), 0n, 0n, 0n, 0n, 0n, 0n, 2n];
  return { core, inNotes, outNotes, modes: [mode, 0n], authSecrets: [auth, 0n], podSecrets: [0n, 0n],
    attestSignatures: [[G.x, G.y, 0n], [G.x, G.y, 0n]], revokePaths: [Array(128).fill(0n), Array(128).fill(0n)] };
}

test('note parser rejects modulo aliases, unsafe numbers, bad point groups and unused fields', () => {
  assert.deepEqual(parseNote24(cash()), cash());
  for (const [index, value] of [[3, 1n << 64n], [9, 1n << 32n], [18, FIELD], [3, 100], [6, 1n]]) {
    const n = cash(); n[index] = value; assert.throws(() => parseNote24(n));
  }
  for (const point of [[0n, 1n], [0n, FIELD - 1n], [1n, 1n]]) {
    const n = cash(); [n[20], n[21]] = point; assert.throws(() => parseNote24(n));
  }
  assert.throws(() => parseNote24([...cash(), 0n]));
});

test('dummy notes have one canonical representation and never create commitments or nullifiers', () => {
  const n = dummyNote(101n, 202n);
  assert.equal(noteCommitment(n), 0n); assert.equal(nullifier(n), 0n);
  for (const index of [5, 8, 18, 19]) { const changed = n.slice(); changed[index] = 1n; assert.throws(() => parseNote24(changed)); }
});

test('note/nullifier domains and Pod secret hashes are independently bound', () => {
  const a = cash(), b = cash(); b[1]++;
  assert.notEqual(noteCommitment(a), noteCommitment(b)); assert.notEqual(nullifier(a), nullifier(b));
  b[1] = a[1]; b[19]++;
  assert.notEqual(noteCommitment(a), noteCommitment(b)); assert.notEqual(nullifier(a), nullifier(b));
  assert.notEqual(ownerHash(11n), podSecretHash(11n));
  const c = transition(a, cash()).core; const other = c.slice(); other[6]++;
  assert.notEqual(contextHash(c), contextHash(other));
});

test('sparse tree handles empty siblings, updates, deletion, cloning and full 128-bit indices', () => {
  const tree = new SparseMerkleTree(2); tree.set(1n, 77n); tree.set(2n, 88n);
  const expected = poseidon2([poseidon2([0n, 77n]), poseidon2([88n, 0n])]);
  assert.equal(tree.root, expected);
  for (let i = 0n; i < 4n; i++) assert.equal(rootFromPath(tree.get(i), i, tree.path(i)), expected);
  const clone = tree.clone(); clone.set(1n, 0n); assert.notEqual(clone.root, tree.root);
  assert.throws(() => tree.path(4n)); assert.throws(() => tree.set(-1n, 5n));
  const deep = new SparseMerkleTree(128), index = (1n << 127n) + 7n;
  deep.set(index, 1n); assert.equal(rootFromPath(1n, index, deep.path(index)), deep.root);
  assert.throws(() => rootFromPath(1n, 1n << 128n, deep.path(index)));
});

test('cash conservation rejects missing funds, wrong authority, duplicated inputs and fee asset substitution', () => {
  const t = transition(cash(), cash()); assert.equal(evaluateTransition(t).kind, 'ValidTransitionModel');
  assert.throws(() => evaluateTransition({ ...t, authSecrets: [12n, 0n] }));
  const under = transition(cash(), cash(99n)); assert.throws(() => evaluateTransition(under));
  under.core[20] = 1n; under.core[21] = 77n; under.core[17] = 202n;
  assert.equal(evaluateTransition(under).kind, 'ValidTransitionModel');
  under.core[17] = 999n; assert.throws(() => evaluateTransition(under));
  const duplicate = { ...t, inNotes: [cash(), cash()], modes: [0n, 0n], authSecrets: [11n, 11n] };
  duplicate.core = t.core.slice(); duplicate.core[13] = duplicate.core[12];
  assert.throws(() => evaluateTransition(duplicate));
});

test('Pod requires both secrets, matured interval and fixed recipient with a single cash output', () => {
  const pod = cash(); pod[4] = 1n; pod[8] = podSecretHash(21n); pod[9] = 100n;
  const t = transition(pod, cash(), 1n); t.podSecrets[0] = 21n;
  assert.equal(evaluateTransition(t).kind, 'ValidTransitionModel');
  assert.throws(() => evaluateTransition({ ...t, podSecrets: [22n, 0n] }));
  const early = { ...t, core: t.core.slice() }; early.core[6] = 99n; assert.throws(() => evaluateTransition(early));
  assert.throws(() => evaluateTransition(transition(pod, cash(100n, 12n), 1n)));
});

test('Trigger refund is strictly after deadline and cannot use beneficiary authority', () => {
  const trigger = cash(); trigger[4] = 2n; trigger[6] = ownerHash(22n); trigger[10] = 99n;
  [trigger[12], trigger[13]] = [G.x, G.y];
  const t = transition(trigger, cash(100n, 22n), 3n, 22n);
  assert.equal(evaluateTransition(t).kind, 'ValidTransitionModel');
  const at = { ...t, core: t.core.slice() }; at.core[6] = 99n; assert.throws(() => evaluateTransition(at));
  assert.throws(() => evaluateTransition({ ...t, authSecrets: [11n, 0n] }));
});

test('Trigger attestation verifies a real circomlib-compatible signature and binds terms/recipient/deadline', () => {
  const seed = Buffer.alloc(32, 37), publicKey = derivePublicKey(seed);
  const trigger = cash(); trigger[4] = 2n; trigger[6] = ownerHash(22n); trigger[10] = 110n; trigger[11] = 99n;
  [trigger[12], trigger[13]] = publicKey;
  const t = transition(trigger, cash(), 2n);
  const sig = signMessage(seed, attestationMessage(trigger)); t.attestSignatures[0] = [...sig.R8, sig.S];
  assert.equal(evaluateTransition(t).kind, 'ValidTransitionModel');
  for (const slot of [5, 10, 11]) {
    const changed = trigger.slice(); changed[slot]++;
    const mutation = transition(changed, cash(), 2n); mutation.attestSignatures = t.attestSignatures;
    assert.throws(() => evaluateTransition(mutation));
  }
  const expired = { ...t, core: t.core.slice() }; expired.core[7] = 111n;
  assert.throws(() => evaluateTransition(expired));
  const badS = { ...t, attestSignatures: [[...sig.R8, babyjubjub.Point.Fn.ORDER], t.attestSignatures[1]] };
  assert.throws(() => evaluateTransition(badS));
});

test('Envoy agent spend conserves one successor, obeys cap/count/recipient and current revocation root', () => {
  const envoy = cash(); envoy[4] = 3n; envoy[7] = ownerHash(22n); envoy[9] = 90n; envoy[10] = 120n;
  envoy[14] = 40n; envoy[15] = 2n; envoy[16] = 333n; envoy[17] = ownerHash(33n);
  [envoy[22], envoy[23]] = [G.x, G.y];
  const successor = envoy.slice(); successor[3] = 70n; successor[15] = 1n; successor[18]++;
  const t = transition(envoy, cash(30n, 33n), 4n, 22n);
  t.outNotes[1] = successor; t.core[15] = noteCommitment(successor);
  const revoke = new SparseMerkleTree(128); t.revokePaths[0] = revoke.path(333n);
  assert.equal(evaluateTransition(t).kind, 'ValidTransitionModel');
  revoke.set(333n, 1n); t.core[5] = revoke.root; t.revokePaths[0] = revoke.path(333n);
  assert.throws(() => evaluateTransition(t));
  const reclaim = transition(envoy, cash(), 5n); reclaim.core[5] = revoke.root;
  assert.equal(evaluateTransition(reclaim).kind, 'ValidTransitionModel');
});

test('Envoy final use returns unspent value to owner and cannot expand cap or redirect successor policy', () => {
  const envoy = cash(); envoy[4] = 3n; envoy[7] = ownerHash(22n); envoy[9] = 90n; envoy[10] = 120n;
  envoy[14] = 40n; envoy[15] = 1n; envoy[16] = 333n; envoy[17] = ownerHash(33n);
  [envoy[22], envoy[23]] = [G.x, G.y];
  const t = transition(envoy, cash(40n, 33n), 4n, 22n);
  t.outNotes[1] = cash(60n); t.outNotes[1][18]++;
  t.core[15] = noteCommitment(t.outNotes[1]); t.revokePaths[0] = new SparseMerkleTree(128).path(333n);
  assert.equal(evaluateTransition(t).kind, 'ValidTransitionModel');
  const redirected = { ...t, outNotes: [t.outNotes[0], cash(60n, 44n)], core: t.core.slice() };
  redirected.core[15] = noteCommitment(redirected.outNotes[1]); assert.throws(() => evaluateTransition(redirected));
  const cap = { ...t, outNotes: [cash(41n, 33n), cash(59n)], core: t.core.slice() };
  cap.core[14] = noteCommitment(cap.outNotes[0]); cap.core[15] = noteCommitment(cap.outNotes[1]);
  assert.throws(() => evaluateTransition(cap));
});

test('Envoy agent cannot divert its recipient allowance into an arbitrary public pool fee', () => {
  const c = makePolicyConfig(4n);
  c.outNotes[0][3] = 1n;
  c.fee = { amount: c.inNotes[0][14] - 1n, accountId: 909n };
  c.outNotes[1][3] = c.inNotes[0][3] - c.outNotes[0][3] - c.fee.amount;
  assert.equal(c.outNotes[1][3], 60n);
  // Amount conservation, the cap and count decrement all hold: only the
  // destination restriction prevents redirecting39 of40 away from the payee.
  assert.throws(() => buildWitness(c, TEST_RANDOMNESS), /ENVOY_POOL_FEE/);
});

test('deposit has no consumed notes and withdrawal is public, cash-only and exactly conserved', () => {
  const deposit = transition(dummyNote(101n, 202n), cash());
  [deposit.core[16], deposit.core[17], deposit.core[18], deposit.core[19]] = [1n, 202n, 100n, 303n];
  assert.equal(evaluateTransition(deposit).kind, 'ValidTransitionModel');
  const withdrawal = transition(cash(), dummyNote(101n, 202n));
  [withdrawal.core[16], withdrawal.core[17], withdrawal.core[18], withdrawal.core[19]] = [2n, 202n, 100n, 303n];
  assert.equal(evaluateTransition(withdrawal).kind, 'ValidTransitionModel');
  withdrawal.core[18]--; assert.throws(() => evaluateTransition(withdrawal));
  deposit.inNotes[0] = cash(); deposit.core[12] = nullifier(cash()); deposit.outNotes[0] = cash(200n);
  deposit.core[14] = noteCommitment(deposit.outNotes[0]); assert.throws(() => evaluateTransition(deposit));
});
