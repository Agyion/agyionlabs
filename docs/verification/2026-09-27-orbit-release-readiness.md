# Cloudflare release readiness

Read-only preflight checked on 27 September 2026. No deployment or rollback was performed by this check.

## Confirmed current state

- Wrangler 4.138.0 is available locally at `/home/apo110/.npm/_npx/221ece93afb3b6ee/node_modules/wrangler/bin/wrangler.js`.
- `wrangler whoami` succeeded using the configured OAuth identity. The account is `1d26a967af5b2e24f55e3469779135f3`; the session includes Workers, script, and route write permissions. Credential contents were not printed or saved in evidence.
- Worker: `agyion`; custom domain: `agyionlabs.dev`.
- Active version: `8b79160d-6429-447f-ba82-1075598dfca2`, receiving 100% of traffic.
- Active deployment: `ab0a455b-5659-4f41-a78e-4c7a587de750`, created `2026-09-26T23:23:30.023067Z`.
- Current runtime remains static assets served directly. HTML handling is `auto-trailing-slash`, missing assets use `404-page`, compatibility date is `2026-09-20`, and there are no bindings.
- The custom domain is enabled. Workers.dev and preview URLs are enabled, matching the local configuration.

The next release's rollback target is the active version above, not the older rollback ID from the previous release report. Re-read active deployment immediately before publishing if work continues long enough for another deployment to occur.

Read-only API snapshots are in `artifacts/verification/2026-09-27-orbit-release/preflight/`: deployments, settings, domain, subdomain, and active version. These are current network results, not inferred from the previous release document.

## Exact publication command

After all changes pass their final checks, rebuild both projects, assemble once with `node scripts/assemble-site.mjs`, and verify the assembled site. Do not assemble while another browser check is using it. Freeze the reviewed artifact and save a hash manifest before publication.

From `/home/apo110/agyion/app`, run:

```sh
CLOUDFLARE_ACCOUNT_ID=1d26a967af5b2e24f55e3469779135f3 node /home/apo110/.npm/_npx/221ece93afb3b6ee/node_modules/wrangler/bin/wrangler.js deploy --config wrangler.toml --keep-vars --no-autoconfig --message 'Instrument examples and refined orbital navigation'
```

The same command with `--dry-run` validates the upload configuration without publishing. `--keep-vars` preserves any dashboard variables; the explicit configuration keeps the existing custom domain and routing policy. `--no-autoconfig` prevents framework detection from replacing this combined static-site deployment.

The upload is the contents of `app/site`, not a Git branch snapshot. Therefore a dirty tree must be recorded faithfully, or committed before building, rather than reporting HEAD alone as the deployed source. No contract deployment or wallet action is part of this command.

## Post-publication checks

1. Read deployments again and verify the returned new version has 100% traffic. Read version, settings, domains, and subdomain again; compare with preflight except the expected updated assets and build-specific CSP hashes.
2. Compare deployed HTML, immutable application bundles, `/app-assets.json`, and favicon SVG/PNG/ICO bytes against the frozen local artifact. Retain the existing narrowly defined Cloudflare JavaScript Detection normalization; reject unknown HTML changes.
3. Verify security headers and real 404 responses for missing JS and environment-file paths. Do not loosen CSP to silence edge-injected analytics failures.
4. Run `scripts/verify-production-release.mjs` after checking its route/button assertions still describe the final interface. Its output must remain strict: page, console, request, or CSP failures are failures, not silently relabeled passes.
5. Check the current nav, remembered Skip animation control, native new-tab links, six instrument routes, and app form access at desktop/mobile widths. Use the existing read-only write-gate assertion; do not connect a wallet, sign, or move funds during visual release verification.

The previous strict live verification failed on Cloudflare-injected CSP violations and transient testnet network errors, even though asset and UI checks passed. Those historical errors are not automatically waived for this release.

## Rollback command

If the new upload causes a production regression, from `/home/apo110/agyion/app`:

```sh
CLOUDFLARE_ACCOUNT_ID=1d26a967af5b2e24f55e3469779135f3 node /home/apo110/.npm/_npx/221ece93afb3b6ee/node_modules/wrangler/bin/wrangler.js rollback 8b79160d-6429-447f-ba82-1075598dfca2 --config wrangler.toml --name agyion --yes --message 'Restore previous verified website release'
```

Then verify active traffic and repeat HTTP/navigation checks against that version's recorded artifact. Rollback is a separate mutation; it was not run in this readiness check.

## App gas speed implementation note

Both gas shaders receive `uTime` in `shared/space-scene.ts` inside `positionWorld`, currently from `elapsed * 1.35`. A modest increase to roughly 1.55 in the app should keep both materials on the same flow clock and leave the station, flight, and camera clocks unchanged. Switching the multiplier abruptly by mode would change gas phase at the cross-document handoff. Integrate the extra rate after app entry, or carry a validated flow phase with the existing arrival pose, to retain continuity. No runtime speed change was made by this preflight task.
