# Verification checkpoint

This record describes the development review on **27 September 2026**. The website was subsequently published as Cloudflare version `2ec058c3-bd70-455e-afc2-5acbbd61b5c1`, including the wallet rejection correction described below. Its contract addresses and active code pins remain unchanged. The [source manifest](../deployments/source-review-2026-09-27.json) separates the website release from subsequent contract candidates and tooling.

## Source review

| Evidence | Files | Current lines |
| --- | ---: | ---: |
| Exact current bytes with complete source-read evidence | 437 | 46,190 |
| Verified reviewed baseline plus completely reviewed differences | 93 | 21,605 |
| Total first-party authored scope | 530 | 67,795 |
| Unresolved files or line ranges at this snapshot | 0 | 0 |

The first row uses explicit complete reading ranges matched to each current file hash. It does not mean every file was read again when this manifest was generated. The second row is composed coverage: the previously reviewed baseline was checked against Git bytes, every difference was reviewed, and unchanged, changed and deleted ranges were reconciled. It is not a fresh full-file reread.

The manifest lists each file's relative path, SHA-256, line count and review method. The scope includes first-party implementation, tests, configuration, styles, handwritten API declarations, vector assets and database migrations. Generated bindings, prover constants, cryptographic parameters, proof fixtures, lockfiles, copied vendor code and dependency implementations are outside the authored totals. Ignored files, documentation, licenses and binary media are also excluded. The generated manifest excludes itself to avoid recursive hashing.

## Executed verification and limits

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
