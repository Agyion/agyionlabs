# Agyion — current local handoff

Updated 2026-09-27 (Europe/Istanbul). Working branch: `main`. New commits use the verified `agyion-foundation` account.
The original handoff is preserved in `docs/archive/HANDOFF-before-orbital-revision.md`.
Its mint landing, missing `/mnt/agents/output/app` source, frontend-only mock,
8-second docking sequence and live-verification claims describe the earlier
production bundle. They are not instructions or evidence for this revision.

**Current backend and website checkpoint (27 September, 05:42:57 Istanbul):**
Version `f3cfa837-2703-49c2-895d-0ce71dd3a555` is at 100% traffic. Public testnet
contract `CBIIHFELPAKC2KJD4NCJSB32BQO5QUBNEKHBMISFB4MVDKBVM6AJSRXT`
has actual WASM SHA256 `1e6643028d6b397b3a762d4b5312eaf20f2744407686c78122d27c5a4dd8d378`,
protocol 3 and 23 matching ABI entries. Dedicated native-XLM testnet verification
passed 17 checks and 23 included transactions. Final live browser verification
passed 34 HTTP/artifact and 14 UI checks, observed matching testnet and contract
responses, and reported ready with zero page, console, network or CSP errors.
The earlier Cloudflare injection conflict is fixed using no-transform on HTML,
with the CSP unchanged. Circle testnet USDC metadata was read back, but USDC
funding, a real wallet approval and fiat payout were not demonstrated.
The authored source inventory records 400 files and 55,092 lines fully read by
the review team, with generated/vendor/dependency categories kept explicit.
The experimental private implementation is still not activated in this published
checkpoint. Its contract and client self-destination defect was fixed and tested.
See `docs/security/2026-09-27/COMPATIBILITY_RELEASE.md` for actual findings,
receipts, final tests, failed earlier runs and remaining limits. This is an
internal defensive review, not an independent audit or a no-exploit guarantee.

**New active work requested after this checkpoint:** continue on main, retire the
other branch without losing history, rename active protocol code to Agyion,
remove the redundant left instrument launcher, improve README and integrate the
private flow into the app with honest testnet/setup boundaries. Those changes
are not included in the release evidence above until separately verified.

**Previous website release (27 September, 04:47:50 Istanbul):** directory-only
header refinement published to `https://agyionlabs.dev/instruments`, Worker
`agyion`, version `169750d6-6647-4c13-9db7-9b94cf8d88e8`, confirmed at 100% traffic.
Rollback version: `c004d8e9-5b0b-4cec-821f-24e3642347f3`. Instruments now has one
Launch app link in the header. Its existing remembered Skip animation checkbox
is beside that link; both duplicate footer controls are removed. On narrow
screens the pair occupies a second header row without shrinking text. Header
clearance, menu access and 44px control height were checked, including the
1000/1001px breakpoint. Landing lint and build passed. Initial six-width checks
found a 42px tablet launch target; its scoped correction passed a fresh 768px
follow-up. Live desktop/mobile UI checks and 13 artifact/header checks passed. Strict live
diagnostics retain the known Cloudflare injected-script CSP conflicts, with no
JavaScript exception or RPC failure in this run. Evidence is recorded in
`docs/verification/2026-09-27-directory-header-release.md`. Runtime changes are
limited to NavPill, Instruments and orbital.css. The source/asset manifest is in
`artifacts/verification/2026-09-27-directory-header-release/manifest.json`, tree
`b6f143c0e63806bf3212219b7ab4bd549a834a8451e573202e2ec39a5346ed43`.
Earlier app/camera/backend boundaries below remain unchanged.

**Previous website release (27 September, 04:36:42 Istanbul):** the explicitly
authorized frontend update is published at `https://agyionlabs.dev/`, Worker
`agyion`, version `c004d8e9-5b0b-4cec-821f-24e3642347f3`, confirmed at 100% traffic.
Rollback version: `8b79160d-6429-447f-ba82-1075598dfca2`. This release uses the
reviewed dirty working tree; HEAD alone is not its source identifier. The source
and asset manifest is in `artifacts/verification/2026-09-27-distinct-workspaces-release/manifest.json`.
Artifact tree: `1dd204a78ee3d085c988fad82817b7e7d556c2c91a568549403083b1c5469ae9`.

