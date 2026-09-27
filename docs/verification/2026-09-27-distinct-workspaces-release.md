# Readable instrument workspaces release

**Published to Cloudflare. Artifact and UI assertions passed; strict production diagnostics remain failed for the existing edge-script CSP conflicts and external testnet requests.** The first redesign was superseded by the user's feedback about small text, crowding and alignment. Only the final artifact identified below is a release candidate.

## Resulting interface

The catalog now has one heading and one short use case per instrument. Detail pages have one product heading, one working example and one primary launch. Repeated captions, summary strips, numeric terms blocks and explanatory paragraphs were removed. Additional conditions remain in named disclosures; existing example stages, alternate outcomes and resets remain available.

App workspaces use a centered task heading, grouped values and one centered main action. Body explanations use 16 pixel text and visible labels/metadata at least 14 pixels. Six instruments retain distinct arrangements: Fade price terms and curve, Pod amount/time and key backup, Trigger payment conditions, Envoy authority limits, Ramp conversion and Ledger receipt history. Paired main/support regions use roughly 62/38 proportions where appropriate; this is a layout decision, not a claim about mathematical usability. The 320 pixel dock uses two rows to keep its labels readable.

The last user refinements center the orange Fade connector itself, increase the current mouse/touch drag gain by 50 percent on both axes, and make the common app window 94 percent opaque without reducing text/control opacity. Selection now moves the camera to the real rotating bay from a common black-hole-facing side, instead of following the ring's rotating radial direction around the spacecraft. Free manual orbit and the spacecraft's own spin remain independent.

The app gas disk advances 25 percent faster on an independent integrated phase shared by both gas layers. A validated optional handoff phase preserves the first app frame. The camera, spacecraft and landing clock are unchanged by this speed adjustment.

Previously pending changes are included: remembered Skip animation, removal of duplicate navigation/launch controls, slower dragging (now increased by 50 percent from that quarter-sensitivity checkpoint), filtered stars, matching favicon variants, homepage refinements and everyday examples. Earlier client correctness changes are retained. No contract was deployed.

## Verification

The full second-redesign workspace run passed 66 structural/interaction checks across 1440, 390 and 320 pixels and normal-motion cases. Its typography audit found two real defects: small topbar wallet text and a narrow Ramp action offset. Both were corrected. The raw failure remains preserved. The initial targeted follow-up exposed a verifier error that counted a hidden decorative SVG at (0,0); that report is also retained separately from the corrected audit.

Ledger's extreme signed i128 amounts passed 16 fixture checks at 320, 390, 768 and 1440 pixels. All digits remain present and wrap without clipping. These fixtures are clearly synthetic, unsigned local browser history; they do not represent transactions.

A structural comparison with the pre-simplification panels found non-view logic and all 173 control attributes unchanged. This supports a bounded behavior-preservation review, not a whole-repository security audit. Builds and source checks are recorded with their raw logs; the obsolete Ledger copy assertion was updated and its 98-test panel suite passed.

The user then identified the orange connector between Fade price inputs still aligned at the left. Earlier centering checks covered headings and buttons, not this glyph. Its left margin was removed and its text centered across the price-field column. This specific correction is included in the rebuilt artifact and receives a rendered-glyph position check before publication. The separate camera regression failed on the old behavior at all three tested viewports and passed after the camera correction: all six bays, five ring phases, intermediate transitions, the scene roll, unchanged spacecraft matrices and manual-control inheritance are covered.

The final full application suite passed 610 tests. Both final production builds passed. Landing previously passed 89 tests and lint; the subsequent landing edit only changes the narrow stage rail CSS. Six unchanged release-tool tests passed earlier in this turn. Final browser outcomes are appended after completion. No earlier superseded screenshot suite establishes acceptance of the final artifact.

Evidence:

- `artifacts/verification/2026-09-27-readable-workspaces/results.json`
- `artifacts/verification/2026-09-27-readable-workspaces/final-controls/results.json`
- `artifacts/verification/2026-09-27-readable-workspaces/final-controls-corrected-audit/results.json`
- `artifacts/verification/2026-09-27-ledger-long-amounts-final/results.json`
- `artifacts/verification/2026-09-27-distinct-workspaces-release/simplification-control-preservation.json`
- `artifacts/verification/2026-09-27-distinct-workspaces-release/`

## Focused final refinements

