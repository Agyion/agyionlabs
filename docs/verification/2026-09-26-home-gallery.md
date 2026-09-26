# Separate homepage hero and instrument gallery — published

Published to [agyionlabs.dev](https://agyionlabs.dev/#instruments) at
2026-09-26 21:11 UTC (27 September 00:11 in Istanbul). Worker `agyion`, version
`b661f1df-bf19-4515-88d9-efbc17151440`, deployment
`bc49f6e4-9e84-45cd-9506-eae982f4a5d9`, 100% traffic. Runtime source `4dcd48a`
was pushed to `codex/orbital-redesign-security` before publication. Previous
rollback version: `ff3d5bf7-a79a-49f3-bed9-cbfe9ce8ee47`.

The user approved moving product illustrations away from the black hole. The
opening now keeps the existing space world and Endurance, followed by a separate
opaque black/orange gallery reached by natural scrolling or Instruments. Four
split-word selectors share one short animated example, a Details link and an
explicit application link. The existing detailed product pages remain available.

Details progressively reuse the selected title and visible stage through a native
view transition. React route commitment is awaited before taking the destination
snapshot. Reduced motion and unsupported browsers retain normal navigation.
History restores the selected product, scroll position and relevant link focus.
The real hash target also works on direct loading and anonymous browser history.

The hero creates no product meshes and pauses when outside the viewport. An app
departure from the scrolled gallery promotes and synchronously resizes the same
renderer before the existing 9.8-second flight. The requested tab and frame bridge
remain part of the existing handoff. No wallet, privacy or transaction gate changed.

## Local verification

- Landing: 89 tests, full typecheck, lint and production build passed.
- Application: 477 tests, typecheck and production build passed after the shared
  scene's explicit layout-refresh API was added. No application form changed.
- Four-width initial layout inspection found header collision and an overly tall
  preview; both were corrected. No horizontal overflow at 1440/768/390/320.
- The actual development StrictMode run exposed duplicate completion of Envoy's
  reduced-motion preview. Completion is now idempotent per run. The browser
  regression confirms `01 / 50` both after the first example and Replay.
- Route checks exposed two bugs before publication: hash positions sharing the
  initial history key, and a transition snapshot preceding the actual React
  commit. The seven final DOM-only checks passed, including exact y=888 restoration
  and Details focus. WebGL was intentionally disabled for those DOM checks.
- Native-link checks then exposed a second React Router click handler after our
  own handler intentionally returned. The shared-transition link now uses an
  actual anchor with the existing guarded navigation, preserving browser-owned
  target/download/modified-click behavior.
- Read-only review found that Back between homepage hashes could leave an active
  application departure mounted. Its cancellation must invalidate the pending
  generation, reset the scene and clear both timer and generated frame handoff;
  the final normal-motion browser check exercises the original deadline too.
- The full production matrix later reproduced another immediate-Back race in
  reduced motion: the old gallery's passive scroll listener stored the detail
  page's zero position. The route lifecycle now removes that listener during
  layout cleanup. An instrumented real-browser DOM regression failed 8/8 before
  this change and restored exactly y=888 in all 8 repeats afterward. Full-world
  routing checks on the rebuilt artifact are recorded separately below.
- The full four-width/two-motion matrix completed **94/96** groups. Its two
  failures are the same immediate-Back race at 1440/390 reduced motion, retained
  in `final-matrix-3/results.json`. All four products' continuous geometry,
  replay/idempotence, reduced motion, opaque separation and layouts passed.
  Desktop cancellation through the original deadline plus a fresh complete
  flight passed; desktop/mobile flights here use an isolated app fixture.
- After the layout-cleanup correction and a fresh production build, the focused
  route matrix passed **57/57** at all four widths and both motion preferences.
  It includes native modifiers/target/download, dialog focus/scroll, same-path
  selection, direct hashes, actual transition snapshots and immediate Back.
  All console, page, network, HTTP and CSP diagnostic arrays are empty.
  Source hashes were unchanged through this final run. Unchanged animation
  sweeps are explicitly skipped in this route-only repeat, not counted as passes.
- The updated general landing matrix passed **54/54**, including the six detail
  routes, directory, keyboard/focus, normal flight, preference changes midflight
  and graphics-unavailable fallback. The deliberately disabled WebGL fixture's
  exact context-creation diagnostic is retained. See the separate
  [browser record](../design/2026-09-27-home-gallery-verification.md).
- Three unaccelerated journeys reached the **actual application**, with 1.5s of
  deliberately delayed app scripts. Desktop Pod/Envoy observed 10,299/10,266ms of
  flight; mobile Envoy observed 10,162ms. All reached the requested workspace,
  used the paired frame bridge, linked no shaders during departure and started
  no second arrival. Mobile's strict run is clean. Desktop's strict run remains
  **failed** on two external Soroban testnet `ERR_NETWORK_CHANGED` requests in
  the Envoy case; both functional journeys passed, with no page exception/CSP
  event. The failed diagnostics are retained rather than reclassified.
- The existing detailed Pod/Envoy mechanisms were checked separately at 390px in
  normal/reduced motion: **16/16** groups passed, including conditions, result
  branches, reset, layout and product navigation, with no browser diagnostics.

Evidence is retained under local ignored `artifacts/verification/home-gallery/`:
`first-look/`, `layout-polish/`, `preview-idempotence/`, `hash-scroll-before/`,
`hash-scroll-after/`, `hash-scroll-final/`, `quick-back-before/`,
`quick-back-after/`, `final-matrix-3/`, `routes-final/`, `landing-matrix-final/`,
`real-app-desktop/`, `real-app-mobile/` and `detail-regression/`.
The first two production matrices are retained as failed/interrupted attempts,
including the initial probe's null-document-element error, native-link failures
and explicit browser-closure consequences. They are not counted as clean runs.

## Limits

Automated browser rendering uses Chromium/SwiftShader and does not establish
native-GPU smoothness or real-phone performance. Examples are illustrative and
move no funds. No wallet signing, chain deployment, private-profile integration,
independent security audit or bug-free guarantee is part of this frontend change.
The previous release's Cloudflare-injected CSP errors remain a separate known
issue; strict live verification must retain them rather than relax the policy.

## Live publication

**29/29 artifact/HTTP and 14/14 home/application UI checks passed. The strict
live run is failed.** Served application bytes match the reviewed artifact under
the existing narrowly validated Cloudflare injection comparison. Missing scripts
and environment-file paths return 404; all six workspaces fit desktop/mobile.

Four existing CSP events from Cloudflare JavaScript Detections and Web Analytics
remain, with two blocked beacon requests. Two external Soroban testnet requests
also reported `ERR_NETWORK_CHANGED`; the application correctly displayed network
unavailability and left its transaction action disabled. No page exception was
recorded. These errors were not suppressed, and neither CSP nor bot protection
was weakened. See `live-release/results.json` and the existing
[Cloudflare follow-up](../security/2026-09-26/cloudflare-csp-followup.md).

The separate live gallery run passed **15/15** source/UI groups at 1440/390 in
reduced motion, including the repaired immediate-Back path. Its strict status is
also failed on four Cloudflare CSP events and two blocked beacon requests; it
has no page exception, HTTP error or other failed request. The live gallery
screenshot was inspected. The versioned
[compact evidence](2026-09-26-home-gallery-evidence.json) records deployment IDs,
artifact hashes, local results and all retained live diagnostics. Raw captures
remain in local ignored `artifacts/verification/home-gallery/`.

GitHub's source push still reports 33 vulnerabilities on the default branch
(two critical, 11 high, 17 moderate, three low). This branch was not merged into
the default branch; a frontend publication is not evidence those alerts closed.
