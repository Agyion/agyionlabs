# Visual correction after rejection — local evidence

2026-09-24. The user rejected the first black-hole rendering. No design approval
was given. Earlier wording `User-approved direction` and `agreed visual tokens`
was incorrect and has been corrected. Functional test results are not design approval.

## Changes

- Replaced the independent bright circle/straight stripe with an inclined emissive
  disk sampled along curved light paths. The non-spinning Schwarzschild orbit lookup
  is generated once; the disk emissivity and plunging region are artistic choices,
  not a scientifically validated movie recreation.
- Added irregular sheared disk bands, a dark central shadow, subdued lower image,
  thin light edge and quarter-resolution optical bloom. Shared across both routes.
- Reduced the landing station scale and changed perspective. Added deeper faceted
  modules, three equipment variants, hull seams, hatches/couplers, radiator ribs,
  a revised docking hub and tapered shuttle. Cool front fill, warm rim and a single
  directional shadow replace the original flat beige lighting.
- Moved the mobile composition away from primary text and gave app motion controls
  a dark surface. The decorative Mission timeline remains absent.
- Fixed visible SVG fallback fragments underneath a ready WebGL scene. A pixel
  comparison now proves removing the hidden SVG does not change the rendered view.
- Fixed AppShell server/client reduced-motion hydration mismatch. New unit tests
  reproduce hydration and changing OS preferences while preserving manual pause.
- Added explicit shader-error fallback, offscreen MSAA, render-target disposal,
  non-HDR fallback and adaptive buffer resolution when frame intervals stay high.

## Verification of behavior

- App: 139 tests pass, lint and static production build pass (includes TypeScript).
- Landing: 28 tests pass, lint and production build pass (includes TypeScript).
- Landing browser matrix: 20 checks pass, including the new SVG pixel comparison,
  1440/768/360px layouts, motion controls, routes, keyboard and unavailable WebGL.
- Combined production preview: the existing seven browser scenarios pass. The new
  forced shader-compilation failure scenario also passes independently.
- Final production-preview screenshots at 1440x1000 and 390x844: no horizontal
  overflow and no captured page or console errors on either landing or app.
- Sources assembled into `app/site`; preview is http://127.0.0.1:4192.

This evidence is local. No production publish, push or chain operation was made.
The current contract migration/security limitations in the main audit remain.

## Visual evidence and limits

Current images (ignored generated artifacts):
- `artifacts/verification/landing-visual-correction-desktop.png`
- `artifacts/verification/landing-visual-correction-mobile.png`
- `artifacts/verification/app-visual-correction-desktop.png`
- `artifacts/verification/app-visual-correction-mobile.png`
- `artifacts/verification/visual-correction.json`

References were the user's four root image files. The old `*-hero-final.png`
files preserve the first rejected version; they are not the current revision.
The new images were visually inspected by the implementing agent. No user
acceptance is implied. The model is procedural, not a film production asset.

The isolated browser here uses SwiftShader. Before adaptive resolution, a loaded
software-rendering sample yielded only 3 frames in about 2 seconds; this is not
acceptable evidence of real-time device performance. Resolution now steps down
on persistently slow frames. Actual low-end/mobile GPU performance remains to
be measured on physical hardware; no FPS guarantee is made.
