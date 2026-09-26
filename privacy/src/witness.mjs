// Browser-compatible local witness construction. No proof acceptance, transport,
// persistence or wallet operations. The returned witness contains secret data:
// never serialize it to RPC, analytics, public archives or error reports.
import { babyjubjub } from '@noble/curves/misc.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { poseidon2, poseidon3 } from 'poseidon-lite';
import { encryptFields, decryptFields } from './encryption.mjs';
import { fail, list, record, freeze } from './validation.mjs';
import { BASE8, SCALAR_ORDER, bounded, fieldArray, fieldElement, checkedPoint, parseNote24, parseCore23,
  noteCommitment, nullifier, contextHash, SparseMerkleTree, evaluateTransition } from './model.mjs';

const G = babyjubjub.Point.BASE;
const INV8 = 2394026564107420727433200628387514462817212225638746351800188703329891451411n;
const LENGTHS = [24, 24, 9, 12, 45], OFFSETS = [0, 28, 56, 69, 85];
const KEYS = ['domain','epoch','auditor','validFrom','validUntil','inputTree','appendTree','assetTree','revocationTree',
  'nextIndex','assetIndex','inNotes','outNotes','inIndices','authSecrets','podSecrets','modes','attestSignatures','bridge','fee'];
export function revocationLeaf(domain) {
  fieldElement(domain); ensure(domain !== 0n, 'NONZERO_DOMAIN'); return poseidon2([1005n, domain]);
}
export function buildRevocationWitness(value) {
  const v = record(value, ['domain','tree','tag'], 'revocation');
  const leaf = revocationLeaf(v.domain), old = tree(v.tree, 128, 'REVOCATION');
  fieldElement(v.tag); ensure(v.tag > 0n, 'NONZERO_TAG');
  const index = v.tag & ((1n << 128n) - 1n);
  ensure(old.get(index) === 0n, 'ALREADY_REVOKED_OR_COLLISION');
  const path = old.path(index), nextTree = old.clone(); nextTree.set(index, leaf);
  const core = Object.freeze([v.domain, old.root, nextTree.root, v.tag]);
  return Object.freeze({ kind: 'UnverifiedRevocationWitness', publicInputs: core, witness: freeze({ core, path }), nextTree });
}
function ensure(condition, code) { if (!condition) fail(code, 'witness'); }
function pair(value, parser) {
  const a = list(value, 2, 'pair'); ensure(a.length === 2, 'EXACT_PAIR_REQUIRED'); return a.map(parser);
}
function scalar(n) { fieldElement(n); ensure(n > 0n && n < SCALAR_ORDER, 'SCALAR_OUT_OF_RANGE'); return n; }
function randomInteger(bytes, max, mask = 255) {
  for (let attempt = 0; attempt < 256; attempt++) {
    const data = globalThis.crypto.getRandomValues(new Uint8Array(bytes)); data[0] &= mask;
    const n = BigInt(`0x${bytesToHex(data)}`); if (n > 0n && n < max) return n;
  }
  fail('RANDOMNESS_FAILURE', 'randomness');
}
export const randomFieldSecret = () => randomInteger(31, 1n << 248n);
export function createNote24(template) {
  const note = fieldArray(template, 24, 'note');
  ensure(note[3] > 0n && note[18] === 0n && note[19] === 0n, 'FRESH_NOTE_TEMPLATE_REQUIRED');
  note[18] = randomFieldSecret(); note[19] = randomFieldSecret();
  return parseNote24(note);
}
function randomness(options) {
  if (options === undefined) {
    const unique = generate => {
      const values = new Set();
      for (let attempt = 0; attempt < 256 && values.size < 5; attempt++) values.add(generate());
      ensure(values.size === 5, 'RANDOMNESS_UNIQUENESS_FAILURE'); return [...values];
    };
    return { scalars: unique(() => randomInteger(32, SCALAR_ORDER, 7)), nonces: unique(() => randomInteger(16, 1n << 128n)) };
  }
  const o = record(options, ['testRandomness'], 'options');
  const r = record(o.testRandomness, ['scalars','nonces'], 'testRandomness');
  const scalars = fieldArray(r.scalars, 5, 'scalars').map(scalar);
  const nonces = fieldArray(r.nonces, 5, 'nonces').map(n => { bounded(n, 128); ensure(n !== 0n, 'ZERO_NONCE'); return n; });
  ensure(new Set(scalars).size === 5 && new Set(nonces).size === 5, 'DISTINCT_ENVELOPE_RANDOMNESS');
  return { scalars, nonces };
}
function tree(value, depth, name) {
  ensure(value instanceof SparseMerkleTree && value.depth === depth, `INVALID_${name}_TREE`); return value;
}
function pointPreimage(coordinates) {
  const Q = checkedPoint(coordinates).multiply(INV8); return [Q.x, Q.y];
}
function keyFor(shared, context, slot) {
  return [poseidon3([shared.x, context, BigInt(slot + 1)]), poseidon3([shared.y, context, BigInt(slot + 1)])];
}
function messageFields(ins, outs, core) {
  const all = [...ins, ...outs];
  // A dummy view is Base8, whose scalar is publicly known (1). Encrypting its
  // internal dummyNote would therefore reveal the hidden asset. Only real
  // outputs carry a note; an absent incoming slot carries an all-zero sentinel.
  const incoming = outs.map(note => note[3] === 0n ? Array(24).fill(0n) : note);
  return [...incoming,
    [ins[0][2], ins[0][3], ins[1][3], outs[0][3], outs[1][3], noteCommitment(ins[0]), noteCommitment(ins[1]), core[18], core[20]],
    all.flatMap(n => [n[5], n[6], n[7]]),
    [...all.flatMap(n => [n[4],n[8],n[9],n[10],n[11],n[12],n[13],n[14],n[15],n[16],n[17]]), 0n]];
}
export function ciphertextBytes(encrypted) {
  const fields = fieldArray(encrypted, 134, 'encrypted'), bytes = new Uint8Array(134 * 32);
  fields.forEach((value, i) => { for (let j = 31; j >= 0; j--) { bytes[i * 32 + j] = Number(value & 255n); value >>= 8n; } });
  return bytes;
}

