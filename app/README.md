# app/: Agyion transaction interface

Next.js 15 + TypeScript + Tailwind + framer-motion, exported as static documents. The root landing is a separate Vite application in ../landing; the combined site is assembled into app/site for the Cloudflare Worker configured in wrangler.toml.

Current source requires **kernel protocol V3** for writes; it does not upgrade the old deployed kernel or migrate locked funds. Source checks and local builds are not release evidence. See [the security protocol](../contracts/agyion/SECURITY_PROTOCOL.md).

## Modes and configuration

NEXT_PUBLIC_* settings are baked in at build time. Source defaults to mock; setting Soroban mode requires an explicitly configured contract. The [public release record](../deployments/public-testnet.json) keeps the existing V3 deployment active so public positions and recovery records remain accessible. The renamed research deployment has separate storage and is inactive in the app. The historical pre-V3 kernel is a different, incompatible deployment.

| Variable | Source default / purpose |
| --- | --- |
| NEXT_PUBLIC_AGYION_MODE | mock: localStorage simulation; soroban: RPC client with V3 write gate |
| NEXT_PUBLIC_AGYION_CONTRACT_ID | Empty; set a verified V3 contract for writes |
| NEXT_PUBLIC_AGYION_WASM_HASH | Empty; exact reviewed code hash for that same deployment |
| NEXT_PUBLIC_SOROBAN_RPC_URL | https://soroban-testnet.stellar.org |
| NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE | Test SDF Network ; September 2015 |
| NEXT_PUBLIC_AGYION_ASSET_CODE / NEXT_PUBLIC_AGYION_ASSET_ADDRESS | USDC / Circle testnet issuer from app/lib/config.ts |
| NEXT_PUBLIC_AGYION_ASSET_CONTRACT_ID | Configured testnet USDC SAC address; distinct from the classic issuer |
| NEXT_PUBLIC_ANCHOR_URL | https://tr-mock-anchor.fly.dev; separate mock-bank sandbox, including in local kernel-mock mode |
| NEXT_PUBLIC_ANCHOR_SIGNING_KEY | Optional expected signing-key pin, checked against the HTTPS discovery response |
| NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID | Reserved; the current app offers the network-verifiable Freighter adapter |

## Private instruments

Pod, Trigger and Envoy open the experimental private workspace by default. The
workspace verifies the separate pool deployment, decrypts notes locally, builds
proofs in a browser worker and requires explicit approval of the simulated fee
before asking the wallet to sign. Its encrypted vault must be backed up to a file
and that saved file checked before funding. Pending transactions retain their
actual hash for recovery; they are not automatically resubmitted.

The setup and threshold trustees are a development profile, not independent
custody. Deposits, withdrawals, fees and timing remain observable. See
[privacy boundaries](../docs/LIMITATIONS.md) and
[authorized disclosure](../docs/PRIVACY_DISCLOSURE.md).

## Retained public flows

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

For the combined candidate, run npm run build from the repository root. Publishing or deploying a contract is a separate operation. Generated bindings in lib/agyion-bindings describe the local ABI; their existence does not establish a compatible deployed contract.
