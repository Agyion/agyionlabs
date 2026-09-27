# Public V4 lifecycle preparation

The public V4 kernel is deployed but remains inactive in the application.
Two offline components prepare its next testnet verification phase:
an [immutable scenario plan](../scripts/lib/public-lifecycle-plan.mjs) and a
[signing-time envelope validator](../scripts/lib/public-lifecycle-envelope.mjs).
Neither component creates identities, reads secrets, funds accounts, contacts
RPC, signs or submits transactions. They are not a runnable lifecycle executor.

## Fixed scenario plan

The plan binds the preserved deployment receipt, reviewed code hash, exact
contract, Testnet network, native asset and original deployment account.
Recipient, relayer and five credential roles must use separate public keys.
The two Pods require different claim keys. Creating the plan does not create
these keys or demonstrate control of their corresponding private keys.

There are exactly 39 planned non-funding calls, using the existing seller for
14 calls, a future recipient for 14 and a future relayer for 11. Only the two
new transaction actors are eligible for a future one-time Friendbot request.
No deployment, restoration, replacement or implicit cleanup call is included.

| Scenario | Planned result |
| --- | --- |
| Negative, zero and positive Fade prices | Exact settlement with distinct parties |
| Timelocked Pod | Recipient-bound opening after unlock, then replay rejection |
| Trigger execution and timeout | Fixed-beneficiary payment or original-funder refund |
| Unclaimed Fade and missed handoff | Deadline-bound refunds |
| Envoy delegation, revocation and expiry | Claims remain bound to the grant owner |
| Three simultaneous obligations | Each payout reduces shared debt by one principal |
| One-stroop donation | Surplus increases without changing a user's claim |

Each position uses one test XLM. Gross planned deposits total 13 test XLM;
maximum simultaneous outstanding principal is three. Signed fee ceilings are
one test XLM per transaction and 40 in aggregate. These values are limits,
not a fee quote or permission to add a fortieth transaction. The future executor
must enforce remaining funds and cumulative authorization across durable records.

Preflight, intermediate, terminal and final observations are included in the
plan hash. A terminal payment must be followed by its specified replay check,
including the last Trigger payment. Negative simulations need reachable
prerequisites and the precise expected rejection. A timeout, transport error
or unrelated earlier guard cannot count as the intended rejection.

## Signing-time validation

The validator accepts only one exact reviewed invocation. It checks the source,
sequence, arguments, fixed target, fee, time bounds and memo. It derives the
allowed source-account authorization tree from method semantics. Deposits bind
the exact native transfer into the kernel; a positive Fade handoff binds the
claimant's exact payment to the recorded seller. Additional roots, address
credentials, changed amounts, foreign targets and nested calls are rejected.

Explicit restoration operations, simulation restoration preambles and nonempty
archived-entry lists inside resource extensions are rejected. Checking only for
a separate restoration preamble would miss in-operation automatic restoration.

The signed check requires an unchanged transaction body and exactly one valid
source signature over the Testnet transaction hash. Unsigned XDR has no network
field, so unsigned validation alone cannot establish the signing network.
The validator requires no more than 90 seconds remaining at signing time. It
cannot establish when the envelope was first prepared. It is deliberately not
a historic receipt or expired-transaction recovery verifier.

The expected step and handoff facts remain inputs. A future executor must bind
them to the reviewed plan hash, original record IDs and independently verified
on-chain state. These helpers alone do not authenticate RPC state, prove actor
ownership, enforce the aggregate budget or provide durable source coordination.

## Offline verification

Eight plan tests and thirteen grouped envelope tests pass. Their synthetic
fixtures exercise altered authority, omitted observation gates, changed bodies,
foreign signatures, nested authorization and restoration fields. The plan's
missing terminal checks and a method-coercion case each failed before their
corrections. Tests can be rerun with
`node --test scripts/tests/public-lifecycle-*.test.mjs`.

A separate local check read the exact 26,696-byte compiled WASM through the
pinned artifact reader. All twelve kernel methods matched their argument names,
order and types, and arguments encoded by that compiled specification passed
the envelope validator. This was an offline ABI comparison with synthetic
unsigned envelopes, not host execution or live authorization evidence.

The final local `npm test` run passed 1,476 checks with seven default optional
skips. It includes 902 application tests and 182 tooling tests. The 21 new tests
above are part of those tooling totals. No new browser-wallet, live-chain or
website publication result follows from this offline source change.

## Remaining work

The dedicated executor, durable original-hash recovery, coherent custody and
liability snapshots, complete fee/refund metadata reconciliation and explicit
simulation-mode transport checks remain to be implemented and verified. Only
then can the bounded live scenarios run. The initial deployment receipt remains
historical and must not be rewritten as lifecycle evidence.

Application activation also needs the separate public release catalogue and
original-contract recovery across links, credentials and pending receipts.
Current public V3, private and marketplace selections remain unchanged. Offline
checks do not establish live settlement, private-Pod anonymity, independent
trustee custody, external audit completion or absence of every exploit.
