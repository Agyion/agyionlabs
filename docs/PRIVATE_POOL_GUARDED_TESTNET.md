# Guarded private pool testnet checkpoint

On 27 September 2026, the private pool with aggregate backing accounting was
uploaded and created at a fresh Stellar testnet address. The [deployment record](../deployments/private-pool-guarded-testnet.json)
contains deployment and lifecycle transaction hashes, exact code identity, measured fee
fields, initial readback and the unchanged original application pins.

This pool is the application's current private testnet default. The original
pool remains available for recovery with its existing records and documented [issuer backing limitation](TOKEN_ISSUER_RISKS.md).
No existing note was moved or rebound to the new pool.

## Executed deployment

The reviewed WASM has SHA-256
`4ead5defa386974742071212701f3bcb327fd0a1bc6bf14df2f97f08b11b5018`.
The new address is
`CAI6HUPV6VLXRKJKSCANRM4YP7W6ZNLBUZFK4GEUG5O3OB4X43RBE2ZB`.
Its domain, new development committee, verifying keys and constructor are bound
to the reviewed source account and salt. One Friendbot request funded only the
new dedicated account. Upload and construction each used one signed transaction.
Both initially returned pending. Recovery queried the original hashes without
another signature or submission.

At ledger 4896806, one RPC snapshot matched the complete code, pool configuration,
verifying keys, empty note and revocation roots, canonical XLM and Circle testnet
USDC executables, and both initialized persistent liability counters. Each
counter was explicitly present with value zero and a valid lifetime. Missing or
expired state is an error, never an inferred zero.

The upload limit is 20 test XLM; the constructor limit is 250 test XLM. Their
combined signed maximum cannot exceed 270 test XLM. The recorded transaction
result fee fields were 70,201,339 and 1,857,937,774 stroops respectively. These are
transaction result fields, not a separate claim about final account deductions
after every refundable resource fee.

## Operator safeguards

The [deployment tool](../scripts/deploy-private-testnet.mjs) defaults to an offline
plan. Explicit actions require the absolute private run directory and a reviewed
manifest hash supplied independently of its contents. It revalidates the full
offline plan, committee transcript, verifier pins, canonical assets and exact
WASM before allowing a signature. Inherited Stellar and Soroban overrides are
cleared; the network and signing identity are explicit.

Each phase is exclusively claimed and synchronized to disk before its first
external call. Signed bytes and their hash are synchronized before submission.
A failed or uncertain phase retains its claim. Recovery cannot simulate, sign or
resend a transaction. A retained phase may therefore require manual investigation
even when it failed before submission. This deliberately favors preventing a
duplicate over automatically finishing a deployment.

The local tooling suite passed 97 tests. New cases cover concurrent processes,
forced process termination, disk synchronization failure, a file growing after
its size check, altered transaction signatures, wrong network or constructor,
fee caps, uncertain submission, exact inclusion evidence and missing or corrupted
readback. A growth regression failed before the bounded descriptor read was
added. Synthetic tests establish those controls, not an independent audit.

## Executed private lifecycles

The actual deployed pool completed 15 XLM transactions with 122 checks
and 15 Circle testnet USDC transactions with 124 checks. Both runs
used the real planner, pinned Groth16 prover, client, included contract calls and
accepted archive. Four distinct private roles restored their encrypted saved
files and exchanged authenticated scoped credentials. All roles used one
dedicated public CLI fee payer; this does not establish network unlinkability or
a payment approved through a browser wallet extension.

Each run covered deposit, Pod creation and recipient opening, Trigger settlement
and expiry refund, Envoy grant, bounded claim, revocation and owner reclaim,
consolidation and both final withdrawals. Negative checks rejected the wrong
owner, premature claims and refunds, altered attestations, spent notes,
unauthorized revocation, an excessive claim and a claim after revocation.
Every new-domain transition was rejected against the old release before signing.
Repeating every completed intent returned its original confirmed result with no
additional signature or submission. Each accepted operation reconciled the
actual SAC balance with the new persistent liability counter.

