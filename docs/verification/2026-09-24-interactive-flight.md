# Interactive flight revision — local work

The user explicitly rejected the passive scene and Pause motion UI. Their brief
is an interactive world: distant landing, a launch toward Endurance escaping the
black hole, camera movement for instrument choices, and smooth connected UI.
This instruction authorizes implementation, not a claim of design approval.

## Observed baseline

The deployed app was inspected read-only. It supports an eight-second approach,
free orbit on drag, wheel zoom, physical module raycasts, camera movement toward
a selected bay, and a right-side console. The previous local hero lost those
interactions. No live wallet or form was used in that inspection.

## Implemented

- Distant landing scene; Launch app runs a finite 1.5s approach and transfers the
  final frame and validated camera/rotation phase to the app, which continues a
  3.2s escape composition. Shader preparation does not consume that flight time.
- Fullscreen app world with compact dock and a right-side console; mobile uses
  a scrollable bottom sheet. Closing the console preserves unsent form values.
- Direct pointer drag, bounded wheel zoom, touch orbit/pinch, focused keyboard
  controls, double-click/Home reset, and physical bay raycasts.
- Instrument selection moves the camera, turns the station and lights its bay.
  The panel opens with the movement; closing shifts framing back into space.
  Reframing after full manual revolutions uses the nearest equivalent angle.
- Landing Instruments moves the camera and smoothly reveals the section.
- Pause motion UI removed. OS reduced-motion preference still stops ambient
  movement, while deliberate camera input works without interpolated motion.
- Disk illumination is cached separately from camera rendering. Persistently
  slow devices lower buffer resolution and omit postprocess bloom; vertical
  camera input does not bypass the disk refresh budget. Tiny bay lamps no longer
  each add a shadow draw. No FPS claim is inferred from software-rendered checks.
- Modified links/new tabs stay native; unavailable WebGL/shaders retain controls;
  the launch timeout and optional frame storage cannot block navigation.

## Verification

Unit checks: 170 app tests and 28 landing tests passed. Both production builds,
TypeScript/lint checks, and generated combined-site CSP assembly passed.

Final production-preview browser checks: all 13 app scenarios and 24 landing
checks passed after the pose-continuity, performance and mobile framing changes.
The desktop/mobile visual script passed with zero runtime/console errors and no
horizontal overflow. Screenshots show the fullscreen scene and open console;
the mobile console leaves the smaller station visible above the instrument dock.

Evidence: `artifacts/verification/app-orbit-desktop.png`, `app-desktop.png`,
`app-orbit-mobile.png`, `app-mobile.png`, and `interactive-landing/results.json`.

The interaction assertions compare actual canvas pixels for drag, wheel, focused
keyboard camera control and instrument reframing. They also cover all six panels,
draft retention, mobile widths, keyboard navigation, native modified links,
finite launch, WebGL/shader failure fallbacks, wallet-picker UI, CSP and missing
asset responses. No wallet was connected and no live transaction was submitted.

No production deployment, git push or chain operation is part of this revision.
The security/migration boundaries in the main audit remain in force.
