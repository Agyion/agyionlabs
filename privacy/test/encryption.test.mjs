import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { encryptFields, decryptFields } from '../src/encryption.mjs';

const P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
// Fixed @zk-kit/poseidon-cipher 0.3.2 vector, also checked against compiled Circom.
const VECTOR = [
  7575929239585013979751057582394749172426812897646658665529383493955143077708n,
  7383660186163057279816957817862221774470286572104161691668703007586791156378n,
  18613722281216901239757768653925312215130450701066965342109078732633889368171n,
  15135438254867820906073374491723366412464421638417632510759571864032285136894n,
];

test('matches a fixed cipher vector and decrypts the exact three fields', () => {
  assert.deepEqual(encryptFields([1n, 2n, 3n], [4n, 5n], 6n), VECTOR);
  assert.deepEqual(decryptFields(VECTOR, [4n, 5n], 6n, 3), [1n, 2n, 3n]);
});

test('round trips multiple blocks, field boundaries and a maximum nonce without mutating inputs', () => {
  for (const n of [3, 6, 12, 96]) {
    const msg = Object.freeze(Array.from({ length: n }, (_, i) => i % 2 ? P - 1n : 0n));
    const key = Object.freeze([P - 1n, 1n]);
    const nonce = (1n << 128n) - 1n;
    const cipher = encryptFields(msg, key, nonce);
    assert.equal(cipher.length, n + 1);
    assert.deepEqual(decryptFields(Object.freeze(cipher), key, nonce, n), msg);
  }
});

test('rejects every modified cipher limb, wrong key, nonce and changed plaintext length', () => {
  for (let i = 0; i < VECTOR.length; i++) {
    const altered = VECTOR.slice(); altered[i] = (altered[i] + 1n) % P;
    assert.throws(() => decryptFields(altered, [4n, 5n], 6n, 3), /CIPHERTEXT_AUTHENTICATION_FAILED/);
  }
  assert.throws(() => decryptFields(VECTOR, [4n, 6n], 6n, 3), /CIPHERTEXT_AUTHENTICATION_FAILED/);
  assert.throws(() => decryptFields(VECTOR, [4n, 5n], 7n, 3), /CIPHERTEXT_AUTHENTICATION_FAILED/);
  assert.throws(() => decryptFields([...VECTOR, 0n, 0n, 0n], [4n, 5n], 6n, 6), /CIPHERTEXT_AUTHENTICATION_FAILED/);
});

test('rejects aliases and non-bigint fields instead of reducing modulo the field', () => {
  for (const bad of [-1n, P, P + 1n, 1, '1', null, true]) {
    assert.throws(() => encryptFields([bad, 2n, 3n], [4n, 5n], 6n), /CANONICAL_FIELD_REQUIRED/);
    assert.throws(() => encryptFields([1n, 2n, 3n], [bad, 5n], 6n), /CANONICAL_FIELD_REQUIRED/);
    assert.throws(() => decryptFields([bad, ...VECTOR.slice(1)], [4n, 5n], 6n, 3), /CANONICAL_FIELD_REQUIRED/);
  }
  for (const bad of [-1n, 1n << 128n, 0, '0', null]) {
    assert.throws(() => encryptFields([1n, 2n, 3n], [4n, 5n], bad), /NONCE_OUT_OF_RANGE/);
    assert.throws(() => decryptFields(VECTOR, [4n, 5n], bad, 3), /NONCE_OUT_OF_RANGE/);
  }
});

test('requires fixed complete blocks and exact key and cipher lengths', () => {
  for (const n of [0, 1, 2, 4, 97, 99]) {
    assert.throws(() => encryptFields(Array(n).fill(1n), [4n, 5n], 6n));
  }
  for (const n of [undefined, -3, 0, 1, 4, 99, 3.1, '3', 3n]) {
    assert.throws(() => decryptFields(VECTOR, [4n, 5n], 6n, n), /PLAINTEXT_LENGTH_INVALID/);
  }
  for (const key of [[], [1n], [1n, 2n, 3n]]) {
    assert.throws(() => encryptFields([1n, 2n, 3n], key, 6n));
  }
  assert.throws(() => decryptFields(VECTOR.slice(1), [4n, 5n], 6n, 3), /CIPHERTEXT_LENGTH_INVALID/);
});

test('rejects sparse, accessor and decorated input arrays without invoking accessors', () => {
  const accessor = [1n, 2n, 3n];
  Object.defineProperty(accessor, '0', { get() { throw new Error('GETTER_RAN'); }, enumerable: true });
  const decorated = [1n, 2n, 3n]; decorated.extra = 1n;
  const sparse = Array(3); sparse[2] = 1n;
  for (const msg of [accessor, decorated, sparse, new BigInt64Array([1n, 2n, 3n])]) {
    assert.throws(() => encryptFields(msg, [4n, 5n], 6n), /DATA_PROPERTY_REQUIRED|DENSE_ARRAY_REQUIRED|BOUNDED_ARRAY_REQUIRED/);
  }
});

test('compiled circuit matches JS ciphertext and rejects changed witness, tag and out-of-range nonce', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'agyion-encryption-test-'));
  try {
    execFileSync(process.execPath, [
      join(root, 'node_modules/circom2/cli.js'),
      join(root, 'circuits/test/poseidon-encryption-3.circom'),
      '--wasm', '--r1cs', '--O2', '-o', dir,
    ], { timeout: 45000, stdio: 'pipe' });
    const generated = join(dir, 'poseidon-encryption-3_js');
    const factory = createRequire(import.meta.url)(join(generated, 'witness_calculator.js'));
    const calculator = await factory(readFileSync(join(generated, 'poseidon-encryption-3.wasm')));
    const input = { msg: [1n, 2n, 3n], key: [4n, 5n], nonce: 6n, cipher: VECTOR };
    await calculator.calculateWitness(input, true);
    for (const nonce of [0n, (1n << 128n) - 1n]) {
      const msg = [0n, P - 1n, 0n];
      await calculator.calculateWitness({ ...input, msg, nonce, cipher: encryptFields(msg, input.key, nonce) }, true);
    }
    for (let i = 0; i < VECTOR.length; i++) {
      const cipher = VECTOR.slice(); cipher[i] = (cipher[i] + 1n) % P;
      await assert.rejects(calculator.calculateWitness({ ...input, cipher }, true));
    }
    await assert.rejects(calculator.calculateWitness({ ...input, msg: [1n, 2n, 4n] }, true));
    await assert.rejects(calculator.calculateWitness({ ...input, key: [4n, 6n] }, true));
    await assert.rejects(calculator.calculateWitness({ ...input, nonce: 1n << 128n }, true));
    await assert.rejects(calculator.calculateWitness({ ...input, nonce: -1n }, true));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
