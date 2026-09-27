#!/usr/bin/env bash
# =============================================================================
# Agyion MVP: Toolchain kontrol scripti
# -----------------------------------------------------------------------------
# Kontrat, uygulama ve Anchor araçlarını denetler:
#   - Rust + wasm32v1-none target  → contracts/agyion (Soroban)
#   - stellar CLI                  → deploy + testnet kimlikleri
#   - Node.js + npm                → app/ Next.js 15, privacy/
#   - docker + docker compose      → Anchor Platform quick-run
# Sadece KONTROL eder; hiçbir şey kurmaz, sistemi değiştirmez.
# Çıkış kodu: zorunlu eksik varsa 1, yoksa 0.
# =============================================================================
set -uo pipefail

STELLAR_BIN="${STELLAR_BIN:-}"
if [[ -z "$STELLAR_BIN" ]]; then
  if [[ -x /mnt/agents/output/bin/stellar ]]; then
    STELLAR_BIN=/mnt/agents/output/bin/stellar
  else
    STELLAR_BIN=stellar
  fi
fi

ok=0; fail=0
pass() { printf '  \033[1;32m✓\033[0m %s\n' "$*"; ok=$((ok+1)); }
miss() { printf '  \033[1;31m✗\033[0m %s\n' "$*"; fail=$((fail+1)); }

echo "== Rust toolchain (kontrat) =="
if command -v cargo >/dev/null 2>&1; then
  pass "cargo: $(cargo --version)"
else
  miss "cargo yok → https://rustup.rs"
fi
if command -v rustup >/dev/null 2>&1; then
  if rustup target list --installed 2>/dev/null | grep -q '^wasm32v1-none'; then
    pass "rust target: wasm32v1-none kurulu"
  else
    miss "wasm32v1-none target eksik → rustup target add wasm32v1-none"
  fi
else
  miss "rustup yok (target kontrolü yapılamadı)"
fi

echo "== stellar CLI =="
if command -v "$STELLAR_BIN" >/dev/null 2>&1; then
  pass "stellar: $($STELLAR_BIN --version | head -1) [$STELLAR_BIN]"
else
  miss "stellar CLI yok → https://developers.stellar.org/docs/tools/cli (veya STELLAR_BIN ile yol verin)"
fi

echo "== Node.js (frontend) =="
if command -v node >/dev/null 2>&1; then
  pass "node: $(node --version)"
else
  miss "node yok → Node 22 kullanın (doğrulanan çalışma ortamı)"
fi
if command -v npm >/dev/null 2>&1; then
  pass "npm: $(npm --version)"
else
  miss "npm yok"
fi

echo "== Docker (Anchor Platform quick-run) =="
if command -v docker >/dev/null 2>&1; then
  pass "docker: $(docker --version 2>/dev/null | head -1)"
  if docker compose version >/dev/null 2>&1; then
    pass "docker compose: $(docker compose version | head -1)"
  else
    miss "docker compose plugin yok → quick-run için gerekli"
  fi
else
  miss "docker yok → anchor/ quick-run için gerekli (bknz anchor/README.md)"
fi

echo
if [[ $fail -gt 0 ]]; then
  echo "SONUÇ: $ok tamam, $fail eksik. Yukarıdaki yönergeleri izleyin."
  exit 1
fi
echo "SONUÇ: tüm toolchain hazır ($ok kontrol geçti)."
