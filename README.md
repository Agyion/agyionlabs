<div align="center">

# Agyion

### Payments that follow an agreement

Lock the funds. Define what must happen. Settle when the condition is met.

[Explore Agyion](https://agyionlabs.dev) · [Open the app](https://agyionlabs.dev/app/) · [See the instruments](https://agyionlabs.dev/instruments)

</div>

Agyion brings conditional payments to Stellar. A seller can pay someone to collect an unwanted item. A saver can lock money until a chosen time. A customer can fund a payment that requires an attestation. An owner can authorize an agent within rules enforced by a contract.

The agreement determines who may move the funds, which evidence they need and what happens when the condition expires. The app makes those rules usable through four instruments: **Fade, Pod, Trigger and Envoy**. Ramp connects to a sandbox payment provider. Activity keeps transaction receipts and recovery actions together.

**Current release: Stellar testnet.** The public contract is deployed and the application verifies its network and exact code before enabling transactions. Real money, independent security certification and complete transaction anonymity are not claims of this release.

The [active public release](deployments/public-testnet.json) retains the existing contract address and code pin so previous public positions and transaction recovery keep working. The renamed contract deployment is recorded as an inactive research/test release. Adding the separate private pool does not move funds or reinterpret public record IDs.

## Four ways to use it

### Fade

A bakery has an unsold box at closing time. Its price falls as the collection deadline approaches. It can reach zero and become a reward for collecting the box, funded by the seller's pot.

The public marketplace pairs a funded offer with a signed shop and pickup description. A merchant can issue a short pickup quote for one collector, who reviews it and approves the payment. Optional reservations need a merchant authorization and expire after a bounded lease. An eligible refund transaction returns unused funding. The seller still has to provide the item, and somebody must submit each transaction. A blockchain cannot verify a physical pickup on its own.

Walk-in quotes fix the price for at most 12 ledgers so the wallet signs the exact debit that will execute. A reservation fixes its price when admitted. Competing valid transitions have one winner according to network inclusion, not browser click time. Earlier Fade positions remain on their original contract with their original claim and handoff rules.

[Marketplace release](deployments/market-testnet.json) · [Settlement rules](contracts/fade-market/SPECIFICATION.md) · [Public discovery](market/README.md)

[Explore Fade](https://agyionlabs.dev/fade)

### Pod

Set aside money for a later date. The unlock time and possession of the required secret determine when it can be opened.

The published public flow binds an opening signature to its chosen recipient. It has no administrator recovery or refund path. Anyone retaining the secret retains its authority, so saving it safely matters. The private note flow adds a separate encrypted key vault and local proof generation within the same application integration.

[Explore Pod](https://agyionlabs.dev/pod)

### Trigger

A customer funds a payment for a supplier. A named attester confirms that the agreed condition occurred. A valid attestation pays the recorded beneficiary before the deadline. Otherwise the funder can submit the eligible refund.

The contract checks the attestation and payment rules. The attester remains responsible for the truth of the real world event.

[Explore Trigger](https://agyionlabs.dev/trigger)

### Envoy

An owner gives software permission to act within a mandate. The public release permits a bounded number of eligible Fade claims for that owner, with expiry and revocation. It does not grant unrestricted wallet spending.

The private note implementation supports constrained delegation, owner recovery and revocation. Both models need explicit limits. Revoking authority cannot reverse an action that was already confirmed.

[Explore Envoy](https://agyionlabs.dev/envoy)

## One application, explicit privacy boundaries

Fade remains public because its core interaction includes an actual seller and handoff. Pod, Trigger and Envoy are the focus of the private note integration.

The private implementation uses local Groth16 proofs, encrypted notes, nullifiers to prevent repeated spending, an encrypted recovery vault and threshold disclosure. The browser builds a proof without sending the secret witness to a proving service. The contract verifies the public statement before changing balances or roots.

Privacy does not erase every observable fact. Deposits, withdrawals, fees, transaction timing and the submitting account can remain public. A small pool can provide little practical anonymity. A quorum of disclosure trustees can cooperate outside the application, so independent custody and operational controls still matter.

**Integration status:** the published testnet app connects Pod, Trigger and Envoy to the separate private pool, with browser proof generation, an encrypted vault, explicit fee approval and transaction recovery. Existing public positions remain accessible through their original contract. Development setup keys and locally operated trustees are explicitly labelled. Existing public records do not become private through a UI change.

[Protocol and threat model](privacy/PROTOCOL_V2.md) · [Authorized disclosure](docs/PRIVACY_DISCLOSURE.md) · [Security boundaries](SECURITY.md)

## What is verified

The counters below describe completed test runs on 27 September 2026. Balances are observations at the end of each run, not a live balance report.

The public payment contract completed **23 included transactions and 17 checks** using dedicated test identities and native XLM. The checks covered settlement, recipient substitution, replay, competing claims, expiry, refund and revocation outcomes, including actual balance and reserve changes. Its original address and code remain active.

The separate private pool completed **15 included transactions and 72 checks** across funding, Pod opening, Trigger settlement and refund, Envoy claims, revocation, owner recovery and withdrawals. The final pool XLM balance was zero. An additional **13 disclosure checks** opened an accepted record with three development trustee shares and rejected insufficient shares and invalid authorization scope. These tests used locally controlled identities and trustees.

The separate marketplace completed **20 included testnet transactions and 19 checks**, including positive, zero and negative pickup prices, delayed inclusion of a fixed quote, reservation cancellation and reuse, stale authorization rejection, expiry and refunds. Its final XLM balance and recorded XLM/USDC obligations were zero. A real Cloudflare D1 check also verified that ten concurrent initial publications admit one revision and that rejected updates leave no partial record.

A separate run then exercised the existing marketplace with actual Circle testnet USDC: **13 included transactions**, consisting of four account/asset setup transactions and nine marketplace transactions. Positive, zero and negative pickup prices, expiry refunds, duplicate rejection and exact USDC balance changes passed. The contract finished with zero USDC balance and reserve. This used dedicated test identities and a local signer, not a wallet extension or bank payment. [USDC verification](docs/USDC_TESTNET_VERIFICATION.md).

A separate browser marketplace run restored the saved encrypted merchant key, created and published a real testnet offer, then completed a collector payment with an explicit fee review. The included settlement and both account balances were reconciled, including the returned merchant funding and unused network fee. This used a scripted wallet, with real RPC responses forwarded through a test HTTP adapter after host network changes interrupted Chrome. The run reached confirmed Recovery before reload; its final assertion incorrectly assumed the wallet would remain connected after reload. That failed assertion is retained and is not counted as a passing reconnect test.

A later read-only check passed three recovery and reconnect checks without signing or sending another payment. It seeded a public journal record reconstructed from the confirmed settlement, verified it against the chain, reloaded the page and explicitly reconnected the wallet. This establishes persistence for that seeded record, not recovery of the original browser profile or operation of a real wallet extension.

A separate test used the actual Freighter 5.48.0 extension in a fresh browser profile on the published site. The app rejected the wrong network; cancellation sent nothing. One explicitly approved merchant registration reached testnet, and its real transaction journal survived page reload and explicit wallet reconnection. The included envelope and account signature matched the reviewed transaction; the actual charged fee was independently verified within its limit. This used direct browser networking and a dedicated valueless test account. Its scope was merchant registration, not an instrument payment or private proof. [Freighter verification](docs/FREIGHTER_TESTNET_VERIFICATION.md).

The compiled browser application generated and verified a fresh Groth16 proof, simulated it against testnet, blocked an excessive fee, recovered after a network interruption and handled an explicit signing rejection. That browser test used a scripted wallet adapter and submitted no transaction; it is not a real wallet extension test. The included private transactions used the actual client and dedicated CLI signing identities. The application supports native testnet XLM and Circle testnet USDC. The separate USDC marketplace run above does not establish private-pool USDC settlement or a bank payout.

The contracts and cryptographic code have automated tests for authorization, arithmetic, replay, conservation, invalid proofs and interrupted transactions. Dependency advisory scans and a source review are part of the development process. These results establish tested behavior. They are not an independent audit or proof that every possible exploit is absent.

The latest contract source adds aggregate backing guards for new public and
private deployments. Those candidates have not replaced the immutable contracts
used by the application. Existing records and private notes retain their original
deployment and recovery scope. The [issuer control review](docs/TOKEN_ISSUER_RISKS.md)
records the reproduced limitation, tested candidate behavior and remaining
deployment compatibility work. The [guarded private candidate](docs/PRIVATE_POOL_GUARDED_TESTNET.md)
now has a separate verified testnet deployment; instrument lifecycle checks and
application activation remain separate gates.

[Review scope and verification limits](docs/VERIFICATION.md) · [Security boundaries and reporting](SECURITY.md) · [Payment contracts](contracts/) · [Private protocol](privacy/PROTOCOL_V2.md)

## Build and run

The repository contains a React landing site, a Next.js application, Rust contracts for Soroban and the private cryptographic implementation. Node.js 22, Rust and the Stellar CLI are used by the current verification environment.

```sh
npm ci
npm --prefix landing ci
npm --prefix app ci
npm --prefix privacy ci
npm --prefix contracts/private-pool/client ci
npm --prefix market ci
```

Copy `app/.env.example` to `app/.env.local` and select an explicit mode. A testnet build requires the contract address, reviewed code hash and matching asset configuration. Never put a seed, wallet secret or trustee share in a public environment variable.

The private app build also requires six public development proving artifacts, excluded from Git. Acquire the exact reviewed runtime bytes with `node scripts/fetch-private-prover.mjs --development`. The download and build both verify committed file and chunk pins, circuit sources, dependency lock and verifier identity. The cache contains public runtime files, not trustee shares or setup secrets. Missing or changed files stop the build. This does not reproduce or independently verify the setup ceremony; see [private development requirements](privacy/README.md). The published asset endpoint must match this checkout.

```sh
npm test
npm run build
PORT=4292 npm run preview
```

The combined site serves the landing pages and `/app/` from one origin. Build time settings are part of the published bundle. Changing a contract address requires rebuilding and verifying the application.

### Source map

* `app/`: wallet approval, payment forms, transaction recovery and application UI
* `landing/`: product pages, examples and the orbital entry sequence
* `contracts/`: public payment rules and the private note pool
* `privacy/`: circuits, local proving, encrypted recovery and threshold disclosure
* `market/`: signed public discovery, merchant key custody and marketplace transaction recovery
* `shared/`: scene and navigation behavior shared by the app and landing site
* `scripts/`: build, deployment and verification tools
* `docs/`: product behavior, integration notes and operational limits

Development continues directly on `main`. Product code, executable tests and technical documentation live in the repository. Local work notes and raw verification output are excluded.

[Contribution and verification guide](CONTRIBUTING.md)

## Project background

Agyion began as a Stellar hackathon project in Istanbul. Its next step is a complete application in which ordinary payment rules and carefully scoped privacy work together. We welcome review of the contracts, cryptography, wallet boundaries and recovery behavior. A finding should identify a concrete affected path, preconditions, impact and a reproducible test whenever possible.

## License

See [LICENSE](LICENSE) for the repository licence. Components and dependencies retain their own terms. In particular, the private proving composition uses GPL covered dependencies. Repository licensing does not override those obligations.
