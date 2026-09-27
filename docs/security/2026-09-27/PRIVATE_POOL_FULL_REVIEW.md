# Private pool and client source review, 27 September 2026

This is an internal defensive source review of the separate experimental private
pool, its transaction client and offline tools. It is not a whole-repository or
independent cryptographic audit, a claim of zero exploitable defects, a production
activation, or evidence of live settlement. No wallet, signing key, live pool,
network transaction, deploy, source commit or release pin update was used.

The starting private-pool subtree had no local changes. Existing changes elsewhere
in the shared workspace were preserved. The source coverage and final hashes
below identify the exact files inspected in this pass. Generated dependency locks
and external libraries are not claimed as manually audited.

## Correction: reject the pool as its own bridge or fee account

The previous state predicates accepted the pool's own address as a withdrawal or
fee recipient. A valid transition directed there would consume private value,
while a Stellar Asset Contract self-transfer leaves the pool's token reserve
unchanged. The pool has no administrative recovery method for that surplus.
This is a conditional self-destination fund-lock risk, not demonstrated theft by
an unrelated caller. Producing a new valid proof for a self-target withdrawal was
not part of this pass; the old missing input rejection was reproduced directly.

The added regression failed against the previous predicates: `Ok(1)` was returned
where `InvalidBridge` was expected. `state_checks` now rejects the pool address as
either bridge account or fee account before verification, authorization or writes.
This also explicitly rejects a pool-as-funder deposit. The client checks the same
destination restriction before local verification, signing, or durable reservation.
No circuit, verifier key, public-input order, ABI, error number or storage layout
changed. The runtime WASM did change, and an actual future release must bind its
new reviewed hash rather than reuse an old release's bytecode pin.

The native and compiled-WASM regression starts from genuine deposit, create-Pod
and claim-Pod proofs. Invalid self destinations, deliberately supplied with an
empty proof, return the destination-specific error; this makes rejection before
verification explicit. Pool/recipient/fee reserves, roots, counters, nullifier,
record and enumeration remain unchanged. The original, unmodified valid withdrawal
proof subsequently succeeds: pool 600, recipient 395, fee 5 from the 1000 reserve.
These are local host/SAC tests with test-account authorization, not live wallet
transactions or a forged accepted proof.

## Contract boundaries inspected

Every authored Rust runtime line in this package was read. The review traced:

* Immutable constructor pins, exact 157/4 public-input verifier keys, testnet-only
  network gate, asset allowlist, deployment/network domain and fixed audit epoch.
* Canonical scalar/point encodings, complete 256-byte proof shape, MSM/pairing
  equation, and host rejection of invalid curve encodings. Circuit correctness
  remains a separate review scope; this pass did not replace the host cryptography
  with a mock or formally verify it.
* Inclusive ledger windows and 120-ledger bound, accepted input-root history,
  current append/revocation roots, checked append capacity, packed outputs,
  canonical ciphertext vector, and all five nonzero u128 nonce boundaries.
* Persistent nullifier/commitment replay rejection; checked archive counters;
  enumeration that distinguishes absent out-of-range indexes from missing entries.
* Deposit authorization, exact externally visible asset/account/amount/fee input
  binding, u64-to-i128 conversion, and writes before token calls with atomic rollback.
* Signed revocation domain/key/tag binding, current-root requirement and immutable
  archive order. No administrator, upgrade or arbitrary verifier path exists here.

The compiled native/WASM suite also exercises unchanged genuine 17-step proof
chains, modified public fields, missing funding authorization, repeated spends,
actual SAC deposit failure rollback, and rollback of an earlier withdrawal when
the later fee transfer fails. Test counts overlap: the WASM suite includes the
native suite and is not an additional disjoint audit count.

## Client and offline-tool boundaries inspected

All authored client runtime and tool files were read in full, including tests.
Generated bindings were inspected as ABI surface and compared byte-for-byte with
fresh CLI output from the exact new WASM. Runtime client review covered canonical
public-only encoding; getter-free bounded snapshots; trusted release/DKG roster
binding; actual deployed-code hash and config readback; ledger-entry identity,
TTL, full record and checkpoint validation; simulation authorization shape;
wallet session and payload identity; fee and window limits; immutable pre-send
journal recording; ambiguous-result reconciliation; fee-bump inner-envelope
binding; and same-browser atomic reservations and explicit retry ancestry.

Offline deployment preparation derives the address before DKG, binds source/salt,
network, roster, epoch, point and transcript, checks artifact hashes, and emits
argument arrays without executing them. It cannot certify the source-to-WASM
relationship merely because a supplied manifest hash matches, make a custom
allowlisted token trustworthy, prove independent trustee custody, or authenticate
an untrusted saved RPC response. Those limits remain release responsibilities.

The old `circuits/preimage.circom` and `contracts/zk-preimage` runtime/tests were
read as a separate one-public-input proof demo. Its pinned key and canonical Fr
checks do not create private payments, recipient/domain binding or one-time spend
state. The app helper `app/lib/zk.ts` was read for integration tracing; current
runtime panels do not import it, and only its artifact tests reference it. No
private-pool client import was found in the active app runtime. Neither legacy
demo nor this client silently activates privacy in the published HAK panels.

