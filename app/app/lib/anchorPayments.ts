import { StrKey } from '@stellar/stellar-sdk';
import { CONFIG } from './config';
import { readRecoveryArray, readRecoveryRecords, writeRecoveryRecord, appendRecoveryEvidence, withRecoveryLock } from './recoveryStorage';

export interface AnchorPaymentIntent {
  account: string; network: string; anchor: string; withdrawalId: string;
  destination: string; amount: string; assetCode: string; assetIssuer: string;
  memoType: string; memo: string;
}
export interface AnchorPaymentAttempt extends AnchorPaymentIntent {
  hash: string; status: 'pending' | 'unknown' | 'success' | 'failed';
  ledger: number | null; createdAt: number;
}
const KEY = 'agyion.anchor-payments.v1';
const RECORDS = 'agyion.anchor-payments.v2:attempt:';
const EVIDENCE = 'agyion.anchor-payments.v2:evidence:';
interface PaymentEvidence { hash:string; status:AnchorPaymentAttempt['status']; ledger:number|null }

function valid(value: unknown): value is AnchorPaymentAttempt {
  if (!value || typeof value !== 'object') return false;
  const a = value as AnchorPaymentAttempt;
  return typeof a.hash === 'string' && /^[a-f0-9]{64}$/.test(a.hash) &&
    typeof a.account === 'string' && StrKey.isValidEd25519PublicKey(a.account) &&
    typeof a.destination === 'string' && StrKey.isValidEd25519PublicKey(a.destination) &&
    typeof a.assetIssuer === 'string' && StrKey.isValidEd25519PublicKey(a.assetIssuer) &&
    typeof a.assetCode === 'string' && /^[a-zA-Z0-9]{1,12}$/.test(a.assetCode) &&
    typeof a.network === 'string' && a.network.length > 0 && a.network.length < 200 &&
    typeof a.anchor === 'string' && /^https:\/\/[^/?#]+$/.test(a.anchor) &&
    typeof a.withdrawalId === 'string' && a.withdrawalId.length > 0 && a.withdrawalId.length <= 200 &&
    typeof a.amount === 'string' && /^\d+(?:\.\d{1,7})?$/.test(a.amount) &&
    ['text', 'id', 'hash'].includes(a.memoType) && typeof a.memo === 'string' && a.memo.length <= 128 &&
    ['pending', 'unknown', 'success', 'failed'].includes(a.status) &&
    Number.isFinite(a.createdAt) && (a.ledger === null || (Number.isSafeInteger(a.ledger) && a.ledger > 0));
}
function validEvidence(value:unknown): value is PaymentEvidence {
  if (!value || typeof value !== 'object') return false;
  const e=value as PaymentEvidence;
  return /^[a-f0-9]{64}$/.test(e.hash) && ['unknown','success','failed'].includes(e.status) &&
    (e.status==='unknown' ? e.ledger===null : Number.isSafeInteger(e.ledger) && Number(e.ledger)>0);
}
function load(): AnchorPaymentAttempt[] {
  const rows=new Map<string,AnchorPaymentAttempt>();
  for(const row of [...readRecoveryArray(KEY,valid),...readRecoveryRecords(RECORDS,valid)]) rows.set(row.hash,{...row});
  for(const e of readRecoveryRecords(EVIDENCE,validEvidence)) {
    const row=rows.get(e.hash);
    if(!row) throw new Error('Payment recovery storage has an outcome without its transaction. New payments are blocked.');
    if(row.status!=='success' && row.status!=='failed') rows.set(e.hash,{...row,status:e.status,ledger:e.ledger});
  }
  return [...rows.values()];
}
export function listAnchorPayments(account: string): AnchorPaymentAttempt[] {
  const anchor = new URL(CONFIG.anchorUrl).origin;
  return load().filter(a => a.account === account && a.network === CONFIG.networkPassphrase && a.anchor === anchor)
    .sort((a, b) => b.createdAt - a.createdAt);
}
function matching(a: AnchorPaymentIntent, b: AnchorPaymentIntent): boolean {
  return a.account === b.account && a.network === b.network && a.anchor === b.anchor && a.withdrawalId === b.withdrawalId;
}
export function assertAnchorPaymentAvailable(intent: AnchorPaymentIntent): void {
  const previous = load().find(a => matching(a, intent) && a.status !== 'failed');
  if (previous) throw new Error(previous.status === 'success'
    ? `This withdrawal payment is already confirmed (${previous.hash}). Do not send it again.`
    : `Payment outcome is unresolved. Check ${previous.hash} before retrying; nothing new was sent.`);
}
export function rememberAnchorPayment(intent: AnchorPaymentIntent, hash: string): void {
  assertAnchorPaymentAvailable(intent);
  const attempt: AnchorPaymentAttempt = { account: intent.account, network: intent.network, anchor: intent.anchor,
    withdrawalId: intent.withdrawalId, destination: intent.destination, amount: intent.amount,
    assetCode: intent.assetCode, assetIssuer: intent.assetIssuer, memoType: intent.memoType, memo: intent.memo,
    hash, status: 'pending', ledger: null, createdAt: Date.now() };
  if (!valid(attempt)) throw new Error('Invalid payment recovery metadata. Nothing was sent.');
  const rows = load();
  // Confirmed and uncertain payments remain protected against duplicate withdrawal funding.
  if (rows.length >= 1000) throw new Error('Payment recovery storage is full. Nothing was sent.');
  writeRecoveryRecord(RECORDS,hash,attempt,'agyion:anchor-payments');
}
export function updateAnchorPayment(hash: string, status: AnchorPaymentAttempt['status'], ledger: number | null): void {
  if (ledger !== null && (!Number.isSafeInteger(ledger) || ledger <= 0)) throw new Error('Invalid payment confirmation ledger.');
  if ((status === 'success' || status === 'failed') && ledger === null) throw new Error('Payment confirmation requires a ledger.');
  const row=load().find(a=>a.hash===hash);
  if (!row || row.status==='success' || row.status==='failed' || (row.status===status && row.ledger===ledger)) return;
  appendRecoveryEvidence(EVIDENCE,{hash,status,ledger},'agyion:anchor-payments');
}
/** Serialize the same withdrawal across supported tabs, before any wallet approval. */
export function withAnchorPaymentLock<T>(intent: AnchorPaymentIntent, action: () => Promise<T>): Promise<T> {
  const key=JSON.stringify(['anchor',intent.account,intent.network,intent.anchor,intent.withdrawalId]);
  return withRecoveryLock(key,async()=>{assertAnchorPaymentAvailable(intent);return action()});
}
