# Public V4 lifecycle preparation

The public V4 kernel is deployed but remains inactive in the application.
Offline components prepare its next testnet verification phase: the immutable
scenario plan, exact call binding, signing-time envelope validation, coherent
accounting snapshots, fee reconciliation and a durable orchestration library.
There is no runnable lifecycle CLI or production observation/state policy yet.
The pure validators do no I/O. The journal writes protected local records and
can invoke explicitly supplied preparation, signing and transport adapters;
it supplies no live adapter, private key or funding implementation itself.

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

The narrow envelope validator accepts expected step and handoff facts as inputs.
The [call binder](../scripts/lib/public-lifecycle-call.mjs) now derives these
from the immutable plan. It fixes prices, principals, sources, beneficiaries,
credential roles and expected record IDs, then verifies each credential against
its actual Rust purpose, network, deployment and argument encoding. Preparation
ledgers determine the exact Pod, Trigger and mandate deadlines. A signature for
another recipient, timestamp, Pod or deployment does not authorize this call.

Expected IDs assume initially empty per-type counters and the exact preceding
create sequence. They are not a discovery mechanism. Actual included IDs and
coherent record snapshots must match them; an unexpected external creation must
stop the run. The binder separately supplies business balance changes, excluding
fees, so observed balances cannot define their own expected result.
An unexpected external donation or create can therefore halt this bounded test
run. It must not silently change its initial balance or record expectations.

## Coherent accounting and fees

The [snapshot decoder](../scripts/lib/public-lifecycle-readback.mjs) checks one
RPC ledger response containing reviewed code, contract and asset instances,
both persistent liabilities, native custody, all three dedicated accounts and
every created record. Fixed terms, counters, state, record IDs, current TTLs and
account authority must agree. Native debt must equal all open principals;
custody must equal that debt plus the initial surplus and the single confirmed
one-stroop donation. Missing debt is never treated as zero.

An initially absent native custody entry is accepted only before any funding
history, with no records or donation, and with separate same-ledger evidence
for the exact native `balance(kernel)` read returning zero. Once funded, an
absent entry fails. This is trusted RPC evidence, not a trustless ledger proof.
The structural fixture helper explicitly returns `codeBytesAuthenticated: false`;
only the full snapshot function checking the exact reviewed WASM may advance
the journal. Durable replay uses canonical base64 keys and values, not serialized
SDK object internals.

The [fee decoder](../scripts/lib/public-lifecycle-fees.mjs) covers successful
single-call TransactionMeta V4 transactions. It checks the original signed
envelope, inclusion identity, initial native fee debit, resource charges,
after-all-transactions refund event, ordered account changes and before/after
snapshots. Each actor's final change must equal the independently planned
business change minus that actor's actual fee. Unknown versions, missing refund
evidence, foreign accounts and unexplained drift fail. The 100-stroop inclusion
floor is a policy for this fixed Testnet run, not a claim about every network.

Input is raw RPC JSON with XDR fields encoded as base64. In the preserved actual
RPC responses, `createdAt` is a decimal string even though the installed SDK's
type declaration says number. No independent historical fee pass is claimed
without the corresponding verified account snapshots.

## Durable orchestration boundary

The [journal library](../scripts/lib/public-lifecycle-journal.mjs) permanently
claims a step and its source before asynchronous preparation. It verifies exact
call binding and source sequence, validates the unsigned and signed envelopes,
then persists the original signed bytes and hash before the single send call.
Every signed attempt counts toward the aggregate fee ceiling, including failed
and unresolved outcomes. Inclusion alone is insufficient: required observations,
snapshot checks and fee reconciliation must pass before a successor can start.

Recovery has no signing or submission adapter. It queries the persisted original
hash and may verify an expired envelope at its recorded original validation
time solely to read its outcome. This does not relax fresh signing or submission
time bounds. A crash after persistence but before submission can remain
`NOT_FOUND` indefinitely. A claimed step without signed bytes also remains
consumed. Neither condition clears the claim or authorizes a replacement.

