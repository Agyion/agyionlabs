# Agyion orbital revision implementation plan

**Goal:** unify landing/app as a usable orbital experience and repair verified correctness/security issues.
**Architecture:** Vite landing + Next static app, shared procedural scene, existing Soroban backend.
**Spec:** ../specs/2026-09-24-orbital-design.md

## Sequence
- [x] Read HANDOFF, inspect dirty state, verify live hosting and reference images.
- [x] Build shared scene with distant/near cameras, motion preference, fallback and disposal.
- [x] Rebuild landing composition and links using the user's no-green requirement and assistant-proposed visual tokens and real product content.
- [x] Integrate app scene and station navigation around all six existing panels; connect successful-record animation.
- [x] Build both clients, verify desktop/mobile, keyboard, direct links, WebGL fallback and scene cleanup.
- [x] Audit and fix backend/contracts, wallet/signing, storage, transaction validation and dependencies with regression tests.
- [x] Verify assembled routes/security headers, rerun affected tests/builds, document evidence and deployment limits.

## Review focus
- Corrupted/denied storage must not break a confirmed transaction or hide the console.
- Rejected wallet/network actions must never be shown as a successful chain transaction.
- Module deep links and back/forward navigation must survive static hosting.
- Missing WebGL or reduced-motion preferences must keep every action usable.
- Contract caller, claimant, amount, expiry and replay checks must fail closed.

Evidence: `docs/verification/2026-09-24-orbital-audit.md`. No production or chain deployment performed. Remaining external acceptance and dependency limits are explicit in that report.

## Visual correction after user feedback

- [x] Implement a second local revision of the disk silhouette and lensing, station lighting and composition against the provided references. The first rendering was rejected; prior checks establish technical behavior only.

Second revision evidence: `docs/verification/2026-09-24-visual-correction.md`. This checkbox records implementation, not design approval.
