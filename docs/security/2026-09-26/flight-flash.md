# Launch document first-paint protection

Date: 2026-09-26. Scope: the reported white screen between the completed landing
flight and `/app/`. This is a narrow frontend hardening change, not a redesign.

## Evidence and diagnosis boundary

- The production recording at
  `artifacts/verification/2026-09-26-cloudflare-release/live-flight/landing-pod/video/page@80042d38ea871b9e7c1b01d5d8cf14fe.webm`
  did **not reproduce a full white frame**. All 460 decoded frames were scanned
  at 160×100; the maximum fraction with every RGB channel ≥230 was 1.51%.
  `white-frame-scan.json` records the method. The 14–17 second navigation contact
  sheet was also visually reviewed. A video cannot establish behavior between
  captured frames or on other browsers/devices.
- The recorded app state had no bridge at 110.1 ms and a bridge at 116.0 ms.
  The bridge remained until renderer readiness at 1745.8 ms. There is no evidence
  here that the bridge was removed prematurely. The visible endpoint hold during
  graphics startup remains a separate, existing limitation.
- Both incoming documents previously left the root canvas transparent and omitted
  a color-scheme declaration. Their dark background depended on external CSS/body
  availability. This is a verified missing first-paint protection, and a plausible
  explanation for the reported flash, **not a reproduced root cause**.

## Change and verification

`app/app/layout.tsx` and `landing/index.html` now declare the existing `#07090d`
canvas color and dark scheme in the opening HTML tag, with an early
`meta[name=color-scheme]` declaration. The frame handoff, camera path and backdrop
lifecycle are unchanged. Current assembled CSP already permits inline styles;
no script policy was weakened.

`app/tests/flight-document.test.tsx` parses only each document's head with scripts
and external resources disabled. Both tests first failed on the original
transparent root, then passed with an opaque dark canvas before the body arrives.
The related flight/backdrop tests passed: 84 tests across four files. A full app
unit run at 04:28:46 local time passed 373 tests across 28 files. These are DOM/unit
checks, not rendered proof that the user's reported symptom is gone.

The HTML standard describes the early color-scheme declaration as a way to select
the document background before stylesheet loading:
[HTML color-scheme metadata](https://html.spec.whatwg.org/multipage/semantics.html#meta-color-scheme).

The coordinated verification pass built both production applications. A natural
desktop landing-to-Pod flight with 1.5 seconds of injected app-script delay passed
all assertions with no console, page, request or CSP diagnostics. Departure was
10.467 seconds; the unaccelerated video and navigation/reveal contact sheets were
reviewed at `artifacts/security/2026-09-26/local-flight-recheck/`. These timings
include capture overhead and do not establish native GPU frame rate.

`scripts/verify-document-paint.mjs` served the actual built HTML while deliberately
blocking external scripts, CSS and fonts. Both routes at 1440×1000 and 390×844
retained the dark root; all four screenshots contain exactly RGB(7,9,13) at every
pixel. The intentionally failed resource requests are retained in its report.
This is a resource-failure fixture, not a fully working app or proof about every
browser's pre-document compositor. An earlier unfinished-document streaming
fixture could not produce a compositor screenshot and was replaced; it provides
no visual evidence. `document-paint/pixels.json` records the successful pixel check.

Publication status belongs to the consolidated review. Navigation still replaces one document and WebGL context with
another; initial browser/compositor behavior and a graphics startup hold cannot
be eliminated or universally certified by an HTML background declaration.
