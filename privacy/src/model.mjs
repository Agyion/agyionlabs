// Reference policy/encoding model, not a proof verifier or live pool.
import { babyjubjub } from '@noble/curves/misc.js';
import { poseidon1, poseidon2, poseidon4, poseidon5, poseidon6 } from 'poseidon-lite';
import { fail, list, record, freeze } from './validation.mjs';

export const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const SCALAR_ORDER = babyjubjub.Point.Fn.ORDER;
export const BASE8 = Object.freeze([babyjubjub.Point.BASE.x, babyjubjub.Point.BASE.y]);
export const TAGS = Object.freeze({ NOTE: 1001n, NULLIFIER: 1002n, CONTEXT: 1003n, POD: 1004n });

export function fieldElement(n, path = 'field') {
  if (typeof n !== 'bigint' || n < 0n || n >= FIELD) fail('CANONICAL_FIELD_REQUIRED', path);
  return n;
}
export function bounded(n, bits, path = 'integer') {
  fieldElement(n, path);
  if (n >= 1n << BigInt(bits)) fail('INTEGER_OUT_OF_RANGE', path);
  return n;
}
export function fieldArray(value, count, path = 'fields') {
  const v = list(value, count, path);
  if (v.length !== count) fail('EXACT_LENGTH_REQUIRED', path);
  return v.map(n => fieldElement(n, path));
}
export function checkedPoint(value) {
  const [x, y] = fieldArray(value, 2, 'point');
  try {
    const p = babyjubjub.Point.fromAffine({ x, y }); p.assertValidity();
    if (p.is0() || !p.isTorsionFree()) throw new Error();
    return p;
  } catch { fail('PRIME_SUBGROUP_POINT_REQUIRED', 'point'); }
}
function requireValue(condition, code = 'POLICY_MISMATCH') { if (!condition) fail(code, 'transition'); }
function nonzero(n, path) { requireValue(n !== 0n, `NONZERO_${path}_REQUIRED`); }
function zeros(note, slots) { for (const i of slots) requireValue(note[i] === 0n, 'UNUSED_NOTE_FIELD'); }

export function dummyNote(domain, asset) {
  fieldElement(domain); fieldElement(asset); nonzero(domain, 'DOMAIN'); nonzero(asset, 'ASSET');
  const n = Array(24).fill(0n); n[0] = 2n; n[1] = domain; n[2] = asset;
  [n[20], n[21]] = BASE8;
  return Object.freeze(n);
}
export function parseNote24(value) {
  const n = fieldArray(value, 24, 'note');
  requireValue(n[0] === 2n, 'NOTE_VERSION'); nonzero(n[1], 'DOMAIN'); nonzero(n[2], 'ASSET');
  bounded(n[3], 64); bounded(n[9], 32); bounded(n[10], 32); bounded(n[14], 64); bounded(n[15], 32);
  requireValue(n[4] <= 3n, 'NOTE_KIND');
  if (n[3] === 0n) {
    const canonical = dummyNote(n[1], n[2]);
    requireValue(n.every((v, i) => v === canonical[i]), 'NONCANONICAL_DUMMY');
    return Object.freeze(n);
  }
  for (const i of [5, 18, 19]) nonzero(n[i], 'NOTE_FIELD');
  checkedPoint([n[20], n[21]]);
  if (n[4] === 0n) zeros(n, [6,7,8,9,10,11,12,13,14,15,16,17,22,23]);
  if (n[4] === 1n) {
    nonzero(n[8], 'POD_HASH'); zeros(n, [6,7,10,12,13,14,15,16,17,22,23]);
  }
  if (n[4] === 2n) {
    nonzero(n[6], 'REFUND'); nonzero(n[10], 'DEADLINE');
    checkedPoint([n[12], n[13]]); zeros(n, [7,8,9,14,15,16,17,22,23]);
  }
  if (n[4] === 3n) {
    for (const i of [7,14,15,16,17]) nonzero(n[i], 'ENVOY_FIELD');
    requireValue(n[10] > n[9], 'ENVOY_INTERVAL'); checkedPoint([n[22], n[23]]);
    zeros(n, [6,8,12,13]);
  }
  return Object.freeze(n);
}
export function hashChain(tag, values) {
  let state = fieldElement(tag);
  for (const n of values) state = poseidon2([state, fieldElement(n)]);
  return state;
}
export const ownerHash = secret => poseidon1([fieldElement(secret)]);
export const podSecretHash = secret => poseidon2([TAGS.POD, fieldElement(secret)]);
export function noteCommitment(value) { const n = parseNote24(value); return n[3] === 0n ? 0n : hashChain(TAGS.NOTE, n); }
export function nullifier(value) { const n = parseNote24(value); return n[3] === 0n ? 0n : poseidon4([TAGS.NULLIFIER, n[1], n[18], noteCommitment(n)]); }
export function contextHash(core) { return hashChain(TAGS.CONTEXT, fieldArray(core, 23, 'core')); }
export function attestationMessage(value) {
  const n = parseNote24(value);
  requireValue(n[4] === 2n && n[3] > 0n, 'TRIGGER_REQUIRED');
  return poseidon6([n[1], noteCommitment(n), n[11], n[5], n[10], 1n]);
}

