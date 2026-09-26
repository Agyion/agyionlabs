# Separate hero and instrument gallery — implementation plan

User approved the first proposed direction in chat: an unobstructed black-hole /
Endurance opening, natural scrolling into an opaque black/orange gallery,
four split names beside one animated mechanism, and visual continuity into the
existing detail pages. Execution is already authorized.

Existing display/body/mono typefaces remain. Palette: space #050609,
gallery #0c0d10, mechanism #0b0c0f, ivory #f1eee7, orange #ed9850, muted #aba69d.
The signature is a change of setting from open space to an instrument surface.
No scroll lock, decorative numbered cards or new dependency.

- [x] Replace Home overlays with normal hero and separate HomeInstrumentGallery.
  Four named controls, one active mechanism, Details/native app links; selection
  survives Back. Desktop left names/right stage; mobile stacks readably.
- [x] Add preview mode to InstrumentMechanism: explicitly local valid sample,
  play when visible, pause offscreen, complete once and offer Replay. Detail
  controls remain unchanged; rapid selection disposes the previous timeline.
- [x] App/Nav and ProductRouteLink support real #instruments anchors and
  progressive shared-title/stage transitions. Native modified links, reduced
  motion, Back/forward and dialog scroll/focus retain expected behavior.
- [x] Hide product meshes entirely. Pause hero outside viewport. Lift and resize
  the same renderer before departure from any scroll depth, preserving the
  9.8-second flight, explicit tab and paired frame bridge.
- [x] Verify 1440/768/390/320 layouts, scroll, direct old #instruments, previews,
  rapid selection/replay, reduced motion, dialog, detail Back and scrolled flight.
- [ ] Build combined artifact, inspect, publish authorized static frontend,
  verify live bytes/flows, document retained failures, commit and push.

Failure focus: viewport promotion before flight; duplicate transition names;
SVG timelines surviving unmount; hash/dialog scroll jumps; mobile clipping;
unchanged security/readiness gates. Root owns Home/gallery/preview/style;
independent agents own routing, flight lifecycle and browser checks.
