# Repository source coverage reconciliation, 27 September 2026

This inventory reconciles the current working tree against the scoped source
reviews. It does not claim that every repository file, test scenario, dependency
implementation or GitHub history revision was audited. Full source reading,
exact artifact verification, automated test execution and live settlement are
different kinds of evidence.

`repository-coverage.json` is the authoritative per-path snapshot: current
SHA-256, inclusive line count, source class, tracked/untracked status, matching
review evidence and stale records. Files are counted once even when multiple
reviewers read them. `repository-supplemental-coverage.json` identifies the
additional complete reads performed during this reconciliation.

## Method and exclusions

1. Enumerate tracked files and untracked files not excluded by Git using
   `git ls-files --cached --others --exclude-standard`. Include authored source,
   runtime/configuration and test files rather than assuming that only tracked
   files matter.
2. Compare each current file's actual hash to the HAK, private-pool, privacy,
   public-client, selected-vendor, platform, tooling and visual review records.
   A path alone is insufficient. September 26 whole-source records are retained
   only when the current bytes still match, under a separate historical status.
3. Enumerate ignored roots and perform a dependency/build-pruned ignored Rust
   source scan. No `zktest` directory or source reference was found within this
   repository. The additional `/home/apo110/zktest` and `/tmp/zktest` candidates
   were absent. The only ignored Rust copies found outside the three contract
   packages were historical review baselines under `artifacts/`, not another
   runtime. This does not establish the contents of another checkout or branch.
4. Exclude secrets, node_modules, build output, generated artifact directories,
   logs, media and reports from the authored runtime count. The JSON lists
   tracked/untracked exclusions by reason. Ignored secret contents were not read.
   The explicitly public `.env.example` was reviewed separately.

Generated bindings, vendor declarations, proof/fixture JSON and dependency locks
remain separate classes. Their presence, hashes, ABI comparison or use in tests
does not convert them into a manual dependency implementation audit. The selected
copied vendor runtime, including standard-encoding helpers, has its own report
and is never counted as first-party contract or client implementation.

## Additional security-relevant source review

The reconciliation read all remaining identified first-party release/build and
private verification entry points: site assembly and asset allowlisting, local
preview containment, release body/CSP validation, explicit expected deployment
configuration, actual RPC identity readback, private journal and pool harnesses,
the Testnet-only settlement harness, the anchor test launcher, and package/build
configuration. It also checked the static flight bridge/storage boundary and
entry/config files while coordinating with the platform reviewer. Exact ranges
and hashes are in the supplemental coverage file; overlapping reads are deduped.

No additional confirmed contract or transaction-authority defect was identified
in this supplemental pass. The preview assumes a trusted local checkout, uses a
loopback listener and is not a file upload service. The Testnet smoke creates
dedicated identities only in explicit execute mode, records transaction hashes
before send and refuses to automatically resend an unresolved operation. No
network or wallet execution was performed by this inventory reviewer.

One stale QA expectation was corrected with the root reviewer's authorization:
`scripts/verify-wallet-modal.mjs` still required xBull/LOBSTR and a blocked
protocol state. It now uses the shared validated release expectations, retains
the mandatory address/hash arguments for an expected ready release, and checks
that only Freighter is offered among those retained adapters. It still connects
no wallet and requires the disconnected transaction action to be disabled.
Readiness is observed on the stable `main.station-app` attribute, because the
status message intentionally disappears when the protocol is ready.
The modal checker by itself does not verify deployed bytecode; the separate
production verifier owns actual bundle and RPC readback checks.

The modified checker passed its syntax check, and the three release-expectation
helper tests passed. The browser was left to the root reviewer's coordinated
verification. Evidence is retained in
`artifacts/security/2026-09-27-compatibility/repository-coverage/`.
The public-client reviewer also updated `.env.example` to include the required
WASM pin and describe the actual Freighter-only factory.

## Coverage summary and remaining classes

The generated tables below are a snapshot, not a claim that unmatched tests or
visual QA tooling were manually reviewed. An unchanged historical record is
clearly distinguished from a source read in the current review. The attached
JSON retains every source/configuration path and its precise status.

<!-- GENERATED COVERAGE TABLES -->

The final checkpoint contains **400 first-party authored source/configuration,
test, QA and static-vector files, 55,092 lines**, each with a matching current
team review record. This includes archived research UI and inactive historical
QA source; it does not imply they are current production paths or that all
retained browser scripts passed. There are **0 historical-only and 0 unmatched
first-party records** at this checkpoint. Previously historical records were
read afresh by the assigned reviewers before being counted as current.

