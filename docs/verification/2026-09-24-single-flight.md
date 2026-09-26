# One complete landing-to-station journey

This is a local source correction. No production deployment or visual acceptance is claimed.

## Why the prior connection stopped

The previous landing renderer eased to radius 190 over 3.6 seconds and then froze.
Its frame correctly bridged document loading, but that freeze occurred halfway
through the intended trip. App startup then waited for graphics preparation and
a 450 ms cover reveal before running a separate eased 6.2 second approach. Landing
also applied smoothstep twice. An exact matching frame did not remove the two
distinct acceleration/deceleration cycles or the intervening loading pause.

## Current journey and endpoint

`LAUNCH_DURATION_MS` is 9800 ms, preserving the previous total travel duration.
The entire camera journey now runs on the already prepared landing renderer.
`sampleLaunchFlight` uses one smoothstep clock and a logarithmic camera radius,
starting from the actual landing exploration distance and finishing at the free
app overview. Yaw, pitch, mobile target offset and spacecraft escape share that
clock. There is no intermediate camera endpoint or restart at 3.6 seconds.

At completion the ship is at (0, 120, 60), plus its continuous small ambient bob;
its scale stays 1 and base rotation stays (.32, -.42, -.2). The camera is 19 world units
from that pivot on desktop and 22.42 on a portrait viewport, with yaw 0, pitch .16,
roll .07. The clock and independent ring phase are captured with the final frame.
The new document restores those values without starting an approach animation.

Navigation occurs only after this final destination is rendered. The existing
validated image bridge can therefore hold at a completed destination during
loading; it no longer pauses in the middle of the route. Controls reveal after
the app renderer is ready and React has committed its ready state. The optional
poster fades for 450 ms, with the restored world clock held during that reveal.
This is not a claim that separate documents load without delay or that software
graphics run at a smooth frame rate.

The generic Launch app link performs this trip. An explicit `/app/?tab=pod`
or other `tab` link keeps native navigation directly to its requested workspace.
Modified/new-tab links, reduced motion and an unavailable renderer also retain
their direct navigation behavior. Existing navigation watchdogs and the 8 second
cover fail-open remain bounded. Back-forward restoration resets the landing
flight state.

## Storage and compatibility

New paired markers carry `settled:true`. Missing image data or unavailable pose
storage cannot turn such a marker into a second app flight. Existing fresh
markers without that flag keep the prior bounded arrival behavior; all markers
expire after 30 seconds and are consumed once. Images still require a matching
same-tab marker and a validated WebP/PNG data URL. CSP and the pre-hydration
bridge script are unchanged. No iframe or additional dependency was introduced.

## Pointer and dock integration

The shared PointerAim helper provides a small damped fine-mouse response in a
free view. Its offsets are composed separately from saved orbit values, and it
is disabled during flight, module focus, an open workspace, and reduced motion.
The dock's `agyion:instrument-preview` event calls `previewInstrument`; it only
illuminates physical bay indicators and their thin edge outlines. Dock preview and canvas raycast hover have
separate state, so one cannot accidentally clear the other. Preview does not
select a module, move the camera, alter the URL or cancel a legacy arrival.

## Source regression checks

- 73 focused app tests passed across flight scene, handoff storage, backdrop,
  module camera, pointer aim and orbit input.
- The actual Three scene is sampled with a stub renderer. Camera velocity
  remains nonzero and changes continuously through 2.8–6 seconds, covering both
  the former 3.6 second boundary and the new journey midpoint.
- Desktop 1440×900 and portrait 390×844 tests compare the final landing and first
  app camera position/quaternion and spacecraft/ring world matrices to 1e-10.
  They also confirm that the app does not travel again after its cover reveals.
- Slow graphics tests keep the bridge through image load and the imperative
  readiness callback, removing it only after React commits. Existing failure,
  expired storage, reduced-motion, pause/context and legacy interruption checks
  remain in the targeted suites.
- App TypeScript passed. The coordinated final app and landing builds passed
  before the browser runs below.

## Browser and actual frame review

The combined candidate at `http://127.0.0.1:4192` was initially recorded sequentially
with software Chromium on desktop 1440×1000 and mobile 390×844. Each run delayed
the first seven app scripts by 1.5 seconds to exercise the image bridge.

