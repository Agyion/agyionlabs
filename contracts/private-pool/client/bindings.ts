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




export const Errors = {
  1: {message:"WrongNetwork"},
  2: {message:"ArtifactsUnavailable"},
  3: {message:"WrongKey"},
  4: {message:"InvalidConfig"},
  5: {message:"InvalidField"},
  6: {message:"InvalidWindow"},
  7: {message:"StaleRoot"},
  8: {message:"InvalidShape"},
  9: {message:"Spent"},
  10: {message:"InvalidBridge"},
  11: {message:"InvalidFee"},
  12: {message:"UnknownAsset"},
  13: {message:"TreeFull"},
  14: {message:"InvalidProof"},
  15: {message:"DuplicateRecord"},
  16: {message:"InvalidRevocation"},
  17: {message:"DuplicateCommitment"},
  18: {message:"ArchiveUnavailable"},
  19: {message:"ArchiveFull"}
}


export interface Config {
  assets: Array<string>;
  auditor_x: Buffer;
  auditor_y: Buffer;
  disclosure_epoch: u32;
  dkg_transcript_hash: Buffer;
}


export interface PoolState {
  next_index: u64;
  record_count: u64;
  revocation_count: u64;
  revocation_root: Buffer;
  root: Buffer;
  roots: Array<Buffer>;
}


export interface PoolConfig {
  asset_ids: Array<Buffer>;
  asset_policy_root: Buffer;
  config: Config;
  domain: Buffer;
}


export interface Transition {
  append_new_root: Buffer;
  append_old_root: Buffer;
  asset: Option<string>;
  bridge_account: Option<string>;
  bridge_amount: u64;
  bridge_kind: u32;
  ciphertext: Array<Buffer>;
  commitments: Array<Buffer>;
  fee_account: Option<string>;
  fee_amount: u64;
  input_root: Buffer;
  next_index: u64;
  nullifiers: Array<Buffer>;
  valid_from: u32;
  valid_until: u32;
}




export interface StoredRecord {
  ledger: u32;
  public_inputs: Array<Buffer>;
}


export interface StoredRevocation {
  ledger: u32;
  new_root: Buffer;
  old_root: Buffer;
  tag: Buffer;
}


export interface VerifyingKey {
  alpha_g1: Buffer;
  beta_g2: Buffer;
  delta_g2: Buffer;
  gamma_g2: Buffer;
  /**
 * IC points; `ic.len() == nPublic + 1`.
 */
ic: Array<Buffer>;
}

