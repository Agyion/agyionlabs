# Product pages and wallet dependencies — published 2026-09-26

Published to [agyionlabs.dev](https://agyionlabs.dev/instruments) at 19:35 UTC.
Cloudflare Worker `agyion`, version `ff3d5bf7-a79a-49f3-bed9-cbfe9ce8ee47`,
deployment `401c97b7-8009-43e1-8eec-663b629ea221`, 100% traffic.
Previous version available for rollback: `90ff8d23-8b7a-4cc6-b4e3-bf66aebca29a`.
Only the static frontend was published; no chain deployment or signing occurred.

## Delivered

- A real Instruments directory and six opaque black/orange pages restore the
  earlier FA/DE and P/OD identity. Short introductions lead into distinct
  persistent SVG mechanisms, conditions and next-product navigation.
- Fade moves its price marker and settlement packet; Pod opens its capsule after
  both conditions; Trigger routes valid evidence or a refund; Envoy animates the
  owner/mandate/agent path, validates claims and blocks them after revocation.
  Ramp and Ledger retain explicit illustrative/unsigned boundaries. These examples
  do not submit transactions. Controls, reset, reduced motion and offscreen pause
  are exercised, rather than treating a tab swap as animation.
- Homepage/app worlds remain. Details create no WebGL context at first load;
  application-link intent prepares one hidden, paused renderer. The full flight
  preserves the requested app tab and the settled frame through document loading.
- Full and production application npm audits now both report zero, from four low
  and five moderate entries. The unused HOT dependency graph was removed through
  a reproducible selected wallet package. Of 86 retained files, 85 are unchanged
  upstream files; one explicit patch fixes the actual first-close modal race.

Research and exact constraints: [reference study](../design/2026-09-26-instrument-reference-study.md),
[design revision](../design/2026-09-26-instrument-revision.md),
[dependency remediation](../security/2026-09-26/dependency-remediation.md).

## Verification and retained failures

- 477 application, 77 landing and six tooling tests passed. App/landing type and
  lint checks and production builds passed; final assembly contains 255 files.
- The detailed [browser record](../design/2026-09-26-product-page-verification.md)
  distinguishes the initial 48-combination matrix, its retained failures and
  focused successful repetitions. It also records the 54-check homepage matrix
  and last directory-only layout change at four widths; it does not claim a
  second full matrix after that cosmetic change.
- Four unaccelerated journeys reached the actual app with a deliberately delayed
  app script and no browser diagnostics. Five further accelerated routing cases
  completed, with one external RPC network-change failure retained; the targeted
  Trigger repeat passed cleanly. Acceleration is routing evidence only.
- After the final wallet build, another real directory-to-app flight completed:
  10,368 ms visible flight, 11,513 ms departure. Its strict result is **failed**
  because the external Soroban testnet RPC reported `ERR_NETWORK_CHANGED`; there
  was no page exception or CSP event. See local
  `artifacts/verification/product-pages/journey-final-wallet-build/verification.json`.
- The actual bundled wallet chooser passed at 1440/390/320: expected providers,
  first-click close, reopen, viewport fit and disabled transaction action; no
  console, network, page or CSP error. No provider was selected. The original
  failing browser run and pre-fix unit regression are retained separately.
- An independent final source review covered product routing, reduced-motion
  cleanup, lazy flight preparation and all six tab destinations without findings.
  This is bounded code review, not an independent security audit.

## Live result

**29 artifact/HTTP checks and 14 home/app UI checks passed; the strict live run
is failed.** Served application bytes match the assembled artifact after the
existing narrowly validated Cloudflare injection comparison. Missing assets and
environment-file paths return 404. The app opens six workspaces at 1440/390,
preserves the closed write gate and reports the configured kernel incompatible.

There are no application exceptions or RPC failures in this live run. Four CSP
events remain from pre-existing Cloudflare JavaScript Detections and Web Analytics
injection; two blocked beacon requests are also recorded. These were not filtered,
the policy was not relaxed, and bot protection was not disabled. See the
[separate follow-up](../security/2026-09-26/cloudflare-csp-followup.md).
Live checks of the product pages are recorded separately in the browser record.

The checked-in [release evidence](2026-09-26-product-release-evidence.json) contains
deployment IDs, artifact hashes, HTTP/UI results and the remaining CSP events.
Full logs, screenshots and videos are local ignored artifacts beneath
`artifacts/verification/product-pages/`; they are not silently treated as committed
evidence. `live-release/`, `deploy-final.log` and `deployments-after.json` identify
the publication and read-only verification.

Source changes were pushed to `codex/orbital-redesign-security` through commit
`0868671` (preceded by dependency selection `e721a2a` and modal fix `75935c8`).
GitHub's push response still reports **33 alerts on the default branch**: two
critical, 11 high, 17 moderate and three low. This branch was not merged into
`main`; a fresh remote read still resolves `main` to
`08e0311550948114e1fc0f117ac217fc7a1433b6`. Zero application npm advisories on the published branch must not be
reported as zero repository/default-branch alerts; the older review separately
records that distinction. This checkpoint does not recalculate every default-
branch alert or claim they were closed by this push.

The private ZK/threshold profile remains a separate experimental SDK/pool. It is
not integrated into this production app. No native-GPU performance, installed
wallet signing, real-phone testing, bug-free guarantee or user aesthetic approval
is inferred from these checks.
