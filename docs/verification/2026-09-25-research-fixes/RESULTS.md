# Research-driven fixes — 25 September 2026

Local implementation after the user's “continue fixing” instruction. Production and contracts were not deployed or changed. Earlier dirty work was preserved.

## Changes

- Instrument drafts remain in memory across tab switches, closing the console and inline help. Established account changes/disconnect clear the draft tree. Initial wallet connection preserves unsigned input.
- Hidden instruments stop ledger polling and local animation/runner work. Reopening requires fresh ledger data; stale Fade records and signatures remain visible without authorizing writes.
- Fade's generated venue identity is reused in the tab session and indexed by public key. Explicit reveal/copy/download backup is available. Declined claim/handoff/refund actions release busy state. A confirmed send followed by a failed record read offers read-only recovery, not resubmission.
- Public transaction hash, account, network, contract, action and record reference are persisted before broadcast. Storage failure blocks before broadcast. Uncertain results block matching retries, including delayed signing races. Reconciliation is read-only and terminal evidence cannot be downgraded by late responses. Secrets, proofs and signed envelopes are not saved in this recovery store.
- History links recover matching records only for the correct network/contract. Legacy unscoped chain entries do not guess the active deployment. Record loaders reject invalid IDs and obsolete responses.
- Early protocol readiness separates checking, ready, incompatible and unavailable states. Explicit transaction buttons are gated; preparation and reads remain available. The client rechecks before writes.
- Ramp estimates bind the requested TRY amount, direction and timestamp. Changed inputs and late results cannot relabel an old estimate. Unsupported reverse estimates are stated; registered withdrawal terms remain fixed.
- Envoy now leads with its actual nonpositive Fade-claim scope, 50-claim limit, owner-bound recipient and expiry. Monetary contract fields are secondary. Closing/switching stops the local runner without pretending to revoke its on-chain mandate.
- Pod has an interactive example on the landing and detail page: three independent conditions, then an explicit opening. The physical half-shells separate and reveal a core. “Launch Pod app” is distinct from the example action and uses the existing continuous flight.
- App forms have stronger local reading surfaces. Pod displays the actual opening requirements; its loaded-record display no longer invents a 100-ledger burial depth. Mobile Envoy places authority before the form; inline help remains available on mobile.

## Verification

- Final unit run: **56 landing + 345 app = 401 passed**. Three additional Node manifest-generator tests passed. Logs: `artifacts/verification/research-fixes/final/unit-tests-final.log` and `asset-manifest-tests.log`. The earlier 365-test run remains in `unit-tests.log`.
- Both final production builds passed (`app-build-final.log`, `landing-build-final.log`); Next lint/type validation is clean. Landing lint and git whitespace check passed. Three.js scene bundle still triggers Vite's existing >500 kB chunk advisory.
- Assembly passed with 15 exact inline-script CSP hashes.
- App browser matrix before the final startup-only refinements: **33 checks passed**, desktop 1440×1000 and mobile 390×844; no console, page, network or CSP errors in that run. Includes six instruments, actual draft preservation, inline help/Escape, mobile authority order and no ledger polling while retained panels are closed. `artifacts/verification/research-fixes/app-complete/verification.json`.
- Pod/Envoy detail pages: six route/viewport combinations at 1440, 390 and 360 px passed, including physical scene pixel changes with HTML hidden, keyboard focus, route return, viewport and overflow. `artifacts/verification/research-fixes/details-verified/checks.json`.
- Pod interactive example: six landing/detail viewport combinations passed with independent conditions, Space-key activation, explicit opening, relocking, reset and launch destination. `artifacts/verification/research-fixes/pod-trial/verification.json`.
- Unaccelerated Pod flights after using the interactive example passed from the landing and detail page on desktop and from the landing on mobile. No second arrival phase, lost destination, shader compilation during departure or browser/CSP error was observed. These assertions do **not** establish uninterrupted motion. Baseline reports: `artifacts/verification/research-fixes/flight-desktop/verification.json` and `flight-mobile/verification.json`.
- Rendered desktop/mobile images were inspected. That inspection caught the initially sealed-looking “opened” capsule, ambiguous duplicate Open labels, missing third app condition and mobile authority ordering; these were fixed and recaptured.

## Flight startup measurements

The baseline natural-motion recordings show a static endpoint while the new app document initializes its scene. Desktop navigation-to-ready was **1815 ms** from landing and **1225 ms** from the Pod detail; mobile landing was **1277 ms**. Desktop shader linking occupied about 140 ms near the end, so attributing the entire pause to shader compilation would be incorrect. Sequential video frames were inspected at `artifacts/verification/research-fixes/flight-review/landing-pod/sequential-frames/`.

