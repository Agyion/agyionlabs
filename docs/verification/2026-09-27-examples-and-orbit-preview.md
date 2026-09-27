# Instrument examples and orbit refinements

Local preview checkpoint, 27 September 2026. No Cloudflare deployment, contract deployment, wallet signing or fund transfer is part of this change.

## Scope

The directory now introduces each instrument through a concrete example. Each detail page contains a distinct illustrated, user-controlled four-step sequence, an alternative failure case, a reset action, and concise rules available through a disclosure. The examples illustrate behavior; they never obtain a client, connect a wallet or submit a transaction.

- Fade: a bakery box moves from a 12 USDC listing to an 8 USDC reservation and a separately authorized pickup/payment. Reservation is not settlement. The seller funds its deposit; a no-show does not silently reopen the listing.
- Pod: 200 USDC is saved for a laptop. Time, the claim key's recipient-bound signature and recipient authorization are separate conditions. The current app's public records and absence of lost-key recovery remain explicit.
- Trigger: a 150 USDC design fee is paid to Noor after the chosen reviewer's proof is submitted. A different reviewer is rejected.
- Envoy: Maya authorizes an agent to claim an eligible collection job. The funded 2 USDC reward reaches Maya at pickup, not the agent at reservation. A positive-price listing is outside this mandate.
- Ramp: an explicitly fictional 400 TRY to 10 test USDC example. Quote, pending status and simulated completion are separate states. No bank or wallet funds move.
- Ledger: an unsigned receipt export and checksum are distinguished from verification of a payment's network reference.

See [source-checked content decisions](../design/2026-09-27-instrument-example-content.md). These examples do not change contract economics, queue fairness, privacy, the V3 compatibility gate or payment execution.

## Further requested refinements

The homepage How it works modal is no longer mounted or linked. Old `/#how-it-works` URLs replace to `/instruments`; route restoration no longer has modal-specific scroll exceptions. The app's instrument-specific help remains.

The wordmark particle experiment samples the actual rendered letter outlines after fonts load. A small 2D canvas follows the shared scene's projected black-hole position and radius, avoiding a fixed screen target. It cannot receive pointer input, pauses offscreen or when the document is hidden, honors reduced motion and clears on departure. Rendering follows the browser animation frame with at most 80 tiny fragments and a 1.5 pixel ratio. This is an appearance experiment, not evidence of native GPU performance.

The black-hole foreground shader previously masked the entire projected critical radius, even for gas physically in front of the hole. That left an impossible lower black semicircle. The revised mask distinguishes foreground depth and leaves the curved-ray image in charge of the inner disk. The artificial photon rim is also attenuated by nearest-disk coverage. Both disk-flow clocks run at 1.35 times the previous rate; camera motion, station rotation, orbit sensitivity and launch duration retain their existing timing.

Website prose no longer uses em/en dashes or hyphenated descriptive phrases on the reachable routes. Arithmetic signs, negative prices, URLs, identifiers and protocol-standard names retain their meaning. The copy changes include local error messages and corresponding test expectations, not protocol logic changes.

Google favicon compatibility is documented [separately](2026-09-27-favicon.md). PNG/ICO assets match the retained gold-ring app logo. Search-result replacement requires publication followed by Google's recrawl and processing; this checkpoint is local only.

## Verification

Fresh checks completed so far:

- Application: 584 tests passed, including two new projection checks for CSS viewport coordinates, resize, and orbital movement.
- Landing: 89 tests passed; production build, TypeScript and lint passed.
- Release tooling: six tests passed; application production export passed.
- Instrument examples: 105 browser checks plus 12 mobile note visibility checks passed across 1440, 768, 390 and 320 pixel widths and both motion preferences. Full normal-motion stories and failure paths ran at desktop and phone widths; intermediate and narrow normal-motion widths checked first-step movement, layout and reset. All four widths ran the complete reduced-motion sequences.
- The examples browser pass included amounts, permission-versus-payment distinctions, no automatic advancement, keyboard focus, stable artwork, rapid clicks, reset during movement, switching motion preference during movement and route disposal. No page errors, console errors, failed requests or transaction writes were recorded.

Evidence: `artifacts/verification/2026-09-27-instrument-examples/results.json` and its screenshots. The interrupted first attempt that exposed visible screen-reader text is preserved in `attempt-1-visible-labels`; the final run includes the scoped hiding fix and aligned columns. The final black-hole pass passed four browser checks with no page, console, request or HTTP errors. Desktop, mobile, pitch/orbit, drag and reset images were inspected. The final foreground transition also removes the thin critical-rim tail that remained in the first correction. Evidence: `artifacts/verification/2026-09-27-blackhole/results-refined.json` and `app-after-refined.png`.

Home refinement checks passed 13/13 with no page or console errors. These exercise visible moving fragments, reduced-motion hide/resume, canvas sizing in short viewports, offscreen pause, actual WebGL context loss, resize while unavailable, context restoration, mobile layout, route remounting, removed modal links, legacy redirect, and served PNG/ICO metadata. Evidence: `artifacts/verification/2026-09-27-home-refinements/results.json`. Earlier test-fixture attempts exposed asynchronous media-event timing and incorrect assumptions about the actual hero height/available scroll extent; the final checks await media processing and use a viewport where the canvas can actually leave view. Those were harness corrections, not additional application fixes.


The final navigation matrix passed **62/62** checks at 1440 and 390 pixels with both motion preferences, plus focused 360-pixel legacy-link coverage. It verifies canonical navigation, browser history, keyboard controls, native modified links, homepage and Pod departure, motion changes during departure, and no-WebGL fallback. The flight destination is an isolated same-origin fixture; this suite is not a new live-application settlement or native GPU benchmark. Evidence: `artifacts/verification/2026-09-27-examples-navigation/results.json`. The deliberate no-WebGL fixture recorded only its expected context-creation diagnostic.

Final state: built and assembled at `http://127.0.0.1:4292/`. No source or asset change has been published to Cloudflare in this checkpoint. The previously published version remains the release identified at the top of HANDOFF.md.
