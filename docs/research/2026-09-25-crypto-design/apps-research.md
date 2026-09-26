# Crypto application UX research — Uniswap, Aave, Morpho, CoW Swap

Research date: **2026-09-25**. Read-only official website and documentation research for Agyion. No wallet was connected, no signature requested, no transaction submitted. No financial product ranking is implied.

Evidence labels: **H** = current HTML/text retrieval; **D** = official documentation describing a flow; **V** = personally inspected rendered browser state; **I** = Agyion design inference. V evidence now includes personally inspected desktop/mobile captures and the bounded interactions recorded below. Transaction progress remains D evidence; no connected-wallet state was exercised. Live rates and totals are deliberately omitted because they change.

## Current entry points and version boundaries

| Product | Entry observed through official pages | Evidence and limitation |
| --- | --- | --- |
| Uniswap | `uniswap.org` redirects to `app.uniswap.org`. | H/V. The rendered retry failed; no first-viewport judgment is made. [Official entry](https://uniswap.org/), [app](https://app.uniswap.org/). |
| Aave | Corporate homepage promotes a consumer iOS savings app, then Aave Pro. Pro links separately to the v3 app. | H. Treat Pro/v4, app.aave.com/v3 and the consumer app as distinct products. [Homepage](https://aave.com/), [Pro](https://pro.aave.com/). |
| Morpho | Homepage separates consumer vaults/markets, curator tools and infrastructure. App entry redirects to a vault list. | H. Different audience paths, not one universal landing-to-form flow. [Homepage](https://morpho.org/), [vaults](https://app.morpho.org/vaults). |
| CoW | Corporate entry and trading app are separate URLs. | H/V. Rendered homepage and disconnected app inspected; see the supplement. [Homepage](https://cow.fi/), [swap app](https://swap.cow.fi/). |

## Evidence ledger

Each source summary is deliberately short; derived text per source page remains under 130 words including its use in the comparison below. Labels refer to the method, not a quality score.

### Uniswap

**U1 — D, form hierarchy.** The screen guide separates sell/buy assets and amounts from expandable trade details. Details include fee, network cost, route, price impact and maximum slippage; the slippage explanation exposes minimum output. This is progressive disclosure of supporting data, not removal of transaction consequences. [Swap screen guide](https://support.uniswap.org/hc/en-us/articles/39862756339341-Uniswap-Web-App-The-Swap-Screen).

**U2 — D, selection and progress.** The web guide supports token search by name or contract address and amount entry in either direction. Review precedes wallet steps. Approval, message signing, transaction submission, pending and successful completion are described separately; completion offers an explorer link. These states were read, not exercised. [Web swap walkthrough](https://support.uniswap.org/hc/en-us/articles/8370549680909-How-to-swap-tokens-with-the-Uniswap-web-app).

**U3 — D, disconnected and mobile.** Connection starts through a wallet chooser. Mobile can open the wallet app and return to the website; desktop can use a QR code/link. Wallet dapp browsers are also supported. This documents handoff mechanics, not responsive form geometry. [Connect a wallet](https://support.uniswap.org/hc/en-us/articles/8121191796749-How-to-connect-a-wallet-to-the-Uniswap-web-app).

**U4 — D, pending/retry.** The pending guide asks users to check the explorer for broadcast state before acting. It distinguishes waiting, failure/resubmission and cancellation; cancellation can incur a network fee. This supports reconciliation before retry, not blindly repeating the original action. [Pending transaction guide](https://support.uniswap.org/hc/en-us/articles/7422909292813-My-transaction-has-been-pending-for-a-long-time-What-can-I-do).

**U5 — D, errors.** Failure explanations separate slippage, expired deadline, insufficient network-token balance and token incompatibility. Recovery depends on the cause. The UX lesson is specificity; raising tolerance is not a universal safe retry. [Transaction failure reasons](https://support.uniswap.org/hc/en-us/articles/8643975058829-Why-did-my-transaction-fail).

**U6 — D, loading.** Support documents refresh, another browser path and later retry for loading failures. The actual loading UI, timeout threshold and preservation of entered drafts were not verified. [App fails to load](https://support.uniswap.org/hc/en-us/articles/7425541255565-The-Uniswap-web-app-fails-to-load).

### Aave

**A1 — H/V, current Pro.** Dashboard/Activity are separate from Deposit/Borrow. Public exploration presents identity, yield, capacity and liquidity with chain/hub/market filters. The tested search narrowed rows, then exposed a recovery action for no matches. [Aave Pro deposit](https://pro.aave.com/explore/deposit).

**A2 — D, v3 supply flow.** The help page explicitly links app.aave.com. Users select assets from a balance/parameter table, can inspect reserve details, then encounter transfer approval and supply. Approval can be a paid transaction or a signature, while supply is a transaction. This describes the documented v3-facing route, not a verified Pro/v4 modal. [Supply tokens](https://aave.com/help/supplying/supply-tokens).

**A3 — D, v3 borrow preview.** The documented borrow flow includes available amount/rate selection, LTV, liquidation threshold and health-factor review before wallet confirmation, followed by continued position monitoring. It identifies a base-asset approval prerequisite. [Borrow tokens](https://aave.com/help/borrowing/borrow-tokens).

**A4 — D, risk meaning.** Health factor reflects collateral, liquidation threshold and debt; below one permits liquidation. The page explicitly avoids defining one universally safe value. A warning indicator therefore needs a threshold and a consequence, not an unexplained green ring. [Health factor and liquidations](https://aave.com/help/borrowing/liquidations).

**Aave limits.** Wallet, pending and retry flows were not tested. V3 help is not evidence of Pro/v4 confirmation behavior. Borrow navigation returned HTTP 503 during this session, so its resulting screen was not established.

### Morpho

**M1 — H/V, public comparison.** The disconnected vault list exposes identity, deposits, liquidity, exposure, curator and APY. Asset filtering opened grouped choices with search; a nonexistent query produced a captured loading skeleton, not a verified final empty state. [Current vault list](https://app.morpho.org/vaults).

**M2 — H, detail and honest absence.** A sampled vault has overview/allocation/performance/risk/activity sections, a deposit amount, network, MAX and Connect controls, projected earnings, and transaction references. The extracted risk section explicitly reports missing curator disclosure and missing ratings. Their absence is not silently converted into reassurance. Exact on-screen placement remains unverified. [Sample vault detail](https://app.morpho.org/robinhood-chain/vault/0xBeEff033F34C046626B8D0A041844C5d1A5409dd/steakhouse-usdg).

**M3 — D, contextual warnings.** Morpho documents a warning taxonomy and which warnings appear in its app, including low liquidity and configuration concerns. Interface slippage calculations protect asset/share conversions. Protocol capability, API warnings and displayed warnings are distinguished rather than assumed identical. [Morpho apps reference](https://docs.morpho.org/get-started/resources/app-ecosystem/).

**M4 — D, liquidity preview and recovery.** Vault liquidity is the currently withdrawable amount, with a breakdown. Temporary illiquidity can permit partial withdrawal; v2 may attempt forced deallocation. The help page says in-kind redemption changes exposure and is not currently offered by the app. A protocol exit mechanism must not be advertised as a one-click cash withdrawal. [Liquidity help](https://help.morpho.org/en/articles/14779745-morpho-vaults-and-available-liquidity).

**M5 — D, loading and wallet differences.** One help page addresses prolonged onchain-state loading with network/RPC/browser checks. Another documents wallet-dependent approval/signature flows, with a preference control for compatible accounts. Neither page proves the present UI retains a draft after an RPC failure. [Loading help](https://help.morpho.org/en/articles/12038037-morpho-app-is-not-loading), [signature preference](https://help.morpho.org/en/articles/13334672-onchain-offchain-signatures-toggle).

### CoW Swap

**C1 — D, familiar action and mobile wallet support.** CoW describes its interface as derived from Uniswap’s interaction model. Supported connections include injected wallets, Safe and WalletConnect-compatible mobile wallets. This establishes a connection route, not mobile layout quality. [CoW Swap overview](https://docs.cow.fi/cow-protocol/tutorials/cow-swap).

**C2 — D, review and submission.** A swap selects assets, resolves allowance, reviews quote/slippage and signs an order. Signing submits an intent that may settle later; it is not payment completion. Recent activity and an explorer track the result. Cancellation is a request with an execution race, even onchain. The guide’s default unlimited allowance is a permission tradeoff, not a pattern to copy indiscriminately. [Market order guide](https://docs.cow.fi/cow-protocol/tutorials/cow-swap/swap).

**C3 — D, price conditions.** Limit orders include price and validity. The documented order list distinguishes the user’s limit from the estimated execution level that also covers network fees. A partial fill may leave a remainder. Its proximity indicator is an estimate, not a promise that touching a number executes the trade. [Limit orders](https://docs.cow.fi/cow-protocol/tutorials/cow-swap/limit).

**C4 — D, progress taxonomy.** Explorer states distinguish open, filled, expired, cancelled, partially filled and pre-signing. Settlement links, actual execution price and filled quantity supply evidence behind the status. Expired is not equivalent to reverted; a partially filled order has already moved some funds. [Order details and states](https://docs.cow.fi/cow-protocol/tutorials/cow-explorer/order).

## Comparison for decisions

The following is a synthesis of the identified sources. It is not a claim that every state was tested in a connected wallet.

| UX dimension | Uniswap | Aave | Morpho | CoW Swap |
| --- | --- | --- | --- | --- |
| Primary task | Asset exchange (U1–2) | Deposit/borrow, then manage risk (A1–4) | Compare vaults/markets, then enter a position (M1–4) | Submit a bounded trade intent (C2–4) |
| Main input hierarchy | Two amounts/assets | Asset + amount + collateral consequence | Vault identity + amount + liquidity/risk | Assets + amount + execution condition |
| Before connection | Unavailable in this environment | Public asset exploration (V) | Public comparison (V) | Amounts and asset picker accessible (V) |
| Preview emphasis | Cost and minimum outcome | Borrow capacity and liquidation exposure | Returns alongside availability/configuration | Limit, execution estimate and validity |
| Pending meaning | Submitted transaction awaiting result | Not established for current Pro UI | Not established by sampled UI/docs | Signed order awaiting a fill |
| Error/retry | Cause-specific recovery; reconcile first | Current UI not established | Separate data-loading and liquidity cases | Track expiry/partial fills/cancellation request |
| Mobile | Wallet handoff documented; layout unavailable | Cards replace the desktop table (V) | Cards replace the desktop table (V) | Fullscreen picker; networks move above tokens (V) |
| Empty/unavailable | HTTP 409 on /swap (V) | No-results recovery seen (V) | Missing disclosure labels (H); search skeleton (V) | Quote gated by human verification (V); order-empty untested |

## Agyion mappings — proposed design, not competitor facts

These are **I**, grounded in the cited patterns and the existing Agyion contract/client semantics reviewed in this workspace.

1. **One physical scene, one obvious task.** Keep the space identity and flight. Once a workspace opens, make its main amount/action immediately readable. Do not convert the six instruments into six visually identical swap cards.
2. **Fade:** show the falling-price path and current claim price; distinguish claiming from signed-handoff settlement. A focused review should say who pays whom, when price freezes, and what happens if handoff expires. CoW’s conditional execution vocabulary is more useful here than copying a swap confirmation.
3. **Pod:** three concrete readiness conditions—saved secret, recipient commitment in an earlier confirmed ledger, unlock height—should directly control the next action. Keep the backup acknowledgment visible. A moving capsule is evidence of interaction, never evidence of an actual unlock.
4. **Trigger:** put amount, beneficiary and attester identity first. Preview payout-versus-refund branches with their deadline. A signature proves authority, not an external event; the wording should stay adjacent to review.
5. **Envoy:** visualize the real permission boundary: nonpositive Fade prices, claim-count limit, expiry and owner-bound recipient. Monetary caps should not imply a purchasing capability the contract rejects. Revoke remains pending until its transaction is confirmed.
6. **Ramp:** borrow the two-asset route and one primary request action. Keep quote freshness/cost only when obtained, then show the registered amount and exact memo in a separate payment review. Bank simulation, testnet tokens and unavailable anchor are different states.
7. **Ledger:** treat records as evidence with provenance. Show local entry status, recorded transaction hash and a verification link separately. Preserve unsigned-export disclosure. A checksum must not become a “verified settlement” badge.
8. **Mobile:** retain draft values during wallet app handoff and reopening. Place the primary action after the transaction-relevant preview; use normal scrolling for long details. Do not replace necessary conditions with hover-only labels. This is a proposed criterion, not an observed competitor guarantee.

## Negative examples and boundaries

- Do not copy a corporate homepage’s market-size claims or yield projections into Agyion without equivalent real data. Aave’s consumer/Pro split and Morpho’s business paths serve audiences Agyion does not currently have.
- Do not make “Connect wallet” the whole disconnected experience. Allow honest drafts and public explanations; gate only the actions that need authorization.
- Do not equate fewer clicks with permission safety. CoW’s documented broad allowance is a specific protocol tradeoff; Agyion should expose only its actual authorization.
- Do not animate a success mark merely because a signature was obtained. Signed, broadcast, accepted and settled are distinct where the real protocol distinguishes them.
- Do not translate no data into zero, or unavailable into empty. Show which datum is missing and a relevant read-only retry; preserve input.
- Do not borrow Aave’s health factor or Morpho’s APY decoration for instruments with no such quantity. Use their principle—meaningful before/after consequences—not the borrowed metric.
- Do not claim every reference is superior. The sampled Morpho detail is information-dense; the session encountered real loading/network failures; transaction-state UX was not personally exercised.

## Verified Agyion UI gaps — source review, 2026-09-25

These findings were checked against current local source, without wallet calls. They are not conclusions inferred from competitor styling.

| Finding | Exact current behavior | Missing UI / bounded correction |
| --- | --- | --- |
| **Fade error cannot be retried in place** | `doClaim`, `doConfirm` and `doRefund` set child `busy` before awaiting client work, but clear it only after success. Parent `run` catches and displays errors without clearing child state. The rendered buttons stay disabled after a rejected signature or failed RPC while the component remains mounted. [Actions](/home/apo110/agyion/app/app/components/app/FadePanel.tsx:653), [outer catch](/home/apo110/agyion/app/app/components/app/FadePanel.tsx:51). | Release the transient busy state on every outcome, while retaining a separate unresolved-transaction state when a broadcast hash exists. A safe retry needs to distinguish rejection from an unknown broadcast result. |
| **Ramp quote is not tied to the active transfer draft** | `quoteAmount`, `depAmount` and `wdAmount` are independent. Existing quote remains visible after amount edits and direction changes; its summary says “You send” even in withdrawal mode. No retrieval timestamp or stale marker is shown. [State](/home/apo110/agyion/app/app/components/app/RampPanel.tsx:70), [quote request](/home/apo110/agyion/app/app/components/app/RampPanel.tsx:169), [quote rendering](/home/apo110/agyion/app/app/components/app/RampPanel.tsx:287). | Label it as an independent TRY quote, or bind/invalidate it when the active draft changes. Distinguish quoted fee from total transaction cost. The actual withdrawal payment already uses its registered amount and exact memo; no incorrect transfer amount was found. |
| **No in-app review of the assembled transaction fee** | Form summaries preview drafts, then handlers call the client directly. The client delegates to `signAndSend`; it does not expose assembled fee/operation details as an application review stage. External wallets may review the transaction, but the test-secret signer signs immediately. [Client submission](/home/apo110/agyion/app/app/lib/hakClient.ts:916), [test signer](/home/apo110/agyion/app/app/lib/wallet.ts:95), [classic fee construction](/home/apo110/agyion/app/app/lib/accountOps.ts:62). | Present an exact recipient/asset/amount/fee summary after preparation and before signing, especially for the local test signer. This is a visibility gap, not a finding of unauthorized signing: the user presses an explicitly labeled action. Never invent a network fee while preparation is unavailable. |

Existing safeguards must survive any redesign: Pod blocks reuse after a submission attempt and asks the user to retain the secret if confirmation is uncertain; wallet/network changes are checked; confirmed receipts are recorded only after success. The configured kernel version guard may disable writes before signing. These safeguards were read in source, not proven through a production transaction.

The [workspace audit](agyion-audit.md) covers loss of unresolved receipt information on panel unmount and venue-key lifetime. That work should be integrated with the retry improvement rather than creating a second parallel receipt system.

## Rendered observation supplement — 2026-09-25

One isolated Chromium browser, serial pages, 1440×1000 desktop and 390×844 mobile. The parent capture set supplies additional initial mobile views. All images named below were personally inspected. [Capture inventory](/home/apo110/agyion/artifacts/research/2026-09-25-crypto-design/capture-report.json), [interaction log](/home/apo110/agyion/artifacts/research/2026-09-25-crypto-design/interactions/interactions.json). Browser closed after the bounded run. No performance or settlement conclusion follows from screenshots.

| Source | Observed composition and behavior | Evidence |
| --- | --- | --- |
| [Aave Pro](https://pro.aave.com/explore/deposit) | Dark sidebar/table desktop; compact header and labeled asset cards on mobile. Cookie controls obscure lower content. USDC filtering worked; the next unmatched search showed “Clear Filters.” | `aave-pro-1440-first.png`, `aave-pro-390-first.png`; interaction `filter-usdc` and `borrow` captures. |
| [Morpho](https://app.morpho.org/vaults) | Light table becomes labeled mobile cards. Desktop asset popover keeps the comparison visible. Typed vault search changes the URL; the 600ms capture shows placeholders. No final empty result was established. | `morpho-app-{1440,390}-first.png`; interactions `asset-filter-settled`, `filter-empty`. |
| [CoW Swap](https://swap.cow.fi/) | An announcement precedes the form. “Swap now” exposes two amount/asset rows. Token search works; desktop network sidebar becomes a mobile strip. Escape returns to the form. Quote retrieval hit a human-verification gate, which was left untouched. | Interactions `cow-swap-1440-{form,asset-picker,search-usdc,picker-closed}.png`, `cow-swap-390-{mobile-picker,mobile-picker-closed}.png`. |
| [Uniswap](https://app.uniswap.org/swap) | A normal official /swap load plus 15-second wait returned HTTP 409 with a packet-length error. The unavailable state is environmental evidence, not its interface design. | Interaction `uniswap-1440-direct-swap.png`; root captures also failed. |

The CoW search distinguished primary results from inactive-list imports. This is a useful identity/provenance pattern, not permission to import or trade a token. No token was selected or imported. The exact-role locator initially timed out; using the observed USDC text opened the picker. Both attempts remain in the raw log.

**Homepage contrast, V:** [Morpho](https://morpho.org/) uses a blue particle world and one central heading/CTA, while [CoW](https://cow.fi/) uses a bold pink/cyan illustrated identity. Their app work areas become restrained and task-oriented. This is a concrete reference for keeping Agyion’s space identity around a clear functional instrument. Evidence: `morpho-1440-first.png`, `cow-1440-first.png`. It does not mean their visual language should be copied.

**Capture timing limits:** filenames describe the requested action, not guaranteed completion. Aave’s `filter-empty` screenshot still contains pre-debounce rows; its subsequent `borrow` screenshot visibly contains the completed no-results state, while the URL remains Deposit. The Borrow request returned 503. Morpho’s `filter-empty` is explicitly a loading capture. These images are not evidence of a successful Borrow route or a final Morpho empty state.

**Runtime limits:** all console errors, request failures and HTTP failures remain in the raw interaction log. Uniswap returned 409; Aave Borrow returned 503; Morpho had network/data/telemetry failures; CoW had challenge and cross-chain-provider failures, including 401/410 responses. `ERR_NETWORK_CHANGED` affected several origins, so this environment cannot establish production reliability or assign all failures to product defects. No gate was bypassed. The observed pickers/filter behavior remains valid within those limits.

**Actionable inference:** preserve Agyion’s world as identity, but use a stable local reading surface for the active task. Expose the consequence and next legitimate action; place secondary explanation behind a clear affordance. For search, distinguish loading, no matches and unavailable. For signing, distinguish exact review, wallet request, broadcast uncertainty and confirmed outcome. The last group is documented/source-informed, not personally transacted in the reference apps.
