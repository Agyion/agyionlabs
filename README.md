<div align="center">

# Agyion

### Payments that follow an agreement

Lock the funds. Define what must happen. Settle when the condition is met.

[Explore Agyion](https://agyionlabs.dev) · [Open the app](https://agyionlabs.dev/app/) · [See the instruments](https://agyionlabs.dev/instruments)

</div>

Agyion brings conditional payments to Stellar. A seller can pay someone to collect an unwanted item. A saver can lock money until a chosen time. A customer can fund a payment that requires an attestation. An owner can authorize an agent within rules enforced by a contract.

The agreement determines who may move the funds, which evidence they need and what happens when the condition expires. The app makes those rules usable through four instruments: **Fade, Pod, Trigger and Envoy**. Ramp connects to a sandbox payment provider. Activity keeps transaction receipts and recovery actions together.

**Current release: Stellar testnet.** The public contract is deployed and the application verifies its network and exact code before enabling transactions. Real money, independent security certification and complete transaction anonymity are not claims of this release.

## Four ways to use it

### Fade

A bakery has an unsold box at closing time. Its price falls as the collection deadline approaches. It can reach zero and become a reward for collecting the box, funded by the seller's pot.

The contract freezes the price when a claim is confirmed. A signed handoff settles the payment. An eligible refund transaction returns the pot after a missed handoff or expiry. The seller still has to provide the item, and somebody must submit each transaction. A blockchain cannot verify a physical pickup on its own.

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

**Integration status:** the circuits, pool, prover, vault and recovery modules have executable tests. The published release currently uses the public instruments. The active implementation work connects the actual private pool and these modules to the existing app. Development setup keys and locally operated trustees will remain explicitly labelled as such. Existing public records do not become private through a UI change.

[Protocol and threat model](privacy/PROTOCOL_V2.md) · [Security boundaries](SECURITY.md)

## What is verified

The current public testnet release completed **23 included transactions and 17 checks** using dedicated test identities and native XLM. The checks covered settlement, recipient substitution, replay, competing claims, expiry, refund and revocation outcomes, including actual balance and reserve changes.

The final published browser check passed **34 artifact and HTTP checks plus 14 interface checks**, with the expected contract identity and no recorded JavaScript, network or CSP errors in that run. The application uses Circle testnet USDC by default. Its token identity and metadata were checked, but the XLM settlement run does not establish an actual USDC funding or bank payout.

The contracts and cryptographic code have automated tests for authorization, arithmetic, replay, conservation, invalid proofs and interrupted transactions. Dependency advisory scans and a source review are part of the development process. These results establish tested behavior. They are not an independent audit or proof that every possible exploit is absent.

[Security boundaries and reporting](SECURITY.md) · [Payment contracts](contracts/) · [Private protocol](privacy/PROTOCOL_V2.md)

## Build and run

The repository contains a React landing site, a Next.js application, Rust contracts for Soroban and the private cryptographic implementation. Node.js 22, Rust and the Stellar CLI are used by the current verification environment.

```sh
npm ci
npm --prefix landing ci
npm --prefix app ci
npm --prefix privacy ci
npm --prefix contracts/private-pool/client ci
```

Copy `app/.env.example` to `app/.env.local` and select an explicit mode. A testnet build requires the contract address, reviewed code hash and matching asset configuration. Never put a seed, wallet secret or trustee share in a public environment variable.

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
* `shared/`: scene and navigation behavior shared by the app and landing site
* `scripts/`: build, deployment and verification tools
* `docs/`: architecture, source review and reproducible evidence

Development continues directly on `main`. Product code, executable tests and technical documentation live in the repository. Local work notes and raw verification output are excluded.

## Project background

Agyion began as a Stellar hackathon project in Istanbul. Its next step is a complete application in which ordinary payment rules and carefully scoped privacy work together. We welcome review of the contracts, cryptography, wallet boundaries and recovery behavior. A finding should identify a concrete affected path, preconditions, impact and a reproducible test whenever possible.

## License

See [LICENSE](LICENSE) for the repository licence. Components and dependencies retain their own terms. In particular, the private proving composition uses GPL covered dependencies. Repository licensing does not override those obligations.
