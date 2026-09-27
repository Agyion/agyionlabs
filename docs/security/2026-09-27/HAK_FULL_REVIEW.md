# HAK source review and compatibility checkpoint

Date: 27 September 2026. Scope: the owned public HAK kernel and its generated
application ABI. This is a complete line review of the five HAK runtime source
files at the hashes below, not a whole-repository or independent audit. It does
not establish that the code is impossible to exploit. No real wallet, external
target, chain deployment or transaction was used by this review.

## Result

The first local checkpoint passed 63 tests, but the subsequent actual testnet
smoke exposed a positive Fade handoff compatibility defect: claimant token
authorization existed only in the nested transfer, so the public RPC's default
root-only authorization recording rejected simulation. Existing tests used a
non-root authorization mock and therefore concealed this failure.

The positive-price branch now calls `claimant.require_auth()` at the handoff
root before its nested token transfer. The V3 ABI is unchanged; the WASM hash
changed. Two new default-root tests failed against the previous native/WASM
artifact, then passed after the fix. They assert the exact root and token-child
authorization tree. The updated combined suite passed **65 tests, zero failures
and zero ignored**. Negative/zero-price and Envoy paths remain permissionless
with respect to claimant account authorization. Ten tests were added in total:
five invariant families against both native Rust and freshly built WASM.
Strict Clippy passed. All **23 ABI specification entries** are byte-identical
between the compiled artifact and the current application bindings.

These checks support proceeding with a separate **testnet compatibility and
integration check**. They do not approve real funds, certify the frontend's
configuration, activate the private pool, or migrate the old deployed kernel.
The reviewer did not modify the published deployment. Other task participants'
deployment evidence must be consulted separately.

## Exact manual coverage

Ranges are inclusive. Each runtime file was read in full, including validation,
storage and helper paths. Runtime total: **1,190 lines**. Test/helper review is
separate from runtime review. The generated specification was compared as bytes;
generated base64 is not claimed as a manual cryptographic review.

| File | Lines read | SHA-256 |
| --- | --- | --- |
| `contracts/hak/src/lib.rs` | 1–356 | `ce4bbfc73d84fd2b2c8e4b3aa5a331a5c54581a38f88770343bc6880426ee8b5` |
| `contracts/hak/src/fade.rs` | 1–314 | `2f0a2fb99a642e28348d938e4d30ed8f35bc979f775ed986ebe86c0fe8058686` |
| `contracts/hak/src/pod.rs` | 1–127 | `6cdec41e8643c7bb92011aa655d36355b6373ab0f9d290b050690ae98655c170` |
| `contracts/hak/src/trigger.rs` | 1–168 | `4fc87d77a1eb580eba2f1ec6027b5596c577ba71dcc84e5fc1d0e9c09c080c88` |
| `contracts/hak/src/envoy.rs` | 1–225 | `133899666d5b5b058aeeae9ddd94a2a7285486ebfc70bfbb336217c04542aa78` |
| `contracts/hak/src/test.rs` | 1–2425 | `aa25c6562c37ccb55f3edf71dad81581f72cfe35cd2e9ee487e08cd0363909e7` |
| `contracts/hak/src/review_test.rs` | 1–491 | `bf60c9f79395c376b985ec2854b552d951bc1b9a67fcb4c6991f31887e06cce4` |
| `contracts/hak/Cargo.toml` | 1–29 | `57c6d208469bdecff3a1b72e8d1c4b73a8abc6269bfaf68e8784e13231b0c2bc` |
| `contracts/hak/SECURITY_PROTOCOL.md` | 1–127 | `5ec5ff1916a45431727c59c72e333905e11e53b44012fc800d7a03de7a59bed9` |
| `app/lib/hak-bindings/src/index.ts` | 1–314, method/type mapping plus automated encoded-spec parity | `16f4276e3a77c0949c63d750675f483ffd0ebc2c909bfecd15acbde24651c508` |

`Cargo.lock` is pinned by the locked build, at
`497d7644c8519a741a50b648b464d6c655f5c8efb0460d761416ea90e796d7a4`.
Its 2,121 lines and transitive dependency implementations are **not** counted as
manually audited source. Fixture identity and all evidence hashes are recorded
in the local evidence manifest.

## Review conclusions by path

### Common boundary and storage

