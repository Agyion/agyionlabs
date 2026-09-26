// Exact @zk-kit/poseidon-cipher 0.3.2 permutation/cipher convention (MIT).
// Research composition: not an independently audited or constant-time AEAD suite.
// This layer accepts already-derived keys. ECDH point/subgroup validation,
// fresh randomness and domain/record binding are the caller's responsibility.
import { poseidonEncrypt, poseidonDecrypt } from '@zk-kit/poseidon-cipher';
import { fail, list } from './validation.mjs';

const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const MAX_FIELDS = 96;

function length(value) {
  if (!Number.isSafeInteger(value) || value < 3 || value > MAX_FIELDS || value % 3 !== 0) {
    fail('PLAINTEXT_LENGTH_INVALID', 'length');
  }
  return value;
}

function fields(value, max, path) {
  return list(value, max, path).map((limb) => {
    if (typeof limb !== 'bigint' || limb < 0n || limb >= FIELD) fail('CANONICAL_FIELD_REQUIRED', path);
    return limb;
  });
}

function parameters(key, nonce) {
  const copy = fields(key, 2, 'key');
  if (copy.length !== 2) fail('KEY_LENGTH_INVALID', 'key');
  if (typeof nonce !== 'bigint' || nonce < 0n || nonce >= 1n << 128n) fail('NONCE_OUT_OF_RANGE', 'nonce');
  return copy;
}

export function encryptFields(msg, key, nonce) {
  const plaintext = fields(msg, MAX_FIELDS, 'msg');
  length(plaintext.length);
  return poseidonEncrypt(plaintext, parameters(key, nonce), nonce);
}

export function decryptFields(cipher, key, nonce, plaintextLength) {
  const count = length(plaintextLength);
  const ciphertext = fields(cipher, MAX_FIELDS + 1, 'cipher');
  if (ciphertext.length !== count + 1) fail('CIPHERTEXT_LENGTH_INVALID', 'cipher');
  const secret = parameters(key, nonce);
  try {
    return poseidonDecrypt(ciphertext, secret, nonce, count);
  } catch {
    // Upstream failure text must never expose supplied plaintext/key material.
    fail('CIPHERTEXT_AUTHENTICATION_FAILED', 'cipher');
  }
}
