# Verification checkpoint

This record describes the development review on **27 September 2026**. The current website is Cloudflare version `bcfa6538-0fac-449b-a0da-46c74c342770`, built from `598ab2f93134af88501967b7379b79434fef0315`. The guarded private pool is the default for new Pod, Trigger and Envoy flows. The original private profile remains accessible for recovery with its unchanged identity; the public kernel and marketplace pins are unchanged. The [source manifest](../deployments/source-review-2026-09-27.json) and [private testnet checkpoint](PRIVATE_POOL_GUARDED_TESTNET.md) separate source review, actual chain transactions, website publication and remaining limits.

## Source review

| Evidence | Files | Current lines |
| --- | ---: | ---: |
| Exact current bytes with complete source-read evidence | 454 | 48,250 |
| Verified reviewed baseline plus completely reviewed differences | 99 | 22,560 |
| Total first-party authored scope | 553 | 70,810 |
| Unresolved files or line ranges at this snapshot | 0 | 0 |

The first row uses explicit complete reading ranges matched to each current file hash. It does not mean every file was read again when this manifest was generated. The second row is composed coverage: the previously reviewed baseline was checked against Git bytes, every difference was reviewed, and unchanged, changed and deleted ranges were reconciled. It is not a fresh full-file reread.

The manifest lists each file's relative path, SHA-256, line count and review method. The scope includes first-party implementation, tests, configuration, styles, handwritten API declarations, vector assets and database migrations. Generated bindings, prover constants, cryptographic parameters, proof fixtures, geographic data, lockfiles, copied vendor code and dependency implementations are outside the authored totals. Ignored files, documentation, licenses and binary media are also excluded. The generated manifest excludes itself to avoid recursive hashing.

## Executed verification and limits

The current published release passed 34 HTTP checks, 14 UI checks covering all six instruments at desktop and mobile sizes, and nine real encrypted-vault recovery checks across both private profiles. All 103 public files, totaling 166,315,936 bytes, matched the local build. The complete local tree, including `_headers`, has SHA-256 `c3f189e85ac579536d805101a97914cb54f43903f1e71485fb2f02671426c6ea`. Direct Chrome checks captured no JavaScript, console, request or CSP errors. They used no network interception, wallet connection or transaction.

Earlier map checks against the preceding website passed eight assertions but captured two host network-change failures; a repeated map run captured three interrupted tile requests. Those diagnostics and the preceding website identity remain in the source manifest. The map source is unchanged in this private activation release; the prior map run is not relabeled as a new clean-network test.

Map verification covered an empty initial catalogue without global map tiles, local city lookup and selection, explicit browser location permission, three viewport widths, 44px controls, hide/reopen and instrument switching. Location tests used emulated coordinates, not a measured operator location. City queries stay local. OpenStreetMap still receives the IP address and viewed tile area after the map opens. The attributed GeoNames index covers 34,149 cities and larger towns, not every address or small settlement.

At the earlier map checkpoint, the local workspace run passed 1,247 tests with six default optional skips. Final focused reruns after the remaining refinements passed all 789 app tests, all 16 marketplace UI tests, and four header tests. The unchanged other suites plus those final reruns cover 1,251 passing checks; this is an aggregate of the recorded runs, not one final monolithic run. Three explicitly enabled private browser journal checks also passed, including source reservation across different private profiles and reload. They use synthetic records and do not establish a live cross-profile transaction. The earlier cryptographic and contract test checkpoints below remain separately dated.

Before guarded-pool activation, the compiled release catalogue permitted only the original verified private pool. Profile changes retire old vault capabilities and fee approvals; public pending recovery validates the original record without proving, signing or resending. Its transport and outer status lookup are bounded. Recovery-only funding restrictions are tested at preparation, proof and signing boundaries, and were then validated against both actual compiled profiles before publication. The additive liability reader is tested separately and is not pointed at the old pool, which has no liability counter. The guarded private pool subsequently completed its real private lifecycles and activation; public V4 remains undeployed. Fresh independent peer review, production setup and independently held trustee keys remain outstanding.

The subsequent private UI changes passed all 804 app tests, including recovery visibility without an available vault, blocked unknown profiles, selected assets, recovery-only controls and stale callback regressions. Type checking and the static build passed; lint retained three generation-counter cleanup warnings, one of them pre-existing. Those tests using synthetic second profiles established UI isolation; later actual second-pool evidence is described separately. Same-account pending refreshes now keep the newest result. Scoped encrypted downloads cannot finish in a replacement workspace. An initial file-input reset regression was reproduced and corrected before the final native-browser checks.