Catalog/detail copy is shorter, form typography is readable, repeated labels are
removed, and the six instruments have distinct task layouts. The Fade price
connector is centered across its actual input column. The common app window is
94% opaque; text/controls retain full opacity. Mouse/touch camera drag is now 1.5
times the previous quarter-sensitivity setting: landing yaw/pitch .375, app yaw
.09375 and pitch .375. Module selection travels to real rotating bays from a
common black-hole-facing side, keeping the hole in frame without rotating the
ship to fake the selection. Manual orbit remains independent. App gas flow is
25% faster, with its phase preserved through launch. Earlier skip preference,
filtered stars, favicon variants, examples and homepage refinements below are
included in this release.

Final application tests: 610 passed; both production builds passed. The relevant
landing suite passed 89 and lint, and six unchanged release-tool tests passed.
Final browser checks include 44 app structure/typography checks, all 105 unique
example cases across the documented wide/narrow runs, 16 extreme Ledger amount
checks, five arrow/window widths, 14 module-camera cases, six input cases and 25
navigation cases. Raw reports retain external testnet network diagnostics where
present; these are not blanket clean-browser or security claims. Production
verification passed 34 HTTP/artifact assertions and 14 UI assertions with no
application page exception. Its strict diagnostic result remains failed for four
Cloudflare injected-script CSP events and two external Soroban network failures;
these are preserved in the release report, not treated as clean passes. See
`docs/verification/2026-09-27-distinct-workspaces-release.md` and
`docs/verification/2026-09-27-final-orbit.md` for evidence and limits. No wallet
was connected and no transaction or contract was deployed. The incompatible
configured testnet kernel remains write-gated; the private profile and broad
security review remain separate and incomplete.

**Historical controls checkpoint (27 September, now included in the release above):** app header
Overview/Instruments links and the duplicate homepage header launch are removed;
the instrument dock remains. A remembered Skip animation checkbox bypasses the
flight without disabling the interactive background. Old flight frames are cleared
before first paint. Dragging now uses one quarter of its previous sensitivity on
both axes, including the app's existing horizontal reduction; landing native
vertical touch scrolling, zoom and keyboard controls are retained. Stars now use
display-resolution, filtered pixel coverage instead of upscaled square points.
Final source checks passed 602 app, 89 landing and six tooling tests, both builds
and landing lint. Browser checks passed 25 navigation cases, two final mobile
contrast cases and all six mouse/touch measurement cases. The input run's strict
diagnostics remain FAILED solely for an external Soroban `ERR_NETWORK_CHANGED`
request; its behavior checks passed. Local preview remains port 4292. Evidence is recorded
in `docs/verification/2026-09-27-navigation-and-orbit-controls.md`; this is not a
new Cloudflare release, native-device performance benchmark or backend audit.

**Historical examples preview (27 September, now included in the release above):** six instrument
pages now have source-checked everyday examples, distinct illustrations, four
explicit user-driven stages, a failure path and reset. The directory introduces
each example. Reachable site prose has been cleaned of em/en dashes. Homepage
How it works modal/links are removed; its old hash replaces to `/instruments`.
A wordmark-to-hole particle experiment tracks actual letter outlines and the
camera projection. The app black-hole foreground depth mask now covers the lower
rear image correctly; disk flow is 1.35 times faster without retiming the camera,
Endurance or flight. Matching PNG/ICO favicon alternatives are ready; Google
recrawl has not been requested or established. Local preview is port 4292.
Fresh checks: 584 app, 89 landing, six tooling, 105 example interactions,
12 mobile note visibility, 13 homepage refinements, four black-hole browser checks,
and 62 navigation checks passed. Both builds and landing lint passed. Browser
checks include screenshot inspection and fault/reduced-motion behavior; they
are not native GPU performance evidence, a live deployment, or a security audit.
See `docs/verification/2026-09-27-examples-and-orbit-preview.md` and its linked
reports. Runtime changes remain in the working tree for user preview.

**Previous website release (27 September, 02:23:30 Istanbul):** the user explicitly
requested publication of the pending changes and keeping the app logo on both
surfaces. Runtime source `04b5647` is now published to `https://agyionlabs.dev/`,
Cloudflare Worker `agyion`, version `8b79160d-6429-447f-ba82-1075598dfca2`, deployment
`ab0a455b-5659-4f41-a78e-4c7a587de750`, at 100% traffic. Rollback version:
`b661f1df-bf19-4515-88d9-efbc17151440`. Landing navigation now uses the unchanged
app logo's ring/circle geometry, type and responsive sizing; favicon matches too.
The narrow 320px header clipping found in visual QA was fixed without shrinking
the logo. This website package includes the previously unpublished canonical
directory and client correctness/recovery changes. It does not deploy contracts
or integrate the separate private profile. Local tests/builds and live artifact/
UI checks passed; strict live diagnostics still fail on the existing Cloudflare
CSP conflicts and external testnet network errors. See
`docs/verification/2026-09-27-logo-and-pending-release.md` for boundaries/evidence.

