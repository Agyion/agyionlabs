# Visual runtime and style security review

Date: 27 September 2026. This is a bounded source review of the owned landing,
legacy landing components, shared scene renderer and styles. Every line of the
92 exact snapshots in [visual-runtime-coverage.json](visual-runtime-coverage.json)
was read: 64 runtime files / 8,627 lines, 27 style files / 7,743 lines and one
type-definition file / 601 lines, totaling 16,971 lines. The JSON records the
inclusive line range and SHA-256 for each file. It separates style and type
coverage from executable runtime coverage. No UI, runtime source or deployment
was changed by this part of the review.

No new confirmed security vulnerability was established in this scope. This
means the examined trust boundaries did not yield a reproduced defect; it is
not proof that the application cannot be exploited or an independent audit.

## Trust boundaries examined

- Dynamic text uses React escaping or `textContent`. No reviewed runtime uses
  string evaluation or unsafe HTML insertion. Shader text is a fixed local
  template, not assembled from route, network or wallet input. Texture/model
  loading in the shared renderer does not accept an external user-supplied URL.
- Landing demonstrations do not sign transactions, possess wallet keys or send
  money. Example/animation state is illustrative and is not an authorization
  gate. Active instrument examples describe their public-data and experimental
  privacy limits. Presentation calculations are not substitutes for contract
  arithmetic checks reviewed elsewhere.
- The active instrument route guards the details map with `hasOwnProperty`.
  Scene/custom-event selection is constrained to known instrument identifiers.
  Launch interception accepts same-origin application links, skips modified
  clicks/downloads/other targets and retains the native navigation fallback.
  It uses fixed dynamic imports and cancels stale work on unmount/navigation.
  Transition inert state, timers and popstate handlers have cleanup. Flight
  storage preference and handoff implementations were separately reviewed by
  the platform reviewer and are excluded from this manifest.
- Pointer capture is released on cancellation, blur and disposal. The shared
  camera limits pitch/zoom and uses fixed module anchors. Event coordinates do
  not enter transaction arguments or dynamic script execution. Synthetic
  same-origin events are not treated as wallet authorization.
- Scene stars, geometry and animation arrays have fixed source-defined counts.
  The transfer particle is reused rather than allocated per financial event.
  Pixel ratio is capped; reduced-motion, hidden-document and lost-context paths
  constrain rendering. Cleanup disposes owned GPU resources and removes RAF,
  listeners and observers. Renderer information is used locally to select a
  software-rendering path; this renderer does not transmit the fingerprint.
- CSS was read for remote imports/URLs, dynamic URL construction, hidden wallet
  state and overlay interception. Font references are local, SVG gradient URLs
  refer to fragments, and decorative overlays disable pointer interception.
  The reviewed styles contain no remote CSS URL exfiltration surface or
  executable CSS expression. Attribute text is used for cursor/404 decoration,
  not a secret form value. This is source inspection, not an optical/browser
  validation of every breakpoint or stacking interaction.
- The retained 404 game stores only its cosmetic score under
  `fluid-404-dino-hi`, with storage exceptions handled. Corrupt numeric values
  can affect that display; this namespace does not contain funds, key material
  or transaction recovery records. Financial storage and wallet integration
  are outside this renderer's responsibilities.

## Retained source that is not the assembled homepage

`landing/src/pages/instruments-data.ts` has no active import and retains an old
kernel address and obsolete Envoy spending-policy copy. The current route uses
`Instrument.tsx` and the active configuration instead. The inactive module must
not be re-enabled as current product documentation without reconciliation.

The older About/Blog/Contact/Lab/Work templates are not registered by the active
landing router. The Contact template's submit path is a local delay, not a
message-delivery backend. Local success there is not delivery evidence. The Lab
video/body-class and progress display paths remain legacy presentation code;
this review did not execute or repair those unused demonstrations.

The Next root page retains `app/app/components/landing` components, including
older automation/Envoy wording and a locally generated ledger ticker. The
combined release assembler copies the Vite landing to the public root, and
copies `_next`, `app`, `404.html`, `favicon.svg` and `zk` from the application
export. It does not copy the Next root `index.html`. These retained components
must not be represented as current live contract behavior or real ledger data
if that alternate root is restored. Their complete source is included in the
manifest despite their inactive combined-site role.

## Verification boundaries and remaining uncertainty

This phase was read-only; no extra test count is claimed for it. Parent-run
browser/build/deployment evidence and the other reviewers' client, platform,
contract and cryptography reports remain separate. Searches for execution and
network sinks were supplementary to the complete source read, not a substitute
for it. No source file is marked reviewed merely because tests touched it.

GPU allocation failures during initial renderer construction were not injected.
If construction throws after allocating resources but before returning its
handle, callers may have no handle to dispose; this is a remaining failure-path
question, not a reproduced remote vulnerability. Very large viewports, ten-frame
noise canvas storage and proportional fluid buffers were not stress-tested for
device memory exhaustion. No attacker-controlled remote dimension source was
identified in these paths. Browser/GPU-driver correctness and user-device
performance are outside this source review.

The manifest excludes the platform-owned entry/config/navigation helpers,
shared flight preference/handoff, UI test sources, generated bindings, vendor
and transitive dependency implementation, images/fonts/binary contents and
build output. It does not establish network anonymity, prove a cryptographic
statement or authorize mainnet funds. Those boundaries must remain visible when
combining this report with repository coverage.
