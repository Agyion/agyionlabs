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
type checks also passed. Exact new source CI remains pending until recorded.

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

## Release boundaries

The public application still selects V3, and the guarded V4 public deployment is
inactive. Existing immutable deployments are not repaired by a source test.
Issuer freeze/clawback powers, key custody, archival restoration, independent
setup contribution, trustee independence and submission metadata remain material
boundaries in [SECURITY.md](../SECURITY.md) and the dated release documents.
This checkpoint supplies neither an exploit-proof guarantee nor permission to
activate a real-funds service.