**Latest bounded follow-up (27 September):** the user requested a simpler home
leading to the preferred `/instruments` directory and realistic Fade economics
and allocation analysis. Home's second catalog is removed; all Instruments links
use `/instruments`, and old `/#instruments` links replace to that URL. The
space scene and launch remain. Browser QA also fixed cross-page How scroll.
Fade history now uses the actual confirmed claim ledger and survives missing or
consumed receipts and wallet changes without hashless duplicate entries.
Ten-claimant native/WASM tests verify one winner; this is not network fairness.
Fresh checks: 582 app, 89 landing, 55 HAK native-plus-WASM and 102 browser checks;
both builds and relevant static checks passed. Initially verified at local port
4292; the website changes are now included in the release above. See the original
checkpoint `docs/verification/2026-09-27-canonical-instruments-and-fade.md`
and `docs/product/2026-09-27-fade-use-cases-and-allocation.md`.
Free reservation/no-show and fair allocation remain explicit protocol design
work; no new deposit, slashing or batch-selection rule was introduced.

Backend correctness, contracts, fund safety and the separate private profile
remain open work. Subsequent user-requested presentation refinements are recorded above.
The preceding local continuation fixes Fade's frozen-price display, foreign-token mislabelling,
duplicate creation after a confirmed result loses its record ID, invalid mode
configuration, and false trustline success. The full app suite passed 560 tests;
HAK native-plus-WASM passed 53, including second-transfer rollback/reserve tests.
See `docs/security/2026-09-27/CLIENT_FADE_REVIEW.md` for the verification record,
review boundaries and remaining gates. That checkpoint performed no deployment;
its client changes are now included in the website release above.

The preceding backend checkpoint rejects a Trigger beneficiary equal to the
kernel address before any deposit. Its checks passed 49 native / 51
native-plus-WASM HAK tests and all 30 private-client tests, including the opt-in
actual-browser journal check. Its compiled HAK ABI matches the application
bindings. See `docs/security/2026-09-27/BACKEND_REVIEW.md` for that evidence.
The broad HAK, private-pool and cryptography agent reviews were interrupted by
the tool's automatic cybersecurity filter; those reviews are **incomplete**.
This checkpoint is not a whole-repository audit or a contract deployment.

**Current security status:** the local kernel/client are now protocol **V3**.
Pod uses a locally held Ed25519 seed and recipient-bound signatures, not the
historical preimage/commit flow below. The configured old testnet kernel remains
incompatible, and writes are closed. No funds or existing records were migrated.
Fade stays public. The separate experimental v2 profile now implements real
Pod/Trigger/Envoy ZK circuits, encryption, authenticated threshold DKG/DLEQ,
scoped disclosure, complete encrypted key recovery and a pinned testnet-only
Soroban pool. A genuine 17-step proof chain passed native and compiled-WASM
execution, including token rollback; actual browser proof/recovery checks passed.
The final local check passed 131 privacy, 29 client, seven tooling and 27 native/WASM
pool tests, with five explicit routine opt-in skips. Separate actual browser gates
passed 45 proving/recovery checks and 22 durable-journal checks. The release reader,
wallet lifecycle and journal are implemented as a separate SDK.
The production app does not yet integrate/deploy that private profile. Local
single-operator development setup and trustee tests are not independent ceremony,
committee or audit evidence. See `privacy/EXECUTION_V2.md`,
`contracts/private-pool/RESOURCE_RESULTS.md` and the historical
`docs/security/2026-09-26/REVIEW.md` for their respective scopes and release gates.
Historical counts/statuses below describe their named checkpoints only.

**Previous published frontend — historical:** `https://agyionlabs.dev/`, Cloudflare version
`b661f1df-bf19-4515-88d9-efbc17151440`, deployment
`bc49f6e4-9e84-45cd-9506-eae982f4a5d9`, at 2026-09-26 21:11 UTC
(27 September 00:11 in Istanbul). Runtime source is commit `4dcd48a`, pushed on
`codex/orbital-redesign-security`. Previous rollback version:
`ff3d5bf7-a79a-49f3-bed9-cbfe9ce8ee47`.

