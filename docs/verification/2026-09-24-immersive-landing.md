# Immersive landing revision

The user rejected the previous catalog layout as dull. Previous test results did not establish design acceptance. This revision makes the black hole and the Stellar-inspired identity the center of one navigable scene.

## Implementation direction

- One viewport-scale world, large Agyion identity, short product promise.
- Four physical mechanisms in the same WebGL scene; fixed accessible controls select them. Selection eases the object forward and increases its light. Clicking a mechanism selects the corresponding control; it does not navigate unexpectedly.
- Product descriptions appear only on selection, with ordinary details and explicit app links.
- Centered native explanation dialog replaces another page section. Navigation stays reachable; mobile uses a compact wordmark and two-column controls.
- Cold outer gas, warmer narrow filaments and a sharper photon edge; the shader keeps the existing passes and resolution policy.
- The same 9.8-second launch reaches the app with its final-frame handoff. Portrait framing begins at the same camera target on both sides of the launch trigger and decays continuously toward the destination.
- No new motion switch, fake transaction, demo transfer, or production publication.

## Current evidence

- Both production builds passed. The combined local site uses 15 inline script hashes in its generated CSP. Landing emits the existing warning for its dynamically loaded Three.js chunk above 500 kB (153.6 kB gzip).
- 239 application and 28 landing unit tests passed after the early-head bridge change. Landing lint and typecheck passed.
- `artifacts/verification/immersive-world-final/results.json`: 8 checks passed with no runtime/console errors. All four physical models were clicked at 1440×1000, 390×844 and 320×740; each selected its matching UI without navigating. Keyboard orbit and fine-pointer camera changes were measured from the fixed stars’ view matrix.
- Switching reduced motion on/off preserved both the selected Pod UI and its rendered pose/light: the final product crop was pixel-identical after renderer recreation.
- `artifacts/verification/immersive-ui-verified-complete/results.json`: 53/53 browser checks passed across 1440, 768, 360 and 320 px, all six detail routes, normal/reduced motion, dialog focus/history, native links, the full 9.8-second fixture handoff, motion changes during launch and forced no-WebGL fallback. No unexpected JS, console, request or HTTP errors occurred. The forced WebGL failure records its expected context-creation error. This matrix preceded the final gas-material prewarming fix; subsequent flight and app checks used that fix.
- `artifacts/verification/immersive-app-tests`: 14/14 application browser tests passed before the early-head bridge change. The suite has targeted runtime/CSP assertions; it does not globally capture every network event.
- `artifacts/verification/immersive-flight-desktop-verified/verification.json`: all scene, handoff and direct-input checks passed, including zero shader links during flight, the exact viewport, coverage until renderer readiness, no second approach, and drag/wheel/keyboard/module interruption. **The strict run failed** because a live Soroban RPC request reported `net::ERR_NETWORK_CHANGED`. This run is not relabeled as passed.
- `artifacts/verification/immersive-flight-mobile-verified/verification.json`: all assertions passed with zero console, page, request or CSP errors, zero shader links during flight, and no second approach. Subsequent sequential-frame review found a 40 ms dark frame before bridge insertion that these assertions did not cover; its correction is tracked below.
- The original desktop/mobile recordings and eight sequential contact sheets are retained. Review found continuous camera progression across the former midpoint, consistent station framing and identical settled geometry through renderer reveal. Contact sheets sample 5 frames/second; the mobile dark interval was measured from the original 25 FPS video.
- The final early-head rechecks are separate: `immersive-flight-desktop-prepaint/verification.json` passed without console, page, request or CSP errors; `immersive-flight-mobile-prepaint/verification.json` passed all handoff assertions but retains one live RPC `ERR_NETWORK_CHANGED`. Journeys took 10,505 ms and 10,118 ms respectively, including click/navigation overhead. Both recorded zero late shader links, matched the full viewport, held the saved view until graphics were ready and became interactive without another approach.
- The final mobile navigation/reveal contact sheets were reviewed independently. `immersive-flight-mobile-prepaint/blackdetect.json` finds only the initial browser startup interval (0–1.52 s), with no later dark interval in the full recording. The previously observed 40 ms navigation blank is absent in this repeat. This is video evidence for the tested run, not a guarantee across all browsers.
- The final desktop navigation/reveal contact sheets also preserve geometry and contain no blank handoff frame. `immersive-flight-desktop-prepaint/blackdetect.json` finds only initial browser startup (0–0.64 s), with no later dark interval.
- Three focused application checks passed after changing the document bootstrap: direct visits/history, reduced-motion interaction, and unavailable-WebGL fallback. Results are in `artifacts/verification/immersive-prepaint-app-checks/.last-run.json`; the unchanged full 14-test suite was not repeated.
- Initial shader renders were reviewed and rejected internally for excessive white bands, then for an overly dark wire-like appearance. Four variants remain under `immersive-first-render`, `immersive-world-v2`, `immersive-shader-v3` and `immersive-shader-v4`. The current shader uses integrated gas with warped density and sparse filaments. Its upper lensed arc remains more orderly than the provided reference; no film-frame fidelity or user aesthetic approval is claimed.

