# Instrument examples preview verification

The six instrument pages now each contain an illustrated, user-driven everyday example. The directory introduces each example with a concrete use case and a three-part journey. Detailed rules remain available in an expandable section.

## Verified scope

Preview: `http://127.0.0.1:4292`. This is local evidence, not evidence of a Cloudflare deployment, live settlement or contract safety.

`scripts/verify-instrument-examples.mjs` passed **105/105 checks** against the assembled preview. The source hashes at the beginning and end of the run match.

- Every story completed all four stages and its blocked alternative at widths 1440 and 390 with normal motion, and widths 1440, 768, 390 and 320 with reduced motion.
- Widths 768 and 320 additionally exercised normal-motion initial layout, the animated first step and keyboard reset for all six stories.
- Verified correct final amounts, no payment at Fade reservation, Envoy's used claim count, stable SVG identity, progress announcements, focus after completion and reset, disabled controls while busy, and absence of horizontal clipping.
- Repeated activation advanced only once. Reset during animation cancelled its eventual result. Enabling reduced motion mid-animation completed exactly once. Route changes removed the previous SVG, and Back restored a fresh example.
- No page errors, console errors, failed requests, HTTP errors, wallet writes or remote requests occurred in this examples suite.
- Directory and card copy contained no em or en dashes.

Evidence: `artifacts/verification/2026-09-27-instrument-examples/results.json`, with screenshots referenced by that report.

## Visual review and fixes

The initial run was intentionally interrupted after screenshot review found visible accessibility-only text and actor labels wider than the SVG canvas. The evidence remains in `attempt-1-visible-labels`; it is not an accepted run.

Corrections applied before the final run:

- Scoped screen-reader text hiding prevents duplicated labels and visible live announcements.
- Actor labels and balances share the SVG's 980px maximum width.
- Envoy's agent is centered under its label, with the pickup crate kept separate.
- The traveling token begins hidden.
- Reset returns keyboard focus to the first enabled action instead of leaving it on a disabled reset button.

Desktop Fade, Pod, Trigger, Envoy, Ramp and Ledger screenshots were visually inspected. Mobile directory, Fade, Pod and Envoy screenshots were also inspected at 390 or 320 pixels.

A mobile element screenshot appeared to cut off Fade's limitation note. A separate actual-scroll check passed **12/12 cases**, covering every example at widths 390 and 320. Each text line was within the viewport and hit-tested as unobstructed. Actual viewport screenshots confirm the note remains visible; the cut was a locator-capture artifact. Evidence is `note-visibility.json`, `fade-390-note-viewport.png`, `envoy-320-note-viewport.png`, and the accompanying full-page captures.

## Maintained navigation tests

`landing/tests/e2e/matrix.mjs` now targets everyday examples instead of the retired mechanism controls. The old How it works modal assertions were explicitly replaced with absence checks and legacy `/#how-it-works` redirection to `/instruments`, including Back and Forward. The script passed syntax validation; the full navigation/GPU matrix was not executed by the examples QA agent in this pass. Home, black-hole rendering and application arrival are verified separately.

## Boundaries

These stories are fictional illustrations. They do not connect a wallet or submit transactions. Pod's current public records, Ramp's mock conversion and Ledger's unsigned export limitation remain explicit. The browser suite does not establish cryptographic privacy, live fund safety or a completed security audit.
