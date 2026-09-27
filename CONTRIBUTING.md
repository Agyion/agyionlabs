# Contributing to Agyion

Agyion is a testnet project. Contributions must preserve the distinction between
code that exists, behavior demonstrated by tests and behavior verified on the
published deployment. A successful local test is not a mainnet safety claim.

## Getting started

Use Node.js 22 and the locked dependencies in the root, `app/`, `landing/`,
`privacy/` and `contracts/private-pool/client/` directories. The contract checks
use Rust 1.96.1, the `wasm32v1-none` target and Soroban SDK 28. The deployment tools
use Stellar CLI 28.0.0. The root README describes application configuration and
the separately pinned development proving artifacts.

```sh
npm test
npm --prefix app run typecheck
npm --prefix landing run check
npm run check:private
```

The public kernel is checked with:

```sh
stellar contract build --locked --manifest-path contracts/agyion/Cargo.toml --optimize=false
cargo test --locked --manifest-path contracts/agyion/Cargo.toml --features wasm-tests
cargo clippy --locked --manifest-path contracts/agyion/Cargo.toml --all-targets --all-features -- -D warnings
```

Routine privacy tests explicitly skip the expensive opt-in fresh circuit/proof
runs. They are not evidence that those runs passed. The private verification
script checks committed public proof fixtures against native and WASM contracts;
it does not create a new setup or submit a live transaction. Browser and live
network evidence must identify the exact source and artifact being tested.

## Reviewing a change

Explain the user-visible problem, final behavior, affected authority/funds
boundary and relevant validation. Add a regression that demonstrates the
previous defect when fixing a security or accounting issue. Check failure paths
as carefully as successful settlement: changed wallets, delayed responses,
replay, stale checkpoints, concurrent attempts, token failures, expired records
and unavailable recovery data.

Do not change stored receipt meaning, network identity, circuit public inputs,
contract ABI or setup pins silently. A new contract or proof format requires
matching bindings, deployment verification, recovery behavior and an explicit
migration boundary for existing funds. Never make an unavailable dependency
look successful by substituting a permissive verifier or fabricated balance.

Keep independent token-price and network-fee limits. Treat a transaction with an
unknown result as unresolved until the recorded hash is reconciled. No error
handler should silently send a second payment.

## Repository hygiene

Product source, executable tests, protocol documentation and public test fixtures
belong in Git. Wallet seeds, trustee shares, passwords, encrypted personal vaults,
case documents, local handoff notes, raw review reports and screenshots do not.
Do not stage the entire working tree without reviewing every path.

Generated proving binaries are verified during packaging and excluded from Git.
Never replace pinned development setup keys with a fresh setup just to make a
build pass. Preserve dependency licenses, including the private proving
composition's GPL obligations.

Continuous checks use read-only repository permissions and no deployment or
wallet credentials. They do not deploy a site, create a committee, sign a legal
disclosure request or establish an independent audit.

## Security findings

Follow [SECURITY.md](SECURITY.md). Use local fixtures or dedicated valueless
Stellar testnet identities. Do not attack other users, public services or real
funds. Share sensitive vulnerability details through an established private
maintainer channel rather than a public issue.

For privacy changes, also review the [disclosure boundaries](docs/PRIVACY_DISCLOSURE.md):
cryptographic decryption, authorization policy and lawful identity attribution
are different responsibilities.
