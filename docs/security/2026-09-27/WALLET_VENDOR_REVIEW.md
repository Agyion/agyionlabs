# Selected wallet vendor review, 27 September 2026

This is an internal defensive source review of the selected wallet package used
by Agyion. All 43 retained JavaScript runtime files (3,353 final lines) and the
123-line selection tool were read in full, including the copied Deno standard
encoding implementation. It is not an independent audit of the Stellar SDK,
external wallet extensions, WalletConnect services, or the package's npm
dependencies. No actual wallet connection, signature or network transaction was
performed. The public-client report owns the surrounding application checks.

## Fixed: malformed cached metadata could break the wallet chooser

The SDK previously parsed hardware paths and WalletConnect session metadata with
an unguarded `JSON.parse` while initializing its state module. A malformed saved
value caused import failure; a rejected module cannot be repaired by retrying the
same import within that page. Separately, provider ordering accepted JSON objects,
nulls or malformed entries and then called array methods while rendering the
chooser. Valid JSON alone did not make this cached input safe.

The import failure was reproduced with local synthetic storage and no wallet.
New regression tests on the old source produced ten failures and three passes,
with two unhandled rendering errors. The regression covers invalid JSON, wrong
types, null rows, excessive lengths, malformed path/session rows and wrong-shaped
provider ordering. This is a local availability defect, not demonstrated signing
authority bypass or theft.

Local version `2.7.0-agyion.3` adds bounded parsing and shape checks:

* Path/session records are at most 65,536 characters and 128 rows, with exactly
  the public account and path index or session topic fields. Hardware indexes
  must be integers from zero through 2^31 minus one; session topics are bounded
  nonempty strings. The account check is a shape filter, not address checksum
  verification or proof of wallet control.
* Provider ordering is at most 16,384 characters and 128 bounded string IDs.
* Invalid cached metadata becomes an empty in-memory list. Valid metadata retains
  its representation. No application vault, balance or transaction recovery
  journal is cleared. These cached hints never become signing authorization.

The existing modal-readiness patch remains unchanged. The selection tool checks
the original complete file hashes and unique patch sites before applying each of
the three patches. The local package and lockfile version were updated together;
the installed file dependency already points to this vendor directory by symlink.
No external dependency version or resolution was changed by this correction.

## Runtime boundaries inspected

The full retained runtime covers SDK initialization, provider selection and
availability, modal lifecycle/events, account selection, transaction/auth/message
forwarders, Freighter/xBull/LOBSTR/WalletConnect adapters, cached state, hardware
account UI, profile UI, shared rendering helpers, and encoding helpers.

The review traced the following boundaries:

* A selected-network setting is application state, not evidence of the wallet's
  actual network. Freighter queries its provider API; the retained xBull, LOBSTR
  and WalletConnect adapters throw for `getNetwork`. Agyion's surrounding wrapper
  rejects unsupported or wrong-network responses. Those adapters therefore do
  not establish working Testnet signing solely by appearing in a chooser.
* Forwarding a payload through the vendor does not by itself prove account,
  network, envelope or signature identity. The public-client wrapper performs
  fresh checks around signing; that implementation and its tests have a separate
  coverage report. The vendor is not a substitute for those checks.
* Public account, provider, hardware path and session-topic metadata can create
  privacy correlations in local storage. They are not private-pool spending keys.
  No promise of anonymity, fresh session validity or safe same-origin scripts is
  inferred from cache validation.
* The retained upstream WalletConnect adapter requires a project ID and depends
  on external transport implementations. Agyion's final application factory
  offers only Freighter; configuring a WalletConnect ID does not expose an
  unverified-network adapter. Actual disconnect/reconnection, extension prompts,
  session expiry and mobile wallet behavior were not exercised here.
* Runtime rendering uses the retained Lit templates. Provider product links and
  icon URLs are upstream constants in the selected adapters; their external
  requests still reveal metadata. No live provider endpoint was probed.
* All copied standard-encoding runtime was read, including hex, base32/58/64,
  ascii85 and varint paths and their common helpers. The selected Freighter code
  uses base64 encoding for auth/message forwarding. Other retained decoders are
  import-closure code, not the application's canonical financial-input validators;
  permissive decoding should not be promoted to such a boundary without separate
  validation.

