# Release tooling and configuration review

Date: 27 September 2026. This covers the exact owned files below. The review
made local verification changes, not a website deployment. Actual contract
transactions and publication results belong to the root task's separate reports.
No independent audit or absence-of-exploits claim is made.

## Fixed verification gaps

### CSP verification accepted unreviewed script origins

The old checker rejected unsafe inline/eval keywords but accepted
`script-src 'self' *`. It also accepted external origins and `script-src-elem`
overrides. Consequently a weakened deployment header could pass the header
check despite permitting remote script loading. This was a defect in the
verification tool; this review did not establish that the live header had been
weakened.

The checker now accepts only same-origin scripts, canonical SHA-256/384/512
hash sources, an exclusive `'none'`, and the separate `'wasm-unsafe-eval'`
permission. Wildcards, arbitrary hosts/schemes, unreviewed nonces and malformed
hashes fail. JavaScript `'unsafe-eval'` and `'unsafe-inline'` remain rejected.
WASM compilation permission is accepted because it does not grant JavaScript
string evaluation or another script origin. **The site's actual CSP was not
changed**, and injected beacon/CSP violations were not exempted from diagnostics.

Before the fix, the new wildcard rejection and WASM permission cases failed.
After the fix all tool tests passed; raw red/green results are retained.

### Production verification assumed the old incompatible contract

The earlier verifier always expected `incompatible` or `unavailable`. It could
not verify the newly pinned V3 deployment as `ready`. The default remains that
old blocked expectation. A ready release must now be selected explicitly, with
both the expected contract address and exact WASM SHA-256. Invalid/incomplete
configuration fails before browser work.

The verifier then requires all of:

1. Public application bytes, including HTML, match the assembled local release
   exactly. The historical narrowly pinned Cloudflare bootstrap normalizer is
   retained only for old evidence and is not accepted by this release verifier.
2. Both expected pins occur together in a fetched, byte-verified application
   JavaScript bundle. This is evidence of bundled configuration, not by itself
   proof that the browser used it.
3. The actual browser observes `main.station-app[data-protocol-readiness="ready"]` when ready was selected;
   unavailable/incompatible are not accepted as substitutes.
4. The browser requests the exact expected kernel instance from the official
   testnet RPC. Its real response is decoded independently: response key,
   embedded contract address, persistent contract-instance type, WASM hash,
   positive latest ledger and plausible modification ledger must match.
5. The browser's actual network response reports the Stellar testnet passphrase.
   Malformed or mismatched identity responses are recorded as failures.

Existing HTTP/status/security-header checks, missing-asset checks, desktop/mobile
workspaces, screenshot capture, disconnected-wallet action check, page errors,
console errors, failed requests and CSP diagnostics remain. A successful ready
check is **not** actual-wallet transaction verification. Contract-instance hash
observation is not the same as downloading and hashing the actual deployed WASM;
that separate check is performed by the deployment helper/testnet smoke.

Invocation after the final reviewed contract and website are published:

```bash
PUBLIC_BASE_URL=https://agyionlabs.dev \
EXPECTED_PROTOCOL_READINESS=ready \
EXPECTED_HAK_CONTRACT_ID=the_verified_contract_id \
EXPECTED_HAK_WASM_HASH=1e6643028d6b397b3a762d4b5312eaf20f2744407686c78122d27c5a4dd8d378 \
RELEASE_OUTPUT=artifacts/verification/the_release/live \
node scripts/verify-production-release.mjs
```

Replace the explicit contract placeholder; invalid placeholders are rejected.
This report does not claim that the updated browser verifier was executed live.

The first parent-run browser check exposed a selector defect in this verifier:
`ProtocolStatus` renders no node when ready, so its former banner attribute could
never provide positive ready evidence. Both production and wallet-modal verifiers
now inspect the stable application root attribute above. The platform reviewer
added the attribute to the real readiness hook and tested all four states; that
separate test evidence is not represented as execution by this reviewer. These
selector changes passed syntax checks. Live browser success remains a separate
required result, and network/CSP failures remain failures.

## Final header and preview reconciliation

