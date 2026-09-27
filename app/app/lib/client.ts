/**
 * client.ts — AgyionClient factory: mock or real Soroban binding by config
 */

import { CONFIG, IS_MOCK } from "./config";
import { AgyionClient, MockAgyionClient, SorobanAgyionClient } from "./hakClient";
import { defaultSigner, walletSessionVersion } from "./wallet";
import { Asset } from "@stellar/stellar-sdk";

let single: AgyionClient | null = null;
let session = -1;

export function getClient(): AgyionClient {
  const currentSession = walletSessionVersion();
  if (single && session === currentSession) return single;
  single = null;
  session = currentSession;
  if (IS_MOCK) {
    single = new MockAgyionClient();
    return single;
  }
  const signer = defaultSigner();
  if (!CONFIG.contractId)
    throw new Error("NEXT_PUBLIC_HAK_CONTRACT_ID is not set (the contract ID comes from config).");
  if (!/^[a-f0-9]{64}$/.test(CONFIG.contractWasmHash))
    throw new Error("NEXT_PUBLIC_HAK_WASM_HASH must pin the reviewed deployed kernel before transactions are enabled.");
  // Ramp's classic asset and the instruments' SAC must identify the same asset.
  if (new Asset(CONFIG.assetCode, CONFIG.assetAddress).contractId(CONFIG.networkPassphrase) !== CONFIG.assetContractId)
    throw new Error("The configured asset issuer, code and network do not match the instrument asset contract (SAC).");
  single = new SorobanAgyionClient({
    rpcUrl: CONFIG.rpcUrl,
    contractId: CONFIG.contractId,
    networkPassphrase: CONFIG.networkPassphrase,
    expectedAssetContractId: CONFIG.assetContractId,
    expectedContractWasmHash: CONFIG.contractWasmHash,
    signer: signer ?? undefined,
  });
  return single;
}

/** Drop the cached client (e.g. after the wallet changes) */
export function resetClient(): void {
  single = null;
}

/** Mock-only helpers (demo buttons in the UI) — safe when no wallet is connected */
export function mockClient(): MockAgyionClient | null {
  try {
    const c = getClient();
    return c instanceof MockAgyionClient ? c : null;
  } catch {
    return null;
  }
}

/** Seconds per ledger: mock demo tempo 1s; testnet ~5s */
export const SECONDS_PER_LEDGER = IS_MOCK ? 1 : 5;
