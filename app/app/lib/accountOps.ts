/**
 * accountOps.ts: classic Stellar account helpers for the live (soroban) flow.
 *
 * A fresh testnet key cannot use the product until it is (1) funded with XLM
 * for fees and (2) holding a USDC trustline. The anchor deposit then tops the
 * balance up, and the withdraw leg needs a USDC payment with an exact memo.
 * All three actions are one-click here, signed by the active wallet.
 */

import {
  Asset,
  Horizon,
  Memo,
  Networks,
  Operation,
  StrKey,
  Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { CONFIG } from "./config";
import type { TransactionSigner } from "./agyionClient";
import { assertSignedTransactionMatches, walletSessionVersion } from "./wallet";
import { listAnchorPayments, rememberAnchorPayment, updateAnchorPayment, withAnchorPaymentLock, type AnchorPaymentIntent } from "./anchorPayments";

const HORIZON_URL = "https://horizon-testnet.stellar.org";

export class AccountOpError extends Error {}

function horizon(): Horizon.Server {
  if (CONFIG.networkPassphrase !== Networks.TESTNET) throw new AccountOpError("Account operations support Stellar testnet only.");
  return new Horizon.Server(HORIZON_URL);
}

/** Fund a testnet account via friendbot (XLM for fees). Idempotent-ish. */
export async function friendbotFund(address: string): Promise<void> {
  if (CONFIG.networkPassphrase !== Networks.TESTNET || !StrKey.isValidEd25519PublicKey(address)) throw new AccountOpError("Friendbot requires a valid Stellar testnet account.");
  const res = await fetch(
    `https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`,
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (body.includes("createAccountAlreadyExist")) {
      return; // already funded: fine
    }
    throw new AccountOpError(`Friendbot refused (${res.status}). Try again in a few seconds.`);
  }
}

async function signAndSubmit(
  signer: TransactionSigner,
  address: string,
  ops: Parameters<TransactionBuilder["addOperation"]>[0][],
  memo?: Memo,
  paymentIntent?: AnchorPaymentIntent,
): Promise<string> {
  const version = walletSessionVersion();
  async function assertSession(): Promise<void> {
    if (version !== walletSessionVersion()) throw new AccountOpError("Wallet session changed before submission.");
    if (await signer.address() !== address) throw new AccountOpError("Wallet account does not match the transaction source.");
    if (version !== walletSessionVersion()) throw new AccountOpError("Wallet session changed before submission.");
  }
  await assertSession();
  const server = horizon();
  const source = await server.loadAccount(address);
  if (source.accountId() !== address) throw new AccountOpError("Horizon returned a different source account.");
  const builder = new TransactionBuilder(source, {
    fee: "10000",
    networkPassphrase: CONFIG.networkPassphrase,
  });
  for (const op of ops) builder.addOperation(op);
  if (memo) builder.addMemo(memo);
  const tx = builder.setTimeout(60).build();
  await assertSession();
  const signedXdr = await signer.signTransaction(tx.toXDR(), CONFIG.networkPassphrase);
  assertSignedTransactionMatches(tx.toXDR(), signedXdr, CONFIG.networkPassphrase, address);
  await assertSession();
  const signed = new Transaction(signedXdr, CONFIG.networkPassphrase);
  if (paymentIntent) {
    const hash = signed.hash().toString("hex");
    // Keep only public intent metadata, never a signed envelope or secret.
    rememberAnchorPayment(paymentIntent, hash);
    try {
      const result = await server.submitTransaction(signed);
      if (result.hash !== hash || result.successful !== true) throw new Error("Unconfirmed payment response");
      updateAnchorPayment(hash, "success", result.ledger);
      return hash;
    } catch {
      try { updateAnchorPayment(hash, "unknown", null); } catch { /* The pre-broadcast pending record still blocks a duplicate. */ }
      throw new AccountOpError(`Payment outcome could not be confirmed. Check ${hash} before retrying; do not send another payment.`);
    }
  }
  const hash = signed.hash().toString("hex");
  try {
    const result = await server.submitTransaction(signed);
    // Synchronous Horizon submission returns an ingested transaction with a ledger.
    // A fulfilled HTTP response alone must not become a confirmed trustline notice.
    if (result.hash !== hash || result.successful !== true || !Number.isSafeInteger(result.ledger) || result.ledger <= 0) {
      throw new Error("Unconfirmed trustline response");
    }
    return hash;
  } catch {
    throw new AccountOpError(`Trustline outcome could not be confirmed. Check ${hash} and the account's current trustline before retrying; the transaction may already have been applied.`);
  }
}

/** Create the USDC trustline on the user's account (required before deposit). */
export function createAssetTrustline(
  signer: TransactionSigner,
  address: string,
): Promise<string> {
  return signAndSubmit(signer, address, [
    Operation.changeTrust({
      asset: new Asset(CONFIG.assetCode, CONFIG.assetAddress),
    }),
  ]);
}

/** Send the withdraw-leg USDC payment to the anchor with its exact memo. */
export function sendAnchorPayment(
  signer: TransactionSigner,
  from: string,
  to: string,
  amount: string,
  memoType: string,
  memoValue: string,
  withdrawalId: string,
): Promise<string> {
  let memo: Memo;
  switch (memoType) {
    case "text":
      memo = Memo.text(memoValue);
      break;
    case "id":
      memo = Memo.id(memoValue);
      break;
    case "hash":
      memo = Memo.hash(memoValue);
      break;
    default:
      throw new AccountOpError(`Unsupported memo type from anchor: ${memoType}`);
  }
  const anchor = new URL(CONFIG.anchorUrl);
  if (anchor.protocol !== "https:" || anchor.username || anchor.password) throw new AccountOpError("Anchor requires a trusted HTTPS origin.");
  if (!withdrawalId || withdrawalId.length > 200) throw new AccountOpError("A registered withdrawal ID is required before payment.");
  const intent: AnchorPaymentIntent = { account: from, network: CONFIG.networkPassphrase, anchor: anchor.origin,
    withdrawalId, destination: to, amount, assetCode: CONFIG.assetCode, assetIssuer: CONFIG.assetAddress, memoType, memo: memoValue };
  return withAnchorPaymentLock(intent, () => signAndSubmit(
    signer,
    from,
    [
      Operation.payment({
        destination: to,
        asset: new Asset(CONFIG.assetCode, CONFIG.assetAddress),
        amount,
      }),
    ],
    memo,
    intent,
  ));
}

/** Read-only lookup of known hashes. NOT_FOUND never authorizes another payment. */
export async function reconcileAnchorPayments(account: string): Promise<void> {
  const server = horizon();
  for (const payment of listAnchorPayments(account).filter(a => a.status === "pending" || a.status === "unknown")) {
    try {
      const tx = await server.transactions().transaction(payment.hash).call();
      if (tx.hash !== payment.hash || typeof tx.successful !== "boolean") continue;
      updateAnchorPayment(payment.hash, tx.successful ? "success" : "failed", tx.ledger_attr);
    } catch { /* A failed lookup is uncertainty, never evidence that payment is safe to repeat. */ }
  }
}
