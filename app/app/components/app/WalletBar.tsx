"use client";

/**
 * WalletBar — connect via Stellar Wallets Kit (Freighter & co).
 * The test-secret field only exists in mock mode (local development);
 * the live soroban build is wallet-only.
 * Chrome: frosted capsule with a status dot (green connected / amber mock).
 */

import { useEffect, useState } from "react";
import type { WalletState } from "../../lib/useWallet";
import { shortAddress } from "../../lib/format";
import { IS_MOCK } from "../../lib/config";
import { GhostButton, StateChip, TextInput } from "../ui";

export default function WalletBar({ wallet }: { wallet: WalletState }) {
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => { setSecret(""); setShowSecret(false); }, [wallet.address]);

  return (
    <div className="wallet-bar flex flex-wrap items-center gap-3">
      {wallet.address ? (
        <>
          <span
            className="wallet-account inline-flex items-center gap-2.5 rounded-full border px-4 py-2 font-mono text-[12px]"
            style={{ borderColor: "var(--hairline)", color: "var(--ink)", background: "rgba(255,255,255,0.03)" }}
            title={wallet.address}
          >
            <span
              className="chip__dot"
              style={{
                width: 6,
                height: 6,
                background: wallet.demo ? "var(--ember)" : "var(--accent)",
              }}
            />
            <span className="wallet-account__address tnum">{shortAddress(wallet.address)}</span>
            <span className="wallet-account__label text-[10px] uppercase tracking-[0.14em] text-muted">
              {wallet.label}
            </span>
          </span>
          {wallet.demo && (
            <StateChip color="var(--ember)">demo key — testnet only</StateChip>
          )}
          <GhostButton onClick={() => void wallet.disconnect()}>Disconnect</GhostButton>
        </>
      ) : (
        <>
          <GhostButton onClick={() => void wallet.connectKit()} disabled={wallet.connecting}>
            {wallet.connecting ? "Opening wallet…" : "Connect wallet"}
          </GhostButton>
          {IS_MOCK && (
            <>
              <button
                type="button"
                className="wallet-secret-toggle font-mono text-[11px] uppercase tracking-[0.14em] text-muted underline-offset-4 transition-colors hover:text-[var(--accent)] hover:underline"
                onClick={() => setShowSecret((v) => !v)}
              >
                test secret instead
              </button>
              {showSecret && (
                <form
                  className="wallet-secret-form flex flex-wrap items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (secret.trim()) { wallet.useTestSecret(secret); setSecret(""); setShowSecret(false); }
                  }}
                >
                  <TextInput
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder="S… (testnet demo key)"
                    className="wallet-secret-input font-mono text-[13px]"
                    aria-label="Test secret key"
                  />
                  <button
                    type="submit"
                    className="btn border px-5 py-2.5 text-ink transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    style={{ borderColor: "var(--hairline)" }}
                  >
                    <span className="btn__label">Use key</span>
                  </button>
                </form>
              )}
            </>
          )}
        </>
      )}
      {wallet.error && (
        <span className="wallet-error font-mono text-[12px]" style={{ color: "var(--ember)" }}>
          {wallet.error}
        </span>
      )}
    </div>
  );
}
