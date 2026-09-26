# Client security review — 2026-09-26

Initial audit: read-only review of the working tree captured at checkpoint `29db661`, not an audit of a deployed contract. The authorized defensive corrections below were implemented after that checkpoint; no deployment or real transaction was performed.

## Scope and evidence

All 17 files in `app/app/lib`, all five files in `app/lib/hak-bindings` (including its `.gitignore`), and `app/scripts/anchor-smoke.mjs` were read completely. The generated binding's 26 embedded XDR specs were decoded with the installed Stellar SDK and checked against its public interfaces. Security-relevant installed SDK assembly, signing, send/poll, simulation, and WebAuth paths were also inspected. Dependencies as a whole were not audited.

Exact file coverage, line counts, and SHA-256 snapshots are in `artifacts/security/2026-09-26/client/coverage.json`. CPU-only reproductions and results are in the same directory: `reproduce.cjs` and `reproduction-results.json`. The fixture uses synthetic local keys, mocked transports, and isolated in-memory storage; no real wallet, account, network transaction, or user storage was used.

The 15 existing targeted test files passed: **107/107 tests**. The five additional isolated reproduction assertions passed against the checkpoint, demonstrating gaps not covered by that green suite. They are historical failing-behavior fixtures; current defensive regressions are in app/tests and supersede running the old reproduction script against the fixed candidate. There was no browser, live wallet, production penetration test, native-GPU check, deployment, or contract mutation.

## Findings at the checkpoint

### C-01 — High: Pod bearer secret reaches the RPC before wallet approval

**Source:** `app/app/lib/hakClient.ts:1111–1118`; generated `claim_pod` binding and installed SDK assembly path. Contract mechanics are reviewed separately by the HAK reviewer.

The application passes the raw preimage to the generated `claim_pod` method before `submit`. The SDK constructs and simulates that call before invoking the wallet. Consequently, an RPC operator receives the bearer secret while the user's wallet approval is still pending. The contract permits independent recipient commitments; a one-ledger commitment delay does not protect against an observer who can delay the honest reveal, commit for its own recipient, and later claim.

The isolated client fixture uses the real generated binding and SDK assembly, intercepts the simulation payload, and verifies that the preimage and recipient are present with **zero wallet prompts and zero sendTransaction calls**. The independent HAK reviewer reported a native and compiled-WASM fixture where the observer recipient receives the Pod amount after such a delay. Those are local fixtures, not evidence of a live theft or a malicious configured RPC.

**Correction:** change the claim authorization model so a disclosed secret cannot authorize a different recipient. A genuine private proof must bind recipient and deployment/context cryptographically. Moving the current reveal later in the frontend is insufficient. Until the contract-level design is corrected, do not characterize the commit delay as protection against a delaying observer.

**Reachability:** the currently configured older kernel is reported incompatible by the frontend readiness gate. This finding applies to the reviewed v2 client/contract path; the audit did not submit it against production.

### C-02 — High impact, testnet currently: classic Ramp payments lack durable outcome recovery

**Source:** `app/app/lib/accountOps.ts:48–77`, especially `:76–77`; caller `app/app/components/app/RampPanel.tsx:256–270` and `:305`.

Classic anchor payments bypass the durable transaction-attempt mechanism used for contract actions. The signed transaction hash is known locally, but is neither persisted before transmission nor attached to a transport error. If Horizon accepts the payment and its response is lost, the UI reports an error without a recovery hash. Repeating the action loads a new account sequence and can pay the same registered withdrawal again. Even after an acknowledged success, the same payment button becomes available again because only `busy` and wallet availability disable it.

The isolated fixture uses the actual classic transaction construction. Its first mocked submission accepts the payment then loses the response; a second call produces a distinct hash and sequence with the same amount and memo. The first error contains no hash and the recovery store contains no attempt. Two mocked payments are observed.

**Correction:** persist nonsecret classic payment metadata and the locally computed hash before transport; bind the intent to the registered anchor withdrawal/account/network/asset/amount/memo; reconcile uncertain results before permitting a new payment. Preserve confirmed-payment state for that registration. Do not silently resubmit a newly sequenced payment. Account operations are currently testnet-only, so this is not evidence of a current mainnet loss.

### C-03 — Medium: a known local refusal becomes an indefinitely unresolved transaction

**Source:** `app/app/lib/hakClient.ts:871–874`, `:971–983`; `app/app/lib/transactionReceipts.ts:96–109`.

The send wrapper checks the wallet session before calling the transport. A changed session throws an ordinary error. The outer submit catch sees `tx.signed` and records an unknown outcome even though the wrapper definitively refused to broadcast. A later NOT_FOUND result intentionally remains unknown, so reconnecting the same account leaves the action blocked by recovery indefinitely.

The fixture changes the session just before the send wrapper. It verifies zero transport calls, an unknown persisted attempt, and refusal of a later retry after NOT_FOUND. This is a client availability/recovery defect, not a bypass of signing authorization.

