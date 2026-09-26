# Instrument workspace and connecting flight

Local revision, 2026-09-24, branch `codex/orbital-redesign-security`.
User request: improve the instrument UI and detail pages, and connect landing to
app with a slow continuous scene transition. No deployment, chain transaction,
commit or push is part of this verification.

## Changes

- Replaced the right-hand drawer with a centered workspace. Header, editable
  fields, draft summaries, record loading and activity history have distinct areas.
  Closing and reopening preserves the mounted draft. Desktop, tablet, portrait
  and short landscape layouts keep controls reachable.
- Fade previews the entered price curve with the real integer pricing function;
  invalid inputs do not invent values. Pod preserves secret-save acknowledgement
  and recipient-commitment controls. Trigger and Envoy retain signer and cap checks.
- Ramp switches between deposit and withdrawal without losing either draft.
  Refresh now selects the transfer in the displayed direction, and an in-flight
  response from the other direction cannot appear as its status.
- Ledger uses expandable activity rows with meaningful accessible names, plus
  the existing honest Proof Pack export. Synthetic layout fixtures were isolated
  in temporary browser contexts and were not chain transactions.
- Six public detail pages use matching typography, colors and original explanatory
  diagrams; existing inaccurate settlement/privacy/export claims were corrected.
- Flight departure is 3.6 seconds; arrival is 6.2 seconds after a 450ms reveal.
  Both canvases have the same viewport dimensions. The saved frame remains above
  the app until its renderer is ready, preventing a blank navigation seam and a
  briefly visible interface during hydration. Arrival time pauses while the scene
  is hidden. Direct camera/module input can interrupt the flight.
- Graphics failure, stale/invalid session data, disabled storage, reduced motion,
  and graphics recovery retain their existing fallbacks. A fresh regression first
  reproduced the early-cover-removal bug, then passed with removal at renderer
  readiness instead of poster-image load.

## Verification

- Fresh unit suite: **201/201 app, 28/28 landing**.
- App production build/export (including lint and type checks), landing
  production build/type check and lint passed. Combined site assembled with 15
  inline-script CSP hashes; no script `unsafe-inline` or `unsafe-eval` added.
- Initial workspace verification: 31 checks passed, with three stale Ledger
  accessible-name assertions corrected and rerun successfully (34 total covered).
  Evidence: `artifacts/verification/workspace-ui/` and
  `artifacts/verification/workspace-ui-ledger-recheck/`.
- Layout supplement: 15 checks passed for mobile input sizes, all six landscape
  panels' scroll/pointer reachability, and taller-header fixtures at three
  viewport sizes. The three desktop primary-action clipping failures were fixed
  and rerun: **3/3 passed**, with no console/page/network errors in that rerun.
  Captures were visually inspected. Original failures are preserved at
  `artifacts/verification/workspace-layout/`; final desktop captures are at
  `artifacts/verification/workspace-layout-desktop-recheck/`.
- Six detail pages passed at 1440 and 390 pixels (12 combinations): text/diagram
  bounds, CTAs, keyboard focus, mobile navigation Escape and no page errors.
  All 12 captures were inspected. A footer button wrap found in those captures
  was subsequently corrected and verified at 390 and 320 pixels, including
  single-line CTA, text bounds and no horizontal overflow. Evidence:
  `artifacts/verification/detail-pages/footer-checks.json` and matching captures.
- Landing interaction matrix: **24/24 passed** (1440/768/360, reduced motion,
  keyboard camera input, route changes and teardown, mobile navigation,
  launch handoff and graphics-unavailable launch). Evidence:
  `artifacts/verification/landing-final/results.json`. Its full-page homepage
  captures precede scrolling, so unrevealed below-fold elements in those captures
  are not evidence of a fully visible homepage. The homepage layout was not
  redesigned in this pass.
- Initial normal-motion video confirmed identical 1440×1000 canvas bounds at
  (0,0), a saved-frame cover before app graphics existed, seven app scripts held
  back by 1.5 seconds, and 6.66 seconds of visible arrival after readiness.
  Drag, wheel, focused keyboard and module selection all interrupted arrival.
  Review of the actual video caught the hydration interface flash, which was
  traced to early cover removal and controls transitioning from visible to hidden
  on arrival. Entry now hides them immediately; the ordinary later reveal retains
  its transition. The bridge clears only after React commits the ready DOM.
  The original failed run/video remains at
  `artifacts/verification/connecting-flight/`; it is not presented as a clean pass.
- Final post-fix handoff check: passed with **zero page/console/request/CSP errors**.
  First leg measured 4.19 seconds under recording load; arrival after renderer
  readiness measured 6.68 seconds. The bootstrap frame remained until readiness,
  both canvases matched, and actual heading/footer opacity assertions found no
  premature interface display. Evidence:
  `artifacts/verification/connecting-flight-final/verification.json` and video.
  The final video contact sheet was inspected: no heading/full-dock flash between
  the held frame and renderer-ready state. Geometry remains aligned.
- App browser regression matrix: 13 tests passed initially; the launch test hit
  its obsolete five-second wait after the intentionally slower departure. Its
  trace showed navigation starting about four seconds after clicking. Only that
  visibility timeout changed to 15 seconds; the test then passed on the final
  build with scene readiness, CSP, 404 and security-header assertions intact.
  Thus **all 14 cases are covered by passing runs**, including actual camera
  raster changes, reduced motion, graphics recovery/fallback, wallet chooser,
  keyboard navigation, mobile width and draft preservation. Rerun evidence:
  `artifacts/verification/workspace-launch-recheck/`.

## Limits

The first workspace run recorded ten external Stellar read-only RPC requests
failing with `net::ERR_NETWORK_CHANGED`; the initial flight run recorded one.
These are retained in the reports. There were no JavaScript page exceptions or
CSP violations in those runs. This is not proof of RPC availability or successful
wallet/chain operation.

Timing and visual continuity do not establish a smooth frame rate. The preceding
software-renderer performance sample (about 17 FPS ambient) is historical,
not a new performance measurement for this revision. No 60 FPS claim is made.
The old deployed testnet kernel remains incompatible with the revised signing
protocol; that migration and production publication have not been performed.

Technical checks and visual inspection are not user aesthetic approval.
