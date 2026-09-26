# Shared logo and publication of pending website changes

Published 26 September 2026 at 23:23:30 UTC (27 September, 02:23:30 Istanbul).
The user explicitly requested deployment of the pending work and asked to keep
the application's logo on the landing page too.

- Website: https://agyionlabs.dev/
- Runtime source: `04b56479f39305f0de22de37bb80ebee6cd7fb2d`
- Worker: `agyion`
- Version: `8b79160d-6429-447f-ba82-1075598dfca2`
- Deployment: `ab0a455b-5659-4f41-a78e-4c7a587de750`, 100% traffic
- Previous version / rollback: `b661f1df-bf19-4515-88d9-efbc17151440`

## What was published

The landing header now uses the application's existing ellipse/circle logo,
font weight, tracking, colors, spacing and desktop/mobile sizes. The application
logo source is unchanged. The landing favicon now uses the same SVG as the app;
the old crosshair mark and inline diamond favicon are removed. The hero artwork
and large editorial heading remain as before.

The entire freshly built website was published, including the earlier canonical
`/instruments` directory and confirmed Fade history/recovery corrections from
`0d8ca1e` and `f5926b3`. The separate contract sources and private profile are not
deployed by the website asset upload. Existing protocol-write availability
checks remain enforced against the configured old testnet kernel.

## Local checks and a reproduced layout defect

- Application: 582 tests passed; production build includes TypeScript and lint.
- Landing: 89 tests, TypeScript, lint and production build passed.
- Release tooling: six tests passed.
- Logo/navigation: 173 checks passed across 1440, 768, 390 and 320px, using 12
  rendered home/directory/app records and saved screenshots. No page exception,
  console error or failed request was observed in the final local run.

The first logo comparison passed 115 metrics but screenshot inspection found
the 320px Menu control outside its header (and outside the viewport on the
directory). That initial result is explicitly not the final layout verdict.
The verifier was strengthened to check every header control's containment.
Narrow-screen action gaps/padding were reduced; the full app wordmark and its
size remain unchanged. The final 173 checks and visual inspection passed.

An earlier probe tried to fetch a data-URI favicon and was correctly blocked by
CSP. The probe now decodes data URIs locally. That instrumentation failure and
the initial clipping captures are retained separately, not counted as passes.
The unchanged Three.js chunk-size and deprecated Node Buffer warnings remain.

## Live evidence and limits

Cloudflare read-only postflight checks passed 8/8. Active traffic is 100% on the
new version; domain, preview/subdomain settings, compatibility date, bindings
and explicit HTML/404 routing match the preflight snapshot.

The existing production verification passed 29 artifact/HTTP checks and 14 UI
checks. Application bytes match the reviewed local build under the existing
narrow comparison for Cloudflare's known JavaScript Detections injection.
Unknown HTML changes are rejected. Missing scripts and environment-file paths
return 404. All six application workspaces fit desktop/mobile. No page exception
was recorded.

**The strict live run is failed**, with four Cloudflare CSP events, two blocked
analytics requests and two external Soroban testnet `ERR_NETWORK_CHANGED`
requests. Transaction availability displayed "Network unavailable. Transactions
paused." and the submit control stayed disabled. These are not reclassified as
passing checks. Neither CSP nor bot protection was weakened. The existing
[Cloudflare CSP follow-up](../security/2026-09-26/cloudflare-csp-followup.md)
explains the separate deployment-layer issue.

The separate live logo/navigation run retained a failure: at 390px, same-origin
app CSS and webpack requests returned `ERR_NETWORK_CHANGED`, so the app logo
could not mount in that attempt. All eight landing/directory captures and the
other three app widths loaded; 152/154 recorded assertions passed, with two
comparison assertions unavailable because that app record was missing.
A focused 390px rerun then passed all 40 checks on home, directory and app,
including the exact logo/favicon comparison and canonical navigation. Its only
request failures were three CSP-blocked analytics scripts; no page exception
occurred. Successful logo/layout coverage therefore spans all four widths
across the original run and the focused recovery. The original failed run is
retained. Its transient network error is not evidence of an app-code fix or of
a clean first attempt; no source or deployment changed between those runs.

Raw outputs, screenshots, pre/postflight snapshots and the complete 240-file
artifact manifest are under ignored local
`artifacts/verification/2026-09-27-logo-release/`. The committed companion
`2026-09-27-logo-and-pending-release-evidence.json` records hashes and results.

This release does not claim a complete security audit, remediation of GitHub's
33 default-branch dependency alerts, real-wallet signing, contract deployment,
fund movement or native-GPU performance. No new economic allocation rule was
introduced; Fade reservation/no-show risks remain open in the
[product review](../product/2026-09-27-fade-use-cases-and-allocation.md).
