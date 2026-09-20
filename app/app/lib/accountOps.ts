/**
 * accountOps.ts — classic Stellar account helpers for the live (soroban) flow.
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
  Operation,
  Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { CONFIG } from "./config";
import type { TransactionSigner } from "./hakClient";

const HORIZON_URL = "https://horizon-testnet.stellar.org";

export class AccountOpError extends Error {}

function horizon(): Horizon.Server {
  return new Horizon.Server(HORIZON_URL);
}

/** Fund a testnet account via friendbot (XLM for fees). Idempotent-ish. */
export async function friendbotFund(address: string): Promise<void> {
  const res = await fetch(
    `https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`,
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (body.includes("createAccountAlreadyExist") || res.status === 400) {
      return; // already funded — fine
    }
    throw new AccountOpError(`Friendbot refused (${res.status}). Try again in a few seconds.`);
  }
}

async function signAndSubmit(
  signer: TransactionSigner,
  address: string,
  ops: Parameters<TransactionBuilder["addOperation"]>[0][],
  memo?: Memo,
): Promise<string> {
  const server = horizon();
  const source = await server.loadAccount(address);
  const builder = new TransactionBuilder(source, {
    fee: "10000",
    networkPassphrase: CONFIG.networkPassphrase,
  });
  for (const op of ops) builder.addOperation(op);
  if (memo) builder.addMemo(memo);
  const tx = builder.setTimeout(60).build();
  const signedXdr = await signer.signTransaction(tx.toXDR(), CONFIG.networkPassphrase);
  const signed = new Transaction(signedXdr, CONFIG.networkPassphrase);
  const result = await server.submitTransaction(signed);
  return result.hash as string;
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
  return signAndSubmit(
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
  );
}
