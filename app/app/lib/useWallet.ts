"use client";

/**
 * useWallet — wallet state for the app shell.
 * Kit connect/disconnect or a test secret; keeps the client factory in sync.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { connectWithKit, disconnectKit } from "./walletsKit";
import {
  activeSigner,
  clearTestSecret,
  onWalletSessionChange,
  saveTestSecret,
  storedTestSigner,
  walletSessionVersion,
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
  const operation = useRef(0);

  // Purge legacy persisted secrets in every mode; restore only this page's memory.
  useEffect(() => {
    const operationRef = operation;
    const test = storedTestSigner();
    const s = activeSigner();
    const version = walletSessionVersion();
    let mounted = true;
    if (s) {
      s.address().then((a) => {
        if (!mounted || version !== walletSessionVersion() || activeSigner() !== s) return;
        setAddress(a);
        setLabel(s === test ? "test key" : "Wallet");
        setDemo(s === test);
      }).catch(() => void 0);
    }
    const unsubscribe = onWalletSessionChange(() => {
      resetClient();
      setAddress(null);
      setLabel("");
      setDemo(false);
    });
    return () => { mounted = false; operationRef.current++; unsubscribe(); };
  }, []);

  const connectKit = useCallback(async () => {
    const attempt = ++operation.current;
    setConnecting(true);
    setError(null);
    try {
      const r = await connectWithKit();
      if (attempt !== operation.current) return;
      if (r.walletNetwork !== CONFIG.networkPassphrase) {
        await disconnectKit().catch(() => void 0);
        throw new Error("Wallet is not on Stellar testnet: switch networks before signing.");
      }
      setAddress(r.address);
      setLabel(r.walletName);
      setDemo(false);
      resetClient();
    } catch (e) {
      if (attempt === operation.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (attempt === operation.current) setConnecting(false);
    }
  }, []);

  const useTestSecret = useCallback((secret: string) => {
    const attempt = ++operation.current;
    setConnecting(false);
    setError(null);
    try {
      const w = saveTestSecret(secret);
      w.address().then((a) => {
        if (attempt !== operation.current || activeSigner() !== w) return;
        setAddress(a);
        setLabel("test key");
        setDemo(true);
      }).catch((e) => { if (attempt === operation.current) setError(e instanceof Error ? e.message : "Invalid secret key"); });
      resetClient();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid secret key");
    }
  }, []);

  const disconnect = useCallback(async () => {
    operation.current++;
    // Revoke synchronously, even while a wallet modal is still opening.
    const pending = disconnectKit();
    clearTestSecret();
    resetClient();
    setAddress(null);
    setLabel("");
    setDemo(false);
    setConnecting(false);
    setError(null);
    await pending.catch(() => void 0);
  }, []);

  return { address, label, demo, connecting, error, connectKit, useTestSecret, disconnect };
}

export { IS_MOCK };