## Fresh local verification

Logs and generated output are under the ignored directory
`artifacts/security/2026-09-27-compatibility/private-pool/`.

| Check | Result | Evidence |
| --- | --- | --- |
| New self-destination predicate test before fix | Expected failure | `self-destination-baseline.log` |
| Native runtime and genuine proof suite | 25 passed | `native-proof-tests.log` |
| Locked optimized WASM build | 27,917 bytes | `build.log`, `private_pool.wasm` |
| Native plus exact compiled-WASM suite | 30 passed, no skips | `native-wasm-tests.log` |
| Strict Clippy, all targets/features | Passed, warnings denied | `clippy.log` |
| Client TypeScript and default suite | 30 passed, one explicit browser skip | `client-tests.log` |
| Client TypeScript and actual browser suite | 31 passed, no skips | `client-browser-tests.log` |
| Offline deployment/pin tooling | 7 passed | `tool-tests.log` |
| Current circuit source/lock/key fixture provenance | Passed | `fixture-provenance.log` |
| Freshly generated TypeScript bindings | Byte-identical to existing bindings | `bindings-generation.log`, `generated-bindings/src/index.ts` |
| Legacy preimage native suite | 10 passed | `legacy-native-tests.log` |
| Legacy snarkjs proof verification | Passed | `legacy-circuit-test.log` |
| Scoped diff whitespace check | Passed | `git diff --check -- contracts/private-pool` |

Exact new WASM SHA256:
`103f46d4eb97b021f2618e307970ce49993417901789e03760a4af512b7fee6e`.

Rust commands used the private-pool package's own target and `-j 2`; the build used
`CARGO_BUILD_JOBS=2`. WASM tests explicitly selected the freshly generated file via
`PRIVATE_POOL_WASM`, and stored resource outputs in this pass's directory via
`PRIVATE_POOL_RESULTS`. The actual browser journal suite used
`PRIVATE_JOURNAL_BROWSER_TEST=1`. Client RPC/ledger responses are synthetic, while
Groth16 verification, SDK signatures, IndexedDB and Web Locks are real local work.
No current network-resource limit or live inclusion claim is inferred from them.

## Remaining release and review limits

* The single-operator circuit-specific development setup is still not an
  independently contributed ceremony. The source pins continue to identify those
  development keys; no new setup or independent security audit was performed.
* Actual independent trustees, custody, authenticated deployment-bound DKG and
  operational disclosure approval remain unsupplied. A colluding threshold quorum
  can decrypt beyond the software approval flow. Pseudonymous fields are not
  verified legal identities.
* No actual private pool is deployed or enabled in the published app. Separate
  balance, complete key backup/file verification, local prover, wallet adapters,
  user-visible public transaction facts, pending recovery and verified archive
  reconstruction still need the application integration described in `RELEASE.md`.
* Real RPC simulation/inclusion, actual wallet failures, ledger-apply archival
  restoration, another-device recovery and mobile proving are not established by
  these local tests. The one-minute desktop proving and every-append-root race
  remain material usability constraints, not automatic resend opportunities.
* This design exposes submitter, timing, roots/nullifiers, ciphertext size and
  bridge/fee amounts/accounts. It does not guarantee full anonymity, protect
  against a dishonest pinned RPC, malicious same-origin code, deleted/rolled-back
  browser storage, issuer freeze/clawback or a malicious allowlisted custom token.
* All possible scenarios, external dependencies, formal circuit soundness,
  independent host-crypto validation, side channels and a production ceremony were
  not exhaustively proven. The parent review owns the privacy package and other
  repository modules; their status must not be inferred from this report.

## Exact read coverage

The following inventory gives the complete inclusive line range and SHA256 for
files read in full in this pass. Hashes are the final post-fix sources. The binary
Poseidon parameter blob and public proof fixtures were checked via their recorded
provenance and actual proof/vector tests, not manually reviewed as source code.
Dependency locks were used with locked builds, not read line by line as authored
runtime. Deployment/readme/security reports provided context and are not counted
as code coverage. Generated bindings coverage means surface inspection plus exact
regeneration parity, not a new implementation audit of the Stellar SDK.

