/**
 * config.ts — ortam yapılandırması (SPEC §4: "RPC: soroban-testnet; kontrat ID config'den")
 *
 * NEXT_PUBLIC_HAK_MODE=mock     → localStorage mock client (demo; kontrat bitene kadar varsayılan)
 * NEXT_PUBLIC_HAK_MODE=soroban  → gerçek testnet binding (kontrat ID zorunlu)
 */

// Keep the direct environment reference so Next can replace it at build time.
const mode = process.env.NEXT_PUBLIC_HAK_MODE ?? "mock";
if (mode !== "mock" && mode !== "soroban") {
  throw new Error('NEXT_PUBLIC_HAK_MODE must be exactly "mock" or "soroban".');
}

export const CONFIG = {
  mode,
  rpcUrl: process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org",
  contractId: process.env.NEXT_PUBLIC_HAK_CONTRACT_ID ?? "",
  /** Exact reviewed/deployed kernel bytes; required by the public Soroban application. */
  contractWasmHash: process.env.NEXT_PUBLIC_HAK_WASM_HASH ?? "",
  networkPassphrase:
    process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ??
    "Test SDF Network ; September 2015",
  /**
   * Ramp asset: USDC on Stellar testnet (Circle testnet issuer), the asset the
   * official hackathon TR mock anchor ramps against TRY via SEP-6.
   */
  assetCode: process.env.NEXT_PUBLIC_HAK_ASSET_CODE ?? "USDC",
  assetAddress:
    process.env.NEXT_PUBLIC_HAK_ASSET_ADDRESS ??
    "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  /**
   * SAC contract id of the ramp asset on testnet — this is the address the
   * kernel contract expects in its `asset` param (token::Client target),
   * NOT the classic issuer account above.
   */
  assetContractId:
    process.env.NEXT_PUBLIC_HAK_ASSET_CONTRACT_ID ??
    "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  /** Official hackathon TR mock anchor (SEP-10 + SEP-6 + SEP-38 + SEP-12) */
  anchorUrl: process.env.NEXT_PUBLIC_ANCHOR_URL ?? "https://tr-mock-anchor.fly.dev",
  /** Optional pin, checked against the HTTPS stellar.toml SIGNING_KEY. */
  anchorSigningKey: process.env.NEXT_PUBLIC_ANCHOR_SIGNING_KEY ?? "",
  /** stroop-benzeri minor unit: 7 ondalık (SPEC §3.1) */
  decimals: 7,
  /** Reserved for a verified WalletConnect adapter; the current adapter is not offered. */
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "",
} as const;

export const IS_MOCK = CONFIG.mode === "mock";
