"use client";

/** Display the last verified height; only a fresh poll authorizes ledger-sensitive actions. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { AgyionClient } from "./hakClient";
import { useInstrumentActivity } from "./instrumentActivity";
export interface LedgerStatus { ledger: number | null; fresh: boolean; status: "checking" | "fresh" | "stale"; refresh: () => void }
export function useLedgerStatus(client: AgyionClient | null, refreshMs = 5_000): LedgerStatus {
  const active = useInstrumentActivity();
  const [state, setState] = useState<{ client: AgyionClient; ledger: number | null; fresh: boolean } | null>(null);
  const poll = useRef<() => void>(() => {});
  const refresh = useCallback(() => poll.current(), []);
  useEffect(() => {
    if (!client || !active) {
      setState(old => old?.fresh ? { ...old, fresh: false } : old);
      return;
    }
    let live = true, pending = false;
    const stale = () => { if (live) setState(old => ({ client, ledger: old?.client === client ? old.ledger : null, fresh: false })); };
    const align = async () => {
      if (pending || document.hidden) return;
      pending = true;
      // A bounded freshness window also protects against a request that never returns.
      stale();
      try {
        const ledger = await client.currentLedger();
        if (live && Number.isSafeInteger(ledger) && ledger >= 0) setState({ client, ledger, fresh: !document.hidden });
      } catch { stale(); }
      finally { pending = false; }
    };
    poll.current = () => { void align(); };
    void align();
    const sync = setInterval(align, refreshMs);
    const onVisible = () => { stale(); if (!document.hidden) void align(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { live = false; poll.current = () => {}; clearInterval(sync); document.removeEventListener("visibilitychange", onVisible); };
  }, [client, refreshMs, active]);
  const current = state?.client === client ? state : null;
  const fresh = active && (current?.fresh ?? false);
  return { ledger: current?.ledger ?? null, fresh, status: fresh ? "fresh" : current?.ledger != null ? "stale" : "checking", refresh };
}
/** Compatibility API: stale heights must never silently enable an existing write control. */
export function useLedger(client: AgyionClient | null, refreshMs = 5_000): number | null {
  const state = useLedgerStatus(client, refreshMs);
  return state.fresh ? state.ledger : null;
}
