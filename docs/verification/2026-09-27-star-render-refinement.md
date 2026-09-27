# Star rendering refinement

The former star field used untextured `PointsMaterial` sprites in the same reduced render target as the distant gas. That target is 40% of display resolution on the software profile and 80% on hardware. Upscaling those small sprites made individual pixel changes conspicuous during an orbit.

Stars now render at display resolution in a separate pass. Their shader integrates a Gaussian across each display pixel around the exact projected, subpixel center. A dim magnitude distribution and restrained cool/warm colors replace equal-looking white squares. There is no twinkle, streak, trail, or temporal noise. Camera translation does not move the infinitely distant sky; rotation remains interactive.

The existing gas composite is unchanged. Its alpha masks the stars so the black shadow and accretion disk stay in front. Station geometry draws last and therefore still occludes the sky. The new pass moves the existing star draw rather than adding a second star layer.

## Evidence

`node scripts/verify-star-render.mjs http://127.0.0.1:4471` runs an isolated fixture against the actual shared scene through a local Vite server that allows the workspace's `shared` directory. The fixture is explicitly separate from production-page verification.

- Landing and station star draws use the full 1440 by 900 display target; mobile station uses 390 by 844. Dragging was included in every scene.
- Ten successive subpixel positions of a faint star produce a 1.58% total-light spread at device pixel ratio 1 and 1.40% at ratio 1.5, including 8-bit readback quantization.
- An opaque background mask blocks all sampled star light at both pixel ratios.
- No shader or browser errors occurred in these fixtures.
- Before captures use the existing assembled preview. After captures use the isolated shared scene, without UI. They are visual inspection evidence, not a pixel-identical before/after comparison.

Artifacts: `artifacts/verification/2026-09-27-orbit-refinement/`, including `star-render-study.json` and desktop/mobile stills before and after dragging.

These checks use headless Chrome with SwiftShader. They do not establish hardware frame rate or real-device touch performance. Full-page navigation, skip preference, and quarter-sensitivity checks are recorded separately by the owning tasks.