Every cooperating caller must share one protected source-lock directory. The
library stores that directory in its immutable run manifest; it cannot coordinate
callers deliberately selecting different directories. The future CLI must fix
one canonical namespace and bind it to the original deployment context.

Two trusted code policies remain required: one must decode the precise negative
observation and its reachable prerequisites, and one must derive expected state
from original claims and receipts, including remaining funds and minimum reserve.
They are not supplied by this phase and are not replaceable with an RPC boolean
or a user-supplied JSON success flag. Their raw evidence is retained and checked
again during recovery. Historical early-rejection observations must remain
bound to their original records and deadlines, rather than being discarded
because a later successful transaction has a newer preparation ledger.

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

The preceding offline-plan source checkpoint passed 1,476 checks with seven default optional
skips. It includes 902 application tests and 182 tooling tests. The 21 new tests
above are part of those tooling totals. No new browser-wallet, live-chain or
website publication result follows from this offline source change.

Eight additional call-binding tests cover all 39 scheduled calls and the five
credential preimage formats. A separate local check compared 38 kernel calls
with the exact compiled ABI and validated all 39 unsigned envelopes, including
the native donation. A local transport fixture intercepted three SDK requests:
the third argument transmitted explicit `enforce` or `record`, while the default
omitted `authMode`. This establishes serialization behavior only, not a live
contract rejection or correct future runner integration.

The additional snapshot suite passes 88 checks locally, including the exact
compiled WASM and all sixteen record layouts. Its compiled-artifact case is
explicitly skipped when that artifact is absent. The fee suite passes 63 checks.
The journal suite passes nineteen default checks plus one separately enabled
local checkpoint. Filesystem/race units substitute synthetic plan authority and
snapshot/fee doubles while retaining real call, envelope, signature and inclusion
decoders. Their 39-step order case proves orchestration within that unit boundary.
It does not prove 39 contract executions or observation-policy correctness.

The separate journal checkpoint uses the real snapshot and fee decoders and
exact pinned WASM, substituting only an unfunded synthetic seller in the test
plan. A synthetic first Fade creation, a 400-stroop net fee, original ID recovery
after envelope expiry and repeated read-only completion pass. This remains
synthetic ledger evidence. A separate process-death test stops after signed
record persistence and recovers `NOT_FOUND` with zero sends or new signatures;
two live processes also demonstrate source contention before preparation.
A canonical included `txFailed` result also preserves the failed state and fee
ceiling, blocks successors and cannot trigger another send during recovery.

The complete local workspace passes 1,654 checks with eight explicit default
skips, including 902 application and 360 tooling checks. This run includes the
failed-inclusion regression. The final journal file was separately rerun with
nineteen default passes and one skip, then twenty passes with the real-decoder
checkpoint enabled. These scopes overlap and are not additional unique tests.

Review regressions corrected historical-observation bounds, pre-sign sequence
binding, durable parent-directory synchronization and corrupted journal path
confinement. Both the failing cases and final passing cases are retained in the
development evidence. Directory synchronization does not prove every possible
power-loss behavior of every filesystem or hardware platform.

## Remaining work

The dedicated executor, protected identity preparation and one-time funding,
production observation/state policies, bounded RPC adapters and end-to-end
integration of the new libraries remain unfinished. Only after those gates and
their adversarial tests pass can the bounded live scenarios run. The initial
deployment receipt remains historical and must not be rewritten as lifecycle
evidence. No new public V4 lifecycle transaction has been sent by this phase.

Application activation also needs the separate public release catalogue and
original-contract recovery across links, credentials and pending receipts.
Current public V3, private and marketplace selections remain unchanged. Offline
checks do not establish live settlement, private-Pod anonymity, independent
trustee custody, external audit completion or absence of every exploit.
