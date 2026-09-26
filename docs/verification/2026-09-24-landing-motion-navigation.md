# Landing motion, navigation and pointer response

Local frontend revision for the user's report of a split launch animation,
missing mouse response, excessive copy, and difficult landing navigation.
No production deployment or visual acceptance is claimed.

## Changes

- A single 9.8-second approach runs in the prepared landing renderer. The app
  restores the final camera/ship pose without a second flight. Details and
  timing evidence are in `2026-09-24-single-flight.md`.
- Fine mouse movement gives both free scenes a small damped camera offset.
  Drag and zoom ease that offset away instead of dropping it abruptly. Explicit
  camera input remains available with reduced motion; incidental aim is disabled.
- Dock hover and keyboard focus illuminate the associated physical bays without
  selecting a tab, moving the camera, changing the URL, or opening a form. The
  initial lamp-only response was too subtle in the captured scene (19 pixels).
  A subsequent revision adds fine faceted edge lines following the actual bay
  shells, with eased opacity, shared geometry and no additional idle draw calls.
  An intermediate filled sleeve was rejected in visual review because it hid
  side-panel detail. The edge shader is prepared before the scene becomes ready.
- Four animated product illustrations replace four long product rows. Each has
  a brief description, a detail route, and a direct app link. Pointer motion
  tilts the illustration; its animation pauses when outside the viewport.
- Fixed section navigation shows the current section, including the final short
  section at the bottom of the page. Mobile navigation exposes a named Menu,
  and anchor navigation moves keyboard focus to its destination.

## Source and build checks

- 227 app unit tests passed after the pointer continuity, mobile flight framing,
  and bay-edge corrections. The new
  drag/zoom regressions were first shown to fail against the original hard reset.
- 28 landing unit tests passed; both production builds, type checks and lint
  passed. The combined export regenerates 15 inline CSP hashes.
- The original dirty working tree was preserved. No commit, push, wallet
  connection, transaction signing, or deployment was performed.

## Landing and app browser checks

- `landing-motion-final-ux/results.json`: 16 checks passed at 1440, 390 and
  320 pixels. All four products, native destinations, keyboard selection, fixed
  navigation, pointer-driven illustration transforms, and every reveal were
  checked. Complete screenshots were inspected after entrance opacity reached 1.
  Visible homepage copy is 175 words, versus approximately 402 in the preserved
  baseline; page height is 2841 px on desktop versus 4197 px before this change.
- `landing-explorer-final/results.json`: 31 landing checks passed, including
  hover/focus separation, arrow/Home/End tab selection, mobile menu Escape,
  anchor focus, scroll-derived current navigation and reduced motion.
- `detail-pages-explorer-final/checks.json`: all six detail routes passed at
  1440 and 390 px (12 checks), including links, diagrams, focus and overflow.
- `mobile-hero-actions-final/results.json`: the final mobile CTA contrast fix
  passed at 390 and 320 px. Both actions share one row, are 52 px tall, receive
  pointer events, and remain within the viewport. The secondary action has a
  dark surface over the bright accretion disk. Screenshots were inspected.
- The 14 app Playwright regressions passed for the completed flight/input
  revision: six workspaces, history, keyboard dock, mobile layout, reduced
  motion, renderer failures/recovery, document launch/CSP, wallet chooser,
  drag/zoom/keyboard camera control, module camera, and preserved form drafts.
  The later bay-rim-only change receives a separate focused preview check.

All artifact paths above are relative to `artifacts/verification/`.

## Final flight and edge review

The desktop flight recording confirms continued travel through the old midpoint,
an aligned destination frame, and no second approach. Its strict final console
gate failed on two retained external Stellar `ERR_NETWORK_CHANGED` requests;
all flight assertions passed. The initial mobile recording exposed a separate
visual defect: target lift outpaced the shrinking camera radius, sending the
hole below the viewport. Timing and storage checks alone did not catch it.
After correcting the portrait target angle, the affected mobile recording
passed with zero runtime/network/CSP errors, and sequential frames keep both
the hole and approaching ship in view. See `2026-09-24-single-flight.md`.

The final edge preview is documented in `2026-09-24-bay-edge-preview.md`.
Normal hover/focus checks pass. The final reduced-motion crop has 1120 pixels
changing by more than 10 channel levels, while the camera matrix is unchanged;
leaving restores all scene pixels exactly. The filled Fade draft, selection,
URL and closed workspace are preserved. The fine edges expose the original
side-panel finish and front details in the reviewed full-app screenshot.
An earlier over-strict whole-PNG assertion caught a maximum 2/255 background
difference away from the bays; that failed result is preserved, and the
corrected check measures the actual preview mask plus a bounded whole-scene
difference. The final repeat is exact even across the whole scene.

## Pointer browser evidence

`artifacts/verification/pointer-response-final/results.json` records 14 passing
interaction checks at 1440×1000, across landing/app and normal/reduced motion.
Twenty-one screenshots accompany the report. A measured point inside each
header is used to take the pointer out of the world.

The probe reads the fixed star object's existing model-view matrix without
changing rendering, time, or application state. Normal-motion camera basis
changes are 0.02686 on landing and 0.02907 in the app, compared with stationary
changes of 0 and 0.00000073. This isolates camera response from animated gas or
ring rotation. Leave, drag, Home reset, and dock hover/focus behavior also pass.
The reduced-motion scene-only dock crop changes when a bay is previewed while
the camera basis stays fixed.

There were no JavaScript exceptions. One request to the external Stellar testnet
RPC failed with `net::ERR_NETWORK_CHANGED` during the normal app drag check;
the corresponding console error and failed request remain in the report. Its
status is explicitly `interaction_passed_with_runtime_diagnostics`, not an
error-free run. This is not live transaction verification.

The browser uses software graphics (SwiftShader). These checks establish
interaction correctness, not native GPU performance or a smooth frame rate.
Earlier software-renderer performance limits remain documented separately.
