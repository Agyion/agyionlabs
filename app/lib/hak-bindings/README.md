# Kernel V3 TypeScript bindings

`src/index.ts` is the generated Soroban ABI for the reviewed public kernel.
It exports `Client`, record types and contract errors. It does not export a
`networks` preset or a `Contract` application class. Network, contract and RPC
must be supplied explicitly by the caller.

The application imports the generated source directly from
`app/app/lib/hakClient.ts`; it does not install a published `hak-bindings`
package or use this directory's optional `dist` output. The parent app resolves
and locks the Stellar SDK dependency. `package.json` and `tsconfig.json` here
are generator scaffolding for standalone compilation, not the app's release
configuration.

The generated `Client` constructs/simulates contract calls and exposes assembled
transactions. It does not enforce the application deployment, asset, wallet or
recovery policy by itself. Public UI code must continue through
`app/app/lib/client.ts` and `hakClient.ts`: the application requires
`NEXT_PUBLIC_HAK_WASM_HASH`, checks the RPC network and exact instance/code
identity, requires `protocol_version() == 3`, pins the asset and validates
wallet account/network/signatures before sending. Direct generic SDK use is
not equivalent to those protections.

Regenerate only from the reviewed local HAK WASM. Verify the encoded contract
specification against that exact artifact before accepting generated changes.
The current 23-entry ABI parity result and WASM identity are recorded in
[the HAK review](../../../docs/security/2026-09-27/HAK_FULL_REVIEW.md); deployment
and transaction evidence belong to the
[compatibility report](../../../docs/security/2026-09-27/COMPATIBILITY_RELEASE.md).
The source contains no network deployment preset and is not deployment proof.

Public Pod uses recipient-bound signatures, not a plaintext preimage or a
shielded pool. Historical `SPEC*.md` Pod layouts and old generic generator
examples must not be used as current integration instructions. No postinstall
network regeneration, package publishing or deployment is part of the app's
normal build.