The homepage now separates the unobstructed space hero from an opaque black/orange
instrument gallery. Natural scrolling and the real `/#instruments` anchor lead
to four split-word selectors and one continuous illustrative mechanism. Details
reuse the selected title in a progressive native transition. History restores
selection, position and focus; a fast reduced-motion Back race was reproduced
and fixed by cleaning up old route listeners before the new layout commits.
Launch from any gallery scroll depth preserves the existing renderer, viewport,
9.8-second flight and requested app tab. Same-document Back cancels a pending
flight safely. The existing directory, six product pages and application remain.

Fresh checks: 477 app + 89 landing + six tooling tests; both builds/type checks
and landing lint passed.
The full gallery matrix retained two failures (94/96), both the subsequently
fixed history race. Final route-only verification passed 57/57 across four widths
and both motion preferences; the general landing matrix passed 54/54; focused
Pod/Envoy detail checks passed 16/16. Three actual app journeys passed functional
checks with delayed scripts and no second approach. The desktop strict run retains
two external RPC network-change failures; mobile was clean.
Live artifact/HTTP checks passed 29/29, home/app UI checks 14/14, and the
separate live gallery check 15/15. Strict live
verification is **failed** on four existing Cloudflare-injected CSP events and
two external testnet RPC network-change failures. There is no application page
exception. Network unavailability correctly keeps transaction actions disabled.
See `docs/verification/2026-09-26-home-gallery.md` for evidence and release limits.

The prior wallet dependency remediation remains documented in
`docs/security/2026-09-26/dependency-remediation.md`; this homepage revision adds
no dependency. GitHub's push still reports 33 alerts on the default branch, which
was not merged. This publication does not claim those alerts are resolved or an
independent security audit is complete. V3 writes remain closed against the old
kernel; the separate private profile is not integrated/deployed. No signing or
chain transaction occurred. The older release record remains at
`docs/verification/2026-09-26-product-release.md`.

## User brief and implementation constraints

- Landing and app share a cinematic black-hole / detailed Endurance-inspired station.
- No green on landing; near-black, ivory, muted metal, warm amber.
- The app's decorative bottom Mission timeline is gone. Real price previews,
  unlock/deadline indicators and transaction history remain.
- Successful local/confirmed actions emit a light packet toward the hole.
- The app is a full-screen interactive world with orbit/zoom/module picking.
  Six instruments open in a centered, responsive workspace above the scene.
  Landing is distant; launch follows one complete approach and escape path.
  Both canvases cover the same full viewport, including behind the header.
- Launch now runs one 9.8-second camera journey entirely on the prepared landing
  renderer. The app restores its final position without a second approach. A
  validated same-tab frame bridges document loading at that completed destination,
  followed by a 450ms renderer-ready reveal. Every ordinary same-tab Open link,
  including explicit instrument links on Home and all six detail routes, now
  keeps its requested `?tab` through that flight. Direct app visits, modified/new
  tab links, OS reduced motion and graphics failure use native navigation.
  A settled explicit-instrument handoff opens its form without a second camera
  focus movement. A later explicit selection can still travel to its physical bay.
- Fine mouse movement adds a small damped camera response in the free world;
  drag and zoom ease that offset away without a recoil. Dock hover/focus lights
  the corresponding bays without selecting them or opening a workspace.
- Landing uses a large Agyion wordmark above an unobstructed space hero, followed
  by a separate opaque black/orange instrument gallery. Product meshes are not
  created over the black hole. Four accessible selectors choose one animated
  example; detailed controls remain on the product pages. A native centered
  dialog explains the process. Mobile uses a compact inline wordmark.
- Instrument forms separate editable inputs, actual draft summaries and existing
  records. The six public detail pages share the landing typography and palette.
  The workspace follows the actual header height and scrolls as a whole on short
  screens; its closing/reopening preserves the mounted form draft.
- No Pause motion button. OS reduced-motion preference and explicit interaction
  coexist; forms, keyboard access and renderer failure fallbacks remain usable.
- User authorized source revision, testing, frontend publication and GitHub push.
  Frontend publication and the source checkpoint have been performed. No new
  chain deployment, account transfer or live signing has been performed.

The following paragraphs describe earlier checkpoints. On 2026-09-26 the user
explicitly liked the current design and requested only final alignment, reduced
horizontal drag sensitivity and connected Endurance geometry; see the latest
checkpoint below. This feedback does not approve changes made afterward.

The initial rendered black hole was rejected by the user. No visual approval was given at that checkpoint.
Technical test results below do not establish aesthetic quality or acceptance.
The shared scene has a second local revision against the provided reference images.
This does not constitute user acceptance. A subsequent interactive-flight revision
implements the earlier interaction request; see `docs/verification/2026-09-24-interactive-flight.md`.
The subsequent film/camera correction is documented in
`docs/verification/2026-09-24-film-camera-correction.md`. It replaces the
selection-driven ship orientation with physical camera travel and removes the
quarter-second disk cache. There is still no user aesthetic approval.

