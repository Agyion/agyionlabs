# Security

Agyion currently targets Stellar testnet. Do not use this release for real funds.
The project has not received an independent security or cryptographic audit.

## What the application checks

* The configured network, contract instance and actual WASM hash must match the reviewed public release before a transaction is prepared.
* Wallet approval is bound to the requested account, network and transaction envelope. A changed wallet session invalidates an in progress action.
* Pending transaction hashes are recorded before submission. An uncertain outcome is reconciled using the original hash, without automatically sending another payment.
* Contracts enforce authorization, time windows, recipient binding, conservation and replay protection. Atomic failures must preserve recorded liabilities.
* Private proofs are produced locally. Secret witnesses, vault passwords and trustee shares do not belong in RPC requests, logs or transaction journals.

These are implementation properties backed by specific tests, not a guarantee against every attack.

## Material trust boundaries

The public application relies on its wallet extension, RPC provider, token issuer and browser environment. A code hash returned by a compromised provider is not an independent consensus proof. Token freezing or clawback remains subject to the asset's issuer controls.

The original public kernel and original private pool do not enforce an aggregate
backing check after issuer clawback. Local tests using their exact deployed code
showed that an early claim can consume backing needed by later claims. The
separate marketplace already rejects that deficit. The observed Circle testnet
policy had clawback disabled; this is a conditional asset control risk, not an
observed Circle exploit. See the dated [issuer control findings](docs/TOKEN_ISSUER_RISKS.md)
and their release boundary before adding assets or treating a new source build
as a fix to an immutable deployed contract.

The [current private testnet default](docs/PRIVATE_POOL_GUARDED_TESTNET.md) uses a
new immutable pool with aggregate backing checks. Its XLM and USDC lifecycles
were exercised separately. The app retains the old private profile for recovery
and blocks new funding there. This client policy cannot prevent older clients
or direct calls from funding the original contract. A backing guard also cannot
undo an issuer freeze or replace tokens already removed by an authorized issuer.

Physical handoffs and external events depend on the configured signer. A contract can verify a signature without establishing that the signed statement is true. Transaction inclusion order does not establish equal network access or fair click order.

The public marketplace catalog is a discovery snapshot. It cannot settle a
payment, create a reservation or authorize the private pool. Merchant metadata
is signed and bound to immutable contract terms; clients still reread the pinned
contract before any transaction. One active reservation per seller and claimant
is an address-level limit, not proof of a unique person. A merchant's key rotation
preserves the key snapshot of already accepted short reservations. Keep those
earlier backups until their leases end.

Map tiles load only after an explicit request and go directly to OpenStreetMap.
The provider receives the connection IP and viewed area. No automatic customer
geolocation, route tracking or private-note data is used by public discovery.

The private implementation has additional requirements. Its development setup does not establish an independent trusted setup ceremony. Locally operated threshold test keys do not establish independent trustee custody. A cooperating threshold can decrypt outside the application's approval workflow. Deposits, withdrawals, fees, submitting accounts and timing can reveal relationships even when note contents are encrypted.

Browser storage can be deleted or rolled back. Losing private keys and their encrypted recovery backup can make funds unrecoverable. Archived contract state requires network restoration and normal transaction fees. Recovery must reject incomplete history rather than display an invented balance.

The [authorized disclosure model](docs/PRIVACY_DISCLOSURE.md) distinguishes
technical decryption, protocol identifiers and legal identity. The live
development committee is not an independent legal disclosure service.

## Reporting a vulnerability

Contact the repository maintainer through an established private channel to arrange confidential disclosure. Include the affected commit and component, preconditions, expected impact and a minimal reproduction using local fixtures or valueless testnet assets.

Do not publish wallet secrets, recovery files, personal information or a working attack against another person's funds. Do not test against third party infrastructure without permission.

## Verification

Run the workspace tests with `npm test`. Contract and private client checks have their own commands in the component documentation. Optional real proof suites and browser or live network tests must be explicitly enabled. A skipped suite is not a passing result.

Historical test counts do not certify later code. Any contract or circuit change requires new tests, exact artifact verification and matching deployment configuration. Mainnet activation requires a separate security and operational release decision.
