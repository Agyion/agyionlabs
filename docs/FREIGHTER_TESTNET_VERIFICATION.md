# Real Freighter extension verification

On 27 September 2026, the published `https://agyionlabs.dev/app/` completed a bounded test with the actual Freighter browser extension. The test used a fresh, isolated Chromium profile and a new account funded only by Stellar Friendbot. No existing user wallet, mainnet funds or shared application source was changed.

## Extension provenance

The extension was loaded unpacked from the unchanged official [Freighter 5.48.0 release ZIP](https://github.com/stellar/freighter/releases/tag/5.48.0), associated with commit `a9409f4d3426122cd2984503ce48c791677800ff`.

| Item | Verified value |
| --- | --- |
| Asset | `build-5.48.0.zip`, 10,173,575 bytes |
| SHA-256 | `01ce3164fe74acbdbd56a2c4fa0c0e7a1b3a87a63fdd2482d0b3aacd54b6bd78` |
| Browser | Chromium 153.0.8010.47, Linux snap |
| Tested app HTML SHA-256 | `da25605385a5206c12d6a6344cb5769a3fbf82cdb36df7de828b11c21122c98f` |

The ZIP digest matched the official release asset metadata. Its manifest identified version 5.48.0, and its actual extension service worker, content script, connection window and transaction confirmation UI ran in the browser. This is an unpacked official-release test, not evidence of a Chrome Web Store installation or a separate audit of Freighter's code.

## Completed checks

1. **Wrong network:** Freighter initially used Main Net. After approving the real connection request, Agyion refused the connection with “Wallet is not on Stellar testnet.” No transaction was sent.
2. **Testnet connection:** Testnet was selected through Freighter's UI. Its genuine connection window identified `agyionlabs.dev` and Test Net. Agyion then showed the connected account and Freighter provider.
3. **Merchant backup:** The application's UI created a fresh merchant signing key, downloaded its encrypted backup, locked the key, then restored and checked the same saved file with its password. Registration became available only after this check. No plaintext key was displayed in test output.
4. **Wallet cancellation:** The application presented a separate network-fee review. The real Freighter transaction window showed the same account, Test Net and fee. Cancelling there left the number of `sendTransaction` requests at zero.
5. **Explicit signing:** A new, explicit registration review was opened and confirmed through Freighter. Exactly one `sendTransaction` request was observed. The transaction succeeded, and Agyion displayed the registered merchant key.
6. **Original-profile recovery:** The page was reloaded, leaving the application disconnected. An explicit Freighter reconnect restored the same account. Recovery loaded the original persisted transaction record and its **Check result** action confirmed the same hash. No journal data was seeded or imported, and no second transaction was sent.

## Transaction evidence

| Item | Observed value |
| --- | --- |
| Operation | `register_merchant`, one contract invocation |
| Testnet account | `GCMDV4NGAKUKEEFB5CSGQIUKN4PROP2LUSPYFTVH75JH4DBYQC6EROU5` |
| Contract | `CCS7FTPT5XGKN7Q6Y3W3EIRPNF5LE7AV2FAVZ4YYERNGUBU24AAMCSPJ` |
| Transaction hash | `3a4ca8744e6f10af461963f85914944ca3e4e38b3969f5bf89cd6e303ca07f2c` |
| Result | `SUCCESS`, ledger 4,893,567 |
| User-selected maximum fee | 0.2 test XLM |
| Fee authorized in the reviewed transaction | 0.018367 test XLM |
| Actual charged fee | 0.0152527 test XLM |
| Merchant state | Epoch 1, exact reviewed public key |

Before confirmation, the unsigned XDR from the genuine Freighter request was decoded and checked for the expected source account, contract, single method and fee cap. Its canonical testnet transaction hash matched the included signed envelope. The account's Ed25519 signature on that included envelope verified independently. The intermediate extension response was not separately intercepted. The pinned market reader subsequently verified the on-chain merchant epoch and public key against the reviewed registration arguments.

The immutable result can be inspected in the [testnet Horizon transaction record](https://horizon-testnet.stellar.org/transactions/3a4ca8744e6f10af461963f85914944ca3e4e38b3969f5bf89cd6e303ca07f2c).

## Transport and limits

The application used direct browser HTTPS requests. No scripted wallet adapter, synthetic extension reply, route interception or Node HTTP forwarding was used for connection, signing, submission or UI recovery. Independent post-submission checks used read-only Node RPC and Horizon requests.

This was not an error-free browser run. The isolated context recorded four RPC `ERR_NETWORK_CHANGED` failures, additional Freighter-backend and telemetry failures, and aborted requests from other pages opened during setup. They were retained in the local diagnostics. Existing bounded read-only retries remained unchanged; no signed transaction was automatically retried. A separate Python evidence-download attempt returned HTTP 403, while the existing Node read-only transport returned the matching successful transaction record.

The successful scope is one merchant registration and original-profile reload/reconnect recovery. It does not establish a Freighter-mediated payment, offer funding, pickup settlement, USDC transfer, private proof transaction, hardware wallet or mobile wallet flow. The earlier scripted-wallet marketplace tests retain their own, separate boundaries. This result is not a guarantee that every wallet or network scenario works.

Safe UI screenshots, official distribution metadata, the included public transaction and a structured receipt were retained as local test evidence. Passwords, recovery material and the disposable profile are excluded from the repository. The isolated browser was closed after verification.
