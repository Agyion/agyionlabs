# Pod ZK and eERC review

Reviewed 2026-09-26. Scope: the current local working tree under `circuits/` and `contracts/zk-preimage/`, with read-only Pod/client integration context and primary-source eERC/Soroban research. This is an authored-code review and targeted verification, not a formal cryptographic audit, a deployed-contract attestation, or an audit of all transitive dependencies.

Published to the review directory after source checkpoint `29db661`. No product code, setup, verifier key or deployment was changed by this review. The companion [private instrument design](private-instruments-design.md) addresses the subsequent request to keep Fade public while researching confidential Pod, Trigger and Envoy.

Snapshot boundary: references to Pod's plaintext reveal describe the reviewed pre-remediation implementation, not a promise that later working-tree changes retain it. The separately proposed kernel V3 Ed25519 claim-key repair binds public claim authorization to a recipient and removes secret revelation; it is not ZK or amount/counterparty privacy. Its implementation and new tests must be assessed in the remediation report. The verifier findings below concern the independent preimage module.

## Decision

The current verifier is a narrowly scoped preimage-knowledge demonstration. Its source implements the standard Groth16 pairing equation, pins one verification key, and rejects noncanonical public scalars. The checked-in proof verifies. I did not identify a demonstrated invalid-proof acceptance in this reviewed implementation.

That does **not** make Pod a private-payment system. The circuit has one public output, `Poseidon(preimage)`. It does not bind a payment recipient or any Pod, network, contract or spend identifier. Current Pod transfers use a separate SHA-256 reveal path and expose amounts and addresses. A safe ZK claim requires a new circuit, versioned commitment scheme and contract entry point. Encrypted balances require a further token-ledger design; they are not a verifier toggle.

