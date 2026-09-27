# Privacy source and constraint review, 27 September 2026

The primary reviewer read all 37 owned privacy runtime, circuit and development-tool files (3,315 lines). Exact file lengths and SHA-256 values are in `privacy-source-coverage.json`. This is a source review and local verification checkpoint, not an independent cryptographic audit, ceremony, deployment or proof of absence of defects.

## Scope and conclusions

The review compared the JS reference policy, witness construction and four Circom source files: canonical fields, unsigned amount/time bounds, conservation, membership and append paths, conditional-input isolation, signature/action authority, conditional payout destination, Pod secret/unlock, Trigger attestation/refund windows, Envoy cap/count/successor/revocation, subgroup certificates, nonce/ephemeral separation, ciphertext public-input binding and dummy-slot redaction. No additional reproducible source defect was established in this privacy-package scope. The host's separately identified self-payment destination bug is addressed and described in `PRIVATE_POOL_FULL_REVIEW.md`.

The runtime review also covered exact artifact pinning, local proof verification, bounded worker transport/cancellation, DKG signed dealer shares and acceptances, subgroup-checked DLEQ partials, field-scoped signed disclosure requests, independent accepted-record reads, durable replay markers, encrypted delivery, vault role separation, Argon2id/AES-GCM backup, complete key restoration, public archive reconstruction and cancellation/final-snapshot checks. The low-level DLEQ helper requires its caller to supply authorization; the disclosure operator performs those checks. A colluding threshold of real share holders can bypass operational authorization outside this code. This is an explicit trust boundary, not something a request signature can eliminate.

The development tools' source fingerprints, compiler/lock pins, test-only fixture keys, output overwrite guards and secret-output boundaries were checked. The phase-1 native hash helper preserves the reviewed upstream transcript verification and has parity tests. This turn did not rerun the full historical phase-1 ceremony transcript verification, generate keys, change circuit pins or pretend that a single local phase-2 operator is an independent ceremony.

## Fresh verification

- Default privacy suite: 131 passing, four explicitly skipped optional suites.
- All four optional suites enabled with the existing pinned artifacts: **178 passing, zero failing, zero skipped**. These include actual transition/revocation proofs, adversarial constraint witnesses, changed public statements/proof points, scoped disclosure of real proof ciphertext and key/recovery cases. The 178 includes nested subtests; it is not 178 independent protocol scenarios.
- The four circuit source hashes, all recorded compiled output hashes and the dependency lock matched `artifacts/privacy-v2/circuit/compile-manifest.json` before those checks.
- npm advisory scan: zero reported advisories for this lockfile at this checkpoint. An advisory result does not manually audit dependencies or establish constant-time behavior.
- Actual Chromium local-worker proof and recovery run passed all 37 internal checks and eight harness checks (45 total). Deposit, Pod, Trigger and Envoy proofs were independently generated; each took approximately 60 seconds. Vault/draft/note restoration, changed-statement rejection, cancellation and no private HTTP egress were checked. No console/page/HTTP/CSP error occurred. This remains desktop-only, synthetic local state, not private chain settlement. Evidence: `artifacts/security/2026-09-27-compatibility/privacy-browser/report.json`.

Logs are in `artifacts/security/2026-09-27-compatibility/privacy-{baseline,all}.log`. These are local development proofs using existing development keys. No private pool was deployed or connected to the published app.

## Limits that remain

- The public `privacy/src/index.mjs` exports the earlier parser-only, fail-closed interface. Experimental v2 modules are intentionally imported explicitly by the separate private SDK. The public HAK app does not become private by importing its old package name.
- Independent phase-2 contributors, independently held trustee shares, reviewed release pins, full application private-state integration and live private testnet/recovery/archival operations remain release prerequisites.
- Proof and backup workload was verified on this desktop runtime. Real phone memory/performance, browser-extension wallets, issuer freeze/clawback, network correlation and small anonymity sets are not resolved by unit tests.
- JS BigInt and garbage collection do not provide a constant-time implementation or guaranteed physical erasure. Dependency internals, proving-parameter soundness and every test-file line are not claimed as manually audited.
- Public bridge amounts/accounts, transaction timing, submitting accounts, fees and ciphertext size remain visible. Public HAK Pod/Trigger/Envoy are a different profile and are not confidential.
