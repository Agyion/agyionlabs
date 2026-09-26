import { onWalletSessionChange } from "./wallet";
/** Confirmed receipts are consumed by the matching UI action, never guessed from simulation. */
export interface TransactionReceipt { hash: string; ledger: number | null; account?: string; network?: string; contractId?: string }
const receipts = new Map<string, TransactionReceipt>();
onWalletSessionChange(() => receipts.clear());
export function rememberReceipt(action: string, refId: string, receipt: TransactionReceipt): void {
  if (!/^[a-f0-9]{64}$/i.test(receipt.hash)) return;
  receipts.set(`${action}:${refId}`, receipt);
  if (receipts.size > 100) receipts.delete(receipts.keys().next().value!);
}
export function consumeReceipt(action: string, refId: string): TransactionReceipt | undefined {
  const key = `${action}:${refId}`;
  const receipt = receipts.get(key); receipts.delete(key); return receipt;
}

/** Public recovery metadata only: never persist signed envelopes, secrets or proofs. */
import { scValToNative, type xdr } from "@stellar/stellar-sdk";
export interface TransactionScope { account: string; network: string; contractId: string }
export type TransactionOutcome = "pending" | "unknown" | "success" | "failed";
export interface TransactionAttempt extends TransactionScope {
  hash: string; action: string; refId: string | null;
  recorded?: boolean;
  status: TransactionOutcome; ledger: number | null; createdAt: number; checkedAt: number | null;
}
export type TransactionIntent = TransactionScope & { action: string; refId: string | null };
const ATTEMPTS_KEY = "agyion.transactions.v1";
const ACTIONS = ["create_fade", "claim", "confirm_handoff", "refund", "create_pod", "commit_pod_claim", "claim_pod", "create_trigger", "attest", "refund_trigger", "create_mandate", "envoy_claim", "revoke_mandate"];
let memoryAttempts: TransactionAttempt[] = [];
function sameScope(a: TransactionScope, b: TransactionScope): boolean {
  return a.account === b.account && a.network === b.network && a.contractId === b.contractId;
}
function validAttempt(value: unknown): value is TransactionAttempt {
  if (!value || typeof value !== "object") return false;
  const a = value as TransactionAttempt;
  return typeof a.hash === "string" && /^[a-f0-9]{64}$/i.test(a.hash) &&
    typeof a.account === "string" && /^G[A-Z2-7]{55}$/.test(a.account) &&
    typeof a.contractId === "string" && /^C[A-Z2-7]{55}$/.test(a.contractId) &&
    typeof a.network === "string" && a.network.length > 0 && a.network.length < 200 &&
    ACTIONS.includes(a.action) && (a.refId === null || /^\d{1,20}(?:→\d{1,20})?$/.test(a.refId)) &&
    ["pending", "unknown", "success", "failed"].includes(a.status) &&
    (a.ledger === null || (Number.isSafeInteger(a.ledger) && a.ledger >= 0)) &&
    (a.recorded === undefined || typeof a.recorded === "boolean") &&
    Number.isFinite(a.createdAt) && (a.checkedAt === null || Number.isFinite(a.checkedAt));
}
export function listTransactionAttempts(scope?: TransactionScope): TransactionAttempt[] {
  let rows = memoryAttempts;
  if (typeof window !== "undefined") {
    try { const stored: unknown = JSON.parse(window.localStorage.getItem(ATTEMPTS_KEY) ?? "[]"); rows = Array.isArray(stored) ? stored.filter(validAttempt).slice(-500) : []; }
    catch { /* Keep this page's confirmed public metadata when storage becomes unavailable. */ }
  }
  return rows.filter(a => !scope || sameScope(a, scope)).map(a => ({ ...a })).sort((a, b) => b.createdAt - a.createdAt);
}
function saveAttempts(rows: TransactionAttempt[], required: boolean): void {
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(rows)); }
    catch {
      if (required) throw new Error("Cannot save transaction recovery in browser storage. Nothing was sent. Enable storage before trying again.");
    }
  }
  memoryAttempts = rows;
  if (typeof window !== "undefined") window.dispatchEvent(new Event("agyion:transactions"));
}
export function rememberTransactionAttempt(intent: TransactionIntent & { hash: string }): void {
  const attempt: TransactionAttempt = { account: intent.account, network: intent.network, contractId: intent.contractId,
    action: intent.action, refId: intent.refId, hash: intent.hash.toLowerCase(), status: "pending", ledger: null, createdAt: Date.now(), checkedAt: null };
  if (!validAttempt(attempt)) throw new Error("Invalid transaction recovery metadata. Nothing was sent.");
  const rows = listTransactionAttempts();
  if (rows.some(a => a.hash === attempt.hash && sameScope(a, attempt))) return;
  // Never evict unresolved attempts to make room for a new submission.
  while (rows.length >= 500) {
    const index = rows.findLastIndex(a => a.status === "success" || a.status === "failed");
    if (index < 0) throw new Error("Transaction recovery is full. Resolve pending transactions before sending another.");
    rows.splice(index, 1);
  }
  saveAttempts([...rows, attempt], true);
}
export function updateTransactionAttempt(hash: string, scope: TransactionScope, update: Partial<Pick<TransactionAttempt, "status" | "ledger" | "refId" | "recorded">>): void {
  const rows = listTransactionAttempts().map(a => {
    if (a.hash !== hash || !sameScope(a, scope)) return a;
    const terminal = a.status === "success" || a.status === "failed";
    // A late submit/poll cannot erase already verified terminal evidence.
    const next = terminal && update.status && update.status !== a.status
      ? { recorded: update.recorded ?? a.recorded }
      : update;
    return { ...a, ...next,
      refId: terminal && a.refId !== null && next.refId == null ? a.refId : next.refId === undefined ? a.refId : next.refId,
      ledger: terminal && a.ledger !== null && next.ledger == null ? a.ledger : next.ledger === undefined ? a.ledger : next.ledger,
      checkedAt: Date.now() };
  });
  saveAttempts(rows.filter(validAttempt), false);
}
export function unresolvedTransaction(intent: TransactionIntent): TransactionAttempt | undefined {
  return listTransactionAttempts(intent).find(a => a.action === intent.action && a.refId === intent.refId && (a.status === "pending" || a.status === "unknown"));
}
interface RecoveryServer { getTransaction(hash: string): Promise<{ status: string; ledger?: number; returnValue?: xdr.ScVal }> }
export async function reconcileTransactionAttempts(server: RecoveryServer, scope: TransactionScope): Promise<void> {
  for (const attempt of listTransactionAttempts(scope).filter(a => a.status === "pending" || a.status === "unknown")) {
    try {
      const response = await server.getTransaction(attempt.hash);
      const status = response.status === "SUCCESS" ? "success" : response.status === "FAILED" ? "failed" : "unknown";
      let refId = attempt.refId;
      if (status === "success" && refId === null && attempt.action.startsWith("create_") && response.returnValue) {
        try {
          const value: unknown = scValToNative(response.returnValue);
          if (typeof value === "bigint" && value >= 0n && value <= 0xffff_ffff_ffff_ffffn) refId = String(value);
        } catch { /* Confirmation remains true even when its return value cannot be decoded. */ }
      }
      updateTransactionAttempt(attempt.hash, scope, { status, refId, ledger: status === "success" || status === "failed" ? response.ledger ?? null : null });
    } catch { updateTransactionAttempt(attempt.hash, scope, { status: "unknown" }); }
  }
}
