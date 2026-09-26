"use client";

/**
 * ledgerLog.ts — the Ledger: the user's own transaction history.
 *
 * Every template action (create / claim / attest / revoke / …) appends an
 * entry to a localStorage log. Entries carry the ledger height at the time
 * of the action; in soroban mode they may also carry the tx hash.
 *
 * Proof Pack: a signed JSON export of the log — sha256 checksum of the
 * canonical payload plus an ed25519 signature when a test-secret signer is
 * active. Verifiable offline against the export itself.
 */

import { storedTestSigner } from "./wallet";
import { consumeReceipt, listTransactionAttempts, updateTransactionAttempt, type TransactionScope } from "./transactionReceipts";

const LOG_KEY = "agyion.ledger.v1";

export type TemplateName = "fade" | "pod" | "trigger" | "envoy";
export type EntryStatus = "locked" | "executed" | "returned" | "rejected" | "recorded";

export interface LedgerEntry {
  seq: number;
  ts: string; // ISO wall-clock time
  ledger: number | null; // ledger height at action time
  template: TemplateName;
  action: string; // create_fade, claim, attest, envoy_claim, …
  refId: string; // fade/pod/trigger/mandate id
  amount: string | null; // minor-unit decimal string
  status: EntryStatus;
  detail: string;
  txHash: string | null;
  account?: string;
  network?: string;
  contractId?: string;
}

let volatileEntries: LedgerEntry[] | null = null;
const MAX_ENTRIES = 1000;
function validEntry(value: unknown): value is LedgerEntry {
  if (!value || typeof value !== "object") return false;
  const e = value as LedgerEntry;
  return Number.isSafeInteger(e.seq) && e.seq > 0 && typeof e.ts === "string" &&
    ["fade", "pod", "trigger", "envoy"].includes(e.template) &&
    ["locked", "executed", "returned", "rejected", "recorded"].includes(e.status) &&
    [e.action, e.refId, e.detail].every(v => typeof v === "string") &&
    (e.amount === null || (typeof e.amount === "string" && /^-?\d+$/.test(e.amount))) &&
    (e.ledger === null || Number.isSafeInteger(e.ledger)) &&
    (e.network === undefined || (typeof e.network === "string" && e.network.length > 0 && e.network.length < 200)) &&
    (e.account === undefined || (typeof e.account === "string" && /^G[A-Z2-7]{55}$/.test(e.account))) &&
    (e.contractId === undefined || (typeof e.contractId === "string" && /^C[A-Z2-7]{55}$/.test(e.contractId))) &&
    (e.txHash === null || (typeof e.txHash === "string" && /^[a-f0-9]{64}$/i.test(e.txHash)));
}
function load(): LedgerEntry[] {
  if (volatileEntries) return [...volatileEntries];
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOG_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(validEntry).slice(-MAX_ENTRIES) : [];
  } catch { return []; }
}

function save(entries: LedgerEntry[]): void {
  const bounded = entries.slice(-MAX_ENTRIES);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOG_KEY, JSON.stringify(bounded));
    volatileEntries = null;
  } catch {
    // A storage failure must never turn a confirmed chain transaction into a failure.
    volatileEntries = bounded;
  }
}

export function listEntries(): LedgerEntry[] {
  return load().sort((a, b) => b.seq - a.seq);
}

