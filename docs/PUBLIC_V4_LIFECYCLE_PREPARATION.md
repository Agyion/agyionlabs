# Public V4 lifecycle preparation

The public V4 kernel is deployed but remains inactive in the application.
Offline components prepare its next testnet verification phase: the immutable
scenario plan, exact call binding, signing-time envelope validation, coherent
accounting snapshots, fee reconciliation, concrete state and observation policies,
a bounded raw RPC transport, strict local simulation assembly and a durable
orchestration library with an offline verified replay reader.
There is no runnable lifecycle CLI, identity preparation or funding adapter yet.
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

The [assembly adapter](../scripts/lib/public-lifecycle-assembly.mjs) validates
the complete raw simulation response before using the SDK's local assembler.
It accepts a fresh unsigned request with no resource extension or authorization
entries, one exact result and canonical XDR. The encoded resource fee must equal
the quoted minimum. Parsed SDK objects, error or restoration fields, extra
authorization roots and ambiguous response fields are rejected. The only allowed
changes are the verified resource data, complete authorization vector and exact
fee addition. Every assembled byte must match that result, followed by the
existing envelope validation. Assembly does not sign, send, check current source
availability or replace the journal's final checks.

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

Acquisition can request the ten fixed base entries and all sixteen possible
record keys before their values or creation ledgers are known. This key list is
derived only from the validated plan. It grants no state authority: the exact
snapshot decoder still rejects returned records that the verified history does
not yet permit. Missing entries do not acquire invented values.

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

The [concrete policy adapter](../scripts/lib/public-lifecycle-policies.mjs) now
supplies both required policies. It has no validator override or serialized
success-flag input. It reconstructs the initial state from raw evidence and
derives the current state from the journal's freshly verified prefix. The prefix
contains decoded accounts, records, fees and observation identities, without
copying every prior raw receipt into subsequent observations.

One matching state/observation callback pair may reuse its freshly derived,
immutable state. The complete raw context must match and the value is consumed
once. A changed context or later replay derives again; no persisted success
flag or cross-replay cache bypasses raw verification.

State derivation and exact snapshot checks run first. After inclusion, full fee
reconciliation also runs before the observation policy. A failed state or fee
check cannot produce completion or release the source reservation. Recovery
repeats these checks against raw evidence and compares the result to stored
acknowledgments; those acknowledgments alone confer no authority.

`readVerifiedPublicLifecycleContext` performs the same raw replay using the
concrete policies, without a policy override, write, directory synchronization,
network request or source release. An empty journal has no initial baseline.
An unfinished claim must pass its original before evidence before that baseline
can be returned; it still blocks every successor. A completed partial prefix is
`ready`; `complete` requires all 39 steps. Returned data is frozen and historical.
Neither status establishes current chain state or an available source lock.

## State, observations and transport

The [state reducer](../scripts/lib/public-lifecycle-state.mjs) derives all 39
scheduled transitions, original IDs, record terms, source sequences and actor
balances. It requires an initially empty kernel and continuity with the previous
decoded account bytes. Current source fees are established by the following
metadata decoder. An in-process provenance check prevents deserialized state
objects from being used as verified reducer outputs.

Minimum reserve comes from the actual same-ledger header. Latest-ledger headers
and historical header wrappers are decoded separately and checked against their
ledger number and header hash. For the three pristine dedicated accounts, the
required minimum is twice that header's base reserve. Remaining authorized fee
ceilings and gross business outflows must be funded without assuming future
payouts or treating refunds as new fee authorization.

The [observation gate](../scripts/lib/public-lifecycle-observations.mjs) has a
finite registry of prerequisite, authorization, credential-domain, timing and
terminal replay cases. It verifies exact calls and explicit record/enforce modes;
wrong-source cases also need a valid-source control. Crypto cases check both the
intended signature preimage and its deliberate mismatch. A transport failure,
restoration request or unrelated guard error cannot count as the expected result.

Each simulation needs coherent unchanged snapshots surrounding its ledger, with
at most two ledgers of drift. Historical early-window cases remain tied to their
original record state and deadline after the execution ledger advances. Shared
snapshot references are local content hashes; unresolved or unused references
fail. The final gate also requires the freshly replayed observation history,
39 original fee/inclusion summaries, all terminal records, zero debts, the single
donation and unchanged original public/private/market code and release bytes.

The error parser deliberately accepts a narrow terminal host-error grammar and
consistent decoded diagnostic errors. One retained actual protocol-28 Testnet
reply from an unsigned zero-amount Fade simulation at ledger 4,901,961 parses
as `Contract#3`, including its two diagnostic XDR events. The exact case verifier
also accepts that original response. The bounded acquisition made three read or
simulation requests and no signature, submission or funding call. Other error
families still need live acquisition when their scheduled prerequisites become
reachable, before the corresponding step can pass its observation gate.
Synthetic coverage does not establish their remote wire behavior. A matching
substring in a diagnostic trace is not sufficient.

The [RPC transport](../scripts/lib/public-lifecycle-rpc.mjs) fixes the Testnet
origin and seven allowed methods, rejects unknown parameters, never follows a
redirect and makes no implicit retry. Its 15-second deadline covers headers and
body; the two-MiB cap applies to decoded response bytes. Caller cancellation is
composed with that deadline, and rejected or late responses are cancelled.
Duplicate JSON keys, malformed UTF-8 and ambiguous result/error envelopes fail.
Returned data stays raw: a contract simulation error inside `result` is distinct
from a JSON-RPC or transport error. A failed send request still has an unknown
inclusion outcome and must use the journal's original-hash recovery.

