# Verification checkpoint

This record describes the development review on **27 September 2026**. The deployed runtime release is commit `a14dc5b628ad72f99c9d92a1abb7135a3965ca47`. The source snapshot also includes subsequent CI artifact-download diagnostics and release-verifier changes, identified in the [source manifest](../deployments/source-review-2026-09-27.json).

## Source review

| Evidence | Files | Current lines |
| --- | ---: | ---: |
| Exact current bytes with complete source-read evidence | 422 | 45,215 |
| Verified reviewed baseline plus completely reviewed differences | 96 | 19,941 |
| Total first-party authored scope | 518 | 65,156 |
| Unresolved files or line ranges at this snapshot | 0 | 0 |

The first row uses explicit complete reading ranges matched to each current file hash. It does not mean every file was read again when this manifest was generated. The second row is composed coverage: the previously reviewed baseline was checked against Git bytes, every difference was reviewed, and unchanged, changed and deleted ranges were reconciled. It is not a fresh full-file reread.

The manifest lists each file's relative path, SHA-256, line count and review method. The scope includes first-party implementation, tests, configuration, styles, handwritten API declarations, vector assets and database migrations. Generated bindings, prover constants, cryptographic parameters, proof fixtures, lockfiles, copied vendor code and dependency implementations are outside the authored totals. Ignored files, documentation, licenses and binary media are also excluded. The generated manifest excludes itself to avoid recursive hashing.

## Executed verification and limits

Source reading and executed tests are separate evidence. The [release overview](../README.md#what-is-verified) and [marketplace deployment record](../deployments/market-testnet.json) describe dated testnet transactions, observed balances and browser results. The deployed site's 99 checked files matched the reviewed build bytes. A final release check passed 34 HTTP checks and 14 UI checks with the original protocol ready and no captured JavaScript, console, request or CSP errors. That run used a test-only Node HTTP forwarding adapter with real live responses. Direct Chrome runs were interrupted by host network changes; an unmodified direct-browser clean run is not claimed. These results do not establish every possible wallet, asset or network scenario.

The marketplace browser run used a scripted wallet. Settlement used real RPC responses forwarded through a test HTTP adapter after host network changes interrupted Chrome. Settlement and Recovery confirmation were observed; the final assertion after reload failed because it assumed the wallet remained connected. It is not a passing reconnect or real wallet-extension test. Native XLM settlement does not establish actual USDC settlement or bank payout.

A separate read-only check passed three recovery and reconnect assertions with no signatures or new transaction. It used a seeded public journal record reconstructed from that confirmed settlement, actual chain reconciliation, a page reload and an explicit wallet reconnect through the scripted adapter. It did not restore the original browser profile and used the same test HTTP transport boundary.

At this checkpoint, hosted CI had stopped when the public proving-artifact download was refused. Updated diagnostics and an explicit publication origin retain HTTPS, redirect rejection and the exact reviewed artifact hashes. The focused fetch and packaging tests passed 14 checks, and a clean local acquisition verified all six files across 14 chunks. This does not establish a successful hosted rerun, so no all-green CI claim is made here.

This is an internal development review, **not an independent security audit**, a cryptographic soundness proof or a guarantee that no exploit exists. Private proving setup and trustee custody remain development arrangements. See [security boundaries](../SECURITY.md). Later source changes invalidate the corresponding manifest hashes and require review again.
