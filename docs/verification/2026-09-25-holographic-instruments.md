# Holographic instruments and landing exploration

The user asked for translucent, instrument-specific workspaces, a visibly useful
Instruments navigation action, and a less static How it works. This is a local
source revision; it does not establish aesthetic acceptance or publication.

## Implementation

- The app's full-scene workspace dimmer is removed. The workspace has translucent
  edges and open gutters; only the form, labels and diagram have local backing.
  Opening uses a finite projection reveal. Operating-system reduced motion still
  suppresses nonessential animation. No motion toggle or mission timeline was added.
- Fade plots its actual draft start/floor/duration. Pod shows time and secret
  conditions. Trigger separates attester proof from the refund deadline. Envoy
  depicts entered per-claim and daily caps. Ramp shows the selected direction and
  entered amount with testnet/simulated-bank labels. Ledger shows actual local
  records and confirmed-hash counts. No diagram invents a payment or verification.
- Existing submission, validation, receipt, secret-saving and draft-preservation
  behavior remains in place. Diagrams are presentation over the same draft data.
- Instruments enters a separate composition within the existing 3D scene. The
  selected mechanism moves into a large reading stage, while the other mechanisms
  recede. Previous/Next wrap through four instruments; HTML and physical picks
  agree, and repeated Instruments navigation retains the selection.
- The stage is projected through the actual camera. Mobile reserves a model band
  above the content and permits native scrolling for longer descriptions.
- How it works has three keyboard-operable stages: Terms, Wallet and Result.
  The optical diagram and explanation change with the selected stage. Native
  dialog focus, Escape, browser Back and focus restoration remain supported.
- The scene replays both exploration mode and selection after motion-preference
  renderer recreation. No new render loop, shader or light was added. Existing
  launch timing, final-frame handoff and station geometry are preserved.

## Iterations and verification

- `artifacts/verification/holographic-baseline-2026-09-25/` preserves 12 baseline
  images and browser evidence. Instruments previously changed the URL/default
  selection without entering a different layout; How was three text items.
- `artifacts/verification/holographic-first-render/` preserves 12 first-revision
  renders. Desktop exploration, mobile Pod exploration, How, desktop Fade and
  mobile Pod were inspected. Actual world transmission was visible; Fade's thin
  plot became hard to distinguish over the bright disk. The plot now has a local
  backing and a thicker line. The form/world opacity was not raised wholesale.
  That capture retains one external Soroban RPC `ERR_NETWORK_CHANGED`; it is
  not a clean-network result.
- The first adapted landing matrix failed its stage-focus assertion. A browser
  focus trace showed the target was no longer inert but still had computed
  `visibility:hidden` during the opening transition. Opening visibility now
  changes immediately while opacity and position animate. Failed evidence remains
  under `landing/artifacts/verification/holographic-landing-first/`.
  The first correction (visibility duration 0s) still failed under reduced motion:
  the global rule forcibly changed it to 0.01ms. The paired browser trace in
  `artifacts/verification/holographic-focus-diagnostic/verification.json` confirms
  hidden-at-focus under reduced motion and visible-at-focus under normal motion.
  Visibility is now excluded from the opening transition property list entirely;
  the fix adds no arbitrary timeout or retry loop.
- Before the final small readability/copy correction, all 248 app and 28 landing
  unit tests passed. The app agent reran 74 panel tests after that correction.
  Both latest production builds and landing lint passed. Assembly generated
  15 inline script hashes and a 1094-character CSP.
- The landing build retains its dynamic Three.js chunk warning above 500 kB
  (approximately 154 kB gzip). This pass does not claim that warning is resolved.

- A subsequent visual review found underlying landing text showing through the
  How dialog. Only the underlying text and controls now withdraw while the
  explanation is open; the physical world remains visible.
- CPU review found a small-amount presentation mismatch: the new Ramp diagram
  used a two-decimal formatter. The same precision loss affected shared draft
  summaries, Envoy limits and Fade's new axis labels. A shared draft formatter
  now preserves all seven supported decimals and trims only display padding.
  Regression tests cover signed sub-cent values, the smallest unit, invalid
  drafts, whole numbers and visual/accessible labels, without submitting.
- Latest complete unit run: **256 app + 28 landing = 284 passed**. Both latest
  production builds, landing lint and assembly passed after the precision fix.

- `artifacts/verification/holographic-landing-final/verification.json`: **16
  checks passed** across desktop and mobile, with zero console, page, request or
  CSP errors. Instruments changes actual world pixels, Previous/Next wraps,
  repeated navigation preserves selection and focus, all three How stages change
  their optical illustration, and Escape/Back/focus restoration work. The world
  remains visible while underlying landing text withdraws behind How.
- Motion preference toggling preserves both the UI and the actual selected world
  raster: both final desktop/mobile pairs were pixel-identical. An intermediate
  9.32% comparison difference was a screenshot-fixture failure: temporary hidden
  HTML was itself transitioning and leaked into one image. The saved diagnostic
  pair shows matching Pod/hole geometry plus leaked text. The screenshot-only
  mask now disables those transitions, and media switches explicitly wait for
  the outgoing canvas to disconnect and its replacement to become ready. The
  strict pixel threshold was not relaxed; runtime code was not altered for this.
