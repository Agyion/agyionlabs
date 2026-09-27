# Experimental testnet revocation

`createTestnetRevocationLifecycle` provides the transaction boundary for the
pool's `revoke` entry point. It consumes the same verified release, branded
reader, wallet session adapter, pinned RPC transport and durable journal as
`createTestnetSubmissionLifecycle`. Supply the **four-input revocation verifier**,
not the 157-input transition verifier, and an explicit fee budget in stroops.
Neither module decides that a pool is production-ready or supplies a trustee.

`revoke(candidate)` accepts exactly:

```ts
{
  kind: 'UnsubmittedPrivateRevocation',
  proof,          // canonical 256-byte Groth16 encoding, lowercase hex
  publicSignals,  // four decimal fields: domain, oldRoot, newRoot, tag
  ownerKey,       // raw Ed25519 public key, 32-byte lowercase hex
  signature,      // owner's revocation signature, 64-byte lowercase hex
}
```

The owner's signature covers the UTF-8 prefix `AGYION_REVOKE_V2` followed by
one zero byte, then the four public fields in that order, each encoded as an
unsigned 32-byte big-endian integer. The seed remains in the local private vault.
This signature authorizes revocation, while the connected wallet separately
signs the fee-paying Stellar transaction. The contract's domain/tag derivation,
signature, current revocation root and actual Groth16 proof are checked before
requesting that wallet signature.

The lifecycle prepares exactly one `revoke` invocation. A fresh ledger supplies
a bounded 120-ledger transaction window. Simulation must return `void` without
authorization entries; restoration, excess fees and altered calls are refused.
Wallet/session/checkpoint checks and immutable journal commit precede the single
broadcast. Source reservations coordinate submit and revoke within the same
browser database and Web Lock.

Confirmation requires the matching signed transaction envelope, invocation
digest, consumed successful operation, `void` Soroban return and its success
preimage hash. The originally expected revocation archive index must contain the
same old root, new root and tag between stable pinned reader checkpoints. Later
revocations may have advanced the latest root; they do not invalidate this
historical evidence. An archive row alone is not transaction inclusion evidence.
Actual consensus and RPC-provider honesty remain external trust boundaries.

`reconcile(hash)` reads only and cannot send. Unknown/lost/error/duplicate
responses retain reservations. Only an explicit
`retryKnownNotSent(previousHash, candidate)` can retry a locally recorded
pre-broadcast refusal; it rechecks all inputs and obtains a distinct signed
transaction hash while preserving the previous evidence.

## Journal compatibility

Keep `agyion.private-pool.public-attempts.v2`, the established default database
name. Database schema version 2 opens the same three stores without clearing or
rewriting old rows. Version 1 submit-attempt serialized bytes and digests remain
unchanged. Version 2 attempt records contain `operation: 'revoke'`, the public
owner key, four signals and the expected revocation index. Their `recordId` is a
domain-separated public intent digest, not a ciphertext digest. No proof,
signature, signed transaction or secret is persisted.

`pending()` now returns a discriminated union. Use attempt `version === 1` with
the submit lifecycle and `version === 2` with the revocation lifecycle, after
filtering by release and source. Each lifecycle rejects the other type.
Do not create a fresh database or discard unknown records when an upgrade or
reconciliation fails. The same-origin and one-browser limitations documented in
[SUBMISSION.md](./SUBMISSION.md) still apply.

Tests verify genuine committed public Groth16 proofs, Ed25519 signatures and SDK
transaction XDR against explicit local RPC/ledger fixtures. The browser test
opens an actual schema-version-1 IndexedDB database, upgrades it, checks old
bytes/digests, proves submit/revoke conflicts and discovers the pending revoke
after reopening. These are not live testnet submission or power-loss tests.
