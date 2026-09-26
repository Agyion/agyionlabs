# Private pool source review — 2026-09-26

This file preserves successive review checkpoints below. For the final source
hashes, fresh 27-test native/WASM result and completed client verification, read
the [current v2 report](../../docs/security/2026-09-26/PRIVATE_V2.md).
The earlier pending proof/rollback statements do not describe the final result;
live deployment and network archival restoration remain unverified.

Scope: every file under `contracts/private-pool/src`, with public-input comparison
against `privacy/PROTOCOL_V2.md`, `privacy/src/model.mjs::parseCore23` /
`evaluateTransition`, and the relevant transition/revocation circuit constraints.
This is a bounded internal review, not an independent cryptographic audit.

No new exploitable pool-runtime issue was demonstrated in this pass. Four added
boundary regressions pass; **19/19 default Rust tests** and all-target/all-feature
Clippy pass. The real 17-step pool proof chain, successful full-pool WASM execution,
actual token-failure rollback and network archival restoration **remain pending**
at this checkpoint. The existing real one-input preimage proof tests only the
generic verifier; it cannot satisfy the pool's pinned 157-input key.

## Reviewed boundaries

| Public fields | Contract enforcement and corresponding proof responsibility |
|---|---|
| 0–5 | Domain, asset policy, positive u32 epoch, auditor coordinates and current revocation root are reconstructed from immutable/current state. The circuit validates auditor subgroup membership; the constructor itself only checks canonical coordinates/nonzero x. A malformed deployment config therefore cannot fund a valid transition. |
| 6–7 | Typed u32, inclusive current ledger, ordered interval of at most 120. Regression covers both endpoints, expiry, reversed bounds and u32 maximum. |
| 8–11 | Canonical accepted input root from 64-entry history; append root/index must be current. Capacity is at most 2^32 and includes both new leaves. Empty output requires unchanged root; proof establishes membership and empty-leaf insertion. |
| 12–15 | Exactly two canonical nullifiers/commitments; duplicate nonzero inputs/outputs rejected, outputs packed. Persistent nullifiers and previously inserted commitments prevent spend/reissuance replay. Proof binds these values to the same private notes and policy branches. |
| 16–19 | Bridge kind 0/1/2; positive u64 external amount and explicit account for deposit/withdrawal, neither internally. Exposed asset must be allowlisted; account/asset IDs are recomputed from tagged canonical ScVal XDR. Deposits require zero real inputs, at least one output and funder authorization. Unknown-token regression rejects before verifier, auth, token calls or effects. |
| 20–21 | Typed u64 fee; recipient absent exactly when fee is zero. Internal fees expose the actual allowlisted token. Proof binds fee to conservation; circuit forbids Envoy-agent pool fees. Native test confirms fee/account mismatch rejection. |
| 22 | Contract fixes suite marker 2. |
| 23–156 | Exactly 134 canonical Fr fields, unchanged in verifier inputs and durable archive. Each of five nonces is nonzero and below 2^128; proof checks curve/subgroup points, encryption, distinct nonces/ephemerals and exact plaintext/witness equality. Regression covers all five nonce boundaries and all 134 vector positions. |

The ABI regression preserves `u64::MAX` amount/fee encodings and the independently
computed account identifiers. It does **not** claim a conserved transfer exists
with both maxima. With at most two u64 inputs and one u64 deposit, conservation
cannot wrap around the BN254 scalar modulus. Conversion to i128 is lossless;
individual SAC balance limits can still reject a transfer atomically.

`statement.mjs` is the older parser-only profile and is not the pool's public-input
authority. Its variable note counts/digest envelope must not replace the v2
157-field vector. The typed pool adapter uses the v2 layout.

## Identity, verifier and authorization

- Testnet network ID is enforced at construction and every write. Domain binds
  network and pool address; distinct asset/account tags prevent role ambiguity.
  Regressions prove different network/deployment changes domain/revocation tag.
- Verifier keys are compile-time hashes with exact IC counts 158/5. Both current
  zero pins failed closed at the initial review checkpoint. There is no caller-selected key, accepting stub, admin
  bypass, upgrade entrypoint or key rotation.
- Proof is exactly 256 bytes; every Fp coordinate is canonical before manual G1
  negation, every public scalar is canonical before MSM. Host BN254 calls enforce
  point validity/subgroup rules. Invalid host encodings can trap; no effects have
  occurred at this point. Real full-pool proof acceptance remains unexecuted.
- Revocation requires a key-derived domain/tag, strict host Ed25519 verification
  over domain/old root/new root/tag, current root equality and the separate real
  four-input proof. The circuit inserts a domain-specific leaf at the tag's low
  128 bits; successful replay cannot reuse the prior root.
