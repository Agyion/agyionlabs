"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Networks, rpc } from "@stellar/stellar-sdk";
import { CONFIG, IS_MOCK } from "../../lib/config";
import type { WalletState } from "../../lib/useWallet";
import { listTransactionAttempts, reconcileTransactionAttempts, type TransactionAttempt } from "../../lib/transactionReceipts";
import { recordHref, recoverTransactionEntries, transactionTemplate } from "../../lib/ledgerLog";
import { GhostButton } from "../ui";

export function transactionExplorer(attempt: Pick<TransactionAttempt, "network" | "hash">): string | null {
  const network = attempt.network === Networks.TESTNET ? "testnet" : attempt.network === Networks.PUBLIC ? "public" : null;
  return network && /^[a-f0-9]{64}$/i.test(attempt.hash) ? `https://stellar.expert/explorer/${network}/tx/${attempt.hash}` : null;
}
/** Read-only reconciliation. This component has no signer or submission path. */
export default function TransactionActivity({ wallet }: { wallet: Pick<WalletState, "address"> }) {
  const generation = useRef(0);
  const [attempts, setAttempts] = useState<TransactionAttempt[]>([]);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const matching = useCallback(() => listTransactionAttempts().filter(a => a.network === CONFIG.networkPassphrase && a.contractId === CONFIG.contractId && (!wallet.address || a.account === wallet.address)), [wallet.address]);
  const refresh = useCallback(async () => {
    if (IS_MOCK) return;
    const current = generation.current;
    setChecking(true); setNotice(null);
    try {
      const server = new rpc.Server(CONFIG.rpcUrl, { allowHttp: CONFIG.rpcUrl.startsWith("http://") });
      const scopes = new Map(matching().map(a => [a.account, { account:a.account, network:a.network, contractId:a.contractId }]));
      for (const scope of scopes.values()) { await reconcileTransactionAttempts(server, scope); recoverTransactionEntries(scope); }
      if (current === generation.current) {
        setAttempts(matching());
        setNotice("Status checked. Unknown results remain blocked from resubmission.");
      }
    } catch { if (current === generation.current) setNotice("Could not check the network. Existing outcomes remain unchanged."); }
    finally { if (current === generation.current) setChecking(false); }
  }, [matching]);
  const invalidate = useCallback(() => { generation.current++; }, []);
  useEffect(() => {
    if (IS_MOCK) return;
    generation.current++;
    const sync = () => setAttempts(matching());
    sync(); void refresh();
    window.addEventListener("agyion:transactions", sync);
    window.addEventListener("storage", sync);
    return () => { invalidate(); window.removeEventListener("agyion:transactions", sync); window.removeEventListener("storage", sync); };
  }, [matching, refresh, invalidate]);
  if (!attempts.length || IS_MOCK) return null;
  const pending = attempts.filter(a => a.status === "pending" || a.status === "unknown");
  const unresolved = pending.length;
  const visible = [...pending, ...attempts.filter(a => a.status === "success" || a.status === "failed").slice(0, 20)];
  return <details className="instrument-technical transaction-activity" open={unresolved > 0 || undefined}>
    <summary>Transaction activity{unresolved ? ` · ${unresolved} unresolved` : ""}</summary>
    <div className="instrument-section">
      <div className="instrument-actions"><GhostButton onClick={() => void refresh()} disabled={checking}>{checking ? "Checking…" : "Check transaction status"}</GhostButton></div>
      {notice && <p role="status">{notice}</p>}
      {visible.map(attempt => {
        const href = attempt.refId ? recordHref(transactionTemplate(attempt.action), attempt.refId) : null;
        const explorer = transactionExplorer(attempt);
        return <article key={attempt.hash} className="instrument-section">
          <h4>{attempt.action.replaceAll("_", " ")} · {attempt.status === "success" ? "Confirmed" : attempt.status === "failed" ? "Failed" : "Outcome unconfirmed"}</h4>
          <p>{attempt.refId ? `Record ${attempt.refId}` : "Record ID not yet recovered"}{attempt.ledger != null ? ` · Ledger ${attempt.ledger}` : ""}</p>
          <p style={{ overflowWrap: "anywhere" }}>{attempt.hash}</p>
          <div className="instrument-actions">{explorer && <a href={explorer} target="_blank" rel="noopener noreferrer">View transaction ↗</a>}{href && <Link href={href}>Open record →</Link>}</div>
          {(attempt.status === "pending" || attempt.status === "unknown") && <p>Check this hash before retrying. A missing RPC result does not prove the transaction failed.</p>}
        </article>;
      })}
    </div>
  </details>;
}