No additional confirmed authority or fund-loss finding resulted from this bounded
vendor pass. This is not a guarantee that none exists. Browsers that prohibit
storage entirely remain outside the demonstrated compatibility: the upstream SDK
still accesses browser storage and persists state. The correction specifically
handles malformed cached metadata in otherwise available storage.

## Source provenance and verification

The exact existing archive `creit.tech-stellar-wallets-kit-2.7.0.tgz` was used for
local regeneration and verification. Its pinned SHA-512 integrity is:

`sha512-gH+eCIUKvE7DZx9ZFCFog1JSpi5Jf28wHTLa67CzAXoJFQkcqkoQ9j2LilHrZPla8M43MjW0COQiFvrlS/pLMg==`

The selection tool followed the runtime and declaration closure from six explicit
exports and verified 86 retained files: 83 unchanged upstream files and three
explicit patched files, with 12 direct external dependency packages. The original
archive hashes and final patched hashes are recorded in `PROVENANCE.json`.
The complete declaration closure was checked for presence and exact hashes, not
manually reviewed line by line. Both upstream MIT licenses remain retained.

Logs are in `artifacts/security/2026-09-27-compatibility/wallet-vendor/`:

| Check | Result | Evidence |
| --- | --- | --- |
| Malformed-cache module import before fix | Reproduced SyntaxError | `malformed-storage-baseline.log` |
| New cache regression before fix | 10 failed, 3 passed, 2 rendering errors | `cache-baseline-tests.log` |
| Package regenerated from pinned archive | Passed | `selection-regeneration.log` |
| Cache, dependency, selected-wallet and wrapper security suites | 32 passed across four files | `vendor-tests.log` |
| Exact archive and selected closure comparison | 83 unchanged files, three patches, 12 dependencies | `upstream-verification.log` |
| Scoped whitespace check | Passed | `git diff --check` on vendor, cache/dependency tests and app lockfile |

The new cache suite has 13 tests. Its synthetic SDK chooser test opens and closes
the actual retained modal without requesting an account or signature. It uses
jsdom; it does not claim real extension or mobile wallet coverage. Broader app
test/typecheck/build results belong to the parent/public-client final report.
No new current-advisory claim is made by the archive comparison. Copied source
requires explicit upstream monitoring because npm advisory lookup does not audit
it by its original package name.

## Exact source coverage

The following final hashes and inclusive line ranges cover every retained `.js`
file and `select.mjs` read in this pass. `wallet-vendor-coverage.json` also records
the package/provenance/documentation and the two cache/dependency test files.
Third-party npm implementations and generated `.d.ts` declarations are excluded
from manual implementation coverage. Application wrapper coverage must not be
double-counted with the separate public-client report.