**Correction:** classify all provably pre-transport refusals as `NotBroadcastError` (or equivalent structured outcome), including local session and missing-intent checks. Preserve conservative unknown handling for failures that can occur after transport starts.

### C-04 — Medium presentation integrity: valid nonzero transaction values are displayed as zero

**Source:** `app/app/lib/format.ts:24–31`; transaction action `app/app/components/app/FadePanel.tsx:812`; loaded-value examples `PodPanel.tsx:382`, `TriggerPanel.tsx:267`.

The default two-decimal formatter truncates valid seven-decimal amounts. `parseMinor('0.009')` produces 90,000 minor units but `formatMinor` returns `0.00`; the negative value returns `-0.00`. This formatter is used in the actionable Fade claim label, loaded Pod/Trigger amounts, and settlement summaries. The precise draft diagrams do not fix those later labels.

The isolated fixture confirms both positive and negative sub-cent truncation. The transaction itself retains the amount; the defect is the user's ability to assess the action and its result accurately.

**Correction:** use a precision-preserving amount formatter for transaction-relevant values, including a nonzero minimum significant precision and a clear policy for any explicitly abbreviated display. Keep input parsing and on-chain integer arithmetic unchanged.

### C-05 — Low, simulation accuracy: positive-price Fade seller proceeds omit the claimant payment

**Source:** `app/app/lib/hakClient.ts:470–479`; compared with `contracts/hak/src/fade.rs:251–252`.

The mock settlement assigns `sellerReceived = pot` for a positive price. The contract transfers both the claimant payment and the locked pot to the seller. A mock record with pot 100 and price 25 therefore displays seller proceeds of 100 instead of 125.

The local mock fixture confirms that exact mismatch. It affects simulation/explanation accuracy, not the contract's actual transfers.

**Correction:** report `pot + price` for that branch and add parity coverage for positive, zero, and negative settlement results.

## Additional bounded hardening observation

`anchor.ts:385–394` accepts `extra_info.payment_uri` without a runtime type/scheme or instruction-consistency check, and `RampPanel.tsx:306` renders it as an external action. This permits provider-controlled navigation that is not checked against the displayed withdrawal destination, amount, asset, or memo. Prefer validating the supported Stellar payment URI and matching those fields, or omitting this secondary link. No working script execution or browser exploit was demonstrated; the current CSP must not be represented as having been bypassed.

## Defensive correction checkpoint

C-01 through C-05 and the provider-URI observation are corrected in the local candidate. C-01 is addressed by the protocol V3 migration, which requires a fresh compatible contract deployment; this report does not claim an existing on-chain Pod has been migrated.

- Pod V3 creates a 32-byte CSPRNG seed locally, stores only its public claim key on-chain, and requires a proof of key possession bound to all creation terms. Claims sign purpose/network/deployment/Pod ID/recipient. The generated binding and actual installed SDK were used to capture both simulated calls: only public keys/proofs and claim signatures appear; neither raw nor textual seed is present, with zero wallet prompts or sends in the fixture. The JavaScript payloads and signatures match the independent public fixture byte-for-byte. Prepared/entered secrets clear on workspace close, wallet/session change, and unmount, while required backup acknowledgment remains. Amounts and addresses remain public; this is not confidentiality or anonymity. Old commitment APIs and mock state are removed; the mock store uses a new V3 namespace. Protocols 1 and 2 are incompatible.
- Classic withdrawal payments persist the locally calculated hash and allowlisted public terms before transport. The same account/network/anchor/withdrawal cannot be funded again while pending, unknown, or confirmed. Recovery queries that hash only; NOT_FOUND or a failed lookup does not permit repayment. Matching failed chain evidence releases the attempt. UI recovery survives remount/reload. Stored records exclude signed envelopes, credentials and bank account details. Signing requires Web Locks for same-intent coordination across tabs; browsers without that capability fail closed before signing.
- Both contract and classic recovery journals use immutable per-hash metadata and append-only outcome evidence, avoiding shared-array read/modify/write loss. Interleaved tab writes cannot drop an unrelated hash, and late uncertainty cannot downgrade terminal evidence. Corrupt/unreadable legacy or current storage blocks new transactions rather than silently filtering entries away. Legacy public contract receipts remain readable.
- Local session refusal and missing intent use the explicit not-broadcast path and no longer create unknown receipts.
- Transaction amount display preserves all seven significant decimals; a fractional value may still be padded to two decimals for readability.
- Mock positive-price seller proceeds include both pot and price.
- Provider-supplied payment URIs are not promoted by the adapter or rendered as alternate payment links.

Verification after these changes: **422/422 app tests across 31 files**, TypeScript, and targeted source lint passed. The defect reproductions and changed protocol expectations were observed failing before their corrections. Additional post-fix boundary coverage checks actual generated-SDK payloads, cross-language signatures, immutable journal interleaving, and lifecycle clearing. No browser/build/deploy was run by this reviewer. Public local storage remains user-clearable; these recovery controls do not replace server/contract idempotency or prove provider honesty. Classic trustline setup retains its existing flow; the duplicate-funding guard applies to registered anchor payments.

