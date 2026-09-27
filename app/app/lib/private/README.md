# Private application coordinator

`protocol.ts` connects the checked local vault, authenticated archive reader,
strict command planner, local proving worker, wallet session and durable public
submission journal. Pod, Trigger and Envoy use this path in the application
source. Fade keeps its public payment protocol. Selecting a private action never
falls back to the public contract.

The pinned release is experimental Stellar testnet. Its setup and 3 of 5 trustee
keys are controlled by one development operator. A complete signed transcript
does not establish independent custody or an independent proving ceremony.
See the release and committee files beside this document and
[the private pool release rules](../../../../contracts/private-pool/RELEASE.md).

## Operation boundaries

1. The vault must have a current encrypted backup that the user selected again
   and successfully decrypted and compared. Adding a grant invalidates that
   authorization until the updated complete backup is checked.
2. Refresh reconstructs every accepted record and revocation from the pinned
   reader and verifies the final checkpoint. Failed refresh clears displayed
   balances and notes. Balances are never inferred from a submitted transaction.
3. Preparation snapshots a strictly parsed command, current source account,
   wallet session and vault revision. Witnesses and note openings stay local.
   The default prover downloads pinned chunks and runs in a dedicated worker.
   Two input notes are supported; consolidation is an explicit separate action.
4. A foreign recipient's Pod, Trigger or Envoy grant produces a separate
   encrypted credential. Downloading it alone is insufficient. The sender must
   select the saved file again and check its full decrypted payload before
   funding. The recipient imports that file into the intended scoped vault.
   Imported files are separate recovery material, not part of the vault backup.
5. Submission rechecks the proof, checkpoint, ledger window, wallet and exact
   simulated operation. The user sees and approves the transaction's assembled
   maximum network fee before the wallet opens. The actual charged fee can be
   lower. Fee limits never increase automatically. An explicit limit change can
   reuse the prepared proof only before signing begins and consumes the old
   opaque review handle.
6. The journal must commit the public signed hash and reservations before
   broadcast. An unknown response is reconciled using that hash, never silently
   resent. A completed handle cannot sign again. Reconciliation updates cached
   status, binds its wallet/generation, and excludes another active preparation.
7. Lock, wallet replacement or disposal invalidates local capabilities, forgets
   imported credentials and stops the proving worker. Public pending records
   remain discoverable even while the vault is locked. UI callers refresh that
   journal in `finally`, including when cancellation follows a possible send.

## Instrument semantics

Pod has a time-locked claimant and a scoped secret. It has no funder reclaim
operation. Trigger uses the note's actual BabyJub attester key and signed message;
claim and funder refund have distinct deadline conditions. Envoy allows bounded
agent claims and owner reclaim/revocation. A display action is only a hint:
the planner and contract proof independently enforce authorization again.

Every new conditional note needs an unused grant view key. Recovery records
already-used grant IDs from the entire accepted history, including spent notes.
An Envoy successor intentionally keeps its existing policy/view scope.

## Testing and trust

`private-wallet-session.test.ts` exercises actual SDK signatures and wallet
replacement. `private-note-summary.test.ts` checks displayed authority and ledger
boundaries. `private-protocol.test.ts` exercises backup, cancellation, fee,
pending reconciliation and cross-owner credential recovery with genuine vault
crypto and an SDK-encoded fixture reader. Its explicitly injected proof and RPC
boundaries are control-flow fixtures, not cryptographic or chain acceptance.
The private client has separate genuine saved-proof tests and real browser
IndexedDB migration tests; actual local-worker proving and testnet settlement
must be verified separately for a release.

The injected second coordinator argument is for trusted integration harnesses.
Product UI supplies only vault, explicit fee limit and fee confirmation. A form
or URL cannot select another prover, release, accepting verifier or witness.

RPC providers and the delivered same-origin application remain trusted.
Public entry/exit amounts, fee sources and timing remain observable. Browser
storage deletion, rollback, another device, compromised same-origin code and
physical memory erasure are outside the local journal/vault guarantees. This
integration does not establish full anonymity or absence of exploitable bugs.
