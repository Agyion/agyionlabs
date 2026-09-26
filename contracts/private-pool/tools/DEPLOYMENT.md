# Offline testnet deployment preparation

`prepare-deployment.mjs` never calls the CLI, RPC, Friendbot or a wallet. It has
no execution switch. Root/operator authorization and successful real native/WASM
proof/budget checks must precede any separately executed deployment commands.

The order is security-critical:

1. Under an explicit operator release decision, create a **new dedicated** testnet
   signing identity in an owned 0700 directory, without overwriting any identity.
   Record its public `G...` address; this tool neither creates nor reads its key.
2. Choose and retain a 32-byte salt. Derive the intended `C...` contract address
   from the Stellar testnet network hash, source address and salt. No deployment
   is needed to determine this address.
3. Independently review the trustee authentication roster and threshold. Run the
   DKG with that exact network ID, raw decoded contract ID, epoch and session ID.
   Complete private share delivery, verified trustee storage and all signed
   acceptance messages. Never generate a different source identity after DKG.
4. Pin the signed public DKG artifact and real verifier/WASM artifacts in the
   release manifest. Prepare the offline plan, then separately review/execute it.

The manifest is JSON with exactly these fields:

- `schema`: `agyion-private-pool-testnet-release-v2`; `testOnly`: `true`
- `networkPassphrase`: `Test SDF Network ; September 2015`
- `rpcUrl`: `https://soroban-testnet.stellar.org`
- `wasm`, `transitionVk`, `revocationVk`: each `{ "path": "...", "sha256": "..." }`;
  paths resolve against the manifest, and hashes cover the exact file bytes.
- `sourceAccount`: the dedicated public Ed25519 `G...` address; `salt`: exact
  lowercase 32-byte hex; `intendedContractId`: the derived `C...` address.
- `thresholdConfig`: the independently reviewed config accepted by
  `privacy/src/threshold.mjs`; this pins roster, threshold, domain, epoch and
  session, rather than trusting whichever roster arrives with a transcript.
- `dkg`: `{ "path": "...", "sha256": "..." }`, containing exactly the public
  `{ config, packages, acceptances }` artifact. **Never include private shares.**
- `config`: `{ assets, disclosure_epoch, auditor_x, auditor_y, dkg_transcript_hash }`;
  assets are up to eight distinct contract addresses; epoch is a positive u32;
  the remaining values are lowercase 32-byte hex. Auditor coordinates are Fr.

The operator must obtain the config from the independently checked intended
testnet asset/committee profile. The public native fixture's scalar7 and fixed
test addresses are not a private committee or deployed assets. Do not blindly
reuse that fixture as deployment configuration. Preparation recomputes the
deterministic address and verifies every dealer/acceptance signature, aggregate
point, raw DKG domain, epoch, auditor coordinates and transcript hash. A copied
transcript from another deployment is rejected. These checks do not establish
trustee independence, actual share retention, transport security, a sound setup
ceremony or legal authority. Reviewed SAC addresses are required for this release;
the pool assumes exact token transfer semantics and cannot make a malicious
allowlisted token trustworthy.

Prepare a new plan using the **existing** dedicated owned 0700 identity directory
from step 1 and a new output path. The tool does not overwrite anything there:

```sh
node contracts/private-pool/tools/prepare-deployment.mjs prepare release.json /absolute/private/dedicated-identity new-plan.json
```

Both actual VK hashes must already match nonzero compiled source pins. The WASM
hash must match the manifest reviewed after the real-WASM tests; a byte hash alone
does not prove source provenance. The plan records exact constructor ScVal XDR
and direct CLI argument arrays. The deploy command fixes the public source and
salt and selects the dedicated signing alias separately; a different signing key
cannot silently produce a different DKG domain. `--optimize=false` preserves the
pinned binary; no identity generation or overwrite option is included. No asset
issuance or deposit is performed. `verifySource` must match the manifest's public
address, and `deriveAddress` must match the intended ID before signing.

Before executing the plan separately, retain the dedicated directory with mode
0700 under an owned protected parent, use umask077, and clear inherited
`STELLAR_*` signing/network/provider-header overrides. Preserve the directory
securely after deployment. A failed or uncertain send requires recovery by its
actual transaction/deployment evidence, not blindly repeating the plan.

After an authorized deployment, save the fetched WASM and the exact `config`
readback (`contract invoke --send no`, public simulation only). Compare them:

```sh
node contracts/private-pool/tools/prepare-deployment.mjs verify-readback new-plan.json CONFIRMED_CONTRACT_ID fetched.wasm config.json
```

Readback validation checks exact bytecode, immutable config, domain derived from
the actual deployed address/network, asset IDs and policy root. It compares saved
evidence with the reviewed plan; it does not authenticate an untrusted RPC or
claim a deployment happened merely because input files match. Live CLI constructor
and readback execution remain untested until the operator's explicit release run.
