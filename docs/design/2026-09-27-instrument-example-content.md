# Instrument examples: concrete actors, money and outcomes

27 September 2026. **Proposed teaching content, not active transactions or newly implemented features.** Read-only product/source review for `/instruments` and its six detail pages. Runtime code was not changed by this review. Preserve the black/orange visual identity and keep the current app outside this design change.

## Shared presentation rule

Lead with one recognizable situation and its participants. Show the item/service and amount before technical terms. Use three short beats: **set it up → meet the condition → see who receives what**. The failure branch should change the same scene and result, not open another explanatory wall of text.

Persistent demonstration label: **“Illustrative example · no funds move.”** Use **“test USDC”** in the shared environment label. Prices, exchange rates and ledger numbers below are explicitly invented teaching values; they are not live quotes or actual records.

Directory copy, one short example per row:

| Instrument | Plain-language function | Example line |
| --- | --- | --- |
| Fade | A price that falls until someone claims. | Claim a bakery's surplus box at 8 USDC. |
| Pod | Lock funds until a chosen time and a valid signature. | Save 200 USDC for your next laptop. |
| Trigger | Pay a named recipient when your chosen attester signs. | Release a designer's 150 USDC fee after approval. |
| Envoy | Let an agent claim eligible Fades for you. | Let your agent claim a free or rewarded pickup. |
| Ramp | Explore a local-currency exchange in the sandbox. | Follow an example 400 TRY deposit into test USDC. |
| Ledger | Keep and export your activity references. | Save the record of that 150 USDC design payment. |

These replace poetic summaries such as “Your key. Its own time.” as the main explanation. A short poetic line can remain secondary if it does not displace the example.

## Fade — the bakery's surplus box

**Actors and exact terms:** bakery = seller/venue; Maya = claimant; one surplus bread box. Seller pot **5 USDC**, starting price **12**, floor **4**. Example claim **8 USDC** while the illustrative curve descends **12 → 8 → 4**. This example has no negative branch: an ordinary markdown does not have to become free or pay the buyer. The current contract still requires a positive seller pot even with a positive floor.

Suggested visible copy:

- Title: **“The bakery closes. One box is left.”**
- Setup: **“The box starts at 12 USDC. Its price can fall to 4.”**
- Claim: **“Claim confirmed. Maya's price is fixed at 8 USDC. Nothing is paid yet.”**
- Successful pickup: **“Signed pickup confirmed. Maya pays the bakery 8 USDC.”**
- Failure: **“No pickup confirmed. After the window, a refund returns the bakery's pot. The listing stays closed.”**
- Compact boundary: **“Claim first. Payment follows a confirmed handoff.”**

Visual accounting must be exact: settlement transfers **8 Maya → bakery** and returns **5 pot → bakery**; returning the bakery's deposit is not another 5 of revenue. A no-show returns **5** only after a refund transaction. No money moves at claim; a later price change cannot improve the frozen claim. Show claim and pickup as separate beats. One successful claim wins; do not depict equal-chance allocation, first-click priority, automatic refunds or reopening after no-show. A physical box is merchant-managed inventory, not an on-chain inventory guarantee. Negative collection compensation is explained separately in the Envoy example.

Source: [Fade claim, settlement and refund](../../contracts/hak/src/fade.rs); [economic and allocation analysis](../product/2026-09-27-fade-use-cases-and-allocation.md).

## Pod — Maya's laptop fund

**Actors and exact terms:** Maya funds **200 USDC** and saves a fresh claim key; after illustrative unlock ledger **50,000**, that key signs for Maya's recipient wallet and the wallet authorizes the claim. Use “before unlock / unlock reached” in the main scene; the technical ledger number can sit in details. Self-saving avoids suggesting a fixed gift recipient, inheritance service or beneficiary recovery feature that the contract does not have.

Suggested visible copy:

