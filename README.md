# agyionlabs

> **Conditional money: funds lock, proof authorizes settlement, and unmet conditions enable refunds.**

Agyion is a conditional-payments application on Stellar (Soroban). One kernel contract, four condition templates, a sandbox fiat-rail integration on one side and a local proof ledger on the other. This repository is the Genesis Track MVP of the Rise In × Stellar Pro Hackathon (Istanbul, 19–20 September 2026): kernel contract + four templates + testnet + live demo.

## Current local revision — 24 September 2026

The orbital interface and security protocol v2 are implemented and verified
**locally**. This revision has not been deployed to testnet or published to the
websites below. The current app defaults to mock mode; its Soroban client
requires `protocol_version() == 2` and refuses protected operations against the
older kernel. A new kernel deployment, matching public configuration and an app
rebuild are required before claiming live v2 behavior. Existing locked funds
remain under the earlier contract; no automatic migration exists.

Start with [HANDOFF.md](HANDOFF.md), the [security protocol and migration
notes](contracts/hak/SECURITY_PROTOCOL.md), and the [local audit evidence and
remaining limits](docs/verification/2026-09-24-orbital-audit.md). The historical
hackathon narrative and roadmap below should be read with those current limits.

## Historical hackathon testnet deployment — before this security revision

| Artifact | Value |
| --- | --- |
| **Earlier demo URLs** | [agyionlabs.dev](https://agyionlabs.dev) · [Workers demo](https://agyion.jasurbek-rustamov.workers.dev) |
| **Earlier kernel — not protocol v2** | `CAVVTPBBNOCMDBC26CVOXKSU7B7MDK33TXQXTVUVKSJHSVKGLZTVJ5N5` ([Stellar Lab](https://lab.stellar.org/r/testnet/contract/CAVVTPBBNOCMDBC26CVOXKSU7B7MDK33TXQXTVUVKSJHSVKGLZTVJ5N5) · [Stellar Expert](https://stellar.expert/explorer/testnet/contract/CAVVTPBBNOCMDBC26CVOXKSU7B7MDK33TXQXTVUVKSJHSVKGLZTVJ5N5)) |
| **Network** | Stellar testnet (`Test SDF Network ; September 2015`), RPC `https://soroban-testnet.stellar.org` |
| **Ramp asset** | USDC testnet — issuer `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` |
| **Anchor** | Official hackathon TR mock anchor (SEP-6/10/12/38): `https://tr-mock-anchor.fly.dev` |
| **Historical transactions — earlier Pod flow** | Pod lock 1 XLM → [tx d193a85b…](https://stellar.expert/explorer/testnet/tx/d193a85b854aa89806bad61b4247db0dd663ce75e28daaa0833e2240822a80ae) · preimage claim → [tx f466151d…](https://stellar.expert/explorer/testnet/tx/f466151d901b7befd3a1ab24cc41b82df321c71ff20bdb8e181ee2193db5c150) |

These addresses and transactions record the earlier hackathon demo. They do
not establish that the current local revision is deployed or that the new
commit/reveal and signature protections are active there. The new Soroban
client fails closed on that older kernel; kernel operations require a
compatible, explicitly configured v2 deployment.

---

## The problem

Every day, value dies at the boundary between the physical and the digital because money has no native "if":

- A bakery throws away 8 unsold portions at closing time. Existing rescue apps stop at a *positive* discount — nobody lets the price fall below zero, even though the marginal cost of waste is already negative.
- A buyer pays, never shows up, and the deposit dispute begins. Money needs a rule-based way back, not a support ticket.
- Families and courts hold obligations that must execute *when an event is registered* — not when someone feels like paying.
- People want to delegate small spending decisions to software agents, but today's agent wallets are either unlimited (dangerous) or custodial (a new bank).

Users are already asking for this in public. On r/toogoodtogo: *"Money is still money, why not just give the food away for free if preventing food waste is the main objective?"* On Hacker News: *"Restaurants need to start charging non-refundable deposits… No show… you lose $20–$40."* The demand is documented; the supply does not exist (see [Originality](#originality-evidence)).

## What Agyion is (one sentence)

**Agyion is conditional money: funds lock into a contract, a submitted proof can authorize settlement, and an eligible refund transaction returns them by the recorded rule.**

Agyion is not a wallet, not a stablecoin, and not a payment processor. It never touches user funds: money sits in the contract on-chain and at the regulated anchor off-chain. The merchant only ever sees fiat TRY (anchor → bank); crypto is never the payment instrument at the counter.

## The lifecycle

```text
LOCK ──► CONDITION WINDOW ──► PROOF? ──► yes ──► EXECUTE (pay claimant/beneficiary)
  │                                │
  │                                └────► no ───► refund(): submitted transaction,
  │                                               zero-discretion return to owner
  └─ funds never pass through Agyion; they live in the contract and at the anchor
```

`refund()` is the heart of the product: anyone may submit it, it follows the recorded rule, and it pays the recorded owner. Someone must submit and pay for the transaction; expiry alone does not move funds. No autonomous keeper is included. No admin key, no support queue, no discretionary destination. (An *exceptional* compliance freeze — M-of-N + 72-hour public queue + user `contest()` veto — exists only in the compliance layer design, never in the demo path, and no single party can trigger it alone.)

## The four templates

One kernel, four condition packs. On-chain they are generic (`T1..T4`); meaning lives off-chain.

| Template | Mechanism | Return path | The promise |
|---|---|---|---|
| **Fade** ⏱ | Declining price clock; venue-signed handoff (`ed25519`) settles at the price of that ledger | `refund()` transaction on no-show / expiry — rule-based | "Proven, it pays; unproven, it returns." Price may cross zero: the campaign pool pays the claimant. |
| **Pod** 🗝 | `sha256(preimage)` key + `unlock_ledger` timelock + recipient-bound commit/reveal | No refund path | "No one opens before 2035 — not even me." No app-admin unlock or refund path; asset issuer policies still apply. |
| **Trigger** 📜 | Event escrow; an independent attester's `ed25519` signature executes the payout | `refund_trigger()` after deadline if unattested | Conditional execution without either party's consent at execution time. |
| **Envoy** 🤖 | On-chain limited mandate: agent key, per-tx cap, daily cap, `valid_until`, recipient bound to owner | One-click `revoke_mandate()` (instant, owner-only) | A mandate enforced by the contract, not by the agent's goodwill. |

## Use cases — one real-world story per template

- **Fade — the bakery that would rather pay you than throw food away.** A Kadıköy bakery has 8 unsold portions at closing time. It loads a Fade campaign: a compensation pot (say 400 USDC), start price 30 TRY, floor **−20 TRY**, slope a few TRY every ten minutes. At 19:40 the price is still positive — normal sale. At 20:30 the clock has crossed zero: the campaign pool now **pays the taker** to rescue the food, because the marginal cost of a wasted portion is already negative. Whoever claims taps "Produce signature" at the counter (the venue's demo key signs the handoff), and settlement happens at the price of the claim ledger — including negative. Nobody shows up? The pickup window expires and `refund()` returns the pot to the bakery — when someone submits the eligible refund transaction, by rule, without a support ticket. Existing rescue apps stop at a *positive* discount (Too Good To Go ~⅓, Fazla ~50%) or forbid money entirely (Olio); nobody lets the price fall below zero, even though waste already costs money.
- **Pod — money that cannot move until the date, and the key you can hand to a stranger.** A parent locks an education fund that unlocks in 2035 and prints the sha256 preimage as a QR inside a letter. Until the unlock ledger passes, **no one** opens it — not the parent, not us, no admin key. After it: whoever physically holds the preimage claims it. Multi-year timelock + unknown recipient + physical discovery in one instrument.
- **Trigger — the obligation that executes when the event is registered, not when someone feels like it.** A freelance milestone, an insurance payout on a registered flight delay, family support that must arrive when the attestation lands: the funder locks USDC for a beneficiary, an **independent attester's** ed25519 signature executes the payout — no consent needed from either party at execution time. If the deadline passes unattested, `refund_trigger()` sends it back to the funder. Deadlines resolve everything; disputes cannot deadlock (see EC-2 for the mutual-consent fast path in Trigger v2).
- **Envoy — an AI agent that can shop, but can never run away with the money.** You grant an agent key an on-chain mandate: max per transaction, daily cap, an expiry, and a recipient hard-bound to **you**. Your agent hunts sub-zero Fade campaigns ("free food within my caps") and claims them *for* you — the contract enforces the limits, so the agent cannot exceed a cap, redirect funds, or outlive `valid_until`. One click revokes it, instantly. Worst case is bounded by the remaining daily cap — the agent's goodwill is never part of the security model.

## Historical demo guide — the 5-minute jury run

This is the earlier jury flow, preserved for context. It is not verification of the current local revision. For v2, deploy and configure the new kernel first, and use the Pod commit/reveal flow described in the security protocol.

**0:00 — Wallet (1 min).** Install [Freighter](https://www.freighter.app/) → open its ⚙️ menu → switch network to **Testnet**.

**0:30 — Open the app (30 s).** Go to [agyionlabs.dev](https://agyionlabs.dev) (mirror: [agyion.jasurbek-rustamov.workers.dev](https://agyion.jasurbek-rustamov.workers.dev)) → **Launch app**. The soroban-mode banner shows the live kernel contract ID (`CAVVTPB…VJ5N5`) — this is the real contract, not a mock.

**1:00 — Connect + fund (45 s).** Connect wallet (Stellar Wallets Kit → Freighter). If the account is new, fund it from friendbot via the in-app prompt, then create the **USDC trustline** (one click in the On/Off-ramp tab — the app offers it before your first deposit).

**1:30 — The fiat rail (1 min, highest-weighted criterion).** Open the **On/Off-ramp** tab: sign the SEP-10 authentication challenge → complete the KYC fields (SEP-12, stored off-chain at the anchor) → **Get deposit instructions** → the anchor returns (simulated) FAST/EFT bank instructions → confirm, and USDC lands in your wallet. Withdrawal is the mirror: register a withdrawal to a TRY IBAN (SEP-6) and send USDC to the anchor's given account+memo. This is the official hackathon TR mock anchor — the bank leg is simulated honestly (see [LIMITATIONS §5](docs/LIMITATIONS.md)).

**2:30 — Fade (90 s).** Create a campaign (pot, start price, a **negative floor**, duration) → watch the price clock tick down and **cross zero** ("campaign pool pays" badge) → **Claim** → at the counter, paste the venue handoff signature (demo "Produce signature" button) → **Confirm handoff** → settlement at the price of that ledger, visible on Stellar Expert. Then show the no-show path: after the handoff window, **Refund** returns the pot by rule.

**4:00 — Pod, Trigger, Envoy (60 s, pick any).** *Pod:* create a pod with a sha256 hash → claim it with the preimage after the unlock ledger. *Trigger:* fund an escrow for a beneficiary → attest with the attester key → payout executes; show `refund_trigger()` after an unattested deadline. *Envoy:* grant a mandate (agent key, caps, expiry) → watch the agent claim a sub-zero Fade within caps → **revoke** in one click.

**4:45 — The ledger (15 s).** Open **Ledger** → **Export Proof Pack**: a signed JSON of everything that happened, provable offline. "Ne alaka? Alın size kanıt."

> **Demo-day fallback:** if the network or venue Wi-Fi dies, the on-chain proof stands alone — Pod lock [tx d193a85b…](https://stellar.expert/explorer/testnet/tx/d193a85b854aa89806bad61b4247db0dd663ce75e28daaa0833e2240822a80ae) and preimage claim [tx f466151d…](https://stellar.expert/explorer/testnet/tx/f466151d901b7befd3a1ab24cc41b82df321c71ff20bdb8e181ee2193db5c150) on stellar.expert, plus mock mode for UI continuity (clearly labeled).

## Architecture

```mermaid
flowchart LR
    subgraph User side
        APP["app/ — Next.js 14 static export<br/>Fade · Pod · Trigger · Envoy · Ledger"]
        LEDGER["Ledger (local)<br/>export = Proof Pack<br/>(signed JSON, never on a server)"]
    end

    subgraph Stellar testnet
        KERNEL["contracts/hak — agyion kernel<br/>single contract, generic template IDs T1–T4<br/>lock / claim / refund / attest / mandate"]
        ASSET["USDC — Circle testnet issuer<br/>(SAC-compatible; issuer policies apply)"]
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
| `contracts/hak/` | Soroban kernel contract (Rust, `soroban-sdk` 28) — Fade, Pod, Trigger, Envoy + **46 native tests + 1 WASM integration test** |
| `contracts/zk-preimage/` | Independent Groth16/BN254 preimage verifier (Protocol 25 host functions; 10 native tests + 1 WASM test) — working module, **not yet wired into Pod claims** (see [LIMITATIONS §4](docs/LIMITATIONS.md)) |
| `circuits/` | circom Poseidon preimage circuit + snarkjs artifacts (`input/proof/public/vk`) feeding the zk-preimage verifier |
| `app/` | Next.js 14 + TypeScript + Tailwind; mock mode (localStorage) + soroban mode via generated bindings; **On/Off-ramp tab** = SEP-10/SEP-6/SEP-38 client for the official TR mock anchor (`app/app/lib/anchor.ts`) |
| `anchor/` | *Self-host alternative* (not the demo path): Anchor Platform `assets.yaml` (tTRY, SEP-24) + quick-run notes and known traps |
| `scripts/` | `setup.sh` (toolchain check), `deploy_testnet.sh` (read-only plan by default; explicit kernel v2 testnet deployment) |
| `docs/` | [EDGE_CASES.md](docs/EDGE_CASES.md) — adversarial design register (EC-1…EC-6) · [LIMITATIONS.md](docs/LIMITATIONS.md) — honest scope · internal TR runbooks (on/off-ramp flow, wallet-connect map, deploy notes) |
| `verifier/` | Verification run logs (`runs/`: cargo test, deploy, final) — reproducibility evidence |
| `SPEC_V2.md` | Historical v2 build spec — naming and original API provenance; the current security protocol supersedes its signature and Pod-claim layouts |
| `SPEC.md` | Historical v1 working spec (Turkish, codename "hak") — **superseded by SPEC_V2.md**, kept for provenance only; not binding |

## Quickstart

Prerequisites: Rust toolchain with the `wasm32v1-none` target, `stellar` CLI, Node.js 18+, Docker (optional, for the anchor).

```bash
# 0) Toolchain check (installs nothing; reports what is missing)
./scripts/setup.sh

# 1) Contract: build + test
cd contracts/hak
cargo test                                    # native suite: 46 passed
stellar contract build                      # produces the deployable hak.wasm
cargo test --features wasm-tests              # 47 passed, including compiled WASM

# 2) Review a kernel v2 testnet deployment plan (local checks only)
cd ../..
./scripts/deploy_testnet.sh                   # DRY_RUN=1 is the default; no network calls

# Explicit operator action only: test, build, deploy, verify protocol_version == 2
# Optional: DEPLOYER_ALIAS=<existing-funded-testnet-identity>
DRY_RUN=0 ./scripts/deploy_testnet.sh

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

**Deployment helper:** the default run only checks local tools/identity availability and prints
its plan. `DRY_RUN=0` is the explicit operator action that runs the locked kernel
tests, builds the exact `contracts/hak/target/wasm32v1-none/release/hak.wasm`,
deploys on the hard-pinned Stellar testnet, and reads back `protocol_version()`
with `--send no`. It prints the real `NEXT_PUBLIC_HAK_*`, RPC and network
passphrase settings only after confirming version 2. An existing identity is
reused and must already hold enough testnet XLM for fees; if the default identity
is absent, only `agyion-testnet-deployer` is created and funded with Friendbot.
Missing custom aliases are rejected. No issuer, trustline, asset issuance, or
asset-transfer steps run; the app already uses Circle testnet USDC. The helper
does not overwrite existing contract aliases or migrate existing locked funds.
The local security fixes still require a new deployment and an app rebuild;
the earlier deployed kernel is not upgraded by editing this repository.
See [the v2 protocol and migration notes](contracts/hak/SECURITY_PROTOCOL.md).

**Anchor:** the app integrates the official hackathon TR mock anchor (`https://tr-mock-anchor.fly.dev`) — a SEP-6 TRY↔USDC rail with SEP-10 auth, SEP-12 KYC and SEP-38 quotes; the bank leg is simulated by the sandbox. The self-host Anchor Platform quick-run (SEP-24 flow, also simulated) remains as an alternative in [anchor/README.md](anchor/README.md).

## Test evidence

The local kernel suite passes **47 tests**, including its compiled-WASM integration test (`cargo test --features wasm-tests` after `stellar contract build`). The standalone Groth16 verifier passes **11 tests** with its WASM feature enabled after building to `wasm/`. Native-only defaults run 46 and 10 tests respectively. This is local execution evidence, not deployment verification. The [audit record](docs/verification/2026-09-24-orbital-audit.md) covers the reproduced vulnerabilities, fixes, and remaining limits.

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
| `skills/zk-proofs` ([stellar/stellar-dev-skill](https://github.com/stellar/stellar-dev-skill)) | ZK roadmap grounding: Protocol 25 "X-Ray" (BN254 + Poseidon host functions) feasibility for agent-less anonymous claims (local standalone verifier ships separately from Pod claims — see LIMITATIONS) |
| `skills/agentic-payments` ([stellar/stellar-dev-skill](https://github.com/stellar/stellar-dev-skill)) | Envoy mandate design: spending caps, TTL, fee-sponsored agent flows, and the smart-account/policy-signer variant of on-chain mandate enforcement |

## Security model — who can see and do what

| Who | Sees | Can do | Cannot do |
|---|---|---|---|
| **Anchor** | KYC (off-chain, SEP-12) + rail in/out | Process fiat deposit/withdraw | See on-chain amounts per user, freeze funds, or link identity to chain records alone |
| **Auditor (M-of-N, roadmap)** | Channel reports (amounts, balances) | Report | Move funds; de-anonymize alone (threshold Shamir split, court-attested assembly) |
| **Kernel contract** | — | Enforce rules | Be stopped by any single party (freeze requires M-of-N + 72h public queue; the user can veto via `contest()`) |
| **The team** | The code | Write code | Touch user funds or data; the kernel is immutable, the frontend replicable |
| **An Envoy agent** | Its mandate parameters | Claim within caps, before expiry, only to the owner | Exceed caps, redirect recipients, survive revocation |

## Legal & compliance

Agyion is engineered so that the hard legal questions have structural answers, not policy promises. This section is the engineering design record (not legal advice); the live MVP is a testnet build.

**The founding principle: never touch the money.** Agyion is not a wallet, not an e-money issuer, not a payment processor, not a liquidity provider. Funds live inside the immutable kernel contract on-chain and at the regulated anchor off-chain. There is no admin key that can move user funds, no float, no company account user money ever passes through. This is not only philosophy — in Turkey, custody of others' crypto-assets (KVHS — Law 7262) is a criminal-law zone with multi-year prison exposure; non-custodial protocol design is what keeps the protocol outside it. Everything below follows from that line.

**Turkey regulatory position (design record):**

- **MASAK / 24/A:** self-hosted wallets sit under a *declaration* regime — not banned. The Ledger's Proof Pack export (signed, scoped evidence of your own history) is designed to make such a declaration trivial for the user: "Ne alaka? Alın size kanıt."
- **FATF R16 (travel rule)** obligations fall on the VASP — here the anchor, where KYC already lives. The protocol carries references, not identity.
- **Law 7262 / AMLR art. 79** binds service providers; self-custody software that never takes possession is outside that scope by construction.
- **GENIUS-Act-style freeze-capacity expectations** are answered structurally (see below): an exceptional compliance freeze requires M-of-N signers, a 72-hour public queue, and the user can veto via `contest()` — no single party, including the team, can freeze or seize funds.
- **Deliberately avoided territories:** multi-hop offline *bearer* instruments are the closest thing to the e-money definition and touch the TCMB payment ban — so the demo ships a single-hop offline claim proof only (prepare in airplane mode, submit when online), and multi-hop stays on the roadmap until the regulatory frame matures. Likewise we do not become a liquidity provider: holding float would break the founding principle.

**Identity split — KYC at the anchor, KYA at the operator, privacy for the user:**

- **KYC lives at the ramp.** PII is collected by the anchor under SEP-12 and stays off-chain; on-chain records carry references, never names.
- **KYA (Know Your Agent) binds the operator, never the user.** An agent key is registered to the *operator's* identity off-chain; the user delegates to a known, accountable operator. The two records never merge in a single on-chain record — identity at the operator, privacy at the user.
- **Privacy–accountability balance ("dark by default, accountable under lawful process").** On-chain, amounts and counterparties stay pseudonymous; an auditor channel is *view-only* (cannot move funds); and de-anonymization is threshold-based — a Shamir-split key (anchor + independent trustee + technical committee) assembles only under court attestation, scoped to a single transaction, never bulk. Total concealment was Tornado's path (sanctioned); total exposure is CeFi. Agyion is the third way: privacy on the ledger, accountability at the ramp. See **EC-6** in [docs/EDGE_CASES.md](docs/EDGE_CASES.md).

**The exceptional-compliance-freeze design (roadmap layer, never in the demo path):** M-of-N signers trigger → 72-hour public queue (anyone can inspect and object) → the affected user's `contest()` veto. Because the freeze is exceptional, threshold-gated, and contestable, rule-based `refund()` remains the only routine exit — zero discretion, ever.

**Compliance-forward roadmap:** *proof-of-innocence* (Privacy Pools direction) — a user proves "my funds are not in the illicit set" without revealing identity; and **Loxias**, the staked M-of-N attester marketplace that decides disputes (with a `resolve_mutual` both-sign fast path) instead of any single party.

## Originality evidence

Before building, we swept DoraHacks, ETHGlobal/Devpost, Reddit, Hacker News, Ekşi Sözlük, bitcointalk and the bitcoin-dev list — **400+ queries across five research waves** (the public repo is code-only; the full sweep notes moved out with the pitch materials):

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
