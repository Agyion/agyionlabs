/**
 * client.ts — AgyionClient factory: mock or real Soroban binding by config
 */

import { CONFIG, IS_MOCK } from "./config";
import { AgyionClient, MockAgyionClient, SorobanAgyionClient } from "./hakClient";
import { defaultSigner } from "./wallet";

let single: AgyionClient | null = null;

export function getClient(): AgyionClient {
  if (single) return single;
  if (IS_MOCK) {
    single = new MockAgyionClient();
    return single;
  }
  const signer = defaultSigner();
  if (!signer)
    throw new Error(
      "No wallet connected: plug in the Stellar Wallets Kit or enter a secret key in test mode.",
    );
  if (!CONFIG.contractId)
    throw new Error("NEXT_PUBLIC_HAK_CONTRACT_ID is not set (the contract ID comes from config).");
  single = new SorobanAgyionClient({
    rpcUrl: CONFIG.rpcUrl,
    contractId: CONFIG.contractId,
    networkPassphrase: CONFIG.networkPassphrase,
    signer,
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