- Title: **“200 USDC for your next laptop.”**
- Setup: **“Maya saves her claim key and locks 200 USDC.”**
- Early attempt: **“Too early. The 200 USDC stays locked.”**
- Missing authorization: **“Time is up. A valid claim-key signature and recipient-wallet approval are still required.”**
- Success: **“Maya signs for her wallet and submits the claim. 200 USDC is released.”**
- Compact boundary: **“Public record. Keep the claim key; there is no reset.”**

Do not animate a secret key travelling to the chain. The signature travels. Both the unlock condition and authorization matter; time alone does not pay. The claim key can select a recipient after unlock, so a copied key is not exclusive ownership. No early withdrawal, refund or lost-key recovery exists. Wallets and amounts remain public; the separate experimental private pool is not active in this app. Long locks also need storage maintenance/restoration. Do not promise an exact future calendar second from a ledger countdown.

Source: [Pod V3 creation/claim](../../contracts/hak/src/pod.rs), [security protocol](../../contracts/hak/SECURITY_PROTOCOL.md), [current Pod UI](../../app/app/components/app/PodPanel.tsx).

## Trigger — a designer's delivery payment

**Actors and exact terms:** Maya = client/funder, Noor = named designer/beneficiary, Sam = chosen reviewer/attester. Maya locks **150 USDC**. Sam's configured key signs the payout after reviewing the design. A valid attestation must be submitted on or before the configured deadline; if unpaid after it, a submitted refund returns **150** to Maya.

Suggested visible copy:

- Title: **“Noor delivers the design. Sam approves.”**
- Setup: **“Maya locks Noor's 150 USDC fee.”**
- Condition: **“Sam, the chosen reviewer, signs the approval.”**
- Success: **“Approval submitted before the deadline. Noor receives 150 USDC.”**
- Invalid signature: **“Wrong signature. The 150 USDC stays locked.”**
- Expiry: **“Still unpaid after the deadline? Submit a refund to Maya.”**
- Compact boundary: **“You trust the reviewer. The contract checks the signature.”**

The contract does not store/evaluate design quality, project terms or a general event predicate. The scenario is the parties' off-chain agreement interpreted by Sam. Do not show a file upload or green quality scan automatically releasing funds. No independent attester network, dispute arbitration or automatic refund is implemented. Payout and refund are alternative terminal outcomes, not sequential steps.

Source: [Trigger funding, attest and refund](../../contracts/hak/src/trigger.rs), [current attester UI](../../app/app/components/app/TriggerPanel.tsx).

## Envoy — Maya's pickup helper

**Actors and exact terms:** Maya = mandate owner; helper = agent key; bakery = Fade seller. This is a separate **surplus-crate collection task**, not the ordinary positive-price box sale on the Fade page. The bakery funds a **5 USDC pot** to cover collection compensation. Maya grants a mandate with a ledger expiry and the contract's **50-claim maximum**. The helper requests a **−2 USDC** Fade for Maya. The claim belongs to Maya; **2 USDC** is paid to Maya only after signed Fade handoff, with **3** returning to the bakery. The agent receives **0** from that payout. A **+3 USDC** Fade is rejected.

Suggested visible copy:

- Title: **“Your agent finds the pickup. You collect it.”**
- Setup: **“Maya authorizes a helper to claim eligible Fades.”**
- Accepted request: **“The −2 USDC claim is reserved for Maya.”**
- Later handoff: **“After signed pickup, Maya receives 2 USDC.”**
- Paid listing: **“This listing costs 3 USDC. The agent cannot buy it.”**
- Revoked: **“Revocation confirmed. New claims are blocked.”**
- Compact boundary: **“Zero or negative-price claims only · up to 50 per mandate.”**

Show permission **Maya → agent**, then request **agent → Fade**, then claim **Fade → Maya**. Keep reward movement in the later handoff beat. Do not show a wallet balance being delegated, a usable dollar allowance, arbitrary merchants/destination allowlists, AI judgment, or a hosted background service. The current runner only runs while its app view is active. A confirmed revocation does not undo a previously won claim. Other accounts/mandates can exist, so 50 is not a per-human or Sybil defense. Network fees are separate from the zero/negative purchase price.

