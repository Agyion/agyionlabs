/** Public call encoding only: no witness, RPC, signer, storage or proof acceptance. */
import { Buffer } from 'buffer';
import { StrKey } from '@stellar/stellar-sdk';
import type { Transition } from './bindings.ts';

const FR = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export interface PublicAddresses {
  asset: string | null;
  bridgeAccount: string | null;
  feeAccount: string | null;
}

function ensure(ok: boolean, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

/** A lossless canonical field encoder; never reduces or accepts numeric floats. */
export function fieldBytes(value: bigint): Buffer {
  ensure(typeof value === 'bigint' && value >= 0n && value < FR, 'Noncanonical field');
  return Buffer.from(value.toString(16).padStart(64, '0'), 'hex');
}

function address(value: unknown, contractOnly: boolean): string | undefined {
  if (value === null) return undefined;
  ensure(typeof value === 'string' && (StrKey.isValidContract(value) || (!contractOnly && StrKey.isValidEd25519PublicKey(value))), 'Invalid public address');
  return value;
}

/**
 * Translate the prover's PUBLIC vector into the actual generated contract ABI.
 * This does not verify a proof or a release. The contract independently computes
 * domain/asset/account/config inputs, so mismatched public addresses cannot pass.
 * Callers must independently verify proof, artifact pins and a current pool read
 * before asking a wallet to sign. Never pass buildWitness().witness to this API.
 */
export function prepareSubmit(publicInputs: readonly bigint[], proofHex: string, addresses: PublicAddresses): { transition: Transition; proof: Buffer } {
  ensure(Array.isArray(publicInputs) && Object.getPrototypeOf(publicInputs) === Array.prototype && publicInputs.length === 157, 'Expected157 public fields');
  ensure(Reflect.ownKeys(publicInputs).length === 158, 'Dense public vector required');
  const fields = Array.from({ length: 157 }, (_, i) => {
    const entry = Object.getOwnPropertyDescriptor(publicInputs, String(i));
    ensure(!!entry && 'value' in entry && entry.enumerable === true, 'Public fields must be data properties');
    fieldBytes(entry.value);
    return entry.value as bigint;
  });
  ensure(typeof proofHex === 'string' && /^[0-9a-f]{512}$/.test(proofHex), 'Expected canonical256-byte proof');
  ensure(!!addresses && Object.getPrototypeOf(addresses) === Object.prototype, 'Public addresses required');
  const keys = ['asset', 'bridgeAccount', 'feeAccount'] as const;
  ensure(Reflect.ownKeys(addresses).length === keys.length, 'Only public address fields are accepted');
  const values = keys.map(key => {
    const entry = Object.getOwnPropertyDescriptor(addresses, key);
    ensure(!!entry && 'value' in entry && entry.enumerable === true, 'Public addresses must be data properties');
    return entry.value as unknown;
  });
  const [asset, bridgeAccount, feeAccount] = values.map((value, i) => address(value, i === 0));
  ensure(fields[22] === 2n, 'Unsupported suite');
  ensure(fields[6] < (1n << 32n) && fields[7] < (1n << 32n) && fields[7] >= fields[6] && fields[7] - fields[6] <= 120n, 'Invalid ledger window');
  ensure(fields[11] <= (1n << 32n), 'Invalid append index');
  ensure(fields[16] <= 2n && fields[18] < (1n << 64n) && fields[20] < (1n << 64n), 'Invalid bridge or amount');
  const bridged = fields[16] !== 0n, fee = fields[20] !== 0n;
  ensure((asset !== undefined) === (bridged || fee) && (fields[17] !== 0n) === (bridged || fee), 'Asset presence mismatch');
  ensure((bridgeAccount !== undefined) === bridged && (fields[18] !== 0n) === bridged && (fields[19] !== 0n) === bridged, 'Bridge account or amount mismatch');
  ensure((feeAccount !== undefined) === fee && (fields[21] !== 0n) === fee, 'Fee account mismatch');
  for (const i of [25, 53, 81, 94, 110]) ensure(fields[i] > 0n && fields[i] < (1n << 128n), 'Invalid ciphertext nonce');
  return {
    transition: {
      valid_from: Number(fields[6]), valid_until: Number(fields[7]),
      input_root: fieldBytes(fields[8]), append_old_root: fieldBytes(fields[9]), append_new_root: fieldBytes(fields[10]),
      next_index: fields[11], nullifiers: fields.slice(12, 14).map(fieldBytes), commitments: fields.slice(14, 16).map(fieldBytes),
      bridge_kind: Number(fields[16]), asset, bridge_amount: fields[18], bridge_account: bridgeAccount,
      fee_amount: fields[20], fee_account: feeAccount, ciphertext: fields.slice(23).map(fieldBytes),
    },
    proof: Buffer.from(proofHex, 'hex'),
  };
}
