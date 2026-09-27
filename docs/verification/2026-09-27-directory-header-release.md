# Instruments header release

Published to https://agyionlabs.dev/instruments on 27 September 2026 at 04:47:50 Istanbul. Worker `agyion`, version `169750d6-6647-4c13-9db7-9b94cf8d88e8`, is confirmed at 100% traffic. Rollback: `c004d8e9-5b0b-4cec-821f-24e3642347f3`.

The directory now has one Launch app in its header. The existing remembered Skip animation checkbox is immediately beside it. Both footer controls are removed. At narrow widths the pair shares a second header row, keeping 14px text and 44px controls. Other routes retain their existing controls and the same preference implementation.

Runtime source changes are limited to `landing/src/components/NavPill.tsx`, `landing/src/pages/Instruments.tsx` and `landing/src/styles/orbital.css`. The reviewed dirty-tree manifest records 461 source files and 244 artifact files; HEAD alone does not identify this release. Artifact tree SHA-256: `b6f143c0e63806bf3212219b7ab4bd549a834a8451e573202e2ec39a5346ed43`.

Landing lint and the final production build passed. Local browser coverage checked 1440, 1001, 1000, 768, 390 and 320px: one launch/checkbox in the header, no footer duplicates, visible hit targets, no overlap/overflow, heading clearance, mobile menu, same-route focus, preference persistence and actual skipped app navigation. The first run identified the inherited 42px launch height at 768; a directory-only 44px minimum fixed it and the targeted follow-up passed with clean diagnostics. The initial failure remains recorded. Unchecked normal flight was also exercised at 1440. No full backend suite was rerun for this placement-only change.

Live checks at 1440/390 passed both UI cases, including saved preference and actual header launch. The live HTML and assets passed 13 byte/header checks against the artifact, using the existing narrowly recognized Cloudflare injection normalization. Live desktop and mobile screenshots were inspected.

Strict live diagnostics remain failed because Cloudflare-injected beacon and inline detection scripts conflict with the existing CSP: four blocked beacon requests, eight console errors and eight CSP events. There were no JavaScript exceptions, HTTP errors or RPC failures in this focused live run. These diagnostics were retained without weakening CSP. This does not resolve the previously documented production edge-script issue.

Evidence: `artifacts/verification/2026-09-27-directory-header-release/` contains the manifest, source/artifact diff, build/lint logs, deployment records, local matrix, 768 follow-up, live UI report/screenshots and `live-assets.json`. No wallet connection, signing, transaction or contract deployment occurred.
