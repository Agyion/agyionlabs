# Focused final orbit and presentation verification

Tested assembled preview: `http://127.0.0.1:4292`.

Parent-provided artifact tree: `1dd204a78ee3d085c988fad82817b7e7d556c2c91a568549403083b1c5469ae9`.

## Fade arrow and window opacity

`scripts/verify-fade-price-arrow.mjs` passed all **five width cases**: 1440, 1024, 768, 390 and 320. Its strict browser diagnostics also passed without errors.

The orange down arrow was previously missed: the earlier audit covered primary headings and button content, not this connector. This check measures the arrow's actual text glyph with `Range.getBoundingClientRect()`, not its full-width block. At 1440, 1024 and 768, the glyph center differs from each input center and the endpoints container center by **0.0078125 CSS pixels**, inside the one-pixel bound. The glyph also lies vertically between the two inputs. The 1440 price-ticket screenshot was inspected directly.

At 390, the existing side-by-side price inputs remain intact; at 320, they remain stacked. The arrow is intentionally hidden at both phone widths. Horizontal overflow, dock overlap and covered transaction actions were checked. No wallet or transaction was invoked.

Trigger was captured and inspected at 1440 and 390. The common window surface computes to `rgba(21,21,21,0.94)`, permitting only six percent scene contribution through that surface. The workspace and sampled headings, labels, enabled inputs and primary button retain effective opacity **1**. Solid form cards and header preserve their reading surfaces. This is background alpha, not an opacity reduction on the whole form.

Evidence: `artifacts/verification/2026-09-27-final-orbit/fade-arrow-window/results.json`, with 17 screenshots in that directory.

## Module camera and persistent black-hole background

`scripts/verify-module-backdrop.mjs` passed **14 UI/camera cases**: all six instruments and a return to Fade, at both 1440 and 390 widths with normal motion. The sequence includes opposite-bay jumps. The observer reads the identity star mesh's actual WebGL view matrix, reconstructs the camera eye, and projects the fixed black-hole center through the actual canvas aspect and 44-degree lens. It does not alter clocks, application state, geometry or shader uniforms.

The run captured **749 rendered matrices**. After allowing the initial overview-to-focus approach to settle, **658 frame samples** were asserted. Every asserted sample kept the black-hole center in front of the camera and inside the viewport; maximum absolute NDC coordinates were **x=0.253459**, **y=0.117853**, with both inside the `[-1,1]` bounds. Initial free/manual orientation is allowed to return smoothly; this test does not require an instantaneous correction on the first frame.

Settled camera positions moved **2.67 to 4.94 world units** between the tested selections. The background was therefore retained while the camera actually translated to different physical modules. The desktop Envoy and mobile Trigger screenshots were inspected directly. Browser sampling covers the actual elapsed phases observed during this run; exhaustive spin-phase and unchanged-ship-transform coverage belongs to the separate module-camera unit tests.

The camera run's **strict diagnostic result is failed**: one mobile request to `https://soroban-testnet.stellar.org/` failed with `net::ERR_NETWORK_CHANGED`, producing one console error. No JavaScript/shader exception, HTTP error or CSP violation was recorded. The network diagnostic is preserved, not waived or converted to a pass.

Evidence: `artifacts/verification/2026-09-27-final-orbit/module-backdrop/results.json`, including every sampled matrix/projection and 14 screenshots.

Both probes verified their tracked source hashes remained stable and closed their browsers. The GPU slot was released for the separate sensitivity and navigation checks.

## Final navigation preferences

`scripts/verify-navigation-preferences.mjs` subsequently passed **25 of 25 checks**, with a **clean strict diagnostic result**: zero JavaScript, console, failed request, HTTP or CSP errors. The source hash set remained stable. The browser was closed before the release/production verification slot was handed back to the parent.

Coverage includes the single homepage launch action, native modified/new-tab links, keyboard checkbox interaction, preference persistence across reload and route remount, cross-tab changes while the control is absent, stale handoff cleanup, direct app entry, the Pod detail destination, all six app tabs, restoration of the full unaccelerated flight when skip is unchecked, reduced-motion bypass, and blocked-storage behavior within one SPA document. Desktop and 390 pixel cases both completed; 320 pixel checks covered the homepage, Pod page and catalog preference placement.

The diagnostic collector was adjusted before the run to retain failures through all contexts rather than abort later viewport coverage on an external RPC error. The actual navigation assertions were unchanged; any diagnostic error would still fail the strict result. None occurred in this run. This does not erase the earlier module-probe network failure.

Evidence: `artifacts/verification/2026-09-27-final-orbit/navigation/results.json`, plus seven actual homepage, app and narrow preference screenshots. The desktop homepage and mobile app screenshots were inspected directly.

These are focused geometry, interaction and rendering checks; they do not establish blanket alignment coverage, native-device frame rate, real-wallet settlement or a security audit.
