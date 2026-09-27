# Local merchant signing keys

This module is the experimental Fade Market merchant-key boundary. It does not
hold a customer's wallet, submit transactions, contact an RPC, persist plaintext,
or connect itself to the published application.

`createMerchantKey(scope)` creates an independent random Ed25519 key in memory.
The frozen opaque handle contains only `kind`, `publicKey`, and the exact testnet
`scope`: `networkId`, `contract`, `seller`, and positive `keyEpoch`. Copying or
deserializing those fields does not reproduce a usable handle. A rotation needs a
new key and the new epoch; it never carries the previous key's backup approval.

Before registration or signing, the product must let the merchant download
`exportMerchantKey(handle, password)`, then select the saved file independently.
`checkMerchantKeyBackup(handle, selectedFile, password)` reads a genuine, bounded
native File, decrypts it, validates every scope field, recomputes its public key,
and compares the actual private material. Only then does the signing gate open.
Exporting a backup does not open it. `restoreMerchantKey(file, password, scope)`
also returns an unchecked handle; a successful explicit backup check is required.
The product must not manufacture a File from the export output and automatically
approve it. JavaScript can validate file bytes, not prove an OS save operation.

Encryption reuses `privacy/src/backup.mjs`: Argon2id with 64 MiB, three iterations,
one lane, and AES-256-GCM. The authenticated context binds the network, contract,
seller, epoch and public key. Passwords need at least twelve characters and stay
with the caller; the module never saves them. The file is capped at 16 KiB and
uses strict UTF-8 and complete schema validation. Decrypted malformed plaintext
produces a fixed error without a JSON-parser excerpt.

`signPublication(handle, publication)` validates the complete scoped publication
and recomputes its metadata commitment. `signPickup(handle, request)` takes
`{scope, action, receipt, leaseUntil?}`. The action is exactly `walk-in`, `reserve`
or `reserved`; a lease end belongs only to a reservation. Both use the shared
canonical signing codec. There is no arbitrary-byte signing function.

The caller must still verify the current pinned release, seller's registered
public key/epoch, offer terms and sequence, price, claimant and ledger conditions.
For an existing reservation it must use the accepted merchant-key snapshot.
Vault scope validation does not replace a fresh chain observation, establish
physical delivery, or give a merchant key permission to debit a customer's wallet.

Call `forgetMerchantKey(handle)` when locking, changing wallet or scope, or
discarding an old key. It revokes the handle and wipes its retained seed buffer.
Pending export/check/sign operations recheck handle identity. A newer backup
check invalidates older checks, including an older success that finishes after a
newer failure. UI callers must discard stale restore results and forget their
handles when their wallet/scope changes while restoration is pending. JavaScript
cannot guarantee physical erasure of SDK temporaries or garbage-collected copies.

Run `npm --prefix privacy ci` for the shared encryption dependencies and
`npm --prefix market test` for genuine encryption/signature, input, lifecycle and
recovery tests. Browser integration, deployed catalog behavior and live custody
tests are separate evidence.
