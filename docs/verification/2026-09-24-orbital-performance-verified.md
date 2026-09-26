# Frozen build: normal-motion performance verification

Measured at 16:29 UTC on 2026-09-24 against `http://127.0.0.1:4192/app/`, after the Lambert hull, escape climb, critical-curve mask, contrast, context restoration and transparent-gas corrections were built. [Raw measurement](./2026-09-24-orbital-performance-verified.json). Earlier measurements are preserved separately.

The isolated Chromium session used a 1440 × 1000 viewport, device scale factor 1 and normal motion. Its renderer was ANGLE / SwiftShader. No physical GPU was available; these results describe this software renderer and do not establish the user's hardware performance or visual approval.

| Phase | Duration | Scene FPS | Frame interval median / P95 | Callback CPU median / P95 |
| --- | ---: | ---: | ---: | ---: |
| Ambient | 5.02 s | 16.94 | 66.6 / 83.3 ms | 1.6 / 1.9 ms |
| Drag | 3.08 s | 16.58 | 66.6 / 83.4 ms | 1.5 / 1.8 ms |
| Module opening | 1.44 s | 9.73 | 83.3 / 283.4 ms | 1.4 / 2.3 ms |
| Settled drawer | 3.00 s | 15.64 | 66.6 / 83.4 ms | 1.4 / 1.6 ms |

The screen buffer remained **1440 × 916**. Stars, black hole and gas used a fixed **576 × 366** framebuffer. Every measured scene frame submitted exactly one disk draw and one gas-plane draw: the disk/frame ratio was **1.0** throughout all four phases. Submission count was **28 draws/frame**, including the presentation quad, with no shadow draws.

Readiness appeared at **1,173 ms**. Startup long tasks lasted **64, 57, 110 and 833 ms**, all ending before readiness. All **11** shader programs linked before readiness; the largest recorded blocking shader query was **24.7 ms**, and the largest startup animation callback was **3.6 ms**. No subsequent shader work, main-thread long tasks or browser errors were recorded.

This confirms that the former independently stepping disk and late shader compilation stall did not recur in the sample. It does **not** demonstrate smooth software rendering: throughput remains below 30 FPS, and opening a module still includes a large frame gap without a corresponding main-thread long task. Callback timings are JavaScript submission time, not GPU execution time. The short samples are diagnostic observations, not a statistically controlled benchmark.

Immediately before this profile, the normal-motion desktop/mobile walkthrough completed all **15 screenshots** with no console errors, page errors or failed requests. Its result is [walkthrough.json](../../artifacts/verification/film-flight/walkthrough.json). That functional result is separate from performance and visual quality.

```sh
PROFILE_QUICK=1 node scripts/profile-orbital-scene.mjs http://127.0.0.1:4192/app/ docs/verification/2026-09-24-orbital-performance-verified.json
```

The profiling browser closed normally after the measurement. A later CSS-only correction feathers the heading scrim edges; that CSS revision was not part of this performance sample. No later shader or scene change is covered by this report.
