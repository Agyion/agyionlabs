import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}





/**
 * Pod: time capsule (SPEC_V2).
 */
export interface Pod {
  amount: i128;
  asset: string;
  funder: string;
  key_hash: Buffer;
  state: u32;
  unlock_ledger: u32;
}


/**
 * Fade listing (SPEC_V2 — field names and types are sacred).
 */
export interface Fade {
  asset: string;
  claimant: Option<string>;
  claimed_at: Option<u32>;
  deadline_ledger: u32;
  floor_price: i128;
  handoff_window: u32;
  pot: i128;
  seller: string;
  slope_den: i128;
  slope_num: i128;
  start_ledger: u32;
  start_price: i128;
  state: u32;
  venue_pubkey: Buffer;
}

/**
 * Defined error codes instead of panics (SPEC §3.3 / SPEC_V2 rules).
 * 
 * Numbering: the 8 v1 errors keep their discriminants; the new v2 variants
 * continue from 9. Discriminant 8 is reserved (v1's signature-format error
 * was merged into `BadSignature` = 7: a preimage/key mismatch and an
 * unverifiable pubkey/signature are both credential failures).
 */
export const Errors = {
  1: {message:"NotFound"},
  2: {message:"InvalidState"},
  3: {message:"InvalidAmount"},
  4: {message:"InvalidCurve"},
  5: {message:"DeadlinePassed"},
  6: {message:"Locked"},
  7: {message:"BadSignature"},
  9: {message:"CapExceeded"},
  10: {message:"MandateExpired"},
  11: {message:"Unauthorized"},
  12: {message:"InvalidInput"}
}


/**
 * Mandate: on-chain limited grant (SPEC_V2). The owner authorizes an agent
 * key (ed25519) to claim Fade listings FOR the owner; recipient is fixed to
 * the owner.
 */
export interface Mandate {
  agent_pubkey: Buffer;
  /**
 * Successful envoy_claim count (audit v2 finding 2). Under the Envoy
 * price<=0 restriction the monetary caps (max_per_tx/daily_cap) are
 * effectively dead — daily_used always accumulates 0 — so the active
 * bound on agent activity is this counter, capped at
 * `envoy::MAX_CLAIMS_PER_MANDATE`. Shown on the mandate card in the UI.
 */
claims_used: u32;
  daily_cap: i128;
  daily_used: i128;
  max_per_tx: i128;
  owner: string;
  revoked: boolean;
  valid_until: u32;
  window_start: u32;
}


/**
 * Trigger: event escrow (SPEC_V2). Funder locks funds for a beneficiary; an
 * independent attester's ed25519 signature executes the payout; after the
 * deadline a rule-based refund returns funds to the funder.
 */
export interface Trigger {
  amount: i128;
  asset: string;
  attester_pubkey: Buffer;
  beneficiary: string;
  deadline_ledger: u32;
  funder: string;
  state: u32;
}


/**
 * A hidden Pod claim intent, bound to the recipient and deployment.
 */
export interface PodClaimCommitment {
  commitment: Buffer;
  committed_at: u32;
}