export function buildWitness(value, options) {
  const v = record(value, KEYS, 'configuration');
  const ins = pair(v.inNotes, parseNote24), outs = pair(v.outNotes, parseNote24);
  const inputTree = tree(v.inputTree, 32, 'INPUT'), oldTree = tree(v.appendTree, 32, 'APPEND');
  const assets = tree(v.assetTree, 8, 'ASSET'), revoked = tree(v.revocationTree, 128, 'REVOCATION');
  const inputIndices = fieldArray(v.inIndices, 2, 'inIndices'), modes = fieldArray(v.modes, 2, 'modes');
  const auth = fieldArray(v.authSecrets, 2, 'authSecrets'), pod = fieldArray(v.podSecrets, 2, 'podSecrets');
  const signatures = pair(v.attestSignatures, sig => fieldArray(sig, 3, 'attestSignature'));
  const asset = ins[0][2], assetIndex = bounded(v.assetIndex, 8);
  ensure(assets.get(assetIndex) === asset, 'ASSET_NOT_ALLOWLISTED');
  const bridge = record(v.bridge, ['kind','amount','accountId'], 'bridge');
  const fee = record(v.fee, ['amount','accountId'], 'fee');
  const auditor = fieldArray(v.auditor, 2, 'auditor'); checkedPoint(auditor);
  const nextIndex = bounded(v.nextIndex, 33); ensure(nextIndex <= 1n << 32n, 'TREE_CAPACITY');
  const inPaths = ins.map((note, i) => {
    if (note[3] === 0n) { ensure(inputIndices[i] === 0n, 'DUMMY_INDEX'); return Array(32).fill(0n); }
    bounded(inputIndices[i], 32);
    ensure(inputTree.get(inputIndices[i]) === noteCommitment(note), 'INPUT_NOTE_NOT_FOUND');
    return inputTree.path(inputIndices[i]);
  });
  const nextTree = oldTree.clone(); let cursor = nextIndex;
  const appendPaths = outs.map(note => {
    if (note[3] === 0n) return Array(32).fill(0n);
    ensure(cursor < 1n << 32n, 'TREE_CAPACITY'); ensure(nextTree.get(cursor) === 0n, 'APPEND_SLOT_OCCUPIED');
    const path = nextTree.path(cursor); nextTree.set(cursor, noteCommitment(note)); cursor++;
    return path;
  });
  const core = parseCore23([v.domain, assets.root, v.epoch, ...auditor, revoked.root, v.validFrom, v.validUntil,
    inputTree.root, oldTree.root, nextTree.root, nextIndex, ...ins.map(nullifier), ...outs.map(noteCommitment),
    bridge.kind, bridge.kind !== 0n || fee.amount > 0n ? asset : 0n, bridge.amount, bridge.accountId, fee.amount, fee.accountId, 2n]);
  const revokePaths = ins.map((note, i) => modes[i] === 4n ? revoked.path(note[16] & ((1n << 128n) - 1n)) : Array(128).fill(0n));
  evaluateTransition({ core, inNotes: ins, outNotes: outs, modes, authSecrets: auth, podSecrets: pod, attestSignatures: signatures, revokePaths });
  const context = contextHash(core), r = randomness(options);
  const messages = messageFields(ins, outs, core), destinations = [[outs[0][20],outs[0][21]], [outs[1][20],outs[1][21]], auditor, auditor, auditor];
  const encrypted = messages.flatMap((message, slot) => {
    const ephemeral = G.multiply(r.scalars[slot]);
    const shared = checkedPoint(destinations[slot]).multiply(r.scalars[slot]);
    return [ephemeral.x, ephemeral.y, r.nonces[slot], ...encryptFields(message, keyFor(shared, context, slot), r.nonces[slot])];
  });
  ensure(encrypted.length === 134, 'CIPHERTEXT_COUNT');
  const selectedAttest = note => note[4] === 2n && note[3] > 0n ? [note[12], note[13]] : BASE8;
  const selectedTarget = note => note[4] === 3n && note[3] > 0n ? [note[22], note[23]] : BASE8;
  const points = [destinations[0], destinations[1], auditor, ...ins.map(selectedAttest), ...outs.map(selectedAttest), ...outs.map(selectedTarget),
    ...signatures.map((sig, i) => modes[i] === 2n ? [sig[0], sig[1]] : BASE8)];
  const witness = freeze({ core, encrypted, inNotes: ins, outNotes: outs, inPaths, inIndices: inputIndices, appendPaths,
    assetPath: assets.path(assetIndex), assetIndex, authSecrets: auth, podSecrets: pod, modes, attestSignatures: signatures,
    revokePaths, pointPreimages: points.map(pointPreimage), encSecrets: r.scalars, encNonces: r.nonces });
  return Object.freeze({ kind: 'UnverifiedTransitionWitness', witness, publicInputs: Object.freeze([...core, ...encrypted]),
    nextTree, context, ciphertextDigest: bytesToHex(sha256(ciphertextBytes(encrypted))) });
}

