# Public transaction preparation and recovery

Public-kernel writes now reserve the wallet account and network before checking
deployment readiness, reading the target record or preparing the SDK transaction.
The reservation remains held through wallet signing and transaction submission.
A second updated tab using the same source stops before preparation, including
when it targets a different action or public contract. Different accounts and
networks remain independent.

Previously, the lock began after SDK preparation and identified an individual
contract, action and record. The two-tab regression reproduced both clients
starting preparation for one source. This demonstrated a coordination defect;
it was not evidence that an unauthorized payment had succeeded on chain.

## Preserved transaction identity

Every preparation captures its original source account. The client checks that
source again after asynchronous reads, before signing and at transport. A wallet
that changes accounts without emitting the usual session event cannot submit a
transaction under the earlier account's recovery record. The actual transaction
source and network must match the captured scope.

Pending and unknown public transaction outcomes on the same source block new
preparation across public contracts and actions. The original hash remains in
durable storage. A confirmed creation whose record ID has not been recovered
continues to block that creation intent, while unrelated transactions are not
treated as having an uncertain sequence solely because its ID is missing.

The existing pre-send persistence, signed-envelope identity checks and terminal
evidence requirements remain. A cancellation before transport creates no phantom
pending attempt. An ambiguous result after transport retains the original hash;
there is no automatic replacement, resubmission or deletion of recovery records.

The activity view retains same-account, same-network hashes from other public
contracts. It does not query those contracts through an invented endpoint or
turn their numeric record IDs into links to the configured contract. Automatic
reconciliation and record links remain limited to the configured deployment.

## Verification boundary

The browser regression uses two same-origin Chromium tabs, native Web Locks and
localStorage, the production client and actual generated SDK binding. Readiness
and RPC responses are controlled test fixtures. The losing tab must perform zero
SDK preparation calls; reload must preserve the blocking original-contract hash.
An unrelated account is a positive control. No external network request or wallet
signing call is permitted in this test.

The focused client cases additionally cover all twelve write entrypoints,
unavailable locks, corrupt storage, source changes during asynchronous work,
late journal changes, actual envelope source/network mismatches, terminal outcomes
and confirmed creations with missing IDs. These are adversarial local tests, not
new public-chain payment or wallet-extension receipts.

The final local workspace run passed 1,455 checks, including all 902 application
tests, with seven default optional skips. The explicitly enabled two-tab browser
test passed separately. A previous full run retained a one-second reviewer-key
readiness timeout; its isolated original test passed. Explicit, finite readiness
deadlines preserved real cryptography and every assertion, and the corrected
whole workspace passed. The initial failed run remains recorded.

## Limits

All existing public-kernel tabs must reload to use the new lock. Older open
versions do not participate retroactively. Coordination covers updated public
clients sharing a browser origin and storage context; it does not coordinate
private-pool or marketplace journals, other applications, separate browser
profiles, or transactions sent directly through a wallet.

This change does not activate public V4, migrate records, change credential
domains or alter immutable contracts. The remaining public release catalogue,
scoped receipt/link integration and V4 lifecycle gates remain documented in the
[guarded public checkpoint](PUBLIC_KERNEL_GUARDED_TESTNET.md). Passing these tests
is not an independent audit or a guarantee that every exploit is absent.