Film/camera correction checks before the workspace revision: 210 application/landing tests, 14 app browser tests,
24 landing browser checks, both builds, and a normal-motion desktop/mobile
walkthrough passed. Graphics recovery preserves completed flight positions.
The software renderer still measured about 17 FPS ambient and about 10 FPS
while opening a module; smoothness is unresolved. See
`docs/verification/2026-09-24-orbital-performance-verified.md` for measurements
and their hardware/short-sample limits. Test counts are not visual acceptance.

The subsequent workspace/connecting-flight work is documented in
`docs/verification/2026-09-24-instrument-workspace.md`. Its fresh local unit suite
has 201 app + 28 landing tests. That revision does not claim improved GPU frame
rate or production deployment; read its browser evidence and remaining limits.

The preceding single-flight/pointer/navigation correction is documented in
`docs/verification/2026-09-24-single-flight.md` and
`docs/verification/2026-09-24-landing-motion-navigation.md`. Its local
unit suite has 227 app + 28 landing tests. Landing copy is reduced to 175 visible
words; a fixed section menu and four animated product illustrations replace the
longer page. Browser checks and the external testnet RPC diagnostic are recorded
in that report. There is still no production deployment or aesthetic approval.

The user rejected that catalog revision as dull. The current immersive revision
is documented in `docs/verification/2026-09-24-immersive-landing.md`. It treats the
black hole as the central Stellar-inspired brand scene rather than separate
illustration. Four physical mechanisms use 17 additional draws, with fixed
controls and separate physical-picking callbacks. A distant station silhouette
avoids drawing invisible hull fittings on the landing; the full model and its
shaders are prepared before flight. Portrait framing starts at a centered target
and continuously removes its lateral offset during launch.

Current production builds and 239 app + 28 landing unit tests pass locally. Final
browser checks and performance measurements are recorded in the immersive report;
earlier screenshots/failed iterations are retained. No aesthetic approval or
reference-film fidelity is inferred from these checks. No publication occurred.
The landing matrix passed 53 checks; the world checks passed 8 and the app suite
passed 14. A subsequent early-head frame preload removed a recorded 40 ms mobile
navigation blank in the repeat video. Both final flight rechecks confirm zero
late shader links and no second approach; 3 targeted app checks also passed after
that bootstrap change. An intermittent live testnet RPC failure remains recorded,
and software rendering measured about 24 FPS in a short sample. These limits are
not resolved by the passing interaction tests.

## Source of truth

The current detail-page layout supersedes the earlier spatial/manual-stage
design below. See `docs/design/2026-09-26-instrument-revision.md` and the current
release report above. The homepage's physical mechanisms remain; the Instruments
navigation now opens an actual directory. New detail examples are illustrations,
not transactions or privacy guarantees. Pod copy describes the V3 local signing
key, not the obsolete public preimage. Technical checks are not aesthetic approval.

The preceding Open-link and spatial-detail correction is documented in
`docs/verification/2026-09-25-instrument-journeys.md`. It supersedes the earlier
explicit-tab bypass and static document-style details. Core details now keep
the physical scene and expose three manual condition stages; their actual
mechanisms respond to those stages. Ramp and Ledger have distinct illustrative
exchange/history diagrams, with no invented rates or records. Optional prose
is inside closed Conditions & limits. Home keeps one mechanism sentence;
How keeps one sentence per stage. App duplicate introductions/hints are removed
while wallet, secret, proof, amount and timing requirements remain.
Latest validation: 269 app + 28 landing tests, both builds, 54 landing browser
checks, 18 detail-layout checks plus 6 final utility rechecks, and 26 app UI
checks passed. All 11 desktop launch routes passed their functional checks;
the initial strict run retains an external RPC error and deliberately failed
asset diagnostics. Two final natural mobile flights passed with no browser
errors. At the completed destination, app graphics initialization still holds
the shared frame for about 1.1–1.5 seconds in software-rendered mobile captures.
No new native-GPU performance claim is made. See the latest report for exact
artifact paths, measured word counts, earlier fixture failures and scope limits.

