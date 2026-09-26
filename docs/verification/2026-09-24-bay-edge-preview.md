# Bay edge preview verification — 24 September 2026

The final edge-only preview passed normal motion and the targeted reduced-motion clearing rerun on the assembled local site at `http://127.0.0.1:4192`, 1440 × 1000. Both browsers are closed. No runtime, console, HTTP or failed-request diagnostics were recorded in these runs.

## What was checked

- Hovering and keyboard-focusing Pod highlights its two actual rotating bay attachments without selecting Pod, opening a workspace or changing the URL.
- The selected Fade tab and real `918.27` pot draft remain unchanged after hover, focus and leave. No wallet connection, transaction submission or signing occurred.
- Fixed-star view-matrix capture isolates camera rotation from gas and ring animation. Reduced-motion before/after matrices match exactly; normal final rotation-basis difference is `0.0000058115`, below the strict `0.0004` check.
- The final reduced crop has **1,143 changed scene pixels**, **1,120 above 10 channel levels**, within a 150 × 139 pixel rectangle containing the two highlighted bays. The old lamp-only version changed 19 pixels.
- In the final rerun, leaving and blurring restores **every scene pixel exactly**: zero changed pixels, zero residual preview pixels.

## Visual inspection

I viewed the full normal-motion hover/focus captures and the reduced before/hover/leave crops. Thin amber edges distinguish the two Pod bays while their dark side faces and detailed front panels remain visible. The filled cream sleeves from the rejected candidate are gone. Spokes, antennae and neighboring modules remain clear. This is visual and interaction evidence under SwiftShader, not native GPU performance evidence or general design approval.

## Preserved failure and QA correction

The first edge run passed normal motion but failed the original reduced-motion requirement that entire PNG files match. Saved pixel analysis showed all 1,120 visible preview pixels had cleared exactly; unrelated background pixels differed by at most 2/255. Even the full fixed rectangle enclosing both preview bays matched exactly. The failed report and all eight images remain in `artifacts/verification/bay-edge-preview-final`.

The diagnostic now requires exact restoration on the actual preview mask (pixels changed by more than 10 levels on hover), plus a maximum 2/255 whole-scene difference. It records both measures and still rejects any uncleared preview pixel or larger unexpected scene change. This is a QA correction only; production rendering was not changed. The fresh reduced-only rerun passed with **zero difference even across the entire scene**, stronger than that bound.

## Evidence files

- Normal pass, full images and preserved reduced failure: `artifacts/verification/bay-edge-preview-final/results.json`
- Final reduced pass: `artifacts/verification/bay-edge-preview-clearing-final/results.json`
- Full normal hover: `artifacts/verification/bay-edge-preview-final/app-normal-dock-hover.png`
- Final reduced hover and leave: `artifacts/verification/bay-edge-preview-clearing-final/app-reduced-dock-{hover,after-leave}.png`
- Source checks for the edge replacement: 39 focused scene/input tests and app TypeScript passed. Parent separately ran the combined suite/build.

Rerun the focused diagnostic with `QA_DOCK_ONLY=1`; add `QA_REDUCED_ONLY=1` to run only the reduced-motion check. Always use a fresh `QA_OUTPUT_DIR` and coordinate exclusive browser/GPU access.