export interface Client {
  /**
   * Construct and simulate a claim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * open -> claimed; claimant authorization required.
   */
  claim: ({fade_id, claimant}: {fade_id: u64, claimant: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a attest transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Attester signature payload: v2 attest domain || trigger_id(8B BE) || beneficiary XDR ||
   * ts(8B BE). Valid sig && ledger <= deadline -> pays the beneficiary.
   */
  attest: ({trigger_id, ts, sig}: {trigger_id: u64, ts: u64, sig: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a refund transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Rule-based refund: if the deadline passed (no claim) or the
   * handoff_window elapsed (no handoff), the pot returns to the seller.
   * No discretion; anyone may call.
   */
  refund: ({fade_id}: {fade_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_pod transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * View: returns the pod record.
   */
  get_pod: ({pod_id}: {pod_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Pod>>>

  /**
   * Construct and simulate a get_fade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * View: returns the fade record.
   */
  get_fade: ({fade_id}: {fade_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Fade>>>

  /**
   * Construct and simulate a claim_pod transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Open after the timelock and a matching commitment from an earlier ledger.
   * Recipient authorization alone does not protect a public bearer preimage.
   */
  claim_pod: ({pod_id, preimage, recipient}: {pod_id: u64, preimage: Buffer, recipient: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a create_pod transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  create_pod: ({funder, asset, amount, unlock_ledger, key_hash}: {funder: string, asset: string, amount: i128, unlock_ledger: u32, key_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u64>>>

  /**
   * Construct and simulate a fade_price transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * View: current declining price; stops at the floor.
   */
  fade_price: ({fade_id}: {fade_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a create_fade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  create_fade: ({seller, asset, pot, start_price, floor_price, slope_num, slope_den, duration_ledgers, handoff_window, venue_pubkey}: {seller: string, asset: string, pot: i128, start_price: i128, floor_price: i128, slope_num: i128, slope_den: i128, duration_ledgers: u32, handoff_window: u32, venue_pubkey: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u64>>>

  /**
   * Construct and simulate a envoy_claim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Agent signature payload: v2 envoy domain || mandate_id(8B BE) || fade_id(8B BE) ||
   * ts(8B BE). Enforces: ledger <= valid_until, price <= max_per_tx,
   * daily_used + price <= daily_cap, then claims the fade with
   * claimant = owner.
   */
  envoy_claim: ({mandate_id, fade_id, ts, agent_sig}: {mandate_id: u64, fade_id: u64, ts: u64, agent_sig: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_mandate transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * View: returns the mandate record.
   */
  get_mandate: ({mandate_id}: {mandate_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Mandate>>>

  /**
   * Construct and simulate a get_trigger transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * View: returns the trigger record.
   */
  get_trigger: ({trigger_id}: {trigger_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Trigger>>>

  /**
   * Construct and simulate a create_mandate transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Grants an agent key the right to claim Fade listings for the owner.
   * Recipient is fixed to the owner.
   */
  create_mandate: ({owner, agent_pubkey, max_per_tx, daily_cap, valid_until}: {owner: string, agent_pubkey: Buffer, max_per_tx: i128, daily_cap: i128, valid_until: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u64>>>

  /**
   * Construct and simulate a create_trigger transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  create_trigger: ({funder, asset, amount, beneficiary, attester_pubkey, deadline_ledger}: {funder: string, asset: string, amount: i128, beneficiary: string, attester_pubkey: Buffer, deadline_ledger: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u64>>>

  /**
   * Construct and simulate a refund_trigger transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * ledger > deadline && not attested -> funds return to the funder.
   * Rule-based, no discretion; anyone may call.
   */
  refund_trigger: ({trigger_id}: {trigger_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a revoke_mandate transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Instant revocation, owner only.
   */
  revoke_mandate: ({owner, mandate_id}: {owner: string, mandate_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a confirm_handoff transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Verifies the venue ed25519 signature
   * (v2 handoff domain || fade_id(8B BE) || claimant XDR || ts(8B BE)); settles at the
   * price frozen at `claimed_at`.
   */
  confirm_handoff: ({fade_id, ts, sig}: {fade_id: u64, ts: u64, sig: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a commit_pod_claim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Record a hidden claim intent before revealing a Pod's bearer secret.
   */
  commit_pod_claim: ({pod_id, recipient, commitment}: {pod_id: u64, recipient: string, commitment: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a protocol_version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Clients must check this before using v2 signatures or Pod claims.
   */
  protocol_version: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a get_pod_claim_commitment transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_pod_claim_commitment: ({pod_id, recipient}: {pod_id: u64, recipient: string}, options?: MethodOptions) => Promise<AssembledTransaction<Option<PodClaimCommitment>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAQAAABxQb2Q6IHRpbWUgY2Fwc3VsZSAoU1BFQ19WMikuAAAAAAAAAANQb2QAAAAABgAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAVhc3NldAAAAAAAABMAAAAAAAAABmZ1bmRlcgAAAAAAEwAAAAAAAAAIa2V5X2hhc2gAAAPuAAAAIAAAAAAAAAAFc3RhdGUAAAAAAAAEAAAAAAAAAA11bmxvY2tfbGVkZ2VyAAAAAAAABA==",
        "AAAAAQAAADxGYWRlIGxpc3RpbmcgKFNQRUNfVjIg4oCUIGZpZWxkIG5hbWVzIGFuZCB0eXBlcyBhcmUgc2FjcmVkKS4AAAAAAAAABEZhZGUAAAAOAAAAAAAAAAVhc3NldAAAAAAAABMAAAAAAAAACGNsYWltYW50AAAD6AAAABMAAAAAAAAACmNsYWltZWRfYXQAAAAAA+gAAAAEAAAAAAAAAA9kZWFkbGluZV9sZWRnZXIAAAAABAAAAAAAAAALZmxvb3JfcHJpY2UAAAAACwAAAAAAAAAOaGFuZG9mZl93aW5kb3cAAAAAAAQAAAAAAAAAA3BvdAAAAAALAAAAAAAAAAZzZWxsZXIAAAAAABMAAAAAAAAACXNsb3BlX2RlbgAAAAAAAAsAAAAAAAAACXNsb3BlX251bQAAAAAAAAsAAAAAAAAADHN0YXJ0X2xlZGdlcgAAAAQAAAAAAAAAC3N0YXJ0X3ByaWNlAAAAAAsAAAAAAAAABXN0YXRlAAAAAAAABAAAAAAAAAAMdmVudWVfcHVia2V5AAAD7gAAACA=",
        "AAAAAAAAADFvcGVuIC0+IGNsYWltZWQ7IGNsYWltYW50IGF1dGhvcml6YXRpb24gcmVxdWlyZWQuAAAAAAAABWNsYWltAAAAAAAAAgAAAAAAAAAHZmFkZV9pZAAAAAAGAAAAAAAAAAhjbGFpbWFudAAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAABAAAAVZEZWZpbmVkIGVycm9yIGNvZGVzIGluc3RlYWQgb2YgcGFuaWNzIChTUEVDIMKnMy4zIC8gU1BFQ19WMiBydWxlcykuCgpOdW1iZXJpbmc6IHRoZSA4IHYxIGVycm9ycyBrZWVwIHRoZWlyIGRpc2NyaW1pbmFudHM7IHRoZSBuZXcgdjIgdmFyaWFudHMKY29udGludWUgZnJvbSA5LiBEaXNjcmltaW5hbnQgOCBpcyByZXNlcnZlZCAodjEncyBzaWduYXR1cmUtZm9ybWF0IGVycm9yCndhcyBtZXJnZWQgaW50byBgQmFkU2lnbmF0dXJlYCA9IDc6IGEgcHJlaW1hZ2Uva2V5IG1pc21hdGNoIGFuZCBhbgp1bnZlcmlmaWFibGUgcHVia2V5L3NpZ25hdHVyZSBhcmUgYm90aCBjcmVkZW50aWFsIGZhaWx1cmVzKS4AAAAAAAAAAAAFRXJyb3IAAAAAAAALAAAAAAAAAAhOb3RGb3VuZAAAAAEAAAAAAAAADEludmFsaWRTdGF0ZQAAAAIAAAAAAAAADUludmFsaWRBbW91bnQAAAAAAAADAAAAAAAAAAxJbnZhbGlkQ3VydmUAAAAEAAAAAAAAAA5EZWFkbGluZVBhc3NlZAAAAAAABQAAAAAAAAAGTG9ja2VkAAAAAAAGAAAAAAAAAAxCYWRTaWduYXR1cmUAAAAHAAAAAAAAAAtDYXBFeGNlZWRlZAAAAAAJAAAAAAAAAA5NYW5kYXRlRXhwaXJlZAAAAAAACgAAAAAAAAAMVW5hdXRob3JpemVkAAAACwAAAAAAAAAMSW52YWxpZElucHV0AAAADA==",
        "AAAAAAAAAJtBdHRlc3RlciBzaWduYXR1cmUgcGF5bG9hZDogdjIgYXR0ZXN0IGRvbWFpbiB8fCB0cmlnZ2VyX2lkKDhCIEJFKSB8fCBiZW5lZmljaWFyeSBYRFIgfHwKdHMoOEIgQkUpLiBWYWxpZCBzaWcgJiYgbGVkZ2VyIDw9IGRlYWRsaW5lIC0+IHBheXMgdGhlIGJlbmVmaWNpYXJ5LgAAAAAGYXR0ZXN0AAAAAAADAAAAAAAAAAp0cmlnZ2VyX2lkAAAAAAAGAAAAAAAAAAJ0cwAAAAAABgAAAAAAAAADc2lnAAAAA+4AAABAAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAJ9SdWxlLWJhc2VkIHJlZnVuZDogaWYgdGhlIGRlYWRsaW5lIHBhc3NlZCAobm8gY2xhaW0pIG9yIHRoZQpoYW5kb2ZmX3dpbmRvdyBlbGFwc2VkIChubyBoYW5kb2ZmKSwgdGhlIHBvdCByZXR1cm5zIHRvIHRoZSBzZWxsZXIuCk5vIGRpc2NyZXRpb247IGFueW9uZSBtYXkgY2FsbC4AAAAABnJlZnVuZAAAAAAAAQAAAAAAAAAHZmFkZV9pZAAAAAAGAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAB1WaWV3OiByZXR1cm5zIHRoZSBwb2QgcmVjb3JkLgAAAAAAAAdnZXRfcG9kAAAAAAEAAAAAAAAABnBvZF9pZAAAAAAABgAAAAEAAAPpAAAH0AAAAANQb2QAAAAAAw==",
        "AAAAAQAAAJ1NYW5kYXRlOiBvbi1jaGFpbiBsaW1pdGVkIGdyYW50IChTUEVDX1YyKS4gVGhlIG93bmVyIGF1dGhvcml6ZXMgYW4gYWdlbnQKa2V5IChlZDI1NTE5KSB0byBjbGFpbSBGYWRlIGxpc3RpbmdzIEZPUiB0aGUgb3duZXI7IHJlY2lwaWVudCBpcyBmaXhlZCB0bwp0aGUgb3duZXIuAAAAAAAAAAAAAAdNYW5kYXRlAAAAAAkAAAAAAAAADGFnZW50X3B1YmtleQAAA+4AAAAgAAABRFN1Y2Nlc3NmdWwgZW52b3lfY2xhaW0gY291bnQgKGF1ZGl0IHYyIGZpbmRpbmcgMikuIFVuZGVyIHRoZSBFbnZveQpwcmljZTw9MCByZXN0cmljdGlvbiB0aGUgbW9uZXRhcnkgY2FwcyAobWF4X3Blcl90eC9kYWlseV9jYXApIGFyZQplZmZlY3RpdmVseSBkZWFkIOKAlCBkYWlseV91c2VkIGFsd2F5cyBhY2N1bXVsYXRlcyAwIOKAlCBzbyB0aGUgYWN0aXZlCmJvdW5kIG9uIGFnZW50IGFjdGl2aXR5IGlzIHRoaXMgY291bnRlciwgY2FwcGVkIGF0CmBlbnZveTo6TUFYX0NMQUlNU19QRVJfTUFOREFURWAuIFNob3duIG9uIHRoZSBtYW5kYXRlIGNhcmQgaW4gdGhlIFVJLgAAAAtjbGFpbXNfdXNlZAAAAAAEAAAAAAAAAAlkYWlseV9jYXAAAAAAAAALAAAAAAAAAApkYWlseV91c2VkAAAAAAALAAAAAAAAAAptYXhfcGVyX3R4AAAAAAALAAAAAAAAAAVvd25lcgAAAAAAABMAAAAAAAAAB3Jldm9rZWQAAAAAAQAAAAAAAAALdmFsaWRfdW50aWwAAAAABAAAAAAAAAAMd2luZG93X3N0YXJ0AAAABA==",
        "AAAAAQAAAMtUcmlnZ2VyOiBldmVudCBlc2Nyb3cgKFNQRUNfVjIpLiBGdW5kZXIgbG9ja3MgZnVuZHMgZm9yIGEgYmVuZWZpY2lhcnk7IGFuCmluZGVwZW5kZW50IGF0dGVzdGVyJ3MgZWQyNTUxOSBzaWduYXR1cmUgZXhlY3V0ZXMgdGhlIHBheW91dDsgYWZ0ZXIgdGhlCmRlYWRsaW5lIGEgcnVsZS1iYXNlZCByZWZ1bmQgcmV0dXJucyBmdW5kcyB0byB0aGUgZnVuZGVyLgAAAAAAAAAAB1RyaWdnZXIAAAAABwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAVhc3NldAAAAAAAABMAAAAAAAAAD2F0dGVzdGVyX3B1YmtleQAAAAPuAAAAIAAAAAAAAAALYmVuZWZpY2lhcnkAAAAAEwAAAAAAAAAPZGVhZGxpbmVfbGVkZ2VyAAAAAAQAAAAAAAAABmZ1bmRlcgAAAAAAEwAAAAAAAAAFc3RhdGUAAAAAAAAE",
        "AAAAAAAAAB5WaWV3OiByZXR1cm5zIHRoZSBmYWRlIHJlY29yZC4AAAAAAAhnZXRfZmFkZQAAAAEAAAAAAAAAB2ZhZGVfaWQAAAAABgAAAAEAAAPpAAAH0AAAAARGYWRlAAAAAw==",
        "AAAAAAAAAJJPcGVuIGFmdGVyIHRoZSB0aW1lbG9jayBhbmQgYSBtYXRjaGluZyBjb21taXRtZW50IGZyb20gYW4gZWFybGllciBsZWRnZXIuClJlY2lwaWVudCBhdXRob3JpemF0aW9uIGFsb25lIGRvZXMgbm90IHByb3RlY3QgYSBwdWJsaWMgYmVhcmVyIHByZWltYWdlLgAAAAAACWNsYWltX3BvZAAAAAAAAAMAAAAAAAAABnBvZF9pZAAAAAAABgAAAAAAAAAIcHJlaW1hZ2UAAAAOAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAAAAAAAKY3JlYXRlX3BvZAAAAAAABQAAAAAAAAAGZnVuZGVyAAAAAAATAAAAAAAAAAVhc3NldAAAAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAANdW5sb2NrX2xlZGdlcgAAAAAAAAQAAAAAAAAACGtleV9oYXNoAAAD7gAAACAAAAABAAAD6QAAAAYAAAAD",
        "AAAAAAAAADJWaWV3OiBjdXJyZW50IGRlY2xpbmluZyBwcmljZTsgc3RvcHMgYXQgdGhlIGZsb29yLgAAAAAACmZhZGVfcHJpY2UAAAAAAAEAAAAAAAAAB2ZhZGVfaWQAAAAABgAAAAEAAAAL",
        "AAAAAAAAAAAAAAALY3JlYXRlX2ZhZGUAAAAACgAAAAAAAAAGc2VsbGVyAAAAAAATAAAAAAAAAAVhc3NldAAAAAAAABMAAAAAAAAAA3BvdAAAAAALAAAAAAAAAAtzdGFydF9wcmljZQAAAAALAAAAAAAAAAtmbG9vcl9wcmljZQAAAAALAAAAAAAAAAlzbG9wZV9udW0AAAAAAAALAAAAAAAAAAlzbG9wZV9kZW4AAAAAAAALAAAAAAAAABBkdXJhdGlvbl9sZWRnZXJzAAAABAAAAAAAAAAOaGFuZG9mZl93aW5kb3cAAAAAAAQAAAAAAAAADHZlbnVlX3B1YmtleQAAA+4AAAAgAAAAAQAAA+kAAAAGAAAAAw==",
        "AAAAAAAAAOBBZ2VudCBzaWduYXR1cmUgcGF5bG9hZDogdjIgZW52b3kgZG9tYWluIHx8IG1hbmRhdGVfaWQoOEIgQkUpIHx8IGZhZGVfaWQoOEIgQkUpIHx8CnRzKDhCIEJFKS4gRW5mb3JjZXM6IGxlZGdlciA8PSB2YWxpZF91bnRpbCwgcHJpY2UgPD0gbWF4X3Blcl90eCwKZGFpbHlfdXNlZCArIHByaWNlIDw9IGRhaWx5X2NhcCwgdGhlbiBjbGFpbXMgdGhlIGZhZGUgd2l0aApjbGFpbWFudCA9IG93bmVyLgAAAAtlbnZveV9jbGFpbQAAAAAEAAAAAAAAAAptYW5kYXRlX2lkAAAAAAAGAAAAAAAAAAdmYWRlX2lkAAAAAAYAAAAAAAAAAnRzAAAAAAAGAAAAAAAAAAlhZ2VudF9zaWcAAAAAAAPuAAAAQAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAACFWaWV3OiByZXR1cm5zIHRoZSBtYW5kYXRlIHJlY29yZC4AAAAAAAALZ2V0X21hbmRhdGUAAAAAAQAAAAAAAAAKbWFuZGF0ZV9pZAAAAAAABgAAAAEAAAPpAAAH0AAAAAdNYW5kYXRlAAAAAAM=",
        "AAAAAAAAACFWaWV3OiByZXR1cm5zIHRoZSB0cmlnZ2VyIHJlY29yZC4AAAAAAAALZ2V0X3RyaWdnZXIAAAAAAQAAAAAAAAAKdHJpZ2dlcl9pZAAAAAAABgAAAAEAAAPpAAAH0AAAAAdUcmlnZ2VyAAAAAAM=",
        "AAAAAAAAAGRHcmFudHMgYW4gYWdlbnQga2V5IHRoZSByaWdodCB0byBjbGFpbSBGYWRlIGxpc3RpbmdzIGZvciB0aGUgb3duZXIuClJlY2lwaWVudCBpcyBmaXhlZCB0byB0aGUgb3duZXIuAAAADmNyZWF0ZV9tYW5kYXRlAAAAAAAFAAAAAAAAAAVvd25lcgAAAAAAABMAAAAAAAAADGFnZW50X3B1YmtleQAAA+4AAAAgAAAAAAAAAAptYXhfcGVyX3R4AAAAAAALAAAAAAAAAAlkYWlseV9jYXAAAAAAAAALAAAAAAAAAAt2YWxpZF91bnRpbAAAAAAEAAAAAQAAA+kAAAAGAAAAAw==",
        "AAAAAAAAAAAAAAAOY3JlYXRlX3RyaWdnZXIAAAAAAAYAAAAAAAAABmZ1bmRlcgAAAAAAEwAAAAAAAAAFYXNzZXQAAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAC2JlbmVmaWNpYXJ5AAAAABMAAAAAAAAAD2F0dGVzdGVyX3B1YmtleQAAAAPuAAAAIAAAAAAAAAAPZGVhZGxpbmVfbGVkZ2VyAAAAAAQAAAABAAAD6QAAAAYAAAAD",
        "AAAAAAAAAGxsZWRnZXIgPiBkZWFkbGluZSAmJiBub3QgYXR0ZXN0ZWQgLT4gZnVuZHMgcmV0dXJuIHRvIHRoZSBmdW5kZXIuClJ1bGUtYmFzZWQsIG5vIGRpc2NyZXRpb247IGFueW9uZSBtYXkgY2FsbC4AAAAOcmVmdW5kX3RyaWdnZXIAAAAAAAEAAAAAAAAACnRyaWdnZXJfaWQAAAAAAAYAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAB9JbnN0YW50IHJldm9jYXRpb24sIG93bmVyIG9ubHkuAAAAAA5yZXZva2VfbWFuZGF0ZQAAAAAAAgAAAAAAAAAFb3duZXIAAAAAAAATAAAAAAAAAAptYW5kYXRlX2lkAAAAAAAGAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAJVWZXJpZmllcyB0aGUgdmVudWUgZWQyNTUxOSBzaWduYXR1cmUKKHYyIGhhbmRvZmYgZG9tYWluIHx8IGZhZGVfaWQoOEIgQkUpIHx8IGNsYWltYW50IFhEUiB8fCB0cyg4QiBCRSkpOyBzZXR0bGVzIGF0IHRoZQpwcmljZSBmcm96ZW4gYXQgYGNsYWltZWRfYXRgLgAAAAAAAA9jb25maXJtX2hhbmRvZmYAAAAAAwAAAAAAAAAHZmFkZV9pZAAAAAAGAAAAAAAAAAJ0cwAAAAAABgAAAAAAAAADc2lnAAAAA+4AAABAAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAERSZWNvcmQgYSBoaWRkZW4gY2xhaW0gaW50ZW50IGJlZm9yZSByZXZlYWxpbmcgYSBQb2QncyBiZWFyZXIgc2VjcmV0LgAAABBjb21taXRfcG9kX2NsYWltAAAAAwAAAAAAAAAGcG9kX2lkAAAAAAAGAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAAAAAApjb21taXRtZW50AAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAEFDbGllbnRzIG11c3QgY2hlY2sgdGhpcyBiZWZvcmUgdXNpbmcgdjIgc2lnbmF0dXJlcyBvciBQb2QgY2xhaW1zLgAAAAAAABBwcm90b2NvbF92ZXJzaW9uAAAAAAAAAAEAAAAE",
        "AAAAAQAAAEFBIGhpZGRlbiBQb2QgY2xhaW0gaW50ZW50LCBib3VuZCB0byB0aGUgcmVjaXBpZW50IGFuZCBkZXBsb3ltZW50LgAAAAAAAAAAAAASUG9kQ2xhaW1Db21taXRtZW50AAAAAAACAAAAAAAAAApjb21taXRtZW50AAAAAAPuAAAAIAAAAAAAAAAMY29tbWl0dGVkX2F0AAAABA==",
        "AAAAAAAAAAAAAAAYZ2V0X3BvZF9jbGFpbV9jb21taXRtZW50AAAAAgAAAAAAAAAGcG9kX2lkAAAAAAAGAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAQAAA+gAAAfQAAAAElBvZENsYWltQ29tbWl0bWVudAAA" ]),
      options
    )
  }
  public readonly fromJSON = {
    claim: this.txFromJSON<Result<void>>,
        attest: this.txFromJSON<Result<void>>,
        refund: this.txFromJSON<Result<void>>,
        get_pod: this.txFromJSON<Result<Pod>>,
        get_fade: this.txFromJSON<Result<Fade>>,
        claim_pod: this.txFromJSON<Result<void>>,
        create_pod: this.txFromJSON<Result<u64>>,
        fade_price: this.txFromJSON<i128>,
        create_fade: this.txFromJSON<Result<u64>>,
        envoy_claim: this.txFromJSON<Result<void>>,
        get_mandate: this.txFromJSON<Result<Mandate>>,
        get_trigger: this.txFromJSON<Result<Trigger>>,
        create_mandate: this.txFromJSON<Result<u64>>,
        create_trigger: this.txFromJSON<Result<u64>>,
        refund_trigger: this.txFromJSON<Result<void>>,
        revoke_mandate: this.txFromJSON<Result<void>>,
        confirm_handoff: this.txFromJSON<Result<void>>,
        commit_pod_claim: this.txFromJSON<Result<void>>,
        protocol_version: this.txFromJSON<u32>,
        get_pod_claim_commitment: this.txFromJSON<Option<PodClaimCommitment>>
  }
}