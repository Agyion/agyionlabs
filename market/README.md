# Public Fade catalog

A separate, testnet-only discovery service for `AgyionFadeMarket`. It stores signed public shop/product descriptions and a verified on-chain offer snapshot. It cannot reserve an item, settle a payment, submit a transaction, or access the private pool.

The contract remains authoritative. A catalog response is explicitly `authority: "catalog-only"`: its price terms and offer state were observed at `chain.ledger`, not guaranteed to remain available. A buyer must reread the pinned contract, check the current price and receipt, and authorize the actual transaction before paying. Signing a listing does not prove a physical shop exists or that a handoff happened.

## API

- `GET /v1/offers?limit=20&after=123`: bounded public list, ascending numeric offer ID. `next` is the next cursor or null.
- `GET /v1/offers?bbox=28000000,40000000,30000000,42000000`: west,south,east,north in integer microdegrees. The maximum span per axis is 5 degrees; split antimeridian queries.
- `GET /v1/offers?shop=bakery-01&seller=G...`: shop identity is the on-chain seller **and** merchant-selected shop ID. Both parameters are required together.
- `GET /v1/offers/123`: one unexpired signed listing.
- `GET /v1/publications/{digest}`: historical acceptance receipt for a canonical publication SHA256, even after expiry. It includes scope, revision and exact signature hash, not product prose. It proves off-chain publication acceptance only.
- `GET /v1/revisions/123`: current catalog revision hint, including an expired latest publication. Returns revision 0 with null fields when absent. It contains no product metadata and is not proof that the offer exists or that the caller may publish. Contiguous revision checks still happen atomically when posting.
- `POST /v1/offers`: `{ "publication": ..., "signature": "128 lowercase hex characters" }`.

Reads need no wallet or customer identity. No customer GPS, receipt, private receive descriptor, spending/view key, credential file or private ciphertext field belongs in this API. Plaintext supplied as shop metadata is intentionally public. Bbox queries describe a map area, not a saved customer location. The Worker does not log request bodies or query strings; account/provider request logging is a separate deployment policy.

Every response uses `Cache-Control: no-store`. CORS is limited to `ALLOWED_ORIGIN` and does not enable credentials. CORS is not authorization; the operational key signature and the contract record authenticate publication. Responses never include internal RPC/database exception text.

## Merchant publication

1. Register an operational Ed25519 public key through `register_merchant`. The **seller's on-chain authorization** is required. Registration yields the current key epoch, including for multisig or contract sellers. The Worker holds no merchant secret.
2. Create the public `Metadata` object from `shared/codec.ts`. Text is bounded NFC plaintext without HTML/control/bidi characters. Coordinates are integer E6; pickup bounds are UTC seconds; the time zone is a display label. `imageHash` is null or a SHA256 content reference. No image URL is fetched.
3. Compute `metadataHash(metadata)`. Put the result in `OfferTerms.metadata_hash`, then create the on-chain offer. `termsHash(terms)` hashes the exact canonical Soroban `OfferTerms` XDR, including token and every economic term.
4. Build an exact `Publication`: version 1, action `publish-offer`, `TESTNET_NETWORK_ID`, market contract, canonical decimal-string offer ID, seller, current key epoch, revision, both hashes, UTC issuance/expiry seconds, fresh nonzero 32-byte nonce, and metadata.
5. The first revision is 1. Later revisions must be exactly the preceding revision plus 1 and preserve the immutable metadata commitment. A new product, address, quantity, pickup interval or economic offer requires a **new on-chain offer**. A signature lasts at most one hour; issuance may be at most 60 seconds ahead or 300 seconds behind server time when submitted.
6. Sign the bytes from `publicationBytes(publication)` with the registered operational key. Submit a lowercase hexadecimal Ed25519 signature. Do not sign ordinary JSON or a transaction envelope in its place.
7. The service checks actual testnet network, configured contract/WASM bytes, storage identity and TTL, allowed assets, current seller/key epoch, immutable hashes, open/unexpired offer state and recent ledger before storing anything. It rechecks expiry immediately before inserting.

The listing signature purpose is `agyion:market-listing:v1`. Its fixed SCVal map binds network, contract, offer, seller, key epoch, revision, terms hash, metadata hash, issuance, expiry and nonce. Object insertion order is irrelevant. Unknown fields are rejected.

`receiptBytes` and `pickupAuthorizationBytes` are separate shared codecs for the walk-in, reservation-permit and reserved-settlement purposes. They bind the testnet network, contract, claimant, offer, terms hash, merchant key epoch, sequence, valid ledger window, price ceiling and nonce; permits also bind the lease deadline. The Worker does **not** issue, accept or redeem these receipts. Operational key custody belongs on the merchant device or an independently secured merchant service.

