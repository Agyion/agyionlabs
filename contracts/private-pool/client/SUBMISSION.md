# Testnet submission and public recovery journal

This browser-compatible module is an implemented, experimentally reviewed
transaction boundary. It is not connected to the published application and does
not configure a live pool, committee or production ceremony. Its local tests use
real saved Groth16 proofs and actual Stellar SDK transactions/signatures, with
explicitly synthetic RPC and ledger responses. They do not submit funds.

## Required adapters

Create `createTestnetSubmissionLifecycle` with the exact branded `PoolRelease`
returned by `verifyPoolRelease`, its matching branded `PoolReader`, a local wallet
adapter, a transport for that release's pinned testnet RPC, an independently
pinned local proof verifier, and an explicit maximum total fee in stroops.
Mainnet, copied/unbranded releases and readers, and a mismatching pool profile are
rejected. Runtime adapters remain trusted code; an arbitrary callback returning
true does not constitute a proof verifier.

The wallet exposes a synchronous immutable session identity/account/network and
`signTransaction(unsignedXdr, networkPassphrase, account)`. Advance the session
identity whenever account, network, connection or authority changes, including
disconnect/reconnect to the same account. The lifecycle rechecks it after each
pre-send await. The current path requires an expected Ed25519 source signature;
contract-account and other custom authorization workflows need separate work.

The transport supplies `getAccount`, `getLatestLedger`, `simulateTransaction`,
`sendTransaction` and `getTransaction` using the installed SDK response shapes.
Wire these to the same pinned RPC with bounded request timeouts. The module has
no hidden network fallback. RPC and ledger readers authenticate operational
provenance; envelope hashing is an identity check, not independent verification
of Stellar consensus or provider honesty.

## Submit and reconcile

`submit(candidate, addresses)` accepts only the public `UnsubmittedPrivateTransition`
result: exactly 157 canonical signals, canonical 256-byte proof and ciphertext digest.
Use the local coordinator's exact-signal check before this call. The lifecycle
verifies the proof again, derives all public address IDs, checks the pinned
profile, and requires the proof's current append/revocation checkpoint.

The actual SDK prepares one pool `submit` invocation and simulates/assembles it.
The raw transaction and host function are copied before awaiting simulation.
Unexpected authorization, restoration requirements, a wrong returned record ID
or an excessive fee fail before signing. Deposits require the transaction source
to be the public funder and an exact source-account authorization tree for the
pool call and token transfer. Internal transfers/withdrawals require no source
authorization entries. The ledger window is encoded into the signed transaction.

The wallet must return exactly the requested payload hash, signed by the expected
source. A wallet-returned fee-bump envelope is rejected. A fresh pinned checkpoint
is required before signing and again before sending. The immutable public attempt
is durably committed before `sendTransaction` can be invoked.

`pending` means inclusion is unresolved. ERROR, DUPLICATE, NOT_FOUND, a missing or
mismatching response hash, lost response, provider failure or timeout never
authorizes another broadcast. `reconcile(hash)` reads only the original locally
signed hash; it does not rebuild, re-sign or resend a transaction. Confirmation
requires the matching signed envelope, successful operation result and metadata
return digest, plus an accepted record whose entire 157-field public vector
matches, between consistent pinned reader checkpoints. A record submitted by
someone else cannot substitute for transaction inclusion evidence.

RPC indexes both inner and outer fee-bump hashes while returning the outer
envelope/result. Reconciliation therefore also accepts an external fee-bump only
when its signed inner envelope and result-pair hash exactly match the journaled
transaction. The inner result must agree with the outer status. Failure requires
`txFailed` with exactly one failed operation of the invoked type; unsupported
precondition/outer-only failures stay pending. See the primary
[RPC indexing and response implementation](https://github.com/stellar/stellar-rpc/blob/main/cmd/stellar-rpc/internal/db/transaction.go)
and [Core transaction handling](https://github.com/stellar/stellar-core/blob/master/src/transactions/TransactionFrame.cpp).
No claim is made that every unsupported negative result could execute later.

`known_not_sent` is recorded only for a refusal after journal commit while this
execution still owns its Web Lock and before transport invocation. Crash/reload
does not allow that inference. Ordinary repeated `submit` returns the recorded
outcome. An explicit user retry calls
`retryKnownNotSent(previousHash, candidate, addresses)`; only the latest exact
intent with that terminal status is eligible. All proof/checkpoint/session/fee
checks run again, and a fresh CSPRNG public hash memo creates a different immutable
transaction hash. Previous evidence is retained. Pending/confirmed/failed
attempts cannot enter this retry path.

## Durable browser journal

Use `createIndexedDbSubmissionJournal()` with its stable default database name
across this application's pools/tabs. Do not use a new name to bypass an unresolved
attempt. IndexedDB and Web Locks are mandatory; there is no plaintext localStorage
fallback. Atomic transactions request strict durability and reserve the source,
record ID, nonzero nullifiers and commitments before completing. Web Locks cover
the entire prepare/sign/send critical section.

Only public fields, signed hash, call digest, sequence, retry ancestry and terminal
evidence are stored. No witness, key, signed XDR or proof is persisted. Public
metadata is still sensitive to correlation; same-origin scripts and browser
storage readers can inspect it. Do not present it as encrypted wallet recovery.

`pending()` discovers unresolved public attempts after reload. Filter by the
current release and source before displaying/reconciling; never treat a local
result as a private balance. `find(intent)` returns the latest immutable attempt
in an explicit retry chain. Every read and mutation audits all retained bases,
terminal references, retry ancestry and exact reservation ownership. Missing or
corrupt links fail closed. The explicit maximum is 10,000 attempts and 60,000
reservations; there is no silent truncation, expiration, clear button or automatic
release. Capacity requires a reviewed recovery/migration workflow before reuse.

These are same-origin, one-browser-profile guarantees. They do not protect
against hostile same-origin code, whole-database deletion/rollback, another device
or an OS/storage failure that violates browser durability. The test evidence
covers two real pages, reload, atomic conflicts and injected storage corruption;
it does not simulate power loss. Keep unknown attempts locked and surface recovery
errors to the user rather than creating a fresh journal.

## Integration still required

The application must supply the reviewed release/prover pins, session adapter,
RPC transport, explicit transaction/fee confirmation, pending-activity UI and
local vault/archive recovery. Before funding or creating a grant, require a saved
complete encrypted key bundle and a successful restore check; this journal is not
a key backup. Cancellation and stale checkpoints must lead to deliberate user
preparation again, never automatic submission. No application acknowledgement or
successful backup has been fabricated by this module.

Even internal private transfers expose the public source fee payer, transaction
timing, roots, nullifiers, commitments, encrypted record and proof. Deposits and
withdrawals additionally expose the bridge token, amount and public funder or
recipient; any public fee asset/amount/recipient is visible too. Confidential note
contents do not make the wallet source or these bridge facts private.

`npm test` checks types and runs all client tests. The focused lifecycle tests use
the committed public proof/VK only and actual snarkjs verification with a genuine
single-thread curve; no large proving artifact or accepting verifier mock is
required. The positive signed lifecycle fixture is an internal create-Pod
transition. A live deposit wallet/simulation flow and live withdrawal remain
untested; the committed deposit fixture's public funder has no known signing key.
Actual browser journal checks are separately opt-in via
`PRIVATE_JOURNAL_BROWSER_TEST=1`; independent two-page/fault evidence is recorded
under `artifacts/security/2026-09-26/privacy/journal-independent-final/`.