The transport validates envelope shape, not signing authority or chain consensus.
The immutable call/envelope checks and journal provide the former. The evidence
remains dependent on the selected RPC source; a header hash is not an independently
verified consensus proof.

## Actual RPC compatibility checks

A separate three request probe obtained the network identity, current header and
historical header for ledger 4,902,649. Both canonical XDR forms matched the same
block hash and base reserve of 5,000,000 stroops. This checks the actual header
formats and bounded transport without establishing independent consensus.

Another three request probe simulated the first Fade creation in explicit
`record` mode at ledger 4,902,687. It returned ID 1, one source authorization
tree and a resource fee of 714,138 stroops. The unchanged response exposed an
installed SDK declaration mismatch: state change types are strings, not numbers.
The adapter initially refused it. The correction follows the actual response
and [documented RPC schema](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/simulateTransaction),
accepting only `created`, `updated` and `deleted` with consistent before and
after presence. `deleted` is documented and tested synthetically; it was not
observed in this capture. Offline assembly of the captured response then
preserved its exact authorization and resource data, with a total authorized
fee of 714,238 stroops including the fixed 100 stroop inclusion bid.

These probes made six read or unsigned simulation requests in total, with no
funding, transaction signature or submission. Response JSON is retained as the
raw transport's reserialized values; canonical XDR bytes remain unchanged.
The positive capture uses public fixture credential addresses and its recorded
time for offline replay. It does not establish valid current time bounds,
enforced credential authorization, live settlement or actual charged fees.

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

At the preceding journal foundation checkpoint, the snapshot suite passed 88 checks locally, including the exact
compiled WASM and all sixteen record layouts. Its compiled-artifact case is
explicitly skipped when that artifact is absent. The fee suite passes 63 checks.
The journal suite then passed nineteen default checks plus one separately enabled
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

At the preceding journal foundation checkpoint, the complete local workspace
passed 1,654 checks with eight explicit default
skips, including 902 application and 360 tooling checks. This run includes the
failed-inclusion regression. The final journal file was separately rerun with
nineteen default passes and one skip, then twenty passes with the real-decoder
checkpoint enabled. These scopes overlap and are not additional unique tests.

Review regressions corrected historical-observation bounds, pre-sign sequence
binding, durable parent-directory synchronization and corrupted journal path
confinement. Both the failing cases and final passing cases are retained in the
development evidence. Directory synchronization does not prove every possible
power-loss behavior of every filesystem or hardware platform.

The preceding policy integration passed 41 default state tests, 65 observation
tests, 56 transport tests and nine adapter tests. Three state/observation checks
requiring local artifacts are explicitly skipped by default; the separately
enabled exact-WASM suites passed 42 and 67 respectively. The final journal suite
passed all 23 checks with its real-decoder checkpoint enabled. These scopes
overlap; they are not additive unique test counts.

The full synthetic journal integration passed both modes: 38 prefinal steps
with only executable-byte authentication doubled, and all 39 steps using the
actual pinned local WASM bytes and four preserved deployment pins. Both modes
use real state, observation, signature, fee and journal gates with deterministic
unfunded identities and constructed ledger responses. The fixed seller is
substituted only in the isolated test process. No WASM contract behavior or
public-network acceptance is inferred from these synthetic responses.

Each synthetic send loses its acknowledgment; recovery uses the original hash
without another signature or send. Completed replay needs no network call.
Changing retained raw XDR while leaving serialized success fields untouched
is rejected by the raw state decoder. All 39 synthetic fee receipts reconcile
to 15,600 stroops total, which is test data rather than a live fee estimate.
The largest policy input was 1,241,524 bytes, below its fixed two-MiB limit.

That policy checkpoint's complete local workspace passed 1,829 checks with twelve explicit
default skips, including 902 application and 535 tooling checks. Its earlier
run failed at the vault UI test's one-second initial creation wait while real
key generation was still pending. The unchanged focused case passed; the test
now uses the same bounded thirty-second wait as its encryption checks. All
seven vault UI tests and the final full workspace passed with real cryptography
and every original assertion retained. The failed run remains preserved.

The current runner seams passed 68 assembly checks, 92 snapshot/acquisition
checks and four read-only replay checks with the local artifact case enabled.
The assembly tests include the unchanged real positive response above, its
expired historical envelope, malformed raw responses and all 39 synthetic
scheduled calls. Read-only replay rejects altered raw evidence and blocks
successors for every unfinished claim state, without writing or releasing locks.

The complete current local workspace passed 1,904 checks with thirteen explicit
default skips, including 902 application and 610 tooling checks. The separate
integration run also passed both the 38-step structural mode and the full
39-step pinned-byte mode after the new replay assertions were added. These
scopes overlap and must not be added together as unique test counts. Default
skips are optional test cases selected by environment or local artifact
availability; they do not disable any application or contract security check.
The separate enabled run does not turn synthetic ledger responses into live
contract execution evidence. A bounded independent peer review found no
additional actionable defect in these changes; it was not an external audit.

## Remaining work

The dedicated executor, protected identity preparation and one-time funding,
raw evidence acquisition and live integration remain unfinished. The policy
modules, bounded transport and their full synthetic journal integration are
verified within the scopes above. The remaining live adapters still require
their own adversarial tests before the bounded live scenarios run. The initial
deployment receipt remains historical and must not be rewritten as lifecycle
evidence. No new public V4 lifecycle transaction has been sent by this phase.

Application activation also needs the separate public release catalogue and
original-contract recovery across links, credentials and pending receipts.
Current public V3, private and marketplace selections remain unchanged. Offline
checks do not establish live settlement, private-Pod anonymity, independent
trustee custody, external audit completion or absence of every exploit.
