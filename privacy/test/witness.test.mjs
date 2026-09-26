import test from 'node:test';
import assert from 'node:assert/strict';
import { babyjubjub } from '@noble/curves/misc.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { buildWitness, decryptEnvelope, decryptEnvelopeWithSharedPoint, createNote24, revocationLeaf, buildRevocationWitness } from '../src/witness.mjs';
import { BASE8, FIELD, SCALAR_ORDER, SparseMerkleTree, dummyNote, noteCommitment, nullifier, ownerHash, rootFromPath } from '../src/model.mjs';
import { makePolicyConfig } from './model-fixtures.mjs';

const Point = babyjubjub.Point;
const coord = scalar => { const p = Point.BASE.multiply(scalar); return [p.x, p.y]; };
function note(amount = 100n) {
  const n = [...dummyNote(101n, 202n)]; n[3] = amount; n[5] = ownerHash(11n); n[18] = 333n; n[19] = 444n;
  [n[20], n[21]] = coord(7n); return n;
}
function config() {
  const assetTree = new SparseMerkleTree(8); assetTree.set(2n, 202n);
  return { domain: 101n, epoch: 1n, auditor: coord(13n), validFrom: 100n, validUntil: 110n,
    inputTree: new SparseMerkleTree(32), appendTree: new SparseMerkleTree(32), assetTree, revocationTree: new SparseMerkleTree(128),
    nextIndex: 0n, assetIndex: 2n, inNotes: [dummyNote(101n, 202n), dummyNote(101n, 202n)],
    outNotes: [note(), dummyNote(101n, 202n)], inIndices: [0n, 0n], authSecrets: [0n, 0n], podSecrets: [0n, 0n], modes: [0n, 0n],
    attestSignatures: [[...BASE8, 0n], [...BASE8, 0n]], bridge: { kind: 1n, amount: 100n, accountId: 303n }, fee: { amount: 0n, accountId: 0n } };
}
const deterministic = { testRandomness: { scalars: [1n, 2n, 3n, 4n, 5n], nonces: [6n, 7n, 8n, 9n, 10n] } };

test('builds exact157public inputs,134cipher fields and a recipient-decryptable actual note', () => {
  const c = config(), result = buildWitness(c, deterministic), w = result.witness;
  assert.equal(result.kind, 'UnverifiedTransitionWitness'); assert.equal(w.core.length, 23); assert.equal(w.encrypted.length, 134);
  assert.equal(result.publicInputs.length, 157); assert.deepEqual(result.publicInputs, [...w.core, ...w.encrypted]);
  assert.deepEqual(decryptEnvelope(w.core, w.encrypted, 0, 7n), c.outNotes[0]);
  assert.equal(c.appendTree.get(0n), 0n); assert.equal(result.nextTree.get(0n), noteCommitment(c.outNotes[0]));
  assert.equal(rootFromPath(0n, 0n, w.appendPaths[0]), c.appendTree.root);
  assert.equal(w.core[10], result.nextTree.root);
  assert.equal(w.pointPreimages.length, 11);
  const bytes = Uint8Array.from(w.encrypted.flatMap(n => [...Buffer.from(n.toString(16).padStart(64, '0'), 'hex')]));
  assert.equal(result.ciphertextDigest, bytesToHex(sha256(bytes)));
});

test('audit envelopes encrypt true asset/party/condition facts without rho or blinding', () => {
  const c = config(), { witness: w } = buildWitness(c, deterministic);
  const asset = decryptEnvelope(w.core, w.encrypted, 2, 13n);
  assert.deepEqual(asset, [202n, 0n, 0n, 100n, 0n, 0n, 0n, 100n, 0n]);
  const parties = decryptEnvelope(w.core, w.encrypted, 3, 13n);
  assert.deepEqual(parties, [0n,0n,0n,0n,0n,0n,ownerHash(11n),0n,0n,0n,0n,0n]);
  const terms = decryptEnvelope(w.core, w.encrypted, 4, 13n);
  assert.equal(terms.length, 45); assert.ok(terms.every(n => n === 0n));
  const shared = Point.BASE.multiply(13n).multiply(3n);
  assert.deepEqual(decryptEnvelopeWithSharedPoint(w.core, w.encrypted, 2, [shared.x, shared.y]), asset);
});

test('public scalar1 decrypts dummy incoming envelopes to zeros, never the hidden asset', () => {
  for (const mode of [0n, 1n, 2n, 5n]) {
    const c = makePolicyConfig(mode), { witness: w } = buildWitness(c, deterministic);
    assert.equal(w.core[17], 0n, `mode ${mode} does not publish its asset`);
    assert.equal(w.core[15], 0n, `mode ${mode} has a dummy second output`);
    // Anyone can use the known Base8 discrete logarithm (1) without spending
    // authority, threshold shares or any recipient secret. Prior code exposed
    // dummyNote[2] here, defeating hidden-asset internal transitions.
    const publiclyDecrypted = decryptEnvelope(w.core, w.encrypted, 1, 1n);
    assert.deepEqual(publiclyDecrypted, Array(24).fill(0n), `mode ${mode} dummy confidentiality`);
    assert.deepEqual(decryptEnvelope(w.core, w.encrypted, 0, 7n), c.outNotes[0]);
    assert.deepEqual(w.outNotes[1], dummyNote(101n, 202n));
  }
});

