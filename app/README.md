# app/ — Agyion transaction interface

Next.js 15 + TypeScript + Tailwind + framer-motion, exported as static documents. The root landing is a separate Vite application in ../landing; the combined site is assembled into app/site for the Cloudflare Worker configured in wrangler.toml.

The [26 September release record](../docs/verification/2026-09-26-cloudflare-release.md) describes an earlier published frontend. Current source requires **kernel protocol V3** for writes; it does not upgrade the old deployed kernel or migrate locked funds. Source checks and local builds are not release evidence. See [the security protocol](../contracts/hak/SECURITY_PROTOCOL.md).

## Modes and configuration

NEXT_PUBLIC_* settings are baked in at build time. Source defaults to mock; setting Soroban mode requires an explicitly configured contract. The older historical contract ID is not a compatible V3 default.

| Variable | Source default / purpose |
| --- | --- |
| NEXT_PUBLIC_HAK_MODE | mock: localStorage simulation; soroban: RPC client with V3 write gate |
| NEXT_PUBLIC_HAK_CONTRACT_ID | Empty; set a verified V3 contract for writes |
| NEXT_PUBLIC_SOROBAN_RPC_URL | https://soroban-testnet.stellar.org |
| NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE | Test SDF Network ; September 2015 |
| NEXT_PUBLIC_HAK_ASSET_CODE / NEXT_PUBLIC_HAK_ASSET_ADDRESS | USDC / Circle testnet issuer from app/lib/config.ts |
| NEXT_PUBLIC_HAK_ASSET_CONTRACT_ID | Configured testnet USDC SAC address; distinct from the classic issuer |
| NEXT_PUBLIC_ANCHOR_URL | https://tr-mock-anchor.fly.dev; separate mock-bank sandbox, including in local kernel-mock mode |
| NEXT_PUBLIC_ANCHOR_SIGNING_KEY | Optional expected signing-key pin, checked against the HTTPS discovery response |
| NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID | Empty; optional WalletConnect integration |

## Current flows

- **Fade:** create a declining-price record, claim, submit a venue-signed handoff or an eligible refund.
- **Pod V3:** save a fresh random seed; sign exact creation terms and, after unlock, a chosen recipient. Raw seeds stay out of RPC; amount and address data remain public. No refund or key recovery.
- **Trigger:** a configured single attester signs for a fixed beneficiary; an eligible deadline refund returns funds to the funder.
- **Envoy:** at most 50 nonpositive-price Fade claims for the owner before expiry/revocation. Monetary fields are not positive-price spending allowances. The runner stops when its panel closes.
- **Ramp:** SEP-10/12/6 sandbox flow plus a quote calculator and trustline helper; no real bank transfer is established.
- **Ledger:** local records and transaction recovery. Proof Pack is JSON plus checksum with an optional test-signer signature; it is not settlement evidence by itself.

Test-wallet keys and Pod seeds are memory-only in their current flows. Trigger/Envoy demo keys and saved venue identities still use sessionStorage; input masking does not secure their custody. See [limitations](../docs/LIMITATIONS.md). The standalone preimage verifier and public/zk fixtures do not authorize Pod payments or implement anonymity/M-of-N disclosure.

## Local commands

```bash
npm ci
npm run dev          # app dev server
npm test
npm run typecheck
npm run build        # app/out only; no publication
```

For the combined candidate, run npm run build from the repository root. Publishing or deploying a contract is a separate operation. Generated bindings in lib/hak-bindings describe the local ABI; their existence does not establish a compatible deployed contract.
