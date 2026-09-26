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
  Networks,
  Operation,
  StrKey,
  Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { CONFIG } from "./config";
import type { TransactionSigner } from "./hakClient";
import { assertSignedTransactionMatches, walletSessionVersion } from "./wallet";

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
