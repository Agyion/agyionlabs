# Experimental disclosure operator and encrypted backup

These portable modules implement cryptographic checks and encrypted bytes. They
are not a legal decision system, a hosted committee, production key custody or
an independent security audit. They do not change the legacy parser or the
installed proof-suite registry. No function logs or persists plaintext.

## Independent decision authorization

`authorization.mjs` uses a trusted **decision-authority** Ed25519 roster and
quorum independently of the M-of-N decryption-trustee roster. An authority key
does not become a trustee key. The operator's policy is supplied by its trusted
configuration, never accepted from an incoming request.

The exact policy shape is:

```text
{ version:'2', domain:{networkId,contractId}, epoch, dkgTranscriptHash,
  policyDigest, threshold, authorities:[{id,publicKey}],
  trusteeIds, trusteeThreshold, allowedFields }
```

IDs and integer values are canonical decimal strings; hash/key bytes are
lowercase fixed-width hex. Authority IDs and trustee IDs are separately ordered
and distinct. Authority keys are distinct. The decision quorum may be 1 through
the number of configured authorities; the decryption threshold is at least 2.
The policy pins the accepted DKG transcript. Its trustee IDs/threshold must match
that transcript before a share can be produced.

A full request is exactly:

```text
{ version:'2', domain:{networkId,contractId}, epoch,
  ledger:{from,until}, requestId, recordHash, ciphertextDigest,
  requesterPublicKey, policyDigest, purposeDigest, fields, trusteeIds }
```

The request selects one record and an ordered nonempty subset of
`audit-assets`, `audit-parties`, `audit-terms`. The two full note envelopes are
never selectable. The request's trustee subset must meet the configured
decryption threshold. The requester key is a canonical 32-byte X25519 public
key, including rejection of low-order/all-zero shared-secret inputs. This V2
format deliberately differs from the older P-256-shaped, unverified disclosure
parser and its four field names.

`signDisclosureRequest(request, authorityId, seedHex, policy)` signs the entire
validated request, including requester, record/ciphertext, policy, purpose,
domain, epoch, validity interval and unique request ID.
`authorizeDisclosureRequest(request, approvals, policy, currentLedger)` checks
every supplied approval against the trusted roster, rejects repeated/unordered
authority IDs, checks the quorum, and enforces the inclusive validity interval
with a maximum width of 17,280 ledgers. A current ledger is mandatory. Signatures
do not establish that a claimed legal basis is legally valid.

The result is an immutable, module-branded `AuthorizedDisclosureRequest`.
Its digest commits to the normalized trusted policy, full request and verified
approval set. A JSON copy is not already authorized; on reload re-run signature
verification under the trusted policy and current ledger.

## Trustee boundary and replay storage

Construct an operator with:

```text
createDisclosureOperator({
  epoch, trusteeShare, policy, profile, claimRequest, readCurrentLedger,
  readAcceptedRecord
})
```

The epoch's public DKG packages and acceptances are reverified. The operator's
`profile` is the pinned `{domain, assetPolicyRoot, epoch, auditor}`. Its domain
must equal the canonical network/contract identity in the signed policy; its
epoch and auditor must match the finalized DKG. The operator's
`disclose(authorizedRequest, archivedRecord, currentLedger)` accepts requester
bytes shaped `{recordHash, ciphertexts: bigint[134]}`. It compares the
record identity, validates all 134 canonical BN254 fields and recomputes
`SHA256(concat(field_i as 32-byte big-endian))`. The requested U points are
derived only from the V2 audit headers at offsets 56, 69 and 85. Caller-supplied
replacement U points are not accepted. V2 record identity must equal this exact
ciphertext digest before either authority signing or verification.

Before the replay claim, the operator **independently** calls its configured
`readAcceptedRecord(recordId)` and requires `{recordId, publicInputs: bigint[157]}`.
It compares the exact ciphertexts, identity, domain, policy root, epoch and DKG
auditor. Missing records, read failures or mismatches produce no share or claim.
The trusted adapter must authenticate accepted records from the pinned pool;
it must not delegate to the remote requester's archive source. A matching hash
alone is not ledger inclusion. Historical transaction validity windows need
not be current, but disclosure expiry is rechecked after the read and again
after the durable replay claim. Local fixture readers are not live inclusion.

Before producing any partial decryption, the operator awaits
`claimRequest(replayKey, authorizationDigest)`. This trusted callback **must
atomically and durably insert the first-use record before returning true**.
False, an unavailable store, or an exception prevents disclosure. A Set or
localStorage read-then-write is not a durable cross-process atomic store.
The key binds the domain, epoch, policy, request ID and current trustee ID.

