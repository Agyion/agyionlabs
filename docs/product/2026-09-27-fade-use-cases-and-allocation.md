# Fade: real-world use cases, waiting incentives and allocation

Research date: **27 September 2026**. Source checkpoint: `f5926b305f16715a2c5ab9d75bf862e3db4452d1`. This is a product and protocol analysis, not a deployment, legal opinion, market-validation result or implemented allocation change. Source observations below refer to the local V3 kernel; historical deployments do not inherit them. External primary sources were checked on the research date; their policies may change.

## Recommendation

Treat Fade as **two related markets with different economics**:

1. **A markdown sale:** the buyer pays for useful, scarce stock. Use a positive or zero floor. A bakery does not generally need to pay someone to consume one simit.
2. **A collection/service offer:** the merchant pays someone who removes a measurable cost or performs a necessary task. A negative price can make sense for collecting a bulky surplus batch, returning packaging or relocating an asset.

Negative pricing should be an explicit, capped merchant choice, not the inevitable ending of every listing. Waiting is rational when remaining availability is high and prices predictably fall. No interface can repair that incentive by itself. The first pilot should test a small, fixed-site markdown sale with a nonnegative floor. Negative-price collection should be a separate controlled experiment after claim abuse, custody and dispute rules are designed.

For allocation, the current contract guarantees **at most one successful claimant**, not that the first person to click wins or that ten people get equal chances. Keep this distinction explicit. If latency-neutral access is required, add a new, enforceable allocation protocol; a front-end queue alone cannot restrict the public claim entry point.

## What the current contract actually does

Sources: [Fade implementation](../../contracts/hak/src/fade.rs), [Envoy implementation](../../contracts/hak/src/envoy.rs), [V3 security protocol](../../contracts/hak/SECURITY_PROTOCOL.md), [limitations](../LIMITATIONS.md). The historical [SPEC](../../SPEC.md) is explicitly superseded.

| Stage | Present behavior | Consequence for a physical transaction |
| --- | --- | --- |
| Create | Seller escrows a strictly positive pot; floor cannot be below `-pot`; price decreases by ledger according to the immutable curve. | Negative compensation has a funding ceiling. A positive-only sale still locks a seller pot; zero-pot sale creation is not currently supported. |
| Claim | Claimant authorization, open state and deadline are checked. Claim writes one claimant and claim ledger. | **No buyer payment or reservation bond is collected.** Even an account without the eventual positive-price payment can occupy the listing. |
| Price | Settlement uses the claim ledger. | Waiting after a confirmed claim does not improve the claimant's price. |
| Positive handoff | A venue signature plus claimant-authorized token payment moves the frozen price from buyer to seller; the seller recovers its pot. | The earlier claim is not prepaid. Balance, token authorization or a missing signature can still prevent payment at pickup. |
| Negative handoff | A venue signature releases the frozen compensation from the pot to the claimant; any remainder returns to the seller. | The venue can attest; the contract cannot observe whether collection occurred or was satisfactory. |
| No handoff | After the claim window, a submitted refund returns the seller's pot. | The listing becomes terminal. There is no automatic reopening, replacement claimant, cancellation or no-show penalty. Refunding money does not recover a spoiled item or a missed sale. |
| Inventory | One record permits one claim. | There is no quantity-aware inventory book, physical-item identifier, store-stock integration or protection against representing one physical item in multiple listings. |
| Envoy | An authorized agent can claim nonpositive listings for its owner, with a per-mandate count limit. | Automation already participates in the same public competition. Multiple wallets/mandates are not limited to one human. |

**Economic abuse requiring a protocol decision:** a claimant can occupy scarce stock for transaction costs without a performance stake. Repeating this across listings can deny legitimate sales without stealing the escrow. This is a griefing and availability problem, not evidence that two claimants can both spend the same pot. Merely increasing gas, shortening all collection windows or hiding the public endpoint would not resolve it safely.

