// Opt-in real compiled-WASM integration, with no compiler or setup invocation:
// PRIVACY_CIRCUIT_TESTS=1 node --test privacy/test/transition-circuit.test.mjs
// Optional PRIVACY_CIRCUIT_DIR selects an existing circuit artifact directory.
// These are constraint/witness tests, not a ceremony, proof verifier or audit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { babyjubjub } from '@noble/curves/misc.js';
import { poseidon3 } from 'poseidon-lite';
import { encryptFields } from '../src/encryption.mjs';
import { buildWitness, buildRevocationWitness, revocationLeaf, decryptEnvelope } from '../src/witness.mjs';
import { FIELD, SCALAR_ORDER, SparseMerkleTree, noteCommitment, nullifier, contextHash, ownerHash, podSecretHash } from '../src/model.mjs';
import { makeDepositConfig, makePolicyConfig, TEST_RANDOMNESS } from './model-fixtures.mjs';

const enabled = process.env.PRIVACY_CIRCUIT_TESTS === '1';
const artifactDir = process.env.PRIVACY_CIRCUIT_DIR
  ? resolve(process.env.PRIVACY_CIRCUIT_DIR)
  : fileURLToPath(new URL('../../artifacts/privacy-v2/circuit/', import.meta.url));
const require = createRequire(import.meta.url);
const G = babyjubjub.Point.BASE;
const clone = value => structuredClone(value);
const bump = value => (value + 1n) % FIELD;

async function loadCalculator(name) {
  const dir = join(artifactDir, `${name}_js`);
  const factory = require(join(dir, 'witness_calculator.js'));
  return factory(readFileSync(join(dir, `${name}.wasm`)));
}

// Rebuild honest commitments, roots and complete ciphertext after an attacker's
// policy edit. An invalid policy must fail its own constraint, not merely a
// stale output commitment, encryption tag or root from the original fixture.
// Fixture trees contain only their input notes, at the declared indices.
function rebindNotes(w) {
  const tree = new SparseMerkleTree(32);
  for (let i = 0; i < 2; i++) if (w.inNotes[i][3] > 0n) tree.set(w.inIndices[i], noteCommitment(w.inNotes[i]));
  w.core[8] = tree.root; w.core[9] = tree.root;
  for (let i = 0; i < 2; i++) {
    w.core[12 + i] = nullifier(w.inNotes[i]);
    w.inPaths[i] = w.inNotes[i][3] > 0n ? tree.path(w.inIndices[i]) : Array(32).fill(0n);
  }
  let index = w.core[11];
  for (let i = 0; i < 2; i++) {
    w.core[14 + i] = noteCommitment(w.outNotes[i]);
    w.appendPaths[i] = w.outNotes[i][3] > 0n ? tree.path(index) : Array(32).fill(0n);
    if (w.outNotes[i][3] > 0n) tree.set(index++, w.core[14 + i]);
  }
  w.core[10] = tree.root;
  reencrypt(w);
}

function reencrypt(w, { legacyDummy = false, falseAsset = false } = {}) {
  const ins = w.inNotes, outs = w.outNotes, all = [...ins, ...outs];
  const messages = [
    ...outs.map(n => n[3] === 0n && !legacyDummy ? Array(24).fill(0n) : n),
    [falseAsset ? bump(ins[0][2]) : ins[0][2], ins[0][3], ins[1][3], outs[0][3], outs[1][3],
      noteCommitment(ins[0]), noteCommitment(ins[1]), w.core[18], w.core[20]],
    all.flatMap(n => [n[5], n[6], n[7]]),
    [...all.flatMap(n => [n[4],n[8],n[9],n[10],n[11],n[12],n[13],n[14],n[15],n[16],n[17]]), 0n],
  ];
  const points = [[outs[0][20],outs[0][21]], [outs[1][20],outs[1][21]], ...Array(3).fill([w.core[3],w.core[4]])];
  const context = contextHash(w.core);
  w.encrypted = messages.flatMap((message, slot) => {
    const U = G.multiply(w.encSecrets[slot]);
    const shared = babyjubjub.Point.fromAffine({ x: points[slot][0], y: points[slot][1] }).multiply(w.encSecrets[slot]);
    const key = [poseidon3([shared.x,context,BigInt(slot + 1)]), poseidon3([shared.y,context,BigInt(slot + 1)])];
    return [U.x, U.y, w.encNonces[slot], ...encryptFields(message, key, w.encNonces[slot])];
  });
}

