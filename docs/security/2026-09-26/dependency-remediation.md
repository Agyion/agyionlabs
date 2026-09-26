# App dependency remediation — 2026-09-26

The application audit went from **4 low + 5 moderate entries to zero** for both `npm audit` and `npm audit --omit=dev`. The final `.2` candidate passes a clean installation, all **477 application tests**, TypeScript, targeted lint and the Next.js production build. No audit suppression, vulnerable-package stub, forced downgrade, wallet connection, publication or chain transaction was used.

## Cause and selected fix

The app used the latest published `@creit.tech/stellar-wallets-kit@2.7.0`. Although it registered only Freighter, xBull, LOBSTR and optionally WalletConnect, the upstream npm package declared all wallet backends as dependencies. All nine audit entries came through its unused `@hot-wallet/sdk@1.0.11` dependency:

| Installed path | Audit consequence |
| --- | --- |
| Wallets Kit → HOT → `@near-js/crypto` → `secp256k1` → `elliptic@6.6.1` | Four low entries, including ancestor metavulnerabilities; underlying [elliptic advisory GHSA-848j-6mx2-7j84](https://github.com/advisories/GHSA-848j-6mx2-7j84). |
| Wallets Kit → HOT → `@solana/web3.js` → `jayson` → `stream-json` / `uuid` | Five moderate entries including ancestors; underlying [stream-json GHSA-528h-pc64-c93x](https://github.com/advisories/GHSA-528h-pc64-c93x) and [uuid GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq). |

The counts are npm's package-level entries, not nine independently reproduced exploits. Registry queries confirmed that both [npm Wallets Kit](https://registry.npmjs.org/@creit.tech/stellar-wallets-kit/latest) and [JSR Wallets Kit](https://jsr.io/@creit-tech/stellar-wallets-kit/meta.json) still published 2.7.0 as latest, and [HOT](https://registry.npmjs.org/@hot-wallet/sdk/latest) still published 1.0.11. The audit's proposed downgrade to Wallets Kit 1.5.0 was rejected. Upstream documents [per-module imports](https://stellarwalletskit.dev/kit-structure.html), but those imports alone do not prune npm's installed dependency graph.

The app now installs the explicitly named local package **`@agyion/stellar-wallets-kit@2.7.0-agyion.2`**, from `app/vendor/stellar-wallets-kit`. It contains only the transitive ESM/declaration import closure for the existing SDK/modal, types and four selected adapters, with the documented modal fix below. The unsupported adapters, including HOT, are physically absent; their exports and external dependencies are absent too. There is no alias that pretends the vulnerable upstream package was patched.

Of the 86 retained runtime/declaration files, **85 are byte-identical** to the official npm 2.7.0 tarball. The only changed file is `esm/sdk/kit.js`; both its original and patched SHA-256 are recorded. The archive's SHA-512 integrity is verified before extraction. The original MIT license and the bundled Deno encoding license are included. The maintainer tool independently reproduces/verifies the selection and explicit patch. See [package provenance and update procedure](../../../app/vendor/stellar-wallets-kit/UPSTREAM.md) and [file manifest](../../../app/vendor/stellar-wallets-kit/PROVENANCE.json).

## Change scope and preserved behavior

- `app/package.json` replaces one direct dependency; `app/package-lock.json` removes the unused graph. No retained registry package changed version. Three Twind packages move from the former kit's nested location to the top level at the same versions.
- `app/app/lib/walletsKit.ts` changes import specifiers only. Connection cancellation, wallet-session invalidation, Testnet/account checks, unchanged-envelope verification and connected-account signature checks are unchanged.
- The modal now completes availability discovery before becoming interactive. Provider labels, install state, event payloads, styling and selected-provider API remain unchanged. WalletConnect remains conditional on the application's project ID.
- Two new test files exercise the dependency boundary and the actual copied SDK, modal and adapters. Existing signer tests only change their import mock paths.

The pre-existing fail-closed network requirement remains: xBull, LOBSTR and WalletConnect currently report `getNetwork` as unsupported in this upstream version. Their modules remain available, but Agyion will not register a signing session without verified Testnet identity. This dependency change does not relax that rule or claim successful real-wallet testing.

## Modal cancellation follow-up

The first actual bundled-modal browser check found an upstream timing defect: the app's preliminary availability check had populated provider rows, then `authModal` rendered those rows before awaiting a second check. Its close-event subscription was not installed until that check completed. The first visible close click was lost; a second click later succeeded. This reproduced without selecting a wallet, with no console, request or CSP error in the local browser. The original failure remains in `artifacts/verification/product-pages/wallet-modal/results.json`; the diagnostic repeat, including successful second-click evidence, is in `wallet-modal-race/results.json` beside it.

A new actual-SDK regression failed before the fix with a pending provider probe and is now green. Local version `.2` moves the existing bounded availability refresh before rendering, so the visible chooser and its event subscriptions are created in one synchronous turn. It adds no monkeypatch, signing change, new dependency or suppressed error. `select.mjs` applies this exact change only after checking the pinned original SDK hash, and the manifest records both hashes. The `.1` selection originally had 86 unchanged files; the final `.2` candidate has 85 unchanged files plus this one reviewed patch.

## Verification

| Check | Result |
| --- | --- |
| Initial dependency-boundary regression | Failed before the selected package existed; subsequent checks verify both copied import closure and removal from the lockfile. |
| `npm ci --ignore-scripts` | Clean installation succeeded; zero audit entries. Lifecycle scripts were not needed for the successful build. |
| `select.mjs <official-tarball> --verify` | 85 unchanged files, one documented patched file and 12 reachable direct dependencies. |
| Actual retained SDK/provider/modal tests | 8 passed: Freighter nonprompting reads and rejection; xBull bridge cleanup; LOBSTR forwarding; WalletConnect Testnet/sign-only request; modal selection/events; install state/cancel cleanup; first visible close during a slow provider probe. Wallet transports are synthetic. |
| Entire app unit suite | 33 files, 477 tests passed; includes unchanged-payload, wrong-network, changed-account and late-connect cancellation protections. |
| `npm run typecheck` and targeted ESLint | Passed. |
| `npm run build` | Passed, including Next.js lint/type/static export stages. No site assembly or deployment. |
| Actual bundled chooser in the assembled local site | Passed at 1440, 390 and 320 px: first close works, reopening works, expected providers appear, HOT is absent, dialog fits the viewport, connect control recovers and transaction controls remain disabled. No added timing workaround. Zero page, console, request or CSP errors. Static captures were also inspected. No provider was selected or connected. |
| `npm audit --json` | 0 low, 0 moderate, 0 high, 0 critical. |
| `npm audit --omit=dev --json` | 0 low, 0 moderate, 0 high, 0 critical. |

The before/after audit results are preserved in [dependency-evidence](dependency-evidence/). Raw local build/test evidence is under `artifacts/security/2026-09-26/dependencies/`: `app-audit-before.json`, `app-audit-all.json`, `app-audit-production.json`, `app-ci.txt`, `app-tests.txt`, `app-typecheck.txt`, `app-wallet-lint.txt`, and `app-build.txt`. These ignored artifacts are local evidence; the reproducible source/lockfile/tests are the checked-in candidate.

The `.2` follow-up preserves the failing regression in `modal-race-red.txt` and fresh verification files with the `-modal-fix` suffix (`app-ci`, `app-tests`, `app-typecheck`, `app-wallet-lint`, `app-build`, and both audit JSON files). The original `.1` results are retained rather than overwritten. Fresh installation reports existing package deprecation notices; these are not npm security advisories and are not suppressed.

Final local browser evidence: `artifacts/verification/product-pages/wallet-modal-fixed/results.json` and `{1440,390,320}.png`, captured on 2026-09-26 at 19:34 UTC after the coordinator assembled the patched app. This confirms the local modal fix, not production deployment or resolution of the separate live Cloudflare CSP conflict.

## Maintenance boundary

This is an internal dependency selection, not an external security audit or a new upstream release. npm continues auditing every retained registry dependency, but cannot automatically associate a future advisory against Wallets Kit's own copied code with this private package name. Future upstream releases/advisories require explicit review and regeneration using the documented procedure. No installed-wallet, WalletConnect relay or live-signing session was exercised. Audit results describe the advisory database and lockfile at the date above, not a claim that all software defects are absent.
