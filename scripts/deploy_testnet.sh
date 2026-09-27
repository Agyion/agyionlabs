#!/usr/bin/env bash
# Agyion kernel v3 deployment helper. Default: local, read-only checks and plan.
# ./scripts/deploy_testnet.sh              # no build, key creation, funding or RPC
# DRY_RUN=0 ./scripts/deploy_testnet.sh    # explicit operator-run testnet deployment
# DEPLOYER_ALIAS may name an existing CLI identity. Only the dedicated default
# identity may be created automatically. This helper never issues assets.
set -euo pipefail

say() { printf '[deploy] %s\n' "$*"; }
die() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

readonly TESTNET_RPC='https://soroban-testnet.stellar.org'
readonly TESTNET_PASSPHRASE='Test SDF Network ; September 2015'
readonly DEDICATED_ALIAS='agyion-testnet-deployer'
DRY_RUN="${DRY_RUN:-1}"
DEPLOYER_ALIAS="${DEPLOYER_ALIAS:-$DEDICATED_ALIAS}"
STELLAR_BIN="${STELLAR_BIN:-stellar}"

# Reject unintended network selection before even invoking the CLI. Explicit
# RPC/passphrase flags below also avoid relying on a mutable saved network alias.
[[ "$DRY_RUN" == '0' || "$DRY_RUN" == '1' ]] || die 'DRY_RUN must be 1 (plan) or 0 (execute).'
[[ "${NETWORK:-testnet}" == 'testnet' ]] || die 'This helper only supports testnet.'
[[ "${STELLAR_NETWORK:-testnet}" == 'testnet' ]] || die 'Unset STELLAR_NETWORK or set it to testnet.'
[[ "${STELLAR_RPC_URL:-$TESTNET_RPC}" == "$TESTNET_RPC" ]] || die 'STELLAR_RPC_URL must be the official testnet RPC.'
[[ "${STELLAR_NETWORK_PASSPHRASE:-$TESTNET_PASSPHRASE}" == "$TESTNET_PASSPHRASE" ]] || die 'STELLAR_NETWORK_PASSPHRASE must be the testnet passphrase.'
# Accept identity names, never secret seeds, public keys, paths or CLI flags.
[[ "$DEPLOYER_ALIAS" =~ ^[a-z][a-z0-9_-]{0,47}$ ]] || die 'DEPLOYER_ALIAS must be a lowercase CLI identity name (up to 48 characters).'

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly ROOT
readonly CONTRACT_DIR="$ROOT/contracts/agyion"
readonly MANIFEST="$CONTRACT_DIR/Cargo.toml"
readonly WASM_FILE="$CONTRACT_DIR/target/wasm32v1-none/release/agyion.wasm"
readonly NETWORK_ARGS=(--rpc-url "$TESTNET_RPC" --network-passphrase "$TESTNET_PASSPHRASE")
cd "$ROOT"

# Explicit alias/network arguments govern this run, not inherited signing or
# provider-header environment variables. No secrets are requested or printed.
stellar_cmd() {
  env -u STELLAR_NETWORK -u STELLAR_RPC_URL -u STELLAR_NETWORK_PASSPHRASE \
    -u STELLAR_RPC_HEADERS -u STELLAR_ACCOUNT -u STELLAR_SIGN_WITH_KEY \
    -u STELLAR_SIGN_WITH_LAB -u STELLAR_SIGN_WITH_LEDGER \
    "$STELLAR_BIN" "$@"
}

command -v "$STELLAR_BIN" >/dev/null 2>&1 || die 'stellar CLI is required (set STELLAR_BIN if it is not on PATH).'
command -v cargo >/dev/null 2>&1 || die 'cargo is required.'
command -v rustup >/dev/null 2>&1 || die 'rustup is required to check the WASM target.'
command -v sha256sum >/dev/null 2>&1 || die 'sha256sum is required.'
[[ -f "$MANIFEST" && -f "$CONTRACT_DIR/Cargo.lock" ]] || die 'Kernel manifest or lockfile is missing.'
TARGETS="$(rustup target list --installed)"
[[ $'\n'"$TARGETS"$'\n' == *$'\nwasm32v1-none\n'* ]] || die 'Install the wasm32v1-none Rust target before deploying.'
CLI_VERSION="$(stellar_cmd --version)"
say "${CLI_VERSION%%$'\n'*}"
say "Network: testnet | RPC: $TESTNET_RPC | DRY_RUN=$DRY_RUN"

DEPLOYER_ADDRESS=''
if DEPLOYER_ADDRESS="$(stellar_cmd keys address "$DEPLOYER_ALIAS" 2>/dev/null)"; then
  [[ "$DEPLOYER_ADDRESS" =~ ^G[A-Z2-7]{55}$ ]] || die 'The selected identity did not resolve to a Stellar public account.'
  say "Existing identity: $DEPLOYER_ALIAS ($DEPLOYER_ADDRESS)"
else
  [[ "$DEPLOYER_ALIAS" == "$DEDICATED_ALIAS" ]] || die 'The selected identity is unavailable. Use an existing identity or the dedicated agyion-testnet-deployer default.'
  DEPLOYER_ADDRESS=''
  say "Dedicated identity is not present: $DEDICATED_ALIAS"
fi

