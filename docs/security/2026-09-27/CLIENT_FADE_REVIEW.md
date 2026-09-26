# Public-client and Fade review — 27 September 2026

This continues `BACKEND_REVIEW.md` from source commit
`4ced15accfc55dbfbe5b6b655ae5e191b64c63b7`. The design phase remains closed.
Changes here address financial correctness, transaction recovery and configuration;
there is no new visual design or contract runtime change. No chain deployment,
wallet signing, fund migration or production publication was performed.

## Reproduced and fixed

### 1. A claimed Fade could display the opposite payment direction

The contract settles at the claim ledger, but the panel continued evaluating its
price at the latest ledger. A record claimed at +10 USDC could show −10 USDC and
say that the claimant would be paid. This misrepresented the settlement terms;
it did not change the contract's actual payment calculation.

The quote, curve marker and settlement caption now use `claimed_at` after a
claim. The frozen amount stays visible while the user previews another ledger.
Open listings still follow the live ledger. Regression cases cover positive and
negative claims, settled records, ledger advancement, preview and keyboard return.
Three quote cases failed against the original implementation before the fix.

### 2. Foreign token records could be labelled as the configured USDC

The kernel supports different token contracts. The public application's panels
used one configured symbol and precision, but its real client accepted records
for other token contracts. Opening such a record could therefore misrepresent
the asset and amount. No external deployment or victim interaction was needed
for the local reproduction.

The application factory now pins the configured token contract. Record reads,
creation inputs and direct-by-ID price/claim/handoff/refund/attestation/Envoy
actions reject foreign assets before transaction assembly or approval. A plain
asset symbol is not used as identity. The reusable SDK policy is optional; kernel
multiasset support is unchanged. This restriction does not certify an arbitrary
operator-configured asset, its issuer, decimals or token behavior.

### 3. A confirmed creation could lose its duplicate-submission guard

A successful chain result was persisted before the SDK decoded its returned
record ID. If decoding threw or returned an invalid value, the caller saw an
error, while the stored `success` no longer counted as unresolved. A second
user-approved creation could lock another deposit.

Confirmation and record recovery are now separate. A confirmed creation without
a valid positive `u64` ID keeps its hash and ledger, blocks the same creation
intent, and remains visible in transaction activity even behind more than 20
completed entries. Polling can fill in the ID only from matching terminal
transaction evidence and an actual `scvU64`. Invalid legacy creation IDs become
recoverable without erasing confirmation. Definitive failures can still be
retried; successful void-return actions retain their ordinary behavior.

This is a local recovery guard, not a global idempotency guarantee. Cleared
browser storage, another browser or another device does not share it. RPC
envelope matching does not independently authenticate a provider's ledger claims.
An unavailable/expired result remains blocked rather than being guessed failed.

### 4. Invalid demo-mode configuration silently selected the chain client

The old TypeScript cast did not validate runtime environment values. An empty,
misspelled or differently capitalized mode was treated as real Soroban mode.
Only exact `mock` and `soroban` values are now accepted; an omitted value retains
the documented mock default. Invalid values fail configuration immediately.
Eight malformed configurations failed the new tests before this fix.
The existing V3 compatibility gate remains in place. This finding does not
establish that the current published deployment used an invalid mode.

### 5. A malformed trustline response could be reported as success

The classic-account helper returned any fulfilled Horizon response's `hash`.
The installed SDK can return response data without validating those fields, and
the previous test accepted the literal `fixture-hash`. The helper could therefore
claim the token trustline was ready without matching confirmation evidence.

Trustline success now requires the signed transaction's exact hash,
`successful === true` and a positive safe integer ledger, as specified by the
installed synchronous Horizon response type. Malformed responses and transport
loss return the local hash and explicit instructions to inspect the transaction
and account before retrying. Twelve new cases failed before this correction.
No automatic resubmission was added. This path still uses manual recovery, not a
durable trustline journal; the existing anchor-payment journal is unchanged.

## Contract invariant checked

