# Quick normal-motion profile: software quality 0.55

This sample checks the fixed production preview on port 4192 after the software
renderer path changed to a 0.55 drawing scale, disabled dynamic shadows and removed
the drawer backdrop blur. It is a short diagnostic, not visual approval or a
smoothness claim. Root continued editing later shader details separately; this
report applies to the built assets recorded in the JSON file.

One isolated Chromium ran with normal motion at a 1440 × 1000 viewport. Its GPU
identity was **ANGLE / Vulkan SwiftShader Device (Subzero)**. Root separately
confirmed that the default/native Chromium backend also exposes only SwiftShader;
physical-GPU performance is unavailable in this environment.

`PROFILE_QUICK=1` now runs startup capture, five seconds of ambient motion, three
seconds of pointer orbit, one instrument-opening transition and three seconds in
the settled drawer. No draw-call or CSS ablations run in quick mode. The browser
closed immediately after collecting the sample.

| Phase | Actual duration | Scene FPS | Median / P95 frame interval | Median callback CPU |
| --- | ---: | ---: | --- | ---: |
| Ambient | 5.02 s | 17.54 | 50.1 / 66.8 ms | 0.9 ms |
| Pointer orbit | 3.03 s | 16.80 | 66.6 / 66.8 ms | 1.5 ms |
| Open Pod transition | 1.43 s | 10.52 | 83.3 / 266.7 ms | 0.7 ms |
| Settled drawer | 3.00 s | 14.32 | 66.7 / 116.7 ms | 0.7 ms |

The drawing buffer remained **792 × 503** for the entire run. Each steady frame
submitted 35 ordinary geometry draws, one star draw, one black-hole disk draw and
one foreground gas-plane draw. **No shadow draws occurred.** The disk draw to scene
frame ratio was exactly **1.0** in every measured motion phase, including instrument
selection; the former independent 4 Hz disk stepping is absent.

No long task, shader compilation/linking or blocking shader query was recorded in
the measured ambient, drag, instrument-opening or drawer phases. The earlier
one-second shadow-variant wait did not recur. All ten linked programs appeared
during startup; the longest recorded blocking shader query was **38.5 ms**.

Startup still involved a 700 ms preparation long task before the ready marker.
The marker appeared at 1039.1 ms, followed by one 58 ms long task at 1058.2 ms.
The largest captured startup animation callback was 4.6 ms. Thus the evidence
supports removal of the earlier one-second animated shadow stall, not a claim that
initialization has zero cost. Startup also contains the immediate non-rAF render,
so its raw disk-draw/animation-frame count is 26/25; this is not a second material
clock.

The 0.55 candidate improves this software environment over the 0.8 candidate's
approximately 11–14 FPS, while preserving per-frame material motion. It still does
not reach 30 or 60 FPS in these samples. Its reduced resolution and lighting quality
also prevent interpreting the improvement as an equal-quality renderer benchmark.

Evidence: `docs/verification/2026-09-24-orbital-performance-software-055.json`.
The file records GPU identity, drawing-buffer dimensions, every sampled frame,
program/compile timing, long tasks, and the actual loaded script asset URLs.

Reproduce with:

```sh
PROFILE_QUICK=1 node scripts/profile-orbital-scene.mjs \
  http://127.0.0.1:4192/app/ \
  docs/verification/new-software-sample.json
```

Only the diagnostic script and this task's evidence files changed. No application
source or live deployment was edited by the profiling task.
