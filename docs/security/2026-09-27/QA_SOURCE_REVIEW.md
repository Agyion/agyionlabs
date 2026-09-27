# QA and research tooling source review, 27 September 2026

All lines of the 35 existing visual QA/research scripts in
`qa-source-coverage.json` were read in this review, including the 15 whose prior
September 26 hashes had been unchanged. Those historical matches were not
silently treated as new source reads. The manifest also records the new bounded
browser-observation helper, its two test files, current landing HTML, and two
archival research UI files: 41 unique files and 5,498 lines at this snapshot.
Each entry has its current SHA-256 and inclusive line range.

## Corrected verification defects

* `verify-star-render`, `verify-pointer-response`, `verify-flight-handoff` and
  `verify-workspace-layout` could retain runtime diagnostics or a false report
  result while returning exit status zero. Only an actual `passed` result now
  returns success. All captured diagnostics remain in their reports. The flight
  recheck still has its documented narrower scope, but no longer treats retained
  diagnostics as a successful process result.
* A `page.evaluate` waiting for `document.fonts.ready`, a paused finite animation
  or a rendered frame is not bounded by Playwright's locator timeout. Existing
  3.5-second animation races in two harnesses also resolved successfully rather
  than proving a transition had settled. `scripts/lib/browser-settle.mjs` now
  applies a Node-side deadline and rejects on timeout. Current finite
  transitions are awaited; infinite ambient motion is explicitly excluded and
  cancelled finite transitions may finish. A missing requested target fails.
  This is a snapshot of current animations, not a guarantee that no new
  animation can begin. A timeout does not cancel a browser promise; normal
  harness teardown closes the page/context. The helper was applied to the
  authored font/settling/frame waits in this review; root owns the production
  verifier and canonical matrix integration.
* Empty/unknown product or journey case filters could select no assertions and
  still produce a passed report. These selections now fail before browser
  startup. The older workspace checker also requires at least one actual check
  after applying its regular-expression filter.
* Product-page return navigation still depended on removed `.directory-item`
  markup. It now verifies the six real links in the named instrument navigation
  and their hrefs/focus behavior. This preserves the original behavioral check.
* Workspace/holographic diagnostic readiness no longer interprets a missing
  status element as `ready`. It checks the stable app-root readiness attribute
  and requires a known final state. It still does not establish contract
  identity; the separate release verifier owns observed RPC/bundle identity.

## Historical harnesses and explicit limits

The old `verify-pod-trial.mjs` expected a removed homepage exhibit and a retired
three-checkbox interaction. It now throws a clear retirement error before any
browser work and names the canonical navigation/example replacements; those
replacements do not claim to test the retired interaction. Its old source is
retained below that guard as historical evidence. `verify-home-gallery.mjs`
already delegates to the canonical landing matrix.

Other retained historical QA includes the removed physical home gallery,
exhibit selectors, explanation modal and detail-world controls in
`capture-revealed-landing`, `detail-pages-check`, `verify-final-polish`,
`verify-holographic-ui`, `verify-landing-motion`, `verify-immersive-world` and
landing cases of `verify-instrument-journeys` / the optional exploration branch
of `verify-flight-handoff`. These scripts are not root `npm test` acceptance.
They were fully read, but were not all migrated to current product semantics or
represented as fresh passing browser tests. Existing incompatible selectors
fail their locator assertions; obsolete coverage is not equivalent to a UI
regression. The canonical current route matrix and current instrument examples
are the acceptance paths. Root's live browser evidence is recorded separately.

The research browser scripts, scene study, performance profiler and sequential
video inspector produce observations, not automatic design or release
acceptance. Research failures remain recorded and do not become a clean audit
claim. The interaction researcher accepts trusted local stdin commands and may
record entered text; it must not receive wallet secrets. The local research
preview binds loopback and assumes a trusted checkout, including its symlinks.
Software rendering and sampled frames do not establish native GPU performance.

Disconnected UI harnesses use fresh contexts and do not connect wallets or
submit on-chain operations. Synthetic Ledger records, taller header fragments,
simulated Pod flow and accelerated clocks are explicitly isolated fixtures.
`mock-pod-check` requires the Local simulation indicator before clicking a
simulated funding action. Those fixtures do not prove network settlement or
authorization. Pixel/layout checks are not aesthetic approval. The document
paint fixture deliberately blocks external CSS/JS and checks only fallback
background paint, not normal application operation.

## Fresh checks and evidence

* 38 JavaScript module syntax checks passed, including all 35 existing scripts
  and the new helper/two tests.
* Five helper tests passed: hanging fonts, missing frame callbacks, a browser
  call that never returns, paused finite animation, infinite ambient exclusion,
  cancellation, missing targets, evaluation failures and invalid bounds. They
  use the exact serialized callback in an isolated fake DOM and are not browser
  render evidence.
* One subprocess regression covering three invalid/empty QA selections passed;
  each child exited 1 before output-directory creation or browser launch.
* The retired Pod-trial entry was invoked locally and exited 1 with its explicit
  retirement message before browser work.

Logs are in
`artifacts/security/2026-09-27-compatibility/repository-coverage/`:
`qa-syntax-checks.json`, `qa-harness-tests.log`, and `retired-pod-trial.log`.
The four diagnostic exit changes were source/syntax checked; this reviewer did
not run the complete GPU harnesses or inject live browser failures into them.
No wallet, external attack, deployment or commit was performed in this scope.
