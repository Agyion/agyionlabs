# Private-pool application boundary

2026-09-26. This client is not enabled in the published application. It now
includes a public-call encoder, verified release/archive reader, wallet submission
lifecycle and durable public transaction journal. Actual native/WASM proof chains
have passed with source-pinned development keys. These components neither deploy
a pool nor migrate an existing HAK balance. Witnesses and keys never belong in
the transaction journal or RPC arguments.

## Included and checked

`bindings.ts` is the Stellar CLI TypeScript output from the actual private-pool
WASM contract spec. Its low-level methods describe `submit`, `revoke`, `state`,
`config`, `record`, `record_id_at`, `revocation_at`, `spent` and deployment.
Regeneration from the final pinned WASM was byte-identical to these bindings.

`prepareSubmit(publicInputs, proofHex, addresses)` converts exactly 157 canonical
bigint fields, a canonical 256-byte proof hex string, and the three public
addresses into the generated `submit` argument type. It snapshots input data,
keeps u64 values lossless, validates shape/window/nonce bounds, and includes only
the typed public transition and proof. The contract recomputes address IDs and
configuration fields; this encoder does not authenticate a pool or verify proofs.
`publicInputs` must come from the trusted local prover coordinator after its
exact-signal check, never from a server-supplied witness or an unchecked quote.

The test encodes these arguments through the generated SDK spec and decodes the
real XDR, checking all ciphertext fields, nullifiers, commitments, public addresses
and the maximum u64 amount. Its proof bytes are explicitly invalid encoding test
data, never an accepting verification fixture. `npm ci` installs the separately
locked client dependencies; `npm test` typechecks and runs the current encoder,
release/reader, journal and transaction-lifecycle tests. Actual browser storage
checks require their explicit opt-in and are recorded separately.

`release.ts` verifies a signed complete DKG under the trusted release roster and
derives the exact network/contract domain, assets, policy root and immutable
configuration. `reader.ts` checks actual WASM bytes, canonical ledger identities
and the complete accepted record. Recovery and disclosure finish with a fresh
matching checkpoint. See [READER.md](READER.md); RPC remains a trusted provider,
not an independently verified consensus proof.

`submission.ts` handles real SDK simulation/assembly, wallet session and payload
checks, an explicit fee budget and durable recording before the first send. It
looks up the locally signed hash and requires matching envelope/result/record
evidence. It does not auto-resend an uncertain attempt. `journal.ts` uses actual
IndexedDB atomic writes and Web Locks, with immutable public attempts and audited
reservations across tabs and reload. Storage deletion/rollback or hostile code on
the same origin remain outside this local guarantee.

## Minimum application work before enabling testnet funding

| Existing source | Required separate private path |
| --- | --- |
| `app/app/lib/config.ts`, `client.ts` | Supply a reviewed private-pool release profile to the implemented release verifier/reader, separate from HAK. Independently pin both VKs and local prover artifacts as well as deployed code, assets and DKG. No active profile is fabricated from test fixtures. |
| `privacy/src/verifier.mjs` | Keep its historical research suite registry closed. The real pinned v2 Groth16 adapter in `prover.mjs` is separate; returning true from an injected test callback must never activate the app. |
| `privacy/src/client.mjs`, `witness.mjs` | Run the actual prover in a local worker with pinned artifacts. Only public signals/proof cross into this contract adapter. Handle progress, cancellation, proving failures and stale append roots without auto-signing or auto-resubmission. |
| `privacy/src/vault.mjs`, `recovery.mjs` | Wire the implemented complete key vault and verified archive reconstruction into the app. Before deposit or a new grant, require saving the encrypted key file, reselecting that file and checking its full material. Note/draft backups alone do not replace the complete vault. Recovery must use a pinned trusted chain reader and its full snapshot/count checks. |
| `app/app/lib/wallet.ts`, `hakClient.ts` | Adapt the existing wallet/session to the implemented testnet submission lifecycle and same pinned RPC. Present the transaction facts and explicit fee cap before signing. Do not call generated `signAndSend()` directly from a panel. |
| `app/app/lib/transactionReceipts.ts`, `recoveryStorage.ts` | Render and reconcile the separate IndexedDB private journal, including pending entries recovered after reload. Unknown inclusion blocks duplicates; a known pre-broadcast refusal needs an explicit retry. Balance still comes from verified archive reconstruction, never a local success label. |
| `app/app/components/app/AppShell.tsx`, `PodPanel.tsx`, `TriggerPanel.tsx`, `EnvoyPanel.tsx` | Keep public HAK controls and public-data disclosures intact. Private notes have a separate balance, eligibility and recovery model. A private deposit must show its public token/amount/funder, public fee/destination if present, exact testnet pool and mandatory backup acknowledgement. Fade remains public. |

The application vertical slice is one asset: wallet deposit into a private
cash note, local encrypted backup, event/record scan, private transfer, reload
recovery, then withdrawal to a displayed public address. These proof/contract
branches now pass locally, including conditional instruments. Authorization/disclosure remains
an explicit trustee workflow, not a wallet transaction or an automatic UI claim.

The client can backfill without an indexer using `state.record_count`,
`record_id_at(index)` and `record(id)`; revocation history has its own count and
`revocation_at(index)`. It must replay every ordered commitment/revocation and
validate the resulting roots against a fresh state from the selected pool. A
page of events without a completeness/root check is insufficient. In-range
missing entries are `ArchiveUnavailable`, not the end of history. Input roots may be historical; append and revocation roots must be
fresh. Tree races invalidate a proof and require explicit preparation again.
Archived persistent entries require restoration; the client must not turn a
missing read or an RPC failure into an unspent note or an empty pool.

## Release limits

The current application has no deployed private-pool profile or connected private
funding UI. The separate reader, wallet lifecycle, journal, worker and key/archive
recovery modules are implemented; they are not imported into the published HAK
panels. Real proofs, actual local SDK signatures, synthetic RPC reconciliation and
actual browser storage tests do not establish live product integration. Full
native/WASM execution and rollback/resource checks are in `../RESOURCE_RESULTS.md`.
Network archival restoration, live signed submission/reconciliation and deployment
remain untested. A single-operator development phase2 and local
trustee tests do not establish independent ceremony security, a live committee,
legal authority, independent audit or mainnet readiness.