Both counters and pool balances ended at zero. The USDC source received its
original one test USDC back. The original pool checkpoint stayed unchanged.
The new pool ended with 28 transition records and two revocations. Transaction
hashes, inclusion ledgers, final roots and named checks are in the deployment
record. These are dated observations through the pinned testnet RPC, not future
balance guarantees.

USDC setup used exactly two included transactions: a dedicated trustline and
acquisition of one canonical Circle testnet USDC. The XLM acquisition maximum was
1.0102815 test XLM, below the separate two XLM hard limit. The aggregate signed
fee maximum across deployment, setup and both lifecycles was
4236560636 stroops, below the 500 test XLM cap. This is the sum
of signed upper bounds, not a claim about final net fees after refunds. No phase
or uncertain transaction was automatically resubmitted.

## Scoped disclosure

Thirteen checks exercised an actual accepted Pod record. Three of five
local development trustee shares opened only the approved asset field. Two
shares, duplicate shares, insufficient decision signatures, an expanded scope,
expired authorization and repeated requests were rejected. Restarting the
operator did not clear its durable replay protection. The parties and terms
fields stayed outside this authorization.

The first storage attempt was correctly rejected because an ancestor directory
was writable by a group. A separate run used a protected directory under the
operator's private home. The protection was preserved; both reports and durable
replay records remain retained. Decision signatures simulated an authorization
workflow. They were not a real court order or a legal compliance determination.

## Application and remaining boundaries

The published browser application contains both exact compiled profiles. New funding
selects the guarded pool; the original profile permits recovery only. Its
manifest, committee, notes, backup scope and pending transaction hashes retain
their original identity. Nine local and nine direct live browser checks restored real encrypted
fixture files, rejected a forged cross-pool scope, locked old capabilities on
switch and required explicit file reselection. They used no connected wallet or
chain transaction. Publication status is recorded separately in the deployment
record and source manifest.

Accepted record recovery was exercised on both assets. Live restoration after
network archival remains untested; local TTL and missing-state tests are not a
substitute for that scenario. The development proving ceremony is unchanged and
one operator controls all five trustee shares. Independent security and
cryptographic review, production setup and independent trustee custody remain
outstanding. These results cannot establish the absence of every possible exploit.

The published app is Cloudflare version `bcfa6538-0fac-449b-a0da-46c74c342770`, built from
`598ab2f93134af88501967b7379b79434fef0315`. All 103 public files matched the reviewed build.
Direct live checks passed 34 HTTP and 14 UI assertions with no captured page,
console, request or CSP errors. The same source commit passed both hosted jobs.
The current UI recovery policy does not alter the original contract: older
clients and direct calls can still submit to that immutable pool.

A separate browser test generated and verified a fresh new-domain Groth16 proof
in 78,919 ms including preparation. Actual simulation quoted a maximum fee of
7.0002459 test XLM. The one XLM limit blocked before wallet signing; an explicitly
revised ten XLM limit still required a separate fee confirmation. A scripted
wallet rejected the request and nothing was signed or submitted. Six checks
passed using real testnet responses through a bounded HTTP test adapter. The
initial direct browser attempt failed with RPC network-change errors and kept
operations disabled. An intermediate test-selector failure was also retained.
This proof run is neither a passing direct-network test nor a real extension
approval. The separate live page and vault tests above used direct networking.

A later [real Freighter lifecycle](FREIGHTER_TESTNET_VERIFICATION.md#guarded-private-pool-with-the-real-extension)
added two included private transactions on that published website: a 0.01 test
XLM deposit and withdrawal. Eight checks covered actual encrypted backup
recovery, wallet cancellation, explicit approval and a page reload with original
pending-hash recovery. Both final asset balances and liabilities remained zero;
the pool then had 30 records, two revocations and next index 35. The original
pool was unchanged. Aggregate signed fee maxima including these two operations
were 4376725720 stroops, below the same 500 test XLM cap. The
[separate receipt](../deployments/private-pool-freighter-testnet.json) preserves
this later checkpoint without rewriting the earlier CLI lifecycle results.