## Persistence and concurrency

`migrations/0001_catalog.sql` uses SQLite constraints and a trigger inside the insertion's transaction. The history revision and unique `(network, contract, seller, key_epoch, nonce)` must both succeed before the current listing changes. A competing revision cannot overwrite the winner or partially consume its nonce. Only a byte-equivalent currently accepted signed publication is an idempotent retry; an old revision cannot resurrect after a later update.

All SQL values are bound parameters. List reads return at most 50 records. A shop lookup cannot combine two merchants who independently choose the same shop ID. Expired publications disappear from listing discovery; acceptance receipts and revision hints remain available. An unknown HTTP result can be reconciled through its exact historical publication receipt without resubmitting or guessing a new revision. Historical rows intentionally remain for replay/revision consistency; any retention change must preserve the current revision and nonce/expiry rules.

## Configuration and deployment boundary

The testnet Worker is published at `https://market-testnet.agyionlabs.dev` with a separate D1 database. `wrangler.toml` contains the exact tested contract/WASM, native XLM and Circle testnet USDC pins. The browser release repeats these inputs as reviewed constants; neither URL parameters nor a catalog response can replace them. Unconfigured or mismatched deployments return unavailable.

Before publishing, set an independently verified testnet `MARKET_CONTRACT`, exact tested `MARKET_WASM_HASH`, comma-separated SAC `MARKET_ASSETS`, HTTPS `MARKET_RPC_URL`, and HTTPS `ALLOWED_ORIGIN`. Create a separate D1 database, apply its migration, and assign unused rate-limit namespace IDs. No secret or seed variable is required. Do not point this release at mainnet. Protocol 28 and the reviewed v1 storage ABI are pinned; a protocol or contract change needs a reviewed release.

The migration uses `SELECT RAISE(...) WHERE ...` for trigger guards. This keeps
the atomic checks while avoiding the remote D1 statement splitter's handling of
an unparenthesized `CASE ... END` inside a trigger. Both migrations were applied
to the real database. A scoped ten-request concurrency check admitted one
initial revision, rejected changed metadata and nonce/revision replay, verified
the current/history rows and removed its temporary validation data.

`READ_RATE` and `WRITE_RATE` are required provider bindings. Reads and unsigned submissions are bounded per provider-reported client IP; authenticated writes are additionally bounded by seller. Shared IPs can share a quota. These Cloudflare-local controls reduce abuse; they provide neither global uniqueness nor economic/fairness guarantees. SQLite and the contract enforce those separate boundaries.

The RPC transport is a configured trusted data source, **not** a cryptographic SCP inclusion proof. It receives only public contract/merchant/offer keys. Responses are bounded to 2 MiB with a 10-second request timeout, redirects are rejected, and missing/expired ledger entries fail closed. Instance, code, merchant and offer are read in one ledger-entry response. The actual code bytes are hashed, not just their advertised hash.

The Worker uses manual redirect handling because the edge runtime does not support the browser's `redirect: "error"` option. All redirect status responses and any already-followed response are rejected before decoding. This path was checked in the actual Worker runtime and in the deployed service, without changing the contract or network pins. The live signed-publication check rejected invalid signatures, changed metadata and stale revisions; two concurrent updates admitted one winner. These are separate checks from the direct database concurrency test.

## Local verification

Use Node 22.23 or later. From the repository root, install the root test types, shared privacy encryption dependencies and market dependencies:

```sh
npm ci --ignore-scripts
npm --prefix privacy ci --ignore-scripts
npm --prefix market ci --ignore-scripts
npm --prefix market test
```

The suite type-checks and uses Node's real SQLite engine, actual Ed25519 signatures, and SDK XDR. RPC fixtures are synthetic ledger data and are marked as such. The isolated IndexedDB browser test is skipped unless `MARKET_JOURNAL_BROWSER_TEST=1`; enabling it also requires the root/landing browser toolchain and Chromium. A skipped browser test is not a passing browser result. Passing local tests does not prove live D1 configuration, a deployed market contract, Cloudflare runtime behavior, wallet settlement or physical pickup. `fixtures/` contains public, explicitly synthetic interoperability vectors, never a production signing key.

Relevant provider references: [D1 prepared statements and atomic batches](https://developers.cloudflare.com/d1/worker-api/d1-database/), [Cloudflare rate limiting scope](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), [Stellar latest ledger schema](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getLatestLedger).
