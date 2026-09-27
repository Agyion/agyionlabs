/**
 * zk.ts: Groth16 (BN254) preimage-proof helper for the zk-preimage contract.
 *
 * Loads snarkjs artifacts (vk.json / proof.json / public.json), re-encodes
 * them into the Soroban host byte format, and calls the contract's
 * `verify(proof, public_inputs) -> bool` via RPC simulation (read-only).
 *
 * MODE:
 *   - soroban mode (NEXT_PUBLIC_AGYION_MODE=soroban): fully functional.
 *   - mock mode (default demo): DISABLED: the mock client has no chain,
 *     so there is nothing to verify against. `zkVerifyProof` throws
 *     `ZkDisabledError` in mock mode; the UI should hide ZK affordances.
 *
 * ENCODING (mirrors contracts/zk-preimage/src/test.rs):
 *   - G1: 64 bytes  be(X) || be(Y)
 *   - G2: 128 bytes be(X) || be(Y), each Fq2 as be(c1) || be(c0)
 *         (EIP-197 imaginary-first; snarkjs JSON is [c0, c1]: swap!)
 *   - Fr: 32-byte big-endian decimal
 *   - proof blob: pi_a(64) || pi_b(128) || pi_c(64) = 256 bytes
 */

import { Buffer } from "buffer";
import { Account, Contract, TransactionBuilder, rpc, xdr } from "@stellar/stellar-sdk";

export const ZK_ENABLED =
  (process.env.NEXT_PUBLIC_AGYION_MODE ?? "mock") !== "mock";

/** Default artifact location (copied from circuits/ into app/public/zk). */
export const ZK_ARTIFACTS_BASE = "/zk";

export class ZkDisabledError extends Error {
  constructor() {
    super(
      "ZK verifier is disabled in mock mode: set NEXT_PUBLIC_AGYION_MODE=soroban " +
        "and provide a deployed zk-preimage contract id.",
    );
    this.name = "ZkDisabledError";
  }
}

// ---------------------------------------------------------------------------
// snarkjs JSON types (only what we use)
// ---------------------------------------------------------------------------

export interface SnarkjsProof {
  protocol: 'groth16';
  curve: 'bn128';
  pi_a: [string, string, string];
  pi_b: [[string, string], [string, string], [string, string]];
  pi_c: [string, string, string];
}

export interface SnarkjsVk {
  protocol: 'groth16';
  curve: 'bn128';
  vk_alpha_1: [string, string, string];
  vk_beta_2: [[string, string], [string, string], [string, string]];
  vk_gamma_2: [[string, string], [string, string], [string, string]];
  vk_delta_2: [[string, string], [string, string], [string, string]];
  IC: [string, string, string][];
  nPublic: number;
}

export interface ZkArtifacts {
  vk: SnarkjsVk;
  proof: SnarkjsProof;
  publicSignals: string[];
}

/** Fetch vk/proof/public artifacts (default: app/public/zk). */
export async function loadZkArtifacts(
  base: string = ZK_ARTIFACTS_BASE,
): Promise<ZkArtifacts> {
  const load = async (file: string) => {
    const response = await fetch(`${base}/${file}`, { redirect: 'error' });
    if (!response.ok) throw new Error(`ZK artifact ${file} could not be loaded (${response.status})`);
    return response.json();
  };
  const [vk, proof, publicSignals] = await Promise.all([
    load('vk.json'), load('proof.json'), load('public.json'),
  ]);
  // Validate the public artifact boundary before exposing it to a caller. This
  // checks canonical encoding, not curve membership or proof validity.
  encodeVk(vk);
  encodeProof(proof);
  encodePublicInputs(publicSignals);
  return { vk, proof, publicSignals } as ZkArtifacts;
}

// ---------------------------------------------------------------------------
// encoders
// ---------------------------------------------------------------------------

// These are different fields: public signals use Fr; point coordinates use Fq.
const FR_MODULUS = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001n;
const FQ_MODULUS = 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47n;

function fieldToBe32(dec: unknown, modulus: bigint): Buffer {
  if (typeof dec !== 'string' || dec.length > 77 || !/^(?:0|[1-9][0-9]*)$/.test(dec)) {
    throw new Error('Expected a canonical unsigned decimal field element');
  }
  const value = BigInt(dec);
  if (value >= modulus) throw new Error('Field element is outside the BN254 field');
  return Buffer.from(value.toString(16).padStart(64, '0'), 'hex');
}

/** Canonical BN254 scalar (Fr) -> 32-byte big-endian buffer; never reduces. */
export function decToBe32(dec: string): Buffer {
  return fieldToBe32(dec, FR_MODULUS);
}