The platform reviewer added HTML `no-transform` with immediate revalidation on
all explicit document aliases, while preserving immutable hashed assets and
all existing CSP/security headers. The verifier now requires that exact cache
policy and byte-identical HTML; it no longer accepts even the previously pinned
Cloudflare JSD injection. Beacon or other CSP failures remain failures.

Peer inspection identified that the local preview previously overwrote matching
headers, unlike Cloudflare's comma-join behavior. The platform reviewer extracted
and tested matching-field accumulation. This reviewer read the final builder,
preview helper, regressions, assembler and verifier in full and refreshed their
hashes below. These source checks do not establish that Cloudflare honored
`no-transform`; the root's actual public response and browser evidence decides
that outcome. The browser settling helper uses a Node-side timeout, and a paused
page or unfinished transition remains a failed observation.

## Testnet smoke peer review

The testnet harness was read without executing it by this reviewer. Its default
plan does not issue RPC calls. Execution is fixed to official Stellar testnet,
checks the reviewed WASM bytes and version before funding, uses new random
identities funded only through Friendbot and writes test-only keys to a new
restricted artifact directory. It records each signed hash before sending and
does not automatically retry an unresolved transfer.

The initial negative-case checker accepted any Contract/Crypto error, allowing
an unrelated state rejection to masquerade as a successful revocation check.
The root implementer corrected this after peer feedback: each expected contract
error has its exact code, the recipient substitution uses the specific crypto
error, and revocation is tested on an otherwise open listing. The harness now
requires an identical included envelope, successful transaction result, valid
ledger and fee bound, and positive u64 creation IDs. Installed SDK result/XDR
shapes were checked against these uses. No SDK auth bypass was recommended.

The first actual parent-run smoke exposed the positive Fade root-authorization
compatibility defect despite 63 prior local tests. It was reproduced against old
native/WASM, fixed and verified with 65 final tests, as recorded in
[HAK_FULL_REVIEW.md](HAK_FULL_REVIEW.md). The first smoke is not a passing check.
Subsequent actual deployment/smoke status must be read from its own evidence.

## Verification

Evidence root: `artifacts/security/2026-09-27-compatibility/hak/`.

- `tooling-csp-before.log`: expected 2 failures and 3 passing existing cases.
- `tooling-tests.log`: **13 passed, zero failures and zero skipped** after the
  final browser-response helper was added.
- Syntax checks passed for `verify-production-release.mjs` and
  `verify-testnet-kernel.mjs`.
- `tooling-tests-final.log`: **26 passed, zero failures and zero skipped** after
  final HTML/header, preview joining and browser settling changes were reviewed.
- `tooling-source-review.json`: exact line ranges and source hashes below.

## Exact source coverage

Every line in the following file snapshots was read. Deployment-script
regression tests and actual execution were owned by the root reviewer; this
review does not convert their results into independent findings. Other visual
QA scripts, application runtime, private cryptography and transitive package
source are outside this tooling review. Lockfile/build use is not dependency
source audit.

