# Cloudflare CSP follow-up — 2026-09-26

**The existing live CSP conflicts remain unresolved.** This is a read-only HTTP review, separate from the dependency remediation and product-page design delivery. No Cloudflare settings, bot protection, analytics settings, Worker, or application runtime were changed.

## Observed evidence

Snapshot: **2026-09-26 19:08:47 UTC** (22:08:47 Europe/Istanbul). Ordinary HTTPS GETs fetched `/`, `/app/?tab=fade`, then `/` again from `https://agyionlabs.dev`. All returned HTTP 200 and `CF-Cache-Status: HIT`.

- Both pages include Cloudflare's 921-byte inline JavaScript Detections bootstrap without a nonce. Its SHA-256 is absent from the response's `script-src`. The two consecutive home responses have different bootstrap hashes, so one build-time hash cannot authorize this changing script.
- Both include the versioned script at `https://static.cloudflareinsights.com/beacon.min.js/v31edd6df95cf4e85bb4c19e7a9bdbcba1788362987495`. That origin is absent from `script-src`, so the current policy also disallows this analytics script.
- The application's own inline script hashes match the policy. `script-src` retains `'self'` and explicit hashes, without `unsafe-inline` or `unsafe-eval`. There is no CSP nonce or report-only replacement.

Ignored local evidence: `artifacts/security/2026-09-26/cloudflare-csp-review/http-observations.json` plus three public HTML captures. The observations contain filtered public response headers and script hashes. This document contains no cookies, analytics tokens, credentials, or private headers. Raw captures are not part of the committed report.

This pass did **not** execute a browser. The conclusion follows from current HTML and enforcement headers; the earlier browser CSP errors in `verification.json` provide historical runtime evidence. A fully clean live-browser verification cannot be claimed while these conflicts remain.

## Safe scope for a separate follow-up

Cloudflare documents a fresh nonce in the **CSP response header**: it reads that nonce and applies it to injected JavaScript Detections. Keep the same-origin allowance for `/cdn-cgi/challenge-platform/` and the existing application hashes. A fixed nonce or meta-only nonce is not the documented solution. Do not use `unsafe-inline` or `Cache-Control: no-transform`; the latter prevents JavaScript Detections injection. [Cloudflare JavaScript Detections](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/)

The current assets-only deployment uses static `_headers`, which cannot generate a fresh nonce per response. A future dynamic HTML-header implementation must preserve existing security headers and ensure cache handling does not reuse a nonce. Worker-generated responses need their headers applied explicitly. This is a separate deployment-layer change, not implemented or validated here. [Cloudflare static asset headers](https://developers.cloudflare.com/workers/static-assets/headers/)

Web Analytics is a separate decision: if retained, authorize only its documented script origin/path, accounting for the observed versioned suffix; retain its injected integrity attribute. Alternatively, disable only optional analytics injection. Neither choice requires weakening bot protection. Existing `connect-src` already permits the same-origin automatic beacon destination. No broad script-source wildcard is needed. [Cloudflare Web Analytics FAQ](https://developers.cloudflare.com/web-analytics/faq/)

All linked official documentation was consulted on 2026-09-26. Zone plan and private configuration were not inspected. No changes were made to Cloudflare or the site; future live runtime verification is still required after any separately scoped fix.
