# agyionlabs.dev — Agent Handoff

_Last updated: 2026-09-24_

## Project Overview

**agyionlabs.dev** — Stellar testnet hackathon demo. Frontend-only.

- **Landing** (`/`): user's own editorial design (mint/teal, "agyion" filled + "labs" outlined, film strip, right-edge ruler, green statements). **Mirrored verbatim from the live site** — do not redesign it.
- **App** (`/app/`): "agyion·orbital" — Interstellar-themed station scene. Click-through: 8s docking sequence → Endurance ring orbiting a shader-based Gargantua black hole → hologram console panels per module.

## Repo Location

Skill-scaffolded webapp at `/mnt/agents/output/app`:

```
/mnt/agents/output/app
├── live/                  # VERBATIM MIRROR of live agyionlabs.dev
│   ├── index.html         # landing HTML (1.8KB) — served at /
│   ├── assets/            # landing bundle (index-msdl096C.js 474KB, index-BbQU42uC.css 82KB)
│   ├── fonts/             # bitcount-400, bricolage-var, instrsans-var, space-mono-400/700 .woff2
│   ├── media/             # agyion-{ink,fade,pod,trigger,envoy,rule}.png, agyion-loop.mp4, cc0-flower.mp4
│   └── intercept.html     # click interceptor snippet (injected into dist/index.html by assemble)
├── src/
│   ├── pages/Home.tsx     # station app — tabFromLocation() parses ?tab= → auto-opens module console after dock
│   ├── App.tsx            # routes: "/" and "/app" both → Home
│   ├── scene/
│   │   ├── OrbitalScene.tsx  # three.js scene, Gargantua at (-34,26,-430) r=84, lights from hole
│   │   ├── endurance.ts      # film-faithful Endurance: 12 modules ring, 4 spokes, hub, counter-rotating Ranger
│   │   ├── blackhole.ts      # full-screen GLSL shader (lensing, differential disk rotation, doppler beaming, photon ring)
│   │   └── textures.ts       # hull plating, radiator grid, window-strip canvas textures
│   ├── components/chrome.tsx # TopBar, TourCard, Dock (6 bays), PanelFrame, PageWipe
│   ├── panels/               # FadePanel, PodPanel, TriggerPanel, EnvoyPanel, RampPanel, LedgerPanel
│   ├── lib/ledger.ts         # flight recorder → localStorage key "agyion.orbital.ledger.v1" (on-device only)
│   └── landing/              # (old remix landing — dead code, ignore)
├── scripts/assemble.mjs   # post-build: moves dist/index.html→dist/app/, copies live/* to dist root, injects interceptor
└── dist/                  # assembled output (current production build)
    ├── index.html         # landing + interceptor
    ├── assets/ fonts/ media/   # landing files
    ├── app/               # station SPA (index.html + assets/ + fonts/)
    └── _redirects         # "/app/* /app/index.html 200"  (only used by Pages-style hosts)
```

## Local Dev

```bash
cd /mnt/agents/output/app
npm run build && node scripts/assemble.mjs
# Serve dist/ with a PLAIN static server (NOT vite preview — base '/app/' breaks root serving):
python3 -m http.server 4173 --directory dist
```

- `vite.config.ts` has `base: '/app/'` — station assets resolve under `/app/assets/`.
- Landing URLs `/fade /pod /trigger /envoy /ramp /ledger` and `https://agyionlabs.dev/app` are intercepted by capture-phase click listener in dist/index.html → routed to `/app/?tab=<id>` or `/app/`.

## Production Hosting (IMPORTANT — deploys go straight to Cloudflare)

Site is served by the **`agyion` Worker** (Workers Static Assets) with a **Workers Custom Domain** `agyionlabs.dev` (NOT Pages, despite an empty Pages project named "agyion" existing).

- Account ID: `1d26a967af5b2e24f55e3469779135f3`
- Zone: `agyionlabs.dev` id `eea7a62abed5c421fed68a118ad7eff4` (AAAA `100::` proxied)
- Worker: `agyion` — single script `export default { async fetch(request, env) { return env.ASSETS.fetch(request); } }` with `assets` binding, `not_found_handling: "single-page-application"`, `html_handling: "auto-trailing-slash"`.
- No wrangler CLI credentials in sandbox — deploys go through the **Cloudflare MCP tools** (`mcp__plugin-cloudflare_cloudflare__*`) using its authenticated session.