A bounded follow-up starts the scene import before hydration effects and warms the precise app/scene JS and CSS during the existing flight, using generated build manifests. It does not change the camera path or flight duration, execute Next scripts on the landing, or establish that renderer initialization is instantaneous. The first warmup measurements were **2120 / 1655 ms desktop** and **1781 ms mobile**. All 13 assets were fetched during departure; the app consumed its 12 script resources with zero transferred bytes. This proves cache warming, **not a reduction in the total hold**. Files are in `flight-prewarm-desktop` and `flight-prewarm-mobile`.

An additional instrumented flight exposed a software-renderer context probe/recreation cost: the initial antialiased app context took 351 ms and its replacement followed about 280 ms later, while the non-antialiased replacement itself took 4.6 ms. That run retains an external RPC `ERR_NETWORK_CHANGED` failure and is marked **failed**, even though its flight assertions passed (`flight-startup-profile/verification.json`). The final change passes a strictly validated, fresh, paired software-renderer hint between documents. The actual GPU is still checked: native or unknown hardware restores antialiasing. Confirmed software uses one context. The cover is released in the ready DOM commit, before painting, rather than waiting for a passive effect.

Final normal-motion captures observed the following **DOM event timings after app navigation** (not a native GPU frame-rate claim):

| Origin | Scene-ready class | Opaque bridge removed | Playwright readiness poll returned |
| --- | ---: | ---: | ---: |
| Desktop landing → Pod | 1295 ms | 1295 ms | 2031 ms |
| Desktop detail → Pod | 1196 ms | 1196 ms | 1606 ms |
| Mobile landing → Pod | 1166 ms | 1166 ms | 1610 ms |

The poll timestamp is delayed by browser/tool scheduling and must not be confused with the DOM readiness event. Before the startup changes, the desktop landing cover remained until **2423 ms**; the earlier detail cover was **1238 ms**, so that case does not demonstrate a substantial overall improvement. Final startup remains about **1.2–1.3 seconds in this software-rendered sample**. It is not uninterrupted motion or a cross-device performance guarantee.

Both final desktop flight assertions passed, but the strict desktop report remains **failed** because one live RPC request returned `ERR_NETWORK_CHANGED`. The final mobile report passed with no browser/network/CSP errors. All of these runs use native clocks and no artificial app-script delay. Reports: `flight-final-desktop/verification.json` and `flight-final-mobile/verification.json`. Their sequential navigation/reveal video frames were inspected: the endpoint hold remains visible, with no second camera approach or black interstitial frame.

The final fallback suite passed all five behavioral assertions: reduced-motion launch from landing/detail, a delayed scene, an unavailable scene module and a queued-scene timeout. Its strict report remains **failed** for a live RPC `ERR_NETWORK_CHANGED` request (`flight-fallbacks-verified/verification.json`). The preceding `flight-final-fallbacks` run retains a harness race: Playwright `.all()` enumerated controls before the selected Pod form mounted. The harness now waits for exactly three controls and verifies each check before opening. That failed run was not relabeled or erased.

## Live deployment evidence and remaining boundaries

A direct, unsigned read-only `protocol_version` simulation (latest raw result: `artifacts/verification/research-fixes/final/live-protocol-simulation.json`, 2026-09-25T10:24:09Z) on the configured testnet contract `CAVVTPBBNOCMDBC26CVOXKSU7B7MDK33TXQXTVUVKSJHSVKGLZTVJ5N5` returned `Error(WasmVm, MissingValue)` with the explicit diagnostic `trying to invoke non-existent contract function, protocol_version`. The RPC itself answered getLatestLedger. The app correctly showed **incompatible** on both desktop and mobile in the subsequent browser run. A new v2 deployment/migration remains necessary for these transaction paths; old locked funds are not migrated automatically.

Earlier browser runs in `app-first`, `app-final` and `app-verified` retain external `ERR_NETWORK_CHANGED` failures and remain marked failed. The clean final run does not erase those failures or establish external service reliability.

No wallet connection/signature, real token transfer, Cloudflare publication or mainnet operation was performed. Exact assembled-transaction fee review, repeat-visit flight policy, real mobile keyboard/wallet behavior and native GPU frame-rate certification remain outside this patch. The full project/security audit is not declared complete or exploit-free.
