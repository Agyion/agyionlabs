# Experimental private instruments: implementation and security evidence

This adds actual ZK transfers and threshold disclosure for Pod, Trigger and
Envoy. Fade remains public. It is a separate, testnet-only protocol and pool;
the current published HAK application has not been converted or migrated.

The result is no longer the historical parser-only foundation. Actual circuits
constrain value, spending authority, conditional branches, note membership,
append/revocation updates and the exact encrypted payload. Real Groth16 proofs
are checked by the pinned Soroban contract and execute actual SAC transfers in
both native and compiled-WASM tests. Authenticated M-of-N disclosure and complete
encrypted key recovery are implemented and exercised with genuine proofs.

It is **not** an independent audit, a proof that every possible exploit is
absent, a live independent trustee committee, a legal approval, an independently
contributed Agyion phase2 setup, or an activated real-funds service.

## What is verified

The [execution ledger](../../../privacy/EXECUTION_V2.md) separates each gate:
compiled constraint attacks, full public phase1 verification, development phase2
verification, seventeen actual proofs, native/WASM chain execution, token failure
rollback, fresh local proofs, selective disclosure and the real browser worker.
The [retained evidence](private-v2-evidence/README.md) preserves exact source and
artifact hashes; committed public proof fixtures let another developer repeat
the host checks without receiving private witnesses or proving keys.

The final [npm run check:private report](private-v2-evidence/core-check.json) adds a locked fresh WASM build, all
current privacy/client/tool tests, real native/WASM proof execution and strict
Rust lints. Artifact-heavy proving/browser checks are separate, explicitly
executed gates; their routine unit skips are not counted as passing proofs.

Fresh results: **131 privacy + 29 client + seven tooling + 27 native/WASM pool
tests passed**, with four explicitly skipped heavy privacy tests and one skipped
opt-in journal test in the routine commands. The separately executed final
journal browser run passed **22/22**; the actual-proving browser run passed
**45 checks**. TypeScript, provenance validation and strict Rust lints passed.

The browser run produced real deposit, Pod claim, Trigger attestation and Envoy
payment proofs, restored complete owner/grant keys from encrypted backup and
cancelled a genuine in-flight proof. There was one worker and no outbound proof
service, private POST, console output, page error or CSP failure in that harness.
It used synthetic local roots and time windows, not a live wallet or pool.

## Concrete corrections

| Finding | Correction and evidence boundary |
| --- | --- |
| Public dummy view key exposed the hidden asset | Circuit and witness encrypt an all-zero dummy plaintext. Actual constraint and browser output checks cover it. |
| Envoy agent could redirect value through a chosen public fee | Delegated Envoy spending forbids pool fees; actual witness constraints reject the attack. |
| Requester-controlled record could masquerade as accepted disclosure data | Operator independently reads the exact accepted record from its own pinned source and checks all profile/ciphertext fields before releasing a share. |
| Record identity could diverge from ciphertext identity | Signing and authorization require the record ID to equal the canonical ciphertext digest. |
| Verification silently spawned a hardware-sized worker pool | Bounded Noble verification; differential checks against snarkjs and a real uncapped browser prove one-worker behavior. |
| Phase1 tooling could misattribute another valid transcript to PSE | Pin exact file length/hash before verification and source attribution, including key preparation. Full transcript verification remains mandatory. |
| Archive reader truncated the valid revocation-tag range to 128 bits | Accept full canonical Fr tags; only the sparse-tree position uses the low128 bits. Regression uses the actual revocation proof and rebuilds its exact resulting root. |
| Native negative tests did not establish compiled-WASM failure behavior | Added actual-WASM unauthorized/tampered/replay and failed-deposit/failed-fee rollback cases. Original proofs succeed after the token failure is removed. |
| Missing journal reservations could allow a conflicting pending attempt | A bounded whole-store consistency audit rejects missing/corrupt links. Reproduced before and retested in real Chromium. |
| A known pre-send refusal could not be retried without colliding with its original hash | Explicit retry keeps immutable ancestry and adds a fresh public memo; uncertain sends remain blocked from resubmission. |
| SDK assembly could mutate the simulation object used for validation | Validate an isolated expected invocation and assemble from a separate snapshot. |
| A valid fee-bump envelope could leave the inner transaction pending forever | Bind the outer result pair to the exact signed inner payload and hash. Empty or inconsistent failure results stay pending. |

The [client peer-review report](private-v2-client-review.md) and
[submission peer review](private-v2-submission-peer-review.md) record transaction-lifecycle and durable-journal
findings separately. Synthetic RPC responses establish local validation behavior;
they must not be described as live ledger inclusion.

## Review coverage

- [Privacy source ledger](private-v2-source-review.json): exact per-file hashes,
  complete-read scope and exclusions for modules, circuits and setup/QA scripts.
- [Pool/prover review](private-v2-pool-review.json): all Rust pool runtime and
  test source, constants, local pairing adapter/worker host and core check runner.
- [Submission source ledger](private-v2-evidence/submission-review.json): exact
  lifecycle/journal source hashes, genuine proof fixture and synthetic RPC scope.
- Historical frontend/kernel/recovery/tooling review remains in
  [REVIEW.md](REVIEW.md) and its manifests. Its dated checks are not relabeled as
  fresh tests of this new protocol. No frontend design files changed in this work.

Agent peer review is useful additional scrutiny, but it is not third-party
cryptographic assurance. Dependencies are pinned/scanned; their entire source
trees have not been manually audited. The refreshed application dependency scan
still reports four low and five moderate advisories through the wallet kit's
HOT-wallet dependency chain; no high/critical findings in that installed app
lockfile. Its source imports selected wallet modules, but that is not a claim
that advisory scan results disappeared or every transitive path was proven safe.
The privacy and private-pool client locks have their own separate scan results.

## Remaining release boundaries

The [release sequence](../../../contracts/private-pool/RELEASE.md) identifies
the concrete remaining work: separately configured app flows, a real testnet
deployment and readback, live submission/reconciliation and archived-state
restoration, independent trustee custody and decision-authority policy. Real
funds require independent setup contribution and cryptographic/security review.
No current test result automatically opens a funding switch.

Public bridge/fee amounts and accounts, fee-paying submitters, timing, roots,
nullifiers and traffic metadata remain visible. An anonymity set and operational
submission policy matter. M-of-N participants can collude outside the request
service; the disclosed party identifiers are pseudonyms, not verified civil
identity. No legal identity registry or law-enforcement role was fabricated.

Measured desktop proving takes about one minute and reached about 1.20 GiB renderer
high-water RSS; real phone behavior is untested. Concurrent appends can require
another explicitly prepared proof. Trusted RPC is not an independent Stellar
consensus proof. Exact asset transfer/issuer semantics, key custody and recovery
remain important operational boundaries. The contract rejects mainnet outright.
