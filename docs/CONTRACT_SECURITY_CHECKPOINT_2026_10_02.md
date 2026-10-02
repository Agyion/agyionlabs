# Contract and settlement verification, 2 October 2026

The starting source is `ed683e4319a4017e11c0fa79b78b6c0ac3d60732`.
Its [exact GitHub run](https://github.com/Agyion/agyionlabs/actions/runs/36363088427)
was freshly checked and both jobs completed successfully. This report records a
subsequent local test/harness change; it does not attribute later changes to that
older run. The website and selected deployments were not changed.

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

## Release boundaries

The public application still selects V3, and the guarded V4 public deployment is
inactive. Existing immutable deployments are not repaired by a source test.
Issuer freeze/clawback powers, key custody, archival restoration, independent
setup contribution, trustee independence and submission metadata remain material
boundaries in [SECURITY.md](../SECURITY.md) and the dated release documents.
This checkpoint supplies neither an exploit-proof guarantee nor permission to
activate a real-funds service.
