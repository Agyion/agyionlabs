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
const RECORDS_PREFIX = "agyion.ledger.v2:entry:";
const CLEARS_PREFIX = "agyion.ledger.v2:clear:";

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

interface StoredEntry { generation: string; entry: LedgerEntry }
interface ClearMarker { generation: string; order: number; suppressedHashes: string[] }
interface ClearState extends ClearMarker { keys: string[] }
const volatileEntries = new Map<string, StoredEntry>();
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
function clearState(): ClearState {
  let state: ClearMarker = { generation: "legacy", order: 0, suppressedHashes: [] };
  const hidden = new Set<string>();
  const keys = storageKeys(CLEARS_PREFIX);
  for (const key of keys) {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "null") as ClearMarker;
    if (!value || typeof value.generation !== "string" || !value.generation || !Number.isSafeInteger(value.order) || value.order <= 0 ||
      !Array.isArray(value.suppressedHashes) || !value.suppressedHashes.every(hash => typeof hash === "string" && /^[a-f0-9]{64}$/i.test(hash))) {
      throw new Error("Ledger clear marker is unreadable. Keep this browser's data before retrying.");
    }
    value.suppressedHashes.forEach(hash => hidden.add(hash.toLowerCase()));
    if (value.order > state.order || (value.order === state.order && value.generation > state.generation)) state = value;
  }
  return { ...state, suppressedHashes: [...hidden], keys };
}

function storageKeys(prefix: string): string[] {
  return Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
    .filter((key): key is string => key !== null && key.startsWith(prefix));
}

function load(): LedgerEntry[] {
  if (typeof window === "undefined") return [];
  let state: ClearState;
  try { state = clearState(); } catch { return []; }
  const candidates = new Map(volatileEntries);
  try {
    // Existing arrays remain readable; new actions never rewrite that array.
    const legacy: unknown = JSON.parse(window.localStorage.getItem(LOG_KEY) ?? "[]");
    if (Array.isArray(legacy)) legacy.filter(validEntry).forEach((entry, index) => candidates.set(`legacy:${index}`, { generation: "legacy", entry }));
  } catch { /* Invalid local history is not transaction outcome evidence. */ }
  let keys: string[] = [];
  try { keys = storageKeys(RECORDS_PREFIX); } catch { /* Keep any in-memory history available. */ }
  for (const key of keys) {
    try {
      const record = JSON.parse(window.localStorage.getItem(key) ?? "null") as StoredEntry;
      if (record && typeof record.generation === "string" && validEntry(record.entry)) candidates.set(key, record);
    } catch { /* Other valid history and durable recovery remain available. */ }
  }
  const hidden = new Set(state.suppressedHashes.map(hash => hash.toLowerCase()));
  const unique = new Map<string, { id: string; entry: LedgerEntry }>();
  for (const [id, record] of candidates) {
    if (record.generation !== state.generation || (record.entry.txHash && hidden.has(record.entry.txHash.toLowerCase()))) continue;
    const key = record.entry.txHash?.toLowerCase() ?? id;
    const previous = unique.get(key);
    // A concurrent generic recovery row must not erase the actual action's detail.
    const detail = (entry: LedgerEntry) => (entry.status === "recorded" ? 0 : 2) + (entry.amount === null ? 0 : 1);
    if (!previous || detail(record.entry) > detail(previous.entry)) unique.set(key, { id, entry: record.entry });
  }
  let sequence = 0;
  return [...unique.values()].sort((a, b) => a.entry.seq - b.entry.seq || a.entry.ts.localeCompare(b.entry.ts) || a.id.localeCompare(b.id))
    .map(({ entry }) => ({ ...entry, seq: sequence = Math.max(sequence + 1, entry.seq) })).slice(-MAX_ENTRIES);
}

function save(entry: LedgerEntry): void {
  if (typeof window === "undefined") return;
  let state: ClearState;
  try { state = clearState(); } catch { return; }
  const id = `${RECORDS_PREFIX}${crypto.randomUUID()}`;
  const record = { generation: state.generation, entry };
  try { window.localStorage.setItem(id, JSON.stringify(record)); }
  catch { volatileEntries.set(id, record); } // Confirmation remains true if local history cannot persist.
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
  save(entry);
  if (entry.txHash) {
    try { for (const attempt of listTransactionAttempts().filter(a => a.hash === entry.txHash)) updateTransactionAttempt(attempt.hash, attempt, { recorded: true }); }
    catch { /* Local recovery trouble must not erase a confirmed action. */ }
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
  if (typeof window === "undefined") return;
  const entries = load();
  const hidden = new Set(clearState().suppressedHashes.map(hash => hash.toLowerCase()));
  for (const attempt of listTransactionAttempts(scope)) {
    if (attempt.status !== "success" || hidden.has(attempt.hash.toLowerCase()) || attempt.refId === null || entries.some(e => e.txHash === attempt.hash)) continue;
    const entry = logEntry({ template: transactionTemplate(attempt.action), action: attempt.action, refId: attempt.refId,
      amount: null, status: "recorded", detail: "Transaction confirmed by RPC. Open the record for its current state.",
      txHash: attempt.hash, ledger: attempt.ledger, account: attempt.account, network: attempt.network, contractId: attempt.contractId });
    entries.push(entry);
  }
}

export function clearLog(): void {
  if (typeof window === "undefined") return;
  const state = clearState();
  const hidden = new Set(state.suppressedHashes);
  for (const entry of load()) if (entry.txHash) hidden.add(entry.txHash);
  // Include prior confirmations whose local row was lost before this explicit clear.
  for (const attempt of listTransactionAttempts()) if (attempt.status === "success") hidden.add(attempt.hash);
  const oldKeys = storageKeys(RECORDS_PREFIX);
  // Commit the clear first. A concurrent older write carries the old generation
  // and stays hidden; subsequent actions read the new generation and stay visible.
  const generation = crypto.randomUUID();
  window.localStorage.setItem(`${CLEARS_PREFIX}${generation}`, JSON.stringify({ generation, order: state.order + 1, suppressedHashes: [...hidden] }));
  volatileEntries.clear();
  // The new marker contains every suppression read above. Compact only those
  // exact markers; a concurrent clear created after that snapshot must survive.
  for (const key of [LOG_KEY, ...oldKeys, ...state.keys]) {
    try { window.localStorage.removeItem(key); } catch { /* The durable marker already hides these rows. */ }
  }
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
