# agyionlabs

> **Conditional money: it locks, it executes itself when proven, and it returns when not.**

Agyion is a conditional-payments application on Stellar (Soroban). One kernel contract, four condition templates, a regulated fiat rail on one side and a local proof ledger on the other. This repository is the Genesis Track MVP of the Rise In × Stellar Pro Hackathon (Istanbul, 19–20 September 2026): kernel contract + four templates + testnet + live demo.

---

## Live deployment (testnet)

| Artifact | Value |
| --- | --- |
| **App (live demo)** | https://agyionlabs.dev · https://agyion.jasurbek-rustamov.workers.dev |
| **Kernel contract** | `CAVVTPBBNOCMDBC26CVOXKSU7B7MDK33TXQXTVUVKSJHSVKGLZTVJ5N5` ([Stellar Lab](https://lab.stellar.org/r/testnet/contract/CAVVTPBBNOCMDBC26CVOXKSU7B7MDK33TXQXTVUVKSJHSVKGLZTVJ5N5) · [Stellar Expert](https://stellar.expert/explorer/testnet/contract/CAVVTPBBNOCMDBC26CVOXKSU7B7MDK33TXQXTVUVKSJHSVKGLZTVJ5N5)) |
| **Network** | Stellar testnet (`Test SDF Network ; September 2015`), RPC `https://soroban-testnet.stellar.org` |
| **Ramp asset** | USDC testnet — issuer `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` |
| **Anchor** | Official hackathon TR mock anchor (SEP-6/10/12/38): `https://tr-mock-anchor.fly.dev` |
| **On-chain proof** | Pod lock 1 XLM → [tx d193a85b…](https://stellar.expert/explorer/testnet/tx/d193a85b854aa89806bad61b4247db0dd663ce75e28daaa0833e2240822a80ae) · preimage claim → [tx f466151d…](https://stellar.expert/explorer/testnet/tx/f466151d901b7befd3a1ab24cc41b82df321c71ff20bdb8e181ee2193db5c150) |

The app talks to the deployed contract directly (soroban mode, no mock) and signs with the user's wallet (Freighter via Stellar Wallets Kit).

---

## The problem

Every day, value dies at the boundary between the physical and the digital because money has no native "if":

- A bakery throws away 8 unsold portions at closing time. Existing rescue apps stop at a *positive* discount — nobody lets the price fall below zero, even though the marginal cost of waste is already negative.
- A buyer pays, never shows up, and the deposit dispute begins. Money needs a rule-based way back, not a support ticket.
- Families and courts hold obligations that must execute *when an event is registered* — not when someone feels like paying.
- People want to delegate small spending decisions to software agents, but today's agent wallets are either unlimited (dangerous) or custodial (a new bank).

Users are already asking for this in public. On r/toogoodtogo: *"Money is still money, why not just give the food away for free if preventing food waste is the main objective?"* On Hacker News: *"Restaurants need to start charging non-refundable deposits… No show… you lose $20–$40."* The demand is documented; the supply does not exist (see [Originality](#originality-evidence)).

## What Agyion is (one sentence)

**Agyion is conditional money: funds lock into a contract, they execute themselves when a condition is proven, and they return automatically — no discretion — when it is not.**

Agyion is not a wallet, not a stablecoin, and not a payment processor. It never touches user funds: money sits in the contract on-chain and at the regulated anchor off-chain. The merchant only ever sees fiat TRY (anchor → bank); crypto is never the payment instrument at the counter.

## The lifecycle

```text
LOCK ──► CONDITION WINDOW ──► PROOF? ──► yes ──► EXECUTE (pay claimant/beneficiary)
  │                                │
  │                                └────► no ───► refund(): rule-based, automatic,
  │                                               zero-discretion return to owner
  └─ funds never pass through Agyion; they live in the contract and at the anchor
```

`refund()` is the heart of the product: anyone may call it, it follows the recorded rule, and it always pays the recorded owner. No admin key, no support queue, no discretion. (An *exceptional* compliance freeze — M-of-N + 72-hour public queue + user `contest()` veto — exists only in the compliance layer design, never in the demo path, and no single party can trigger it alone.)

## The four templates

One kernel, four condition packs. On-chain they are generic (`T1..T4`); meaning lives off-chain.

| Template | Mechanism | Return path | The promise |
|---|---|---|---|
| **Fade** ⏱ | Declining price clock; venue-signed handoff (`ed25519`) settles at the price of that ledger | `refund()` on no-show / expiry — automatic, rule-based | "Proven, it pays; unproven, it returns." Price may cross zero: the campaign pool pays the claimant. |
| **Pod** 🗝 | `sha256(preimage)` key + `unlock_ledger` timelock | None (optional expiry claimant back to funder) | "No one opens before 2035 — not even me." No clawback flag, no refund path. |
| **Trigger** 📜 | Event escrow; an independent attester's `ed25519` signature executes the payout | `refund_trigger()` after deadline if unattested | Conditional execution without either party's consent at execution time. |
| **Envoy** 🤖 | On-chain limited mandate: agent key, per-tx cap, daily cap, `valid_until`, recipient bound to owner | One-click `revoke_mandate()` (instant, owner-only) | A mandate enforced by the contract, not by the agent's goodwill. |

## Architecture

```mermaid
flowchart LR
    subgraph User side
        APP["app/ — Next.js 14 static export<br/>Fade · Pod · Trigger · Envoy · Ledger"]
        LEDGER["Ledger (local)<br/>export = Proof Pack<br/>(signed JSON, never on a server)"]
    end

    subgraph Stellar testnet
        KERNEL["contracts/hak — agyion kernel<br/>single contract, generic template IDs T1–T4<br/>lock / claim / refund / attest / mandate"]
        ASSET["USDC — Circle testnet issuer<br/>(SAC-compatible, clawback flag OFF)"]
    end

    subgraph Fiat side (regulated)
        ANCHOR["tr-mock-anchor.fly.dev — official hackathon<br/>TR mock anchor: SEP-10 / SEP-6 / SEP-38,<br/>KYC (SEP-12) off-chain"]
        BANK["Merchant bank account<br/>sees TRY only"]
    end

    AGENT["Agent (off-chain, optional)<br/>proposes; the contract disposes"]

    APP -- "Soroban RPC" --> KERNEL
    APP -- "SEP-6 deposit/withdraw (TRY↔USDC)" --> ANCHOR
    ANCHOR --- ASSET
    ASSET --- KERNEL
    ANCHOR -- "bank rails (simulated on testnet)" --> BANK
    AGENT -- "envoy_claim(mandate_id, fade_id, sig)" --> KERNEL
    APP --- LEDGER
```

Design invariants:

- **Funds never touch Agyion.** On-chain in the contract, off-chain at the anchor.
- **Identity at the ramp, privacy on-chain.** PII lives off-chain with the anchor (SEP-12); the two never meet in a single on-chain record.
- **The merchant sees only TRY.** Conversion and settlement are separate rails; no payment intermediary in between.
- **The LLM/agent is off-chain and optional.** *The agent proposes, the guard disposes* — swap the model, the rules don't change.

## Repository layout

| Path | Contents |
|---|---|
| `contracts/hak/` | Soroban kernel contract (Rust, `soroban-sdk` 28) — Fade, Pod, Trigger, Envoy + 26 unit tests |
| `app/` | Next.js 14 + TypeScript + Tailwind; mock mode (localStorage) + soroban mode via generated bindings; **On/Off-ramp tab** = SEP-10/SEP-6/SEP-38 client for the official TR mock anchor (`app/app/lib/anchor.ts`) |
| `anchor/` | *Self-host alternative* (not the demo path): Anchor Platform `assets.yaml` (tTRY, SEP-24) + quick-run notes and known traps |
| `scripts/` | `setup.sh` (toolchain check), `deploy_testnet.sh` (testnet deploy + tTRY issuance) |
| `docs/` | [PITCH.md](docs/PITCH.md) · [DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) · [LIMITATIONS.md](docs/LIMITATIONS.md) |
| `SPEC_V2.md` | Binding build spec (contract signatures are sacred) |

## Quickstart

Prerequisites: Rust toolchain with the `wasm32v1-none` target, `stellar` CLI, Node.js 18+, Docker (optional, for the anchor).

```bash
# 0) Toolchain check (installs nothing; reports what is missing)
./scripts/setup.sh

# 1) Contract: build + test
cd contracts/hak
cargo test                                    # expect: 26 passed; 0 failed
cargo build --target wasm32v1-none --release  # produces the deployable wasm

# 2) Deploy to testnet (friendbot funding + wasm deploy + tTRY issuance)
cd ../..
DRY_RUN=1 ./scripts/deploy_testnet.sh         # print the plan, touch nothing
./scripts/deploy_testnet.sh                   # live run; prints the contract ID

# 3) App
cd app && npm install && npm run dev          # http://localhost:3000
# Default is mock mode (localStorage) — safe without a contract.
# To run against testnet:
#   NEXT_PUBLIC_HAK_MODE=soroban
#   NEXT_PUBLIC_HAK_CONTRACT_ID=<id from step 2>
#   NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
# The On/Off-ramp tab works in both modes; it talks to the official hackathon
# TR mock anchor (SEP-6). Override only if you run your own anchor:
#   NEXT_PUBLIC_ANCHOR_URL=https://tr-mock-anchor.fly.dev   (default)

# 4) Static export + deploy (Cloudflare Pages)
npm run build                                 # output: 'export' → app/out
```

**Anchor:** the app integrates the official hackathon TR mock anchor (`https://tr-mock-anchor.fly.dev`) — a SEP-6 TRY↔USDC rail with SEP-10 auth, SEP-12 KYC and SEP-38 quotes; the bank leg is simulated by the sandbox. The self-host Anchor Platform quick-run (SEP-24 flow, also simulated) remains as an alternative in [anchor/README.md](anchor/README.md).

## Test evidence

`cargo test` in `contracts/hak`: **26 passed, 0 failed** (soroban-sdk 28, wasm target `wasm32v1-none`).

| Layer | Proof | Command |
|---|---|---|
| Fade core | positive-price settle; negative price pays claimant from pot; pot-cap on negative floor; excessive negative floor rejected | `cargo test` |
| Fade rules | no-show `refund()` after handoff window; refund after deadline; same-ledger double claim → first wins; zero venue key / zero window rejected | `cargo test` |
| Venue signature | ed25519 handoff signature, byte-for-byte TS↔Rust parity test; invalid signature behavior documented (host trap) | `cargo test venue_sig_ts_parity` |
| Pod | early claim rejected, wrong preimage rejected, timely claim pays | `cargo test pod` |
| Trigger | attester signature executes; bad signature rejected; refund only after deadline; early refund rejected | `cargo test trigger` |
| Envoy | claim within cap; cap exceeded → `CapExceeded`; expired → `MandateExpired`; revoked → `Unauthorized`; recipient binding to owner | `cargo test envoy` |
| Cross-template | a mandate claim settles into the owner's Fade claim correctly | `cargo test cross_template` |

## Stellar Skills attribution

Built with the official and community Stellar skills, per the hackathon handbook requirement:

| Skill | Where it was used |
|---|---|
| `skills/anchors` ([stellar-anchor-skill](https://github.com/CheesecakeLabs/stellar-anchor-skill)) | SEP-10/SEP-6 client integration against the official TR mock anchor (`app/app/lib/anchor.ts`, On/Off-ramp tab); the "13 gotchas" list shaped our memo handling and `/info`-is-the-contract checks; `anchor/` keeps the self-host SEP-24 alternative |
| `skills/standards` ([stellar/stellar-dev-skill](https://github.com/stellar/stellar-dev-skill)) | SEP-10/SEP-6/SEP-38 alignment, SAC-compatible asset usage, claimable-balance semantics behind Fade's native reclaim path |
| `skills/zk-proofs` ([stellar/stellar-dev-skill](https://github.com/stellar/stellar-dev-skill)) | ZK roadmap grounding: Protocol 25 "X-Ray" (BN254 + Poseidon host functions) feasibility for agent-less anonymous claims (MVP ships a measured stub — see LIMITATIONS) |
| `skills/agentic-payments` ([stellar/stellar-dev-skill](https://github.com/stellar/stellar-dev-skill)) | Envoy mandate design: spending caps, TTL, fee-sponsored agent flows, and the smart-account/policy-signer variant of on-chain mandate enforcement |

## Security model — who can see and do what

| Who | Sees | Can do | Cannot do |
|---|---|---|---|
| **Anchor** | KYC (off-chain, SEP-12) + rail in/out | Process fiat deposit/withdraw | See on-chain amounts per user, freeze funds, or link identity to chain records alone |
| **Auditor (M-of-N, roadmap)** | Channel reports (amounts, balances) | Report | Move funds; de-anonymize alone (threshold Shamir split, court-attested assembly) |
| **Kernel contract** | — | Enforce rules | Be stopped by any single party (freeze requires M-of-N + 72h public queue; the user can veto via `contest()`) |
| **The team** | The code | Write code | Touch user funds or data; the kernel is immutable, the frontend replicable |
| **An Envoy agent** | Its mandate parameters | Claim within caps, before expiry, only to the owner | Exceed caps, redirect recipients, survive revocation |

## Originality evidence

Before building, we swept DoraHacks, ETHGlobal/Devpost, Reddit, Hacker News, Ekşi Sözlük, bitcointalk and the bitcoin-dev list — **400+ queries across five research waves** (method and excerpts in `research/deep_forum_sweep.md`):

- **Fade (negative price + reverse clock + no-show reclaim): CLEAN.** No product, hackathon project, or serious forum proposal combines them. Closest neighbors stop at positive discounts (Too Good To Go ~⅓ price, Fazla ~50%) or forbid money entirely (Olio).
- **Pod (multi-year timelock + unknown recipient + physical discovery): components exist, the combination is CLEAN.** Closest: SF Hidden Bitcoin (2014, finder-keeps, no timelock) and Registree (2023, 16-year lock, but known recipient).
- **Trigger (oracle-attested, consent-free execution at event registration): CLEAN** for the execution pattern; the legal concept (deferred obligation executed on a recorded event) is centuries old — the technical automation is unbuilt.

## Limitations

Honest scope beats an inflated demo. Read **[docs/LIMITATIONS.md](docs/LIMITATIONS.md)**: mock attester, basic sybil quota, single-hop offline claims, ZK stub, testnet anchor simulation, and Envoy's negative-price-only restriction — each with impact and roadmap.

## Roadmap

- **Loxias — the attester marketplace.** Independent, staked, reputation-scored attesters for Trigger and Fade handoffs; service fees are the protocol-external revenue layer.
- **Nostr bridge.** Signed claim/attestation announcements as kind-1 events; NIP-46 remote signing and the ed25519↔secp256k1 identity bridge. (Verified prior-art gap.)
- **Proof-of-innocence.** "My funds are not in the illicit set" proofs without revealing identity (Privacy Pools direction) — compliance-forward privacy, not blind anonymity.
- **Multi-hop offline value transfer.** Today: single-hop offline claim proofs (prepare in airplane mode, submit when online). Multi-hop bearer transfer returns when the regulatory frame matures.
- **CAP-71-ready authorization** and Protocol 25 (BN254/Poseidon) native ZK claims as the network enables them.

## License

MIT (see LICENSE). Kernel contract: immutable once deployed; the frontend is replicable by anyone.