All public entry points map to their intended template. The V3 version check,
error codes, address/amount types and field order match the app ABI. Record IDs
are template-specific; the persistent records cannot overwrite each other.
Counters are in instance storage and are extended together with contract code
and instance TTL. Successful record accesses extend persistent TTL. No public
reset-counter, arbitrary withdrawal, administrator balance sweep, code upgrade
or record-deletion entry point was found.

The next-ID increments use checked release arithmetic through
`overflow-checks = true`. At the unreachable-in-practice `u64` counter limit,
creation traps and the invocation rolls back; it does not wrap to a funded
record. It is not an unlimited-lifetime guarantee. Archive handling is a host
and operational responsibility, not equivalent to a missing record. An archived
contract must be restored, not replaced with an empty initialized instance.

### Fade

The funder authorizes creation. Positive pot, ordered prices, negative floor
bounded by the pot, rational slope bounds and reachable deadline/handoff/refund
ledgers are validated before transfer. The `I256` price intermediate fits an
`i128` slope multiplied by a `u32` elapsed ledger, and the result is clamped to
the supplied representable bounds. The claim freezes one claimant and ledger.
Settlement derives the price from that ledger, requires the venue signature
bound to the action/network/deployment/record/claimant/timestamp and separates
positive payment authorization from the venue signature. After the real-network
failure, the positive path now requires claimant authorization at the
`confirm_handoff` root, so the default RPC recording mode can construct the
complete handoff and token-transfer authorization tree. The new native/WASM
regressions use `mock_all_auths()` rather than its permissive non-root variant
and compare the exact recorded auth tree. The existing ten-claimant test now
authorizes that same root and child explicitly.

The confirmed handoff and refund windows do not overlap. Either settlement
direction and its two transfer legs roll back together on a token failure.
Previously added native/WASM tests cover that rollback, a remaining Pod reserve,
late signature rejection and ten serialized competing claims with one winner.
The ten-request test proves serialization, **not** click-order fairness or a
consensus/network scheduling policy.

### Pod

Creation requires both funder account authorization and proof of possession of
the bearer key for the exact funding terms. Claim requires recipient account
authorization, unlock ledger, buried state and a separate bearer signature
bound to the recipient, Pod, operation, network and deployment. No bearer seed
is part of the ABI. The existing delay/substitution/cross-domain tests cover
observed signature reuse against a different destination. Failed payout retains
the buried record; successful payout is single-use.

This is the **public V3 Pod**, not a ZK pool. Amount, funder, token and destination
are visible. The holder can sign for any recipient they authorize, and a funder
retaining the bearer seed remains a holder. Key loss and a deliberately distant
unlock ledger have no administrative recovery. An unlock in the past is allowed
by the kernel and means immediately eligible; it does not bypass key or account
authorization.

### Trigger

Creation validates amount, future/reachable refund deadline, nonzero attester
key and a beneficiary other than the kernel. The immutable beneficiary is bound
to the attestation payload. The last deadline ledger permits attestation; the
next permits only refund to the recorded funder. Neither relayed path grants
the submitter a destination override.

The new native/WASM tests freeze the beneficiary, confirm failed payment leaves
both Trigger records and an unrelated Pod intact, then complete at the exact
deadline without account auth. A separately frozen refund recipient leaves its
Trigger pending; after unfreezing, refund succeeds without consuming the Pod.
Replay of both terminal paths is rejected.

### Envoy

Owner authorization is required to create/revoke a mandate, and the recorded
owner must match revocation. The agent signature binds the action, network,
deployment, mandate, Fade and timestamp. Recipient selection is fixed to the
owner. The active restrictions are expiry, revocation, nonpositive Fade price
and a maximum of 50 successful claims. Failed claims do not persist accounting
changes. No runtime path allows an agent to spend owner funds.

The new native/WASM tests remove all owner auth after setup. They check altered
Fade, mandate, timestamp and network, then a legitimate claim/negative settlement
at the exact expiry ledger. Failed replay and missing-listing attempts preserve
the count; expired claims and a signature made before revocation are rejected.
The original 51-listing cap test remains in the full passing suite.

### Token and TTL boundaries

A new local nonstandard-token fixture tries to forward the kernel's direct-call
authorization into a different standard-token contract. Both native/WASM HAK
runs reject this nested transfer, preserve the separate real token reserve and
leave the failing Trigger pending. The preserved Pod then pays its legitimate
recipient using only specifically scoped account authorization. The fixture
tests authority separation, not the correctness of arbitrary token economics.