test('ciphertext decryption fails for wrong key, swapped envelope, context and modified tag', () => {
  const { witness: w } = buildWitness(config(), deterministic);
  assert.throws(() => decryptEnvelope(w.core, w.encrypted, 0, 8n));
  const core = w.core.slice(); core[6]++; assert.throws(() => decryptEnvelope(core, w.encrypted, 0, 7n));
  const cipher = w.encrypted.slice(); cipher[27] = (cipher[27] + 1n) % FIELD;
  assert.throws(() => decryptEnvelope(w.core, cipher, 0, 7n));
  const swapped = [...w.encrypted.slice(28, 56), ...w.encrypted.slice(0, 28), ...w.encrypted.slice(56)];
  assert.throws(() => decryptEnvelope(w.core, swapped, 0, 7n));
});

test('witness refuses missing input note, occupied append slot, wrong asset membership and nonce/scalar aliases', () => {
  const missing = config(); missing.inNotes[0] = note(); missing.authSecrets[0] = 11n;
  missing.outNotes[0][18]++; missing.bridge = { kind: 0n, amount: 0n, accountId: 0n };
  assert.throws(() => buildWitness(missing, deterministic));
  const occupied = config(); occupied.appendTree.set(0n, 999n); assert.throws(() => buildWitness(occupied, deterministic));
  const asset = config(); asset.assetIndex = 3n; assert.throws(() => buildWitness(asset, deterministic));
  for (const scalar of [0n, SCALAR_ORDER, -1n]) {
    assert.throws(() => buildWitness(config(), { testRandomness: { ...deterministic.testRandomness, scalars: [scalar,2n,3n,4n,5n] } }));
  }
  assert.throws(() => buildWitness(config(), { testRandomness: { ...deterministic.testRandomness, nonces: [1n<<128n,7n,8n,9n,10n] } }));
});

test('fully spent withdrawal remains constructible when append tree is at capacity', () => {
  const c = config(); c.inNotes[0] = note(); c.inputTree.set(5n, noteCommitment(note()));
  c.appendTree = c.inputTree.clone(); c.inIndices[0] = 5n; c.nextIndex = 1n<<32n;
  c.authSecrets[0] = 11n; c.outNotes[0] = dummyNote(101n, 202n); c.bridge = { kind: 2n, amount: 100n, accountId: 303n };
  const { witness: w } = buildWitness(c, deterministic);
  assert.equal(w.core[12], nullifier(note())); assert.equal(w.core[9], w.core[10]);
  assert.equal(w.core[11], 1n<<32n); assert.equal(w.core[14], 0n); assert.equal(w.core[15], 0n);
});

test('default generation uses fresh nonzero secrets; deterministic material is explicit', () => {
  const a = buildWitness(config()), b = buildWitness(config());
  assert.notDeepEqual(a.witness.encSecrets, b.witness.encSecrets);
  assert.notDeepEqual(a.witness.encNonces, b.witness.encNonces);
  assert.equal(new Set(a.witness.encSecrets).size, 5); assert.equal(new Set(a.witness.encNonces).size, 5);
  const template = note(); template[18] = 0n; template[19] = 0n;
  const first = createNote24(template), second = createNote24(template);
  assert.notEqual(first[18], second[18]); assert.notEqual(first[19], second[19]);
  assert.equal(template[18], 0n); assert.throws(() => createNote24(note()));
});

test('revocation insertion binds domain, targets low128tag bits and cannot overwrite an occupied leaf', () => {
  const tree = new SparseMerkleTree(128), tag = (1n << 130n) + 55n;
  const r = buildRevocationWitness({ domain: 101n, tree, tag });
  assert.deepEqual(r.publicInputs, [101n, tree.root, r.nextTree.root, tag]);
  assert.deepEqual(r.witness.core, r.publicInputs);
  assert.equal(r.nextTree.get(55n), revocationLeaf(101n)); assert.equal(tree.get(55n), 0n);
  assert.equal(rootFromPath(0n, 55n, r.witness.path), tree.root);
  assert.equal(rootFromPath(revocationLeaf(101n), 55n, r.witness.path), r.nextTree.root);
  assert.notEqual(revocationLeaf(101n), revocationLeaf(102n));
  assert.throws(() => buildRevocationWitness({ domain: 101n, tree: r.nextTree, tag: 55n }));
  assert.throws(() => buildRevocationWitness({ domain: 0n, tree, tag }));
  assert.throws(() => buildRevocationWitness({ domain: 101n, tree, tag: 0n }));
  assert.throws(() => buildRevocationWitness({ domain: 101n, tree, tag: FIELD }));
});
