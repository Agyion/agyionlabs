#!/usr/bin/env bash
# =============================================================================
# build_site.sh: birleşik site build'i (landing + app tek Worker'da)
# -----------------------------------------------------------------------------
#   landing/  (Vite + React 19, Fluid Studio türevi) → dist/  → site/ kökü
#   app/      (Next.js static export, soroban mode)  → out/   → site/app/index.html
#
# Çıktı: app/site/: wrangler.toml'un [assets] dizini; `npx wrangler deploy`
# (app/ altından) tek Worker'a yükler: `/` landing, `/app` ürün.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LANDING="$ROOT/landing"
APP="$ROOT/app"
SITE="$APP/site"

say() { printf '\033[1;34m[site]\033[0m %s\n' "$*"; }

[[ -d "$LANDING" ]] || { echo "landing/ yok"; exit 1; }

say "workspace dependencies"
(cd "$ROOT" && npm ci --no-audit --no-fund)
(cd "$ROOT/privacy" && npm ci --no-audit --no-fund)
(cd "$ROOT/contracts/private-pool/client" && npm ci --no-audit --no-fund)

say "1/4 landing build (vite)"
(cd "$LANDING" && npm ci --no-audit --no-fund && npm test -- --run && npm run build)

say "2/4 app build (next static export)"
(cd "$APP" && npm ci --no-audit --no-fund && npm test && npm run typecheck && npm run lint && npm run build)

say "3/4 birleştir: $SITE"
node "$ROOT/scripts/assemble-site.mjs"

say "4/4 özet: $(find "$SITE" -type f | wc -l) dosya, $(du -sh "$SITE" | cut -f1)"
say "deploy: cd app && npx wrangler deploy"