print_config() {
  local contract_id="$1"
  local wasm_hash="$2"
  printf '\nNEXT_PUBLIC_AGYION_MODE=soroban\n'
  printf 'NEXT_PUBLIC_AGYION_CONTRACT_ID=%s\n' "$contract_id"
  printf 'NEXT_PUBLIC_AGYION_WASM_HASH=%s\n' "$wasm_hash"
  printf 'NEXT_PUBLIC_SOROBAN_RPC_URL=%s\n' "$TESTNET_RPC"
  printf 'NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE="%s"\n' "$TESTNET_PASSPHRASE"
  printf 'NEXT_PUBLIC_AGYION_ASSET_CODE=USDC\n'
  printf 'NEXT_PUBLIC_AGYION_ASSET_ADDRESS=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5\n'
  printf 'NEXT_PUBLIC_AGYION_ASSET_CONTRACT_ID=CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA\n'
}

if [[ "$DRY_RUN" == '1' ]]; then
  say 'Plan only. No tests/build, key changes, funding, signing or network calls will run.'
  say '1. Run the locked kernel test suite.'
  say "2. Build with stellar contract build; use exactly $WASM_FILE."
  if [[ -z "$DEPLOYER_ADDRESS" ]]; then
    say "3. Create $DEDICATED_ALIAS without overwrite and fund it with testnet Friendbot."
  else
    say '3. Reuse the selected identity; it must already have enough testnet XLM for fees.'
  fi
  say '4. Deploy the new kernel on the pinned testnet network; preserve existing contract aliases.'
  say '5. Fetch deployed bytes and require an exact SHA-256 match; read protocol_version with --send no and require 3 before printing app configuration.'
  say 'No issuer, trustline or asset-transfer steps are needed; the app uses Circle testnet USDC.'
  say 'Configuration template (replace the placeholder only after successful deployment):'
  print_config '<new-v3-testnet-contract-id>' '<verified-wasm-sha256>'
  say 'To execute this plan explicitly: DRY_RUN=0 ./scripts/deploy_testnet.sh'
  exit 0
fi

# Finish local verification before creating/funding a new account or deploying.
say 'Running kernel tests against the lockfile.'
CARGO_TARGET_DIR="$CONTRACT_DIR/target" cargo test --manifest-path "$MANIFEST" --locked
say 'Building the kernel with the supported Stellar build pipeline.'
CARGO_TARGET_DIR="$CONTRACT_DIR/target" stellar_cmd contract build --manifest-path "$MANIFEST" --locked
[[ -s "$WASM_FILE" ]] || die "Build did not produce the expected kernel: $WASM_FILE"
WASM_HASH="$(sha256sum "$WASM_FILE" | cut -d ' ' -f1)"
say "WASM SHA-256: $WASM_HASH"

if [[ -z "$DEPLOYER_ADDRESS" ]]; then
  say "Creating dedicated testnet identity: $DEDICATED_ALIAS"
  stellar_cmd keys generate "$DEDICATED_ALIAS" > /dev/null
  DEPLOYER_ADDRESS="$(stellar_cmd keys address "$DEDICATED_ALIAS")"
  [[ "$DEPLOYER_ADDRESS" =~ ^G[A-Z2-7]{55}$ ]] || die 'New identity did not resolve to a Stellar public account.'
  say "Funding the new testnet account: $DEPLOYER_ADDRESS"
  stellar_cmd keys fund "$DEDICATED_ALIAS" "${NETWORK_ARGS[@]}"
fi

# Deliberately omit --alias: deployment must not overwrite an existing mapping.
say 'Deploying a new kernel to testnet.'
CONTRACT_ID="$(stellar_cmd contract deploy --wasm "$WASM_FILE" \
  --optimize=false --source-account "$DEPLOYER_ALIAS" "${NETWORK_ARGS[@]}")"
CONTRACT_ID="$(printf '%s' "$CONTRACT_ID" | tr -d '[:space:]')"
[[ "$CONTRACT_ID" =~ ^C[A-Z2-7]{55}$ ]] || die 'Deploy did not return a valid contract ID; inspect the CLI result before proceeding.'
say "Deployed contract: $CONTRACT_ID"
READBACK_DIR="$(mktemp -d)"
trap 'rm -rf -- "$READBACK_DIR"' EXIT
if ! stellar_cmd --no-cache contract fetch --id "$CONTRACT_ID" \
  "${NETWORK_ARGS[@]}" --out-file "$READBACK_DIR/kernel.wasm"; then
  die "Deployment $CONTRACT_ID exists, but code readback failed. Do not configure the app until verified."
fi
[[ -s "$READBACK_DIR/kernel.wasm" ]] || die 'Deployed code readback is empty.'
READBACK_HASH="$(sha256sum "$READBACK_DIR/kernel.wasm" | cut -d ' ' -f1)"
[[ "$READBACK_HASH" == "$WASM_HASH" ]] || die "Deployment $CONTRACT_ID does not match the tested WASM. App configuration was not emitted."
if ! PROTOCOL_VERSION="$(stellar_cmd contract invoke --id "$CONTRACT_ID" \
  --source-account "$DEPLOYER_ADDRESS" "${NETWORK_ARGS[@]}" \
  --send no -- protocol_version)"; then
  die "Deployment $CONTRACT_ID exists, but protocol readback failed. Do not configure the app with it until verified."
fi
PROTOCOL_VERSION="$(printf '%s' "$PROTOCOL_VERSION" | tr -d '[:space:]')"
[[ "$PROTOCOL_VERSION" == '3' ]] || die "Deployment $CONTRACT_ID did not report protocol version 3. App configuration was not emitted."
say 'Verified exact deployed WASM and protocol version 3. Rebuild the app with these public settings:'
print_config "$CONTRACT_ID" "$WASM_HASH"
say 'Existing contracts and locked funds remain unchanged; this is a new testnet deployment.'
