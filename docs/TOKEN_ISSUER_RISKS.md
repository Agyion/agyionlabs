# Token issuer controls and shared backing

Review date: 27 September 2026.

An authorized asset issuer can freeze balances or, where permitted by the asset's
recorded policy, claw tokens back. Agyion cannot restore tokens removed by that
authority. The avoidable risk is accepting another deposit or paying an early
claim while the remaining shared balance cannot cover all outstanding claims.

## Active testnet contracts

The original public kernel and original private pool have no aggregate liability guard. The current private application default uses the guarded deployment described below.
Local tests using their exact deployed WASM reproduced the following behavior:

| Deployment | Reproduced result with a synthetic clawback enabled SAC |
| --- | --- |
| Public kernel | Two 100 unit obligations lose 50 units of backing. A third 100 unit deposit is accepted. Two claims complete, leaving the third claim underfunded. |
| Private pool | A real proof deposits 1000 units, then the issuer removes 500. An early withdrawal and fee totaling 400 succeed. A later 200 unit withdrawal fails. |
| Fade marketplace | With 200 units owed and 150 remaining, settlement and new funding both fail. Records and reservations remain intact. A partial replacement is insufficient. |

These tests deliberately granted issuer authority over local synthetic assets.
They did not control Circle, modify a live token or demonstrate an outsider
authorization bypass. Failed private withdrawal preserved the nullifier, root,
record archive and balances. Passing a characterization test means the described
undesired behavior was reproduced; it does not mean the issue is fixed.

The exact original artifacts were fetched through official testnet RPC and checked
against their deployed instance and expected hash before local execution:

* Public kernel: `1e6643028d6b397b3a762d4b5312eaf20f2744407686c78122d27c5a4dd8d378`.
* Private pool: `103f46d4eb97b021f2618e307970ce49993417901789e03760a4af512b7fee6e`.
* Marketplace: `b1947f2ac6bfa3f42535ed571b956c9fd1ab425b1441adca99d2c8c919ed1c6c`.

The original public kernel and private pool are immutable. A website update cannot add
this guard to those existing contracts or move their positions to a new one.
Existing authorizations, records, notes and recovery remain attached to their
original deployment.

## Observed Circle testnet policy

At RPC ledger 4894136, the Circle testnet issuer had authorization revocation
enabled and clawback disabled. The marketplace's actual USDC balance entry had
amount zero, `authorized=true` and `clawback=false`. No live USDC balance entry
was returned for the active public kernel or private pool. A missing entry is
not proof of historical balances, restored state or aggregate solvency.

For a contract address, clawback eligibility is recorded when the SAC balance
entry is created. Current issuer flags alone do not establish every existing
balance's eligibility. Freezing and clawback are distinct capabilities. Native
XLM has no issuer clawback authority. See the [official SAC specification](https://developers.stellar.org/docs/tokens/stellar-asset-contract)
and the [public testnet issuer record](https://horizon-testnet.stellar.org/accounts/GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5).
These observations are dated and do not guarantee future issuer policy.

## New source candidates

The current source implements these guards for fresh immutable deployments:

| Candidate | Locally tested WASM SHA-256 | Bytes | Named native and WASM tests |
| --- | --- | ---: | ---: |
| Public kernel V4 | `d101e0fea1852cf057049cc08695b9e26a8b3c6a82db58d4c2706db03a22b186` | 26,696 | 75 |
| Private pool with backing accounting | `4ead5defa386974742071212701f3bcb327fd0a1bc6bf14df2f97f08b11b5018` | 34,248 | 44 |

These are locally built, unoptimized artifacts. The private candidate now has a
[separate testnet deployment](PRIVATE_POOL_GUARDED_TESTNET.md) with verified initial
state. It is now the application default after separate actual XLM and USDC
lifecycles, scoped disclosure and compatible browser recovery checks. The
original private pool remains available for recovery; its chain permissions are
unchanged. The public V4 candidate remains undeployed.
The public constructor fixes one to eight supported SACs. Both candidates check
SAC executable identity through the host, initialize liabilities at construction,
check existing backing before accepting new money or paying obligations, and
verify exact custody transfer deltas. Missing accounting state fails closed.
An unsolicited donation can repair backing but cannot create another claim.
The guard cannot undo issuer action or promise that a frozen asset is payable.

The private liability equation is existing liability plus public deposit, minus
public withdrawal and fee. Private transitions with no bridge or fee retain
their hidden asset and do not inspect unrelated balances. They conserve the
liability and remain possible during a deficit; a later payout still checks
backing. The circuit, its 157 public inputs and verifier keys are unchanged.

Native and actual WASM regressions cover cross instrument and cross asset
isolation, partial repairs, rejected new funding, overflow, missing counters,
ordinary self payment semantics, issuer mint/burn semantics and atomic failures.
Private tests use the existing real proofs. Separate old byte tests still
reproduce the active contracts' earlier behavior. Local storage deletion and TTL
renewal tests are not live archival restoration tests. Merely advancing the local
SDK ledger did not model actual archival; that failed attempt was preserved and
was not counted as a passing restoration check.

All 17 private proof fixture steps also passed with an enforced host limit of
100 million instructions and 40 MiB memory per transition. The maximum measured
WASM invocation used 90,034,238 instructions and 3,042,733 memory bytes. The
constructor, transaction envelope and ledger application overhead are outside
that bounded test. Testnet ledger 4894337 reported a 400 million instruction and
40 MiB transaction memory limit. A local resource result is not a new live fee
quote or deployment simulation; earlier private transaction fees cannot be
reused as evidence for the candidate.

## Deployment compatibility still required

A subsequent read-only private-pool snapshot, bracketed by ledgers 4894429 and
4894431, read all 16 accepted records and one revocation. Independently rebuilt
append and revocation roots matched the unchanged checkpoint. Public XLM
deposits and withdrawals each totaled 0.5 XLM, with zero fees, giving zero
remaining aggregate liability. The actual native SAC balance entry was present
with amount zero. USDC public flows were zero, but its balance entry was absent
or archived, so its balance and eligibility were not inferred to be zero.
This dated RPC observation used no signing, decryption or transaction submission.
It does not establish future solvency, user backup availability or live archival
restoration.

A client history scan alone cannot enforce this invariant. Other clients can
call a contract directly, and an issuer can act after a wallet's last check.
Releasing the new guard requires its own verified code hash, asset configuration,
deployment tests and compatible access to old positions. The active deployment
must not be relabeled as fixed merely because new source passes local tests.
The legacy V3 deployment helper now refuses all but its two exact reviewed V3
artifacts before creating or funding an identity or submitting a deployment.
Fourteen local control flow tests cover that boundary. It does not silently
deploy V4 and emit old client configuration.
