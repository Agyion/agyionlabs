# Agyion orbital design and reliability revision

The user explicitly delegates creative direction and implementation. The current request supersedes HANDOFF.md's old instruction to preserve the landing. Work proceeds in the requested order: frontend and design, then backend/security, then final integrated verification. Existing uncommitted work is preserved.

## Intent
A Stellar testnet conditional-money application that feels like approaching an orbital station beside a black hole. The landing explains the actual product, the app makes its six sections usable. No invented transactions, network status or security claims.

## Visual system
Void #07090d, hull #11151b, starlight #f2eee5, telemetry #a7adb8, accretion #e8b77b, signal #c3c8cf. Bricolage Grotesque for expressive headlines, Instrument Sans for controls/copy, Space Mono for concise telemetry. Warm accretion light and quiet steel surfaces. Signature: a procedural Endurance-inspired twelve-module station against a lensed black hole; the same renderer supports distant landing and closer station camera views. Uploaded images guide the original procedural composition.

Landing: quiet navigation, small testnet identification, large clear thesis “Money, bound by your rules.”, launch control, distant scene, actual instrument links, lock/prove/execute-or-refund explanation. No forced scroll sequence or 8-second input blocker. App: same brand and palette, close station, six accessible module buttons and visible console with existing forms. The scene never blocks forms or pointer interaction. Successful records emit a small light packet toward the event horizon, explicitly decorative; mock/testnet mode is visible.

## Architecture
Retain local Vite landing and Next static-export application, their existing routes and real Stellar client. Share a dependency-light imperative Three.js renderer in shared/ with separate React wrappers. Publish assembled assets through the existing Cloudflare Worker. Inspect live source/config read-only; do not overwrite production until a verified reviewable candidate exists and publication is authorized.

## Quality boundaries
Keyboard access, visible focus, responsive 360px+ layout, reduced motion, WebGL fallback, visibility pause and complete renderer teardown. No production destructive scans, no real-value transactions, no server-side secret embedded in frontend. Security review includes contract authorization/replay/amount/deadline behavior, wallet/session storage, transaction failure handling, trust boundaries and dependencies. Regression tests reproduce findings before fixes. Report remaining environmental/provider blockers honestly.

## Latest user refinement
Endurance modeling detail is a priority. No green on the landing. Omit the decorative bottom animation/time bar from the app while retaining actual transaction deadlines and functional price information.
