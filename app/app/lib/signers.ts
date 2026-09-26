/**
 * signers.ts — ed25519 payload + signature helpers (SPEC_V2 payload layouts)
 *
 * The contract verifies three credential types, each with an exact byte
 * layout (see contracts/hak/src/*.rs):
 *
 *   V2 prefix: action tag + network hash + contract Address XDR, then:
 *   handoff : fade_id(8B BE)     || claimant Address XDR    || ts(8B BE)
 *   attest  : trigger_id(8B BE)  || beneficiary Address XDR || ts(8B BE)
 *   envoy   : mandate_id(8B BE)  || fade_id(8B BE)          || ts(8B BE)
 *
 * Keys are accepted as a Stellar secret (S...) or a 64-hex raw ed25519 seed.
 */

import { Buffer } from "buffer";
import { Address, Keypair, StrKey, hash } from "@stellar/stellar-sdk";
import { CONFIG } from "./config";

function u64be(v: bigint): Buffer {
  if (v < 0n || v > 0xffff_ffff_ffff_ffffn) throw new Error(`u64 out of range: ${v}`);
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(v);
  return b;
}

export interface SigningDomain { contractId: string; networkPassphrase: string }

/** V2 credentials cannot cross actions, contract deployments, or networks. */
function credentialDomain(action: string, domain?: SigningDomain): Buffer {
  const contractId = domain?.contractId ?? (CONFIG.mode === "mock"
    ? StrKey.encodeContract(Buffer.alloc(32)) : CONFIG.contractId);
  if (!contractId) throw new Error("A v2 kernel contract must be configured before signing.");
  const network = domain?.networkPassphrase ?? CONFIG.networkPassphrase;
  return Buffer.concat([
    Buffer.from(`agyion:${action}:v2\0`, "utf8"),
    hash(Buffer.from(network, "utf8")),
    new Address(contractId).toScVal().toXDR(),
  ]);
}

export function handoffPayload(fadeId: bigint, claimant: string, ts: bigint, domain?: SigningDomain): Buffer {
  return Buffer.concat([credentialDomain("handoff", domain), u64be(fadeId), new Address(claimant).toScVal().toXDR(), u64be(ts)]);
}

export function attestPayload(triggerId: bigint, beneficiary: string, ts: bigint, domain?: SigningDomain): Buffer {
  return Buffer.concat([credentialDomain("attest", domain), u64be(triggerId), new Address(beneficiary).toScVal().toXDR(), u64be(ts)]);
}

export function envoyPayload(mandateId: bigint, fadeId: bigint, ts: bigint, domain?: SigningDomain): Buffer {
  return Buffer.concat([credentialDomain("envoy", domain), u64be(mandateId), u64be(fadeId), u64be(ts)]);
}

/** Commit the hash first; reveal the preimage only in a later ledger. */
export function podClaimCommitment(podId: bigint, recipient: string, preimage: string, domain?: SigningDomain): string {
  return hash(Buffer.concat([credentialDomain("pod-claim", domain), u64be(podId), new Address(recipient).toScVal().toXDR(), Buffer.from(preimage, "utf8")])).toString("hex");
}

export function keypairFromSecret(secret: string): Keypair {
  const s = secret.trim();
  if (s.startsWith("S")) return Keypair.fromSecret(s);
  if (/^[0-9a-fA-F]{64}$/.test(s)) return Keypair.fromRawEd25519Seed(Buffer.from(s, "hex"));
  throw new Error("Invalid key: expected an S... secret or a 64-char hex seed");
}

/** Raw ed25519 public key (BytesN<32> hex) — what the contract stores */
export function publicKeyHex(secret: string): string {
  return Buffer.from(keypairFromSecret(secret).rawPublicKey()).toString("hex");
}

/** Sign a payload; returns BytesN<64> hex, ready for the contract call */
export function signPayload(secret: string, payload: Buffer): string {
  return Buffer.from(keypairFromSecret(secret).sign(payload)).toString("hex");
}

export function signHandoff(secret: string, fadeId: bigint, claimant: string, ts: bigint): string {
  return signPayload(secret, handoffPayload(fadeId, claimant, ts));
}

export function signAttest(secret: string, triggerId: bigint, beneficiary: string, ts: bigint): string {
  return signPayload(secret, attestPayload(triggerId, beneficiary, ts));
}

export function signEnvoy(secret: string, mandateId: bigint, fadeId: bigint, ts: bigint): string {
  return signPayload(secret, envoyPayload(mandateId, fadeId, ts));
}

/** Fresh demo keypair (secret S..., pubkey hex BytesN<32>, address G...) */
export function newKeypair(): { secret: string; pubkeyHex: string; address: string } {
  const kp = Keypair.random();
  return {
    secret: kp.secret(),
    pubkeyHex: Buffer.from(kp.rawPublicKey()).toString("hex"),
    address: kp.publicKey(),
  };
}
