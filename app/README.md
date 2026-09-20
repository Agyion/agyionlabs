# app/ — Agyion frontend

Next.js 14 (app router) + TypeScript + Tailwind + framer-motion. Static export, deployed to Cloudflare (`wrangler.toml`; live: https://agyion.jasurbek-rustamov.workers.dev and https://agyionlabs.dev).

The app talks to the deployed Soroban kernel contract on Stellar testnet in **soroban mode** (default for the live build) or runs a fully local **mock mode** (localStorage) when no contract is configured.

## Modes

Set via `NEXT_PUBLIC_*` env vars (see `app/lib/config.ts`; the live deployment already carries the testnet values as defaults):

| Env var | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_HAK_MODE` | `mock` | `mock` = localStorage demo client · `soroban` = real testnet bindings (`app/lib/hakClient.ts`) |
| `NEXT_PUBLIC_HAK_CONTRACT_ID` | — | Kernel contract ID (soroban mode) — live: `CAVVTPBBNOCMDBC26CVOXKSU7B7MDK33TXQXTVUVKSJHSVKGLZTVJ5N5` |
| `NEXT_PUBLIC_SOROBAN_RPC_URL` | `https://soroban-testnet.stellar.org` | Soroban RPC |
| `NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` | Network passphrase |
| `NEXT_PUBLIC_HAK_ASSET_CODE` / `NEXT_PUBLIC_HAK_ASSET_ADDRESS` | `USDC` / `GBBD47…FLA5` | Ramp asset (classic issuer) |
| `NEXT_PUBLIC_HAK_ASSET_CONTRACT_ID` | `CBIELTK6…QDAMA` | USDC SAC contract ID — the `asset` param the kernel expects |
| `NEXT_PUBLIC_ANCHOR_URL` | `https://tr-mock-anchor.fly.dev` | Official hackathon TR mock anchor (SEP-10/6/12/38) |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | — | Optional; without it the WalletConnect module is hidden from the connect modal |

## Structure

- `app/page.tsx` + `app/components/landing/` — animated landing page (hero lifecycle scene, template cards, why-Stellar, compliance strip).
- `app/components/app/` — the app shell with five tabs:
  - **Fade** — declining-price campaigns: create, live price clock (crosses zero → pool pays), claim, venue-signed handoff, rule-based refund.
  - **Pod** — sha256-preimage + timelock capsules: create, claim with preimage after unlock ledger.
  - **Trigger** — event escrow: create with beneficiary + attester key, attest (ed25519), deadline refund.
  - **Envoy** — agent mandates: grant (per-tx cap, daily cap, expiry), agent claims a sub-zero Fade for the owner, one-click revoke.
  - **On/Off-ramp** — SEP-10 auth → SEP-12 KYC fields → SEP-6 deposit/withdraw against the TR mock anchor, with SEP-38 quote display and trustline helper.
  - **Ledger** — local record of everything you did; export = **Proof Pack** (signed JSON, never leaves your device unless you share it).
- `app/lib/` — `config.ts` (env), `client.ts` (mode switch), `hakClient.ts` (soroban calls), `anchor.ts` (SEP client), `signers.ts` + `wallet.ts`/`walletsKit.ts`/`useWallet.ts` (Stellar Wallets Kit signing), `ledgerLog.ts`/`useLedger.ts` (local ledger), `accountOps.ts` (friendbot + trustline helpers), `format.ts`.
- `lib/hak-bindings/` — generated Soroban TypeScript bindings for the kernel contract.
- `public/zk/` — ZK showcase artifacts (vk/proof/public) for the stub demo path (see root `docs/LIMITATIONS.md` §4).
- `scripts/anchor-smoke.mjs` — smoke script against the mock anchor.

## Develop

```bash
npm install
npm run dev          # http://localhost:3000 (mock mode by default)
```

## Build & deploy

```bash
npm run build        # next build; static export (see next.config.mjs)
```

Deploys to Cloudflare via wrangler (`wrangler.toml`). All env is `NEXT_PUBLIC_*`, so a static export bakes the configuration in — set the vars above before building for a soroban-mode deployment.