Source: [Envoy's nonpositive-price restriction, fixed owner and limits](../../contracts/hak/src/envoy.rs), [limitations](../LIMITATIONS.md).

## Ramp — an illustrative TRY deposit

**Actors and exact terms:** Maya = test wallet user; mock anchor = external sandbox provider. Teaching quote: **400 TRY → 10 test USDC**, using an explicitly illustrative **40 TRY/USDC** rate and **0 example fee**. Do not fetch a live rate for this illustration or imply these numbers are the current provider quote. The real app must show the provider's actual returned quote, fees, instructions and status.

Suggested visible copy:

- Title: **“From a local amount to test USDC.”**
- Setup: **“Maya explores a 400 TRY deposit.”**
- Quote: **“Example quote: 400 TRY → 10 test USDC.”**
- Pending: **“Instructions received. The transfer is not complete.”**
- Example completion: **“The sandbox reports completion. This is still a test.”**
- Failure: **“No quote or status response? No completed transfer is confirmed.”**
- Compact boundary: **“Mock rate and bank leg. No real TRY moves.”**

Place the example rate/fee near the numbers, not hidden behind a tooltip. Display a request ID separately from a completed status. The mock anchor can fail or be unavailable; a local diagram cannot substitute for it. Do not show a genuine IBAN, KYC data, live exchange guarantee or automatic banking. For an optional withdrawal branch, the app registers a fixed test-USDC amount/memo, sends a separate testnet payment and checks status; its price endpoint does not currently supply a USDC-to-TRY estimate. Do not invent the reverse rate as a live quote.

Source: [RampPanel's sandbox notice, quote and status boundaries](../../app/app/components/app/RampPanel.tsx), [anchor integration](../../app/app/lib/anchor.ts).

## Ledger — the design payment's record

**Actors and exact terms:** Maya's browser records the **150 USDC** Trigger activity, its transaction reference, network/deployment and recorded status. Maya exports a Proof Pack. Noor can use the reference to check the corresponding transaction on the correct network. The landing example contains no genuine completed transaction.

Suggested visible copy:

- Title: **“Keep the record of Noor's 150 USDC payment.”**
- Record: **“Amount, recorded status and transaction reference.”**
- Export: **“Save a Proof Pack from this browser.”**
- Verify: **“Use the reference to check the actual transaction.”**
- Altered example: **“The amount changed. The saved checksum no longer matches.”**
- Missing reference: **“No transaction reference. Settlement cannot be checked from this row.”**
- Compact boundary: **“Local history. A matching checksum is not proof of payment.”**

Use recorded/confirmed/refunded wording only when it matches the shown evidence. A checksum checks consistency with the stored digest; someone can edit both content and checksum. A connected wallet does not automatically sign the export; supported test-key signing is optional. Do not claim tamper-proof records, legal proof, immutable local history, automatic chain validation or full parameter coverage. Clearing browser data can remove local records without undoing transactions. Showing a green checksum check must not turn a pending or absent chain outcome into “paid.”

Source: [LedgerEntry, export and optional signature](../../app/app/lib/ledgerLog.ts), [current Ledger panel](../../app/app/components/app/LedgerPanel.tsx).

## Content hazards in the current source

Current routes use `Instrument.tsx`, `Ramp.tsx`, `Ledger.tsx`, `DetailWorld.tsx` and `productNavigation.ts`. `pages/instruments-data.ts` is not imported by those routes and contains stale claims: general Envoy spending/allowlists, misleading Fade floor/seconds descriptions, a fixed Pod beneficiary and an unqualified 2035 promise. Do not resurrect that file as the new content source without correction.

The current mechanism diagrams also compress distinct steps. Fade's claim animation routes money as though the handoff were already complete; Envoy must distinguish a successful claim from its eventual reward; a Trigger signature establishes signer authorization, not independently proven delivery. The new story should make those boundaries visible through motion/state changes, with concise labels instead of additional paragraphs.