| Check | Desktop | Initial mobile recording |
| --- | --- | --- |
| Navigation after complete journey | 10.675 seconds | 10.267 seconds |
| Still moving in landing at former 3.6 second boundary | Passed | Passed |
| Settled marker, matching stored image, matching full-viewport bounds | Passed | Passed |
| Cover held until renderer readiness | Passed | Passed |
| App ready and interactive timestamps | 3146 ms / 3146 ms | 2909.9 ms / 2909.9 ms |
| No second app approach | Passed | Passed |
| Page errors / CSP errors | 0 / 0 | 0 / 0 |
| Console / failed network requests | 2 / 2 | 0 / 0 |

Desktop drag, wheel, keyboard and module interruption checks also passed.
Its strict final error gate **failed** on two
`https://soroban-testnet.stellar.org/` requests reporting
`net::ERR_NETWORK_CHANGED`. Those errors were retained without filtering in
[the full desktop result](../../artifacts/verification/single-flight-final/verification.json).
The [mobile result](../../artifacts/verification/single-flight-final-mobile/verification.json)
passed with no page, console, network or CSP errors. These are browser results,
not a claim that the application has no bugs.

`scripts/inspect-flight-video.mjs` extracted 16 consecutive frames per 3.2 second
window from each actual video. The windows use an inferred wall-clock alignment
and include neighboring frames; the timing index documents that limitation.
Desktop frame review shows continuing travel through the former boundary and
the new midpoint. The final ship/hole geometry remains aligned as the held
destination frame gives way to the app controls; no second approach or prior
pre-ready UI flash appears in those frames.

- [Desktop former midpoint](../../artifacts/verification/single-flight-final/sequential-frames/01-former-midpoint.png)
- [Desktop current midpoint](../../artifacts/verification/single-flight-final/sequential-frames/02-journey-midpoint.png)
- [Desktop document handoff](../../artifacts/verification/single-flight-final/sequential-frames/03-navigation.png)
- [Desktop renderer reveal](../../artifacts/verification/single-flight-final/sequential-frames/04-ready-reveal.png)
- [Mobile current midpoint](../../artifacts/verification/single-flight-final-mobile/sequential-frames/02-journey-midpoint.png)
- [Mobile document handoff](../../artifacts/verification/single-flight-final-mobile/sequential-frames/03-navigation.png)
- [Mobile renderer reveal](../../artifacts/verification/single-flight-final-mobile/sequential-frames/04-ready-reveal.png)

**Visual issue found and corrected despite passing mobile assertions:** in the original mobile midpoint
frames the hole drops below the viewport for several seconds, leaving mostly
stars. The mobile look-target height decays linearly while the camera radius
shrinks logarithmically, temporarily aiming too far above the scene. This required
a framing correction despite the passing timing/storage checks.
The finding was reported before any further source change.

The correction multiplies portrait target lift by `distance / initialDistance`.
Three additional tests verify a continuously declining upward view angle from
both the default and explored landing views, while preserving the original
landing frame and exact portrait app endpoint.

After rebuilding both apps, the affected 390×844 journey was recorded again in
[single-flight-mobile-framing-final](../../artifacts/verification/single-flight-mobile-framing-final/verification.json).
This final mobile run passed every check with zero page, console, network and
CSP errors. Navigation took 10.215 seconds; renderer-ready and interactive
timestamps were both 2557.6 ms. Seven delayed scripts exercised the same cover
ordering and full-viewport handoff.

The corrected video frames were inspected at both midpoint windows, navigation
and renderer reveal. The hole and approaching ship remain in view throughout
those midpoint windows; the former stars-only detour is gone. The destination
frame remains aligned while the controls reveal, without another approach.

- [Corrected mobile former midpoint](../../artifacts/verification/single-flight-mobile-framing-final/sequential-frames/01-former-midpoint.png)
- [Corrected mobile current midpoint](../../artifacts/verification/single-flight-mobile-framing-final/sequential-frames/02-journey-midpoint.png)
- [Corrected mobile handoff](../../artifacts/verification/single-flight-mobile-framing-final/sequential-frames/03-navigation.png)
- [Corrected mobile renderer reveal](../../artifacts/verification/single-flight-mobile-framing-final/sequential-frames/04-ready-reveal.png)

Both browser processes were closed and the shared GPU slot released before the
CPU-only video extraction. The final destination is intentionally held during
document/renderer loading. This removes the midpoint stop, not the loading
interval itself, and these recordings do not establish 60 FPS or smooth GPU
performance.
