# Agyion — current local handoff

Updated 2026-09-26. Working branch: `codex/orbital-redesign-security`.
The original handoff is preserved in `docs/archive/HANDOFF-before-orbital-revision.md`.
Its mint landing, missing `/mnt/agents/output/app` source, frontend-only mock,
8-second docking sequence and live-verification claims describe the earlier
production bundle. They are not instructions or evidence for this revision.

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
- Landing now uses one immersive world with a large Agyion wordmark and four
  physical, selectable mechanisms around the black hole. Fixed HTML controls
  remain accessible; descriptions appear on selection. A native centered dialog
  replaces the separate process section. Mobile uses a compact inline wordmark.
- Instrument forms separate editable inputs, actual draft summaries and existing
  records. The six public detail pages share the landing typography and palette.
  The workspace follows the actual header height and scrolls as a whole on short
  screens; its closing/reopening preserves the mounted form draft.
- No Pause motion button. OS reduced-motion preference and explicit interaction
  coexist; forms, keyboard access and renderer failure fallbacks remain usable.
- User authorized source revision and testing. No production/chain deployment,
  push, account transfer or live signing has been performed in this pass.

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

The latest Open-link and spatial-detail correction is documented in
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
contracts/hak/            kernel v2 security protocol
contracts/zk-preimage/    independent experimental Groth16 proof verifier
circuits/                 demo proof fixtures; NOT integrated with Pod claims
scripts/build_site.sh     reproducible install/check/build/assemble
scripts/assemble-site.mjs  explicit documents + generated CSP hashes/_headers
scripts/preview-site.mjs   portable local preview honoring generated headers
app/site/                 generated deployment candidate (ignored)
```

The original working tree contained uncommitted user changes; they were retained.
A pre-revision tracked diff was saved outside the repository at
`/tmp/agyion-pre-orbit-changes.patch`. No commit was made.

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
intentionally refuses writes because that kernel lacks `protocol_version()==2`.
Read-only queries do not require a wallet. A valid new v2 deployment is needed
before the new transaction flows can operate on chain.

Local Cloudflare asset routing was additionally tested with Wrangler 4.118.0
and a local-only compatibility-date override 2026-08-06. Wrangler 4.138.0
started but hung on requests on this host. Production config remains 2026-09-20.
Do not silently change the production date to work around a local runtime issue.

## Security and migration

Read `contracts/hak/SECURITY_PROTOCOL.md` before any new deployment.
- Signed credentials now bind action + network + contract.
- Pod opening requires a recipient commitment in an earlier confirmed ledger.
- Fresh Pod secrets must be saved before submitting a lock transaction.
- Confirmed transaction results/hashes come from the sent receipt, not simulation.
- Old locked funds remain under the old kernel. No automatic migration exists.
- Test private keys live only in memory and can sign testnet only.
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
A new v2 deployment is still required, with no automatic migration of old funds.

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

The active task is now every-authored-file security review and remediation.
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
