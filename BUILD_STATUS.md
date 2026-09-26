# Agyion — Final Build Status (2026-09-20)

> Historical checkpoint, not the current release or audit status. Read
> [HANDOFF.md](HANDOFF.md) and the
> [27 September review](docs/security/2026-09-27/CLIENT_FADE_REVIEW.md).
> Complete repository and independent security reviews remain outstanding;
> the published old kernel's V3 write path is disabled.

## Verified green (verifier/runs/)
- Contracts: 4 templates (Fade, Pod, Trigger, Envoy) · `cargo test` **30/30 PASS** at this historical checkpoint · internal review with 4 fixes (refund overflow, Envoy claim cap, Trigger deadline, TTL); not a completed independent security audit
- Frontend: English, v3 motion system — zero scroll-linked animation (no useScroll/scrub anywhere); hero is a deterministic looping code-drawn lifecycle scene (capsule + decay curve + ticking price), template cards use entrance stagger + hover layer-shift + always-on micro-motion loops, lifeline self-draws on its own clock · `npm run build` exit 0, static export in `app/out/` · Playwright visual QA pass (desktop + mobile + reduced-motion)
- GitHub: moved to `Agyion/agyionlabs` (public, code-only; pitch/video excluded)
- Cloudflare Worker `agyion`: deployed (API 200) · 107 assets uploaded · workers.dev subdomain enabled → `agyion.jasurbek-rustamov.workers.dev`
- Docs: README.md, docs/PITCH.md (15 slides + speaker notes), docs/DEMO_SCRIPT.md, docs/LIMITATIONS.md — all English
- Media: hero.png, og.png, 4 template icons, texture.png, hero-loop.mp4, docs/video/agyion-demo.mp4 (74s cinematic walkthrough, Playwright-recorded)
- Verifier logs: verifier/runs/ (cargo test, deploy, final)

## Blocked on user side (cannot be done from sandbox)
1. ~~Testnet contract deploy~~ — DONE 2026-09-20: `CAVVTPBBNOCMDBC26CVOXKSU7B7MDK33TXQXTVUVKSJHSVKGLZTVJ5N5` on testnet (stellar CLI 28, wasm from `stellar contract build`). App configured via `app/.env.local` (soroban mode).
2. **Visual check of CF worker** — sandbox DNS is poisoned for workers.dev; open `https://agyion.jasurbek-rustamov.workers.dev/` once and share a screenshot.
3. **Vercel redeploy** — repo is fully synced now; previous failure (missing AppShell/FadePanel) is fixed. npm warnings are harmless.
4. **Binary uploads** (package-lock.json, docs/video/agyion-demo.mp4) — add via GitHub web upload or local git push.

## Roadmap anchors (post-hackathon)
Loxias attester marketplace · Nostr bridge · proof-of-innocence · multi-hop offline (regulation-when-ready) · passkey smart wallets · SCF application.
