# Remaining landing and orbital test-source review

Date: 27 September 2026. The seven named landing unit-test files, the root
orbital Playwright specification and its configuration were read completely in
this turn. The nine snapshots total **648 lines**. Exact inclusive ranges and
SHA-256 values are in
[remaining-test-source-coverage.json](remaining-test-source-coverage.json).
Earlier matching hashes were not substituted for this current source read.
The follow-up changed only test code and executed the five directly affected
Chromium cases. No application runtime, build artifact, deployment, wallet
connection, signature or transaction was changed or performed by this phase.

## Corrected browser-test gaps

- Both older cases now use the actual `Close instrument` accessible name. A
  real Chromium run of the old tests failed at the removed `Instruments`
  selector; after the correction, camera movement/return and unsent-draft
  preservation pass.
- The Pod amount input is selected as an amount textbox within its own panel,
  independent of the configured token label. The public app remains configured
  for USDC; only the separate contract smoke used native testnet XLM. This
  change avoids coupling the UI behavior check to either asset label.
- CSP diagnostics now live in the Node test process through a browser binding,
  surviving document and iframe replacement. Both launch and wallet-chooser
  checks use that collector. A new regression deliberately inserts a genuine
  CSP-blocked inline script in the local landing document, confirms it did not
  execute, then navigates to `/app/` and requires the original violation to
  remain recorded. The old per-document collector lost it and failed; the
  corrected collector passes. That intentional test violation is confined to
  its own browser context and is never exempted in the clean release checks.

## Fresh execution evidence

Evidence directory: `artifacts/security/2026-09-27-compatibility/hak/`.

- `orbital-before.log` and `orbital-before/`: the two old selectors failed in
  Chromium exactly at `Instruments`, with traces/screenshots retained.
- `orbital-csp-red.log` and `orbital-csp-red/`: the actual blocked landing script
  was recorded before navigation but missing afterward, proving the recorder
  gap instead of relying on a synthetic event or source-string assertion.
- `orbital-green.log`: **five passed, zero failed, zero skipped** in 39.4 seconds
  against `http://127.0.0.1:4292`. These cover launch/missing-asset/security-header
  checks, CSP persistence, wallet chooser, camera/close behavior and Pod draft
  persistence. Syntax and Playwright discovery checks also passed.

The five selected tests are not the full orbital specification, live Cloudflare
release verification or wallet transaction coverage. Browser collection opens
Freighter's chooser but does not select or connect a provider. The source-only
landing unit tests below were not rerun merely to count them as executed.

## Other reviewed boundaries

The asset-warming tests validate canonical same-origin asset paths, atomic
rejection of malformed manifests, bounded list size, non-executable warming,
concurrent deduplication and failure handling. Their mocked fetch/prefetch
callbacks test orchestration; they do not prove browser cache behavior.

URL tests correctly distinguish parsed origins from scheme/relative inputs.
The classifier's rejection of both flags for `javascript:` is not a claim that
such a link is safe to render; it is not a general URL sanitizer. The tests
exercise static configuration consumers reviewed separately.

The captcha tests exercise local arithmetic/form validation. They do not prove
server-side anti-bot enforcement or message delivery. Dino, fluid and scramble
cases check local presentation state, finite timer cleanup, deterministic
motion and basic bounds. They are not wallet, cryptography or financial-state
controls. Configuration tests check representative intentional mutations and
specific returned validation categories; they do not authenticate remote data.

The browser source contains no wallet connection, signing, token transfer or
form submission. It opens the wallet chooser and inspects it. Page destinations
come from an operator-provided base URL, defaulting to loopback. Its single
worker and Chromium software-rendering options are local QA settings, not
production browser configuration. Context-loss/shader-error injection is
scoped to the test browser page. Reduced-motion scene crops deliberately hide
forms and titles so changing UI text cannot satisfy a camera-change assertion.
The specification checks real raster differences/equality, navigation, focus,
viewport bounds, fallback and unsent drafts, but those assertions are not a
substitute for the actual fresh run, visual inspection or strict release
network/error diagnostics.

No exhaustive mutation analysis of these nine files, transitive test framework
source review, GPU-driver validation or new runtime vulnerability is claimed.