Direct reuse of Avalanche eERC code on Stellar also has a licensing obstacle. The pinned repository uses Ecosystem License 1.1, restricting use to the specified Avalanche platform/ecosystem conditions. Technical EVM portability in its README is not a Stellar license grant. Obtain appropriate permission or choose independently implemented, appropriately licensed components before copying code or circuits. [Official license](https://github.com/ava-labs/EncryptedERC/blob/8dc98cd4d63ad3aa6d86b70b8f4bbcd70f1e8be1/LICENSE.md)

## Actual local coverage

| File | Review performed |
|---|---|
| `circuits/preimage.circom` | All 19 lines; signal visibility, assignments, constraints and include |
| `circuits/input.json` | Entire sample input; publicly disclosed demo secret |
| `circuits/public.json` | Entire public-signal vector, arity and integer encoding |
| `circuits/proof.json` | Entire Groth16 point representation and curve/protocol metadata |
| `circuits/vk.json` | Entire key, IC arity and host-encoded hash reconstruction |
| `circuits/package.json` | Entire scripts/dependency/override configuration |
| `circuits/package-lock.json` | Parsed all 37 package records, registry origins and pinned dependency metadata; package implementations not audited |
| `contracts/zk-preimage/src/lib.rs` | All 232 lines, including key initialization, scalar handling, point parsing, negation, pairings and TTL |
| `contracts/zk-preimage/src/test.rs` | Entire authored test file, artifact encoders, native and optional WASM tests |
| `contracts/zk-preimage/Cargo.toml` | Entire feature/dependency/release configuration |
| `contracts/zk-preimage/Cargo.lock` | Parsed all 215 package records and source origins; dependency implementations not audited |
| `contracts/zk-preimage/README.md` | Entire API, setup, measurement, integration and limitations documentation |
| `contracts/zk-preimage/.gitignore` | Entire file |
| `contracts/zk-preimage/artifacts/{vk,proof,public}.json` | Byte-identical to the corresponding reviewed circuit artifacts |

Generated `target/`, `wasm/`, `node_modules/` and test snapshots are not authored-source coverage. No `circuits/build/` R1CS, witness WASM, ptau or zkey is present. Git confirms the three verifier test artifacts are tracked. Review snapshot SHA-256 values are retained in `/tmp/agyion-eerc-review-20260926/local-scope.json`.

Integration context read: all of `contracts/hak/src/pod.rs`, its credential-domain helper in `contracts/hak/src/lib.rs`, and the verification simulation boundary in `app/lib/zk.ts`. The HAK and client reviewers own exhaustive coverage outside this scope.

## Findings and release conditions

### ZK-01 — Proof does not authorize a Pod claim

**Classification:** confirmed integration gap; high-impact blocker if the demo is promoted to a payment authorization mechanism. It is not evidence of theft through the currently unintegrated verifier.

Evidence: `circuits/preimage.circom:10–19` has only a private field-element preimage and public hash. `contracts/zk-preimage/src/lib.rs:99–100` requires two IC points, hence exactly one public input. `contracts/hak/src/pod.rs:127–169` accepts the plaintext preimage, checks SHA-256 and a separate commitment, and transfers the token without invoking this verifier.

A proof for one hash is valid anywhere the same key and statement are accepted. Changing caller, chain, recipient or Pod is not visible to this circuit. Repeated off-chain verification returned `true`, as expected for this stateless predicate. The calling application must not interpret that predicate alone as ownership, authorization, unlock eligibility or spend uniqueness.

Required: a new claim statement and contract API that compare proof-bound values against the actual invocation and stored Pod, check unlock/state, and consume the spend atomically. New public fields must participate in constraints; listing unused signals as public does not bind them. A semantic nullifier or immutable Pod-spent state must be used, not a hash of proof bytes.

### ZK-02 — Demo trusted setup has no production provenance

**Classification:** confirmed production-assurance blocker; no toxic-waste compromise demonstrated.

The README explicitly calls the setup local/demo-grade. The repository contains a verification key and one sample proof, but no reproducible original R1CS/zkey/phase-2 transcript or ceremony verification evidence. A valid proof under a pinned key confirms algebraic consistency for that sample; it does not prove that the key came from the intended audited circuit or that setup secrets were destroyed.

Required: pin the circuit/compiler/dependencies, publish source-to-R1CS reproducibility, verify the proving key against that exact R1CS and a vetted phase-1 transcript, document the circuit-specific phase-2 contributions, and preserve hashes. A public Powers-of-Tau transcript alone does not establish the safety of a new circuit-specific Groth16 setup. Changing the circuit requires replacing the key, pin, proof artifacts and deployed verifier. Avoid deterministic or publicly known setup entropy.

### ZK-03 — Current commitment types cannot be substituted silently

**Classification:** confirmed compatibility gap.

Pod stores a 32-byte SHA-256 hash of arbitrary secret bytes; the demo proves a Poseidon hash of one BN254 scalar. Reducing a SHA-256 digest modulo the field or reinterpreting the secret as a decimal scalar changes the statement. It does not make the two commitments equivalent. `input.json` also exposes the sample preimage `20260919`; it is only test data.

Required: either prove the exact existing byte-oriented SHA-256 relation, with bounded length and explicit encoding, or introduce a new Pod version with a specified Poseidon commitment. Existing Pods need an explicit compatibility/migration path. New secrets need adequate randomness, a defined encoding and no reuse across claims.

### ZK-04 — Operational key/state lifecycle is deliberately limited

**Classification:** documented availability and upgrade constraint, not unauthorized key replacement.

The hash pin prevents a hostile first caller from installing another or degenerate key. Exact-length concatenation and exactly two IC points make the key encoding unambiguous. Initialization is write-once and exposes no arbitrary upgrade/admin operation. New circuits therefore require a new verifier deployment and explicit caller version selection; accepting a caller-supplied verifier address would defeat this boundary.

The contract extends instance TTL when `init` or `verify` executes. RPC simulation does not persist that extension. Archived state requires restoration; direct verification before initialization traps. A production caller needs a tested deployment/init check, restoration behavior and an operational TTL policy. None of these should be disguised as proof invalidity.

### ZK-05 — Poseidon interoperability is an untested assertion

**Classification:** low current risk, material integration prerequisite.

The circuit comment says its parameters match the Soroban host. The verifier never hashes with Poseidon itself, so its existing tests cannot prove that claim. CAP-0075 provides configurable permutation primitives, not an automatically identical application hash. Test exact field, width, round counts/constants, MDS matrix, initialization, output extraction and domain encoding against Circom vectors before any contract uses the host hash. [CAP-0075](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0075.md)

### Pod reveal timing — coordinated finding outside owned scope

The current Pod commitment includes network, contract, Pod ID, recipient and plaintext secret before hashing; recipient authentication and a previous-ledger maturity check prevent immediate copied-recipient substitution. They do not, by themselves, make an already disclosed secret private. An observer who learns a simulated or pending reveal and can delay the honest transaction may have time to establish a different recipient commitment. The HAK reviewer owns reproduction and severity; this review did not run that exploit.

A ZK redesign must resist delayed-network copying, not only same-ledger order changes. Keep the witness on the user's device and bind the intended recipient cryptographically before authorization. Do not rely on a trustworthy RPC or a finite commitment delay as the sole secrecy boundary.

## Verifier mechanics checked

- The pairing product matches Groth16: `e(A,B) · e(-alpha,beta) · e(-L,gamma) · e(-C,delta) = 1`, with `L=IC[0]+hash·IC[1]`.
- Proof length is exactly 256 bytes. Public input count and 32-byte length are checked. Scalars equal to or above the BN254 scalar modulus are rejected before the SDK's modular conversion.
- G1 is encoded X/Y big-endian; G2 swaps snarkjs's Fq2 component order to the host format. The independently encoded 576-byte key hashes to `3966012757c54284dcf07c3b2d02a9c2c2a136d04e470b8bda75f4d3e84a905c`, matching the compiled pin.
- G1 negation preserves infinity and subtracts Y from the base-field modulus. Proof C is ultimately checked through its negation by the host; this is not an unchecked arbitrary point accepted as valid.
- Host pairing semantics reject invalid encodings, off-curve points and G2 points outside the correct subgroup. The verifier documents traps for these cases. Callers need to handle a trapped invocation as failure, not expect every invalid proof to return `false`. [CAP-0074 validation rules](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0074.md)
- No amount, arithmetic balance, recipient, nullifier or range circuit exists here. A range proof is unnecessary for the current field-preimage demonstration, but indispensable once integer amounts or counters become part of the statement.

Tests already present cover a valid proof, changed public hash, malformed lengths, swapped/corrupted points, duplicate initialization, zero/different keys, zero proof and noncanonical scalars. Missing production evidence includes independent generated witnesses, original setup reconstruction, real deployment compatibility, integrated claim mutation/replay tests and complete budget tests.

## eERC: what the primary sources actually provide

Snapshot: `ava-labs/EncryptedERC` commit `8dc98cd4d63ad3aa6d86b70b8f4bbcd70f1e8be1`, dated 2026-08-31. Documentation and source were checked on 2026-09-26. This is architectural research, not a new comprehensive audit of eERC.

| Dimension | Observed eERC design | Consequence for Agyion |
|---|---|---|
| Privacy target | Amounts and balances encrypted; sender, receiver and timing remain public. | Do not label this anonymity or unlinkability. |
| Modes | Standalone private token or converter for an existing ERC-20. | Stellar needs a new confidential token or wrapper/custody ledger; existing public balances remain public. |
| Crypto | Groth16 plus partially homomorphic encryption. | Verifier, ciphertext algebra and token state must agree. |
| Auditor | One designated, rotatable audit key. | Confidentiality explicitly excludes that authorized observer. |

These are the official product boundaries. They do not certify privacy for every entry/exit or implementation revision. [Avalanche eERC overview](https://docs.avax.network/integrations/encrypted-erc)

**Amount correctness.** The transfer circuit constrains the amount below the BabyJubJub subgroup order and no greater than the sender balance; it links the sender's balance/key, debit ciphertext, recipient ciphertext and both recipient/auditor encrypted summaries. These constraints illustrate why a preimage circuit cannot supply balance privacy. [Pinned transfer circuit](https://github.com/ava-labs/EncryptedERC/blob/8dc98cd4d63ad3aa6d86b70b8f4bbcd70f1e8be1/circom/transfer.circom)

**Freshness and replay.** Encrypted balances are checked against stored state/history and invalidated through nonces when debited. Mint uses a checked chain ID and consumed nullifier. This is stateful accounting; `verifyProof=true` alone is insufficient. Transfer domain inputs should be reviewed independently rather than assuming mint's domain fields apply to every operation. [Balance state](https://github.com/ava-labs/EncryptedERC/blob/8dc98cd4d63ad3aa6d86b70b8f4bbcd70f1e8be1/contracts/EncryptedUserBalances.sol), [mint circuit](https://github.com/ava-labs/EncryptedERC/blob/8dc98cd4d63ad3aa6d86b70b8f4bbcd70f1e8be1/circom/mint.circom)

**Public boundaries.** The converter's deposits and withdrawals reveal amounts through token movements/events. Its current source explicitly warns that deterministic deposit encryption makes deposit-only balances publicly derivable until a randomized private transfer contributes uncertainty. Recipient/sender public keys are compared against the registrar; auditor keys are compared against current contract configuration. [Pinned token contract](https://github.com/ava-labs/EncryptedERC/blob/8dc98cd4d63ad3aa6d86b70b8f4bbcd70f1e8be1/contracts/EncryptedERC.sol)

**Key and auditor powers.** The owner chooses a registered auditor; the manager stores one current address/key and emits changes. It does not re-encrypt historical ciphertext on rotation. Therefore, changing the current key does not revoke an old key's ability to decrypt its historical ciphertext, and a new key should not be assumed to recover old history automatically. Audit access is a disclosure power, not an automatic spending permission. Key backup, rotation, compromise and retention need an explicit policy. [Pinned auditor manager](https://github.com/ava-labs/EncryptedERC/blob/8dc98cd4d63ad3aa6d86b70b8f4bbcd70f1e8be1/contracts/auditor/AuditorManager.sol)

**Randomness and constraints.** The current components check points, constrain key/value ranges, require nonzero encryption randomness in relevant paths, and authenticate ciphertext padding. A Soroban design needs the same classes of invariants and must use constraint equations, not witness-generator-only assertions. Merely detecting a valid BN254 proof says nothing about whether those invariants were in its circuit. [Pinned components](https://github.com/ava-labs/EncryptedERC/blob/8dc98cd4d63ad3aa6d86b70b8f4bbcd70f1e8be1/circom/components.circom)

**Setup claims.** The README instructs production deployments to select production verifiers and verify proving keys against their R1CS and Powers-of-Tau files. Those instructions are a dependency/provenance requirement, not permission to transplant a key into a different circuit. [Official README](https://github.com/ava-labs/EncryptedERC/blob/8dc98cd4d63ad3aa6d86b70b8f4bbcd70f1e8be1/README.md)

## What the published audits cover

Both official PDF reports were downloaded and their actual text read. The repository README's broad “March 2025” descriptions do not match the dated engagement pages; report contents control this summary.

- **Core/Gnark, Hexens:** engagement 2025-01-20 through 2025-02-18, EncryptedERC commit `bbfc7a1fa4706a3bfd4d895c184ece5dcd0a7e60` and SDK commit `dcb90c689dda4e83f3efb63751271ea5d4fdfc13`. Fourteen findings, including a critical missing subgroup-order bound and a lower-severity mint proof replay/malleability issue; these entries are marked fixed. Relevance: subgroup arithmetic can invalidate token conservation, and proof bytes are unsuitable replay identifiers. This report is not an audit of the current August 2026 commit. [Official core audit PDF](https://github.com/ava-labs/EncryptedERC/blob/8dc98cd4d63ad3aa6d86b70b8f4bbcd70f1e8be1/audit/avacloud-eerc-audit.pdf)
- **Circom, Hexens:** engagement 2025-04-03 through 2025-04-09, scoped to the `circom2-circuits` branch. Three findings: one medium and two informational. The missing curve-membership validation and receiver-randomness subgroup-bound entries are marked fixed. Relevance: a port must preserve all point/scalar checks and verify circuit artifacts, rather than inherit an “audited” label from a related implementation. [Official Circom audit PDF](https://github.com/ava-labs/EncryptedERC/blob/8dc98cd4d63ad3aa6d86b70b8f4bbcd70f1e8be1/audit/avacloud-eerc-circom-audit.pdf)

## Soroban feasibility and limits

BN254 G1 operations and pairing are available from Protocol 25; efficient BN254 MSM used by this local verifier is a Protocol 26 host function. The Solidity contracts and storage/authorization logic do not execute on Soroban; they need Rust/WASM equivalents. Native BN254 verification also does not provide BabyJubJub ciphertext operations automatically. That encrypted-ledger arithmetic requires a compatible implementation and separate metering. [CAP-0074](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0074.md), [CAP-0080](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0080.md)

The local Cargo configuration uses SDK 28.0.0. Verify the built WASM's environment metadata and all imported functions against the target network protocol. Native-test success is not deployment compatibility. The README's approximately 26M-instruction figure is a previously recorded standalone test-host measurement; I did not remeasure it here. Whole-claim costs include verification, storage, authorization and token calls. Official resource limits are network settings, and must be checked for the intended network rather than inferred from an old benchmark. [Resource limits](https://developers.stellar.org/docs/networks/resource-limits-fees)

Persistent and instance state can be archived and restored; temporary state expires irreversibly. Durable spent-state/nullifiers cannot safely disappear while their proof domain remains valid. TTL management and restoration are therefore part of replay design, not only availability. [Official storage guidance](https://developers.stellar.org/docs/build/guides/storage/storage-strategies)

There are now official Stellar references for confidential tokens and shielded privacy pools. They provide a better chain-native comparison than assuming Solidity is portable. The official page explicitly calls both current developer previews unaudited and unsuitable for real assets. Treat them as research references, not a production shortcut. [Privacy on Stellar](https://developers.stellar.org/docs/build/apps/privacy)

## Concrete design split

1. **Current Pod safety:** resolve the revealed-secret timing model first. Test a malicious/delaying RPC and recipient substitution across later ledgers. Do not make a ZK marketing claim for the current reveal path.
2. **Secret-private Pod version:** define exact byte/field encodings, a versioned commitment and constrained claim domain containing network, contract, Pod and recipient. Include a semantic spend identifier. Compare all relevant proof values to authenticated arguments/stored state; enforce time and consumed status in contract. Raw network/address bytes need canonical, non-lossy limb encoding rather than modulo reduction. Generate proofs locally; do not send witness secrets to RPC. If the recipient is fixed when funding, bind that policy then; if bearer transfer is intentional, define the holder's recipient-selection authority explicitly.
3. **Confidential amount version:** choose standalone asset versus backed wrapper and define supply conservation, ranges, fee/rounding behavior, authorization, recipient registration, encrypted-balance freshness, auditor powers, recovery and public entry/exit leakage. Keep this a separate asset/protocol version. Existing public SEP-41 transfers cannot become confidential by displaying masked values or proving secret knowledge.

Before a value-bearing release, require independent circuit/contract review plus tests for every mutated bound field, cross-network/contract/Pod replay, delayed proof copying, spent-state replay after restoration, malformed points, noncanonical scalars, boundary amounts, wrong-recipient/auditor ciphertexts and setup-artifact mismatches. Prove conservation across multiple transactions, not just acceptance of one sample proof.

## Verification actually run

| Check | Result |
|---|---|
| `npm --prefix circuits test` | Passed: committed proof verifies |
| Independent snarkjs calls | Valid=true; repeated same proof=true; hash+1=false; swapped A/C=false |
| VK serialization/hash reconstruction | 576 bytes; SHA-256 equals compiled pin |
| Circuit/verifier artifact comparison | All three pairs byte-identical |
| Dependency-lock origin inspection | 37 npm records / 215 Cargo records; expected registries; no dependency-code audit claim |
| Fresh Rust native/WASM tests | Not run here: cargo resource slot assigned to HAK reviewer |
| Live verifier/deployment or signing | Not performed |

No conclusion here establishes production privacy, complete exploit absence, target-network compatibility, or a safe original trusted setup.
