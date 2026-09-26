# Orbital motion diagnosis — 24 September 2026

This is a performance diagnosis, not visual approval or evidence that the scene is smooth.
No application source or live site was changed. The measurements below came from the
production-config local preview at `http://127.0.0.1:4192/app/`.

## Method and limits

One isolated headless Chromium ran sequential phases at 1440 × 1000, device scale 1,
with normal motion enabled. Its renderer was **ANGLE / Vulkan SwiftShader Device
(Subzero)**. These are software-renderer numbers, not measurements of a user's
physical GPU. The app canvas initially measured 1440 × 916.

The diagnostic wraps animation callbacks and WebGL program/draw submissions. It
records real scene frame intervals, callback CPU duration, shader categories,
disk-update timestamps, drawing-buffer changes and browser long tasks. Submission
CPU timings are **not GPU execution timings**; commands are asynchronous. A timer-query
extension is exposed, but this run did not use it to claim GPU durations.

Ablations suppress only selected WebGL draw calls inside the isolated diagnostic
page. They intentionally alter its rendered image, so they are cost comparisons,
not candidate designs. The app/source/assets remain unchanged. The same camera
composition was used for the steady control and ablations. Ring rotation continues;
these short sequential samples are not an exhaustive hardware benchmark.

Reproduction: `node scripts/profile-orbital-scene.mjs`. Raw sample data is in
`docs/verification/2026-09-24-orbital-performance.json`. No live comparison was run:
the browser was closed to avoid contending with the separate film-reference review.

## Measurements

| Phase | Scene frames/s | Median frame interval | P95 interval | Median callback CPU | Disk update interval, median |
| --- | ---: | ---: | ---: | ---: | ---: |
| Initial ambient, including adaptation | 9.1 | 66.6 ms | 350.0 ms | 1.7 ms | 283.6 ms |
| Pointer orbit | 17.7 | 50.1 ms | 83.2 ms | 2.0 ms | 278.8 ms |
| Three module selections and drawer movement | 11.4 | 83.3 ms | 149.9 ms | 2.3 ms | 300.8 ms |
| Settled ambient control | 17.5 | 50.1 ms | 83.2 ms | 1.7 ms | 284.4 ms |
| Suppress disk shader draws | 19.0 | 50.0 ms | 66.7 ms | 1.9 ms | — |
| Suppress shadow draws | 25.2 | 33.4 ms | 66.6 ms | 1.1 ms | 268.8 ms |
| Suppress bloom draws | 17.8 | 50.0 ms | 83.3 ms | 1.9 ms | 278.1 ms |
| Suppress disk and shadow draws | 27.0 | 33.4 ms | 50.0 ms | 0.9 ms | — |

After adaptation, every rendered scene frame still submits **19 shadow draws +
36 geometry draws + 1 star draw**, plus a disk draw approximately every 0.28 seconds.
Before low-power adaptation, the compositor adds two bloom passes and one composite
pass. Bloom was already bypassed throughout the settled measurements, so the bloom
ablation does not measure its full-quality cost.

The drawing buffer reduced three times: 1440 × 916 → 1080 × 687 → 810 × 515 →
648 × 412. This sacrifices substantial detail without reaching a smooth frame rate
in this software-rendered run.

## Causes supported by this sample

1. **The black-hole material has a separate, visibly low temporal rate.** Its
   cached image changed only about 3.5 times per second after adaptation, although
   the camera rendered about 17.5 frames per second. `diskInterval = .25` guarantees
   this discontinuity even on a faster display loop once the fallback activates.
   The original `.1` interval also caps material motion near 10 updates per second.
   Fixing camera damping cannot make that cached texture's motion continuous.

2. **Remaining whole-scene cost is not chiefly the cached disk shader.** Suppressing
   disk work improved the settled rate from 17.5 to 19.0 frames/s (~9%). Suppressing
   shadow draws improved it to 25.2 (~44%). Removing both reached 27.0 (~54%). The
   normal animation callback's median CPU duration was only 1.7–2.3 ms. This points
   to WebGL/software-raster/compositing work rather than expensive React rendering
   as the main steady bottleneck. No physical-GPU throughput conclusion is implied.

3. **Quality adaptation itself introduces freezes.** A 1069 ms browser long task
   overlaps the first downgrade; later downgrades overlap 121 ms and 120 ms long
   tasks. Source inspection shows that `setLowPower(true)` changes the render path
   from a linear offscreen target to the default framebuffer. Three consequently
   needs different tone-mapping/output-color shader variants for the scene
   materials. Compilation is a strong candidate for the first freeze; the current
   sample establishes the timing correlation, not an individual compile duration.
   Subsequent buffer resizing/allocation is also synchronous work in this path.

4. **Module/drawer movement deserves a separate compositing check.** It slowed to
   11.4 frames/s without additional geometry draw calls. The drawer has a large
   `backdrop-filter: blur(22px)` area. This is a plausible additional cost but was
   not isolated in this run; do not present it as a proven cause yet.

The frame immediately following a disk draw was not systematically slower in the
settled control (53.2 ms mean versus 57.8 ms without one). That reinforces the
separation between low-frequency disk stepping and the broader frame-rate limit.

## Smallest architectural correction to try

Keep the precomputed ray/lens lookup and the detailed station. Change the disk's
**material representation**, rather than repeatedly reducing the entire world's
resolution: precompute its expensive turbulent noise into a texture, then animate
its sampling and the inclination-dependent lens projection on every rendered
frame. The existing full-image 4/10 Hz cache should not be the clock for visible
material movement. This retains the black-hole construction while removing an
explicit source of stop-motion behavior.

For the software-renderer path, remove or replace the per-frame PCF shadow work
with a cheaper shading/AO treatment; it costs more here than the throttled disk.
This is a targeted lighting fallback, not a reason to strip the station model or
freeze the disk. The visual result still requires inspection.

Keep one presentation pipeline during interaction. Skip the bloom calculation or
set its contribution to zero without moving every scene material between linear
render-target and display-framebuffer shader variants. Alternatively precompile
both variants before presenting the first interactive frame. Avoid repeating
large buffer changes mid-flight.

Re-profile normal motion and actual camera input after each bounded change, on the
same renderer and then on the actual displayed browser. Do not infer smoothness
from reduced-motion screenshots, unit tests, or successful page loading.