The preceding holographic-workspace and landing-exploration revision is documented
in `docs/verification/2026-09-25-holographic-instruments.md`. Instrument-specific
draft diagrams now sit on translucent local surfaces, with the 3D scene visible
through the workspace. Instruments changes the landing composition and brings
the selected physical mechanism forward; How it works has three interactive
optical stages. The exploration canvas stays fixed at viewport dimensions while
longer text scrolls; scrolled mobile Launch no longer changes its lens or position.
Draft amount labels preserve all seven supported decimals.
The latest unit suite has 256 app + 28 landing tests; both builds pass locally.
Final browser checks passed 14 app, 8 physical-world and 16 exploration/How cases;
the broader landing matrix passed 53. Both final exploration-origin flights pass,
including an actually scrolled mobile start with zero canvas aspect change. The
holographic app and layout reports retain intermittent external RPC failures.
The latest short software-renderer sample is 23.97 FPS / 21 draws per frame.
Read the current report for browser evidence and remaining limits. No aesthetic
approval, production deployment or native-GPU smoothness is implied.

```
landing/                  Vite + React landing and six instrument detail pages
app/                      Next.js static export of real Stellar instrument UI
shared/space-scene.ts      shared Three.js scene, procedural 12-module station
shared/black-hole.ts       curved-ray lookup and emissive disk shader
shared/instrument-orbit.ts four batched, physical landing mechanisms and picking
shared/scene-compositor.ts fixed HDR background pass + full-resolution hull
shared/module-camera.ts    physical bay camera travel and mobile orbit bounds
shared/flight-handoff.ts   paired camera/frame handoff and pre-hydration bridge
shared/flight-path.ts      one continuous landing-to-app camera path
shared/orbit-input.ts      pointer, touch, wheel and focused keyboard input
shared/pointer-aim.ts      damped fine-mouse offsets, separate from saved orbit
app/app/lib/              clients, wallet/session, SEP-10, receipt history
app/lib/hak-bindings/      regenerated from revised local kernel WASM
contracts/hak/            local kernel v3 security protocol
contracts/zk-preimage/    independent experimental Groth16 proof verifier
circuits/                 demo proof fixtures; NOT integrated with Pod claims
privacy/                  experimental v2 circuits, proving, DKG, disclosure and recovery; legacy v1 parser closed
contracts/private-pool/   separate pinned experimental testnet pool and client
scripts/build_site.sh     reproducible install/check/build/assemble
scripts/assemble-site.mjs  explicit documents + generated CSP hashes/_headers
scripts/preview-site.mjs   portable local preview honoring generated headers
app/site/                 generated deployment candidate (ignored)
```

The original working tree contained uncommitted user changes; they were retained.
A pre-revision tracked diff was saved outside the repository at
`/tmp/agyion-pre-orbit-changes.patch`. No commit was made at that initial checkpoint.

## Run and verify

```bash
npm run build
npm run preview
# Local portable preview defaults to http://127.0.0.1:4192
APP_BASE_URL=http://127.0.0.1:4192 npx playwright test
BASE_URL=http://127.0.0.1:4192 CHROMIUM_PATH=/opt/google/chrome/chrome npm --prefix landing run test:e2e
```

For an explicitly labelled local simulation, without changing production config:

```bash
NEXT_PUBLIC_HAK_MODE=mock npm --prefix app run build
node scripts/assemble-site.mjs --demo
SITE_DIR=artifacts/mock-site PORT=4193 npm run preview
MOCK_BASE_URL=http://127.0.0.1:4193 node scripts/mock-pod-check.mjs
# Then npm run build to regenerate the production-config candidate in app/site.
```

`app/.env.local` chooses mock or Soroban at build time. Never call a mock build
on-chain verification. Changing NEXT_PUBLIC variables requires rebuilding.
The real-config build currently references the old live testnet kernel and
intentionally refuses writes because that kernel lacks `protocol_version()==3`.
Read-only queries do not require a wallet. A valid new v3 deployment is needed
before the new transaction flows can operate on chain.

Local Cloudflare asset routing was additionally tested with Wrangler 4.118.0
and a local-only compatibility-date override 2026-08-06. Wrangler 4.138.0
started but hung on requests on this host. Production config remains 2026-09-20.
Do not silently change the production date to work around a local runtime issue.

## Security and migration

Read `contracts/hak/SECURITY_PROTOCOL.md` before any new deployment.
- Signed credentials now bind action + network + contract.
- Pod V3 opening requires recipient authorization and a locally generated,
  recipient/Pod/network/deployment-bound signature. No raw seed or commitment
  endpoint is sent through the SDK.
- Fresh Pod secrets must be saved before submitting a lock transaction.
- Confirmed transaction results/hashes come from the sent receipt, not simulation.
- Old locked funds remain under the old kernel. No automatic migration exists.
- The test wallet key and Pod seed stay in memory. Legacy Trigger/Envoy demo
  signer keys and generated Fade venue keys remain in session storage; they are
  not hardened production custody. Never silently erase keys for existing records.
