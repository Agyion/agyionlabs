# Directory header controls verification

The directory-only change moves the existing saved animation preference next to its header Launch app link and removes both footer controls. It was checked with `scripts/verify-directory-header.mjs` against the assembled local preview at `http://127.0.0.1:4292`.

## Local results

The initial matrix covered **1440, 1001, 1000, 768, 390 and 320** pixels, including both sides of the header layout breakpoint. Five cases passed. At 768 the inherited launch style produced a 42 pixel hit area, below the required 44 pixels. This failure remains recorded in `artifacts/verification/2026-09-27-directory-header-release/local/results.json`. That initial run also recorded one external Soroban `net::ERR_NETWORK_CHANGED` request and its console error at 1440; there were no JavaScript, HTTP or CSP errors.

After the scoped 44 pixel minimum-height fix, the rebuilt artifact `b6f143c0e63806bf3212219b7ab4bd549a834a8451e573202e2ec39a5346ed43` passed the **768-only followup with clean strict diagnostics**. The corrected header screenshot was inspected directly. The source hash set remained unchanged in each run; the initial failure was not overwritten.

The successful cases verify:

- Exactly one Launch app link and one Skip animation checkbox, both in the header; neither remains in the directory footer.
- Header controls remain within the viewport without overlap. Preference/launch/menu text is at least 14 pixels and the tested action hit areas are at least 44 pixels.
- The preference sits beside Launch app; mobile navigation opens and closes; clicking Instruments on the current route focuses a title clear of the taller fixed header.
- Clicking the checkbox updates the existing stored preference. Home-to-directory roundtrip retains that choice without adding duplicate controls.
- The actual header link opens the app with animation skipped. Initial successful widths requested the app document in 4–7 milliseconds. A separate unchecked 1440 launch restored the normal flight, taking 11.23 seconds to request the app document.

The 1440 header, 320 header, 390 open menu and corrected 768 header screenshots were visually inspected. No wallet was connected and no signing or transaction action was invoked. Browsers were closed after both runs.

Followup evidence: `artifacts/verification/2026-09-27-directory-header-release/local-768-followup/results.json`.

## Public-site repeat

The same probe supports `BASE_URL`, `QA_WIDTHS`, `QA_OUTPUT_DIR` and `QA_NORMAL_FLIGHT=0`. The last flag omits the already-tested unchecked full flight, while still exercising actual checked header launches. All JavaScript, console, network, HTTP and CSP errors remain strict and are retained in the report.

After the parent published version `169750d6-6647-4c13-9db7-9b94cf8d88e8`, the probe repeated against `https://agyionlabs.dev` at **1440 and 390 pixels**. Both UI cases passed, including the real checked header launch, which requested the app document in 6 milliseconds at both widths. The live mobile header screenshot was inspected directly. Five screenshots were saved, the tracked source hashes stayed stable, and the browser closed.

The live **strict diagnostic result failed**. Four requests for the Cloudflare Insights beacon were blocked by CSP, and four inline-script CSP violations were recorded, producing eight console errors and eight CSP events. No JavaScript exception, HTTP error or Soroban RPC failure was recorded. These diagnostics remain in the report; the passing UI result does not claim that the pre-existing production script-injection/CSP issue is resolved.

Live evidence: `artifacts/verification/2026-09-27-directory-header-release/live/results.json`.
