# Second-reviewer recovery follow-up

Date: 2026-09-26. Scope: `recoveryStorage`, `transactionReceipts`,
`anchorPayments`, their submission/reconciliation integration in `hakClient`,
`accountOps`, `RampPanel`, and the connected Ledger recovery consumer. This was a
local defensive review and regression pass. No browser, full build, deployment,
network payment or external attack was performed by this reviewer.

Five actionable cases were reproduced by running the source locally with
in-memory storage and mocked chain responses, then covered by failing tests:

1. **Unmatched outcome evidence released a retry guard.** Reconciliation queried
   hash A but accepted `{ txHash: B, status: 'FAILED', ledger: 7 }`, marked A failed
   and returned no unresolved attempt for A's intent. Terminal responses with no
   ledger were also accepted. `transactionReceipts.ts:109–140` now requires an
   exact hash and a positive safe-integer terminal ledger. Missing, mismatched or
   malformed evidence leaves the outcome unresolved. This proves a validation
   gap with a bad provider response, not that the production provider returned one.

2. **A confirmed create stopped recovering before its ID was available.** The
   first successful response without `returnValue` stored `success/refId: null`.
   A second reconciliation never queried it, even when the next response could
   supply ID 17. The SDK declares the return value optional. Successful `create_*`
   attempts without an ID now remain eligible for read-only lookup. Later missing
   responses cannot downgrade their confirmation; a matching result fills the ID.

3. **Interleaved Ledger writes lost an entry permanently.** Two confirmed hashes
   wrote a shared local array; A's later write erased B while both recovery
   attempts had `recorded: true`. Recovery skipped B thereafter. New Ledger writes
   are immutable per-entry rows, retain read compatibility with the v1 array and
   deduplicate by hash while preferring actual action details over generic
   recovery rows. Reconciliation checks actual row existence instead of trusting
   the historical `recorded` flag, so a prior lost row can be repaired.

4. **The normal submission path also trusted response identities.** A missing or
   different send hash could be accepted or replace the locally signed hash;
   get responses with a different hash or no ledger could become terminal.
   `hakClient.ts:849–874,942–991` now compares the send hash with the locally
   signed envelope and requires both send/get identities plus a positive
   safe-integer terminal ledger. Only that evidence reaches result decoding or
   receipt creation. Missing, mismatched or malformed evidence stays unknown
   under the actual signed hash and blocks another submission of that intent.
   A send `ERROR` alone also remains unknown until matching on-chain failure is
   available, including after a response is lost. Fourteen submission regression
   cases failed against the prior implementation before the fix.

   The installed Stellar SDK 16.3.0 synthesizes `getTransaction().txHash` from
   the request argument (`lib/esm/rpc/server.js:803–818`). The shared terminal
   evidence check therefore also reconstructs the returned `envelopeXdr` under
   the attempt's expected network and compares its local hash. A regression
   exercises the installed SDK's actual transformation with raw XDR and no HTTP:
   a response containing envelope B still exposes requested hash A, but recovery
   remains unresolved. Missing, malformed, different-envelope and wrong-network
   cases are covered with real SDK transaction envelopes. The jsdom test fixture
   bridges its typed-array realm to Node Buffer for the SDK's hashing library;
   this test-only setup does not change production behavior.

5. **Post-broadcast storage failure gave a false no-send assurance.** A base
   recovery record could persist and the transport could return `PENDING`, then
   saving terminal evidence could fail with "Nothing new was sent." A failing
   regression reproduced this exact message after one transport call. Appending
   outcome evidence now reports uncertainty and includes the known hash. The
   original pending record continues to block retry; pre-broadcast persistence
   failures retain their accurate no-send message.

Legacy terminal records without a positive ledger are read as unknown. For old
create records this also restores the original null-ID intent, so an unproven
stored ID cannot bypass the retry guard. Old immutable evidence lacking a valid
terminal ledger cannot promote a pending attempt, while valid terminal evidence
still survives later uncertain responses. This deliberately favors blocking a
retry when a provider cannot furnish definitive evidence; a send rejection that
never receives a terminal chain record remains unresolved.

Explicit Clear history remains durable: immutable clear markers carry a
generation and the confirmed hashes that the user cleared. Older writes cannot
reappear after a clear, later transactions can appear, and concurrent clears
retain both suppression sets. Marker compaction removes only markers whose
contents were included in the new marker. Financial recovery attempts and their
duplicate-payment guards remain intact. The marker must be saved before history
rows are removed; failure now keeps the displayed entries and uses LedgerPanel's
existing error feedback. Successful chain actions still tolerate failed optional
history writes, retaining an in-memory row for that page lifetime.

The focused cases cover wrong/missing hash, invalid ledger, lost-response retry
guards, send rejection ambiguity, legacy ledger-free outcomes, later ID recovery,
non-downgrade, interleaved records, existing `recorded: true` repair, clear across
module reload, older writes completing after clear, legacy reads, preservation of
action details, clear-storage failure and interleaved clear markers. Nine initial
recovery/Ledger cases failed before the fixes; the separate clear-error UI test
also failed before the integration change. The earlier focused pass was
150/150. After extending submission validation, final whole-app verification
passed **467/467 across 31 files** at 05:15 local time; TypeScript also passed.
Logs are `artifacts/security/2026-09-26/landing/submission-app-final.txt` and
`submission-typecheck.txt`. Earlier recovery-only logs remain alongside them.

No additional demonstrated duplicate-anchor-payment defect was found in the
reviewed path: it saves a local hash before transport, locks the same withdrawal,
checks matching Horizon hash/ledger evidence and keeps NOT_FOUND/failed lookups
unresolved. Corrupt recovery storage fails closed before a new submission.
These are source/local-test results, not a real payment or cross-browser test.
Envelope identity does not cryptographically prove consensus or the claimed
outcome/ledger. The configured provider's honesty and availability are still
assumed; these checks prevent inconsistent evidence from being accepted as a
different transaction's result.

This follow-up covers the assigned submission and reconciliation paths; it does
not claim that all provider responses throughout the repository have now been
validated. Final build/browser/release checks remain with the parent task. Exact
read ranges and snapshot hashes are recorded in
`artifacts/security/2026-09-26/landing/recovery-review-coverage.json`; this is not a
whole-repository manual audit.
