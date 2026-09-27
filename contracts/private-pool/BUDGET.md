# Private pool resource measurements

## Included testnet settlement: 2026-09-27

The deployed development pool `CDSK32ISKXRW6PX3ZMCHLUP4URNQSYNNH2GZU7ZSZJFL4FSEFQM25YHT`
was read back with WASM SHA256
`103f46d4eb97b021f2618e307970ce49993417901789e03760a4af512b7fee6e`.
A dedicated test identity deposited and withdrew 0.1 valueless native XLM.
Real local proofs, exact included transaction envelopes and the complete encrypted
archive were checked. The restored vault recovered its note after the deposit;
after withdrawal the note was spent and there were no unresolved attempts.

| Transaction | Included ledger | Signed fee budget, XLM | Charged fee, XLM | Storage rent, XLM |
| --- | ---: | ---: | ---: | ---: |
| Deposit | 4891177 | 7.3034786 | 6.3517393 | 6.3352205 |
| Withdrawal | 4891253 | 7.2077869 | 6.2683998 | 6.2548024 |

Public transaction hashes:

* Deposit: `17bd11aef2b27e2bb99eb2380fdab7aeb45cf89a1b7192c573747b69478ed5ac`
* Withdrawal: `2755bf7840085653e3de89bb07701d64a23d3eb6a6be4e2e42f1d71b371fc630`

These are network observations, not a price promise. Storage rent dominated this
run. The contract extends retained records to the network's maximum TTL, so CPU
benchmarks alone cannot predict fees. An initial 1 XLM fee cap rejected the
deposit before signing. A separate explicit 10 XLM cap was used for the test.
The application must show the simulated total before wallet signing, enforce
the user's cap and never raise it automatically.

This run used a CLI test signer and a local durable test journal. It does not
establish browser wallet operation, USDC settlement, mobile performance,
independent setup or mainnet economics. The included deposit also exposed a
client compatibility bug between separate SDK module copies; after correction,
the original hash was reconciled without sending the deposit again.

## Local host feasibility: 2026-09-26

Measured in an isolated `/tmp/agyion-poseidon-benchmark` contract with installed
Soroban SDK 28.0.0 / host 28.0.2, native host budget counters and compiled WASM
invocations. No network transaction or wallet signing occurred. Budgets were
unlimited during measurement so overruns are visible rather than hidden.

The digest input was 100 canonical field limbs, preceded by a fixed domain and
length. Each compression used standard circomlib-compatible Poseidon over the
previous accumulator followed by the next block, padded with zeros only in the
last block. Parameter parsing is included; parsed host objects are reused.
Outputs matched an independent Python reference and `poseidon-lite` 0.3.0.

| Compression | Calls | Native CPU | WASM CPU | WASM memory bytes |
|---|---:|---:|---:|---:|
| Poseidon(2), 1 new limb | 102 | 105,050,111 | 107,589,850 | 4,910,567 |
| Poseidon(4), 3 new limbs | 34 | 65,844,042 | 68,387,774 | 3,561,191 |
| Poseidon(8), 7 new limbs | 15 | 69,095,462 | 72,733,140 | 3,375,431 |
| Poseidon(16), 15 new limbs | 7 | 97,080,072 | 103,648,339 | 3,700,831 |

Fewer wide permutations were not cheaper enough: the host performs a dense,
quadratic MDS multiplication. Even the best digest adds about 68M WASM CPU before
proof verification. This supports the decision to make exact ciphertext limbs
public proof inputs instead of an additional on-chain Poseidon digest.

A separate probe used real, valid curve points from the repository's preimage
verifier, repeated IC points for a synthetic MSM, plus four actual pairings. The
pairing result was deliberately false and asserted false; this was not an
accepting fake verifier. It isolates metered cryptographic cost, not correctness
of a private transfer or successful full-contract execution.

| Public inputs | Native CPU | WASM CPU | WASM memory bytes |
|---|---:|---:|---:|
| 24 | 33,640,371 | 34,190,100 | 1,992,350 |
| 140 | 72,474,231 | 73,897,440 | 2,440,011 |
| 157 | 78,169,923 | 79,721,142 | 2,523,705 |

Full private-pool verification, typed ID construction, field validation, storage,
events and token transfers must be measured with the actual circuit proof before
release. A synthetic MSM measurement does not establish the final resource fee.

Read-only testnet `getNetwork`/`getVersionInfo` returned protocol 28 on this date
(RPC 29.0.0-b2b701685c79aee17fe4eb22dbd08a5dfd11594d). The published versions page
still listed the protocol-28 testnet date as TBD, so source documentation alone
was insufficient to establish network compatibility. No deployment occurred.

Primary references:
[Stellar ZK host primitives](https://developers.stellar.org/docs/build/apps/zk),
[software versions](https://developers.stellar.org/docs/networks/software-versions),
[archival semantics](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival).
