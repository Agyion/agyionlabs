# Orbital revision — verification record

2026-09-24. Repository `/home/apo110/agyion`, branch `codex/orbital-redesign-security`.
This is local implementation and verification evidence. No git push, production
publish, live transaction, token transfer or testnet contract deployment occurred.
The dirty user working tree was preserved. This is not a zero-vulnerability certification.

## Visual and interaction work

These are implemented features, not visual approval. The user rejected the initial black-hole rendering. The second local revision is recorded in `2026-09-24-visual-correction.md`; it is not user-approved.

- Shared Three.js scene: 12 individually detailed station modules, bevelled hull,
  panels, window strips, vents, radiator grids, canisters, fasteners, antennas,
  dish, four truss spokes, hub and docked shuttle. Instanced repeated geometry;
  adaptive framing, DPR cap, visibility pause, context-loss recovery/disposal.
- Warm black/ivory/amber composition on landing and all instrument details.
  App uses the same scene, type and surfaces. No green landing accents.
- Only the decorative Mission timeline was removed. Price preview controls,
  timelock horizons and ledger history remain.
- Six accessible instrument tabs, direct links and browser back/forward.
  Reduced motion, pause, keyboard and WebGL fallback remain usable.
- Confirmed/local successful record events trigger a small packet into the hole.
  A rejected transaction does not trigger this scene feedback.
- Pod creation now preserves the secret before sending and uses explicit saved-key
  acknowledgment; opening uses recipient-bound commit then reveal in a later ledger.

## Reproduced and repaired failures

| Area | Reproduced problem | Repair/evidence |
|---|---|---|
| Credential replay | Fade credential usable as Trigger attestation; cross-contract reuse | Action + network + contract domain, JS/Rust byte-parity fixture |
| Pod front-running | Copied preimage plus attacker's own recipient auth could win | Prior-ledger recipient commitment, failed/replaced/copied commitment tests |
| ZK verifier initialization | Arbitrary all-zero key and zero proof could be accepted | Pinned canonical circuit verification-key digest |
| ZK input | Noncanonical field encoding accepted | Canonical public scalar checks |
| Fade math | Saturating i128 intermediate gave a wrong rational price | I256 intermediate; exact boundary tests |
| Refund liveness | u32 ceiling could make a later refund ledger impossible | Creation rejects unreachable final refund horizons |
| Chain UI success | Successful simulation treated as successful broadcast | SUCCESS receipt required; actual sent result/hash recorded; ambiguous-send hash retained |
| Old deployment | New protocol could be used against an incompatible kernel | `protocol_version()==2` required before every write/signature |
| SEP-10 | Arbitrary matching-network XDR could be signed | TOML/server/nonce/account/type/time/network validation |
| Wallet sessions | Mainnet test-key signing, stored secrets, stale sessions | Memory-only testnet signer, session invalidation and transaction-content checks |
| Panel state | Created records absent, invalid IDs escaped handlers, stale Ramp amounts | Record loading/refresh, caught validation errors, immutable withdrawal instructions |
| Envoy loop | Interval could open multiple concurrent wallet requests | One in-flight attempt and caught async failures |
| Browser history | Malformed/quota-exceeded storage could crash or falsify success | Validated bounded records and memory fallback; matched confirmed receipts |
| Chain clock | Client extrapolated eligibility after lost RPC | Only confirmed ledger height; failed polls clear stale height |
| Amount parsing | Internal spaces joined digits and extra decimals silently truncated | Strict precision, syntax and i128 bounds |

## Technical and functional verification

Passing these checks does not establish aesthetic quality or user acceptance.

- App: **137/137 unit/security/component tests** (including 65 panel regressions), TypeScript, lint and production static export passed.
- Landing: **28/28 unit tests**, TypeScript/lint/build passed.
- Browser landing matrix: **19/19 checks** across 1440/768/360 widths, six detail
  routes, hash links, mobile menu, keyboard and fallback.
