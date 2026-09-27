"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Networks, rpc } from "@stellar/stellar-sdk";
import { CONFIG, IS_MOCK } from "../../lib/config";
import type { WalletState } from "../../lib/useWallet";
import { listTransactionAttempts, reconcileTransactionAttempts, requiresTransactionRecovery, type TransactionAttempt } from "../../lib/transactionReceipts";
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
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  // An unknown result reserves its source even when it belongs to another
  // public contract. Keep that hash visible without trusting it as RPC config.
  const matching = useCallback(() => listTransactionAttempts().filter(a => a.network === CONFIG.networkPassphrase && (!wallet.address || a.account === wallet.address)), [wallet.address]);
  const refresh = useCallback(async () => {
    if (IS_MOCK) return;
    const current = generation.current;
    setChecking(true); setNotice(null);
    try {
      const server = new rpc.Server(CONFIG.rpcUrl, { allowHttp: CONFIG.rpcUrl.startsWith("http://") });
      const scopes = new Map(matching().filter(a => a.contractId === CONFIG.contractId).map(a =>
        [JSON.stringify([a.account, a.network, a.contractId]), { account:a.account, network:a.network, contractId:a.contractId }]));
      for (const scope of scopes.values()) { await reconcileTransactionAttempts(server, scope); recoverTransactionEntries(scope); }
      if (current === generation.current) {
        setAttempts(matching());
        setStorageUnavailable(false);
        setNotice(scopes.size
          ? "Configured deployment checked. Unknown outcomes and confirmed creations awaiting their record ID remain blocked from resubmission."
          : "Original transaction hashes retained. Automatic status checks are available only for the configured deployment.");
      }
    } catch { if (current === generation.current) {
      try { matching(); }
      catch { setStorageUnavailable(true); }
      setNotice("Could not check recovery records. Existing outcomes remain unchanged.");
    } }
    finally { if (current === generation.current) setChecking(false); }
  }, [matching]);
  const invalidate = useCallback(() => { generation.current++; }, []);
  useEffect(() => {
    if (IS_MOCK) return;
    generation.current++;
    const sync = () => {
      try { setAttempts(matching()); setStorageUnavailable(false); }
      catch { setStorageUnavailable(true); }
    };
    sync(); void refresh();
    window.addEventListener("agyion:transactions", sync);
    window.addEventListener("storage", sync);
    return () => { invalidate(); window.removeEventListener("agyion:transactions", sync); window.removeEventListener("storage", sync); };
  }, [matching, refresh, invalidate]);
  if ((!attempts.length && !storageUnavailable) || IS_MOCK) return null;
  const pending = attempts.filter(requiresTransactionRecovery);
  const unresolved = pending.length;
  const visible = [...pending, ...attempts.filter(a => !requiresTransactionRecovery(a)).slice(0, 20)];
  return <details className="instrument-technical transaction-activity" open={unresolved > 0 || storageUnavailable || undefined}>
    <summary>Transaction activity{unresolved ? ` · ${unresolved} unresolved` : ""}</summary>
    <div className="instrument-section">
      {storageUnavailable && <p role="alert">Recovery storage unavailable; new transactions are blocked. Keep this browser’s data and check existing transaction hashes before retrying.</p>}
      <div className="instrument-actions"><GhostButton onClick={() => void refresh()} disabled={checking}>{checking ? "Checking…" : "Check transaction status"}</GhostButton></div>
      {notice && <p role="status">{notice}</p>}
      {visible.map(attempt => {
        const supported = attempt.contractId === CONFIG.contractId;
        const href = supported && attempt.refId ? recordHref(transactionTemplate(attempt.action), attempt.refId) : null;
        const explorer = transactionExplorer(attempt);
        return <article key={JSON.stringify([attempt.account, attempt.network, attempt.contractId, attempt.hash])} className="instrument-section">
          <h4>{attempt.action.replaceAll("_", " ")} · {attempt.status === "success" ? "Confirmed" : attempt.status === "failed" ? "Failed" : "Outcome unconfirmed"}</h4>
          <p>{attempt.refId ? `Record ${attempt.refId}` : "Record ID not yet recovered"}{attempt.ledger != null ? ` · Ledger ${attempt.ledger}` : ""}</p>
          <p style={{ overflowWrap: "anywhere" }}>{attempt.hash}</p>
          {!supported && <><p>This transaction belongs to another public deployment. Its hash is preserved; automatic recovery is unavailable here.</p>
            <p style={{ overflowWrap: "anywhere" }}>{attempt.contractId}</p></>}
          <div className="instrument-actions">{explorer && <a href={explorer} target="_blank" rel="noopener noreferrer">View transaction ↗</a>}{href && <Link href={href}>Open record →</Link>}</div>
          {(attempt.status === "pending" || attempt.status === "unknown") && <p>Check this hash before retrying. A missing RPC result does not prove the transaction failed.</p>}
          {attempt.status === "success" && requiresTransactionRecovery(attempt) && <p>This creation is confirmed. Check transaction status until its record ID is recovered; do not create it again.</p>}
        </article>;
      })}
    </div>
  </details>;
}