## Controls verified in source and targeted tests

- Wallet-returned XDR must retain the requested transaction hash and contain a signature from the expected account on the expected network. Wallet/account/session checks run around signing and before transmission. Test-secret signing is restricted to Stellar testnet, held in memory, revoked on disconnect, and legacy persisted secrets are removed.
- SEP-10 discovery requires an HTTPS origin, rejects redirected authentication transport, validates the SDK challenge and optional signing-key pin, binds tokens to signer/account/session/expiry, and does not persist the token. Arbitrary challenge memos and client-domain signing are not accepted by the current path.
- Signature payloads include action/domain separation, network hash, contract identity, and fixed-width record identifiers. Exact amount parsing permits at most seven decimal places and enforces i128 bounds.
- Contract writes recheck protocol readiness; incompatible or unavailable kernels cannot proceed through the current client. Existing Soroban recovery persists allowlisted public metadata before transport, blocks unresolved same-intent retries, and preserves terminal outcomes and known metadata against late responses.
- Ledger links are scoped to the current deployment; exports remain local records rather than proof that arbitrary local data happened on-chain. Generated venue identities remain session-scoped and indexed by public key; pasted venue secrets are not automatically saved.
- Inactive instrument polling is suspended and retained ledger values are marked not fresh until a successful refresh.

These controls and passing tests do not establish absence of vulnerabilities. Web Locks coordinate same-origin tabs, but clearing browser storage, another device, another origin, or another application can bypass local history. Global transaction idempotency is not claimed. Provider/RPC honesty is not guaranteed, and this review does not establish that a wallet's external confirmation UI adequately displays resource fees.

## Exact checkpoint-reviewed paths

| Path | Lines |
|---|---:|
| `app/app/lib/accountOps.ts` | 127 |
| `app/app/lib/anchor.ts` | 439 |
| `app/app/lib/client.ts` | 49 |
| `app/app/lib/config.ts` | 41 |
| `app/app/lib/errors.ts` | 75 |
| `app/app/lib/format.ts` | 58 |
| `app/app/lib/hakClient.ts` | 1249 |
| `app/app/lib/instrumentActivity.ts` | 5 |
| `app/app/lib/ledgerLog.ts` | 209 |
| `app/app/lib/signers.ts` | 95 |
| `app/app/lib/transactionReceipts.ts` | 111 |
| `app/app/lib/useLedger.ts` | 46 |
| `app/app/lib/useProtocolReadiness.ts` | 17 |
| `app/app/lib/useWallet.ts` | 121 |
| `app/app/lib/venueIdentity.ts` | 44 |
| `app/app/lib/wallet.ts` | 172 |
| `app/app/lib/walletsKit.ts` | 195 |
| `app/lib/hak-bindings/.gitignore` | 2 |
| `app/lib/hak-bindings/README.md` | 54 |
| `app/lib/hak-bindings/package.json` | 17 |
| `app/lib/hak-bindings/src/index.ts` | 339 |
| `app/lib/hak-bindings/tsconfig.json` | 98 |
| `app/scripts/anchor-smoke.mjs` | 7 |

Related test files fully read and run: `anchor.security.test.ts`, `client-recovery.test.ts`, `client-security.test.ts`, `ledger-clock.test.tsx`, `ledger-storage.test.ts`, `protocol-readiness.test.tsx`, `signing-security.test.ts`, `transaction-recovery.test.ts`, `venue-identity.test.ts`, `wallet.accountOps.test.ts`, `wallet.security.test.ts`, `wallet.useWallet.test.tsx`, `walletsKit.security.test.ts`, `record-recovery-ui.test.tsx`, and `recovery-ui.test.tsx`, all under `app/tests`.

Run from `app`: `npm test -- --run tests/anchor.security.test.ts tests/client-recovery.test.ts tests/client-security.test.ts tests/ledger-clock.test.tsx tests/ledger-storage.test.ts tests/protocol-readiness.test.tsx tests/signing-security.test.ts tests/transaction-recovery.test.ts tests/venue-identity.test.ts tests/wallet.accountOps.test.ts tests/wallet.security.test.ts tests/wallet.useWallet.test.tsx tests/walletsKit.security.test.ts tests/record-recovery-ui.test.tsx tests/recovery-ui.test.tsx`.

Historical checkpoint-only reproduction: `artifacts/security/2026-09-26/client/reproduce.cjs` and its saved results. The old script intentionally asserts the former defective behavior and is not a passing verification for the V3 candidate. Current additional regression files are `anchor-payment-recovery.test.ts`, `pod-credentials.test.ts`, `pod-rpc-payload.test.ts`; existing transaction/client/panel security regressions were extended. `recovery-fixture.ts` supplies only a test Web Locks boundary. New application files are `anchorPayments.ts` and `recoveryStorage.ts`, included in the final candidate type/lint/test checks.