export interface Client {
  /**
   * Construct and simulate a spent transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  spent: ({nullifier}: {nullifier: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<boolean>>>

  /**
   * Construct and simulate a state transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  state: (options?: MethodOptions) => Promise<AssembledTransaction<PoolState>>

  /**
   * Construct and simulate a config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  config: (options?: MethodOptions) => Promise<AssembledTransaction<PoolConfig>>

  /**
   * Construct and simulate a record transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  record: ({id}: {id: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Option<StoredRecord>>>

  /**
   * Construct and simulate a revoke transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  revoke: ({tag, old_root, new_root, owner_key, signature, proof}: {tag: Buffer, old_root: Buffer, new_root: Buffer, owner_key: Buffer, signature: Buffer, proof: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a submit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  submit: ({transition, proof}: {transition: Transition, proof: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Buffer>>>

  /**
   * Construct and simulate a record_id_at transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Only out-of-range indices mean absent. A missing indexed entry is an
   * unavailable/corrupt archive and must never be interpreted as end-of-data.
   */
  record_id_at: ({index}: {index: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Option<Buffer>>>>

  /**
   * Construct and simulate a revocation_at transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  revocation_at: ({index}: {index: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Option<StoredRevocation>>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {initial, vk, revocation_vk}: {initial: Config, vk: VerifyingKey, revocation_vk: VerifyingKey},
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
    return ContractClient.deploy({initial, vk, revocation_vk}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "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",
        "AAAAAAAAAAAAAAAGc3VibWl0AAAAAAACAAAAAAAAAAp0cmFuc2l0aW9uAAAAAAfQAAAAClRyYW5zaXRpb24AAAAAAAAAAAAFcHJvb2YAAAAAAAAOAAAAAQAAA+kAAAPuAAAAIAAAAAM=",
        "AAAABQAAAAAAAAAAAAAAClRhZ1Jldm9rZWQAAAAAAAEAAAALdGFnX3Jldm9rZWQAAAAAAgAAAAAAAAADdGFnAAAAA+4AAAAgAAAAAQAAAAAAAAAEcm9vdAAAA+4AAAAgAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAAC1JlY29yZEFkZGVkAAAAAAEAAAAMcmVjb3JkX2FkZGVkAAAABQAAAAAAAAAJcmVjb3JkX2lkAAAAAAAD7gAAACAAAAABAAAAAAAAAApudWxsaWZpZXJzAAAAAAPqAAAD7gAAACAAAAAAAAAAAAAAAAtjb21taXRtZW50cwAAAAPqAAAD7gAAACAAAAAAAAAAAAAAAARyb290AAAD7gAAACAAAAAAAAAAAAAAAApuZXh0X2luZGV4AAAAAAAGAAAAAAAAAAI=",
        "AAAAAQAAAAAAAAAAAAAADFN0b3JlZFJlY29yZAAAAAIAAAAAAAAABmxlZGdlcgAAAAAABAAAAAAAAAANcHVibGljX2lucHV0cwAAAAAAA+oAAAPuAAAAIA==",
        "AAAAAQAAAAAAAAAAAAAAEFN0b3JlZFJldm9jYXRpb24AAAAEAAAAAAAAAAZsZWRnZXIAAAAAAAQAAAAAAAAACG5ld19yb290AAAD7gAAACAAAAAAAAAACG9sZF9yb290AAAD7gAAACAAAAAAAAAAA3RhZwAAAAPuAAAAIA==",
        "AAAAAAAAAI5Pbmx5IG91dC1vZi1yYW5nZSBpbmRpY2VzIG1lYW4gYWJzZW50LiBBIG1pc3NpbmcgaW5kZXhlZCBlbnRyeSBpcyBhbgp1bmF2YWlsYWJsZS9jb3JydXB0IGFyY2hpdmUgYW5kIG11c3QgbmV2ZXIgYmUgaW50ZXJwcmV0ZWQgYXMgZW5kLW9mLWRhdGEuAAAAAAAMcmVjb3JkX2lkX2F0AAAAAQAAAAAAAAAFaW5kZXgAAAAAAAAGAAAAAQAAA+kAAAPoAAAD7gAAACAAAAAD",
        "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAMAAAAAAAAAB2luaXRpYWwAAAAH0AAAAAZDb25maWcAAAAAAAAAAAACdmsAAAAAB9AAAAAMVmVyaWZ5aW5nS2V5AAAAAAAAAA1yZXZvY2F0aW9uX3ZrAAAAAAAH0AAAAAxWZXJpZnlpbmdLZXkAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAAAAAAANcmV2b2NhdGlvbl9hdAAAAAAAAAEAAAAAAAAABWluZGV4AAAAAAAABgAAAAEAAAPpAAAD6AAAB9AAAAAQU3RvcmVkUmV2b2NhdGlvbgAAAAM=",
        "AAAAAQAAAAAAAAAAAAAADFZlcmlmeWluZ0tleQAAAAUAAAAAAAAACGFscGhhX2cxAAAD7gAAAEAAAAAAAAAAB2JldGFfZzIAAAAD7gAAAIAAAAAAAAAACGRlbHRhX2cyAAAD7gAAAIAAAAAAAAAACGdhbW1hX2cyAAAD7gAAAIAAAAAlSUMgcG9pbnRzOyBgaWMubGVuKCkgPT0gblB1YmxpYyArIDFgLgAAAAAAAAJpYwAAAAAD6gAAA+4AAABA" ]),
      options
    )
  }
  public readonly fromJSON = {
    spent: this.txFromJSON<Result<boolean>>,
        state: this.txFromJSON<PoolState>,
        config: this.txFromJSON<PoolConfig>,
        record: this.txFromJSON<Option<StoredRecord>>,
        revoke: this.txFromJSON<Result<void>>,
        submit: this.txFromJSON<Result<Buffer>>,
        record_id_at: this.txFromJSON<Result<Option<Buffer>>>,
        revocation_at: this.txFromJSON<Result<Option<StoredRevocation>>>
  }
}