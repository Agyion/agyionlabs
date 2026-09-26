# Backend checkpoint — 27 September 2026

Design is frozen by the user's latest instruction. This checkpoint changes one
HAK input check and adds native/compiled-WASM regression coverage. It does not
deploy a contract, migrate funds, activate private balances or change the website.
Starting commit: `c0d009bcb90380752635602ac5ff19b6ecfd9272` on
`codex/orbital-redesign-security`.

## Fixed: Trigger funds can be locked by a self-beneficiary

The previous `create_trigger` accepted the kernel's own address as beneficiary
and deposited the funder's tokens. A subsequent valid attestation performs a
token transfer from the kernel to itself, then marks the record executed. Under
Stellar Asset Contract semantics that transfer does not reduce the kernel's
balance. The executed record can no longer be refunded and this kernel has no
beneficiary withdrawal method.

This is a conditional fund-locking defect: it requires an authorized deposit
with the wrong destination and a valid attester signature. It is not evidence
that an unrelated caller can steal another user's reserve.

`contracts/hak/src/trigger.rs` now returns the existing `InvalidInput` error when
`beneficiary == current_contract_address()`, before any transfer or record ID
allocation. The public ABI, signature domain, storage schema and protocol version
remain unchanged. Existing deployed records are not modified or recovered.

The regression uses the real local Stellar Asset Contract implementation, with
mocked account authorization for initial funding. It verifies rejection, both
balances, absence of a record and preservation of the next ID. It then creates a
valid escrow, removes account authorization, submits a valid attester signature
and verifies the intended recipient's payment. The same assertions run against
native Rust and the freshly compiled WASM.

## Fresh verification

| Gate | Result | Evidence |
| --- | --- | --- |
| Regression against the previous Trigger source in an isolated copy | Expected failure: `Ok(Ok(1))` instead of `InvalidInput` | `hak/baseline-regression.log` |
| Clean HAK native suite | 49 passed, 0 failed, 0 ignored | `hak/native-tests-clean.log` |
| Locked HAK WASM build | Passed; 19,909 bytes | `hak/build.log` |
| HAK native + compiled-WASM suite | 51 passed, 0 failed, 0 ignored | `hak/native-wasm-tests.log` |
| HAK strict Clippy, all targets/features | Passed, warnings denied | `hak/clippy.log` |
| Compiled ABI versus current app bindings | All 23 specification entries match exactly | `hak/abi-parity.json` |
| Private-client TypeScript and default tests | 29 passed; 1 explicit browser opt-in skip | `client/client-tests-baseline.log` |
| Private-client TypeScript and browser-enabled suite | 30 passed, 0 failed, 0 skipped | `client/client-tests-browser.log` |

The WASM suite includes the 49 native tests; these are not 100 distinct tests.
The final client suite includes the preceding 29 tests plus the actual Chromium
IndexedDB/Web Locks test. That browser check exercises two connections, reload,
atomic conflict handling, immutable terminal evidence and serialization, with no
external requests. SDK transaction tests use synthetic RPC/ledger responses;
neither suite establishes live chain inclusion or a real wallet's behavior.

Evidence paths above are relative to the ignored local directory
`artifacts/security/2026-09-27/`. Committed hashes, summaries and check outcomes
are in `evidence.json`. An initial HAK run after the baseline copy shared its
build cache and failed; its log is retained as `hak/native-tests.log`. The package
cache was then cleared and the source rebuilt. Only the subsequent clean native
and fresh WASM runs are used as passing evidence.

Reproduction from the repository root:

```bash
cargo test --locked --manifest-path contracts/hak/Cargo.toml -j 2
CARGO_BUILD_JOBS=2 stellar contract build --locked --manifest-path contracts/hak/Cargo.toml
cargo test --locked --manifest-path contracts/hak/Cargo.toml -j 2 --features wasm-tests
cargo clippy --locked --manifest-path contracts/hak/Cargo.toml -j 2 --all-targets --all-features -- -D warnings
PRIVATE_JOURNAL_BROWSER_TEST=1 npm --prefix contracts/private-pool/client test
```

Use a separate build target for the historical copy if reproducing the
before/after comparison. Do not reuse that target as evidence for current source
without clearing its package cache. No frontend test rerun is claimed for this
backend-only change.

## Review coverage and interruptions

The primary reviewer inspected the complete Trigger implementation, its public
dispatch/error boundary and the added native/WASM tests. Other HAK paths ran in
the existing suite; a passing suite does not establish a new line-by-line review
of those paths.

The private client inspection covered all runtime code in `adapter.ts`,
`release.ts`, `reader.ts`, `submission.ts` and `journal.ts`, plus their four test
files and integration/recovery documentation. The inspection checked the current
transaction/session boundaries, immutable attempt persistence, ambiguous-result
handling, envelope matching, pinned reader and same-browser reservations. No
additional reproducible defect was established in that scope; no client runtime
code was changed. Generated bindings, external libraries and cryptographic
implementations are not counted as manually audited by this inspection.

Three broader delegated reviews — HAK, private pool and privacy cryptography —
were interrupted by the tool's automatic filter with the stated reason
“possible cybersecurity risk.” The HAK agent left the narrow input guard and
initial regression. The primary reviewer inspected that change, expanded its
regression to WASM and normal payment, and independently ran the checks above.
The interrupted tasks were not resubmitted. Their broader coverage is incomplete;
no whole-repository or independent security audit is claimed.

## Remaining activation work

The configured published HAK deployment still does not support local V3; its
write path remains closed. A source commit does not deploy this guard to chain.
The private-v2 package and pool remain separate from the published app. The
previous private proof counts and resource results were not regenerated here.

Next work must keep these gates explicit:

1. Complete the remaining contract/cryptography review and resolve findings;
   obtain independent review before real funds.
2. Freeze reviewed circuit, WASM, prover, asset and committee pins. Independent
   setup participation and trustee custody are not supplied by local test keys.
3. Complete the app's separate private balance, backup/restore, wallet, pending
   transaction and fee-confirmation integration without exposing private state.
4. Perform separately authorized testnet deployment and actual bytecode/config
   readback, then exercise funding, withdrawal, archival restoration and recovery
   on target browsers/devices. No such deployment or submission occurred here.

`contracts/private-pool/RELEASE.md` and `privacy/EXECUTION_V2.md` remain the
operational source of truth. The root `npm test` does not run all Rust, WASM,
private-client or browser gates. Passing any one command must not be reported as
checking the entire repository.
