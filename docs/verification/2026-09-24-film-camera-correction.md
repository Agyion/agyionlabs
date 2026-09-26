# Film framing and camera correction — local working revision

This is a local revision, not a deployment or a record of user approval. The
previous visual result was rejected. Passing functional tests is not an
aesthetic acceptance criterion.

## Reference actually inspected

- User images: `gargantua.jpeg`, `Black_hole.webp`, and `blackhole.png`.
- [Gargantua / Detach footage](https://www.youtube.com/watch?v=L3cG-HPp828),
  including the shots at approximately 0:49 and 1:03–1:04. The clip was played
  and the frames inspected in the browser, not inferred from its title.
- [DNEG's Interstellar work](https://www.dneg.com/our-work/interstellar) and
  [the lensing paper](https://arxiv.org/abs/1502.03808) informed the distinction
  between curved disk images and an ordinary luminous torus.

The reference establishes a tiny spacecraft against a horizon that extends
outside the frame, with luminous gas under the camera. The app subsequently
approaches the hull so that its instruments remain usable. This is an original,
procedural approximation; no film footage or reference raster is embedded in
the product, and this is not DNEG's Kerr renderer.

## What changed

- Instrument selection reads physical bay anchors and moves the camera around
  the hull. It does not rotate, rescale, translate, or retime the ship to present
  a selected bay. Ambient ring rotation continues on its independent clock.
- Landing starts at a distance. Launch carries camera/ring phase into a 6.8 s
  approach while the ship climbs away from the disk in world space. Explicit
  orbit, zoom, selection, and exploration can
  interrupt the automatic approach; the interface immediately responds.
- The distant lens image and the nearby gas plane now use the same observer
  inclination and projected disk orientation. The gas is actual world geometry
  with parallax, rather than a screen-fixed background.
- The old 250 ms disk refresh was removed. Flow is computed from a texture
  generated once and the black hole is rendered on every scene frame.
- The hull remains at display resolution. The softer background has a separate,
  fixed-resolution HDR pass; no live switch between presentation pipelines or
  material tone-mapping variants is used.
- Software graphics uses a simpler surface-lighting model, no live shadows,
  and no multisampling. Hardware retains PBR surfaces, shadows, and multisampling.
  Twelve bay lights use one instanced draw. No model fittings were removed.
- Drawer background blur was removed after an isolated measurement showed
  its cost. The duplicate scene heading hides while the drawer is open. Active
  instruments have short underlines instead of a full-width progress-like track.
- Mobile camera inheritance accounts for drawer framing in world units. The
  first zoom gesture keeps its intended direction and approach has no 18% step
  at its mobile endpoint. Reduced motion still allows explicit camera controls.
- Graphics-context recovery preserves the current escape progress. A completed
  approach no longer restarts when the GPU context returns. Closed drawers are
  inert during their exit transition, so hidden controls cannot retain keyboard
  access.
- Fully transparent gas is skipped, masked pixels exit before texture work,
  and the compositor avoids a duplicate depth clear. Text contrast is localized
  around the heading and mobile instrument dock, without background blur.

## Evidence and scope

Camera geometry and interruption regressions are in
`app/tests/module-camera.test.ts` and `app/tests/orbital-backdrop.test.tsx`.
The local browser walkthrough is `scripts/flight-visual-check.mjs`; its images
and timestamps are written to `artifacts/verification/film-flight/`.

Fresh checks in this correction:

- Application: 182 unit/component tests; landing: 28 tests and lint. Both
  production builds completed with their TypeScript checks.
- App browser checks: all 14 passed (13 interaction/fallback/navigation tests
  and one separate graphics-recovery regression). The recovery test freezes
  time while rendering continues, loses/restores the context, and compares
  actual scene pixels before/after. This catches flight replay, not just a CSS
  state change.
- Landing browser matrix: all 24 checks passed at 1440, 768 and 360 px, covering
  renderer failures, keyboard access, route teardown, native modified links,
  instrument reveals and the launch handoff. Final heading contrast and the
  graphics-recovery test were rechecked after the CSS feather correction.
  Separate normal-motion scroll captures at 360 and 1440 px confirmed all 11
  reveal elements reach full opacity, including each of the seven instrument
  and process rows while in view. These are the `landing-*-revealed.png` images
  in `artifacts/verification/final-landing/`; initial full-page screenshots do
  not activate content that has not yet entered the viewport.
- The final PBR/shadow branch was rendered for four stills (landing, app, module,
  mobile), with no console/page errors. These forced-branch captures also run
  on SwiftShader; they verify rendering, not hardware speed.
- Normal-motion walkthrough: 15 desktop/mobile captures, all six instruments,
  orbit, zoom and launch interruption; no page errors, console errors or failed
  requests. An earlier run hit `ERR_NETWORK_CHANGED`; that failed run was not
  counted as a pass. The diagnostic script now persists failure URLs and source
  locations before asserting.
- The final scene performance sample is
  `2026-09-24-orbital-performance-verified.md` and its raw JSON. It measured
  16.94 FPS ambient, 16.58 during drag, 9.73 during module opening and 15.64
  with the drawer settled on SwiftShader. The disk updates on every scene frame
  and no post-ready shader compilation/long task was observed, but module
  opening still had a 283.4 ms P95 frame interval. **Smoothness is not verified.**
  A subsequent heading-only CSS feather correction is outside that timing sample.

Historical measurements are preserved in the `orbital-performance*` reports.
This environment exposes SwiftShader even without forcing a software backend.
Software timing is useful for finding stalls and relative costs; it does not
establish performance on the user's hardware. High-quality still studies, when
explicitly forced by `HIGH_QUALITY_STUDY=1`, exercise that rendering branch on
software and must never be described as a hardware benchmark.

No production, wallet-signing, chain-migration, or external account changes were
performed as part of this correction. Backend audit status remains in the prior
audit and security-protocol documents.
