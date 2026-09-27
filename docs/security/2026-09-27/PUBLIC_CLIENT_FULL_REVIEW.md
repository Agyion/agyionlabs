# Public client review and deployment compatibility

Date: 27 September 2026. This is the public client portion of the user-authorized defensive review. It is an internal source review, not an independent security audit or a claim that exploits cannot exist.

## Coverage

Every line of the 33 runtime source files under `app/app/lib/` and `app/app/components/app/` was read, including rendering portions and both real/mock clients. The three tracked `anchor/` and `verifier/` files were also read; these folders contain documentation and sample configuration, not an implemented anchor or verifier service. The total is 36 files / 7,485 lines at this checkpoint. Exact ranges and SHA-256 pins are retained in `public-client-coverage.json`.

Generated bindings were inspected through their callers and actual binding payload tests; their full generated text is not counted in this report's totals. The subsequent [platform entry review](PLATFORM_ENTRY_REVIEW.md) records the complete generated source read. ABI parity is a separate parent review gate. Vendored WalletsKit review was delegated to the wallet-vendor reviewer. Third-party dependencies in `node_modules`, source outside these directories, contracts and the private profile are not counted as covered by this document. A file being read does not establish exhaustive execution coverage.

## Reproduced and repaired

1. **Deployment version alone was insufficient identity evidence.** An RPC fixture with a wrong network, wrong contract entry or unreviewed WASM still reported ready if `protocol_version()` returned 3. The public app now requires `NEXT_PUBLIC_HAK_WASM_HASH`. Readiness and every client write verify the configured network, exact requested instance key, returned contract address/key/type/durability, coherent ledger metadata, executable WASM hash, then V3. A wrong network/hash is incompatible; missing, malformed or unavailable evidence stays unavailable. This authenticates the configured deployment against RPC-reported state, not the RPC provider itself. The reusable SDK allows an omitted policy for separate callers; the public app does not.
2. **Ramp bypassed authentication expiry checks after its first action.** A component-level token shortcut skipped the authentication module's expiry/session logic indefinitely. Each explicit action now asks that module for a valid cached or renewed token. An authentication error clears the stale authenticated UI state. It does not automatically repeat a deposit, withdrawal or payment request. The regression supplies a new token for the second action and verifies it reaches the withdrawal API.
3. **An unrelated anchor transfer could be displayed as the requested transfer's result.** The status client previously accepted another transfer ID and even substituted the requested ID for a missing response ID. It now requires an object carrying the exact requested ID and a nonempty status. An unrelated completed transaction cannot be relabelled as the selected transfer. This fix does not independently verify a provider's bank settlement claim.
4. **Classic asset and contract asset configuration could disagree.** The public factory previously accepted a different Ramp issuer/code/network and an unrelated instrument SAC under one currency label. It now derives `Asset(code, issuer).contractId(network)` and requires exact equality with the configured token contract. The existing Circle testnet USDC default derives to the existing configured SAC; no asset was changed.
5. **Fade's pasted venue secret was shown as ordinary text.** Its input now uses a password field, disables autocomplete and spellcheck. Explicit generated-key reveal/export remains deliberate. Masking is a display control, not protection from same-origin JavaScript.

6. **The app advertised wallets that its own verification necessarily rejected.** The actual retained modal initially listed Freighter, xBull and LOBSTR; WalletConnect was also conditionally offered. The retained xBull/LOBSTR/WalletConnect adapters cannot report the active network. The application factory now offers only Freighter, keeping all before/after network/account/signature checks. Unsupported adapters remain in the vendor package for provenance but are not app options; setting a WalletConnect project ID does not enable an unverified adapter. This fixes false availability, not a stolen-funds exploit.

7. **Release diagnostics lost their status element once the protocol became ready.** The ready state intentionally renders no warning banner, but browser verification had tried to read that banner as its readiness signal. The stable AppShell main now carries `data-protocol-readiness={readiness.status}`. This adds no visible control, text or authorization path. Tests retain the real readiness hook and status component, checking pending-to-ready/unavailable/incompatible transitions, a missing client, absent ready banner and closed workspace.

## Verified existing boundaries