- `artifacts/verification/holographic-app-verified/verification.json`: all **26
  functional, layout and unsent-draft assertions passed** across desktop/mobile,
  including real world transmission through all six workspaces and preserved Pod
  drafts after closing/reopening. Twelve panel captures were saved. **The strict
  overall run remains failed** because one desktop Soroban request reported
  `ERR_NETWORK_CHANGED`. There were no application, CSP or local-asset errors.
  This is not reported as a clean-network pass.

- The adapted landing matrix passed **53 checks** at 1440, 768, 360 and 320 px,
  including native links, dialog history/focus, all detail routes, full flight,
  motion changes during launch, and forced no-WebGL fallback. Evidence:
  `artifacts/verification/holographic-landing-matrix/results.json`. This run uses
  the fixed viewport height and precedes the final fixed exploration positioning;
  the later scrolled-flight check exercises that correction specifically.
- `artifacts/verification/holographic-workspace-layout/results.json`: **18 layout
  assertions passed**. Desktop Fade/Trigger/Envoy primary actions are visible
  without scrolling; mobile inputs are at least 16px; all visible controls in
  all six panels remain reachable by workspace scrolling at 844×390. Taller
  header fixtures preserve overlay clearance and full-viewport canvas bounds.
  External network diagnostics remain in the report; its status is
  `layout_passed_with_runtime_diagnostics`, not a clean-runtime pass.
- The first exploration-origin mobile flight passed its previous handoff checks,
  but new geometry evidence exposed a real first-frame resize: the 390×938
  drawing buffer was briefly painted into 390×844 CSS bounds. Its video and trace
  remain in `artifacts/verification/holographic-flight-mobile/`. The scene now
  retains viewport dimensions and fixed positioning while exploration text
  scrolls naturally, preventing both size and scroll-position changes on Launch.
  The regression also tests launch after actually scrolling the longer content.

- Corrected normal-motion exploration flights both **passed**, including the
  strict console/page/request/CSP gates. Mobile was scrolled down 94px before
  Launch: its canvas stayed at (0,0), 390×844, while the 938px reading section
  scrolled independently. Both runs recorded zero immediate aspect change,
  zero shader links during flight, a decoded exact-frame bridge before app
  graphics, and no second approach. Observed click-to-navigation times were
  10,191ms mobile and 10,464ms desktop, including overhead around the 9.8s path.
  Evidence: `holographic-flight-mobile-fixed/verification.json` and
  `holographic-flight-desktop-fixed/verification.json` under artifacts/verification.
  The script deliberately delays app scripts to test bridge coverage; its bridge
  hold duration is not a measurement of ordinary production navigation latency.
- Sequential video contact sheets preserve the launch, both former midpoint
  windows, document navigation and renderer reveal. The mobile launch/navigation
  sheets were reviewed: settled station framing is retained through the bridge.
  The first-frame buffer/CSS mismatch is absent in the corrected geometry trace.
  The sheets sample 5 frames/second; that sampling alone does not prove the absence
  of a single bad frame or establish a smooth frame rate.
- Final app captures were visually inspected, including the Fade curve against
  the bright disk, Pod's mobile controls, Trigger's proof fork, Envoy's limits,
  Ramp's withdrawal view and the empty Ledger. The scene remains visible without
  a full-screen dark dimmer. On mobile, longer forms and their lower diagrams
  require scrolling; they are not all initially visible.

- After the final fixed exploration positioning, the full application browser
  suite passed **14/14** (`holographic-app-tests/.last-run.json`). The physical
  world suite passed **8/8**, including all four actual mesh picks at 1440, 390
  and 320px, explicit camera input and fine-pointer camera response. It recorded
  no errors. The selected Pod before/after reduced-motion crop had maxDelta 0.
- The final exploration/How suite passed **16/16** again on the final artifact,
  with zero console, request, page or CSP errors. Both complete world rasters
  were identical across motion-preference replacement. See
  `holographic-landing-fixed-final/verification.json` and
  `holographic-world-final/results.json` under artifacts/verification.
- The final short SwiftShader sample measured **23.97 FPS and 21 draws/frame**
  across 176 scene frames. This is software rendering on the test host, not a
  native-GPU benchmark or evidence of 60 FPS. No new scene draws were introduced
  by the exploration state. Earlier external RPC failures remain in their strict
  reports despite the later clean flight and landing runs.
- Desktop launch/reveal and mobile launch/navigation contact sheets were reviewed
  after the final correction. No second camera approach appears in those windows;
  the settled geometry survives document loading. Final source whitespace checks
  and landing lint also passed. All work remains local.

## Boundaries

No wallet was connected and no transaction was signed or submitted. No production
or chain deployment, push, commit, or account change occurred. The existing real
configuration references a kernel without protocol v2 and intentionally blocks
writes; see HANDOFF.md. Automated software-renderer checks do not establish
native-GPU frame rate or universal smoothness. Earlier network failures remain
recorded rather than filtered from reports.
