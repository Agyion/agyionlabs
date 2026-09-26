# Cloudflare frontend release checkpoint

Published with explicit user authorization on 2026-09-26 (Europe/Istanbul).

- Production: https://agyionlabs.dev/ — Worker `agyion`.
- Version: `dd57d7a0-9ea3-441e-9616-06d34dc89f8c` (100% traffic).
- Deployment: `5412fe91-ecbd-414c-8bb2-a4d03b88c8a4`.
- Previous version retained for rollback: `4a615e57-86c8-453e-a349-dafbb65c6eef`.
- Source of uploaded static files: the previously built and locally checked
  `app/site/`. Its 237-file SHA-256 manifest is saved in
  `artifacts/verification/2026-09-26-cloudflare-release/artifact-manifest.json`.
- The existing apex custom domain, workers.dev URL and preview setting were read
  from Cloudflare before publication and recorded in `app/wrangler.toml`.
  Variables were preserved. No contract or anchor was deployed or changed.

Live checks completed 28 HTTP assertions (reviewed document/bundle identity,
security headers, missing asset and environment-file 404s) and 14 UI assertions
(landing/help, all six desktop/mobile workspaces and the incompatible-protocol
write gate). Screenshots and raw results are in the ignored release artifact
directory. Cloudflare appends its generated JavaScript Detection bootstrap to
HTML; the verifier records that one precisely identified edge addition and
requires all remaining application bytes to match the reviewed artifact.

This is **not a fully clean console/security-audit result**: the live check
recorded CSP events, blocked Cloudflare-injected JSD/analytics scripts and one
testnet `ERR_NETWORK_CHANGED`. Its raw status remains failed. Local scripts did
render the tested landing/app views. Subsequent user feedback reports a white
flash during the actual normal-motion launch; that remains an explicit follow-up
at this checkpoint, not a verified fix.

This source snapshot also contains the previous targeted security repairs, but
does not certify every file or all fund paths. The subsequent comprehensive review
already identified additional Pod claim ordering/disclosure and classic payment
recovery problems. Those are to be fixed with new regressions after this checkpoint.
The deployed frontend detects the old kernel's missing protocol v2 and blocks
new contract writes. Old deployed contracts/funds do not migrate with this website.

Earlier reports retain their original no-deployment statements as historical
checkpoints; this document supersedes only that publication status.
