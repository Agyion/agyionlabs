# Local private recovery

`recoverPrivateArchive({profile, scope, vault, client, reader, credentials?}, signal?)` joins
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
Archived ledger entries must be restored/retrieved; absence is an error. Neither
this helper nor the current pinned reader implements live network archival
restoration. The controller reads every advertised index, including transactions
with no output notes, and validates exact roots and counts. It scans all vault view keys in
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

## Current application integration

As of 27 September 2026, the published Pod, Trigger and Envoy workspace consumes
this helper through [the private coordinator](../app/app/lib/private/protocol.ts).
It reconstructs private notes and balances from the selected pinned reader,
runs the local proof worker, checks the wallet session and exact signing payload,
and reconciles submission against accepted ledger effects. A failed refresh
clears displayed notes and balances. A draft, verified proof or simulation is
not payment acceptance. Deposit and withdrawal metadata remains public.

The [compiled release catalogue](../app/app/lib/private/release.ts) selects the
guarded `CAI6HUPV6VLXRKJKSCANRM4YP7W6ZNLBUZFK4GEUG5O3OB4X43RBE2ZB` pool for new
funding. The original `CDSK32ISKXRW6PX3ZMCHLUP4URNQSYNNH2GZU7ZSZJFL4FSEFQM25YHT`
profile remains available for recovery using its unchanged backup scope,
committee, records and pending hashes. The current coordinator permits only
existing-position recovery operations there. This application policy does not
change the original immutable contract or move existing notes.

The [vault controller](../app/app/lib/privateVault.ts) requires an actual selected
encrypted file and a full decrypted comparison before granting the coordinator
access to private keys. Adding a grant invalidates the previous backup check.
Incoming scoped credentials remain separate recovery files and must be imported again after a
lock; they are not silently added to the complete vault backup. A backup's public
scope is only a hint for selecting an already compiled release, never permission
to import an arbitrary pool. Switching profiles requires explicit reselection
and authenticated restoration.

Profile or wallet-session changes retire the old vault, prover, credentials and
fee review. Public pending activity is available outside the locked vault and
across known profiles. Its read-only recovery uses each attempt's original hash
and release; it cannot sign or resend. Browser storage deletion, rollback or loss
of the saved key files is outside these local persistence guarantees.

## Executed evidence and remaining limits

The local ciphertext recovery test described above is separate from the
[guarded testnet lifecycles](../deployments/private-pool-guarded-testnet.json):
15 included XLM transactions with 122 checks and 15 included Circle testnet USDC
transactions with 124 checks. Those runs restored encrypted files for four
private roles and recovered accepted records using a dedicated CLI fee payer.
They were not browser-wallet approvals.

A later [real Freighter test](../deployments/private-pool-freighter-testnet.json)
completed eight checks and two included transactions: a 0.01 test XLM deposit
and withdrawal. It reloaded the actual pending journal, reconnected the wallet,
reconciled the original hash without resubmission, and restored the saved vault
to recover the deposited note. This establishes that bounded desktop flow,
not every instrument role or a mobile-wallet recovery flow. The receipt retains
the network and harness failures alongside the successful observations.

Recovery of accepted live entries is implemented and exercised. Restoration of
network-archived entries is not implemented or verified by these paths. Missing
history continues to fail closed. The development setup and all five trustee
shares remain under one operator; no independent custody, production ceremony,
independent audit or legal identity service is established.

The disclosure operator separately requires its own trusted accepted-record read;
an authority-signed request and requester-supplied ciphertext alone are
insufficient for a trustee to produce a partial decryption.
