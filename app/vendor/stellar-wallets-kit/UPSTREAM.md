# Selected Stellar wallet package

This private local package contains the **selected ESM runtime and TypeScript declaration import closure** of Stellar Wallets Kit **2.7.0** for the SDK/modal, types, Freighter, xBull, LOBSTR and WalletConnect, plus explicitly recorded modal readiness and cached metadata fixes in local version **2.7.0-agyion.3**. It is an Agyion-maintained selection, not an official upstream release. No adapter implementation, signing operation, storage format, event payload or modal styling was rewritten.

The upstream package installs every supported wallet's dependencies even when an application imports only selected modules. HOT is not registered by Agyion, but its NEAR and Solana dependencies introduced nine npm audit entries. This package physically excludes HOT and the other unused adapters, their exports and their dependencies. It does not stub a vulnerable package or suppress audit results. The original broad package is no longer installed. WalletConnect remains available when the application has a configured project ID.

## Provenance

- [Upstream source and MIT license](https://github.com/Creit-Tech/Stellar-Wallets-Kit).
- [Official modular-import documentation](https://stellarwalletskit.dev/kit-structure.html).
- [Exact npm release metadata](https://registry.npmjs.org/@creit.tech/stellar-wallets-kit/2.7.0).
- `PROVENANCE.json` records the upstream tarball URL, its SHA-512 integrity and SHA-256 of every retained file. **83 files are byte-identical** to the archive. The **three patched files**, `esm/sdk/kit.js`, `esm/state/values.js` and `esm/components/pages/auth-options.page.js`, have both original and patched hashes recorded separately.
- `LICENSE` is the [2.7.0 published MIT license](https://jsr.io/@creit-tech/stellar-wallets-kit/2.7.0/LICENSE), SHA-256 `4ce4c85cb464a888f98e0b4bfdef79552d9f38aaefe15f71f2c9bedea2b0772b`.
- The upstream archive also includes Deno standard encoding 1.0.11. Its [MIT license](https://jsr.io/@std/encoding/1.0.11/LICENSE) is retained separately as `LICENSE.std-encoding`.

The package name/version, export list and dependency list differ. The modal patch moves `authModal`'s provider availability refresh before rendering: upstream rendered cached provider rows, awaited a second refresh for up to one second, then subscribed to close events. A close during that interval was lost. The patched chooser appears only when its event subscriptions can be installed in the same synchronous turn; availability results, selection and error payloads are unchanged. This was reproduced with the actual SDK under a delayed provider and in Chromium without connecting a wallet.

The cached metadata patches bound and validate hardware path/session arrays and provider ordering. Invalid JSON or wrong-shaped old browser data previously threw during module initialization or chooser rendering. Malformed entries now produce empty in-memory metadata; valid entries retain their existing representation. These are public provider hints, never signing authority. No application balance, key vault or transaction recovery journal is cleared. A fresh wallet account/network check remains mandatory. This does not claim that the SDK supports browsers which prohibit storage entirely.

The ESM-only package exposes six explicit subpaths. It has no install scripts and ships no archive or generated binary. Its maintenance tool is not executed during installation.

## Verify or update

From `app/`, download the exact published source without lifecycle scripts:

```sh
npm pack @creit.tech/stellar-wallets-kit@2.7.0 --ignore-scripts --pack-destination /tmp
node vendor/stellar-wallets-kit/select.mjs /tmp/creit.tech-stellar-wallets-kit-2.7.0.tgz --verify
npm ci --ignore-scripts
npm run test -- tests/wallet-dependencies.test.ts tests/walletsKit.security.test.ts tests/selected-wallets.test.ts tests/wallet-cache.test.ts
npm audit
npm audit --omit=dev
```

`select.mjs` validates the pinned archive integrity, follows all imports from the six retained exports (including declarations), and derives the external dependency list from the source. It verifies original file hashes and exact patch sites before applying the three fixes. Running it without `--verify` reproduces the selected source/package/manifest **and the documented patches**; `--verify` checks that result against the retained files. The dependency test also checks that no stale or unsupported module was left in the selected tree and no removed dependency was reintroduced in the application lockfile.

For a newer upstream version, review its release/source and all selected-wallet changes first. Reassess whether upstream fixed the modal race; remove the local patch if so, otherwise review its applicability before changing the original-file hash guard. Update the archive pin and local version deliberately, regenerate the closure into a clean `esm/` directory, retain applicable licenses, review the resulting diff, refresh the lockfile, and run the wallet integration/security tests, full application tests, typecheck, build and both audits. Monitor upstream advisories/release notes: npm cannot report advisories against copied first-party source by its old package name. `PROVENANCE.json` makes that manual upstream comparison explicit. Return to the upstream package if its packaging becomes suitably modular; do not assume the local copy receives upstream fixes automatically.

Existing safety constraints remain: Agyion refuses to connect or sign if a wallet cannot report the expected Testnet network, including adapters whose upstream `getNetwork` is unsupported. This change does not relax that requirement or claim those providers were exercised with real installed wallets.