## Why claim before the price turns negative?

Our economic reasoning, not measured user behavior: a buyer weighs the surplus from taking the item now against the expected surplus of waiting, including the possibility that someone else takes it. A simple comparison is:

```
now:     value_now - price_now - pickup_cost_now
wait:    availability_probability × (value_later - price_later - pickup_cost_later)
         - waiting_cost
```

This intentionally simplified model excludes risk aversion and outside options. It shows why the answer cannot be “everyone will buy early.” Illustrative units: value 7, pickup cost 2, price now 3, later price -1, waiting cost 0.3. Buying now yields 2. If later availability is 35%, waiting yields 1.8; at 95%, waiting yields 5.4. The probabilities are examples, not estimates. An empty marketplace makes waiting more attractive; real scarcity, convenient pickup and quality loss can make earlier purchase attractive. Inventing stock counters or fake urgency is not a remedy.

For the seller, compensation should be bounded by the **avoidable cost of the alternative**, after collection verification and platform costs. A carrier earning 8 to remove a batch that would otherwise cost 15 to handle can create value. Paying 8 to a buyer who would already have collected it for free may just spend margin. Reputation or environmental benefits can matter, but should not be treated as cash savings without evidence.

Product rules to test, not implemented guarantees:

- Separate consumer markdown listings from collection-service listings in the terms and economics.
- Choose the floor per lot from measured alternatives; allow a strictly positive floor.
- Do not subsidize ordinary popular inventory by default. Ring-fence any experimental subsidy and identify its funder.
- Test fixed markdowns as the control group. A descending curve is useful only if it improves completed pickups and net merchant outcome.
- If the same customers learn to wait every day, vary the operational offer because inventory/collection needs changed, not by misleading users about the committed curve.
- A sponsor-funded reward creates additional merchant/collector collusion risk: fake surplus, duplicate lots and sham handoffs must be checked before paying external subsidies.

## Ten requests at the same time: what can be promised?

