# USDC testnet verification

On **27 September 2026**, the existing marketplace completed **13 included testnet transactions: four setup transactions and nine marketplace transactions**. Eight recorded assertion groups, including the identity check repeated before each phase, checked identity, funding, settlement, replay rejection and final accounting. Three local guard tests also passed. These are development checks, not an independent audit.

## Exact deployment and asset

| Field | Value |
| --- | --- |
| Network | `Test SDF Network ; September 2015` |
| Marketplace | `CCS7FTPT5XGKN7Q6Y3W3EIRPNF5LE7AV2FAVZ4YYERNGUBU24AAMCSPJ` |
| Marketplace WASM SHA-256 | `b1947f2ac6bfa3f42535ed571b956c9fd1ab425b1441adca99d2c8c919ed1c6c` |
| Asset | Circle testnet USDC, 7 decimal places |
| Issuer | `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` |
| Stellar Asset Contract | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |

The issuer and asset contract match the [official Stellar reference](https://developers.stellar.org/docs/build/agentic-payments/x402). The existing marketplace's code was read back and matched the expected WASM bytes. No contract deployment, application setting or release pin changed.

## Funding and outcomes

Fresh dedicated accounts received valueless test XLM from Friendbot. One strict-receive path payment acquired **5 test USDC** through the public Stellar testnet order book. The quoted and actual cost was **4.8106973 test XLM**. The transaction's atomic maximum was **5.0512322 test XLM**, the rounded quote plus 5%, within the separate 10 test XLM hard limit. One test USDC was then sent to the buyer; the seller retained four. No faucet CAPTCHA, new API account or real funds were involved.

Each offer locked a 1 test USDC seller pot.

| Offer | Signed price | Verified outcome |
| --- | ---: | --- |
| 9 | 0.1 USDC | Buyer paid seller; unused seller pot returned. |
| 10 | 0 USDC | No buyer token debit; seller pot returned. |
| 11 | -0.1 USDC | Buyer received the reward; remaining seller pot returned. |
| 12 | 0 USDC | Deadline passed without settlement; refund restored the seller pot. |

All three settlement replays and the repeated refund were rejected during simulation. Exact buyer, seller, contract and reserved-balance changes were checked after each transition. Total charged network fees were **0.2556844 test XLM**, accounted separately from USDC.

A separate read-only pass reconfirmed all 13 included envelopes, transaction results, fees and ledgers. The final offer and balance read responses reported ledger **4893531** and completed at **2026-09-27T06:40:46.943Z**. Seller USDC was **4**, buyer USDC was **1**, marketplace USDC was **0**, and recorded USDC obligations were **0**. No funded offer from this run remained open. These are dated observations, not live balances.

## Run a new verification

The [published helper](../scripts/verify-testnet-market-usdc.mjs) derives from the frozen development harness whose SHA-256 was `45750531adb60b74ce25b3d454e47d0d99d33659db9ab659c4b1db3b658ba658`. Its imports and explicit output-directory handling were subsequently hardened and tested. The dated live receipts above belong to that earlier harness, not retroactively to the published file's exact bytes. Publishing the helper did not repeat the live transactions.

Install the repository's locked root and app dependencies and build the marketplace WASM with the pinned toolchain before funding. Its bytes must match the hash above. From the repository root:

```sh
node scripts/verify-testnet-market-usdc.mjs --plan
mkdir -p artifacts
node scripts/verify-testnet-market-usdc.mjs --prepare artifacts/usdc-check-new
```

The default command and `--plan` perform no network or file writes. Preparation creates only fresh local test keys and a run record. The output must be a new directory under ignored `artifacts`, with existing owned ancestors and no symbolic links. The helper creates it with permissions `0700` and its files with `0600`; keep these files private.

The following explicit commands request Friendbot funding, acquire up to 5 valueless test USDC within the limits above, and then submit the marketplace checks:

```sh
node scripts/verify-testnet-market-usdc.mjs --fund artifacts/usdc-check-new
node scripts/verify-testnet-market-usdc.mjs --exercise artifacts/usdc-check-new
```

Funding and exercise each require the expected previous phase and acquire a separate, exclusive on-disk claim before the first network operation. Concurrent invocations of the same phase have one winner. Claims remain after success, failure or interruption; completing funding permits the separately claimed exercise phase. An existing directory cannot be prepared again, and failed, completed or uncertain phases cannot resume automatically. Every signed envelope and its hash are saved before broadcast. After a failure, inspect the recorded transaction hashes and any open test offers before taking further action; do not reset the phase, delete its claim or blindly rerun a command. Market liquidity, testnet resets, archival and the pinned deployment's availability can prevent a later run. These commands do not change contract addresses or deploy new code.

## Included transactions

Friendbot's account-funding transactions are separate from the 13 harness-signed transactions below.

| Action | Included ledger | Transaction hash |
| --- | ---: | --- |
| Seller USDC trustline | 4893475 | `3729e432be3c864c5f7ce3cb6aab856ff5278d599c18ca5a446e6738a7172016` |
| Buyer USDC trustline | 4893476 | `98c959ccf9a7e393c207803352a73d160391c75c5287b6464f659916e46dedd3` |
| Acquire 5 test USDC | 4893477 | `26bf38cda0d1ab52c4983c9b5b35debda4894dc661da1df861cf295305424995` |
| Send 1 test USDC to buyer | 4893478 | `979c5b22911929c39f37e6535d3feacf280ae565dcb674d920d248076d809a34` |
| Register merchant key | 4893483 | `7923e13dd7cc3fe1955613086c3132edb0058c301c91358c9ce817ac7b08126a` |
| Fund offer 9 | 4893484 | `32fe43b8602d6c78ed5e8605553e2f4a2ae3c885ce1ce4707f000a74adb4f081` |
| Settle offer 9 | 4893486 | `dddac6550eb575db4dfcebc52701348518af1e5013aed374486ef981a17f2dcb` |
| Fund offer 10 | 4893488 | `2f28b09f4341abfe87adc66e826deb0394250b56ba9acf6d01b8f83d8fcae609` |
| Settle offer 10 | 4893490 | `29530c232fbd38834eaf381391e6afbd778a1ae5066036c2e60f16f5bec72095` |
| Fund offer 11 | 4893492 | `74794d07e0702eb474982e00c5ab7cc633bd45be153c6701d48f640ee90db703` |
| Settle offer 11 | 4893494 | `4e01d307abcf58932d878961a54aaae76696ffd75ea3f4e686ca0ded025886a6` |
| Fund offer 12 | 4893495 | `5bb9bd93a517a81a08b8ee478267fcb57d49182851916e81dab927a10e0b52c1` |
| Refund offer 12 | 4893505 | `59c148b0bde282b2ab5539aaee038ac60d0550068cd3a54eed797fd54531c096` |

## Limits

Dedicated local SDK signers submitted these transactions. This does not verify a real browser-wallet extension or manual wallet interaction. It covers USDC walk-in settlement and deadline refund, not every USDC reservation scenario. Issuer freeze, clawback, revoked or missing trustlines, bank payout and mainnet behavior were not exercised. Test tokens have no real value. Confirmation relies on the official testnet RPC; it is not an independent consensus audit or a guarantee that no exploit exists.

See the [marketplace release](../deployments/market-testnet.json), [settlement specification](../contracts/fade-market/SPECIFICATION.md) and [security boundaries](../SECURITY.md).