function treeDepth(depth) {
  if (!Number.isInteger(depth) || depth < 1 || depth > 128) fail('TREE_DEPTH_INVALID', 'depth');
  return depth;
}
function treeIndex(index, depth) {
  if (typeof index !== 'bigint' || index < 0n || index >= 1n << BigInt(depth)) fail('TREE_INDEX_INVALID', 'index');
  return index;
}
export function rootFromPath(leaf, index, siblings) {
  const path = list(siblings, 128, 'path').map(v => fieldElement(v));
  treeDepth(path.length); treeIndex(index, path.length);
  let node = fieldElement(leaf);
  for (let level = 0; level < path.length; level++) {
    node = (index >> BigInt(level)) & 1n ? poseidon2([path[level], node]) : poseidon2([node, path[level]]);
  }
  return node;
}
export class SparseMerkleTree {
  #nodes; #zeros;
  constructor(depth) {
    this.depth = treeDepth(depth); this.#nodes = Array.from({ length: depth + 1 }, () => new Map());
    this.#zeros = [0n];
    for (let i = 0; i < depth; i++) this.#zeros.push(poseidon2([this.#zeros[i], this.#zeros[i]]));
    Object.defineProperty(this, 'depth', { writable: false });
  }
  get root() { return this.#nodes[this.depth].get(0n) ?? this.#zeros[this.depth]; }
  get(index) { treeIndex(index, this.depth); return this.#nodes[0].get(index) ?? 0n; }
  path(index) {
    treeIndex(index, this.depth);
    return Array.from({ length: this.depth }, (_, level) => this.#nodes[level].get((index >> BigInt(level)) ^ 1n) ?? this.#zeros[level]);
  }
  set(index, value) {
    treeIndex(index, this.depth); fieldElement(value);
    for (let level = 0; level <= this.depth; level++) {
      if (value === this.#zeros[level]) this.#nodes[level].delete(index); else this.#nodes[level].set(index, value);
      if (level < this.depth) {
        const sibling = this.#nodes[level].get(index ^ 1n) ?? this.#zeros[level];
        value = index & 1n ? poseidon2([sibling, value]) : poseidon2([value, sibling]);
        index >>= 1n;
      }
    }
    return this;
  }
  clone() {
    const copy = new SparseMerkleTree(this.depth); copy.#nodes = this.#nodes.map(level => new Map(level)); return copy;
  }
}

export function parseCore23(value) {
  const c = fieldArray(value, 23, 'core');
  nonzero(c[0], 'DOMAIN'); nonzero(c[1], 'ASSET_POLICY'); bounded(c[2], 32); nonzero(c[2], 'EPOCH');
  checkedPoint([c[3], c[4]]); bounded(c[6], 32); bounded(c[7], 32);
  requireValue(c[6] <= c[7] && c[7] - c[6] <= 120n, 'LEDGER_INTERVAL');
  bounded(c[11], 33); requireValue(c[11] <= 1n << 32n, 'TREE_CAPACITY');
  requireValue(c[16] <= 2n && c[22] === 2n, 'BRIDGE_OR_SUITE');
  bounded(c[18], 64); bounded(c[20], 64);
  requireValue((c[20] === 0n) === (c[21] === 0n), 'FEE_RECIPIENT');
  if (c[16] === 0n) requireValue(c[18] === 0n && c[19] === 0n, 'INTERNAL_BRIDGE');
  else requireValue(c[17] > 0n && c[18] > 0n && c[19] > 0n, 'BRIDGE_FIELDS');
  if (c[16] === 0n && c[20] === 0n) requireValue(c[17] === 0n, 'HIDDEN_ASSET_REQUIRED');
  return Object.freeze(c);
}

export function evaluateTransition(value) {
  const v = record(value, ['core','inNotes','outNotes','modes','authSecrets','podSecrets','attestSignatures','revokePaths'], 'transition');
  const c = parseCore23(v.core);
  const pair = (values, parser) => { const a = list(values, 2, 'pair'); requireValue(a.length === 2, 'EXACT_PAIR_REQUIRED'); return a.map(parser); };
  const ins = pair(v.inNotes, parseNote24), outs = pair(v.outNotes, parseNote24);
  const modes = fieldArray(v.modes, 2), auth = fieldArray(v.authSecrets, 2), pod = fieldArray(v.podSecrets, 2);
  const signatures = pair(v.attestSignatures, a => fieldArray(a, 3, 'signature'));
  const revoke = pair(v.revokePaths, a => fieldArray(a, 128, 'revocationPath'));
  const asset = ins[0][2];
  for (const n of [...ins, ...outs]) requireValue(n[1] === c[0] && n[2] === asset, 'NOTE_DOMAIN_ASSET');
  if (c[16] !== 0n || c[20] > 0n) requireValue(c[17] === asset, 'PUBLIC_ASSET_BINDING');
  const real = ins.map(n => n[3] > 0n), noncash = ins.map((n, i) => real[i] && n[4] !== 0n);
  for (let i = 0; i < 2; i++) if (outs[i][3] > 0n) {
    requireValue(ins.every(n => n[3] === 0n || n[18] !== outs[i][18]), 'REUSED_OUTPUT_RHO');
    requireValue(i === 0 || outs[0][3] === 0n || outs[0][18] !== outs[i][18], 'REUSED_OUTPUT_RHO');
  }
  requireValue(!noncash.some(Boolean) || real.filter(Boolean).length === 1, 'CONDITIONAL_INPUT_ISOLATION');
  requireValue(outs[1][3] === 0n || outs[0][3] > 0n, 'OUTPUT_PACKING');
  for (let i = 0; i < 2; i++) {
    requireValue(c[12 + i] === nullifier(ins[i]) && c[14 + i] === noteCommitment(outs[i]), 'PUBLIC_NOTE_BINDING');
  }
  requireValue(c[12] === 0n || c[13] === 0n || c[12] !== c[13], 'DUPLICATE_NULLIFIER');
  requireValue(c[14] === 0n || c[15] === 0n || c[14] !== c[15], 'DUPLICATE_OUTPUT');
  if (c[16] === 1n) requireValue(!real.some(Boolean), 'DEPOSIT_INPUTS');
  if (c[16] === 2n) requireValue(!noncash.some(Boolean), 'WITHDRAWAL_INPUTS');
  const inputAmount = ins[0][3] + ins[1][3], outputAmount = outs[0][3] + outs[1][3];
  requireValue(inputAmount + (c[16] === 1n ? c[18] : 0n) === outputAmount + c[20] + (c[16] === 2n ? c[18] : 0n), 'VALUE_CONSERVATION');
  requireValue(real.some(Boolean) || c[16] === 1n, 'EMPTY_TRANSITION');
  const cashFor = (n, owner) => requireValue(n[3] > 0n && n[4] === 0n && n[5] === owner, 'CASH_DESTINATION');
  for (let i = 0; i < 2; i++) {
    const n = ins[i], mode = modes[i]; requireValue(mode <= 5n, 'INPUT_MODE');
    if (!real[i]) { requireValue(mode === 0n, 'DUMMY_MODE'); continue; }
    const authority = mode === 3n ? n[6] : mode === 4n ? n[7] : n[5];
    requireValue(auth[i] > 0n && ownerHash(auth[i]) === authority, 'SPEND_AUTHORITY');
    if (mode === 0n) { requireValue(n[4] === 0n, 'CASH_MODE'); continue; }
    requireValue(c[16] === 0n, 'CONDITIONAL_BRIDGE');
    if (mode !== 4n) { cashFor(outs[0], authority); requireValue(outs[1][3] === 0n, 'SINGLE_POLICY_OUTPUT'); }
    if (mode === 1n) requireValue(n[4] === 1n && pod[i] > 0n && podSecretHash(pod[i]) === n[8] && c[6] >= n[9], 'POD_CONDITION');
    if (mode === 2n) {
      requireValue(n[4] === 2n && c[7] <= n[10], 'ATTESTATION_INTERVAL');
      const [x, y, S] = signatures[i]; const R8 = checkedPoint([x, y]); requireValue(S < SCALAR_ORDER, 'SIGNATURE_SCALAR');
      // Exact circomlib EdDSAPoseidonVerifier relation. This is NOT noble's
      // generic BabyJub EdDSA (which has a different transcript).
      const A = checkedPoint([n[12], n[13]]);
      const h8 = 8n * poseidon5([x, y, n[12], n[13], attestationMessage(n)]) % SCALAR_ORDER;
      requireValue(babyjubjub.Point.BASE.multiplyUnsafe(S).equals(R8.add(A.multiplyUnsafe(h8))), 'INVALID_ATTESTATION');
    }
    if (mode === 3n) requireValue(n[4] === 2n && c[6] > n[10], 'REFUND_INTERVAL');
    if (mode === 5n) requireValue(n[4] === 3n, 'OWNER_RECLAIM');
    if (mode === 4n) {
      requireValue(c[20] === 0n, 'ENVOY_POOL_FEE');
      requireValue(n[4] === 3n && c[6] >= n[9] && c[7] <= n[10], 'ENVOY_INTERVAL');
      requireValue(rootFromPath(0n, n[16] & ((1n << 128n) - 1n), revoke[i]) === c[5], 'REVOKED_OR_STALE_ROOT');
      cashFor(outs[0], n[17]); requireValue(outs[0][20] === n[22] && outs[0][21] === n[23], 'ENVOY_VIEW_DESTINATION');
      requireValue(outs[0][3] + c[20] <= n[14], 'ENVOY_CAP');
      const remaining = n[3] - outs[0][3] - c[20], count = n[15] - 1n;
      requireValue(n[15] > 0n && remaining >= 0n && outs[1][3] === remaining, 'ENVOY_REMAINDER');
      if (remaining > 0n && count > 0n) {
        for (const slot of [0,1,2,4,5,6,7,8,9,10,11,12,13,14,16,17,20,21,22,23]) requireValue(outs[1][slot] === n[slot], 'ENVOY_SUCCESSOR_POLICY');
        requireValue(outs[1][15] === count, 'ENVOY_SUCCESSOR_COUNT');
      } else if (remaining > 0n) {
        cashFor(outs[1], n[5]); requireValue(outs[1][20] === n[20] && outs[1][21] === n[21], 'ENVOY_OWNER_VIEW');
      }
    }
  }
  return freeze({ kind: 'ValidTransitionModel', asset, inputAmount, outputAmount });
}
