# Workspace and instrument-page verification

The first integrated redesign was checked against the assembled site at `http://127.0.0.1:4292` using `scripts/verify-workspace-redesign.mjs`.

**Superseded visual design.** After these runs, the user rejected the typography density and alignment. Deployment was stopped before publication. The functional results below remain evidence for their recorded builds; they do not establish acceptance of the design or the next revision. New browser runs were paused while the source was reopened.

## Result

- **66 of 66 UI checks passed.** Structural checks cover 1440, 390 and 320 pixel widths with reduced motion. Separate 1440 and 390 pixel runs exercise real, unaccelerated opening/closing transitions.
- **The strict overall result is failed.** Three requests to `https://soroban-testnet.stellar.org/` failed with `net::ERR_NETWORK_CHANGED` in the 390 pixel context, producing three console errors. The errors remain in the raw report; they were not filtered or converted to passes.
- No JavaScript or shader exception, HTTP error, CSP violation, failed local asset request, or transaction submission was recorded.
- The four contract instruments reported an incompatible deployment and kept protected writes disabled. Ramp authentication/deposit/withdrawal actions stayed disabled while disconnected. Ledger showed its real empty-history state.

## What was exercised

Every catalog entry was followed through its real link to the corresponding detail route. The six pages retain a working first example step and reset control; the full multi-step examples are covered by a separate verifier. The removed “Agyion instruments” copy does not appear.

Each app panel contains its actual form, fields, headings, and actions. The test scrolls each control into the reading surface, checks its clipping boundaries and center-point visibility, and saves both panel-top and submission-area screenshots. It does not accept the existence of an empty panel as success.

Unsigned values survive instrument changes for Fade, Pod, Trigger, Envoy and Ramp. Pod's ordinary amount/time fields survive closing and reopening. Help closes first on Escape and returns focus to its trigger; a second Escape closes the workspace and returns focus to the selected instrument. No wallet was connected, no secret was prepared or copied, and no transaction action was invoked.

The run produced 91 screenshots. Desktop Fade, Pod and catalog captures plus mobile Fade, Envoy and Ramp captures were visually inspected in this task. The parent review also inspected the other product layouts and identified three additional CSS refinements for a subsequent build: Pod safety-text size, long Ledger amounts, and remaining blue surfaces. This report is evidence for the tested build before those refinements; the application must be rechecked after they are assembled.

Raw evidence is in `artifacts/verification/2026-09-27-workspace-redesign/results.json`, alongside screenshots. That report records source hashes at the start and end; the source set stayed stable during this run.

## App CSS followup, before typography revision

The subsequent app-only run covered the assembled CSS refinements at the same three widths and both normal-motion widths. **45 of 45 UI checks passed**, with 52 screenshots and an unchanged source set. The tested assembled artifact tree was identified by the parent as `6fde19f1c291fa4a0e33244ebca55d37ffe7ab6d334c063fdd6fb824d400ad44`.

The strict result remained **failed**: four external Soroban RPC requests failed with `net::ERR_NETWORK_CHANGED`, producing four console errors. Three occurred in the 320 pixel reduced-motion context and one in the 1440 pixel normal-motion context. There were no recorded JavaScript/shader exceptions, HTTP errors, CSP violations, local asset failures, or prohibited transaction requests. Protected writes remained disabled.

Evidence is in `artifacts/verification/2026-09-27-workspace-redesign/app-css-followup/results.json`. The 390 pixel Pod top and 320 pixel Pod action screenshots were inspected directly. They show actual forms and reachable actions; this inspection does not override the user's rejection of small, excessive text. The planned final Ledger catalog SVG captures and long-amount fixture were paused on the new feedback. The browser was closed and no deployment was performed by this verifier.

## Repeatable scopes

The verifier supports `BASE_URL`, `QA_OUTPUT_DIR`, `QA_WIDTHS`, `QA_MOTION_WIDTHS`, and `QA_SCOPE=all|app|landing`. It can be reused on the public site after deployment. The app-only scope avoids repeating unchanged catalog/detail coverage after app CSS refinements. Network, console and CSP diagnostics remain strict in every scope and do not abort the remaining UI cases.

The next typography revision adds `scripts/lib/typography-audit.mjs` to this verifier. It examines rendered HTML text and control font sizes, including reachable content below the fold; excludes hidden, closed-disclosure and screen-reader-only content with an explicit reason; and preserves every measured text run and violation in `typography.json`. The baseline is 14 CSS pixels, with explanatory paragraphs at 16. Named footer/status metadata and landing example disclosures may be 14; form safety paragraphs retain the 16 pixel rule. Workspace and workbench headings are compared with the center of their group, and primary-button glyphs with their button, using a 3 pixel tolerance. Cropped text and horizontal overflow fail the audit. SVG lettering and CSS-generated content remain outside this HTML-text measurement. The new checks have been syntax-checked but have not yet been run against the new build. Earlier results above do not include them.

Catalog, example and panel character-count requirements were removed. Their checks now use real headings, illustrations, example controls, fields and transaction-availability behavior; reducing redundant copy cannot fail a text-length quota.

These are headless Chrome/SwiftShader and emulated-touch checks, not a claim of native GPU frame rate, live wallet settlement, complete accessibility compliance, or a full security audit.
