# Ledger maximum amount layout check

Local preview: `http://127.0.0.1:4292`.

Result: **16/16 UI checks passed**. Browser, console, CSP, HTTP and request diagnostics also passed in this run. The browser closed after completion.

Two explicitly labelled synthetic records were seeded into a fresh isolated browser context for each viewport. They used the valid Ledger storage schema, `status: recorded`, `txHash: null`, `ledger: null`, and no wallet, network or contract attribution. These fixtures are not transaction evidence or balances.

The amounts were the signed i128 bounds, in 7-decimal minor units:

- Maximum: `170141183460469231731687303715884105727`
- Minimum: `-170141183460469231731687303715884105728`

| Viewport width | Amount column width | Lines per amount | Clipped text lines |
| --- | --- | --- | --- |
| 320 | 92.70 px | 7 | 0 |
| 390 | 124.20 px | 5 | 0 |
| 768 | 203.30 px | 3 | 0 |
| 1440 | 220.11 px | 3 | 0 |

Both amounts retained every digit, sign and decimal place. All rendered text lines fit the amount box, clipping ancestors and viewport. Expanded details remained within their available width. The summary showed two local records and zero hashes; the unsigned-history disclaimer remained visible. The 320 px maximum and 1440 px minimum screenshots were also visually inspected.

No wallet was connected, no signing was requested and no transaction was submitted. The application made its normal `simulateTransaction` readiness requests; none failed in this run. This check does not establish financial validity or device frame rate.

Reproduce with:

```sh
QA_OUTPUT_DIR=artifacts/verification/2026-09-27-ledger-long-amounts-final node scripts/verify-ledger-long-amounts.mjs
```

Evidence: `artifacts/verification/2026-09-27-ledger-long-amounts-final/results.json`, plus eight screenshots in that directory. The script refuses non-local preview origins and never uses the user's persistent browser profile.
