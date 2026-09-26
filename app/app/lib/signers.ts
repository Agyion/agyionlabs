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
function credentialDomain(action: string, domain?: SigningDomain, version = "v2"): Buffer {
  const contractId = domain?.contractId ?? (CONFIG.mode === "mock"
    ? StrKey.encodeContract(Buffer.alloc(32)) : CONFIG.contractId);
  if (!contractId) throw new Error("A kernel contract must be configured before signing.");
  const network = domain?.networkPassphrase ?? CONFIG.networkPassphrase;
  return Buffer.concat([
    Buffer.from(`agyion:${action}:${version}\0`, "utf8"),
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

/** Pod credentials are random raw seeds, never passphrases or wallet secrets. */
function podKey(seed: string): Keypair {
  if (!/^[a-fA-F0-9]{64}$/.test(seed)) throw new Error("Pod secret must be exactly 64 hex characters (32 bytes).");
  return Keypair.fromRawEd25519Seed(Buffer.from(seed, "hex"));
}
export function newPodSeed(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("hex");
}
export function podPublicKey(seed: string): string { return Buffer.from(podKey(seed).rawPublicKey()).toString("hex"); }
export function podCreationPayload(funder: string, asset: string, amount: bigint, unlockLedger: number, claimPubkey: string, domain?: SigningDomain): Buffer {
  if (amount <= 0n || amount > 2n ** 127n - 1n) throw new Error("Pod amount must be a positive i128.");
  if (!Number.isInteger(unlockLedger) || unlockLedger < 0 || unlockLedger > 0xffff_ffff) throw new Error("Pod unlock ledger must be a u32.");
  if (!/^[a-fA-F0-9]{64}$/.test(claimPubkey)) throw new Error("Invalid Pod public key.");
  const amountBytes = Buffer.from(amount.toString(16).padStart(32, "0"), "hex");
  const ledgerBytes = Buffer.alloc(4); ledgerBytes.writeUInt32BE(unlockLedger);
  return Buffer.concat([credentialDomain("pod-create", domain, "v3"), new Address(funder).toScVal().toXDR(),
    new Address(asset).toScVal().toXDR(), amountBytes, ledgerBytes, Buffer.from(claimPubkey, "hex")]);
}
export function podClaimPayload(podId: bigint, recipient: string, domain?: SigningDomain): Buffer {
  return Buffer.concat([credentialDomain("pod-claim", domain, "v3"), u64be(podId), new Address(recipient).toScVal().toXDR()]);
}
export function signPodCreation(seed: string, funder: string, asset: string, amount: bigint, unlockLedger: number, domain?: SigningDomain): string {
  const key = podKey(seed);
  return Buffer.from(key.sign(podCreationPayload(funder, asset, amount, unlockLedger, Buffer.from(key.rawPublicKey()).toString("hex"), domain))).toString("hex");
}
export function signPodClaim(seed: string, podId: bigint, recipient: string, domain?: SigningDomain): string {
  return Buffer.from(podKey(seed).sign(podClaimPayload(podId, recipient, domain))).toString("hex");
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