## Performance boundary

The isolated 1440×1000 software-renderer sample submitted 21 draws per frame and averaged 24.19 scene frames/second across a short ambient/input window. The earlier pre-LOD/v2-shader sample submitted 44 draws and averaged 20.92 FPS. These are short samples with shader differences, not a controlled benchmark or proof that LOD alone caused the timing change. The real draw reduction is confirmed by WebGL submission counts. This sample preceded the final startup-only gas prewarming change.

No native GPU was available in these automated runs. Software throughput remains below 30 FPS; this revision does not establish universally smooth rendering. The full station is prepared before launch and replaces its tiny distant silhouette only once it occupies at least 10 px.

## Integration issues found during verification

- The native explanation dialog let Tab move focus into browser chrome when its only control was focused; explicit first/last focus wrapping fixes that case.
- A dialog DOM id equal to the URL fragment allowed native same-document hash navigation to override Close-button focus. The dialog now has a distinct id while React owns the hash state.
- A later test incorrectly treated same-document fragment navigation as a fresh page load. Its diagnostic showed the existing visible main region was correctly restored; the suite now separately verifies exact same-document restoration and fresh-load fallback focus. The failed assumption and diagnostic are preserved.
- OS motion changes recreated the scene with a null exhibit while its UI remained selected. A retained selection ref and readiness tied to the active preference keep them together.
- Browser Back from the dialog cleared a selection that Close/Escape preserved. The previous hash transition now governs restoration.
- Changing reduced motion during launch could cancel the promised navigation. The pending destination survives renderer replacement and completes navigation using the new preference.
- Recorded desktop and mobile flights exposed one shader link 112–131 ms after Launch: the nearby gas plane was invisible at idle and had never prepared its material. The zero-opacity plane is now temporarily included in the pre-readiness warm renders. Both failed recordings remain in `immersive-flight-desktop` and `immersive-flight-mobile`; verified repeats use separate directories and recorded zero late links.
- Sequential mobile video review exposed a 40 ms dark frame between the old document and the first bridge insertion. The bootstrap trace first had no bridge at 91 ms, then a decoded bridge at 131.8 ms. The validated image now starts loading in the head with synchronous decoding requested; a one-shot observer mounts it only inside the reserved body root. Invalid images, reduced motion and an expired startup still bypass or release the cover. Five additional unit cases and the production export placement pass. The new mobile recording and full-video dark-frame detection confirm that the observed handoff gap is absent in the repeat; DOM assertions alone had missed it.

## Live network diagnostic

`artifacts/verification/immersive-rpc-route-diagnostic/verification.json` preserves two short visits with real RPC traffic. Keeping the script-interception gate produced one first-request `ERR_NETWORK_CHANGED`, followed by two successful HTTP 200 responses. Removing the gate with zero pending RPC requests produced three successful HTTP 200 responses. The failure also occurred before gate removal in the earlier flight. Gate teardown is therefore not necessary to reproduce the error; its exact cause remains unproven. No error filter, RPC mock or runtime workaround was introduced.

Failed runs are retained alongside subsequent results. No production publication, wallet signing, or chain mutation was performed in this revision.
