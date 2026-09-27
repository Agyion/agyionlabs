# Orbital input sensitivity verification

Date: 2026-09-27. Local assembled preview: `http://127.0.0.1:4292`.

## Outcome and limits

All six browser behavior cases passed. Desktop mouse, mobile trusted touch, reset, and keyboard controls matched their expected camera angles. The mobile app's vertical touch measurement also passed. Both mobile landing modes preserved native page scrolling.

The raw report remains **FAILED** because one external request to `https://soroban-testnet.stellar.org/` returned `net::ERR_NETWORK_CHANGED` in the mobile reduced-motion app case. This produced one request failure and one console error. There were no page errors and no failed input assertions in the completed run. Requests were not suppressed or stubbed, and the external diagnostic was not removed. This verification does not establish testnet availability.

Headless Chromium used SwiftShader. These results establish input behavior and rendered camera angles, not native phone GPU performance or perceptual smoothness. No deployment was performed.

## Sensitivity

A new shared `dragSensitivity: .25` scales horizontal and vertical pointer travel once. The existing per-mode horizontal factor remains unchanged:

| Axis | Previous coefficient | New coefficient |
| --- | ---: | ---: |
| Landing horizontal | 1 | .25 |
| App horizontal | .25 | .0625 |
| App and mouse vertical | 1 | .25 |

Landing vertical touch remains native page scrolling. Pinch, wheel zoom, keyboard increments, and passive hover aim retain their existing sensitivity. The camera retains its existing damping; there is no added flick acceleration. The initial six-pixel drag threshold now counts physical travel consistently across coalesced and separately sampled pointer events.

## Measured horizontal travel

Angles below are radians. The measurement observes the fixed star object's WebGL model-view matrix without changing scene data, application time, uniforms, or rendering. Its inverse gives the actual camera position around the settled landing pivot (`z=0`) or app pivot (`z=60`). Mobile landing deliberately aims to the right of its orbit center, so view-direction yaw alone would not correctly measure orbit yaw.

| Case | Drag pixels | Expected angle | Measured angle | Absolute error |
| --- | ---: | ---: | ---: | ---: |
| desktop-reduced-landing | 120 | 0.1308996939 | 0.1308996924 | 0.0000000015 |
| desktop-reduced-app | 120 | 0.0327249235 | 0.0327249203 | 0.0000000032 |
| mobile-reduced-landing | 160 | 0.6444292623 | 0.6444292575 | 0.0000000048 |
| mobile-reduced-app | 160 | 0.1611073156 | 0.1611072905 | 0.0000000250 |
| mobile-normal-landing | 160 | 0.6444292623 | 0.6444268347 | 0.0000024276 |
| mobile-normal-app | 160 | 0.1611073156 | 0.1611030317 | 0.0000042839 |

All six cases also verified Home reset and the unchanged `.07` radian ArrowRight step. The app-to-landing horizontal gain ratio remained `.25` in each matched mode.

## Mobile vertical travel

The app received a real CDP touch gesture, observed by browser events with `isTrusted=true`. For `-96` pixels at a height of 844 pixels:

- Expected pitch: `-0.089334388254` radians.
- Measured pitch: `-0.089334390986` radians.
- Incidental yaw change: `-0.000000006520` radians.
- No page scroll or pointer cancellation occurred; app touch action remained `none`.

This exact pitch check used reduced motion to isolate the input gain from ambient spacecraft movement. Normal-motion mobile horizontal checks ran separately.

## Landing native scroll

- `mobile-reduced-landing`: page moved from `0` to `81` px; maximum camera rotation-matrix component change `0.000000000000`. A trusted `pointercancel` confirmed that the browser took over the vertical gesture.
- `mobile-normal-landing`: page moved from `0` to `81` px; maximum camera rotation-matrix component change `0.000012397766`. A trusted `pointercancel` confirmed that the browser took over the vertical gesture.

Both cases retained `touch-action: pan-y`; horizontal drags did not scroll the page.

## Evidence

- Harness: `scripts/verify-orbit-sensitivity.mjs`.
- Original report, including the external failure: `artifacts/verification/2026-09-27-orbit-sensitivity/results.json`.
- Eight horizontal/native-scroll screenshots and one app vertical screenshot are in the same artifact directory.
- Focused input, hover, and scene tests: 59 passed in the input subtask. Final repository suite results are recorded separately by the coordinating task.

An earlier harness attempt assumed mobile view-direction yaw equaled orbit yaw. It failed on the mobile landing's existing shifted look target. The final harness corrected the measurement using the inverse view transform; no runtime change was made to accommodate that test.

Maintenance also replaced obsolete app `Instruments` close actions in the pointer harness and removed obsolete follow-up `Instruments` clicks after `Close instrument` in the flight walkthrough scripts. Landing navigation links were preserved.
