# One instrument directory and confirmed Fade prices

27 September 2026. Baseline: `f5926b305f16715a2c5ab9d75bf862e3db4452d1`.

The user reopened a narrow part of the website work: remove the competing
homepage catalog and lead to the preferred `/instruments` directory. They also
asked whether real customers would wait for a negative price, and how ten
concurrent requests could be allocated fairly despite network differences.

## Navigation change

The homepage retains the interactive space scene, wordmark and existing Launch
app journey. Its bottom link opens `/instruments`; the second selector/animation
gallery and its unused component/styles are removed. Navigation, footer and
configured menu links now use the same catalog URL. Historical `/#instruments`
links replace their entry with `/instruments`, preserving query parameters;
Back must not loop through an obsolete second gallery.

The existing directory layout and its six product destinations are retained.
The current-directory navigation link also returns keyboard focus to its title.
The How dialog's fallback returns to the homepage rather than the removed
gallery. Browser verification reproduced inherited directory scroll on entering
How from another page; pathname changes now reset Home to the top while
same-page dialog interactions preserve their position. No black-hole geometry,
Endurance geometry or launch timing is changed.
The scene's former gallery-home flag is renamed while keeping the same fixed
departure origin, full-viewport launch and renderer teardown behavior.

The maintained browser matrix now checks the canonical flow. The older
`verify-home-gallery.mjs` entry point delegates to that matrix and explicitly
identifies obsolete gallery-selection checks as retired product behavior, not
as tests that passed. Historical reports remain historical.

## Fade correctness

Ten separately authorized claimants are exercised in two application orders,
at both positive and negative prices, using native Rust and compiled WASM.
Exactly one successful state transition is allowed. Later attempts cannot
replace the claimant, restart the handoff window or change the frozen payment.
Wrong-recipient handoff proofs, replay and missing positive-payment authorization
also fail without paying another claimant.

These are **serialized same-ledger host tests**, not a measurement of ten
simultaneous internet submissions. They do not prove equal opportunity, first
click priority, fee-free losing attempts or a production fairness guarantee.

The review also reproduced a real client defect: a delayed claim could be
included at −5 USDC while local history recorded the earlier +10 USDC quote.
The quote is now labelled as an estimate. History retains confirmed evidence
with an unknown amount until the loaded record matches the actual claim; only
then does it record the frozen claim-ledger price. Read recovery does not submit
another claim. Mock refresh now reads the requested ID rather than jumping to
the most recently created listing.

A second reviewer additionally reproduced two receipt-loss races: wallet switch
before confirmation, and general recovery consuming the transient receipt first.
The final change captures the original account/network/contract/action/record
scope before submission and requires exactly one matching durable confirmed
transaction. It restores that stable hash and ledger before history enrichment;
missing or ambiguous evidence leaves resubmission blocked without inventing a
history row. The reviewer's two cases now pass, as does a third case injecting
an unrelated transient receipt during record loading. The full application
suite includes ten additional receipt/scope regressions.

## Product decisions still required

[The research note](../product/2026-09-27-fade-use-cases-and-allocation.md)
compares 16 candidate use cases, official operating examples and allocation
alternatives. Consumer markdown sales can use positive or zero floors; negative
compensation needs an actual funded collection/service benefit. Waiting can be
rational, especially with abundant supply and weak demand. Demand and scarcity
are hypotheses to test, not guarantees supplied by a decreasing curve.

The current contract takes no buyer payment or bond at claim time. A no-show can
therefore block a sale cheaply. Returning the seller's pot later does not restore
the lost sale, and the listing does not reopen. Closing this product-level gap
needs explicit reservation, cancellation, merchant-failure and dispute rules.
A batch window may reduce millisecond racing but also needs enforceable
eligibility, selection and fallback rules; a UI queue cannot constrain direct
contract calls. No new bond, slashing, auction or lottery protocol is silently
introduced in this change.

## Verification and release boundary

| Check | Fresh final result |
| --- | --- |
| Landing unit tests | 89 passed across 11 files |
| Application unit/component tests | 582 passed across 35 files |
| HAK native + compiled WASM | 55 passed, no failures or ignored tests |
| Strict HAK Clippy | Passed, all targets/features, warnings denied |
| Landing build / TypeScript / lint | Passed |
| Application production build / TypeScript / lint | Passed |
| Full canonical browser matrix | 102 passed; no skipped groups |
| Independent receipt-race reproduction | Three targeted cases passed; 26 unrelated temporary-file cases intentionally not selected |

The browser matrix covers widths 1440, 768, 390 and 320 with normal and reduced
motion. It exercises canonical navigation, old hash replacement, detail
history/scroll, keyboard focus, the How dialog, six detail mechanisms, explicit
camera input, WebGL failure and launch behavior. There were no unexpected JS,
console, request, HTTP or CSP errors. Two expected WebGL-unavailable diagnostics
are retained. Screenshots at desktop, 390 and 320 were visually inspected.

Hero and Pod-detail departure took 10,432 ms and 10,414 ms respectively and
preserved `/app/` and `/app/?tab=pod` through the unchanged 9.8-second journey.
These flight destinations were isolated same-origin fixtures: this is not an
actual-wallet, full app-arrival, native-GPU performance or live-site test.
The claimant tests use actual local SAC logic and native/WASM host execution;
they do not run ten concurrent external transactions.

Final source/log hashes are committed in
`2026-09-27-canonical-instruments-and-fade-evidence.json`. Retained logs and the
browser report/screenshots are under the ignored local directory
`artifacts/verification/2026-09-27-catalog/`. Earlier failures are preserved:
the original stale-price regression, receipt-race regressions, the How scroll
failure and a corrected native-link test fixture. One first-run fixture report
was reconstructed from recorded console output and is labelled as such; it is
not presented as an original raw report. An intermediate interrupted browser
run is not passing evidence. Initial screenshots from an already-running stale
preview are named `initial-unverified-*` and are not final validation.

The final local preview is `http://127.0.0.1:4292/`. This revision is **not
published to Cloudflare**. Existing build warnings remain: the Three.js chunk
size advisory and Node's deprecated `Buffer()` usage warning. No dependency
remediation is inferred from passing these checks.

Reproduce the relevant final gates:

```bash
npm --prefix landing test
npm --prefix landing run build
npm --prefix landing run lint
npm --prefix app test
npm --prefix app run build
CARGO_BUILD_JOBS=2 stellar contract build --locked --manifest-path contracts/hak/Cargo.toml
cargo test --locked --manifest-path contracts/hak/Cargo.toml -j 2 --features wasm-tests
cargo clippy --locked --manifest-path contracts/hak/Cargo.toml -j 2 --all-targets --all-features -- -D warnings
node scripts/assemble-site.mjs
PORT=4292 node scripts/preview-site.mjs
# In another terminal, after the preview is ready:
BASE_URL=http://127.0.0.1:4292 QA_OUTPUT_DIR=artifacts/verification/2026-09-27-catalog/matrix node landing/tests/e2e/matrix.mjs
```

This work is not a complete repository or independent security audit. Private
cryptography was not revalidated, and the private profile remains separate from
the public app. The old deployed kernel remains incompatible with V3 writes.
No live wallet signing, token transfer, contract deployment or migration is part
of these tests. Any website publication must be reported separately from local
verification.