- Browser combined-site matrix: **7/7 scenarios**: tabs/history, keyboard,
  six mobile panels, reduced motion, unavailable WebGL, landing→app/missing assets,
  wallet modal and enforced CSP. Tested both portable preview and Cloudflare local
  asset runtime. No CSP violations in tested launch/modal paths.
- Pod mock browser flow: create → commit → later ledger reveal → history;
  no page errors; successful record events emitted. This is not an on-chain test.
- App desktop/mobile screenshots: one scene canvas, zero horizontal overflow,
  zero page/console errors in the checked path.
- HAK: **47/47**, ZK: **11/11**, including local compiled WASM fixtures.
  Both all-feature Clippy and formatting checks passed.
- Deployment helper: **8/8 stubbed safety regressions** and real CLI dry-run passed; default is read-only and explicit execution is pinned to testnet. Cloudflare upload dry-run passed (no publish).
- Circuit proof verification passed. Rust audits: 0 vulnerabilities; informational
  unmaintained `paste` host/test dependency remains, absent from WASM target.
- Landing/root/circuit npm audits: 0 findings. App: **4 low + 5 moderate** package
  records in an unused HOT Wallet dependency branch; **0 high/critical**.
  See the separate wallet report for advisories, reachability and upgrade analysis.

The 7 browser scenarios passed on Wrangler 4.118.0 using local-only compatibility
date 2026-08-06; default Wrangler 4.138.0 started but hung on asset requests on this
host. The production configuration remains 2026-09-20. Portable preview verifies
the same generated route documents/headers but is not itself Cloudflare.

Commands and reproduction entry points are in `HANDOFF.md` and package scripts.
A clean `npm run build` reinstalled all three frontend dependency trees, reran the frontend tests/checks and assembled the production-config candidate successfully (235 files, about 23MB).

Generated screenshots live in `artifacts/verification/` (ignored build evidence).

## Remaining boundaries

1. **Deployment is unchanged.** The current live kernel is the previous protocol.
   New v2 WASM and a new configured testnet contract are required. Existing funds
   are governed by the old deployment; there is no automatic upgrade/migration.
2. **No real wallet→testnet→anchor round trip was submitted.** Extension approval,
   mobile WalletConnect, provider availability and live token/payment responses
   remain external acceptance work. The wallet selection UI did load under CSP.
3. **LOBSTR cannot supply a verifiable network in the installed adapter**, so it
   fails closed. Direct account-key signatures are supported; arbitrary delegated
   signer sets/multisig require a separate verified account-threshold flow.
4. **Nine dependency audit records remain** on an unused adapter branch. No safe
   same-major patch was available. A breaking downgrade/override was not applied.
5. **Contract storage restoration/maintenance is still operational work.** Read
   simulation does not persist TTL extensions. No automatic keeper is implemented.
6. **ZK is experimental and standalone.** It is not connected to Pod claims, does
   not hide payment metadata, and uses a demo trusted setup.
7. Local history is a device record. An unsigned export checksum is not chain
   attestation; confirmed entries include receipts when the UI recorded them.
8. Client 3D rendering has a lazy ~529kB scene chunk (~136kB gzip). It is paused
   offscreen; reduced-motion/fallback work. Real low-end GPU profiling remains
   device-specific; headless software rendering is not a device performance score.

## Artifacts

- `contracts/hak/SECURITY_PROTOCOL.md`: exact protocol/migration/storage semantics.
- `docs/verification/2026-09-24-wallet-security.md`: detailed wallet audit.
- `app/site/`: deployable static candidate assembled from source.
- `shared/space-scene.ts`: procedural model and animation source.
- `contracts/hak/target/wasm32v1-none/release/hak.wasm` SHA256:`84f27bf757386d98307bff4df28aacb87093536dae079578a1a53231a60b8cb6`.
- `contracts/zk-preimage/wasm/zk_preimage.wasm` (optimized/tested) SHA256:`b291392751b2d9f422177913e94c9cb237f6a4e74c581815a234f560f1b00a02`.
