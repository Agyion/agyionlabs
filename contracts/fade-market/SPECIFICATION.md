# Agyion Fade Market protocol 1

This is a separate public testnet contract. It cannot read, upgrade or move funds from the existing Agyion kernel or private pool. It has no admin withdrawal, upgrade method, Envoy mutation, no-show bond, slash or dispute arbitrator. On-chain signatures authorize statements; they do not prove physical delivery or unique human identity.

## Deployment and assets

`__constructor(asset_xdrs: Vec<Bytes>)` accepts 1 through 8 distinct canonical Stellar Asset XDR encodings, each at most 64 bytes. The host derives each Stellar Asset Contract address for the current network. Arbitrary caller-chosen token contract addresses are not supported. No token or reserve balance is imported from another deployment. The allowlist is immutable. The constructor refuses a network other than the Stellar testnet passphrase hash.

Protocol constants are returned by `get_config`: maximum offer duration 1,000,000 ledgers, reservation duration 720 ledgers, signed-receipt interval 12 ledgers. These are ledger counts, not wall-clock guarantees. `protocol_version()` returns 1. A release must pin the actual deployed WASM hash in addition to the version.

Canonical SAC does not mean an issuer cannot freeze or claw back an issued asset. Unsupported token behavior is excluded by the SAC allowlist. Exact transfer balance checks and aggregate reserves reject inconsistent accounting; they cannot force a frozen issuer-controlled asset to transfer. Native XLM has different issuer properties and must be identified by its canonical asset encoding, not a display label.

## Merchant and immutable offer terms

`register_merchant(seller, public_key)` requires the seller's root authorization. A nonzero Ed25519 public key and a monotonically incremented u32 epoch are recorded. This key is not a wallet spending key and cannot debit the customer. Seller or claimant may be a correctly authorized account-contract address; the contract does not infer authentication from a Stellar master public key. The market itself and supported asset contracts cannot be registered as sellers. A key must be generated and backed up by the merchant; nonzero validation alone is not proof of key possession.

`create_offer(seller, OfferTerms)` requires seller authorization and an existing merchant record. It atomically transfers the entire positive pot to the contract. Terms are defined exactly in `src/types.rs`. Conditions include positive pot, start >= floor >= -pot, nonnegative slope numerator, positive denominator, bounded duration, lease length 0 through 720 and nonzero metadata hash. `lease_ledgers = 0` disables remote reservations.

The contract computes `terms_hash = SHA256(OfferTerms.to_xdr(env))`. This is the XDR encoding of the Soroban struct as a sorted SCVal map, not ordinary JSON or raw Stellar Asset XDR. The metadata hash commits the separately signed shop/product/pickup description. Terms cannot be modified. Create a new offer for a material change; the metadata/catalog service must preserve the chain-bound original.

One offer is one pickup unit. IDs are monotonically increasing u64 values and never reused. Checked arithmetic rejects a deadline, final refund boundary, ID, merchant epoch or reservation sequence that would overflow. There is no partial fill or stock-count decrement hidden in an offchain database.

## Signing bytes

Venue signatures cover this exact concatenation:

1. UTF-8 purpose including its trailing zero byte.
2. The 32-byte ledger network ID.
3. `current_contract_address().to_xdr(env)`, the SCVal Address encoding.
4. The typed receipt or permit `to_xdr(env)`, the SCVal struct encoding.

| Action | Purpose | Final struct |
| --- | --- | --- |
| Walk-in pickup | `agyion:market-walk-in:v1\0` | `PickupReceipt` |
| Reservation admission | `agyion:market-reserve:v1\0` | `ReservationPermit` |
| Reserved pickup | `agyion:market-reserved:v1\0` | `PickupReceipt` |

Do not use these bytes for wallet login, catalog publication or notification signatures. All are separate purposes. Field names, integer widths, array/enum variants and Address/Bytes encodings are ABI commitments.

The receipt binds offer ID, claimant, computed terms hash, merchant epoch, sequence, validity interval, signed i128 maximum price and nonzero 32-byte nonce. A price <= max_price is required. For example max_price=-150 requires a reward of at least 150 minor units; max_price=600 never permits a debit above 600. A new walk-in or reservation uses `offer.sequence + 1`. Reserved settlement uses the already stored sequence. Validity cannot begin before offer creation, is inclusive at both endpoints and its width cannot exceed 12 ledgers. The nonce need not have a global storage entry: exact offer, action, sequence and terminal state prevent its replay. Issuers should nevertheless generate independent random nonces.

Invalid Ed25519 signatures are host errors and roll back atomically; they are not coerced into a misleading successful contract return.

## State and token accounting

State numbers are 0 open, 1 reserved, 2 settled, 3 refunded. `ReservationState` is the SCVal enum `Empty` or `Active(Reservation)`, not a Rust Option of a custom struct. The optional settled recipient/price use ordinary SDK-supported Option encodings.

`settle_walk_in(receipt, signature)` accepts only an open, unexpired offer. It verifies the current merchant key and claimant root authorization even when the price is zero or negative. Its settlement price is the curve price at the signed `receipt.valid_from` quote ledger, fixed until `valid_until`. The current browsing price can subsequently fall or cross zero; that does not change an already signed short quote. The customer must see and approve this fixed quote amount. After expiry, a fresh quote and signatures are required. Claim and settlement occur in one transaction. Browsing, directions and offchain interest never reserve inventory.

Fixing the quote amount is required for an exact source-account authorization tree: the SAC debit recorded at simulation must be the same debit executed later. The implementation does not skip token authorization, grant a broad allowance or silently substitute a later amount. The live curve remains available through `price` for requesting a new quote. An existing reservation already freezes its inclusion-ledger price; its later settlement uses that stored price.