- Pool-as-funder is not a self-authorization bypass. In the inspected host 28.0.2
  auth implementation only the **direct invoking contract** implicitly authorizes
  a callee, not the currently executing contract authorizing itself. The pool has
  no custom account authorization entrypoint. This matches Stellar's
  [contract authorization model](https://developers.stellar.org/docs/build/guides/auth/contract-authorization).

## Token calls, archive and explicit trust limits

`submit` verifies state/proof and funder authorization before effects. It then
persists nullifiers, commitment seen-keys, root/index, record bytes and enumeration
index/count **before** deposit, withdrawal and fee token calls. Later failure must
roll back earlier writes/transfers under Stellar transaction atomicity.
[Transaction execution guarantees](https://developers.stellar.org/docs/learn/fundamentals/contract-development/contract-interactions/transaction-simulation)
support that ordering; the prepared real-proof SAC failure tests have not yet run.
There is no catch-and-continue around a token failure.

Asset allowlisting is a configuration trust boundary, not validation of token
semantics. An allowlisted malicious or fee-taking custom token can lie about a
transfer/balance. Reading that same token's balance cannot make it trustworthy.
The testnet release must pin reviewed SAC assets; unknown assets fail before calls.
The current native fixture uses an actual SAC. Freeze/clawback/issuer policy remains
an external asset risk and is not removed by privacy proofs.

Both archive counts use checked addition. `record_id_at`/`revocation_at` return
absent only beyond the count; an in-range missing index returns `ArchiveUnavailable`.
Full records, indexes, nullifiers and seen commitments are persistent, never
deleted, and TTL-extended when created. Expired persistent entries require network
restoration; they must not be interpreted as unspent or end-of-history. Protocol 23+
restoration depends on the transaction's restore list; otherwise invocation fails.
[Stellar state archival](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival)
documents that behavior. The native TTL regression proves the retained-entry guard,
**not** ledger-apply restoration. Clients must restore/retry reads and verify the
enumerated roots; untrusted RPC responses are not authenticated merely by shape.

## Deployment preparation correction

The previous offline plan generated a random signing identity after the committee
key was chosen, so it could not establish that the DKG was bound to the eventual
contract address. The helper now requires a pre-established public source account,
salt and intended contract ID; recomputes the Stellar address; verifies the trusted
threshold roster, every dealer package/acceptance and deployment/epoch/key/hash
binding; and fixes the source/salt in the deployment arguments. A valid transcript
copied from another deployment is rejected. Seven tooling tests pass, including
wrong address, epoch, key, hash, acceptance signature and roster.

The helper executes no key generation, network or deployment action. It does not
prove trustee independence, delivery/storage of private shares, setup soundness,
legal authority, or bytecode-to-source provenance. See [the required sequence](tools/DEPLOYMENT.md).

## Exact reviewed source coverage

Rust/JSON files were read in full. The binary parameter blob was inspected through
its documented layout, source provenance, SHA256 and independent Poseidon vector;
no binary decompilation or dependency-wide audit is claimed. Test source review
does not mean opt-in proof tests executed. Hashes identify this checkpoint before
future verifier-pin generation.

| Path below `contracts/private-pool/src/` | SHA256 |
|---|---|
| `address_fixture.json` | `f5843e670ba9bdcb539fc54fc5795f893560efa2703028e7225dd1ec5897b2c5` |
| `hash.rs` | `a71ca38e9ecbc3ac371e4df2a9e4449982119dd78dd1c2f094bc6604a10510b3` |
| `host_identity_fixture.json` | `aa86f934b28392f52699e2194a6643557e79c9fe5b191f5315b521fa2590cccc` |
| `lib.rs` | `e1b38a06ed1f919955e1445a71216b5a06df66ca7106a5eae5a355d9db76cb7f` |
| `pins.rs` | `9ac797b2374665beb8006280c5665e0555f501e6354f824e3b54cc546c24c0ac` |
| `poseidon_t3.bin` | `d580f0ebf5aec8825a0212c9db8fd20135155e1352e68809e2d7f2bc5440b86f` |
| `test/integration.rs` | `6456c74d2ae6643f978ae4845f9b2948ed400fc2e5f1568c20c076ceb728bb7f` |
| `test.rs` | `e22e1ee51905e724a1e357b32d019c30f6479ec82c7a47065b6bac7d4ce6a6ae` |
| `tree_zeros.rs` | `a907352f19f8b703e72cb21fe6ee4c06dc7cc6f5f4007b4e4f5acf992767b602` |
  | `verifier.rs` | `bbf8931c745922654581c0d4d7ba11241891557dcb922fa6965e90a50476da3b` |

## Subsequent actual-key build checkpoint

Both actual VKs from the verified development artifact manifest are now pinned:
transition `23776ca5d8552a9d9e00bfd5c7fa63c2cc4bbbfea8163f898174c3845489326d`,
revocation `5afe76760a371a27a6cb9823f30e94a9aac7376d99eaf3b0aaab3917b51ba375`.
The optimized pool WASM is 27,648 bytes with SHA256
`02fe15ab5b79a496a83e08c269d74b2ab0bdf60145d0cd9b47236f10b31b2980`.
Generated ABI is byte-identical; 19 default Rust, 7 tooling and 4 client tests pass.
`artifacts/privacy-v2/pool-build.json` records exact build and pin evidence.
Full proof-chain execution is still pending. Published phase-1 provenance does
not make the single-operator development phase-2 an independent ceremony.

## Subsequent actual-proof execution checkpoint

The pending proof-execution items above are superseded by
[RESOURCE_RESULTS.md](RESOURCE_RESULTS.md): 24/24 tests passed, including the
actual native/WASM 17-step chains, public-input tampering/replay/authorization
rejection and real SAC rollback/retry. Raw files preserve exact source/pin/build
context. The full WASM maximum is 89,224,962 CPU and 3,531,897 memory bytes;
all 86 cost-model coefficient rows match the independently read testnet snapshot
at ledger 4,881,984. Ledger-apply archival restoration, signed-envelope size,
live RPC simulation/inclusion and deployment are still outside this evidence.
