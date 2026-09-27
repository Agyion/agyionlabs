# Guarded private pool testnet checkpoint

On 27 September 2026, the private pool with aggregate backing accounting was
uploaded and created at a fresh Stellar testnet address. The [deployment record](../deployments/private-pool-guarded-testnet.json)
contains both included transaction hashes, exact code identity, measured fee
fields, initial readback and the unchanged original application pins.

This pool is not yet the application's default. The original pool remains
available with its existing records and its documented [issuer backing limitation](TOKEN_ISSUER_RISKS.md).
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

## Remaining activation gates

Real new-domain private flows, balance and liability reconciliation, archive
recovery, revocation and scoped threshold disclosure must complete before the
new release becomes the default. Native XLM results do not establish private USDC
settlement. The existing release must remain accessible for recovery, and its
notes, backup scope and pending transaction hashes must keep their original
identity.

The development ceremony is unchanged and one operator still controls all five
trustee shares. Deployment does not establish production cryptography, independent
trustee custody, legal authorization or the absence of every possible exploit.