- SEP-10 challenge and returned wallet transactions are verified before use.
- Wallet session changes invalidate signers, auth and outstanding UI operations.
- Long contract storage horizons still need maintenance/restoration; no keeper exists.
- The independent ZK verifier uses a pinned demo circuit/setup and is not production
  privacy infrastructure or part of the Pod payment path.

## Hosting

Cloudflare Worker `agyion`, custom domain `agyionlabs.dev`.
The candidate is `app/site/`, with `/app/index.html`, root landing, six explicit
HTML detail routes, and a 404 document. Missing assets must return 404.
Keep `_headers` generated by assembly; it contains hashes of Next inline scripts.
No script `unsafe-inline` or `unsafe-eval` is required by the verified flows.
Use `app/wrangler.toml` or equivalent authenticated Cloudflare assets upload;
do not reuse the historical SPA fallback/interceptor deployment recipe.

Full evidence and remaining limits: `docs/verification/2026-09-24-orbital-audit.md`.

## 2026-09-25: design research and product audit

The user rejected the narrow, patch-by-patch design approach and explicitly
requested deep research into crypto landing pages and applications. The result
is `docs/research/2026-09-25-crypto-design/README.md`, with a local visual board
at `index.html`, separate landing/app source reports, twelve prioritized product
findings in `agyion-audit.md`, and proposed delivery criteria in `QUALITY_GATE.md`.
Eight projects were researched; observed rendering, official documentation,
historical agency work and proposed Agyion decisions are distinguished.

No product runtime, production deployment or contract was changed in that research.
The black-hole/Endurance identity and user constraints remain. Known product
defects must not be hidden behind the preceding passing test counts. The unchanged
Fade component was characterized in `artifacts/research/fade-characterization/`:
claim/refund rejection leaves actions busy, and form remount replaces the venue
identity. Three desired-behavior assertions fail; these are open defects, with
wallet/client/key boundaries stubbed and no real transaction. Additional source,
visual and untested-device findings are explicitly classified in the audit.
The design brief proposes an instrument-specific vertical slice and readable
local holographic surfaces; it is not implemented design or user approval.

## 2026-09-25: research findings implemented

This checkpoint supersedes the research-only status and open-defect descriptions
in the preceding section. Current implementation and verification evidence are
in `docs/verification/2026-09-25-research-fixes/RESULTS.md`; earlier failed runs
remain preserved. Passing checks do not establish user design approval.

Instrument drafts survive tab switches, closing and inline help. Established
wallet changes clear them. Hidden instruments stop polling and local runner work;
reopening checks fresh ledger data while retaining the last verified display.
Fade reuses its generated session venue identity, offers explicit backup, releases
busy state after rejection and offers read-only recovery after a confirmed send
whose subsequent record read fails.

Public transaction metadata is saved before broadcast; secrets, proofs and signed
envelopes are excluded. Unknown outcomes block matching resubmission and can be
reconciled after reload. Late responses cannot erase confirmed evidence. History
opens records only on their matching network and contract; legacy unscoped entries
do not guess. Readiness distinguishes checking, ready, incompatible and unavailable
while keeping reads and preparation accessible. A read-only simulation confirmed
that the configured old testnet kernel lacks `protocol_version`; its explicit
missing-function diagnostic correctly shows incompatible, not a network outage.
At that checkpoint a new HAK deployment was required, with no automatic migration
of old funds. The current HAK requirement is V3; see the current status above.

Ramp quotes retain their amount, direction and timestamp, and become stale when
the draft changes. Registered withdrawal terms remain fixed. Envoy leads with
its actual nonpositive-price authority, claim-count limit, recipient and expiry.
Pod's landing/detail example checks three independent conditions before its
physical shell opens; its example action and app launch are distinct. App reading
surfaces, Pod requirements and mobile authority ordering were corrected and
visually checked.

Unit tests, production builds and desktop/mobile application, detail-page and Pod
example checks passed for this checkpoint. Read RESULTS for the latest exact
scope and artifacts. Final flights still hold the endpoint during software-renderer startup. Asset
warming, a validated renderer hint and prompt cover release are implemented.
The final measured cover release was about 1.2–1.3 seconds; the desktop landing
baseline was 2.4 seconds, but the detail baseline was already about 1.2 seconds.
Read RESULTS for event-versus-poll timing and retained external-network failures.
No native-GPU smoothness claim is made. Exact assembled-fee review and real mobile wallet/keyboard
behavior remain outside this patch, and the security audit is not declared complete.
No production publication, contract mutation, wallet signing or token transfer
was performed.