export function logEntry(
  e: Omit<LedgerEntry, "seq" | "ts"> & { ts?: string },
): LedgerEntry {
  const entries = load();
  const receipt = consumeReceipt(e.action, e.refId);
  const confirmed = e.status !== "rejected" ? receipt : undefined;
  const hash = confirmed?.hash ?? e.txHash;
  const previous = hash ? entries.find(row => row.txHash === hash) : undefined;
  const entry: LedgerEntry = {
    seq: previous?.seq ?? Math.max(0, ...entries.map(row => row.seq)) + 1,
    ts: previous?.ts ?? e.ts ?? new Date().toISOString(),
    ledger: confirmed?.ledger ?? e.ledger,
    template: e.template,
    action: e.action,
    refId: e.refId,
    amount: e.amount,
    status: e.status,
    detail: e.detail,
    txHash: confirmed?.hash ?? e.txHash,
    account: confirmed?.account ?? e.account,
    network: confirmed?.network ?? e.network,
    contractId: confirmed?.contractId ?? e.contractId,
  };
  if (previous) entries[entries.indexOf(previous)] = entry;
  else entries.push(entry);
  save(entries);
  if (entry.txHash) {
    for (const attempt of listTransactionAttempts().filter(a => a.hash === entry.txHash)) updateTransactionAttempt(attempt.hash, attempt, { recorded: true });
  }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("agyion:record", { detail: entry }));
  return entry;
}


/** A local record link identifies a record, never a permission or a transaction. */
export function recordHref(template: TemplateName, refId: string): string | null {
  const id = template === "envoy" ? refId.split("→")[0] : refId;
  if (!/^[0-9]{1,20}$/.test(id) || BigInt(id) > 0xffff_ffff_ffff_ffffn) return null;
  return `/app/?tab=${template}&ref=${encodeURIComponent(id)}`;
}
export function entryRecordHref(entry: LedgerEntry, current: { network: string; contractId: string; mock: boolean }): string | null {
  if (!current.mock && (entry.network !== current.network || entry.contractId !== current.contractId)) return null;
  return recordHref(entry.template, entry.refId);
}
export function transactionTemplate(action: string): TemplateName {
  if (action.includes("pod")) return "pod";
  if (action.includes("trigger") || action === "attest") return "trigger";
  if (action.includes("mandate") || action === "envoy_claim") return "envoy";
  return "fade";
}
/** Recovered confirmations add evidence, not guessed amounts or simulated outcomes. */
export function recoverTransactionEntries(scope?: TransactionScope): void {
  const entries = load();
  for (const attempt of listTransactionAttempts(scope)) {
    if (attempt.status !== "success" || attempt.recorded || attempt.refId === null || entries.some(e => e.txHash === attempt.hash)) continue;
    const entry = logEntry({ template: transactionTemplate(attempt.action), action: attempt.action, refId: attempt.refId,
      amount: null, status: "recorded", detail: "Transaction confirmed by RPC. Open the record for its current state.",
      txHash: attempt.hash, ledger: attempt.ledger, account: attempt.account, network: attempt.network, contractId: attempt.contractId });
    entries.push(entry);
  }
}

export function clearLog(): void {
  volatileEntries = null;
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(LOG_KEY); } catch { volatileEntries = []; }
}

// ---------------------------------------------------------------------------
// Proof Pack — signed JSON export
// ---------------------------------------------------------------------------

export interface ProofPack {
  product: "Agyion";
  kind: "proof-pack";
  version: 1;
  exportedAt: string;
  exporter: string | null; // active address, when known
  entries: LedgerEntry[];
  checksum: string; // sha256 hex of canonical entries JSON
  signature: string | null; // ed25519 sig over checksum bytes (hex)
  signer: string | null; // address of the signing key
}

async function sha256HexBytes(data: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function buildProofPack(exporter: string | null): Promise<ProofPack> {
  const entries = listEntries().sort((a, b) => a.seq - b.seq);
  const canonical = JSON.stringify(entries);
  const checksum = await sha256HexBytes(new TextEncoder().encode(canonical));

  let signature: string | null = null;
  let signer: string | null = null;
  const testSigner = storedTestSigner();
  if (testSigner) {
    try {
      signer = await testSigner.address();
      signature = testSigner.signBytes(new TextEncoder().encode(checksum));
    } catch {
      signature = null;
      signer = null;
    }
  }

  return {
    product: "Agyion",
    kind: "proof-pack",
    version: 1,
    exportedAt: new Date().toISOString(),
    exporter,
    entries,
    checksum,
    signature,
    signer,
  };
}

export function downloadProofPack(pack: ProofPack): void {
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `agyion-proof-pack-${pack.exportedAt.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
