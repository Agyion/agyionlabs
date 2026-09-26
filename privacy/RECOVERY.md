# Local private recovery

`recoverPrivateArchive({profile, scope, vault, client, reader}, signal?)` joins
the complete restored key vault, indexed public archive and local note scanner.
It uses the actual BabyJub/Poseidon ciphertext implementation. It does not prove,
submit, persist plaintext or establish ledger inclusion.

The vault scope must match the selected network, contract, epoch and profile ID.
The circuit domain is independently derived from that network/contract pair.
The remaining profile values must come from the application's pinned release
configuration. Restoring note openings alone is not wallet recovery: spending,
viewing, grant preimages and revocation keys require the complete encrypted
key backup described in `KEY_RECOVERY.md`.

The trusted reader supplies:

- `readState({signal})`: canonical bigint `root`, `nextIndex`, `recordCount`,
  `revocationCount`, `revocationRoot`, and a lowercase64-hex `snapshotId`.
- `readRecordIdAt(index, {snapshotId, signal})`: exact record digest.
- `readRecord(id, {snapshotId, signal})`: `{recordId, publicInputs: bigint[157]}`.
- `readRevocationAt(index, {snapshotId, signal})`: `{tag, oldRoot, newRoot}`.

The adapter must authenticate the pinned pool, accepted records and checkpoint.
Self-consistent responses from an untrusted provider do not supply that trust.
Archived ledger entries must be restored/retrieved; absence is an error. The
controller reads every advertised index, including transactions with no output
notes, and validates exact roots and counts. It scans all vault view keys in
batches of at most32, filters observed spent nullifiers and checks the full
state/checkpoint again before publishing note handles. A changed snapshot or
abort discards this attempt's handles while preserving preexisting client notes.
The caller must explicitly retry; the module never silently skips or retries.

The bounded implementation supports at most100,000 records and100,000
revocations per attempt. Larger histories fail explicitly. Between key batches
it yields to browser input/cancellation. Returned `state`, reconstructed
`archive` and opaque `notes` describe that snapshot; they cannot guarantee a
note remains unspent later. Fresh state and normal authorization are still
required before making a new transition. JavaScript cannot guarantee physical
erasure after a handle is forgotten.

The recovery integration test saves only an encrypted complete key file,
forgets the original vault, reloads into a fresh client, scans actual generated
ciphertexts and recovers a surviving Pod note under a separate grant view key.
It rejects missing/wrong records and snapshot changes, removes spent notes and
prepares a local claim from restored key material and reconstructed membership.
This test does not call a prover or claim chain acceptance.

## Application integration still required

These helpers have no runtime consumer in the existing application at this
checkpoint. The remaining work, separate from ceremony/operator operations, is:

- Wire a pinned private-pool release profile and an authenticated indexed-read
  adapter, including archival restoration and snapshot/retry handling.
- Add encrypted key-file save, file reselection and full restore comparison
  before funding or adding grants; session/account changes must cancel pending
  recovery/proving and discard the appropriate local handles.
- Connect the local proof worker, private balances and policy-specific forms
  with progress, cancellation and stale-root re-preparation.
- Integrate wallet network/account checks, exact signed transaction identity,
  durable pending intent/recovery and accepted-ledger effect reconciliation.
  A local draft, verified proof or RPC simulation must not appear as payment
  acceptance. Deposit/withdrawal public metadata remains visible.

The new operator API separately requires its own trusted accepted-record read;
an authority-signed request and requester-supplied ciphertext alone are
insufficient for a trustee to produce a partial decryption.