Six earlier checks against the preceding published website used a fresh unfunded local vault: creation, encrypted download, complete backup checking, wrong-password rejection, restoration and a locked reload. They used actual browser file selection and cryptography with no wallet connection, signature or transaction. No test password was observed in outgoing request bodies. Backup metadata only suggests an existing compiled pool; the unchanged authenticated restore checks the encrypted contents. Switching to another known pool clears the inputs and requires file reselection. Account-wide pending recovery remains accessible outside the selected-pool verification gate.

The [hosted run for ad58fed](https://github.com/Agyion/agyionlabs/actions/runs/36313392557) passed both application and contract jobs for the published private UI checkpoint. The [preceding run for b3858ea](https://github.com/Agyion/agyionlabs/actions/runs/36312265321) also passed. These exact commits do not establish hosted success for subsequent deployment tooling changes.

The first hosted deployment-tooling run caught a fixture setup error: the new tests assumed an existing ignored artifacts directory. An isolated source fixture with installed dependencies reproduced 16 failures, then passed all 22 focused tests after each helper created its own parent directory. All 97 tooling tests also passed locally. This correction changes test setup only; it does not change the deployment executor or deployed code. The [failed hosted run](https://github.com/Agyion/agyionlabs/actions/runs/36315479003) remains part of the evidence.

The corrected [hosted deployment-tooling run for 1a6effd](https://github.com/Agyion/agyionlabs/actions/runs/36316048453) passed both jobs. The subsequent preparation commit selected the guarded pool as the default and preserved the exact original manifest and committee for recovery only. Its local checks passed 806 app tests, 57 focused checks, type checking and a static build. Nine direct local browser checks used real encrypted fixture files for both profiles, including old backup recovery, explicit switching, wrong password rejection and a forged cross-pool scope that failed authenticated restoration. No wallet or chain transaction was used in those browser checks.

The general local release check initially failed because the catalogue accepts the production origin, not the local preview origin. A separate run routed only local application bytes at the production browser origin, retaining direct RPC traffic. It completed 34 HTTP and 14 UI assertions but retained two external mock-anchor network-change failures, so its overall status remains failed. Both endpoints separately returned HTTP 200 in a read-only diagnostic. This is prepared-source evidence, not a live publication or a clean-network claim. Native private lifecycle checks passed 122 assertions with 15 included transactions; scoped disclosure passed 13 checks. That paragraph records the earlier preparation checkpoint; the later completed activation follows.

The [exact hosted source run for 598ab2f](https://github.com/Agyion/agyionlabs/actions/runs/36317078829) passed both jobs before publication. The guarded pool completed 122 XLM checks and 124 USDC checks across 30 included transactions, with exact liability and custody reconciliation, encrypted saved-file recovery, replay rejection, revocation and an unchanged original pool checkpoint. Scoped disclosure passed 13 checks. These actual chain lifecycles used a dedicated CLI signer and locally held development trustee shares.

A fresh new-domain browser proof passed six additional checks using real testnet responses through a bounded HTTP test adapter after direct Chrome network changes interrupted the first attempt. A separate selector error in the test was diagnosed against the actual accessibility tree and corrected. The successful run generated and verified the proof, enforced a one XLM fee limit before wallet access, required explicit approval after raising the limit to ten, and handled a scripted wallet rejection with zero signatures or submissions. Its proof and preparation took 78,919 ms. It does not establish an actual wallet-extension private payment or direct-browser RPC reliability. The separate final live page and vault tests above used direct networking and passed without captured errors.

## Earlier verification checkpoints

Source reading and executed tests are separate evidence. The [release overview](../README.md#what-is-verified) and [marketplace deployment record](../deployments/market-testnet.json) describe dated testnet transactions, observed balances and browser results. After the wallet correction, all 99 published files, totaling 159,496,300 bytes, matched the reviewed build. Their manifest tree hash was `3e932f650e09a1c7b446a2a2447ede9252713b0a82713177aa9466acba5d0c97`. The unmodified production verifier passed 34 HTTP checks and 14 UI checks against the published domain, with the original protocol ready and no captured JavaScript, console, request or CSP errors. This later run used direct Chrome networking without an RPC adapter. It was read only and made no wallet requests or transactions. Earlier host network failures and the earlier adapter based check remain separate historical evidence; the later result does not retroactively remove them.

The marketplace browser run used a scripted wallet. Settlement used real RPC responses forwarded through a test HTTP adapter after host network changes interrupted Chrome. Settlement and Recovery confirmation were observed; the final assertion after reload failed because it assumed the wallet remained connected. It is not a passing reconnect or real wallet-extension test. Native XLM settlement does not establish USDC settlement. A later, separate [USDC marketplace run](USDC_TESTNET_VERIFICATION.md) used actual Circle testnet USDC and local signing identities. Neither run establishes a bank payout or private-pool USDC settlement.

A separate read-only check passed three recovery and reconnect assertions with no signatures or new transaction. It used a seeded public journal record reconstructed from that confirmed settlement, actual chain reconciliation, a page reload and an explicit wallet reconnect through the scripted adapter. It did not restore the original browser profile and used the same test HTTP transport boundary.

A later [actual Freighter extension test](FREIGHTER_TESTNET_VERIFICATION.md) used the published app and direct browser networking in a fresh isolated profile. Wrong-network rejection and cancellation preceded one explicit merchant-registration approval. The included envelope, account signature and fee were verified. Reload, explicit wallet reconnection and recovery used the same real journal from that transaction, without seeding it or sending again. This establishes that bounded registration flow, not every extension, payment, private proving or mobile scenario. Captured network diagnostics remain separate from the successful transaction assertions.

The first hosted run stopped when the public proving-artifact download was refused. Updated diagnostics and an explicit publication origin retain HTTPS, redirect rejection and the exact reviewed artifact hashes. The focused fetch and packaging tests passed 14 checks, and a clean local acquisition verified all six files across 14 chunks. The subsequent [hosted run for commit b6c5b1f](https://github.com/Agyion/agyionlabs/actions/runs/36299790861) passed both application and contract jobs, including the static production build, 1,166 workspace tests, one separate browser persistence test, 123 contract tests and the configured dependency scans. Six optional tests were skipped in the default workspace run; one of those browser tests then passed in its separate enabled step. This is a dated checkpoint, not a passing claim for later source changes.

A subsequent review reproduced a disclosure authorization timing defect: the request could expire while its encrypted response was being prepared, after the last trusted ledger check. The operator now checks again after encryption and before returning any delivery. Expiry or a failed ledger read leaves the durable first-use marker consumed and returns no response. Two regressions failed against the previous code, then passed with the correction; all 13 focused authorization tests and 150 privacy tests passed, with four optional privacy tests explicitly skipped. No circuit, proof parameter, contract or website behavior changed. This cannot revoke information already released or prevent later network delivery of an earlier valid response.

The reusable USDC verification helper also received an exclusive, durable phase claim. A two-process regression reproduced duplicate entry into the first RPC boundary; after the correction, only one process can proceed, including after an abrupt termination. Separate tests reproduced and fixed malformed private JSON fragments leaking through CLI diagnostics. All 69 tooling tests passed locally, with no network transactions in those regression tests. The helper defaults to a plan, restricts new test material to private ignored output, bounds testnet spending and never automatically retries an uncertain phase. Its published hardened bytes are distinct from the earlier live USDC harness.

The Freighter rejection follow-up reproduced the official extension's plain data
error at the actual Wallets Kit signing boundary. Only its exact documented
decline shape becomes a specific signature cancellation. Unknown errors remain
uncertain; raw supplied messages and getters are not evaluated or displayed.
Account and network changes after signing still reject. A cancellation-shaped
failure after broadcast preserves the original pending transaction and cannot
cause a second submission. These regression tests used the real adapter with
synthetic extension responses, not a new approved live extension transaction.

The resulting local workspace run passed 1,196 checks, with six optional cases
explicitly skipped. Separately enabled private browser persistence tests passed
three checks. Fresh preparation from the pinned public proving files and locked
local compiler passed all 47 checks across the four optional cryptographic
suites, including three freshly generated Groth16 proofs. Preparation verified
all six compiled output hashes and used neither setup secrets nor a new
ceremony. Those suites and private browser persistence are now explicit workflow
steps. A local pass alone does not establish a passing hosted run for these
workflow changes.

The new contract candidates subsequently passed 75 public kernel, 44 private pool
and 31 marketplace named Rust tests. The public and private candidates retain
separate exact legacy byte characterization tests. New guarded source is not
claimed to be present at the old active addresses. Fourteen local deployment
helper control flow tests also passed and are now included in the workflow.

The [issuer control review](TOKEN_ISSUER_RISKS.md) reproduced a conditional shared
backing shortfall using the exact active public and private WASM artifacts.
The active marketplace's aggregate reserve guard rejected the same class of
shortfall. Native and WASM tests also cover a missing classic trustline, partial
replacement of removed backing, and atomic reservation cleanup failure. These
local synthetic issuer tests did not modify live Circle balances or establish
that the old immutable contracts have been repaired.

This is an internal development review, **not an independent security audit**, a cryptographic soundness proof or a guarantee that no exploit exists. Private proving setup and trustee custody remain development arrangements. See [security boundaries](../SECURITY.md). Later source changes invalidate the corresponding manifest hashes and require review again.
