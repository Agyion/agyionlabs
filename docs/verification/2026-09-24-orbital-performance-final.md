# Final candidate: normal-motion software rendering profile

Measured on 2026-09-24 at 16:07 UTC against the production preview at `http://127.0.0.1:4192/app/`. Raw evidence: [2026-09-24-orbital-performance-final.json](./2026-09-24-orbital-performance-final.json). Previous samples are preserved separately.

The isolated headless Chromium session used a 1440 × 1000 viewport, device scale factor 1, and normal motion. Chromium reported ANGLE / SwiftShader, not a physical GPU. This is a software rendering diagnostic; it does not establish performance on the user's hardware or constitute visual approval. The browser closed after the sample.

| Phase | Duration | Scene frames / second | Frame interval median / P95 | Callback CPU median / P95 |
| --- | ---: | ---: | ---: | ---: |
| Ambient | 5.02 s | 17.73 | 50.0 / 83.4 ms | 1.1 / 1.8 ms |
| Drag | 3.02 s | 17.87 | 50.0 / 83.4 ms | 1.4 / 1.8 ms |
| Module opening | 1.43 s | 11.15 | 66.7 / 350.0 ms | 1.4 / 2.4 ms |
| Settled drawer | 3.00 s | 14.98 | 66.7 / 83.4 ms | 1.3 / 1.6 ms |

The main drawing buffer stayed at **1440 × 916**. Framebuffer and viewport instrumentation confirms stars, black-hole disk and gas plane rendered to a fixed **576 × 366** target; geometry and the presentation quad rendered to the full-size screen buffer. There were no resolution changes during the sample.

Every measured scene frame submitted one disk draw and one gas-plane draw. The disk-to-frame ratio was exactly **1.0** in ambient, drag, opening and drawer phases, so this build has no separate low-frequency disk update schedule. Total submission count was **28 draws per frame**: 25 categorized as geometry (including the presentation quad), one star draw, one disk draw and one gas-plane draw. No shadow draws occurred.

Readiness was observed at **1,035 ms** after navigation. Three startup long tasks lasted **52, 125 and 700 ms**, all ending before readiness. Eleven shader programs linked during startup; the largest observed blocking shader query was **18.5 ms**. The largest recorded startup animation callback took **5.2 ms**. No shader compilation, shader blocking calls over the instrument's 0.5 ms threshold, or long tasks were recorded in the ambient, drag, opening or settled drawer phases. The previous approximately one-second late shadow shader stall did not recur in this sample. No browser errors were recorded.

Compared with the preceding software DPR 0.55 sample, scene geometry now uses the full-size buffer while the background remains inexpensive, and submission count falls from 38 to 28 draws per frame. Ambient and drag throughput is similar (previously 17.54 and 16.80 FPS); the run does not show a 30/60 FPS result. The short opening phase still contains a large frame gap without a matching main-thread long task or shader compilation event. These measurements support removal of the independently stepping disk and the late compilation stall, but **do not support a claim that the software-rendered experience is smooth**.

Reproduction:

```sh
PROFILE_QUICK=1 node scripts/profile-orbital-scene.mjs http://127.0.0.1:4192/app/ docs/verification/2026-09-24-orbital-performance-final.json
```

The measured build precedes the root agent's later native-MSAA detection and transfer-distance compensation edits. Those edits were not measured here. Full walkthrough and visual inspection remain separate checks.