**Network facts.** Stellar agrees a transaction set and computes an application order; it does not globally timestamp human clicks. Execution can fail after submission and included failed transactions may still consume fees. [Stellar transaction lifecycle](https://developers.stellar.org/docs/learn/fundamentals/transactions/transaction-lifecycle).

Inclusion and execution order are different. Under congestion, inclusion-fee bids influence which transactions enter the ledger. Soroban has resource fees and resource-capacity competition distinct from classic transactions. The documentation's classic 1,000-operation example is not a Soroban Fade throughput or fairness guarantee. Higher fees cannot be described as a guarantee of first execution among already included Fade claims. [Stellar fees and resource limits](https://developers.stellar.org/docs/learn/fundamentals/fees-resource-limits-metering).

Protocol 23's final CAP-0063 defines Soroban stages/clusters and an application comparison key derived from the transaction-envelope hash XOR the transaction-set hash. Conflicting read/write footprints cannot be placed in independent clusters within one stage. Results must match the defined application order. Ten claims writing the same Fade therefore do not produce ten independent winning states. The protocol's ordering uncertainty is **not** a one-human-one-ticket lottery; membership, inclusion and timing still matter. No current network capacity or configuration was measured in this review. [CAP-0063](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0063.md).

**Application result.** Suppose ten distinct, authorized claim transactions target one open listing:

1. Each can see an open record while preparing/simulating. That is not a reservation.
2. Propagation, wallet approval and fee/resource constraints can put them into different ledgers. A slower device can miss the relevant ledger entirely.
3. The first valid applied claim changes open to claimed. Any later applied claim sees a non-open record and fails. If none executes validly before expiry, there is no winner.
4. All claims applied in the same ledger would evaluate the same price curve point, but only the successful claim fixes the record. Different-ledger inclusion can change that price.
5. A user should act on confirmed state and the recorded claimant, not a spinner, simulation success or RPC acknowledgement. `sendTransaction` may only enqueue a transaction and return `PENDING`. [Official RPC method](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/sendTransaction).

**Honest user-facing wording:** “A claim is reserved only after network confirmation. Another request may succeed first.” Avoid “first click wins,” “fastest internet wins,” “highest fee wins,” “equal chance” and “no fee when you lose” as unconditional claims. A simulation might reject a losing request before submission, while an already included losing attempt has different fee consequences.

Minimum verification scenarios for this behavior: ten different claimants with permuted application order; same and different ledgers; expiry boundaries; stale simulation; lost confirmation; one bot using many accounts; failed positive settlement; venue unavailable; no-show refund; attempted replacement claim. A host test that executes ten calls sequentially can prove the state invariant; it cannot measure production latency or prove network fairness. A network test must report RPCs, ledger placement, fees, protocol/configuration and complete receipts separately.

## Concrete use-case matrix

All rows are **candidate hypotheses**, not existing partnerships or validated demand. Positive means claimant pays merchant; negative means merchant pot pays claimant after signed handoff. Each current Fade represents one indivisible lot. “Needs new protocol” means more than relabeling the existing UI.

| Candidate | Who pays; when negative is rational | Reason to act early / temptation to wait | Scarcity and physical verification | Fit and missing constraints |
| --- | --- | --- | --- | --- |
| 1. Bakery closing-time bag | Buyer pays a discounted price. Negative usually unjustified for a normal small bag. | A known desirable bag may sell out; predictable ample leftovers encourage waiting. | Count sealed bags; staffed collection; allergen and safe-sale cutoff. | Best initial markdown candidate; nonnegative floor, no-show handling and accurate stock still needed. |
| 2. Café prepared lunch portions | Buyer pays; negative only for a separate batch collection obligation. | Lunch utility decays; a late cheap meal may no longer be useful. | Portion count, temperature, fixed collection end; venue check. | Possible later food pilot; short windows amplify signing/transport friction. |
| 3. Supermarket near-date groceries | Buyer pays; a collection contractor could instead receive a distinct handling fee. | Specific high-value products can disappear; interchangeable abundant stock invites waiting. | SKU, quantity, package condition and expiry/date rules. | Needs stock synchronization and removal/recall handling; do not blend consumer sale with waste-service fee. |
| 4. Flower shop unsold bouquets | Buyer pays; small negative may cover scheduled bulk removal, not every bouquet. | Gift occasion and quality create time value; some shoppers will wait until closing. | One photographed lot, deterioration disclosure, staffed handoff. | Useful nonfood markdown comparator; condition disputes remain. |
| 5. Farm produce surplus crates | Buyer pays usable crates; grower may pay collection when sorting/removal costs dominate. | Harvest/collection slot and grade; bulk buyers may coordinate to wait. | Crate count/weight, quality grade, truck capacity, pickup location. | B2B candidate; partial quantity and weight adjustment need new settlement terms. |
| 6. Event catering surplus batch | Collector may be paid for safe collection/redistribution; individual diners should not receive an unexplained subsidy. | Access window closes; logistics capacity matters more than click speed. | Trained recipient, collection slot, cold chain, actual batch availability. | Needs eligibility and exception procedures; current single venue signature is insufficient operational assurance. |
| 7. Returnable crates or pallets | Business pays collector for verified returns; buyer may pay for reusable surplus. | Storage congestion/vehicle schedule vs incentive to wait for larger bounty. | Serial/lot identifiers, custody and return count. | Strong negative-price research case; multi-stop/partial completion and duplicate claims need a new model. |
| 8. Office furniture clearance | Recipient pays for useful items or owner pays for timely removal. | Unique useful furniture versus waiting for clearance deadline. | Ownership, dimensions, access, removal labor, damage checks. | Good economic fit, but risky first pilot: injury/property damage and removal dispute are not solved by a signature. |
| 9. Construction offcuts/material surplus | Receiver pays reusable material; owner pays removal if lawful handling costs dominate. | Project need and lot scarcity; buyers may wait if owner must clear site. | Material specification, weight, contamination, licensed handling where applicable. | Defer hazardous/regulated material; blanket “waste marketplace” claims are inappropriate. |
| 10. Nonhazardous packaging collection | Business pays collector for a defined batch. | Pickup route opportunity and loading window; bounty waiting can make routes unreliable. | Weight/volume and actual transfer; no duplicate invoice. | Plausible controlled negative pilot later; recipient qualification and unit economics must be measured. |
| 11. Shared-bike / equipment relocation | Operator pays for confirmed relocation; no sensible consumer purchase price is necessary. | Limited valid tasks and route efficiency; rising bounty may cause strategic neglect. | Unique asset ID, destination, condition and trusted location proof. | Needs destination attestation and task cancellation; current single pickup handoff is not enough. |
| 12. Parcel return / reverse logistics | Merchant pays courier for return completion. | Route matching and collection deadline; waiting competes with service-level obligations. | Parcel custody through delivery, receiver signature, loss/damage. | Needs multi-stage custody and disputes; out of scope for current Fade. |
| 13. Last-minute appointment | Customer pays a markdown; paying the customer rarely covers a real disposal cost. | Time slot expires and personal schedule matters. | Service provider capacity and attendance; cancellation/refund rights. | Nonnegative-only exploratory use; service completion differs from a simple object handoff. |
| 14. Hotel room / event seat | Customer pays; negative normally a separate marketing campaign, not inventory disposal. | Scarce preferred room/seat and travel plans; last-minute shoppers wait. | Booking-system authority, eligibility, refunds, room/seat uniqueness. | Defer integrations; a Fade record is not a valid booking or ticket by itself. |
| 15. Public litter cleanup task | Sponsor pays after independently verified work. | Available tasks vs incentive to manufacture waste or delay cleanup. | Before/after evidence, site permission, independent inspection. | Do not use seller/claimant self-attestation for subsidy release; requires new evidence and anti-collusion rules. |
| 16. Urgent compute / spare capacity | Customer pays a provider; negative only if an external program funds a clearly defined benefit. | Deadline or capacity demand; waiting may miss job completion. | Metered service, output correctness and resource isolation. | Poor current Fade fit: no continuous metering or automated service attestation. |

The most reusable idea is **cost-sensitive transfer of a lot**, not “everything eventually becomes free.” Different rows require different authorities, settlement evidence and cancellation powers; they should not share one unqualified guarantee.

## Lessons from operating services

These sources establish that the mechanisms exist, not that the operators use blockchain, descending auctions or negative pricing. No revenue or adoption projection is inferred.

| Official example | Observed mechanism | Transferable lesson for Fade |
| --- | --- | --- |
| [Too Good To Go US terms](https://static.toogoodtogo.com/general-terms-conditions/en-us/index.html) (effective 31 July 2024; checked 27 September 2026) | Store-defined surplus bags, reservation, specified pickup window, in-app pickup confirmation, cancellation and missed-pickup rules. Anticipated surplus can fail to materialize. | Inventory uncertainty and cancellation are core states. A signature must be embedded in an understandable store workflow; reservation and successful pickup are different. These US terms are not global legal rules for Agyion. |
| [Flashfood](https://flashfood.com/) and [official pickup guidance](https://help.flashfood.com/hc/en-us/articles/360049202774-When-do-I-need-to-pick-up-my-order) (guidance updated 2 August 2024; checked 27 September 2026) | Discounted grocery items and a pickup deadline tied to listed best-before dates; same-day pickup is encouraged. | A simpler markdown can already express surplus value. Product information, freshness and collection deadlines matter more than forcing a zero crossing. |
| [Olio Food Waste Heroes](https://olioapp.com/business/food-waste-heroes-programme/) and [official collector onboarding](https://help.olioapp.com/en/articles/12277114-what-is-a-food-waste-hero-and-how-do-i-get-started) (checked 27 September 2026) | Businesses donate through a volunteer collection/redistribution network. Collector onboarding includes training and identity checks. | Separate the person consuming food from the person doing logistics. Eligibility and collection operations need explicit ownership; neither ZK nor an account signature proves food safety or a completed route. |

## Allocation alternatives and their limits

These are design choices for a **future protocol**, not patches already active in V3. The desired fairness must be selected explicitly: order of arrival, equal opportunity among eligible people, highest merchant value, least subsidy, or delivery reliability. These objectives can conflict.

| Mechanism | What it improves | What remains / cost | Assessment |
| --- | --- | --- | --- |
| Current descending price + first valid chain transition | Simple; one winner; transparent price curve. | Inclusion/latency/bots affect opportunity; no performance stake; fee costs on some losing attempts. | Honest baseline for a controlled test, unsuitable for a broad equal-access claim. |
| Bounded request window + allocation at its end | Gives users time to sign and submit; reduces millisecond racing within the window. | Requests still need inclusion before close. A deterministic “smallest address/hash” winner is grindable. Randomness needs a verified source, a frozen eligible set and liveness rules. | Best direction if consumer access fairness is a requirement, after eligibility and delivery rules are designed. |
| Batch auction by price willingness | Can allocate to highest willingness to pay or lowest requested collection compensation. | Wealth/price objective, not equal human access. Requires explicit clearing/payment rule; strategic bidding and sparse markets remain. | More appropriate for B2B collection economics than essential consumer goods. |
| Commit/reveal requests | Hides bids/intents until the commitment window closes if commitments bind all relevant fields and an unpredictable salt. | Two inclusion windows, fees and user actions; reveal censorship/nonparticipation; commitment Sybils. Revealing bids is not a random tie-break. | Useful for sealed economic bids; excessive ceremony for a low-value bakery bag unless relaying and recovery are excellent. |
| Refundable reservation bond / payment escrow | Makes abandoned reservations costly; positive-payment escrow proves funding. | Poorer users need upfront liquidity; seller could falsely accuse no-show. Larger bonds deter access as well as abuse. Does not by itself provide fair allocation or stop multiple identities. | Likely needed for untrusted reservations, but slashing cannot depend solely on a seller-controlled handoff key. |
| Eligibility token / per-person quota | Can enforce a defined membership or capacity rule when issuance and uniqueness are trustworthy. | Issuer trust, credential recovery and exclusion; multiple accounts bypass a wallet-only quota. ZK can hide credential attributes but does not create unique-human truth. | Appropriate for a limited invited pilot; avoid calling it permissionless or universally Sybil-proof. |
| Central queue or fee-sponsored relayer | Can simplify gas and reduce fee-bidding advantages within its service. | Sequencer can censor/reorder; shared source accounts need careful sequencing. Direct contract calls bypass a UI-only queue. | Useful infrastructure, not a substitute for contract-enforced allocation. |

A viable batch design needs, at minimum: a committed lot and rules; request opening/closing bounds; one eligible entitlement per intended participant; immutable recipient and maximum-payment/minimum-reward bounds; a bounded participant representation; a frozen candidate set; an independently reviewable tie-break; explicit settlement, winner acceptance, no-show and fallback deadlines; permissionless finalization; refunds for unsuccessful/reserved deposits; replay/domain binding; and cost bounds. An off-chain operator publishing a candidate Merkle root must not be silently trusted for completeness. A raw ledger hash, a merchant-chosen seed, or a reveal hash sorted numerically should not be advertised as unbiased randomness.

When the winner fails to show, “draw again” is only meaningful if enough safe collection time remains. Reopening after a food-safety cutoff is not recovery. At that point, follow the predetermined donation/disposal path and return funds according to the original terms. Every added branch must preserve the same inventory and escrow spend state.

## First pilot: small markdown sale, with explicit boundaries

**Proposed scope:** one staffed bakery or café, a small invited group, sealed and counted end-of-day bags, one physical location and a fixed collection window. Begin with testnet settlement and a staff-assisted rehearsal; no claim here that a partner has agreed. Compare a fixed discount with a descending **nonnegative** price. Keep negative compensation, public unattended claiming, automated Envoy hunting and sponsor rewards out of this first pilot.

Before a real-value pilot, establish:

1. Physical inventory ownership and unique lot IDs; a bag is removed from ordinary sale when legitimately reserved, and cannot be listed twice through another channel.
2. Exact food description/constraints, staffed handoff procedure and a cutoff based on safe collection, with ample signing/network margin. Ledger durations are not promises of wall-clock seconds.
3. Contract-enforced claim admission if the pilot is advertised as invited-only; merely sharing a private URL or checking membership in the UI is inadequate.
4. A choice between funded reservation, verifiable eligibility with known no-show controls, or allocation at the counter. The present free reservation must be described as a limitation until its replacement is implemented.
5. A buyer/merchant failure policy: unavailable stock, recalled item, unacceptable condition, late buyer, late merchant, network outage and unavailable venue key. Do not hand over goods on a mere pending positive payment.
6. An operational support and dispute owner. A one-key venue assertion is not an adjudicator, and “blockchain finality” cannot establish that a physical item matched its description.
7. A merchant economics sheet: retail recovery, compensation paid, fees, staff minutes, wasted stock and fallback handling costs. Hold the food-safety policy constant across experiments.

Measure with denominators, not vanity totals:

| Metric | Definition |
| --- | --- |
| Sell-through / pickup completion | Completed valid pickups divided by actual listed lots, and separately divided by confirmed claims. |
| No-show rate | Claims missing the agreed collection window divided by confirmed claims, with merchant-caused failures reported separately. |
| Net merchant recovery per actual lot | Buyer payments minus incentives, fees and measured handling/support costs; compare with the same site's existing alternative. |
| Reservation competition | Requests per lot, confirmed claims and losing included attempts; report their fee costs. |
| Access sensitivity | Win/completion rates by measured latency/signing-time buckets, with bucket counts; no claim of causal discrimination from a small sample. |
| Waiting behavior | Share of claims near floor/zero crossing and time-to-claim distribution; compare fixed-price control and demand levels. |
| Physical failure rate | Stock discrepancies, incorrect/unsafe item complaints and failed handoffs divided by expected pickups. |

Set go/no-go thresholds with the participating merchant before collecting results. A zero-incident rehearsal does not certify general safety. Stop a real-value expansion if failed handoffs, reservation abuse or support costs erase the claimed benefit.

## Prioritized engineering implications

1. **Immediate correctness:** label claim confirmation and frozen settlement accurately; refresh contested state; reconcile uncertain submissions; ensure ten contenders yield at most one claimant and one settlement. These can be reviewed without promising a new allocation mechanism.
2. **Before open consumer use:** close the free-reservation/no-show model, decide verified stock and merchant cancellation/dispute responsibilities, and enforce any eligibility/quantity rule in the contract. A contract version change and migration/release plan would be required; a frontend deploy cannot create these properties.
3. **If equal-access allocation is essential:** specify and test the bounded-window mechanism with explicit eligibility/randomness/fallback assumptions before code. Include low-end devices, slow signatures, relayer outage, Sybil participants and last-window submissions.
4. **Only then broaden negative pricing:** validate the avoided handling cost and delivery evidence for a selected logistics case; protect external subsidy against collusion and duplicate claims.

Out of scope for the current protocol: anonymous physical handoff, verifiable unique humans, certified food safety, quantities/partial delivery, booking rights, multi-stop custody, independent dispute adjudication, unbiased batch randomness, automatic expiry execution and prevention of real-world double listing. Keeping these limits visible is part of a usable product, not a claim that the underlying price curve is broken.