| Path | Lines | SHA256 |
| --- | --- | --- |
| `app/vendor/stellar-wallets-kit/esm/components/app.js` | 1–59 | `ddb433a8f127adb7a6e0e5423cf25a13f46bd7fa67a083daa332f79896baa55e` |
| `app/vendor/stellar-wallets-kit/esm/components/kit-button.js` | 1–34 | `49bbee678c0b9bac8b31031f72feef784bd19fc5ecdab7dff825d58a7da834e9` |
| `app/vendor/stellar-wallets-kit/esm/components/mod.js` | 1–4 | `9b32cc1809b3816f65d41ec57a798facd919928deff4c127fdfc571e899d01f2` |
| `app/vendor/stellar-wallets-kit/esm/components/pages/auth-options.page.js` | 1–125 | `a196ea74ca482f9f560f22976decbbcccec126a5063435cf3bcf090f47f0132f` |
| `app/vendor/stellar-wallets-kit/esm/components/pages/hw-accounts-fetcher.page.js` | 1–107 | `ecc174a386a3aaab6787a6c71ecc64f511ec314a3a3152b37eebe588a71bf056` |
| `app/vendor/stellar-wallets-kit/esm/components/pages/profile.page.js` | 1–47 | `17a9f4398e6a5e9551c51484b31387549ccac792861c1e7be7c39751e64b0f87` |
| `app/vendor/stellar-wallets-kit/esm/components/pages/what-is-a-wallet.page.js` | 1–22 | `1738c9296180bf65b2a1396434071c8a86a64ba3ac6eb56816b692f7bedc9967` |
| `app/vendor/stellar-wallets-kit/esm/components/router.js` | 1–51 | `fa7a47496ce699c511673f7854de5b403bf5dfb2a318d958c8f22869c5cd8662` |
| `app/vendor/stellar-wallets-kit/esm/components/shared/avatar.js` | 1–16 | `02ca00a4b1e4b941487017309b00cdc55230336c29f97436ba300080241bfdcf` |
| `app/vendor/stellar-wallets-kit/esm/components/shared/button.js` | 1–55 | `d34c75bb929e27a5a33248171022c59664061c1f0839ba0a649d1ee04f5cc11c` |
| `app/vendor/stellar-wallets-kit/esm/components/shared/footer.js` | 1–14 | `e6e9b469cca86817b2260649607dc85da53b1d2ba2dd90caadfe9b321810d44b` |
| `app/vendor/stellar-wallets-kit/esm/components/shared/header.js` | 1–64 | `637bdbd6208f54d204154f2df7d21d39d2380038f871962d69e6b6146690643f` |
| `app/vendor/stellar-wallets-kit/esm/components/shared/mod.js` | 1–4 | `18d25aeb37931986e2f6b7154ddb028b5ca1590ac83da798f45280918db923c9` |
| `app/vendor/stellar-wallets-kit/esm/components/twind.js` | 1–227 | `f68ee4faca798f8d6f75395ac0c5b95c9d37bf26bbdfd82af321fa35a11f9737` |
| `app/vendor/stellar-wallets-kit/esm/deps/jsr.io/@std/encoding/1.0.11/_common16.js` | 1–51 | `ca868cc4c66769d9a69054fdbe9f7b21989775db9981714a7870fe3513fec270` |
| `app/vendor/stellar-wallets-kit/esm/deps/jsr.io/@std/encoding/1.0.11/_common32.js` | 1–192 | `c219a4a316fda2d03c891bcd21ccd47d3b9cfcbaf0b6eb07023d6729dbf37afe` |
| `app/vendor/stellar-wallets-kit/esm/deps/jsr.io/@std/encoding/1.0.11/_common64.js` | 1–113 | `52f938510b2a9b429285b17f9ed08a9ffbe553ff3fec01e8edb485dd5d8047d7` |
| `app/vendor/stellar-wallets-kit/esm/deps/jsr.io/@std/encoding/1.0.11/_common_detach.js` | 1–13 | `06834bd38b73f8e7b13e65bbb7dbccff36d53626af8ef66d69d3fcebebdeb311` |
| `app/vendor/stellar-wallets-kit/esm/deps/jsr.io/@std/encoding/1.0.11/_types.js` | 1–2 | `e5a59ff0ddca9783a3b98607fe7db48d7bd9d0ee03c518462d72ce0f8f7ac989` |
| `app/vendor/stellar-wallets-kit/esm/deps/jsr.io/@std/encoding/1.0.11/_validate_binary_like.js` | 1–26 | `c41e2659c36bc47d908a004fa500ea1a1fe4dba00bb40859883cd8640106496f` |
| `app/vendor/stellar-wallets-kit/esm/deps/jsr.io/@std/encoding/1.0.11/ascii85.js` | 1–152 | `e6c892c42a16014e7ec17157978b1249fcf189e04d937f06b2a80cafcd77620b` |
| `app/vendor/stellar-wallets-kit/esm/deps/jsr.io/@std/encoding/1.0.11/base32.js` | 1–87 | `5bc3c69e7274d9a8e017768b40e9be1ce5731fd5cacd2df87d7e1721b2d889ba` |
| `app/vendor/stellar-wallets-kit/esm/deps/jsr.io/@std/encoding/1.0.11/base58.js` | 1–131 | `7acd8a686a21c6407fc83840b7678b8fdc31f3afbd3a400616a162120e0b1a7c` |
| `app/vendor/stellar-wallets-kit/esm/deps/jsr.io/@std/encoding/1.0.11/base64.js` | 1–82 | `bed8935e89cbef6f7184b545443876bb577eeb48992619ef43cae5691b9bcd52` |
| `app/vendor/stellar-wallets-kit/esm/deps/jsr.io/@std/encoding/1.0.11/base64url.js` | 1–72 | `0184708e9205f869639afee3ea82b93f90b6838ae6df556468147549d9ee4c91` |
| `app/vendor/stellar-wallets-kit/esm/deps/jsr.io/@std/encoding/1.0.11/hex.js` | 1–87 | `7031e924d3769b3466b74e726993cf664b5c2ed2c3a698287eaaa1bd347a59f3` |
| `app/vendor/stellar-wallets-kit/esm/deps/jsr.io/@std/encoding/1.0.11/mod.js` | 1–99 | `bdf45469dd210c1e0881d45016d40775bdfa4265da003335f9bf4dc7747fae28` |
| `app/vendor/stellar-wallets-kit/esm/deps/jsr.io/@std/encoding/1.0.11/varint.js` | 1–209 | `1ed47eb014cc44ae40277309318217e7a0d3984ddebcbdcbfce0d737eed40ff9` |
| `app/vendor/stellar-wallets-kit/esm/sdk/kit.js` | 1–253 | `a7fc479f0065b6eb84f7756103b9135d0b5b71be82e6af0c543a92bc376e2ffc` |
| `app/vendor/stellar-wallets-kit/esm/sdk/mod.js` | 1–2 | `d873742575f778d0191b79ab96a1154f34e692fcd4082f94ff5dad89a4daf792` |
| `app/vendor/stellar-wallets-kit/esm/sdk/modules/freighter.module.js` | 1–158 | `879f687b4e3eced72ace8158816111ad6965d1067d7592be8ebe34df7c5545a6` |
| `app/vendor/stellar-wallets-kit/esm/sdk/modules/lobstr.module.js` | 1–103 | `c7b1b6bf341e14fddf1c66ae7395df04f7d73ee114a3cd13710642c9923f1eb9` |
| `app/vendor/stellar-wallets-kit/esm/sdk/modules/wallet-connect.module.js` | 1–301 | `25d972ee0cdc57c70cdd814954e4d535f59489a01172d0a0cad47d6c33f3a681` |
| `app/vendor/stellar-wallets-kit/esm/sdk/modules/xbull.module.js` | 1–99 | `c8924d9f4d4cd360c786e1e2ef568ce5fc64971710c2cc8534ee32bea9c54de2` |
| `app/vendor/stellar-wallets-kit/esm/sdk/utils.js` | 1–17 | `692d38ba83333dddebb0bb036ea6769b3f0d90e2785ec5a3fbc72eb3c45d8524` |
| `app/vendor/stellar-wallets-kit/esm/state/effects.js` | 1–49 | `b0eb77e23dbd335c6aeb0b9d694040e0aadc2b794426422b8c861a5dc2693519` |
| `app/vendor/stellar-wallets-kit/esm/state/events.js` | 1–80 | `de2e22add3c278f0fe26ee71268ea77d9fbe2b0a7d39326fc92af8c0e38fe44d` |
| `app/vendor/stellar-wallets-kit/esm/state/mod.js` | 1–3 | `d5044618c39f02b40e5bf1a7c54c5d4ac03f0c81b79800c622dcde16944ea04b` |
| `app/vendor/stellar-wallets-kit/esm/state/values.js` | 1–59 | `0e8caa51399025aa14e0f3a92c17b2d08f0fcd483dca86ac9ad085a5fd7d20d6` |
| `app/vendor/stellar-wallets-kit/esm/types/components.js` | 1–51 | `4e16bbd5a5e376ebb017d61c8003aa8b28aa6315337687c1ae70ab45edca94b7` |
| `app/vendor/stellar-wallets-kit/esm/types/mod.js` | 1–24 | `f4327c8d6e32f9cbfb89ca958ca6c229140112336dffb40bd740aaa60917445e` |
| `app/vendor/stellar-wallets-kit/esm/types/sdk.js` | 1–1 | `8e609bb71c20b858c77f0e9f90bb1319db8477b13f9f965f1a1e18524bf50881` |
| `app/vendor/stellar-wallets-kit/esm/types/storage.js` | 1–8 | `f936c3539bce4bf8990f54dc73aa98749f991ab26f6139d466506d82dedb34bd` |
| `app/vendor/stellar-wallets-kit/select.mjs` | 1–123 | `0e24bdb60da2fc9f5a2a071354cb049d36c7e35206e2089a63239462335442a9` |