function envelope(core, encrypted, slot) {
  ensure(Number.isInteger(slot) && slot >= 0 && slot < 5, 'ENVELOPE_SLOT');
  const c = parseCore23(core), all = fieldArray(encrypted, 134, 'encrypted'), start = OFFSETS[slot];
  const ephemeral = checkedPoint(all.slice(start, start + 2)), nonce = bounded(all[start + 2], 128);
  return { context: contextHash(c), ephemeral, nonce, cipher: all.slice(start + 3, start + 4 + LENGTHS[slot]) };
}
// Incoming slots 0/1 return either a real note24 or the all-zero absent-slot
// sentinel. Callers must ignore that sentinel, never pass it to parseNote24.
export function decryptEnvelope(core, encrypted, slot, viewSecret) {
  const e = envelope(core, encrypted, slot), shared = e.ephemeral.multiply(scalar(viewSecret));
  return decryptFields(e.cipher, keyFor(shared, e.context, slot), e.nonce, LENGTHS[slot]);
}
export function decryptEnvelopeWithSharedPoint(core, encrypted, slot, sharedPoint) {
  const e = envelope(core, encrypted, slot), shared = checkedPoint(sharedPoint);
  return decryptFields(e.cipher, keyFor(shared, e.context, slot), e.nonce, LENGTHS[slot]);
}