After claiming, the operator calls the trusted `readCurrentLedger()` again and
rechecks expiry before applying its secret share. Missing/noncanonical ledger
values fail closed. A failure after a successful claim consumes the request;
the caller must obtain a new signed request rather than automatically releasing
the claim. This module does not implement a storage backend or an idempotent
response journal. Its tests use an explicit in-memory atomic fixture, not a
claim of durable deployment.

Only requested fields receive partial decryption proofs. The full authorization
digest plugs into the DLEQ request context. `disclosurePartialContext(authorized,
archivedRecord, field, currentLedger)` reconstructs the same scope for the
requester-side combiner. It also requires a verified brand and current interval.

## Private delivery of partial decryptions

The operator returns encrypted delivery, not plaintext partials. The exact
construction is **ephemeral X25519 + HKDF-SHA256 + AES-256-GCM**, suite
`x25519-hkdf-sha256-aes256gcm-v1`. It is **not HPKE** and does not claim an
independent composition audit.

The recipient is the X25519 key from the signed request. A fresh ephemeral
sender key and random 96-bit nonce are generated for every delivery. The HKDF
salt/info and GCM associated data bind the version/suite, authorization digest,
request ID, record hash, ciphertext digest, trustee ID, recipient key, ephemeral
sender key and nonce. Ciphertext imports are bounded to 32 KiB including tag.
All-zero X25519 shared secrets and noncanonical public-key encodings are rejected.

`openDisclosureDelivery(blob, authorized, requesterSecretHex, epoch,
archivedRecord, currentLedger)` verifies all bindings, decrypts, requires exactly
the requested ordered field set, and checks every DLEQ against the transcript
and archive-derived U. It returns `{field,partial}` rows for the threshold
combiner. The DLEQ authenticates share consistency with the registered trustee
verification key; this is not an additional sender-signature or identity system.

Expiry controls issuance/these API checks. It cannot erase knowledge already
obtained by a requester, and M colluding trustees can decrypt other epoch records.
Ciphertext randomness/key independence and circuit constraints remain part of
the full protocol composition, not guarantees created by request signatures.

## Password-encrypted backup format

`backup.mjs` exports:

- `encryptBackup(plaintextBytes, password, context)`
- `parseEncryptedBackup(blob, expectedContext)`
- `decryptBackup(blob, password, expectedContext)`
- `BACKUP_KDF`

The context is exactly `{domain:{networkId,contractId}, epoch, ownerId}` with
32-byte domain/owner identifiers and a positive canonical decimal epoch. Payloads
are copied Uint8Array values of 1 byte through 1 MiB; shared backing memory is
rejected. The module does not choose a note/key JSON format or write files.
The caller owns serialization and must preserve the correct expected context.

The password is used exactly as supplied, with no normalization or trimming:
12 through 1,024 JavaScript code units and at most 1,024 UTF-8 bytes. Length is an
input bound, not an entropy guarantee. The fixed import/export profile is Argon2id
version 19, **64 MiB, three iterations, one lane**, producing a 32-byte AES key.
The asynchronous implementation yields during derivation. A profile mismatch is
rejected before running the KDF; an attacker cannot request a larger work factor
or silently downgrade it. Environments unable to run that memory profile fail;
there is no weak fallback.

The exact encrypted blob fields are `version`, `suite`, `context`, `kdf`, `salt`,
`nonce`, `ciphertext`. Suite is `argon2id-aes256gcm-v1`; salt is 16 random bytes,
nonce is 12 random bytes, and ciphertext includes a 16-byte GCM tag. The complete
normalized header is authenticated as associated data. Unsupported fields,
oversized encodings and unexpected context are rejected before password work.
Wrong passwords and modified authenticated content fail without plaintext output.

Temporary derived byte arrays and copied plaintext are overwritten where the
runtime permits. JavaScript strings, internal library/runtime copies and garbage
collection do not provide a secure-erasure guarantee. The modules do not log,
persist or transmit plaintext themselves. Backup strength still depends on the
password, endpoint integrity and the caller's custody and recovery practices.

## Local checks

Tests use real Argon2id/AES-GCM and actual Ed25519/X25519, BabyJub DLEQ and HKDF
operations. They exercise wrong passwords, modified backup context/tag, malicious
KDF/header imports, invalid authority quorums, every signed request binding,
unrequested fields, changed archives, duplicate concurrent request claims,
missing/stale ledger reads, requester/context/tag changes, and delivery plus
threshold combination. All keys, requests, archives and replay stores are local
synthetic fixtures. No real committee, legal authorization, hosted service or
external disclosure is demonstrated by these tests.