| Path | Lines | SHA256 |
| --- | --- | --- |
| `contracts/private-pool/client/adapter.test.ts` | 1–70 | `d7c93027731e2aa3eafd38674659a55b6c0c194a7fbd811908b705a086843c5a` |
| `contracts/private-pool/client/adapter.ts` | 1–74 | `bd59110adcac6483ac397b88b0c244775d8f09315fd23fed185d7114e69beae4` |
| `contracts/private-pool/client/bindings.ts` | 1–227 | `731aa42b55575fad7a3d1d259843574aed5863c32d160d336cf33ddfc44e62b0` |
| `contracts/private-pool/client/journal.test.ts` | 1–70 | `c36d8cfd7775ca05a64180069763a147cda1a43eca9cdce2736dbec6524adb62` |
| `contracts/private-pool/client/journal.ts` | 1–163 | `83fda4955a483f545c2038af22c9b831f0eb23de982423b441eb23f45714473e` |
| `contracts/private-pool/client/privacy.d.ts` | 1–23 | `f4b3c06a74a96bce8a94e783b8b7cb03ce8a954325951d9a292461f10401b2dd` |
| `contracts/private-pool/client/reader-fixture.ts` | 1–50 | `fecb7a89cca303cc7ecc5e1048881639b58709102ff8d71b3a1a3f4bf54c1e6c` |
| `contracts/private-pool/client/reader.test.ts` | 1–109 | `b5d3552090266354272bb95de9e3265481ed083205ec601eef9b03697c92a76c` |
| `contracts/private-pool/client/reader.ts` | 1–174 | `1abf57da5f376176f7806d587d2f2e4f6efd4c1bae9f184e18b53d5792b424e3` |
| `contracts/private-pool/client/release.ts` | 1–88 | `d7ac7af221798c5727e2cb0347af3b28dda5ee797b65d989a3d8be6c0a399146` |
| `contracts/private-pool/client/submission.test.ts` | 1–197 | `59e87926f01fca2626429ec4f5393c364fbb3ac57aa71dac303b1a38d3f48481` |
| `contracts/private-pool/client/submission.ts` | 1–230 | `ef324d51e41fec4840e246d4d7ed711f6b78d5ba9507544d678cb15bab694a01` |
| `contracts/private-pool/client/test-loader.mjs` | 1–8 | `8d0c15b50a43c8faeb3e7b8c4927713d2c1941d0cc6223f31e5a4d6fc556ebbd` |
| `contracts/private-pool/client/test-register.mjs` | 1–2 | `871466bd86b448ecf8c47946d7a0b3f6dc414aa760e6878b256de99c78473ab1` |
| `contracts/private-pool/src/hash.rs` | 1–151 | `a71ca38e9ecbc3ac371e4df2a9e4449982119dd78dd1c2f094bc6604a10510b3` |
| `contracts/private-pool/src/lib.rs` | 1–571 | `ffbd972034d928e5ee74044d54f23c30d687f003acbf8f5998d794f0431fa1cd` |
| `contracts/private-pool/src/pins.rs` | 1–9 | `5ddbe9eb757a676341ce1ceec246d645336c9d0dc45eebcd8979a5f48456c488` |
| `contracts/private-pool/src/test/integration.rs` | 1–535 | `f17a65dcf61b873559de2b1ae066dde0e31bbf7accf4b2d31d52cdcaef4e74a7` |
| `contracts/private-pool/src/test.rs` | 1–888 | `ebf9832102398d6d668353bf54cae0c1057eaa2f7545fd08bb39d7df65fdbbf2` |
| `contracts/private-pool/src/tree_zeros.rs` | 1–40 | `a907352f19f8b703e72cb21fe6ee4c06dc7cc6f5f4007b4e4f5acf992767b602` |
| `contracts/private-pool/src/verifier.rs` | 1–124 | `bbf8931c745922654581c0d4d7ba11241891557dcb922fa6965e90a50476da3b` |
| `contracts/private-pool/tools/deployment-authority.test.mjs` | 1–56 | `70d30f8971aacd4289340de4d7d026695b0646a981690d88a0d94e28fb4bc298` |
| `contracts/private-pool/tools/pin-verifiers.mjs` | 1–41 | `8b40c5670950fb106aefbc3dd54faa43b36f6bc0c5cd94a74aa792b4b3fe35fc` |
| `contracts/private-pool/tools/pin-verifiers.test.mjs` | 1–17 | `0c407786e22a77cb5dc61b1102d8cf1f61ea982beefa69ce22a20d5b86e42c37` |
| `contracts/private-pool/tools/prepare-deployment.mjs` | 1–150 | `0bd394db33ea3338c1d0df405e3c1d8ebecaa8f5816b92383d02c1d24567e7bc` |
| `contracts/private-pool/tools/prepare-deployment.test.mjs` | 1–50 | `d79711fae163a52c028442bc2d6b52d257e8273892cdecc3ba65acbecc062389` |
| `contracts/private-pool/tools/verify-fixture-provenance.mjs` | 1–35 | `3c9f0910134028cf87f8caa593a631ab75aebfdb9603bae0ce9de053b29f071d` |
| `contracts/zk-preimage/src/lib.rs` | 1–232 | `95790924ae169496f8ea728c4919500c0fff6735e0b891c1c42a06cf94b278b8` |
| `contracts/zk-preimage/src/test.rs` | 1–348 | `1a780c9819a7cb42f788bf2431b990689efa824e93bca12d0732223a3b16994e` |
| `circuits/preimage.circom` | 1–19 | `2aef6a4be07e8d80cbced888c931660233d9d1f7e25a858e058be883dc94b059` |
| `app/lib/zk.ts` | 1–235 | `e60179b21d744d48b40f0b2bc5b6e57ed52b6eedbc3997c78402467dc09d9823` |
