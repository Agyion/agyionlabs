# Contract and settlement verification, 2 October 2026

The starting source is `ed683e4319a4017e11c0fa79b78b6c0ac3d60732`.
Its [exact GitHub run](https://github.com/Agyion/agyionlabs/actions/runs/36363088427)
was freshly checked and both jobs completed successfully. This report records
subsequent test-fixture corrections and HTTP dependency hardening; it does not
attribute later changes to that older run. The website and selected deployments
were not changed.

## Contract checks

All three contracts were freshly built with the locked Stellar builder and
tested with `--features wasm-tests`. Strict all-target/all-feature Rust checks
passed for each component.

| Contract | Named tests passed | Fresh compiled WASM SHA256 |
| --- | ---: | --- |
| Public kernel | 75 | `d101e0fea1852cf057049cc08695b9e26a8b3c6a82db58d4c2706db03a22b186` |
| Private pool | 44 | `4ead5defa386974742071212701f3bcb327fd0a1bc6bf14df2f97f08b11b5018` |
| Fade market | 31 | `b1947f2ac6bfa3f42535ed571b956c9fd1ab425b1441adca99d2c8c919ed1c6c` |

These are 150 named native/WASM tests, not 150 new vulnerabilities or a count of
all possible attacks. They exercise delayed public Pod recipient substitution,
credential domain/operation/deployment binding, replay, failed payouts, shared
custody deficits, allowlisted asset identity and marketplace reservation rules.
Private tests use genuine committed Groth16 proofs in the Soroban host, including
the 17-step chain, changed public inputs, spent-note replay, failed deposit/fee
rollback, and withdrawal refusal after issuer clawback. No fresh proof ceremony
or independent cryptographic audit was performed.

The first private suite failed five tests because its default selected the
historical `artifacts/privacy-v2/private_pool.wasm`, hash
`02fe15ab5b79a496a83e08c269d74b2ab0bdf60145d0cd9b47236f10b31b2980`.
That code lacks the current liability endpoint and destination guard. Only
selecting the freshly built WASM changed the result to 44 passing. The test
fixture default now selects the contract's current build directory, independently
of its report-output directory. All 44 tests then passed with no WASM override.
The initial failure is preserved; it is a harness selection error, not a newly
demonstrated exploit. Runtime contract source and compiled hashes were unchanged.

Local logs and exact exit results are retained under
`artifacts/security/2026-10-02-contracts/`. The overridden-path diagnostic and
corrected-default run overlap; they are not added to the 44 distinct tests.

## Acquired settlement evidence

The new explicitly enabled acquired-journal test passed one integration test
covering all 39 steps. Its independent finite oracle checks 66 negative
simulation requests and four successful authorization controls, with 30 scoped
credential callbacks. Four earlier-time observations are collected immediately
after their original predecessor, then retained until their target phase.

Production journal/fee validators decode the synthetic signed inclusion XDR:
authorized fee 1,000, refund 600, net fee 400 for each step, totaling 15,600.
All projected claims and completions use actual protected local files and the
final four local code pins. Reopening checks the full retained history without
another observation RPC, sign or send. Omitting an early case/control, altering
a terminal error and corrupting a retained snapshot are each refused. These
tests prove local refusal; they do not identify a deployed fund-theft exploit.

Measured maxima: policy input 1,241,524 bytes, raw capture 165,711, claim 156,621,
completion 311,378. The latter two include the on-disk terminating newline and
retain mode 0600. All fit the unchanged 2 MiB bound. The enabled test is optional
in the normal workspace command and must not be inferred to have run from a skip.
Its initial missing-mode failure and passing log remain under
`artifacts/security/2026-10-02-acquired-journal/`.

This uses controlled RPC replies and deterministic unfunded keys. Local byte
authentication in the journal does not execute WASM; actual host execution is
the separate contract suite above. Raw acquisition wrappers remain in memory;
projected journal evidence is persisted. Durable raw-sidecar recovery and live
V4 lifecycle execution remain unfinished.

## Whole-workspace regression

The initial workspace command stopped in the application group with 907 passing
and one failing test. The unmount-during-metadata-hashing test's fixed pickup
date of 1 October had expired, so correct production date validation stopped
before the asynchronous boundary under test. Its clock is now explicitly fixed
to 30 September for that scenario, without changing runtime validation, timeouts
or assertions. The focused scenario then passed; its twelve filtered tests are
skips in that focused run, not twelve additional passing checks. The original
failure and focused result are retained alongside the workspace logs.

The final normal `npm test` command passed 2,453 checks with 14 explicit optional
skips and no failures. Group counts are 89 landing, 908 application, 150 privacy,
59 private client, 30 market catalogue, 48 market client, 16 market UI and 1,153
tooling. The separately enabled acquired-journal test and 150 Rust tests are
different runs; their scope must not be conflated with these workspace totals.
One fresh-context review found no actionable issue in the frozen journal and
WASM-path increment. The later one-line test clock correction was checked by
the actual failing workspace, passing focused scenario and final workspace;
it is not relabeled as part of that earlier review.

## Hosted checks and HTTP dependency hardening

The [exact source run for 484de85](https://github.com/Agyion/agyionlabs/actions/runs/36976521342)
passed its contract job. Its application job passed workspace tests, browser
submission guards, type/style checks, proof provenance, genuine proof and
adversarial-circuit reproduction, and the static site build. The final dependency
advisory step failed, so that run is not an overall success. The source-only
documentation follow-up `4511a8f` did not rerun identical tests.

A fresh six-component local scan found the SDK's Axios 1.18.0 in the application,
private client and marketplace. Each affected report contains two high-severity
package entries, Axios and its dependent Stellar SDK; these are not six distinct
demonstrated attacks. Root, landing and privacy reported no advisories. Initial
reports and the actual failed CI log are retained without modification.

The [Axios advisory](https://github.com/advisories/GHSA-vh66-26gq-q6x8)
describes a fetch-adapter gadget requiring earlier same-process prototype
pollution. A new mandatory test resolves Axios from the SDK in each of the three
clients, starts a loopback server and injects inherited headers in an isolated
child process. Each unpolluted positive control preserved its caller header;
each polluted request on 1.18.0 lost that header and sent the synthetic attacker's
Authorization header. All three assertions failed before the dependency fix.
This establishes the dependency's behavior under an injected prerequisite,
not a pollution entry point in our application or deployed fund theft.

All three packages now narrowly override the SDK's Axios to 1.20.0, the
[patched release](https://github.com/axios/axios/releases/tag/v1.20.0), while
retaining Stellar SDK 16.3.0 and existing deployment/ABI pins. The application's
stale nested lock entry required explicit removal and lock reconciliation;
the SDK now resolves the already-patched root copy. Other resolved package
versions were preserved. No forced SDK major upgrade or audit-threshold change
was used. The same three probes then passed, retaining the original header
without sending the injected Authorization header.

All six post-fix advisory scans exited zero and reported zero advisories. This
is a dated registry scan, not a guarantee about unreported or future flaws.
The initial three failures, the intermediate stale-lock failure, all six scans
and passing attack regressions are retained under
`artifacts/security/2026-10-02-dependencies/`. This dependency follow-up was not
part of the earlier frozen journal/WASM-path review. A separate read-only review
verified all eight final code/package hashes, installed SDK transport resolution,
both serialized verifying-key hashes and the preserved test evidence. It found
no actionable issue in this bounded dependency/proof-test increment. It did not
rerun suites or perform an external security/cryptographic audit.

The first post-fix workspace run was interrupted and has no completion receipt;
it is not counted as passing. After confirming that it was no longer running,
the resumed whole-workspace command passed 2,456 checks with 14 optional skips
and no failures. Its groups are 89 landing, 908 application, 150 privacy, 59
private client, 30 market catalogue, 48 market client, 16 market UI and 1,156
tooling. The log's SHA256 is
`3fe64eb84f9a1eea0fcf03556e06579c43065517c8e73dafc2a7c94927820811`.
The final dependency/test hashes are retained in `test-summary.json`; later
Rust-only proof-binding coverage is verified by its own suite below. Application
type checks also passed.

## Native proof-binding attack coverage

A new mandatory `proof-tests` scenario uses the real pinned 157-input transition
key with the committed Pod withdrawal proof and the real pinned four-input
revocation key with the committed Envoy revocation proof. Each original proof
is accepted as a positive control. Each public signal position is then changed
individually to a different canonical field value, keeping the key, proof and
other positions unchanged. All 157 plus four variants are rejected by the
production native verifier using actual Soroban host pairing operations. The
test asserts the key hashes and the expected input counts before probing.

These are 161 mutation cases within one named test and two genuine positive
controls, not 161 new vulnerabilities or a general proof of cryptographic
soundness. The verifier, circuit, keys and runtime contract source were not
modified. This isolated native test does not execute the WASM pool or transfer
tokens, and does not test all coordinated changes to multiple signals. The
separate host/WASM lifecycle tests continue to cover settlement and rollback.

The focused test passed; the full private native/WASM suite then passed all 45
named tests, including that test, and strict all-target/all-feature Rust checks
passed. The unchanged actual private WASM input was authenticated as
`4ead5defa386974742071212701f3bcb327fd0a1bc6bf14df2f97f08b11b5018`.
Logs `07-proof-binding-focused.log`, `08-private-full.log` and
`09-private-lint.log` are retained alongside the dependency evidence. This is
additional regression protection, not a newly discovered deployed exploit.

## Rust dependency advisory scan

On 3 October, `cargo-audit 0.22.2` checked all four repository lockfiles against
the RustSec database, last updated 2 October 2026. All four reported zero known
vulnerabilities. Each reported the same informational warning that transitive
`paste 1.0.15` is unmaintained; this is not a vulnerability advisory and was not
silenced. The dependency path still needs routine review as Stellar SDK crates
change.

The contract CI now installs the pinned audit-tool version and scans all four
lockfiles on every workflow run. This checks published RustSec advisories for the
locked crates. It is not a source-level, supply-chain provenance or cryptographic
audit.

## Archived-state failure handling

On 3 October, the private-pool reader tests passed 11/11 and the submission plus
revocation suites passed 33/33 on commit `fedb8e55e489d5092e78686daa94563f35b5666a`.
Missing or expired archived entries fail closed instead of becoming empty
history or an inferred unspent note. A simulation that requests restoration is
refused before wallet signing, and unresolved transaction reservations remain
bound to their original signed hash. Focused logs and source hashes are retained
locally under `artifacts/security/2026-10-03-archive-refusal/`; this ignored
evidence is not part of the source commit.

These are fixture and RPC-adapter checks. They do not exercise Stellar ledger
archival and restoration. The app/client has no automated live restoration
workflow, so users may be unable to access notes until the required network
state is restored through a separately verified path. This is a recoverability
and release-readiness gap, not proof of a theft exploit or a completed fix.

## Live Protocol 29 compatibility

On 3 October, the public Stellar testnet RPC reported Protocol 29 while the
current private release manifest and its stable identity remained pinned to
Protocol 28. The former exact-version reader check rejected the live network.
The reader now has an explicit `{28, 29}` runtime allowlist; it still rejects
Protocol 27 and unreviewed Protocol 30. The manifest, profile ID, pool address,
WASM hash and private recovery scope are unchanged.

After the change, the full workspace test command exited successfully. The
private client suite passed 60 tests with one existing optional browser test
skipped. A direct live call through the production `createPoolReader` verified
the published WASM bytes, pinned configuration, 30 records, 35 append slots,
two revocations and one full 157-field accepted record. A separate read-only
Protocol 29 simulation of the deployed `liability` getter returned zero without
a restore preamble. These live checks made no signature, send, restoration,
deployment or funds activation. They establish current read compatibility, not
a full write-flow validation under Protocol 29; archived-state recovery remains
unimplemented in the client.

## Exact source CI

The exact pushed source commit `5c481ac3ec3bea4299be3145cda0e7cab5b62164`
passed both jobs in the
[GitHub Actions run](https://github.com/Agyion/agyionlabs/actions/runs/36990232258).
The contract job rebuilt all three contract WASMs, passed all native and WASM
contract tests, and completed strict Rust checks. The application job passed the
workspace and testnet helper, browser persistence and concurrent submission
guards, type/style checks, proof fixture provenance, public proving assets,
actual private proof and adversarial-circuit checks, the static testnet site
build, and all dependency advisory checks. The run did not perform a Cloudflare
deployment or activate a funds service. Published website state is separate.

The follow-up source commit `fedb8e55e489d5092e78686daa94563f35b5666a` added
the RustSec check and passed both jobs in
[run 37066419389](https://github.com/Agyion/agyionlabs/actions/runs/37066419389).
The contracts job rebuilt and tested all three WASMs, passed strict Rust checks,
installed `cargo-audit 0.22.2`, and scanned the four lockfiles. The only reports
were the retained informational `paste 1.0.15` unmaintained warnings; no
vulnerability advisories were found. The application job also passed its
workspace, browser/concurrency, type/style, proof, build and npm advisory checks.
This run did not deploy the site or activate a funds service.

## Fade Market retention, reservation index lifetimes and exact-source CI

On 3 October, review found that `create_offer` accepted funded offers even
when the network's maximum persistent-entry TTL could not retain the offer
through its last lease and refund window. The later TTL calculation clamps to
the network maximum; without an upfront bound, this could make an accepted
offer unavailable before its final settlement/refund action on a network with
a sufficiently low maximum TTL. This is a contract availability/fund-recovery
risk under that network configuration, not a reproduced live testnet theft.

A regression test first failed against the old code. `create_offer` now checks
that `duration + lease + 1 + refund margin` fits the network TTL before it
updates accounting or transfers tokens. The test verifies rejection one ledger
below the boundary leaves seller balance, market balance and reserved liability
unchanged, while the exact valid boundary creates an offer with the expected
TTL.

A second storage review found the reservation index was kept only for the
common 172,800-ledger TTL even when its offer had a longer refund lifetime. At
the maximum one-million-ledger offer and 720-ledger lease, the test observed a
172,800-ledger slot against a required 1,018,001 ledgers for the offer. If that
index archived first, expiry/refund cleanup would fail closed because
`clear_slot` requires the index, while the funded offer remained live. `reserve`
now retains the slot for the same computed horizon as the offer. Its regression
test failed at the old TTL mismatch and passed with the fix. The native plus
actual-WASM Fade Market suite then passed all 33 tests, strict Clippy passed,
and the locked contract build passed. The deterministic contract test host does
not perform real ledger eviction just because the sequence is advanced, so this
test asserts the exact written TTL and cleanup behavior; it does not claim a
live archival integration test.

The current locally built Fade Market WASM SHA256 is
`d19259f2f7171f2f1a049798835a618aa4f2dda9b5535d17b9eca94d7cf37d3d`.

The GitHub Actions workflow now uses the Ubuntu 24.04 image and immutable
Node 24 action releases, with package-manager caching disabled. Exact source
commit `060045a8372055512c221a878d42311619616b25` passed both jobs in
[run 37075540501](https://github.com/Agyion/agyionlabs/actions/runs/37075540501).
The application job passed the full workspace tests, browser persistence and
concurrency checks, type/style checks, proof provenance, actual private proof
and adversarial circuit tests, static testnet build, and dependency advisories.
The contract job rebuilt the WASM, passed all native/WASM tests and strict Rust
checks, and completed RustSec scans. This verifies the exact source commit; no
contract was deployed. The new WASM hash changes the artifact identity and must
be reviewed as a new release before any deployment.

## Release boundaries

The public application still selects V3, and the guarded V4 public deployment is
inactive. Existing immutable deployments are not repaired by a source test.
Issuer freeze/clawback powers, key custody, archival restoration, independent
setup contribution, trustee independence and submission metadata remain material
boundaries in [SECURITY.md](../SECURITY.md) and the dated release documents.
This checkpoint supplies neither an exploit-proof guarantee nor permission to
activate a real-funds service.

## 3 October: V4 deadline-based state retention

A further review found that public V4 could accept obligations whose ledger
deadlines outlived the default 172,800-ledger retention of persistent records,
the shared asset-liability counter, contract instance and Wasm code. An
archived dependency could make an otherwise funded obligation inaccessible.
V4 now calculates retention through each instrument's final permitted action
plus up to 172,800 ledgers of recovery grace. Fade, Pod and Trigger extend the
record and the corresponding shared asset liability; instance storage and code
are extended with the same target. Envoy retains its mandate through expiry.
Creation rejects an unretainable deadline before moving funds.

Regression coverage runs against both native code and the compiled WASM. It
checks exact per-record/shared-state TTLs, instance and code TTLs, renewal near
the archive threshold, an exact network maximum-TTL boundary and rejection one
ledger below that boundary without taking funds or consuming an ID. The
simulated ledger tests do not perform real network eviction or restore an
archived footprint. After the grace, archival remains possible and no in-app
restore or keeper flow exists.

Fresh local verification passed 77 Agyion native/WASM tests, 45 Private Pool
native/WASM tests, 33 Fade Market native/WASM tests and strict Clippy for all
three contracts. All three locked Stellar WASM builds succeeded. Agyion WASM
SHA256: `32b5136f899130324041934ba8087e005eae13d36a9b4c8092e981cf909ee2a5`;
Private Pool: `4ead5defa386974742071212701f3bcb327fd0a1bc6bf14df2f97f08b11b5018`;
Fade Market: `d19259f2f7171f2f1a049798835a618aa4f2dda9b5535d17b9eca94d7cf37d3d`.
All four Rust lockfiles passed `cargo audit` with no known vulnerability
advisories; the allowed `paste 1.0.15` unmaintained warning remains. Exact
source commit `a5a7c1f252d4983b50183a6f87cf6138955e8249` then passed both jobs
in [GitHub Actions run 37079230164](https://github.com/Agyion/agyionlabs/actions/runs/37079230164).
The contracts job passed native/WASM tests, strict Rust checks and RustSec;
the application job passed workspace, browser/concurrency, type/style, proof,
static build and npm advisory checks. This verifies the recorded source
increment only. No deployment or activation occurred.

The inactive V4 contract already present on testnet is still pinned to the
earlier WASM `d101e0fea1852cf057049cc08695b9e26a8b3c6a82db58d4c2706db03a22b186`.
The corrected local/CI-tested build is `32b5136f899130324041934ba8087e005eae13d36a9b4c8092e981cf909ee2a5`; it has not been deployed. The old deployment's initial readback and
the lifecycle preparation pinned to it do not verify the new retention logic.
V3 remains the selected public deployment.

`rustfmt --check` passes on every Rust file changed in this increment. The
crate-wide `cargo fmt --check` still reports formatting differences in the
untouched `accounting_test.rs` and `test.rs`; this workflow does not currently
make crate-wide formatting a CI gate.

## Nullifier archival replay check

The review considered whether an old spent-note nullifier could become
replayable when its persistent entry reaches TTL. The private-pool contract
checks the persistent nullifier before proof verification. Under Soroban,
expired persistent entries are archived, not exposed to contract code as
missing keys: invocation must restore the entry first or fails before contract
execution. The [Stellar archival guide](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival)
describes automatic restoration through the invocation restore list and manual
restoration when that list is unavailable.

This is consistent with the isolated Protocol 28 test: after actual eviction,
the guarded pool required explicit restoration; the original restored note was
then spent, and simulation of the same still-time-valid withdrawal proof
returned `Spent`. This bounded local evidence does not establish a public
network or in-app restoration workflow. No nullifier-expiry replay was
reproduced, so this review hypothesis is not recorded as an exploit finding.
