# Final alignment, orbit sensitivity and Endurance connections

Date: 2026-09-26. Local assembled preview: http://127.0.0.1:4192/.

The user explicitly liked the preceding design and requested finishing details,
one-quarter horizontal app drag sensitivity, and repair of disconnected spacecraft
parts. This checkpoint preserves the accepted visual direction. No production
deployment, backend change, wallet connection or transaction signing was performed.

## Changes

- Shared app buttons center their label/icon group, use fixed SVG icon dimensions,
  allow long text to wrap, and retain 44px targets. Help/close controls and disclosure
  symbols have consistent alignment. Mobile workspace titles/tools use normal grid
  flow. Wallet addresses, provider labels, error messages and action rows wrap;
  long account/error states use the full mobile header width. Mobile network
  notices place their retry button below the text.
- How-it-works steps and detail-page step labels use equal side tracks. Landing
  and detail launch buttons balance their arrow with an equal empty track. No
  new user-facing control, copy section or design system was introduced.
- Horizontal pointer/touch drag multiplies its angle by 0.25 in station mode.
  Landing drag, vertical movement, keyboard steps, wheel and pinch zoom retain
  their previous behavior.
- Four station spokes now overlap the hub and module floor, with root collars.
  Twelve hatch-to-hatch tunnels connect the rotated wheel modules. The front
  tender has an overlapping docking neck, angled joint, belly collar and two
  stays; the collar and engine seam also overlap. Existing instanced geometry
  and materials are reused; the model test bounds its visible mesh batches at 23.

## Verification

- Full unit suite: **406 passed** (56 landing, 350 app). Both production builds,
  landing lint, app build lint/type checks and `git diff --check` passed.
  Logs: `artifacts/verification/2026-09-26-polish/final/`.
- Four-width browser pass at **1440, 768, 390 and 320px** completed all 84 layout
  check groups. They include all six instruments, inline help, expanded native
  disclosures, Ramp withdrawal, the How dialog, six detail routes and synthetic
  wallet states. The 196 button observations had zero horizontal group offset,
  at most 0.78125px vertical offset, at least 44px height and no clipped contents.
  No workspace/header overlap or horizontal page overflow was observed.
  Evidence: `after-verified/verification.json` under the artifact directory above.
- After the last mobile-only CSS refinements, the **390/320px** checks ran again:
  all 46 layout groups and 102 button observations completed, with the same
  alignment bounds. Evidence: `final-mobile/verification.json`.
- **The two browser runs are not clean network passes.** Each retains one live
  `https://soroban-testnet.stellar.org/` request failure, `net::ERR_NETWORK_CHANGED`,
  and its corresponding console diagnostic. There were no JavaScript page errors
  or local-asset failures. Their overall report status remains `failed`; completed
  layout assertions must not be described as a fully green end-to-end run.
- A real mouse drag was measured from the fixed star mesh's camera view matrix:
  120px produced 0.523598776 radians on landing and 0.130899691 in the app,
  a ratio of **0.2499999943**. Home restored the camera and ArrowRight retained
  its 0.07-radian step. This run had no console, page or request failures.
  Evidence: `sensitivity/results.json`. Unit tests separately cover mouse,
  touch/pen, two-finger pan, unchanged pinch zoom and unchanged keyboard steps.
- Reviewed actual screenshots of all six desktop and 320px panels, tablet layout,
  help, How/detail controls and long mobile wallet states. Wallet fragments render
  the actual WalletBar component with explicitly synthetic state and real header
  markup/CSS; they do not establish real wallet-provider integration. Their first
  harness version omitted UTF-8 metadata; corrected final fixtures include it.
- Reviewed Endurance at front, quarter, side, rear and below, alongside the previous
  geometry. The visible hub/spoke gaps and floating tender are joined. Images:
  `after-verified/model-*.png`; prior images remain in `before/`.
- Normal-motion **landing → Pod** flight passed: destination preserved, no second
  arrival phase, no new shader links during flight, no network/console/page/CSP
  diagnostics. The observed flight lasted 10.352s. The full video and consecutive
  midpoint/navigation/reveal frames were reviewed in `flight/landing-pod/`.
  Software startup still holds the destination frame: readiness/cover removal
  occurred **1.746s** after navigation in this sample (the polling observation was
  later, at 2.186s). This is not a native-GPU smoothness claim or a fix for the
  previously documented renderer-startup hold.

The original failed harness attempt remains in `after/`: it measured only child
elements and produced NaN for the raw-text Load button. The corrected harness
also measures nonempty direct text nodes using DOM ranges. No failed evidence was
deleted or relabeled as passing.

The existing testnet protocol-v2 incompatibility and broader security/deployment
work remain as documented in the preceding checkpoint. This finishing pass does
not claim that those separate tasks are complete.
