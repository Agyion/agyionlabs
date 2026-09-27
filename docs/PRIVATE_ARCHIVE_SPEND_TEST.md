# Spending the original restored private note

The original encrypted-backup note was successfully withdrawn after the [isolated archival and restoration test](PRIVATE_ARCHIVE_RESTORE_TEST.md). One transaction withdrew all **4,000,000** native-asset units. Included ledger metadata records pool custody and liability changing from 4,000,000 to zero, the destination receiving 4,000,000 within the operation, and the original input nullifier becoming spent. Authenticated recovery then returned zero unspent notes.

This separate checkpoint used the existing local fixture, payer, note and exact guarded WASM. It required no new key, pool, deposit or restoration. The earlier frozen archival evidence remains unchanged.

| Evidence | Result |
| --- | --- |
| Local pool | `CB7TNUV2R5VLGEQJXNGF5TGLLFVYBSFBGWGASGTWBRACRIIIBW6QZZBX` |
| Exact WASM SHA-256 | `4ead5defa386974742071212701f3bcb327fd0a1bc6bf14df2f97f08b11b5018` |
| Original note index | `0`; commitment `21432909793218552945951664689761364208151941778513570709665503959913220189542` |
| Withdrawal transaction | `fc2a5edfc7f595d5459382a4044d800613394678e08b4405d0c2290aa46cd06d` |
| Included ledger | `1054770`, raw RPC `SUCCESS`, XDR `txSuccess` |
| Before / readback heads | `1054769` / `1054772` |
| Liability and custody | Both `4000000` before; both `0` after |
| Persistent spent nullifier | `20fd7a949138b13c2ede552dd41671d24afb23e380289d242c6a2c62d824749a`, value `true` |
| Nullifier modified / live-until | `1054770` / `2108849` |
| Proof ledger window | `1054769` to `1054889` |
| Original / replay outer sequence | `343597383690` / `343597383691` |
| Second simulation | At head `1054772`: `Error(Contract, #9)` (`Spent`) |

The second simulation reused the exact original withdrawal operation and proof with a fresh outer account sequence and valid outer time bounds. The proof window remained valid, and the full withdrawal's zero output commitments left the input root, append root and next index unchanged. Thus the recorded rejection specifically exercises spent-nullifier protection. It is not a stale-root, expired-proof or bad-sequence result. The second attempt was never signed or submitted. The current recovered planner separately rejected another withdrawal with `INSUFFICIENT_PRIVATE_BALANCE`.

Before the one signature, the unsigned envelope was decoded and reviewed: one `submit` call, bridge kind 2, amount 4,000,000, destination the existing fixture payer, zero contract fee, no fee recipient, no extra authorization entries and no automatic-restoration entries. All nine prior persistent prerequisites were live.

An initial malformed planner command without a recipient failed before proving or signing. After that correction, the successful simulation exceeded the **10,000,000-stroop** provisional ceiling and was refused before signing. The earlier 1,000,000 ceiling was discussed only; it was not an executed refusal. The final envelope was reviewed against a **220,000,000-stroop** ceiling for this single local transaction: maximum fee **215,541,656**, included XDR fee charged **187,368,730**. These are valueless fixture fees, not public-network fee estimates or changes to application limits.

The observed restore lifetime of 128 ledgers was deliberately configured for this fixture: `minPersistentTTL=128`, `minTemporaryTTL=16`, `maxEntryTTL=1054080`. Actual ledger configuration readback confirms those values, plus `maxEntriesToArchive=1000`, `evictionScanSize=1000000` and `startingEvictionScanLevel=1`. A restoration at ledger 1054727 therefore expires at 1054854 (`ledger + 128 - 1`). The exact contract's maximum-TTL extensions still required the earlier large sequence advance to expire the original entries.

These settings were supplied at fixture boot through the pinned image's ordinary local `ConfigUpgradeSet` process: generated and included upload/deploy/config transactions, followed by the Core `/upgrades` selection of the uploaded configuration. No database row or individual TTL was edited. The retained `quickstart-start` implementation and `fixture-limits.json` document that setup. This separate withdrawal changed no network settings.

Runtime: `stellar/quickstart@sha256:427069406fbbe2ecd091f75d5a9c1e588ac3108875dec6ab6e0e2ac9f76c311e`, Core/RPC 28.0.1, CLI 28.0.0, SDK 16.3.0, Node 22.23.2. All traffic used loopback endpoints and the existing internal Docker network with no external peers. The earlier fixture-only sequence jump and process wall-clock shim remain explicit boundaries; host time and configuration were unchanged. The earlier positive-restore Core-history receipt and captive-RPC divergence remain documented separately. This withdrawal has its own successful raw RPC envelope, result and metadata receipt.

The ignored local evidence bundle is `artifacts/security/2026-09-27-compatibility/archive-local-ledger-57c6da2/post-restore-spend/`. Its `REPORT.md` and `public-evidence-manifest.json` describe and hash the public artifacts. `rpc-inclusion-raw.json`, `metadata-summary.json`, `replay-context.json`, `replay-simulation.json`, and `network-settings-decoded.json` support the claims above. These files require the retained local workspace bundle; they are not published repository files.

This is bounded local evidence that the original restored note remained spendable. It does not claim an application restoration workflow, a public-chain restoration or withdrawal, public-network fee behavior, or completion of the independent audit, setup or custody work. Protected fixture secrets and encrypted backups are excluded from the public evidence.
