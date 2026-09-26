# Full-rate disk candidate and deployed baseline — 24 September 2026

This follow-up tests the first production build with a direct, per-frame disk
shader, fixed initial resolution and cached BasicShadowMap lighting. It predates
subsequent fine texture/framing edits. The earlier throttled-disk measurements
remain preserved in `2026-09-24-orbital-performance.json` and its report.

Only a diagnostic script and evidence files changed in this task. The deployed
site was read and its instrument navigation exercised; no wallet, transaction,
form submission or live deployment occurred.

## Conditions

Both runs used isolated headless Chromium, normal motion, a 1440 × 1000 viewport,
device scale 1, and the same **ANGLE / Vulkan SwiftShader** software renderer.
Browsers ran sequentially and were closed afterward. These measurements describe
this software environment, not the user's physical GPU or visible browser.

The candidate's canvas drawing buffer remained **1152 × 732** throughout. The
live site's buffer remained **1440 × 1000**. The prior local implementation had
adapted down to **648 × 412**. Consequently, equal viewport sizes do not make
these an equal-resolution renderer benchmark.

Instrumentation records actual WebGL draws, animation callbacks, program links,
shader compilation calls, blocking shader status/log queries, buffer sizes and
browser long tasks. CPU submission timings are not GPU execution durations.

## Measured normal motion

| Phase | Candidate scene FPS | Deployed scene FPS | Candidate median / P95 interval | Live median / P95 interval |
| --- | ---: | ---: | --- | --- |
| Ambient | 11.47 | 8.64 | 83.3 / 100.1 ms | 116.7 / 133.4 ms |
| Pointer orbit | 11.74 | 8.56 | 83.3 / 116.7 ms | 116.6 / 133.4 ms |
| Module selection | 9.27 | 6.50 | 100.0 / 183.4 ms | 150.0 / 233.2 ms |
| Settled final control | 13.65 | 7.49 | 66.7 / 100.0 ms | 133.3 / 150.0 ms |

The candidate renders **one disk draw for every scene frame**: for example, 69/69
ambient frames, 55/55 pointer-orbit frames and 82/82 final control frames. The
independent 4/10 Hz disk update limit is gone. The world-space foreground gas
plane is also drawn every frame. This establishes temporal coupling to the scene;
it does **not** establish smoothness at these measured overall frame rates.

The candidate submits about **35 ordinary geometry + 1 star + 1 disk + 1 gas-plane**
draws per frame. Its cached shadow work averages roughly 7–9 additional draws per
frame, instead of 19 every frame in the prior local build. Minor geometry-count
variation comes from view-dependent culling as the station turns. The deployed
site submits **311 ordinary geometry + 1 star + 1 disk** draws each frame.

Typical candidate callback CPU time remained only **1.5–1.9 ms**, compared with
approximately **3.5–4.0 ms** for the deployed scene. The remainder of the much
longer frame interval cannot be called JavaScript rendering time; software
rasterization/compositing and queued graphics work remain material constraints.

## Drawer backdrop-filter ablation

Only the isolated page's CSS backdrop filters were temporarily disabled, then
restored. Application files were untouched.

| Drawer condition | Candidate FPS | Deployed FPS |
| --- | ---: | ---: |
| Normal blur | 12.32 | 7.16 |
| Backdrop filter disabled | 15.81 | 7.66 |
| Blur restored | 13.10 | 7.02 |

The restored phase also includes its final close transition and a 1.6-second
settling interval; it is a bracketing check, not an exact stationary A/B/A repeat.
The local no-blur sample was 28% faster than the initial blurred sample and 21%
faster than that restored bracket. This supports removing the large live blur
from the local drawer in favor of its existing nearly opaque dark surface.
The geometry/camera continues moving throughout these short samples, so an exact
universal percentage should not be inferred.

The diagnostic script now separates `drawer-close` for future samples to avoid
mixing that transition with the restored-blur phase.

## Shader/stall confirmation

The candidate linked **14 programs, all during startup**. No program compilation
or linking occurred in the measured ambient, drag, module selection or drawer
phases, and no long task was recorded after startup. Its buffer did not change
size. This confirms that the previous mid-interaction quality-switch mechanism
and associated repeated buffer changes are absent from this candidate.

However, startup still contains a concrete visible-transition risk:

- Initial programs are linked during the first render.
- The next animated shadow update links two more `MeshDepthMaterial` variants.
- The animation callback beginning at 1211.2 ms runs for **1140.4 ms**.
- Inside it, `getProgramParameter` blocks for **1040.3 ms**.

Thus, calling the scene ready after only the first render can still expose a
one-second freeze in the first animated shadow frame. This is an observed shader
status wait, not merely an inference from a long-task timestamp. Warm the second
shadow update before removing the arrival poster / starting the flight clock, or
prepare those variants asynchronously. Do not say that the entire first-visible
flight is stall-free until this is checked again.

The live site linked 11 programs during startup and none in later measurement
phases. Its startup had an 1816 ms browser long task; that total is not attributed
solely to shader work.

## Next bounded fixes supported by evidence

1. Preserve per-frame disk motion and the fixed presentation path.
2. Complete shadow variant preparation before declaring the first flight ready.
3. Remove the drawer's expensive backdrop filter; its dark background already
   supplies separation and readability.
4. Recheck actual displayed-browser performance. Neither the candidate's 11–14
   software-rendered FPS nor the deployed site's 7–9 FPS supports a smoothness
   claim on its own. Do not reinstate a 4 Hz disk cache to raise an FPS counter.

## Evidence and reproduction

- `scripts/profile-orbital-scene.mjs`
- `docs/verification/2026-09-24-orbital-performance-candidate.json`
- `docs/verification/2026-09-24-orbital-performance-live.json`

Run with `PROFILE_FOLLOWUP=1`, supplying a URL and a new output filename to retain
past measurements. The live comparison used `https://agyionlabs.dev/app/`.
