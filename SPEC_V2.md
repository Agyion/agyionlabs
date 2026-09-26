> **Historical specification — superseded as of 2026-09-26:** this is build provenance, not the current API or a security guarantee. The executable contract and [V3 security protocol](contracts/hak/SECURITY_PROTOCOL.md) supersede the layouts and front-running claims below. Current Pod uses a fresh Ed25519 claim key and recipient/domain-bound signatures; the intermediate V2 commit/reveal design was also superseded because delayed submission exposed the secret. Refunds require transactions, and Pod has no refund. Current release boundary: [README.md](README.md) and [HANDOFF.md](HANDOFF.md).

# SPEC V2 — Agyion (one-shot full build)
**Overrides SPEC.md where conflicting. Language rule: ALL code identifiers, comments, UI strings, docs = ENGLISH.**

## Brand/naming map (locked)
Product: **Agyion** · Templates: **Fade** (declining price), **Pod** (time capsule), **Trigger** (event escrow), **Envoy** (agent mandate) · Accounting: **Ledger** (export = **Proof Pack**) · Attestation layer (roadmap): **Loxias**

## Contract `agyion` — signatures (SACRED)
```rust
// Error enum: NotFound, InvalidAmount, InvalidCurve, InvalidState, DeadlinePassed, Locked, BadSignature, CapExceeded, MandateExpired, Unauthorized, InvalidInput
// FADE (was son_saat; iade→refund; same mechanics as SPEC §3)
create_fade(env, seller: Address, asset: Address, pot: i128, start_price: i128, floor_price: i128, slope_num: i128, slope_den: i128, duration_ledgers: u32, handoff_window: u32, venue_pubkey: BytesN<32>) -> u64
fade_price(env, fade_id: u64) -> i128
claim(env, fade_id: u64, claimant: Address)
confirm_handoff(env, fade_id: u64, ts: u64, sig: BytesN<64>)   // venue sig payload: fade_id(8B BE)||claimant XDR||ts(8B BE)
refund(env, fade_id: u64)
get_fade(env, fade_id: u64) -> Result<Fade, Error>
// POD (was kapsul)
create_pod(env, funder: Address, asset: Address, amount: i128, unlock_ledger: u32, key_hash: BytesN<32>) -> u64
claim_pod(env, pod_id: u64, preimage: Bytes, recipient: Address)
get_pod(env, pod_id: u64) -> Result<Pod, Error>
// TRIGGER (new): event escrow — funder locks for beneficiary; independent attester's ed25519 sig executes; after deadline rule-based refund
create_trigger(env, funder: Address, asset: Address, amount: i128, beneficiary: Address, attester_pubkey: BytesN<32>, deadline_ledger: u32) -> u64
attest(env, trigger_id: u64, ts: u64, sig: BytesN<64>)         // payload: trigger_id(8B BE)||beneficiary XDR||ts(8B BE); sig valid & ledger<=deadline → pay beneficiary
refund_trigger(env, trigger_id: u64)                            // ledger>deadline && not attested → back to funder; no discretion
get_trigger(env, trigger_id: u64) -> Result<Trigger, Error>
// ENVOY (new): on-chain limited mandate — owner grants an agent key (ed25519) the right to claim Fade listings FOR the owner
create_mandate(env, owner: Address, agent_pubkey: BytesN<32>, max_per_tx: i128, daily_cap: i128, valid_until: u32) -> u64  // recipient fixed = owner
envoy_claim(env, mandate_id: u64, fade_id: u64, ts: u64, agent_sig: BytesN<64>)  // agent sig payload: mandate_id||fade_id||ts; enforces: ledger<=valid_until, price<=max_per_tx, daily_used+price<=daily_cap, then claim(fade) with claimant=owner
revoke_mandate(env, owner: Address, mandate_id: u64)           // instant, owner-only
get_mandate(env, mandate_id: u64) -> Result<Mandate, Error>
```
## Rules
- Non-custodial: funds live in contract, rules only. refund* = rule-based, anyone may call, funds go to recorded owner/seller/funder.
- Same-ledger races: first valid transition wins; single-direction state machine.
- All errors = Error enum codes (no panic); ed25519_verify host-trap documented; pre-validate sig length/pubkey.
- TTL: every successful read/write extends persistent + instance TTL; document ~10-day archival boundary.
- Tests (all must pass): existing 16 (translated to EN names) + Trigger×4 (attest success / bad sig / refund after deadline / early refund reject) + Envoy×5 (claim in cap / cap exceeded / expired / revoked / recipient binding) + cross-template (mandate claim settles into owner's fade claim correctly).

## Frontend (app/ v2 — full rewrite)
- English UI, all four templates navigable (tabs/sections): Fade (main), Pod, Trigger, Envoy + Ledger section (Proof Pack export = signed JSON download of own history from chain reads + local records).
- Animated (framer-motion): price clock animates, state transitions animated, hero motion. Rich but tasteful; warm low-saturation base + one accent; no purple-blue gradients.
- Envoy demo: "Grant mandate" form → simulated agent loop (interval calls envoy_claim when price < threshold) → on-chain enforcement demo (over-cap attempt rejected visibly).
- Mock mode stays (localStorage) + soroban mode via bindings (regenerate from new wasm).

## Media
- openart: hero image (conditional money lifecycle, warm palette), og-image, 4 template icons-set.
- video_generation: 8-12s hero loop clip (money lifecycle) for landing.

## Deploy
- Cloudflare Pages, static export (next.config output:'export'), via cloudflare MCP (docs+execute). Live verify with browse tool. Env vars as NEXT_PUBLIC_* (mock default safe).
