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
import { scValToNative, TransactionBuilder, type xdr } from "@stellar/stellar-sdk";
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
import { readRecoveryArray, readRecoveryRecords, writeRecoveryRecord, appendRecoveryEvidence } from './recoveryStorage';
const RECORDS = 'agyion.transactions.v2:attempt:';
const EVIDENCE = 'agyion.transactions.v2:evidence:';
interface AttemptEvidence extends TransactionScope { hash: string; update: Partial<Pick<TransactionAttempt, 'status' | 'ledger' | 'refId' | 'recorded'>>; checkedAt: number }
function identity(a: TransactionScope & {hash:string}): string { return encodeURIComponent(JSON.stringify([a.account,a.network,a.contractId,a.hash])); }
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
    ACTIONS.includes(a.action) && (a.refId === null || (typeof a.refId === "string" && /^\d{1,20}(?:→\d{1,20})?$/.test(a.refId))) &&
    ["pending", "unknown", "success", "failed"].includes(a.status) &&
    (a.ledger === null || (Number.isSafeInteger(a.ledger) && a.ledger >= 0)) &&
    (a.recorded === undefined || typeof a.recorded === "boolean") &&
    Number.isFinite(a.createdAt) && (a.checkedAt === null || Number.isFinite(a.checkedAt));
}
function validEvidence(value: unknown): value is AttemptEvidence {
  if (!value || typeof value !== 'object') return false;
  const e = value as AttemptEvidence;
  if (!e.update || typeof e.update !== 'object' || !Number.isFinite(e.checkedAt)) return false;
  const prototype = { ...e, action:'claim', refId:null, status:'pending', ledger:null, createdAt:0, checkedAt:null, ...e.update };
  return validAttempt(prototype) && Object.keys(e.update).every(key=>['status','ledger','refId','recorded'].includes(key));
}
function hasTerminalLedger(ledger: number | null | undefined): boolean {
  return Number.isSafeInteger(ledger) && ledger! > 0;
}
function normalizeCreationReference(a: TransactionAttempt): TransactionAttempt {
  if (a.action.startsWith('create_') && a.refId !== null &&
    (!/^[1-9]\d{0,19}$/.test(a.refId) || creationRecordId(BigInt(a.refId)) === null)) return {...a,refId:null};
  return a;
}
function normalizeLegacyOutcome(a: TransactionAttempt): TransactionAttempt {
  if ((a.status === 'success' || a.status === 'failed') && !hasTerminalLedger(a.ledger)) {
    // Older send ERROR responses were saved as failures without chain evidence.
    // Restore the creation intent as well as its guard when an old ID is unproven.
    return {...a,status:'unknown',ledger:null,refId:a.action.startsWith('create_') ? null : a.refId};
  }
  return normalizeCreationReference(a);
}
function mergeEvidence(a: TransactionAttempt, e: AttemptEvidence): TransactionAttempt {
  const terminal = a.status === 'success' || a.status === 'failed';
  const proposed = (e.update.status === 'success' || e.update.status === 'failed') && !hasTerminalLedger(e.update.ledger)
    ? {status:'unknown' as const} : e.update;
  const update = terminal && proposed.status && proposed.status !== a.status ? {} : proposed;
  return normalizeCreationReference({...a,...update, checkedAt:Math.max(a.checkedAt ?? 0,e.checkedAt),
    refId: terminal && a.refId !== null ? a.refId : update.refId === undefined ? a.refId : update.refId,
    ledger: terminal && a.ledger !== null ? a.ledger : update.ledger === undefined ? a.ledger : update.ledger,
    recorded:a.recorded || e.update.recorded || undefined});
}
export function listTransactionAttempts(scope?: TransactionScope): TransactionAttempt[] {
  const rows = new Map<string,TransactionAttempt>();
  for (const a of [...readRecoveryArray(ATTEMPTS_KEY,validAttempt),...readRecoveryRecords(RECORDS,validAttempt)]) rows.set(identity(a),normalizeLegacyOutcome({...a}));
  for (const e of readRecoveryRecords(EVIDENCE,validEvidence)) {
    const id=identity(e),a=rows.get(id);
    if (!a) throw new Error('Recovery storage has evidence without its transaction. New transactions are blocked.');
    rows.set(id,mergeEvidence(a,e));
  }
  return [...rows.values()].filter(a=>!scope || sameScope(a,scope)).sort((a,b)=>b.createdAt-a.createdAt);
}
export function rememberTransactionAttempt(intent: TransactionIntent & { hash: string }): void {
  const attempt: TransactionAttempt = { account:intent.account,network:intent.network,contractId:intent.contractId,
    action:intent.action,refId:intent.refId,hash:intent.hash.toLowerCase(),status:'pending',ledger:null,createdAt:Date.now(),checkedAt:null };
  if (!validAttempt(attempt)) throw new Error('Invalid transaction recovery metadata. Nothing was sent.');
  const rows=listTransactionAttempts();
  if (rows.some(a=>identity(a)===identity(attempt))) return;
  if (rows.length >= 1000) throw new Error('Transaction recovery is full. Nothing was sent.');
  writeRecoveryRecord(RECORDS,identity(attempt),attempt,'agyion:transactions');
}
export function updateTransactionAttempt(hash: string, scope: TransactionScope, update: Partial<Pick<TransactionAttempt, 'status' | 'ledger' | 'refId' | 'recorded'>>): void {
  const current=listTransactionAttempts(scope).find(a=>a.hash===hash);
  if (!current) return;
  const evidence: AttemptEvidence = {account:scope.account,network:scope.network,contractId:scope.contractId,hash,update:{},checkedAt:Date.now()};
  for (const key of ['status','ledger','refId','recorded'] as const) if (update[key] !== undefined) Object.assign(evidence.update,{[key]:update[key]});
  if (!validEvidence(evidence)) throw new Error('Invalid recovery outcome metadata.');
  const merged=mergeEvidence(current,evidence);
  if (['status','ledger','refId','recorded'].every(key=>merged[key as keyof TransactionAttempt]===current[key as keyof TransactionAttempt])) return;
  appendRecoveryEvidence(EVIDENCE,evidence,'agyion:transactions');
}
/** Agyion allocates positive u64 record IDs; never coerce a malformed decoded result. */
export function creationRecordId(value: unknown): string | null {
  return typeof value === "bigint" && value > 0n && value <= 0xffff_ffff_ffff_ffffn ? String(value) : null;
}
/** Confirmation and record recovery are separate: a missing ID cannot authorize a new deposit. */
export function requiresTransactionRecovery(attempt: TransactionAttempt): boolean {
  return attempt.status === "pending" || attempt.status === "unknown" ||
    (attempt.status === "success" && attempt.action.startsWith("create_") && attempt.refId === null);
}
export function unresolvedTransaction(intent: TransactionIntent): TransactionAttempt | undefined {
  return listTransactionAttempts(intent).find(a => a.action === intent.action && a.refId === intent.refId && requiresTransactionRecovery(a));
}
export interface TransactionOutcomeResponse { txHash?: string; status: string; ledger?: number; envelopeXdr?: xdr.TransactionEnvelope; returnValue?: xdr.ScVal }
export function hasTerminalTransactionEvidence(response: TransactionOutcomeResponse | undefined, hash: string, network: string): response is TransactionOutcomeResponse & { status: 'SUCCESS' | 'FAILED'; ledger: number } {
  if (!response || response.txHash !== hash || (response.status !== 'SUCCESS' && response.status !== 'FAILED') ||
    !hasTerminalLedger(response.ledger) || !response.envelopeXdr) return false;
  // The SDK copies txHash from the request. Verify the returned envelope too;
  // provider honesty is still required for its claimed ledger/outcome.
  try { return TransactionBuilder.fromXDR(response.envelopeXdr, network).hash().toString('hex') === hash; }
  catch { return false; }
}
interface RecoveryServer { getTransaction(hash: string): Promise<TransactionOutcomeResponse> }
export async function reconcileTransactionAttempts(server: RecoveryServer, scope: TransactionScope): Promise<void> {
  for (const attempt of listTransactionAttempts(scope).filter(requiresTransactionRecovery)) {
    try {
      const response = await server.getTransaction(attempt.hash);
      const terminal = response.status === "SUCCESS" || response.status === "FAILED";
      if (response.txHash !== attempt.hash || (terminal && !hasTerminalTransactionEvidence(response, attempt.hash, scope.network))) {
        updateTransactionAttempt(attempt.hash, scope, { status: "unknown" });
        continue;
      }
      const status = response.status === "SUCCESS" ? "success" : response.status === "FAILED" ? "failed" : "unknown";
      let refId = attempt.refId;
      if (status === "success" && refId === null && attempt.action.startsWith("create_") && response.returnValue) {
        try {
          if (response.returnValue.switch().name === "scvU64") refId = creationRecordId(scValToNative(response.returnValue));
        } catch { /* Confirmation remains true even when its return value cannot be decoded. */ }
      }
      updateTransactionAttempt(attempt.hash, scope, { status, refId, ledger: status === "success" || status === "failed" ? response.ledger ?? null : null });
    } catch { updateTransactionAttempt(attempt.hash, scope, { status: "unknown" }); }
  }
}
