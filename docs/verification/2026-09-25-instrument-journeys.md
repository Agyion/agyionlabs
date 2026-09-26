# Instrument departures and spatial detail pages

Local revision on 2026-09-25, branch `codex/orbital-redesign-security`.
Preview: `http://127.0.0.1:4192`. Nothing was pushed or deployed.

## Corrections

- Removed the explicit `?tab` navigation bypass. The four Home Open actions,
  six detail Open actions and detail navigation Launch use the existing flight,
  preserving the complete destination URL. Direct app visits remain direct.
- An early click waits for the existing renderer rather than losing its flight.
  A failed import or a three-second startup timeout releases the intended URL.
  Modified clicks, new tabs, downloads and OS reduced motion retain native
  navigation. Initial `pageshow` no longer cancels a queued click; a restored
  graphics context clears its previous failure state. Navigation commits once.
- A selected form projects over the completed flight pose. Its initial mount
  no longer starts another bay-camera movement underneath the handoff image.
  Later explicit selections still move the camera to the requested physical bay.
- Replaced six long detail documents with spatial product pages: a title,
  short promise, three manual stages, one visible stage sentence, Open action
  and concise condition. Extra material lives in closed Conditions & limits.
  The actual Fade packet, Pod rings, Trigger proof and Envoy probe respond to
  stage changes. Ramp and Ledger have separate illustrative exchange/history
  diagrams; they display no fabricated quotes, balances or records. Their
  background no longer draws the unrelated four physical mechanisms. Physical
  related-object clicks on core details navigate to the corresponding detail.
- Home no longer repeats three steps and a note for every selected instrument.
  How it works shows one sentence per stage. Removed duplicate app shell
  introductions and self-evident field hints, retaining labels, validation,
  precise draft amounts, wallet requirements and secret/proof precautions.
- Corrected three semantic descriptions against the local contracts: Trigger
  validates proof and transfers in the same transaction; Envoy permits only
  zero/negative-price Fade claims with a 50-claim mandate limit; Fade fixes the
  price at the confirmed claim, with funds moving at the signed handoff.
- Visual review found overlapping Home/selected-instrument text during a
  visibility transition. Hidden content now leaves immediately while incoming
  content retains its fade/translation.

## Code verification

- Latest suites: 28 landing + 269 app tests passed (297 total).
- Both production builds completed, including app lint/type validation.
- Landing lint passed; site assembly completed with 15 inline script hashes
  and a 1,094-character CSP.
- Stage tests cover all four mechanisms, smooth state changes, reduced-motion
  snapping, null/invalid stages, selection isolation and unchanged resources.
- Scene tests compare the exact landing/app pose on desktop/mobile, including
  explicit Pod/Fade forms. A subsequent intentional panel opening still moves
  the camera. Backdrop regression failed before the fix and passes afterward.
- Utility-scene regression verifies that hiding the physical exhibit group still
  completes the shared flight and writes a settled handoff.
- Final runtime source hashes: `artifacts/verification/instrument-journeys-source.json`.

## Browser evidence

`artifacts/verification/instrument-journeys-final/` retains all 11 departure
paths and five loading/fallback cases. All functional cases passed. Three
representative flights used real time and video: Home Fade, Home Pod and detail
Fade; their observed visible flight spans were 10,340 / 10,335 / 10,210 ms.
Other route cases accelerated the scene clock 12x and are routing/lifecycle
evidence only. Destination queries, paired settled handoffs, no second approach
and zero shader links during the flights were checked. The real desktop runs
deliberately delayed app scripts by 1,500 ms to inspect the document cover.

The delayed-ready case retained its intent; injected module failure released
the chosen URL in 118 ms and a stalled module in 3,151 ms. The initial strict
run is recorded as failed because it includes an external Soroban
`ERR_NETWORK_CHANGED` and an `ERR_ABORTED` for the deliberately failed scene
asset. Raw diagnostics are preserved; a later harness classifies only the exact
injected asset diagnostics separately. It does not filter external RPC errors.

The first broader landing matrix retained a failure after 48 passing checks:
its Open Pod locator selected the temporary Home preview link before the
Instruments navigation committed. The corrected test waits for the real
Instruments stage and clicks its visible link without forced interaction.
This was a separate fixture issue from the text overlap found visually.

`artifacts/verification/detail-world-final-verified/` passed all 18 detail cases
(six routes at 1,440 / 390 / 360 px) with no console, page, request, HTTP or CSP
errors. Core stages change actual 3D pixels; utility stages change their diagrams.
Visible detail text is 61–70 words per page. Mobile document heights are
877–953 px, compared with about 2,538–2,649 px in the captured baseline. Closed
details and inactive stages are excluded from visible word counts. All phone
screenshots were visually inspected. A stale test name (Attest vs Sign) and an
initial closed-details word-counting issue are retained in the first failed run.

The final removal of utility background objects and the physical detail-pick
callback came after those 18 captures; their targeted rechecks are recorded below.

- `instrument-detail-matrix-verified/results.json`: **54/54 passed**, with no
  runtime or asset errors. Includes an actual physical Fade-to-Pod object click,
  one surviving renderer, all responsive detail conditions, native/OS-motion
  behavior and Open Pod through the real flight into an isolated destination.
  A prior test accidentally used a desktop coordinate in a mobile viewport;
  its failed report is retained, and the final test sets the measured viewport.
- `detail-utilities-final/checks.json`: **6/6 passed**, covering Ramp/Ledger at
  1,440 / 390 / 360 px after the unrelated models were removed. All console,
  page, request, HTTP and CSP arrays are empty. Updated screenshots inspected.
- `instrument-app-final/verification.json`: **26/26 passed**, six workspaces
  at desktop/mobile, actual unsent field/diagram changes, projected scene
  transmission, accessible input layout and Pod draft retention across closing.
  All console, page, request and CSP arrays are empty. No wallet or submission.
- `instrument-journeys-mobile-natural/verification.json`: both unaccelerated
  mobile flights passed with **zero injected app delay**. Home Pod: 10,067 ms;
  detail Fade: 9,993 ms visible flight. Both preserve their requested tab and
  settled world, have no second approach or late shader links, and record no
  console, page, request or CSP errors. These are actual browser/video checks,
  not the accelerated routing fixture.

Sequential desktop and mobile video frames were reviewed through departure,
the old midpoint, document navigation and the panel reveal. The natural mobile
endpoint is held while app graphics initialize (about 1.47 seconds for Pod,
1.09 seconds for Fade), followed by the matched-geometry panel fade. There is
no dark frame during these flights or handoffs. Fade's full-video blackdetect
only found the initial document-start intervals 0–0.12 and 0.20–0.28 seconds;
Pod's full-video scan found none. App-to-landing Back is not part of those two
videos; the matrix separately exercises detail-to-Home return.

For the four baseline routes, whole-page rendered word counts fell by
72.2–77.8 percent at matching desktop/mobile widths. This comparison counts
visible text, including navigation/footer, and excludes closed explanatory
details in the new layout. The 61–70 detail-word figure above excludes chrome.

## Limits

These checks use headless Chrome with SwiftShader. They establish interaction
and visible composition, not native-GPU frame rate or universal smoothness.
The preceding software-renderer measurement remains about 24 FPS; this revision
does not claim a new performance measurement. No wallet was connected, no
transaction signed and no on-chain state changed. Browser evidence does not
establish user acceptance or production deployment.