The new TTL tests persist a getter for each record type just below the renewal
threshold, check both record and instance TTL increase, then create new records
and verify counters advance to ID 2 without replacing ID 1. These are local
persisted host invocations. They are **not RPC simulations, actual archive
restoration or a running keeper**. The SDK's documented instance extension also
extends code TTL; this review checked that installed SDK boundary, not all host
implementation source.

## Fresh verification and artifact identity

Evidence root: `artifacts/security/2026-09-27-compatibility/hak/` (ignored local
artifacts). Commands used the normal HAK target directory, locked dependencies
and two build jobs. No copied historical source shared a build cache.

| Gate | Result | Evidence |
| --- | --- | --- |
| Baseline native suite before new tests | 51 passed | `baseline-native.log` |
| Four new native invariant families | 4 passed, 51 filtered | `review-native.log` |
| Initial pre-smoke full suite | 63 passed; did not cover default root auth | `native-wasm-tests.log` |
| Root-auth regression against previous native/WASM | Expected failure: both cases rejected | `positive-root-auth-before.log` |
| Updated locked WASM build | Passed, 19,914 bytes | `positive-root-auth-build.log` |
| Updated full native plus newly built WASM suite | 65 passed, no failures/ignored | `positive-root-auth-native-wasm.log` |
| Updated Clippy, all targets/features, warnings denied | Passed | `positive-root-auth-clippy.log` |
| Updated compiled ABI and app bindings | 23 exact specification entries | `positive-root-auth-abi-parity.json` |

Final suite includes 56 native and nine WASM cases. These counts must not be
added to the baseline or earlier runs as distinct tests. Four new families
exercise existing invariants; the fifth reproduces and prevents the actual
root-authorization compatibility defect. The original failing live smoke is
retained outside this local evidence directory, and must not be reported as a
passing release check.

Compiled WASM SHA-256:
`1e6643028d6b397b3a762d4b5312eaf20f2744407686c78122d27c5a4dd8d378`.
The superseded first V3 artifact was
`d06ada3ec51a6d4a47e599a1997a345e9316a717f3259b09bbdc1aa28e69f841`;
version 3 alone does not distinguish the fixed artifact, so clients must pin
the reviewed WASM hash.
Encoded specification SHA-256:
`4333c461fc2ae63fb4fc0a56b8cf7e651b1893f8c4cf6c075600c7afcb1ec443`.
Source and evidence hashes: `evidence.json` in the evidence root.

Reproduction from the repository root:

```bash
cargo test --locked --manifest-path contracts/hak/Cargo.toml -j 2
CARGO_BUILD_JOBS=2 stellar contract build --locked --manifest-path contracts/hak/Cargo.toml
cargo test --locked --manifest-path contracts/hak/Cargo.toml -j 2 --features wasm-tests
cargo clippy --locked --manifest-path contracts/hak/Cargo.toml -j 2 --all-targets --all-features -- -D warnings
```

## Remaining limits and unreviewed scope

1. Free Fade reservation and nonattendance can consume a listing's availability
   until refund. The 50-claim mandate cap is per mandate, not Sybil protection.
   No deposit, slashing, randomized allocation or fairness rule was introduced.
   Seller self-claim is permitted. Venue/attester cooperation is still required
   for the corresponding settlement; this code cannot verify physical delivery.
2. Signed `ts` metadata is not a separate freshness deadline. Existing on-chain
   record/window/revocation rules govern eligibility. A signed authorization
   remains usable within those bounds and cannot be individually cancelled.
3. Ordinary token behavior, issuer freezes/clawbacks and key custody remain
   trust assumptions. A contract accepting an asset address does not certify
   that token. No private keys were inspected. Key compromise is not remedied
   by passing signature-domain tests.
4. Long-lived records need submitted maintenance or restoration. Browser reads
   implemented as simulation do not renew on-chain TTL. Live restoration,
   source-account sequence contention, fee/resource limits, real-wallet auth
   and interrupted transaction recovery belong to the separate integration
   verification and are not certified here.
5. Private-pool runtime, ZK circuits, prover/verification setup, threshold custody,
   disclosure infrastructure, application transaction/journal code and dependency
   source are outside this HAK review. Other team reports must state their own
   coverage. No formal proof, independent audit, exhaustive scenario guarantee
   or real-fund readiness claim is made.

The interrupted September 27 reviews remain historical incomplete work. This
checkpoint is a new, explicitly authorized defensive review of the owned HAK
source, with its own exact coverage and evidence. No automatic tool rejection
occurred in this scope and no rejected action was bypassed.
