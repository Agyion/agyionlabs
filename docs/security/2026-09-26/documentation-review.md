# Documentation and configuration claim review

Date: 2026-09-26. Scope: local authored project documentation and configuration claims. No network, provider request, browser, build, deployment, signing or transaction was performed. This is not a legal opinion, independent cryptographic audit or current-production certification.

## Corrections made

1. **Source versus deployed revision:** README and app README now separate the earlier published frontend from current local kernel/client V3. They require a new contract and rebuilt configuration for V3 writes; old records do not migrate. Historical transaction links remain historical.
2. **Pod:** current descriptions use a fresh Ed25519 claim seed, creation proof and recipient/domain-bound signature. The old plaintext and finite-delay commitment designs remain only inside explicitly superseded provenance. Key loss has no refund/recovery; public amount/address data remains visible.
3. **Privacy and authority:** removed current on-chain anonymity, automatic/general refunds, production fiat settlement, global cap-bounded Envoy spending and unconditional signed Proof Pack guarantees. A checksum/optional local signature is not settlement or legal evidence. The empty research verifier registry, absent DKG/private asset pool and colluding-quorum limitation remain explicit.
4. **Custody:** distinguished memory-held wallet/Pod credentials from Trigger/Envoy/venue sessionStorage keys. Trigger now uses a masked input, which does not secure storage or guarantee memory erasure. Existing credentials must not be silently destroyed.
5. **Anchor:** removed a fixed current-fee assertion, unverified issuer/clawback guarantees and the suggestion that organizer approval proves actual TRY settlement. The YAML is a self-host example, not an operational fallback; only comments changed.
6. **Verifier/scaffold provenance:** corrected the standalone verifier's Pod integration paragraph and qualified its historical local cost numbers. SPEC banners supersede the insecure V2 commitment revision. Landing and generated-binding READMEs now label original scaffold/generator guidance instead of treating it as the current product or deployed ABI.

Changed documentation: `README.md`, `SPEC.md`, `SPEC_V2.md`, `docs/LIMITATIONS.md`, `app/README.md`, `landing/README.md`, `app/lib/hak-bindings/README.md`, `anchor/README.md`, comments in `anchor/assets.yaml`, and `contracts/zk-preimage/README.md`. No package, configuration value, CSS or executable code was changed by this documentation pass.

## Exact inspected paths

Read current narrative and security statements in:

- `README.md`, `SPEC.md`, `SPEC_V2.md`, `docs/LIMITATIONS.md`.
- `HANDOFF.md`: current/security/release sections and dated checkpoint context; concurrent root-owned edits govern its final wording. No claim of re-auditing every historical result.
- `anchor/README.md`, `anchor/assets.yaml`.
- `app/README.md`, `landing/README.md`, `app/lib/hak-bindings/README.md`.
- `contracts/hak/SECURITY_PROTOCOL.md`, `contracts/zk-preimage/README.md`, `privacy/README.md`, `verifier/README.md`.
- `docs/verification/2026-09-26-cloudflare-release.md` as dated release evidence only; no live revalidation.

Read package/configuration values and metadata in:

- `package.json`, `app/package.json`, `landing/package.json`, `circuits/package.json`, `privacy/package.json`, `app/lib/hak-bindings/package.json`.
- `contracts/hak/Cargo.toml`, `contracts/zk-preimage/Cargo.toml`.
- `app/app/lib/config.ts`, `landing/src/config.ts`, `app/wrangler.toml`, `app/next.config.mjs`, `landing/vite.config.ts`.
- `app/tsconfig.json`, `landing/tsconfig.json`, `landing/tsconfig.app.json`, `landing/tsconfig.node.json`, `app/lib/hak-bindings/tsconfig.json` (active compiler settings), `app/tailwind.config.ts`, `app/postcss.config.mjs`, `app/vitest.config.mts`, `landing/eslint.config.js`, `playwright.config.mjs`.

Targeted source cross-checks: `app/app/lib/ledgerLog.ts` export behavior; `contracts/hak/src/envoy.rs` quantity/price bound; V3 implementation and credential tests covered separately by the Pod review; `scripts/deploy_testnet.sh` protocol-version readback; `app/app/layout.tsx` metadata; active imports in `landing/src/main.tsx`, `landing/src/App.tsx`, `landing/src/pages/Home.tsx`, `landing/src/components/NavPill.tsx` and `Footer.tsx`. These targeted checks are not additional whole-file implementation audits.

## Residuals and ownership

- **Root-owned HANDOFF:** obsolete V2 deployment/commitment and blanket memory-only key statements were reported to root. A current V3 banner was added by root during this review. Historical checkpoint counts must not be turned into present acceptance evidence.
- **Runtime metadata, fixed by root during review:** `app/app/layout.tsx` said money executes itself or comes back. Root removed that claim while this review was running; no runtime edit was made by this reviewer.
- **Inactive template copy:** `landing/src/config.ts` retains automatic-refund, absolute 2035 and agent-spending language in original Home/Work/Blog template blocks. Current Home/Nav do not consume those blocks. Do not re-enable those templates without replacing the claims; no runtime source was edited here.
- **Metadata version ambiguity:** `contracts/hak/Cargo.toml` describes SPEC_V2 and both crates use package version 0.1.0. Package versions and the historical spec name are not protocol/deployment evidence; the checked entry point is V3. The circuit package has ISC metadata while the root uses MIT; dependency and subpackage licenses need their own treatment, not a blanket audit/license claim.
- **Existing demo-key custody remains:** input masking does not remove sessionStorage exposure. No claim is made that an active page or same-origin script cannot read credentials.
- Historical README jury instructions and SPEC bodies deliberately retain their original text beneath explicit supersession notices. Old archives, all research documents, remote services, generated bundles and binary assets were not audited in this pass.

Validation: documentation diff whitespace check and local Markdown link existence check. No test count or deployment claim was refreshed by this documentation-only work.
