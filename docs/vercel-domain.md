# Website deployment

The combined website is built from the Vite landing and the Next.js application.
Its current deployment configuration is Cloudflare `wrangler.toml`, with static
assets assembled under `app/site`. This file no longer describes a separate
Vercel deployment or a query-string mock fallback.

Use the [root README](../README.md) for build and release commands and the
[application README](../app/README.md) for build-time environment variables.
`NEXT_PUBLIC_AGYION_CONTRACT_ID` and `NEXT_PUBLIC_AGYION_WASM_HASH` must identify
the same verified deployed kernel. The RPC and network keys are
`NEXT_PUBLIC_SOROBAN_RPC_URL` and `NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE`.
Changing configuration requires rebuilding the browser assets.

Use the active identity in [the public release record](../deployments/public-testnet.json).
The existing V3 contract remains the public default; renaming its source does not
migrate its records to another address. The separately deployed renamed build is
an inactive research/test deployment. The private pool has its own release
configuration and does not change the meaning of existing public record IDs.

For the active public release verification target, set
`EXPECTED_PUBLIC_RELEASE=active-testnet`. This selects its exact code/address pair
and requires `ready`; conflicting explicit pins are rejected. Without this explicit
selection or explicit pins/readiness, the verifier retains its closed default.

A successful build is not a deployment receipt. Verify the published files,
headers and contract readiness before calling a release complete. See the
[security policy](../SECURITY.md) for current release boundaries.
