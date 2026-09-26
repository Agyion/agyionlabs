# Deployed camera reference — source evidence

Inspected 2026-09-24, read-only. The user rejected the local interactive-flight
revision and specifically asked for the **camera to travel toward a physical
instrument bay**, rather than rotating the spacecraft to present that bay.
This note records behavior and implementation evidence, not design approval.

## Sources and verification boundary

- Deployed page: <https://agyionlabs.dev/app/>
- Current page script: <https://agyionlabs.dev/app/assets/index-BmE_9oFi.js>
- Freshly fetched script matches the previously inspected copy byte for byte:
  SHA-256 `038964e3611a8e8bb93b5abff14541615a46345bd1b79ed985a8536a8047ba6d`.
- The bundle identifies `src/scene/OrbitalScene.tsx`, `src/pages/Home.tsx`,
  `src/components/chrome.tsx`. Its scene ref exposes `dock`, `focusModule`,
  `setCamMode`, and `scrubTo`.
- Earlier same-day browser inspection of this identical asset confirmed actual
  orbit/zoom and a camera move when selecting Pod. Evidence:
  [orbit](../../artifacts/verification/live-interaction-drag.png),
  [zoom](../../artifacts/verification/live-interaction-zoom.png),
  [Pod selection](../../artifacts/verification/live-interaction-pod.png).
  This source-focused pass did not start another GPU/browser run or use a wallet.

## Physical coordinates and scale

The station root is at `(0, 0, 0)` with identity transform and scale 1. The ring
lies in the XY plane, has radius **12**, and contains **12** modules. At slot `s`,
`theta = s / 12 * 2π`; the module position is `(12 cos(theta), 12 sin(theta), 0)`.
Module Euler rotation is `x = 0.09`, `z = theta + π/2`. The main hull box measures
`4.55 × 1.95 × 1.9`; the central hub has radius `1.5` and axial length `4.6`.

| Instrument | Physical slot | Initial slot angle |
| --- | ---: | ---: |
| Fade | 0 | 0° |
| Pod | 2 | 60° |
| Trigger | 4 | 120° |
| Envoy | 6 | 180° |
| Ramp | 8 | 240° |
| Ledger | 10 | 300° |

Each instrument owns an `Object3D` anchor at module-local `(0, 1.35, 0)`, inside
the module hierarchy. The camera reads `anchor.getWorldPosition()` every frame;
it does not target a screen-space label. Labels sit at local `(0, 3.1, 0)` and
are distinct from the camera anchors.

Ambient ring spin is `ring.rotation.z = time * 2π / 60` (one revolution per
minute). A separate shuttle group counter-rotates by the negative angle; the
shuttle itself is offset `z = 4.9` with small sinusoidal bob/roll. Selecting a
module also brightens its indicators, but that is separate from camera targeting.

The black hole remains at world `(-34, 26, -430)`, shadow radius **84**. The
planet is at `(300, -170, -260)`, radius **34**. The black-hole shader receives
the actual camera world matrix, inverse projection, and camera position each
frame, so its screen position changes with camera motion.

## Exact camera construction

The perspective camera has **52° vertical FOV**, near `0.1`, far `4000`.
For a selected bay's current world anchor `a`:

```text
outward = normalize(vec3(a.x, a.y, 0))
cameraGoal = a + outward * 28 + vec3(0, 7.5, 19)
lookGoal = a
```

Relative to ring radius, these offsets are `2.333R` outward, `0.625R` upward,
and `1.583R` in front. Reusing the literal 28/7.5/19 values with the much smaller
local model would be incorrect. Recompute using that model's radius and world
anchors, or consistently rescale the entire world.

At ring phase zero, exact transforms produce these reference poses (rounded):

| Instrument | Look target | Camera goal |
| --- | --- | --- |
| Fade | `(10.650, 0, 0)` | `(38.650, 7.500, 19.000)` |
| Pod | `(5.325, 9.228, -0.105)` | `(19.320, 40.980, 18.895)` |
| Trigger | `(-5.325, 9.228, -0.105)` | `(-19.320, 40.980, 18.895)` |
| Envoy | `(-10.650, 0, 0)` | `(-38.650, 7.500, 19.000)` |
| Ramp | `(-5.325, -9.228, 0.105)` | `(-19.320, -25.980, 19.105)` |
| Ledger | `(5.325, -9.228, 0.105)` | `(19.320, -25.980, 19.105)` |

These are construction references, not fixed live poses: the anchors keep moving
with ambient spin. On every frame, with `dt = min(realDeltaSeconds, 0.05)`,
`alpha = 1 - pow(0.0001, dt)`; camera position lerps toward its goal by
`alpha * 0.45`, and the look target by `alpha * 0.55`. The camera then calls
`lookAt(smoothedLookTarget)`. During docking those lerp factors are 1 because the
approach curve already supplies eased positions.

## Approach, instrument selection, and a coupling to avoid

- Docking lasts **8 real seconds**. Its open, centripetal `CatmullRomCurve3`
  control points are `(6,6,170)`, `(-14,10,110)`, `(18,6,62)`, then Fade's moving
  camera goal. The final point is recomputed each frame. Path progress uses cubic
  ease-in-out: `4p³` below 0.5, otherwise `1 - (-2p + 2)³ / 2`.
- Look target blends from world origin to Fade's moving anchor using
  `smoothstep(min(1, easedProgress * 1.5))`. While eased progress is below 0.3,
  x/y position gets random jitter sampled as
  `(random() - 0.5) * (1 - easedProgress / 0.3) * 0.35`.
- Guided orbit has a **600-second sweep**, six **100-second** segments. Segment
  progress `f` is remapped through `smoothstep(clamp(f * 1.15, 0, 1))`; both
  camera and look goals interpolate between the current and next bay's world
  anchor-derived poses.
- `focusModule(id)` selects guided mode and sets the shared clock to
  `L = index * 100 + 5`. Thus its initial guided goal is about 0.954% of the way
  from the chosen bay toward the next bay. Both a dock button and a physical bay
  click call this method and open the matching right-side console.
- **Do not copy the clock coupling:** the same `L` drives ring rotation and
  shader time. Changing `L` on selection can abruptly change ship orientation
  and other ambient phases. This is a source-level flaw in the live reference,
  even though its moving camera/physical-anchor interaction is useful. The new
  implementation should keep ambient spin continuous and select a new camera
  goal independently. Do not rotate the ring to a selected presentation angle.

## Direct manipulation

Dragging more than 8 accumulated pixels switches from guided mode to free orbit,
initialized from the current smoothed camera position. Horizontal movement changes
azimuth by `-dx * 0.0042`; vertical movement changes polar angle by `-dy * 0.0042`,
clamped to `[0.2, π - 0.2]`. Free orbit looks at world origin. Its initial stored
spherical state is `theta = 0.7`, `phi = 1.15`, radius `42`; wheel changes radius
by `deltaY * 0.03`, clamped to `[26,120]`, only in free mode. A release with less
than 6 accumulated pixels raycasts the station hierarchy and selects the first
ancestor carrying `userData.moduleId`. This physical picking behavior should be
preserved while keeping form/UI pointer events out of the camera controller.