The complete inventory has 534 files: 446 matching current scoped records
(including 46 copied-vendor runtime/maintenance records) and 88 generated,
declaration, fixture or dependency boundaries. Every source/config path has a
current byte hash and line count. Current manual records also retain the
inclusive reviewed range; generated boundaries do not receive invented manual
ranges. Counts are deduplicated across the team's reports.

| Source class | Files | Lines | Current manual records | Historical only | Unmatched | Generated/dependency boundary |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| app-client-runtime | 19 | 3,414 | 19 | 0 | 0 | 0 |
| archival-research-source | 3 | 79 | 3 | 0 | 0 | 0 |
| configuration | 36 | 1,006 | 36 | 0 | 0 | 0 |
| contract-runtime | 11 | 2,317 | 11 | 0 | 0 | 0 |
| dependency-lock | 9 | 24,427 | 0 | 0 | 0 | 9 |
| generated-or-type-declaration | 3 | 564 | 0 | 0 | 0 | 3 |
| generated-proof-or-fixture | 33 | 4,680 | 0 | 0 | 0 | 33 |
| landing-service-runtime | 5 | 429 | 5 | 0 | 0 | 0 |
| legacy-circuit | 1 | 19 | 1 | 0 | 0 | 0 |
| local-tooling | 53 | 6,506 | 53 | 0 | 0 | 0 |
| privacy-runtime-circuit-tool | 37 | 3,315 | 37 | 0 | 0 | 0 |
| private-client-tool | 11 | 1,015 | 11 | 0 | 0 | 0 |
| static-vector-asset | 2 | 2 | 2 | 0 | 0 | 0 |
| test-or-test-helper | 103 | 14,828 | 103 | 0 | 0 | 0 |
| ui-scene-navigation-runtime | 11 | 2,521 | 11 | 0 | 0 | 0 |
| ui-source-style | 108 | 19,641 | 108 | 0 | 0 | 0 |
| vendor-declaration | 43 | 1,324 | 0 | 0 | 0 | 43 |
| vendor-maintenance-or-metadata | 3 | 303 | 3 | 0 | 0 | 0 |
| vendor-runtime | 43 | 3,353 | 43 | 0 | 0 | 0 |

### Source reading versus testing

The additional QA source review is in `QA_SOURCE_REVIEW.md` and
`qa-source-coverage.json`. It records corrected false-success exit paths,
unbounded browser promises, empty QA selections and stale readiness/navigation
expectations. Six focused new QA helper/subprocess tests and 38 syntax checks
passed; complete browser runs and live deployment evidence are separate.

`APP_TEST_SOURCE_REVIEW.md`, `PRIVACY_TEST_REVIEW.md`,
`REMAINING_TEST_SOURCE_REVIEW.md` and the root landing test manifest record
fresh test-source reads. A test passing under a mock is not an authenticated
wallet, RPC, cryptographic proof or settlement result. In particular, old
visual harnesses are retained historical evidence where their product was
removed. The updated canonical acceptance paths are recorded separately.

### Explicit remaining boundaries

* Third-party transitive implementations, compiler/toolchain internals,
  browser/wallet extension binaries and cryptographic soundness were not
  comprehensively audited. Reading the copied wallet runtime is narrower than
  reviewing all of its npm dependencies.
* Generated binding/type declarations (3 files), proof/fixture JSON (33),
  dependency locks (9) and copied vendor declarations (43) remain 88 separate
  records. Hashes, ABI parity checks, provenance and actual proof tests are
  relevant evidence, but do not convert them into a manual authored-runtime
  review or an independent audit.
* Git history, other branches/checkouts, ignored dependency/build output,
  historical artifact baselines, docs/logs, binary media and font data are not
  covered by the authored source claim. The JSON lists every tracked/untracked
  exclusion. No ignored secret contents were read. The two authored favicon
  SVGs were read completely and contain only static shapes, with no script,
  event handlers or external references.
* No new unreviewed first-party runtime path was found. This finite source
  inventory cannot establish that there are no possible exploits or untested
  scenarios. Operational configuration, deployment identity, independent
  cryptographic review, trustee custody, ceremony provenance, private-client
  integration and release readiness retain their own explicit evidence/gates.

This is a **team source-review checkpoint**, not a claim that one reviewer read
all files alone. Any subsequent source edit requires a new matching review
record and a regenerated inventory; an old matching path is insufficient.
