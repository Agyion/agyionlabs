# Backend compatibility and defensive review implementation plan

> **For agentic workers:** Use task ownership below for parallel review and implementation; retain evidence for each reproduced defect and verification command.

**Goal:** Bring the owned application's testnet configuration into agreement with reviewed contract code, identify and repair reproducible correctness/security defects, and record the remaining release constraints without promising absence of vulnerabilities.

**Architecture:** Keep public HAK V3 and the separate experimental private-v2 protocol distinct. Preserve fail-closed writes until the selected deployment is independently read back. Existing contracts and records are not silently upgraded or migrated.

**Tech Stack:** Soroban/Rust, Stellar SDK/TypeScript, Next/React, Circom/Groth16, Node, Python deployment tests.

**Spec:** User's 27 September request; `contracts/hak/SECURITY_PROTOCOL.md`, `privacy/PROTOCOL_V2.md`, `contracts/private-pool/RELEASE.md`.

## Global constraints

- Preserve the existing dirty working tree and approved visual design.
- Local owned-source regression testing only; no attacks on third-party infrastructure.
- Use new dedicated identities and valueless testnet assets for any authorized testnet verification. Never expose seeds or repurpose user wallets.
- No mainnet deployment, real-fund readiness claim, invented trustee independence, or independent-audit claim.
- Do not count generated code, dependencies, unread files, skipped tests or historical results as a fresh manual audit.
- If an automatic approval/tool filter rejects an action, do not repackage or route around that rejection; record the affected gap.

## Review focus

1. Concurrent claims and repeated/ambiguous submissions must not create a second payout or erase pending recovery evidence.
2. Network, contract, account, asset and signature-domain substitutions must fail before committing funds.
3. Partial token settlement and unavailable/archived state must preserve liabilities, counters and spend evidence.
4. Public/private profile boundaries must remain explicit, including setup, trustees, metadata and recovery limitations.
5. Live RPC compatibility must be verified independently of a successful static build or mocked suite.

## Task ownership and verification

### 1. Kernel review (HAK reviewer)

- [x] Read every runtime line in `contracts/hak/src/{lib,fade,pod,trigger,envoy}.rs`, Cargo settings and ABI.
- [x] Match authorization, arithmetic, deadlines, replay, reserves and rollback scenarios to meaningful tests.
- [x] Reproduce defects before narrowly scoped source/test fixes.
- [x] Run locked native, current-WASM and strict Clippy checks; verify all ABI entries against bindings.
- [x] Record file hashes, tested scenarios and omissions in `docs/security/2026-09-27/HAK_FULL_REVIEW.md`.

### 2. Private host/client review (private-pool reviewer)

- [x] Read private-pool Rust, deployment tools and SDK runtime; distinguish legacy verifier scope.
- [x] Check pinned statements, roots/nullifiers, atomic token operations, journal and release-domain compatibility.
- [x] Reproduce/fix concrete defects; escalate any protocol/circuit change before altering pins.
- [x] Run applicable local Rust, SDK and tooling checks and record limitations in `PRIVATE_POOL_FULL_REVIEW.md`.

### 3. Public application review (application reviewer)

- [x] Read transaction libraries, panel actions, wallet vendor implementation, anchor/verifier service inventory.
- [x] Check source/network/session/envelope boundaries, amount/asset validation, recovery and secret handling.
- [x] Reproduce/fix defects in assigned files and run targeted regressions before the final app suite.
- [x] Record file/range coverage and exclusions in `PUBLIC_CLIENT_FULL_REVIEW.md`.

### 4. Privacy protocol and deployment (primary reviewer)

- [x] Read privacy runtime/circuits and compare model, witness and circuit constraints; record exact scope.
- [x] Read deployment helper/tests, prove the live RPC and old deployment's actual status with read-only evidence.
- [x] Create testnet deployment only after relevant local gates pass; verify exact deployed bytes, V3 and ABI before changing app configuration.
- [x] Exercise funded testnet workflows with dedicated test identities, recording balances, state transitions and recovery outcomes without logging secrets.
- [x] Keep private activation closed until its setup/committee/integration gates are satisfied.

### 5. Integration and final record (primary reviewer)

- [x] Review concrete patches, run combined relevant suites and production builds.
- [x] Verify application connection and write readiness against the selected testnet release; publish only verified configuration.
- [x] Produce source-hashed coverage inventory, unresolved findings and test evidence; update `HANDOFF.md` accurately.

## Initial evidence

At 01:52 UTC the published app reported `unavailable` and disabled Lock the pot. A later direct official RPC check succeeded with network protocol 28. This variability is not evidence that the old deployment is compatible. The exact configured contract still requires independent version/code readback.

This plan is already authorized for execution by the user's request. Completion checkboxes mean demonstrated outcomes, not an audit certificate.

## Completion checkpoint

The authorized compatibility work was verified and published. See the final COMPATIBILITY_RELEASE report and exact source inventory. A subsequent user objective expands implementation to active Agyion naming, main branch consolidation, UI launcher cleanup, README and app privacy integration. Completion of this compatibility plan does not certify that expanded objective or absence of all exploits.