New native and compiled-WASM tests exercise both Fade settlement directions with
the real local Stellar Asset Contract. They freeze the recipient/source needed
by the **second** transfer, after the first transfer can succeed. Both payment
legs roll back, the claim remains usable and an unrelated Pod's reserve is
preserved. After unfreezing, settlement uses the original claim price even though
the ledger has advanced; repeat settlement and refund cannot consume that Pod.

These tests confirm an existing invariant, not a newly repaired contract exploit.
Funding uses local test authorization; the negative settlement is also exercised
with no claimant authorization. No real token transfer occurred. Arbitrary
nonstandard token contracts, issuer clawbacks and live network failures are not
certified by these tests.

## Verification

| Gate | Result | Retained log |
| --- | --- | --- |
| Fade regression before fix | Expected failure: 3 failed, 10 passed | `fade-price-red.log` |
| Full application suite | 560 passed across 35 files; no failures/skips | `app-tests.log` |
| Application TypeScript | Passed | `typecheck.log` |
| Application production build, including lint/type checks | Passed | `build.log` |
| Locked HAK WASM build | Passed; 19,909 bytes | `hak-build.log` |
| HAK native + compiled-WASM suite | 53 passed, no failures/ignored | `hak-tests.log` |
| HAK strict Clippy, all targets/features | Passed with warnings denied | `hak-clippy.log` |

Log names above are relative to the ignored local directory
`artifacts/security/2026-09-27/client-fade/`. Committed hashes, exact source pins
and check summaries are in `client-fade-evidence.json`. The build emitted a
`Buffer()` deprecation warning; a passing build does not resolve that warning.
UI regressions use the real React components in jsdom with mocked transport and
clock boundaries. They are not actual-wallet or live-browser confirmation.

Additional before/after results were recorded in the review tool transcript,
not saved as log files: asset policy 17 failing cases then 31 passing tests;
recovery 18 failing cases; legacy-ID normalization 3 failing cases; configuration
8 failing cases then 11 passing tests; account operations 12 failing cases then
17 passing tests. All final tests are included in the 560-test application run.
The read-only deployment-helper review also passed eight CLI-stub tests; this
did not execute a real deployment. These transcript-only results have no
invented artifact hashes.

Reproduce the final gates from the repository root:

```bash
npm --prefix app test
npm --prefix app run typecheck
npm --prefix app run build
CARGO_BUILD_JOBS=2 stellar contract build --locked --manifest-path contracts/hak/Cargo.toml
cargo test --locked --manifest-path contracts/hak/Cargo.toml -j 2 --features wasm-tests
cargo clippy --locked --manifest-path contracts/hak/Cargo.toml -j 2 --all-targets --all-features -- -D warnings
```

The HAK WASM was built from the current locked source before its integration
tests. Its hash is unchanged from the previous checkpoint because only contract
tests changed. The combined HAK suite contains native tests as well as the WASM
cases; those counts must not be added as independent suites.

## Coverage and remaining gates

Manual review in this continuation concentrated on the complete Fade settlement
and refund implementation, public-client transaction handling, wallet/signing
boundaries, recovery storage, application asset identity, configuration and
deployment helper. Related public Pod/Trigger/Envoy entry points and callers were
read as context. Relevant regression tests were inspected. Generated bindings,
third-party implementations and every UI/test file are not counted as manually
audited just because a suite passed.

A second reviewer inspected the changed Fade behavior, new rollback tests,
completed asset/recovery changes and trustline confirmation. This is internal review, not an independent
security-firm audit. Earlier interrupted broad contract/cryptography reviews
remain incomplete as documented in `BACKEND_REVIEW.md`; they were not restarted
under this narrower task.

The published old kernel remains incompatible with local V3 and its write path
remains closed. The experimental private-v2 pool and SDK remain separate from
the published app. This continuation does not revalidate ZK circuits, trusted
setup, trustee custody, disclosure policy or private-pool activation. Their
release gates remain in `privacy/EXECUTION_V2.md` and
`contracts/private-pool/RELEASE.md`. No claim of complete repository coverage,
zero vulnerabilities or readiness for real funds is made.