function assertPreimageFormat(value: unknown): void {
  if (!value || typeof value !== 'object' ||
      (value as SnarkjsProof).protocol !== 'groth16' || (value as SnarkjsProof).curve !== 'bn128') {
    throw new Error('Expected a Groth16 BN254 snarkjs artifact');
  }
}

/** snarkjs G1 [x, y, 1] -> 64 bytes be(X)||be(Y). */
export function encodeG1(p: [string, string, string]): Buffer {
  if (!Array.isArray(p) || p.length !== 3 || p[2] !== '1') throw new Error('Expected an affine snarkjs G1 point');
  return Buffer.concat([fieldToBe32(p[0], FQ_MODULUS), fieldToBe32(p[1], FQ_MODULUS)]);
}

/**
 * snarkjs G2 [[x0, x1], [y0, y1], [1, 0]] -> 128 bytes.
 * Soroban host wants Fq2 imaginary-first (EIP-197): be(c1)||be(c0).
 */
export function encodeG2(
  p: [[string, string], [string, string], [string, string]],
): Buffer {
  if (!Array.isArray(p) || p.length !== 3 || p.some(pair => !Array.isArray(pair) || pair.length !== 2) ||
      p[2][0] !== '1' || p[2][1] !== '0') throw new Error('Expected an affine snarkjs G2 point');
  const [x, y] = p;
  return Buffer.concat([
    fieldToBe32(x[1], FQ_MODULUS),
    fieldToBe32(x[0], FQ_MODULUS),
    fieldToBe32(y[1], FQ_MODULUS),
    fieldToBe32(y[0], FQ_MODULUS),
  ]);
}

/** proof.json -> 256-byte on-chain blob: pi_a || pi_b || pi_c. */
export function encodeProof(proof: SnarkjsProof): Buffer {
  assertPreimageFormat(proof);
  return Buffer.concat([
    encodeG1(proof.pi_a),
    encodeG2(proof.pi_b),
    encodeG1(proof.pi_c),
  ]);
}

/** public.json -> one 32-byte BE buffer per public signal. */
export function encodePublicInputs(publicSignals: string[]): Buffer[] {
  if (!Array.isArray(publicSignals) || publicSignals.length !== 1) throw new Error('The preimage circuit requires one public input');
  return publicSignals.map(decToBe32);
}

/** vk.json -> Soroban-encoded verifying key parts (for init / inspection). */
export function encodeVk(vk: SnarkjsVk): {
  alphaG1: Buffer;
  betaG2: Buffer;
  gammaG2: Buffer;
  deltaG2: Buffer;
  ic: Buffer[];
} {
  assertPreimageFormat(vk);
  if (vk.nPublic !== 1 || !Array.isArray(vk.IC) || vk.IC.length !== 2) throw new Error('The preimage key requires one public input and two IC points');
  return {
    alphaG1: encodeG1(vk.vk_alpha_1),
    betaG2: encodeG2(vk.vk_beta_2),
    gammaG2: encodeG2(vk.vk_gamma_2),
    deltaG2: encodeG2(vk.vk_delta_2),
    ic: vk.IC.map(encodeG1),
  };
}

// ---------------------------------------------------------------------------
// on-chain verify (soroban mode only, read-only simulation)
// ---------------------------------------------------------------------------

export interface ZkVerifyOptions {
  rpcUrl: string;
  contractId: string;
  networkPassphrase: string;
  proof: SnarkjsProof;
  publicSignals: string[];
}

/**
 * Calls `verify(proof, public_inputs)` on a deployed zk-preimage contract via
 * simulateTransaction (no signature needed, read-only, no fees).
 *
 * @returns true iff the Groth16 proof is valid for the public signals.
 * @throws ZkDisabledError in mock mode.
 */
export async function zkVerifyProof(opts: ZkVerifyOptions): Promise<boolean> {
  if (!ZK_ENABLED) throw new ZkDisabledError();

  const server = new rpc.Server(opts.rpcUrl, {
    allowHttp: opts.rpcUrl.startsWith("http://"),
  });

  const proofBytes = encodeProof(opts.proof);
  const publicScVals = encodePublicInputs(opts.publicSignals).map((b) =>
    xdr.ScVal.scvBytes(b),
  );

  const contract = new Contract(opts.contractId);
  const op = contract.call(
    "verify",
    xdr.ScVal.scvBytes(proofBytes),
    xdr.ScVal.scvVec(publicScVals),
  );

  // Simulation only: a throwaway source account is fine.
  const dummy = new Account(
    "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    "0",
  );
  const tx = new TransactionBuilder(dummy, {
    fee: "100",
    networkPassphrase: opts.networkPassphrase,
  })
    .addOperation(op)
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`zk verify simulation failed: ${sim.error}`);
  }
  const retval = sim.result?.retval;
  return retval?.switch() === xdr.ScValType.scvBool() && retval.b() === true;
}