test('compiled transition and revocation reject adversarial witnesses', {
  skip: enabled ? false : 'Set PRIVACY_CIRCUIT_TESTS=1 after compiling the current circuits',
  timeout: 180_000,
}, async t => {
  const transition = await loadCalculator('transition');
  const revocation = await loadCalculator('revocation');
  const baseline = new Map();
  for (const [name, config] of [['deposit', makeDepositConfig()], ...Array.from({length: 6}, (_, i) => [`mode${i}`, makePolicyConfig(BigInt(i))])]) {
    const { witness } = buildWitness(config, TEST_RANDOMNESS);
    baseline.set(name, witness);
    await t.test(`accepts ${name} and matches all157 public fields`, async () => {
      const result = await transition.calculateWitness(witness, true);
      assert.equal(result[0], 1n);
      assert.deepEqual(result.slice(1, 158), [...witness.core, ...witness.encrypted]);
      if (witness.outNotes[1][3] === 0n) {
        assert.deepEqual(decryptEnvelope(witness.core, witness.encrypted, 1, 1n), Array(24).fill(0n));
      }
    });
  }
  const reject = async (name, base, mutate) => {
    await t.test(name, async () => {
      const w = clone(baseline.get(base)); mutate(w);
      await assert.rejects(transition.calculateWitness(w, true), /Assert Failed|Error in template/);
    });
  };
  await reject('rejects self-consistent minted output value', 'mode0', w => { w.outNotes[0][3]++; rebindNotes(w); });
  await reject('rejects wrong cash spending secret', 'mode0', w => { w.authSecrets[0]++; });
  await reject('rejects the known zero spending secret even when its owner hash matches', 'mode0', w => {
    w.authSecrets[0] = 0n; w.inNotes[0][5] = ownerHash(0n); rebindNotes(w);
  });
  await reject('rejects wrong Pod secret', 'mode1', w => { w.podSecrets[0]++; });
  await reject('rejects the known zero Pod secret even when its hash matches', 'mode1', w => {
    w.podSecrets[0] = 0n; w.inNotes[0][8] = podSecretHash(0n); rebindNotes(w);
  });
  await reject('rejects Pod before the committed unlock ledger', 'mode1', w => { w.inNotes[0][9] = 101n; rebindNotes(w); });
  await reject('rejects Pod redirected to another valid cash owner', 'mode1', w => { w.outNotes[0][5]++; rebindNotes(w); });
  await reject('rejects Trigger signature scalar mutation', 'mode2', w => { w.attestSignatures[0][2]++; });
  await reject('rejects Trigger terms changed after signing', 'mode2', w => { w.inNotes[0][11]++; rebindNotes(w); });
  await reject('rejects Trigger signature scalar q alias', 'mode2', w => { w.attestSignatures[0][2] += SCALAR_ORDER; });
  await reject('rejects Trigger refund at its deadline', 'mode3', w => { w.inNotes[0][10] = w.core[6]; rebindNotes(w); });
  await reject('rejects self-consistent Envoy fee diversion', 'mode4', w => {
    w.outNotes[0][3] = 1n; w.outNotes[1][3] = 60n;
    w.core[17] = w.inNotes[0][2]; w.core[20] = 39n; w.core[21] = 909n; rebindNotes(w);
  });
  await reject('rejects self-consistent Envoy over-cap payment', 'mode4', w => { w.outNotes[0][3] = 41n; w.outNotes[1][3] = 59n; rebindNotes(w); });
  await reject('rejects Envoy recipient redirection', 'mode4', w => { w.outNotes[0][5]++; rebindNotes(w); });
  await reject('rejects Envoy successor cap expansion', 'mode4', w => { w.outNotes[1][14]++; rebindNotes(w); });
  await reject('rejects Envoy successor count not decremented', 'mode4', w => { w.outNotes[1][15]++; rebindNotes(w); });
  await reject('rejects Envoy after revocation with the current root and path', 'mode4', w => {
    const tree = new SparseMerkleTree(128), index = w.inNotes[0][16] & ((1n << 128n) - 1n);
    tree.set(index, revocationLeaf(w.core[0])); w.core[5] = tree.root; w.revokePaths[0] = tree.path(index); reencrypt(w);
  });
  await reject('rejects wrong input membership path', 'mode0', w => { w.inPaths[0][0] = bump(w.inPaths[0][0]); });
  await reject('rejects wrong append path', 'deposit', w => { w.appendPaths[0][0] = bump(w.appendPaths[0][0]); });
  await reject('rejects self-consistent reused output nullifier seed', 'mode0', w => { w.outNotes[0][18] = w.inNotes[0][18]; rebindNotes(w); });
  await reject('rejects altered public ciphertext', 'deposit', w => { w.encrypted[27] = bump(w.encrypted[27]); });
  await reject('rejects authenticated encryption of false audit facts', 'mode0', w => { reencrypt(w, { falseAsset: true }); });
  await reject('rejects legacy dummy ciphertext exposing the hidden asset', 'mode0', w => { reencrypt(w, { legacyDummy: true }); });
  await reject('rejects a repeated ephemeral encryption secret with valid ciphertext', 'deposit', w => { w.encSecrets[1] = w.encSecrets[0]; reencrypt(w); });
  await reject('rejects zero encryption nonce with valid ciphertext', 'deposit', w => { w.encNonces[0] = 0n; reencrypt(w); });
  await reject('rejects a repeated encryption nonce with valid ciphertext', 'deposit', w => { w.encNonces[1] = w.encNonces[0]; reencrypt(w); });
  await reject('rejects a false subgroup preimage for an output view point', 'deposit', w => { w.pointPreimages[0] = [...w.outNotes[0].slice(20,22)]; });

  const revoked = buildRevocationWitness({ domain: 101n, tree: new SparseMerkleTree(128), tag: (1n << 130n) + 55n });
  await t.test('accepts domain-bound revocation and all4 public fields', async () => {
    const result = await revocation.calculateWitness(revoked.witness, true);
    assert.deepEqual(result.slice(1,5), revoked.publicInputs);
  });
  for (const [name, mutate] of [
    ['changed domain', w => { w.core[0]++; }],
    ['changed target index', w => { w.core[3]++; }],
    ['forged old root', w => { w.core[1] = bump(w.core[1]); }],
    ['forged new root', w => { w.core[2] = bump(w.core[2]); }],
    ['wrong path', w => { w.path[0] = bump(w.path[0]); }],
    ['zero tag', w => { w.core[3] = 0n; }],
  ]) {
    await t.test(`rejects revocation ${name}`, async () => {
      const w = clone(revoked.witness); mutate(w);
      await assert.rejects(revocation.calculateWitness(w, true), /Assert Failed|Error in template/);
    });
  }
});