| File | Inclusive lines | SHA-256 |
| --- | --- | --- |
| `scripts/verify-production-release.mjs` | 1–118 | `168a874d0c3ac85968a3966c9b7ef54b3db8884561cde4914e6b9cac14c18808` |
| `scripts/release-expectations.mjs` | 1–31 | `db219ab94861f9e744a0f32eebdeec74fc41bc9da98564c6cf7f50476e7b3fb9` |
| `scripts/release-kernel-readback.mjs` | 1–28 | `61092ac116ca61eab6f4b55793636aff4b5c027f0c24eacf585e54d9ae624748` |
| `scripts/release-integrity.mjs` | 1–65 | `3fb0d97dd00978fc59edc4ef359c1575f43f531beb01d163407e9191189eb690` |
| `scripts/app-asset-manifest.mjs` | 1–27 | `2cad5bb5be6ecea94c234760426a2a6fd77f812b6b2d15b4ba06d5c7643746e2` |
| `scripts/assemble-site.mjs` | 1–32 | `d9b10bfb2e06dc11319027ab24c91a95778178f2a4cba93cc3ac946afd04946a` |
| `scripts/build_site.sh` | 1–35 | `0ad2c3420bdc18496331d2a6e4aa50d68ea8d8b0e78d397e3694c2a4176a0896` |
| `scripts/deploy_testnet.sh` | 1–141 | `26d36c8d8b4724a495210ec5f4c9141225e55f83e2bdee6284fa9c0c17eb0615` |
| `scripts/verify-testnet-kernel.mjs` | 1–183 | `3d53f1418c62edf7c3f2f0d9061eb96b182cade8106f359e9867b6f3f343a6de` |
| `scripts/preview-site.mjs` | 1–26 | `dd9815e061bc30d787e870d740ec72f8d1d3660b25f2d03f1ccb08352502989d` |
| `scripts/setup.sh` | 1–80 | `f5f945742cf1c88ca1c465efceb4beaa51f66ad8c3783b6efac36b89d10d340d` |
| `scripts/tests/release-expectations.test.mjs` | 1–46 | `6b9aa9ffe07220ac4871989c8ded190cd5cfc34beb8f4667f6066e33f1b8fd6e` |
| `scripts/tests/release-kernel-readback.test.mjs` | 1–36 | `a5497e2cddf2c9d8d1443377b32a0e962780005e89b94b0e6269d3263888d375` |
| `scripts/tests/release-integrity.test.mjs` | 1–83 | `97379da7423f55198861028c746613727e45eeac5803ed706c24c8c09230231a` |
| `scripts/tests/app-asset-manifest.test.mjs` | 1–33 | `8e01f3e4510caf825b32851e0165543f29f5681b54fbb53df2d9291b8cf7d49c` |
| `app/wrangler.toml` | 1–16 | `0376b600940c6a28632ac10d59ac1f2ea3d40c49a30e91ed4aaf3ddbe26e48c8` |
| `app/next.config.mjs` | 1–10 | `bed956265316a769ff1d8fda744a05a56ab1a26e3cb6b9e1500ee5f9ed4c0c2d` |
| `app/tsconfig.json` | 1–27 | `8986eda590a6c98b20db12c16a8a0ed4dd32fb177276f26ce642471e154edd67` |
| `landing/vite.config.ts` | 1–17 | `88818286e3f34ea0e9706d5fc056569e73f4512c256efe8b8fbc7f893ca51a6b` |
| `landing/tsconfig.json` | 1–7 | `770b4140bbb581e2dfd9ea9946ffc9c75a1d86ba7d2db5f77c83e37cbdf9d808` |
| `package.json` | 1–17 | `1521dad5756211202287bb4e3bd51daf80e99bd4c3d226a1c78e4899390c25e9` |
| `scripts/verify-wallet-modal.mjs` | 1–56 | `a1898717c45b37c4f108379a95b2024349479cfc979726c43a1188441921ad8d` |
| `scripts/site-headers.mjs` | 1–37 | `11c9873aaf2558b057bc00dd1576e76f70f083b51438a17c2e7ef6050401eb77` |
| `scripts/tests/site-headers.test.mjs` | 1–65 | `b4796670f4e52ada4af06ef7aad092405dbee66c3b90ac439a9705ffe0ee54e3` |
| `scripts/static-preview-headers.mjs` | 1–20 | `59fea80acf35002daac207461ebc80f9ee35b58f241d9db3afddaed6a4c57a18` |
| `scripts/tests/static-preview-headers.test.mjs` | 1–47 | `2b0efb727e5e56ecbd8ea0d2a699e5899ec249913c0c2dad41ce2577cc6b528e` |
| `scripts/lib/browser-settle.mjs` | 1–39 | `b904c4b9b9757160e56021920de23b1362f84ecfeaceb237fd6be0e4d52a3d9b` |

The remaining build/configuration paths preserve explicit static routes, missing
asset 404 responses, a bounded same-origin immutable asset manifest and local
preview binding to 127.0.0.1. Site assembly only copies fixed generated paths.
These conclusions assume a trusted local checkout/build toolchain; the preview
server is not a public upload service or a filesystem security boundary against
someone able to mutate that checkout. The setup helper only checks tools. No
broader redesign, application CSP relaxation or dependency update was made.
