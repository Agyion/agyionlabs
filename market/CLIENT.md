# Fade market browser client

`client/protocol.ts` is the application entry point. It uses the reviewed testnet contract, exact WASM hash, SAC allowlist, RPC URL and catalog origin compiled into `client/pins.ts`. Neither query parameters, local storage nor a catalog response can select those pins. `getMarketRelease()` validates and brands the release before any client is created.

The public catalog is for discovery. Signed listing metadata does not prove a physical shop exists, that an item remains available, or that a pickup happened. Transaction preparation independently reads the pinned contract and registered merchant key. The catalog never receives private-pool credentials, wallet keys, customer receipt packets or transaction envelopes.

## Application integration

Create a protocol with a wallet session adapter, an explicit maximum fee in stroops, and a fee confirmation callback. The adapter must authenticate the actual wallet account and testnet network; setting an SDK network preference is not sufficient. The browser client supports ordinary `G` accounts. Contract-account authorization and arbitrary wallet signers are not advertised by this adapter.

`prepare(command)` reads current authority and returns an opaque operation with a public summary. Copying that object does not authorize a submission. `submit(handle)` simulates the exact call, validates its authorization tree, asks the application to display and accept the assembled maximum network fee, then requests a wallet signature. The displayed fee is the maximum authorized fee, not the final fee charged on chain. `withFeeLimit` requires an explicit user choice and is available only before an attempt is durably recorded.

For walk-in settlement, `summary.quoteLedger` is the merchant receipt's `valid_from` ledger. The contract fixes the price at that ledger for the bounded signed window; it does not replace that quote with a different inclusion-time price. The UI should show this short-lived accepted quote and its expiry. A reservation does not transfer the item price, but it still incurs network fees. Reserved settlement uses the price and merchant key snapshot stored in that reservation.

A separate merchant key controller in `client/merchant-vault.ts` creates and restores operational Ed25519 keys. Actual encrypted-file reselection and decryption are required before that controller signs a publication or pickup authorization. The merchant key is not a wallet key. Registration or rotation still requires the seller's on-chain wallet authorization. See [merchant key handling](client/MERCHANT_KEYS.md).

## Recovery

The client writes the signed transaction's public hash, source, sequence and exact call digest to IndexedDB before starting transmission. It does not persist the signed wallet envelope, password or merchant seed. Web Locks plus atomic IndexedDB transactions prevent two unresolved market operations from the same source in this origin's tabs.

A lost response stays pending. Repeating `submit` on the same handle queries the stored hash; it does not sign or send a second transaction. `reconcile(hash)` accepts terminal evidence only when the returned envelope, source signature, invocation, transaction result and Soroban return/event preimage match. Third-party fee-bump envelopes must bind the same inner transaction. A missing transaction or transient error is not proof of failure. An attempt proven not to have reached the send call is recorded as `known_not_sent`; a new operation still requires an explicit action.

Publications have a separate durable request hash and exact saved body. `publish` does not automatically repost an existing attempt. `reconcilePublication` only queries its historical acceptance receipt, including after listing expiry. `retryPublication` is an explicit resend of the exact saved signed publication after checking current authority. Canceling before the first HTTP request marks the publication `known_not_sent`; canceling after transmission begins leaves it pending unless an exact acceptance receipt can be recovered.

`history()` returns the local public attempt history. `currentPublication(offerId)` is a scoped catalog revision hint that remains available after expiry. Before explicitly renewing a listing, reconcile any local pending publication and read that hint. A new signature needs a fresh nonce and the next revision. The database's atomic revision rule decides concurrent publication races. The UI must preserve the public metadata draft before funding an offer because its hash is immutable on chain; an encrypted merchant-key backup does not recover that public draft.

Disposing a protocol aborts outstanding fee approvals and stops new publications. The journal stays open until in-flight mutations have recorded their outcome. There is no automatic retry when the app reopens.

## Trust and operational limits

The configured RPC is a trusted observation provider, not a cryptographic SCP inclusion proof. Catalog signatures are checked against a key carried by the catalog for discovery; spending uses the current on-chain key or the existing reservation's stored key. Entry keys, embedded contract identity, code bytes, TTL and the asset policy are checked on every authoritative read. Missing or archived funded state is unavailable, never assumed empty.

The journal protects concurrent market operations within one browser origin. It is not shared across devices, private-pool journals, other apps or external wallet transactions. The chain still decides account sequence and offer conflicts. Hostile same-origin JavaScript, browser extensions, deleted storage and profile rollback are outside the local journal's guarantees. A corrupted journal fails closed.

Local tests use actual SDK XDR, real Ed25519, encrypted merchant files, and SQLite, with explicitly synthetic RPC responses. An isolated browser test exercises real IndexedDB and Web Locks while denying external network requests. These tests do not establish physical pickup, wallet-provider behavior or live transaction inclusion. A separate deployed-contract smoke test is required before enabling a new release.