### Deploy procedure (repeat after every `npm run build && node scripts/assemble.mjs`)

1. **Manifest**: for each file in `dist/` except `_redirects`: `hash = sha256(base64(file) + ext)[:32]`, `size = byte length`. POST `/accounts/{accountId}/workers/scripts/agyion/assets-upload-session` with the manifest → returns `buckets` (sets of hashes) + upload JWT.
2. **Upload files**: for each bucket, POST multipart to `https://api.cloudflare.com/client/v4/accounts/{accountId}/workers/assets/upload?base64=true` with `Authorization: Bearer <upload JWT>` — one part per file, part NAME = file hash, content = base64, content-type per extension. Last bucket returns 201 with completion JWT.
3. **Deploy version**: PUT `/accounts/{accountId}/workers/scripts/agyion` as multipart form: `metadata` part = JSON `{ main_module: "index.js", compatibility_date: "2026-09-20", bindings: [{type:"assets", name:"ASSETS"}], assets: { jwt: <completion JWT>, config: { html_handling: "auto-trailing-slash", not_found_handling: "single-page-application", _headers: "/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n\n/app/assets/*\n  Cache-Control: public, max-age=31536000, immutable" } } }`; `index.js` part = the 3-line fetch script above. A script with NO handlers is rejected (error 10068) — the ASSETS passthrough handler is required.
4. Do NOT upload `_redirects` (Workers Assets applies redirects before asset serving and would break `/app/*`), and do not put a fetch handler that rewrites paths.

## Verified Working (last pass 2026-09-24, live domain)

- `/` → landing, exact live design, fonts/media 200, interceptor present
- `/index.html` → 307 to `/` (html_handling), `/app/index.html` → 307 to `/app/`
- `/app/` + `/app/assets/*` 200 with immutable cache
- Landing "Open the app" → `/app/` → dock → orbit → Fade console auto-opens
- `/app/?tab=pod` → Pod console auto-opens after dock
- Console action buttons ("DEPLOY CAMPAIGN" etc.) write to localStorage `agyion.orbital.ledger.v1`
- Zero browser console errors. Only 404: `/cdn-cgi/challenge-platform/...` (Cloudflare-managed, harmless)

## Key Implementation Details

- **Endurance model** (procedural, no external GLTF): `RING_R=12, SEGMENTS=12, MODULE_LEN=4.55`. Each module: plated hull box, chamfer, angled end wedges, outer radiator grid, 2 window strips, seeded greebles (mulberry32). Bay modules carry `userData.moduleId`, accent bands, beacon + label sprite. 4 spokes at ring joints → hub (core cylinder, front docking port with green glow, rear engine + 4 nozzles, 4 X-arranged radiator fins, dish). **Ranger docked nose-in on front axis, counter-rotates `rotation.z = -T*OMEGA`** (OMEGA=2π/60) so it stays level while the ring spins. API: `{ group, pickables, anchorOf(id), update(T, selected) }`.
- **Black hole**: fullscreen GLSL shader in `src/scene/blackhole.ts`, fed per-frame `uInvProj/uCamWorld/uCamPos/uTime` — lensing, differential-rotation accretion disk, doppler beaming, photon ring. Position `(-34, 26, -430)`, radius 84. Key light comes FROM the hole (warm 0xffcf9c), fill 0xffe2bd, steel-blue rim.
- **Module IDs**: fade, pod, trigger, envoy, ramp, ledger.
- **Landing is a React SPA bundle** — all route links (`/fade` etc.) and CTA hrefs (`https://agyionlabs.dev/app`) live INSIDE the JS bundle; the injected capture-phase interceptor rewrites them client-side.
- Screenshot timeouts: WebGL pages under swiftshader need `timeout=120000`, `type="jpeg"`, small viewport (~960×600) helps.

## Known Constraints

- **App is frontend-only**: ledger/proof-pack live in visitor's localStorage. "CONNECT WALLET" is mock. Backend is future work.
- Deploys mutate the live production worker immediately — no staging. Test on a local static server first.
- The empty Cloudflare Pages project "agyion" is unused; the real host is the worker custom domain.