## 2026-09-26: user-requested finishing pass

The user explicitly liked the preceding design ("çok güzel olmuş") and asked for
small alignment fixes, one-quarter app horizontal drag sensitivity and repair of
the disconnected Endurance capsule. The implementation keeps that direction.
See `docs/verification/2026-09-26-polish/RESULTS.md` for exact changes and evidence.

App button label/icon groups, header tools, disclosure symbols and mobile wallet
wrapping are aligned. Landing/detail CTA and step labels are centered with equal
side tracks. Mobile network notices no longer squeeze text beside their retry
button. App horizontal pointer/touch drag now uses 0.25; other input axes, zoom,
keyboard steps and landing sensitivity are unchanged. A real rendered-camera
measurement confirmed the 0.25 ratio.

Endurance now has continuous hub-to-spoke connections, twelve correctly oriented
module tunnels and a supported front tender docking neck. Five camera angles
were visually inspected. Unit tests total 406 passing; both builds and lint pass.
Four-width browser layout checks completed, then the final mobile CSS was checked
again at 390/320px. Both layout runs retain one external testnet network-change
diagnostic and therefore are not recorded as fully clean end-to-end runs.

A fresh normal-motion landing-to-Pod flight passed without a second approach;
the video was reviewed. The existing software renderer startup hold remains
(1.746s navigation-to-cover-removal in this sample). No new smoothness claim,
production publication, chain mutation or real wallet action is made. The latest
assembled version is served locally on port 4192. The user said to review what
comes next after these finishing changes; do not expand this pass into deployment
or backend migration without subsequent direction.

## 2026-09-26: publication and renewed security scope

The user subsequently authorized Cloudflare publication and a GitHub source
checkpoint. The reviewed frontend is now live at `https://agyionlabs.dev/`, version
`dd57d7a0-9ea3-441e-9616-06d34dc89f8c`. Read
`docs/verification/2026-09-26-cloudflare-release.md` for live checks, retained CSP
and network diagnostics, previous rollback version and current limitations.

At this checkpoint the authorized scope became every-authored-file security
review and remediation; this sentence does not claim that review was completed.
The user additionally reported a white flash after launch and requested maximal
ZK/encrypted-token-style privacy for Pod, Trigger and Envoy, while keeping Fade
public. Confidentiality must support authorized selective disclosure with an
M-of-N model. This is a new subsystem, not a claim about the current demo verifier.
Do not copy Avalanche-restricted eERC source as if permissively licensed. No new
privacy contract, auditor committee or migration has been deployed.

Early reproduced review findings: Pod's plaintext preimage reaches RPC simulation
before wallet approval, and a delayed legitimate reveal allows another recipient
to commit then win the following ledger. Classic anchor payment lacks the durable
recovery used by the Soroban path and can repeat after a lost response. Evidence
is in ignored `artifacts/security/2026-09-26/`; source fixes and full coverage are
still in progress. Do not describe this checkpoint as a completed security audit.

## 2026-09-26: V3 remediation and privacy boundary

The source/publication checkpoint is `29db661` on the remote
`codex/orbital-redesign-security` branch. Subsequent local fixes replace Pod's
unsafe delayed commit/reveal model, add classic-payment recovery, prevent
cross-tab journal loss and tighten confirmation evidence. Binding generation
uses the compiled V3 WASM; the public fixture matches Rust and JavaScript bytes.

The white-flash report was not reproduced as a full white frame. Both HTML roots
now set the dark canvas before external CSS. A natural desktop launch with
1.5 seconds of injected app-script delay passed without console/network/CSP
errors; blocked-CSS/JS desktop/mobile screenshots are uniformly `#07090d`.
The document/WebGL replacement and software-renderer startup hold still exist.
Read `docs/security/2026-09-26/flight-flash.md` for exact scope and evidence.

The remainder of this section is the historical parser-only v1 checkpoint,
superseded by the private-v2 implementation recorded in `privacy/EXECUTION_V2.md`.
M-of-N in the original docs was a proposal, not implemented threshold disclosure.
The new design distinguishes single-attester Trigger authorization from a
disclosure committee and states the colluding-quorum limit. No existing record
is anonymous. The isolated `privacy/` package accepts canonical statements and
scoped request shapes only; proof acceptance/transfer activation always rejects.
Real private circuits, proof/encryption consistency, DKG, independent review,
setup provenance and chain/mobile budget measurements are outstanding.
