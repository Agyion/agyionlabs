# Readable workspace verification

The simplified, assembled site at `http://127.0.0.1:4292` was checked with `scripts/verify-workspace-redesign.mjs`. The parent identified this build's artifact tree as `b33f3bff34c4809fd7cc5797ed06bf6048e4a4a44928f89bf4e6a3b48279425c`.

## Result before targeted fixes

**66 structural and interaction checks passed. The typography check failed. The strict overall result is failed.** These results must not be presented as acceptance of the subsequent targeted CSS fixes without their separate verification.

- Reduced-motion coverage: 1440, 390 and 320 pixel widths, all six catalog routes and details, and all six actual app workspaces.
- Normal-motion coverage: 1440 and 390 pixel widths, real opening, switching and closing transitions.
- Typography: 48 surfaces measured. The 28 recorded violations consist of 27 repetitions of one topbar defect, plus one narrow Ramp button alignment defect.
- The topbar `Connect wallet` label measures 13 pixels at 1440 and 11 pixels at 390/320, below the 14 pixel floor. The form and page text checks otherwise passed.
- At 320 pixels, `Get deposit instructions` wraps to two lines. The text-and-arrow bounds are 18.84 pixels right of the button center, beyond the 3 pixel tolerance. The action remains visible and usable, but its content alignment requires adjustment.
- Three requests to `https://soroban-testnet.stellar.org/` failed with `net::ERR_NETWORK_CHANGED`: one in the 1440 pixel reduced-motion context and two at 390. The corresponding console errors remain recorded and cause the strict diagnostic failure.
- No recorded JavaScript/shader exception, CSP violation, HTTP error, local asset failure, or transaction submission.

All expected fields/actions were present, reachable and within their reading surfaces. Contract instruments kept protected writes disabled in the incompatible deployment state. Ordinary unsigned drafts survived instrument changes; Help, Escape, closing and reopening preserved focus and the ordinary Pod draft. No wallet was connected, no secret was prepared, and no transaction action was invoked.

The run produced 91 screenshots. Mobile Pod top, Envoy detail hero, 320 pixel Fade submission area and the 320 pixel Ramp submission area were inspected directly. The newly shortened Envoy example heading fits its mobile group. The two typography findings were sent to the parent immediately. The browser closed before the Ledger fixture received the GPU slot.

## Evidence and limits

### Final controls followup

The final assembled artifact `f0f25319f2bb71ee123507169ee6aebc2c54214e3fe7e777bd8b728c73efe6ac` was checked again at 1440, 390 and 320 pixels in app-only scope. Unchanged normal-motion cases were not repeated. **44 of 44 UI and typography checks passed**, with zero typography, centering or clipping violations across 27 scanned surfaces. `Connect wallet` measures 14 pixels at all three widths. Primary button content now meets the 3 pixel centering tolerance, including the 320 pixel Ramp action.

At 320 pixels, the dock has two rows of three buttons. The workspace ends at y=768 in the 900 pixel viewport, reserving exactly 132 pixels below it. Actual Pod and Ramp screenshots were inspected: all six tabs fit, the dock does not cover the workspace, and the Ramp action is one centered line. The script exercised all tabs and the same draft/focus interactions at this width.

The first final-controls run exposed a measurement bug: a descendant SVG under a `display:none` parent contributed its zero-size `(0,0)` rectangle to button bounds. That run is preserved in `final-controls/`. The audit helper was corrected to require actual rendered icon geometry and record the hidden-icon exclusion. No runtime source or assembled artifact changed. The complete app scope was then rerun; valid evidence is in `final-controls-corrected-audit/results.json`, `typography.json`, and the asserted `control-summary.json` under the readable-workspaces artifact directory.

The final strict diagnostic result still **failed** on three external Soroban `net::ERR_NETWORK_CHANGED` requests and three corresponding console errors. No JavaScript/shader exception, HTTP error, CSP violation, local asset failure, or transaction submission was recorded. The browser was closed and the GPU slot released for the separate landing examples matrix. This result establishes app interaction/typography behavior, not successful RPC availability.

Raw results: `artifacts/verification/2026-09-27-readable-workspaces/results.json`.

Measured text, exclusion reasons, glyph centers and every violation: `artifacts/verification/2026-09-27-readable-workspaces/typography.json`.

The source hash set stayed unchanged within each completed run. The final-controls followup above covers the rebuilt topbar, button and dock fixes; the earlier failed report remains intact. SVG text and CSS-generated text are outside the HTML typography measurement. Headless Chrome/SwiftShader and emulated touch do not establish native GPU performance, real-wallet settlement, or complete accessibility/security coverage.
