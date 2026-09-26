# Physical bay preview verification — 24 September 2026

**Historical sleeve candidate:** visual review below triggered a correction to edge-only line geometry. Its new build still requires browser verification; the 4,736-pixel result is not evidence for the corrected edges. The corrected source passed 39 focused scene/input tests and app TypeScript.

The assembled local site at `http://127.0.0.1:4192` passed both focused dock-preview checks at 1440 × 1000. The isolated Chromium browser is closed. These are SwiftShader interaction and visual observations, not native GPU performance or general design approval.

## Evidence

- Normal and reduced motion: hovering and focusing Pod leaves the URL, selected Fade tab and closed workspace unchanged. A real Fade pot draft of `918.27` survives hover, focus and leave. No wallet connection, submission or signing occurred.
- Camera rotation is measured from the existing fixed star mesh's view matrix, independent of ring and gas animation. Reduced motion has exactly zero before/after basis change. Normal final basis difference is `0.0000052452`, below the strict `0.0004` tolerance after the previous camera transition settles.
- The reduced-motion scene-only crop changes **4,736 pixels**, with **4,677 above 10 channel levels**, within a 149 × 139 pixel bounding box. The previous lamp-only implementation changed 19 pixels. This comparison uses actual PNG pixels, without changing the rendering clock or uniforms.
- After pointer leave and keyboard blur, the reduced-motion scene PNG equals the baseline exactly.
- Two checks passed; eight captures were saved. No console errors, page errors, failed requests or HTTP errors were recorded in this run.

## Visual observation

The two physical Pod bays are immediately distinguishable in both the full normal-motion screenshot and the fixed reduced-motion crop. Their front panels, surrounding spokes, antennas and neighboring modules remain visible. The 0.9-deep extruded rim also covers the bays' side faces with a cream surface; it reads as a sleeve rather than a fine outline. This is an explicit visual limitation, not a claim that every original hull detail remains unobstructed.

## Files

- Raw evidence: `artifacts/verification/bay-preview-final/results.json`
- Full app hover: `artifacts/verification/bay-preview-final/app-normal-dock-hover.png`
- Full app keyboard focus: `artifacts/verification/bay-preview-final/app-normal-dock-focus.png`
- Scene-only before/hover/leave: `artifacts/verification/bay-preview-final/app-reduced-dock-{before,hover,after-leave}.png`

Reproduce: `QA_DOCK_ONLY=1 QA_OUTPUT_DIR=artifacts/verification/bay-preview-final node scripts/verify-pointer-response.mjs`. Coordinate exclusive browser/GPU access first.
