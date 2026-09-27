# Navigation and orbital controls

Local preview checkpoint for 27 September 2026, served at `http://127.0.0.1:4292/`.
This follows the examples and orbit preview, whose uncommitted changes remain intact.

## Changes

- Removed Overview and Instruments from the application header. The six instrument tabs, module picking, wallet controls, logo home link and Return to orbit/Escape remain.
- Removed the homepage header's duplicate Launch app. The hero launch and the launch links on other pages remain.
- Added a native Skip animation checkbox beside launch controls. The choice persists in local storage and is synchronized between tabs. If storage cannot be written, the current document keeps the explicit choice in memory. Skipping bypasses only the cinematic departure/arrival; ambient rendering remains interactive. Reduced motion still takes precedence.
- Skipping clears an old handoff before navigation. The application's head script and backdrop also reject any remaining saved flight when skip is enabled, preventing an old poster or a second approach from appearing. Link destinations, instrument query parameters and native modified clicks remain intact.
- Mouse and touch dragging now apply one quarter of the previous yaw and pitch gain. Landing horizontal gain changes from 1 to .25; the app's existing .25 gain becomes .0625. Pitch changes from 1 to .25. Zoom, keyboard increments and passive mouse aim are unchanged. Landing vertical touch gestures retain native page scrolling.
- The drag threshold now includes the accumulated first six pixels when a drag is recognized, so coalesced and finely sampled pointer events produce the same travel.
- Stars render at display resolution separately from the reduced gas target, with soft per-pixel coverage and restrained brightness. The black hole still occludes the stars and the station draws in front. See [star rendering evidence](2026-09-27-star-render-refinement.md).

## Verification

Fresh final source checks passed: 602 application tests, 89 landing tests, six release-tooling tests, both production builds and landing lint. The application build includes its type and lint checks. The combined output was reassembled after the last runtime change, including regenerated CSP script hashes.

The drag tests reproduced the former missing pitch reduction and event-rate dependence before the fix. A separate regression reproduced a stale preference after successful storage, component unmount and an external tab change; the final implementation caches only choices that could not be written. Flight tests cover skipped stale frames, first-paint bridge suppression, retained ambient motion, unavailable storage and subscription cleanup.

The navigation browser suite passed 25/25 checks against the assembled landing and actual app documents. It covers desktop and mobile navigation, the six retained instrument tabs, keyboard controls, both skip states, a fresh stale-frame marker, modified links, two-tab preference changes while the control is unmounted, blocked storage, reduced motion and 320-pixel layout. No page, console, HTTP, request or CSP errors were recorded in that run. Full departure requested the app document after 10.286 seconds on desktop and 9.966 seconds on mobile; skip requested it after 5 to 9 milliseconds. These measure request dispatch, not completion of page loading.

All six mouse/touch sensitivity cases passed, including normal-motion mobile input, keyboard/reset and native vertical landing scrolling. The app's 96-pixel vertical touch produced the expected quarter-gain pitch to within 0.000000003 radians. The strict diagnostics report remains FAILED for one external Soroban testnet `ERR_NETWORK_CHANGED` request and its console diagnostic. No input assertion or page error failed. See [detailed input measurements and the external diagnostic](2026-09-27-orbit-sensitivity.md).

The final visual inspection found the homepage checkbox label crossing the bright disk at 320 pixels. A homepage-only dark background now protects its contrast; other launch preferences retain their existing appearance. This CSS-only adjustment was built and assembled after the full navigation suite. Both focused follow-up checks passed at 320 and 390 pixels with the live scene: visible contrast, 44-pixel hit area, actual label clicking, no overlap with launch and no horizontal overflow. The computed text contrast against even a white underlying scene is 11.34:1. Both screenshots were inspected and the follow-up reported no browser errors.

Evidence directories: `artifacts/verification/2026-09-27-navigation-preferences/`, `artifacts/verification/2026-09-27-orbit-sensitivity/`, `artifacts/verification/2026-09-27-orbit-refinement/`, and `artifacts/verification/2026-09-27-preference-contrast/`. Navigation source hashes identify the full behavioral run; the follow-up contrast report identifies the final CSS.

Known verification boundaries: browser touch uses Chrome's trusted CDP touch input with phone viewport emulation, not a physical phone. SwiftShader checks do not establish native-device frame rate. No Cloudflare deployment, wallet signing, fund transfer or contract change is part of this checkpoint.