For both settlement modes:

- Positive price: claimant pays that price to seller; the entire pot returns to seller. Claimant authorization includes the nested SAC payment under the settlement root.
- Zero: the entire pot returns to seller; no claimant payout.
- Negative price: claimant receives -price, never more than the pot; seller receives the remainder.
- There is no reward on reservation, scan, cancellation, expiry or no-show.

An aggregate reserved balance is initialized for every allowed asset. Funding increases it only when the exact deposit succeeds. Terminal settlement/refund reduces it once. Every transfer checks exact before/after balances, and the remaining contract balance must cover every other recorded pot. Failure of the second transfer rolls back the first transfer, state, sequence, active slot and aggregate reserve. Missing reserve data is an unavailable archive condition, never zero. Unsolicited token donations do not grant any withdrawal right.

## Reservation leases

`reserve(permit, signature)` requires a fresh merchant admission signature, claimant root authorization, open offer, positive enabled lease allowance and a permit lease end in `(now, now + offer.lease_ledgers]`. The offer must not have expired. It freezes the price at the current ledger, increments sequence and stores the merchant key/epoch snapshot. A reservation can extend beyond the final listing deadline, but only for the bounded configured lease; creation validates that the subsequent refund ledger can exist.

At most one active reservation per seller and claimant is allowed. An expired slot may lazily release its exact old offer before the new reservation. Slot cleanup checks offer ID, sequence and lease end; an old cancellation/timeout cannot clear a newer reservation. This bound is per address, not a unique-person or Sybil guarantee. Admission policies still belong to the merchant service.

`settle_reserved(receipt, signature)` needs the stored claimant, sequence, price, snapshot merchant key and current ledger <= lease_until. It also requires a fresh receipt and claimant authorization. A later curve value does not change the frozen reservation price. Ordinary merchant key rotation invalidates old keys for new reservations/walk-ins, but preserves the key snapshot for already accepted short leases. There is no emergency override; a compromised snapshot key remains relevant until that lease expires, and claimant authorization is still required.

`cancel_reservation(offer_id, claimant, sequence)` requires the current claimant authorization. `expire_reservation(offer_id)` is permissionless only when now > lease_until. Either operation reopens an offer if now <= its original deadline, retaining its pot and continuing the original curve. Otherwise it returns the pot to seller and enters refunded state. Sequence does not go backwards. Reopening for the same claimant still invalidates all prior permit/handoff sequence values.

`refund(offer_id)` is permissionless after the offer deadline, provided any current lease has also expired. It does not close a valid active lease or allow an early seller withdrawal. Terminal states never reopen.

## Storage, indexing and reads

Storage enum keys are `Config`, `Count` in instance storage and `Merchant(Address)`, `Offer(u64)`, `Reserve(Address)`, `Slot(Address, Address)` in persistent storage. Code/instance and common persistent records use a target of 172,800 ledgers, capped by the network maximum. Read refresh occurs below the smaller of 86,400 or half the target. New persistent writes reach their target even when the network's initial entry lifetime exceeds the read refresh threshold.

An offer record targets the greater of that common lifetime and the time remaining until its original deadline plus its maximum lease, the following refund ledger and a 17,280-ledger refund margin. This calculation uses u64 intermediates and caps the result at the network maximum. The 1,000,000-ledger offer limit remains supported, without renting the entire contract code to that long offer's deadline. Slots use the common lifetime; the constructor requires the network maximum to exceed a maximum lease plus receipt interval.

These are retention targets and ledger counts, not perpetual availability or wall-clock guarantees. Code/instance and aggregate obligations can archive before a very long offer expires if no transactions refresh them. An operator or client must restore required archived entries before use. Read-only RPC simulation does not itself pay for or commit TTL extension. A low network maximum can also cap an offer below its commercial deadline. No method treats a missing aggregate obligation as zero, and an archived persistent entry cannot be safely replaced with a fresh record. Missing/archived data must remain unavailable until correctly restored.

Reads are `get_config`, `get_merchant`, `get_offer`, `price`, `reserved_balance` and `get_active`. A returned active slot can already be commercially expired until cleanup runs; clients must compare its lease ledger. `price` is the live curve, including for historical offers; a completed record's settled_price is the settlement evidence. It must not be replaced by the later live curve in receipts.

`MerchantRegistered` and `OfferChanged` events contain public registration/state transition data. Offer events include ID, state, sequence, accepted ledger and current or settled claimant/price. Indexers must verify pinned network/code identity, successful transaction inclusion and exact record data; missing/stale/archived records are not available offers. Failed transactions do not publish successful events. Do not embed customer location, plaintext login challenges or operational key material in events.

## Verification and deployment gates

Run `cargo test -j 2 --locked`, build with `CARGO_BUILD_JOBS=2 stellar contract build --locked --optimize=false`, then run `cargo test -j 2 --locked --features wasm-tests`, from this crate directory. The feature reruns shared behavioral scenarios against the actual compiled WASM as well as the native implementation. SDK test mocks preserve root authorization recording; negative authorization cases remove mocks or restrict them to exact invocation trees. Test-host storage fault injection prepares some scenarios for both execution modes; it is not a callable contract capability.

Independent JavaScript SCVal/hash/signature fixtures must agree with Rust. The [testnet release record](../../deployments/market-testnet.json) identifies the exact deployed WASM and completed live settlement checks, including delayed quote inclusion, reservations, expiry and reserve cleanup. Each replacement release must repeat these checks against its actual deployed bytes. Local tests alone do not establish browser/catalog/deployed compatibility, production readiness or absence of all exploits.
