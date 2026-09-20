"use client";

/**
 * useWallet — wallet state for the app shell.
 * Kit connect/disconnect or a test secret; keeps the client factory in sync.
 */

import { useCallback, useEffect, useState } from "react";
import { connectWithKit, disconnectKit } from "./walletsKit";
import {
  activeSigner,
  clearTestSecret,
  saveTestSecret,
  storedTestSigner,
} from "./wallet";
import { resetClient } from "./client";
import { CONFIG, IS_MOCK } from "./config";

export interface WalletState {
  address: string | null;
  label: string; // "Freighter" · "test key" · ""
  demo: boolean; // test-secret mode
  connecting: boolean;
  error: string | null;
  connectKit: () => Promise<void>;
  useTestSecret: (secret: string) => void;
  disconnect: () => Promise<void>;
}

export function useWallet(): WalletState {
  const [address, setAddress] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [demo, setDemo] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore a stored test secret on load (mock mode only — the live build is wallet-only)
  useEffect(() => {
    if (!IS_MOCK) return;
    const s = storedTestSigner();
    if (s) {
      s.address().then((a) => {
        setAddress(a);
        setLabel("test key");
        setDemo(true);
      });
    }
  }, []);

  const connectKit = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const r = await connectWithKit();
      if (
        r.walletNetwork &&
        r.walletNetwork !== CONFIG.networkPassphrase
      ) {
        setError("Wallet is not on Stellar testnet — switch networks before signing.");
      }
      setAddress(r.address);
      setLabel(r.walletName);
      setDemo(false);
      resetClient();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }, []);

  const useTestSecret = useCallback((secret: string) => {
    setError(null);
    try {
      const w = saveTestSecret(secret);
      w.address().then((a) => {
        setAddress(a);
        setLabel("test key");
        setDemo(true);
      });
      resetClient();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid secret key");
    }
  }, []);

  const disconnect = useCallback(async () => {
    if (activeSigner()) await disconnectKit().catch(() => void 0);
    clearTestSecret();
    resetClient();
    setAddress(null);
    setLabel("");
    setDemo(false);
  }, []);

  return { address, label, demo, connecting, error, connectKit, useTestSecret, disconnect };
}

export { IS_MOCK };
