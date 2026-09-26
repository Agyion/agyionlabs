// Local artifact conversion only. It does not perform or certify a trusted setup.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
function coordinate(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) throw new Error('Noncanonical coordinate');
  const n = BigInt(value); if (n >= P) throw new Error('Coordinate exceeds base field');
  return Buffer.from(n.toString(16).padStart(64, '0'), 'hex');
}
function g1(point) {
  if (!Array.isArray(point) || point.length !== 3 || point[2] !== '1') throw new Error('Expected affine G1');
  const result = Buffer.concat([coordinate(point[0]), coordinate(point[1])]);
  if (result.every(b => b === 0)) throw new Error('Degenerate G1 key point');
  return result;
}
function g2(point) {
  if (!Array.isArray(point) || point.length !== 3 || point.some(p => !Array.isArray(p) || p.length !== 2) || point[2][0] !== '1' || point[2][1] !== '0') throw new Error('Expected affine G2');
  const result = Buffer.concat([coordinate(point[0][1]), coordinate(point[0][0]), coordinate(point[1][1]), coordinate(point[1][0])]);
  if (result.every(b => b === 0)) throw new Error('Degenerate G2 key point');
  return result;
}
export function keyDigest(value, publicCount) {
  const key = encodeVerifyingKey(value, publicCount);
  const bytes = Buffer.concat([key.alpha_g1, key.beta_g2, key.gamma_g2, key.delta_g2, ...key.ic]);
  return createHash('sha256').update(bytes).digest();
}
export function encodeVerifyingKey(value, publicCount) {
  if (value?.protocol !== 'groth16' || value.curve !== 'bn128' || value.nPublic !== publicCount || !Array.isArray(value.IC) || value.IC.length !== publicCount + 1) throw new Error('Unexpected circuit/verifier shape');
  return { alpha_g1:g1(value.vk_alpha_1), beta_g2:g2(value.vk_beta_2), gamma_g2:g2(value.vk_gamma_2), delta_g2:g2(value.vk_delta_2), ic:value.IC.map(g1) };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4) throw new Error('Usage: pin-verifiers.mjs transition-vk.json revocation-vk.json');
  // Validate both artifacts before touching source. Arbitrary paths are inputs only;
  // the sole output is the package-owned compile-time pin module.
  const main = keyDigest(JSON.parse(readFileSync(process.argv[2], 'utf8')), 157);
  const revoke = keyDigest(JSON.parse(readFileSync(process.argv[3], 'utf8')), 4);
  const array = b => Array.from(b, x => `0x${x.toString(16).padStart(2, '0')}`).join(', ');
  writeFileSync(new URL('../src/pins.rs', import.meta.url), `//! Exact local-development Groth16 artifacts; no rotation or arbitrary-key init.\npub const MAIN_VK_HASH: [u8;32] = [${array(main)}];\npub const REVOCATION_VK_HASH: [u8;32] = [${array(revoke)}];\n`);
  process.stdout.write(JSON.stringify({ transition: main.toString('hex'), revocation: revoke.toString('hex') }) + '\n');
}