- Wallet adapters check the account and network before and after approval. Signed envelopes must match the requested transaction hash and contain a valid signature for the expected signer/network. Session replacement invalidates stale clients. SEP-10 validates the discovered signing key, origin, network, challenge operation scope and account before requesting a signature.
- Public recovery metadata is persisted before broadcast, and matching action locks coordinate supported browser tabs. Unknown outcomes and confirmed creations without an ID remain blocked. Neither missing RPC results nor a signed hash alone count as failure. Completed receipt recovery preserves the signed hash and matching deployment scope. Browser/device storage is not global idempotency.
- Real-client record reads and direct by-ID actions check the configured token identity. Pod seeds sign locally and the generated binding payload tests do not find seeds in create/claim RPC arguments. Public Pod amounts, funder and destination metadata are still public; this is not the experimental private pool.
- Fade prices freeze at the claimed ledger, with record recovery checks before enrichment. Local histories and Proof Packs remain explicitly distinct from chain verification. Envoy's local runner stops on hiding/permission loss and prevents concurrent attempts; an already sent transaction cannot be cancelled by stopping the panel.

## Verification evidence

Logs are under `artifacts/security/2026-09-27-compatibility/client/`.

- `anchor-red.log`: 4 new failures, 121 passes against the prior implementation.
- `identity-red.log`: all 12 new identity cases failed against the prior implementation.
- `asset-config-red.log`: 4 new configuration failures, 6 passes before the asset consistency check.
- `identity-anchor-green.log`: 168 focused checks passed after identity/anchor fixes, including corrected typed SDK response fixtures.
- `asset-config-green.log`: 41 asset configuration and policy checks passed.
- `wallet-options-red.log`: the actual modal regression failed, with 8 earlier tests passing, before the factory filter. `wallet-options-green.log`: all 20 targeted wallet checks passed afterwards.
- `app-tests.log`: 652 tests passed across 39 files after the coordinated vendor changes settled; no failures/skips reported. This is a local suite, not 652 real-network operations.
- `typecheck.log`: passed after removing a duplicate property in one newly extended test configuration. Its value and runtime behavior did not change; the fresh `final-asset-fixture.log` confirms all 31 tests in that file passed.
- `lint.log`: passed with no ESLint warnings/errors. The tool printed its existing Next lint CLI deprecation notice.
- `readiness-attribute-red.log`: all four new root-diagnostic cases failed on the missing attribute while eight earlier shell tests passed. `readiness-attribute-green.log`: all 18 shell/recovery checks passed after the one-attribute change.
- `app-tests-final-readiness.log`: final full app suite **656 passed across 39 files**, zero failures/skips. `typecheck-final-readiness.log`: passed. These supersede the earlier 652-test checkpoint; the runs must not be added together.

`public-client-evidence.json` retains the log hashes and source coverage hash. Production build, actual SDK/RPC readiness and deployed contract flows belong to the parent integration report.

An intermediate typecheck caught the raw RPC `xdr` versus installed SDK parsed `val` distinction in the new identity check. Source and fixtures were corrected to `rpc.Api.LedgerEntryResult`; the fixture also follows the SDK's string protocol version. The earlier mocked green run was not treated as evidence of live RPC compatibility. Parent verification must exercise the actual deployed kernel through the installed SDK.

No wallet was connected, no transaction was signed or submitted, no contract or website was deployed, and no shared `app/site` rebuild was performed by this reviewer. Parent integration/deployment evidence must be consulted separately.

## Remaining boundaries

- Trusted RPC/anchor responses still require provider trust. The WASM pin is not an independent ledger proof, and a version/hash check does not make a compromised browser or provider safe.
- Demo venue, attester and agent keys remain accessible to same-origin JavaScript and some remain in session storage. They are not production hardware-backed custody. Pod draft clearing, masked fields and CSP do not eliminate this trust boundary.
- No real-wallet/browser/phone settlement, token issuer freeze/clawback, network outage across actual nodes or real fiat payout was established by mocked tests. The current public application uses testnet USDC; a parent XLM contract smoke flow is a separate asset-specific observation.
- Public Pod/Trigger/Envoy are not upgraded to private-pool behavior by these frontend checks. Independent setup/trustee custody, private-client integration and private activation gates remain separate.
- Local storage loss, browser extensions, wallet implementation vulnerabilities and provider correctness are not covered by a no-exploit assertion. Any remaining whole-repository review gaps must stay visible in the parent inventory.
