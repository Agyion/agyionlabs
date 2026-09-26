# Actual proof execution and resource comparison — 2026-09-26

**27/27 tests passed** with actual pinned Groth16 proofs in the final fresh-build
[core check](../../docs/security/2026-09-26/private-v2-evidence/core-check.json).
The resource measurements below retain their original 24-test checkpoint;
three additional compiled-WASM attack/rollback tests use the same bytecode hash.
Both native and compiled
WASM executed all 17 sequential steps. Separate attacks changed amount, recipient,
ciphertext and proof encoding, repeated spends and omitted funder authorization.
Actual SAC transfer failures rolled back the deposit and, separately, an earlier
withdrawal when the later fee transfer failed; the original proofs then succeeded
after the token failure was resolved. No accepting verifier stub was used.

Final test balances: pool **150**, recipient **845**, fee **5**, funder delta
**−1000**. Enumeration contains exactly 16 transition records and one revocation,
with matching stored public inputs, roots and nullifiers. Mock authorization
supplies local test-account authority; these are not wallet-signed live transfers.

The tested optimized WASM is 27,648 bytes, SHA256
`02fe15ab5b79a496a83e08c269d74b2ab0bdf60145d0cd9b47236f10b31b2980`.
Source/keys/build provenance is in `artifacts/privacy-v2/pool-build.json` and
`keys/manifest.json`. Published phase-1 provenance does not make the single-operator
development phase-2 setup an independent ceremony.

## Current testnet comparison

At **2026-09-26 14:38:30 UTC**, the public official RPC reported protocol **28**,
latest ledger **4,881,984**. `getNetwork`, `getVersionInfo` and `getLedgerEntries`
were the only RPC methods used. ConfigSetting key/data XDR, last-modified ledgers,
endpoint and exact requests are preserved in
`artifacts/privacy-v2/testnet-resource-limits.json`. This is public RPC evidence,
not independent consensus verification. The official
[getLedgerEntries reference](https://developers.stellar.org/docs/data/rpc/api-reference/methods/getLedgerEntries)
defines the returned current ledger-entry values and latest-ledger field.

All **86** CPU/memory cost types have exactly equal constant/linear coefficients
between local host 28.0.2 and this testnet snapshot. The comparison preserves every
coefficient in `pool-resource-comparison.json`; it does not assume that protocol
version alone makes cost models equal.

| Resource | Maximum measured in full WASM chain | Actual testnet per-transaction limit | Used |
|---|---:|---:|---:|
| CPU instructions | 89,224,962 (Pod withdrawal) | 400,000,000 | 22.31% |
| Metered memory bytes | 3,531,897 (deposit) | 41,943,040 | 8.42% |
| Disk-read entries | 3 | 200 | 1.50% |
| Disk-read bytes | 300 | 200,000 | 0.15% |
| Written entries | 7 | 200 | 3.50% |
| Written bytes | 21,508 | 132,096 | 16.28% |
| Conservative footprint entries | 18 | 400 | 4.50% |
| Contract event bytes | 912 | 16,384 | 5.57% |

The conservative footprint uses the SDK's disk reads + memory reads + writes sum;
some entries overlap. CPU/memory use whole reset-budget consumption (including
local encoding overhead); the files also preserve the narrower invocation values.
Revocation used 31,940,786 CPU / 2,217,394 memory bytes. The earlier generic-core
79.7M benchmark did not include the pool and is superseded by these full results.

These invocations used live local state. Archived-state restoration can add reads
and fees. The host estimator excludes some ledger-apply/XDR work and complete
transaction-envelope size. The snapshot's envelope maximum is 132,096 bytes;
actual signed envelope size, RPC simulation/inclusion, fee/rent quote and live
deployment are **not measured** here. Current resource headroom is evidence for
the next testnet step, not a guarantee of successful live inclusion.

## Reproduce

Use the committed public proof fixture directory once published; alternatively
set `PRIVATE_POOL_ARTIFACTS` to the generated artifact root. Neither witness files
nor proving keys are needed by host verification tests.

```sh
PRIVATE_POOL_ARTIFACTS=/absolute/path/to/artifacts/privacy-v2 \
PRIVATE_POOL_WASM=/absolute/path/to/artifacts/privacy-v2/private_pool.wasm \
cargo test --manifest-path contracts/private-pool/Cargo.toml --features wasm-tests
```

Raw outputs: `pool-native-costs.json`, `pool-wasm-costs.json`,
`pool-{native,wasm}-host-cost-model.txt`, `testnet-resource-limits.json` and
`pool-resource-comparison.json`, all under ignored `artifacts/privacy-v2/`.
No network mutation or real deposit occurred during this verification.
