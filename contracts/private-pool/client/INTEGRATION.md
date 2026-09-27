# Private-pool application boundary

2026-09-27. The application source now connects this client through
[`app/app/lib/private/protocol.ts`](../../../app/app/lib/private/protocol.ts).
The path includes a public-call encoder, verified release/archive reader,
submission and revocation lifecycles, and a durable public transaction journal.
The published application selects the guarded CAI6 private pool for new funding
and retains the original CDSK profile for recovery. The
[compiled catalogue](../../../app/app/lib/private/release.ts) binds each policy
to its own exact manifest, committee, assets and backup scope. Its recovery-only
restriction is application policy, not a change to the original immutable
contract. Existing private notes and public Agyion balances are not migrated.
Witnesses and keys never belong in the transaction journal or RPC arguments. The
[coordinator guide](../../../app/app/lib/private/README.md) describes current
backup, credential, fee, cancellation and pending-recovery behavior.

## Included and checked

`bindings.ts` is the Stellar CLI TypeScript output from the original private-pool
WASM contract spec. Its low-level methods describe `submit`, `revoke`, `state`,
`config`, `record`, `record_id_at`, `revocation_at`, `spent` and deployment.
The guarded release preserves those existing interfaces and proof layouts;
these bindings do not claim to include its added `liability` getter or accounting
errors. The additive `liability.ts` reader checks the configured asset's persistent
counter, storage identity, lifetime and matching before/after checkpoint, and
names errors 20 through 23. A missing counter fails closed. This read alone does
not establish token custody or solvency, and the original pool has no such
counter.

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

## Implemented application boundaries

| Source | Current private path |
| --- | --- |
| `app/app/lib/private/release.ts` | Only compiled reviewed profiles can supply code, immutable configuration and DKG pins. Backup metadata can suggest an existing profile but cannot add or authenticate one. New funding uses guarded CAI6; original CDSK permits only existing-position recovery actions in the current coordinator. |
| `privacy/src/verifier.mjs`, `prover.mjs` | The historical research suite registry remains closed. The separate v2 adapter and browser worker load pinned real Groth16 artifacts. Trusted test hooks are not product inputs. |
| `app/app/lib/private/protocol.ts` | The coordinator recovers the full archive, prepares local witnesses and proofs, checks exact public signals and handles cancellation. Only public signals, proof and public addresses enter this contract adapter. A stale root requires explicit preparation again. |
| `app/app/lib/privateVault.ts`, `privacy/src/recovery.mjs` | Actual selected encrypted files are decrypted and compared before key access. Adding a grant invalidates the previous check. Recovery uses the pinned reader's complete counts and checkpoint. Scoped recipient credentials are separate saved files, not implicit contents of the complete vault backup. |
| `app/app/lib/private/wallet-session.ts` | The existing wallet is bound to its account, session and testnet network before and after signing. Explicit fee review precedes the wallet. Panels do not call generated `signAndSend()` directly. |
| `app/app/lib/private/pending-recovery.ts` | Account-wide pending records remain available while the vault is locked. Reconciliation uses the original profile and signed hash with no signing or sending capability. Unknown inclusion preserves the reservation; balances come from archive reconstruction. |
| `app/app/components/app/PrivateWorkspaceProvider.tsx`, `PrivateInstrumentPanel.tsx` | Pod, Trigger and Envoy share a scoped workspace and policy-specific controls. Profile or wallet changes retire old keys, credentials, proof work and fee approval. Public entry/exit and fee metadata remain visible. Fade remains public. |

Both compiled private profiles allow canonical native XLM and Circle testnet
USDC. The guarded profile's actual chain lifecycles and the narrower real wallet
test are recorded below. Authorization/disclosure remains an explicit trustee
workflow, not a wallet transaction or an automatic UI claim.

The client can backfill without an indexer using `state.record_count`,
`record_id_at(index)` and `record(id)`; revocation history has its own count and
`revocation_at(index)`. It must replay every ordered commitment/revocation and
validate the resulting roots against a fresh state from the selected pool. A
page of events without a completeness/root check is insufficient. In-range
missing entries are `ArchiveUnavailable`, not the end of history. Input roots may be historical; append and revocation roots must be
fresh. Tree races invalidate a proof and require explicit preparation again.
Archived persistent entries require restoration. No live archival restoration
workflow is implemented in this client or application. A missing read or an RPC
failure cannot become an unspent note or an empty pool.

## Release limits

The published application integrates the pinned releases, reader, wallet
lifecycle, journal, prover worker and encrypted vault recovery. On 27 September
2026, the [guarded-pool receipt](../../../deployments/private-pool-guarded-testnet.json)
recorded 15 included XLM transactions with 122 checks and 15 included Circle
testnet USDC transactions with 124 checks. Both runs covered Pod, Trigger and
Envoy roles, encrypted saved-file recovery, revocation and final withdrawals.
They used local CLI signing identities, not browser-wallet approvals.

The later [real Freighter receipt](../../../deployments/private-pool-freighter-testnet.json)
records eight checks and two included private transactions on the published
guarded-pool website: a 0.01 test XLM deposit and withdrawal. It verified actual
encrypted backup recovery, page reload, reconnect and reconciliation of the
original pending hash without resubmission. The direct browser run used an
outgoing transaction guard and retained network failures. It does not establish
extension-approved execution of every private instrument role. A subsequent
six-check cancellation-only run used the real extension against the corrected
local build and produced no signatures or broadcasts. Its publication was
verified separately in the [verification record](../../../docs/VERIFICATION.md).

Local synthetic tests, genuine browser storage/proof tests, scripted-wallet
checks, CLI chain lifecycles and actual extension approvals are separate evidence.
Live network archival restoration, hardware and real mobile-wallet proving remain
unverified. The single-operator development phase2 and custody of all five
trustee shares do not establish an independent production ceremony, independently
operated committee, legal identity/disclosure service, independent audit or
mainnet readiness. See the [resource and fee boundaries](../BUDGET.md).
