# Recovery compatibility review

Reviewed on 27 September 2026. These findings concern recovery and reporting.
They do not establish an unauthorized transfer or a loss of token backing.
Contract bytecode, deployed addresses, circuit parameters and saved key scopes
are unchanged by these corrections.

## A merchant registration can execute at a different key epoch

The marketplace contract increments the merchant epoch when registration
executes. The current immutable ABI has no expected-epoch argument. The client
checks the expected epoch before signing and sending, but a separately
authorized registration can execute after the final check. Using the same
source account normally also encounters sequence checks; this observation is
not a way for an unauthorized caller to rotate another merchant's key.

Previously, the verified transaction result checked the seller and public key
but discarded the returned epoch. A saved backup for epoch 2 could therefore
belong to a key registered at epoch 3. Existing signing gates reject the wrong
scope, but the confirmation did not explain why the key was unusable.

The client now retains the included seller, public key and epoch after verifying
the signed envelope, invocation, result and return preimage. The durable journal
stores that identity only on a confirmed merchant registration. A confirmed
transaction releases its pending source reservation normally. It is not
reclassified as unknown and it is not submitted again.

The key screen compares the included epoch with the checked backup. A mismatch
instructs the merchant to retain earlier backups, lock the key and prepare a
new rotation with a checked backup for new listings. No private key is rebound to a different
epoch automatically. Already reserved pickups retain their original key rules.
Recovery displays the included epoch separately from the latest registration.
An older saved terminal without this field remains readable and is not filled
from mutable current state.

This is a compatible reporting and recovery correction. It does not add atomic
expected-epoch enforcement to the deployed contract.

## Restoring archived accounting data changes its metadata

The additive private-pool liability reader previously required a counter's
last-modified ledger to be no newer than the contract instance's last-modified
ledger. That assumption does not hold after restoring a counter from Stellar's
hot archive. Core rewrites the restored entry with the current ledger while
leaving an already live instance untouched.
[Pinned Stellar Core restoration implementation](https://github.com/stellar/stellar-core/blob/1b9d421f816c2cd4aae77f9e6692193f37c808c2/src/transactions/RestoreFootprintOpFrame.cpp).

The reader now accepts this metadata ordering. It still requires the configured
asset, exact persistent storage keys, canonical nonnegative i128, a valid current
lifetime, modification metadata no later than the RPC head, pinned code and
configuration, and matching before/after pool checkpoints. Missing or expired
data is never treated as zero. The configured RPC remains a trust boundary.

This correction is in the separate accounting reader. It does not implement
an application restoration operation. No live hot-archive restoration is
claimed by the synthetic metadata regression.

## Verification boundaries

The complete local workspace run passed 1,306 tests with six default optional
skips. The changed real Chromium journal test was enabled separately and passed.
Application type checking passed. Lint retained three existing generation-ref
cleanup warnings. These counts do not include an unperformed new chain lifecycle.

The merchant tests use actual SDK signatures and XDR with synthetic ledger
responses, plus a real Chromium IndexedDB/Web Locks test. They verify identity
binding, old-record compatibility, invalid stored data, source reservation
release and reconciliation without resubmission. Mounted UI tests use real
encrypted backup creation and checking with synthetic transaction outcomes.

The accounting tests model positive and zero counters restored after the
unchanged instance, and retain missing, expired, future-ledger, changed-state
and invalid-code rejection cases. They are not a ledger archival test.

A separate direct pinned RPC read observed zero XLM and USDC liabilities in the
guarded pool at ledger 4,898,801 with the unchanged checkpoint
`fdb27e571efd35ceefcb152571353b6aad4d0a4ca54d5b2712b08968470468c0`.
Those entries were live. This read does not establish restoration or current
token custody. The first helper attempt stopped during manifest validation
because its point coordinates were still JSON strings; it made no RPC request.
The corrected helper uses the same bigint conversion as the application, and
the failed attempt is retained separately.

No new testnet transaction, wallet approval, trustee disclosure or deployment
of a contract was needed for these regressions. The prior actual testnet
receipts remain separately dated. Independent security review, production
setup, independent trustee custody and actual archival restoration remain
open requirements.