- Fade connector and window surface: five width cases passed, including rendered glyph centering at 1440/1024/768 and retained 390/320 price layouts. Trigger's window alpha is .94, with effective text/input/button opacity 1. Strict diagnostics are clean.
- Camera focus: 14 real UI cases passed across all six instruments and a return to Fade at 1440/390. Of 749 observed matrices, 658 transition/settled frames after the initial approach were asserted; the black-hole center stayed in front and inside the viewport. The eye translated 2.67 to 4.94 world units. One external Soroban network failure keeps this probe's strict diagnostic result failed.
- Input sensitivity: six actual mouse/touch cases passed with clean strict diagnostics. Landing yaw is .375, app yaw .09375 and pitch .375, each 1.5 times its prior setting. Native vertical landing scrolling, .07 keyboard increments, reset and zoom remain independent.
- The earlier landing example run passed 79 checks before a 320 pixel stage label overflow. Only the stage rail at widths at or below 360 pixels was changed to two columns; labels retain their 14 pixel size. The initial failure is preserved. The final narrow/interruption run passed 27 of 27 checks with clean diagnostics. Combined with the unchanged wider layouts from the preceding run, all 105 unique cases are covered. Two additional Pod note checks at 1440/390 confirmed 16 pixel complete, unobscured safety text; the apparent clipping occurred only in a tall-element capture.

See `docs/verification/2026-09-27-final-orbit.md`, the `2026-09-27-final-orbit/sensitivity/` evidence directory and `2026-09-27-readable-examples/` raw reports.

The final navigation run passed all 25 cases with clean strict diagnostics: real departure, remembered skip, cross-tab/blocked storage, stale-frame suppression, canonical routes, keyboard/native links and 320 pixel placement. Evidence: `artifacts/verification/2026-09-27-final-orbit/navigation/results.json`.

## Frozen artifact

The upload is the reviewed working tree, including preserved earlier changes. Git HEAD alone does not identify its source. The release manifest records 461 source hashes and 244 artifact files after the connector, input and focus corrections were assembled.

Artifact tree SHA-256: `1dd204a78ee3d085c988fad82817b7e7d556c2c91a568549403083b1c5469ae9`.

Cloudflare's configuration dry run passed. Worker `agyion` retains its existing domain, direct static assets, route policy and variables. The pre-release active version and rollback target is `8b79160d-6429-447f-ba82-1075598dfca2`. Fresh deployment listing confirmed it before publication.

## Publication

Published to `https://agyionlabs.dev/` on 27 September 2026 at 04:36:42 Istanbul. Cloudflare confirms Worker `agyion`, version `c004d8e9-5b0b-4cec-821f-24e3642347f3`, at 100 percent traffic. Rollback is `8b79160d-6429-447f-ba82-1075598dfca2`. Upload and active deployment evidence are in `deploy.log` and `deployments-after.log` in the release evidence directory. Production verification completed against the custom domain. All 34 HTTP checks passed, including HTML/application bytes, immutable assets, the app manifest, four favicon formats, security headers and absent-resource/.env 404s. Cloudflare's known JavaScript Detection injection is accounted for by the existing narrow normalization; unexpected body changes remain failures. All 14 UI assertions passed: landing scene/canonical navigation, each of six workspaces at 1440 and 390, and the incompatible-kernel write gate. No application page exception or assertion failure occurred. The live desktop Fade and mobile Pod screenshots were inspected directly.

The strict production result remains **failed**, with six console errors, four request failures and four CSP events. Cloudflare's injected Insights beacon and inline JavaScript Detection snippets conflict with the existing strict script policy; two external Soroban testnet requests failed with `ERR_NETWORK_CHANGED`. These previously observed diagnostics remain in `live/results.json`; no CSP weakening, diagnostic filtering or silent pass conversion was applied. The configured kernel reports `incompatible`, and protected writes remain disabled. The published artifact has no observed new application/UI regression in this bounded check.

Live evidence: `artifacts/verification/2026-09-27-distinct-workspaces-release/live/results.json` and its 14 screenshots. This release does not imply completion of backend/security work.

## Boundaries

No wallet was connected, no transaction signed or sent, and no contract, privacy pool or funds were migrated. The configured incompatible/unavailable testnet kernel remains behind the client write gate. Browser runs use headless Chrome with software graphics and touch emulation; they do not establish native-device frame rate. External testnet network failures remain in strict raw diagnostics and must not be reported as clean passes. The prior whole-repository security review remains incomplete.
