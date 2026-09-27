"use client";

/**
 * RampPanel — On/Off-ramp against the official hackathon TR mock anchor.
 *
 * Flow: authenticate (SEP-10) → see the TRY/USDC rate (SEP-38) → deposit TRY
 * and get bank instructions (SEP-6) → withdraw USDC back to a TRY IBAN.
 *
 * Honesty notes are part of the design: the anchor is a sandbox, the bank leg
 * is simulated, and mock contract mode does not affect this panel — the ramp
 * talks to the real testnet anchor either way.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Horizon } from "@stellar/stellar-sdk";
import {
  AnchorError,
  authenticate,
  depositTry,
  sep6Info,
  transactionStatus,
  tryUsdcPrice,
  withdrawTry,
  type AnchorTransaction,
  type DepositInstructions,
  type TryUsdcPrice,
  type WithdrawInstructions,
} from "../../lib/anchor";
import { defaultSigner, onWalletSessionChange, walletSessionVersion } from "../../lib/wallet";
import {
  createAssetTrustline,
  friendbotFund,
  sendAnchorPayment,
  reconcileAnchorPayments,
} from "../../lib/accountOps";
import { listAnchorPayments, type AnchorPaymentAttempt } from "../../lib/anchorPayments";
import { CONFIG, IS_MOCK } from "../../lib/config";
import { shortAddress } from "../../lib/format";
import type { WalletState } from "../../lib/useWallet";
import { ExchangeRoute } from "./instrumentPresentation";
import {
  ErrorNote,
  Field,
  FilledButton,
  GhostButton,
  OkNote,
  TextInput,
} from "../ui";

const HORIZON_URL = "https://horizon-testnet.stellar.org";

interface DepositEstimate {
  value: TryUsdcPrice;
  requestedAmount: string;
  direction: "TRY → USDC";
  requestedAt: string;
}

export default function RampPanel({ wallet }: { wallet: WalletState }) {
  const [sessionVersion, setSessionVersion] = useState(walletSessionVersion);
  useEffect(() => onWalletSessionChange(() => setSessionVersion(walletSessionVersion())), []);
  return <RampSession key={`${wallet.address ?? "disconnected"}:${sessionVersion}`} wallet={wallet} sessionVersion={sessionVersion} />;
}

function RampSession({ wallet, sessionVersion }: { wallet: WalletState; sessionVersion: number }) {
  // Re-resolve the signer when the connected wallet changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const signer = useMemo(() => defaultSigner(), [wallet.address]);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const isCurrentSession = useCallback(() => mounted.current && walletSessionVersion() === sessionVersion, [sessionVersion]);
  const assertCurrentSession = useCallback(() => {
    if (!isCurrentSession()) throw new AnchorError("auth", "The wallet session changed. Start this action again with the connected wallet.");
  }, [isCurrentSession]);

  const [token, setToken] = useState<string | null>(null);
  const [info, setInfo] = useState<{ feePercent?: number } | null>(null);
  const [quote, setQuote] = useState<DepositEstimate | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const quoteGeneration = useRef(0);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceNote, setBalanceNote] = useState<string | null>(null);

  const [direction, setDirection] = useState<"deposit" | "withdraw">("deposit");
  const [depAmount, setDepAmount] = useState("1000");
  const [deposit, setDeposit] = useState<DepositInstructions | null>(null);
  const [wdAmount, setWdAmount] = useState("20");
  const [wdIban, setWdIban] = useState("TR330006100519786457841326");
  const [withdraw, setWithdraw] = useState<(WithdrawInstructions & { requestedAmount: string; destinationIban: string }) | null>(null);
  const [statusRecord, setStatusRecord] = useState<{ id: string; value: AnchorTransaction } | null>(null);
  const activeTransfer = direction === "deposit" ? deposit : withdraw;
  const status = statusRecord?.id === activeTransfer?.id ? statusRecord?.value : null;

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [payments, setPayments] = useState<AnchorPaymentAttempt[]>([]);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const payment = payments.find(p => p.withdrawalId === withdraw?.id && p.status !== "failed");
  const refreshPaymentRecords = useCallback(() => {
    if (!isCurrentSession()) return;
    try { setPayments(wallet.address ? listAnchorPayments(wallet.address) : []); setRecoveryError(null); }
    catch (e) { setRecoveryError(e instanceof Error ? e.message : "Payment recovery is unavailable."); }
  }, [isCurrentSession, wallet.address]);
  useEffect(() => {
    refreshPaymentRecords();
    window.addEventListener("agyion:anchor-payments", refreshPaymentRecords);
    window.addEventListener("storage", refreshPaymentRecords);
    return () => {
      window.removeEventListener("agyion:anchor-payments", refreshPaymentRecords);
      window.removeEventListener("storage", refreshPaymentRecords);
    };
  }, [refreshPaymentRecords]);

  const run = useCallback(async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      assertCurrentSession();
      await fn();
    } catch (e) {
      if (isCurrentSession() && e instanceof AnchorError && e.kind === "auth") setToken(null);
      if (isCurrentSession()) setError(
        e instanceof AnchorError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      if (isCurrentSession()) setBusy(null);
    }
  }, [assertCurrentSession, isCurrentSession]);

  const invalidateQuote = () => {
    quoteGeneration.current += 1;
    setQuote(null);
    setQuoteError(null);
    setQuoteBusy(false);
  };

  const requestQuote = useCallback(async (amount: string) => {
    const generation = ++quoteGeneration.current;
    const requestedAmount = amount.trim();
    const requestedAt = new Date().toISOString();
    const current = () => isCurrentSession() && generation === quoteGeneration.current;
    setQuote(null);
    setQuoteError(null);
    if (!/^\d+(?:\.\d+)?$/.test(requestedAmount) || !Number.isFinite(Number(requestedAmount)) || Number(requestedAmount) <= 0) {
      setQuoteBusy(false);
      setQuoteError("Enter a positive TRY amount to request an estimate.");
      return;
    }
    setQuoteBusy(true);
    try {
      const value = await tryUsdcPrice(requestedAmount);
      if (current()) setQuote({ value, requestedAmount, direction: "TRY → USDC", requestedAt });
    } catch (e) {
      if (current()) setQuoteError(e instanceof Error ? e.message : String(e));
    } finally {
      if (current()) setQuoteBusy(false);
    }
  }, [isCurrentSession]);

  // This endpoint only estimates TRY -> USDC. It does not reserve a rate.
  useEffect(() => {
    sep6Info()
      .then((i) => { if (isCurrentSession()) setInfo({ feePercent: i.deposit?.[CONFIG.assetCode]?.fee_percent }); })
      .catch(() => { if (isCurrentSession()) setInfo(null); });
    void requestQuote("1000");
    return () => { quoteGeneration.current += 1; };
  }, [isCurrentSession, requestQuote]);

  // USDC balance via Horizon (honest fallback if the account is unfunded)
  useEffect(() => {
    setBalance(null);
    setBalanceNote(null);
    if (!wallet.address) return;
    const server = new Horizon.Server(HORIZON_URL);
    server
      .loadAccount(wallet.address)
      .then((acc) => {
        const b = acc.balances.find(
          (x) =>
            x.asset_type !== "native" &&
            "asset_code" in x &&
            x.asset_code === CONFIG.assetCode &&
            x.asset_issuer === CONFIG.assetAddress,
        );
        setBalance(b ? `${b.balance} ${CONFIG.assetCode}` : `0 ${CONFIG.assetCode}`);
      })
      .catch(() =>
        setBalanceNote(
          "No funded testnet account for this key yet: friendbot funding is a separate step. The ramp itself does not require it.",
        ),
      );
  }, [wallet.address]);

  const ensureAuth = useCallback(async (): Promise<string> => {
    assertCurrentSession();
    // authenticate owns expiry/session validation and safely reuses a valid token.
    // A component's display state must never bypass that validation on later actions.
    if (!signer) {
      throw new AnchorError(
        "auth",
        "Connect a wallet in the top bar first: SEP-10 needs a signer.",
      );
    }
    const t = await authenticate(signer);
    assertCurrentSession();
    setToken(t);
    return t;
  }, [signer, assertCurrentSession]);

  const doAuth = () =>
    run("auth", async () => {
      await ensureAuth();
      setNotice("SEP-10 authenticated with the mock anchor.");
    });

  const doDeposit = () =>
    run("deposit", async () => {
      const t = await ensureAuth();
      const account = wallet.address ?? (await signer!.address());
      assertCurrentSession();
      const d = await depositTry(t, account, depAmount);
      assertCurrentSession();
      setDeposit(d);
      setStatusRecord(null);
      setNotice("Deposit instructions received from the anchor.");
    });

  const doWithdraw = () =>
    run("withdraw", async () => {
      const t = await ensureAuth();
      const requestedAmount = wdAmount.trim();
      const destinationIban = wdIban.trim();
      assertCurrentSession();
      const w = await withdrawTry(t, requestedAmount, destinationIban);
      assertCurrentSession();
      setWithdraw({ ...w, requestedAmount, destinationIban });
      setStatusRecord(null);
      setNotice("Withdrawal registered: send the USDC payment with the exact memo below.");
    });

  const doStatus = () =>
    run("status", async () => {
      const id = direction === "deposit" ? deposit?.id : withdraw?.id;
      if (!id) throw new AnchorError("anchor", "No transaction to check yet.");
      const t = await ensureAuth();
      assertCurrentSession();
      const fresh = await transactionStatus(t, id);
      assertCurrentSession();
      setStatusRecord({ id, value: fresh });
    });

  const doFriendbot = () =>
    run("friendbot", async () => {
      if (!wallet.address) throw new AnchorError("auth", "Connect a wallet first.");
      await friendbotFund(wallet.address);
      assertCurrentSession();
      setNotice("Friendbot funded the account with testnet XLM (fees covered).");
    });

  const doTrustline = () =>
    run("trustline", async () => {
      if (!signer || !wallet.address)
        throw new AnchorError("auth", "Connect a wallet first.");
      const hash = await createAssetTrustline(signer, wallet.address);
      assertCurrentSession();
      setNotice(`USDC trustline created (tx ${hash.slice(0, 12)}…): deposits can now land.`);
    });

  const doSendPayment = () =>
    run("pay", async () => {
      if (!signer || !wallet.address)
        throw new AnchorError("auth", "Connect a wallet first.");
      if (!withdraw) return;
      const hash = await sendAnchorPayment(
        signer,
        wallet.address,
        withdraw.accountId,
        withdraw.requestedAmount,
        withdraw.memoType,
        withdraw.memo,
        withdraw.id,
      );
      assertCurrentSession();
      refreshPaymentRecords();
      setNotice(`USDC sent to the anchor (tx ${hash.slice(0, 12)}…). The TRY payout is simulated by the sandbox.`);
    });

  const checkPayments = () => run("payment-status", async () => {
    if (!wallet.address) return;
    await reconcileAnchorPayments(wallet.address);
    assertCurrentSession();
    refreshPaymentRecords();
  });

  return (
    <div className="instrument-panel panel-ramp">
      <div className="instrument-feedback">{error && <ErrorNote>{error}</ErrorNote>}{recoveryError && <ErrorNote>{recoveryError} Payment is disabled until recovery is readable.</ErrorNote>}{notice && <OkNote>{notice}</OkNote>}</div>
      <div className="ramp-desk">
        <div className="ramp-converter workbench-surface">
          <header className="workbench-heading"><h3>Transfer</h3></header>
          <div className="instrument-notice"><p>Sandbox only: bank transfers and TRY payouts are simulated; USDC uses Stellar testnet.{IS_MOCK ? " Separate from local instrument simulation." : ""}</p></div>
          <div className="ramp-switch" role="group" aria-label="Transfer direction">
            <button type="button" aria-pressed={direction === "deposit"} onClick={() => { if (direction !== "deposit") invalidateQuote(); setDirection("deposit"); }}>Deposit</button>
            <button type="button" aria-pressed={direction === "withdraw"} onClick={() => { if (direction !== "withdraw") invalidateQuote(); setDirection("withdraw"); }}>Withdraw</button>
          </div>
          <ExchangeRoute direction={direction} amount={direction === "deposit" ? depAmount : wdAmount} />
          <section className="instrument-section ramp-deposit-terms" aria-label="Deposit terms" hidden={direction !== "deposit"}>
            <Field label="TRY amount"><TextInput value={depAmount} onChange={(e) => { invalidateQuote(); setDepAmount(e.target.value); }} inputMode="decimal" /></Field>
          <section className="ramp-quote">
            {direction === "deposit" && <>
              <GhostButton onClick={() => void requestQuote(depAmount)} disabled={quoteBusy}>{quoteBusy ? "Estimating…" : "Refresh estimate"}</GhostButton>
              {quoteError && <ErrorNote>{quoteError}</ErrorNote>}
              {quote?.value ? <>
                <div className="ramp-rate">1 USDC ≈ {Number(quote.value.price).toFixed(2)} TRY</div>
                <dl className="instrument-summary"><div><dt>Estimated amount</dt><dd>{Number(quote.value.buyAmount).toFixed(2)} USDC</dd></div>{quote.value.feeTotal && <div><dt>Estimated fee</dt><dd>{quote.value.feeTotal} {quote.value.feeAsset === "iso4217:TRY" ? "TRY" : quote.value.feeAsset}</dd></div>}</dl>
                <p className="instrument-disclosure">Indicative only; not a booked rate.</p>
                <details className="instrument-technical"><summary>Estimate details</summary>
                  <dl className="instrument-summary"><div><dt>Direction</dt><dd>{quote.direction}</dd></div><div><dt>Requested amount</dt><dd>{quote.requestedAmount} TRY</dd></div></dl>
                  <p>The price endpoint supplies no expiry. Requested at <time dateTime={quote.requestedAt}>{new Date(quote.requestedAt).toLocaleTimeString()}</time>. Refresh before relying on this estimate.</p>
                </details>
              </> : null}
            </>}
          </section>
            <div className="instrument-actions"><FilledButton onClick={doDeposit} disabled={busy !== null || !signer || !wallet.address}>{busy === "deposit" ? "Requesting…" : "Get deposit instructions"}</FilledButton></div>
            {!wallet.address && <p className="instrument-disclosure">Connect a wallet to continue.</p>}
            {deposit && <div className="ramp-receipt">
              <Row k="Bank" v={deposit.bankName} /><Row k="IBAN" v={deposit.iban} /><Row k="Reference" v={deposit.transferMemo} /><Row k="Transaction ID" v={deposit.id} />
              {deposit.eta != null && <Row k="Estimated time" v={`${deposit.eta}s (sandbox)`} />}
              <p className="instrument-disclosure">{deposit.how}</p>{deposit.message && <p className="instrument-disclosure">{deposit.message}</p>}
            </div>}
          </section>
          <section className="instrument-section ramp-withdraw-terms" aria-label="Withdrawal terms" hidden={direction !== "withdraw"}>
            <div className="instrument-fields">
              <Field label={`Amount (${CONFIG.assetCode})`}><TextInput value={wdAmount} onChange={(e) => setWdAmount(e.target.value)} inputMode="decimal" /></Field>
              <div className="instrument-field-wide"><Field label="Destination IBAN (TRY)"><TextInput value={wdIban} onChange={(e) => setWdIban(e.target.value)} /></Field></div>
            </div>
            <p className="ramp-withdraw-estimate">No USDC to TRY estimate is available from this price endpoint. Registering a withdrawal fixes its USDC amount and payment memo; the sandbox simulates the TRY payout.</p>
            <div className="instrument-actions"><FilledButton onClick={doWithdraw} disabled={busy !== null || !signer || !wallet.address}>{busy === "withdraw" ? "Registering…" : "Register withdrawal"}</FilledButton></div>
            {!wallet.address && <p className="instrument-disclosure">Connect a wallet to continue.</p>}
            {withdraw && <div className="ramp-receipt">
              <Row k="Send USDC to" v={withdraw.accountId} /><Row k="Registered amount" v={`${withdraw.requestedAmount} ${CONFIG.assetCode}`} /><Row k="Destination IBAN" v={withdraw.destinationIban} /><Row k={`Memo (${withdraw.memoType})`} v={withdraw.memo} /><Row k="Transaction ID" v={withdraw.id} />
              {withdraw.message && <p className="instrument-disclosure">{withdraw.message}</p>}
              <p className="instrument-disclosure">Sign the USDC payment with the exact memo above so the anchor can match it. The TRY payout to your IBAN is simulated.</p>
              <div className="instrument-actions"><FilledButton onClick={doSendPayment} disabled={busy !== null || !signer || !wallet.address || !!payment || !!recoveryError}>{busy === "pay" ? "Sending…" : payment?.status === "success" ? "Payment confirmed" : payment ? "Payment unresolved" : `Send ${withdraw.requestedAmount} ${CONFIG.assetCode} to the anchor`}</FilledButton></div>
            </div>}
          </section>
          {payments.length > 0 && <section className="instrument-records" aria-label="Payment recovery">
            <header><h3>Payment recovery</h3><GhostButton onClick={checkPayments} disabled={busy !== null}>{busy === "payment-status" ? "Checking…" : "Check payment status"}</GhostButton></header>
            {payments.map(p => <details className="instrument-technical" key={p.hash} open={p.status === "pending" || p.status === "unknown"}>
              <summary>{p.amount} {p.assetCode} · {p.status === "success" ? "confirmed" : p.status === "failed" ? "failed" : "unresolved"}</summary>
              <Row k="Withdrawal" v={p.withdrawalId} /><Row k="Transaction" v={p.hash} />
              {(p.status === "pending" || p.status === "unknown") && <p className="instrument-disclosure">Check this hash before retrying. An unavailable result does not mean the payment failed.</p>}
            </details>)}
          </section>}
          {activeTransfer && <section className="instrument-records">
            <header><h3>Transfer status</h3><GhostButton onClick={doStatus} disabled={busy === "status"}>{busy === "status" ? "Checking…" : "Refresh"}</GhostButton></header>
            {status ? <div className="ramp-receipt"><Row k="ID" v={status.id} /><Row k="Kind" v={status.kind} /><Row k="Status" v={status.status} />{status.amountIn && <Row k="In" v={status.amountIn} />}{status.amountOut && <Row k="Out" v={status.amountOut} />}{status.message && <p className="instrument-disclosure">{status.message}</p>}</div> : <p className="instrument-empty">Refresh to check this transfer with the anchor.</p>}
          </section>}
        </div>
        <aside className="ramp-account-desk">

          <section className="ramp-account">
            <h3>Your account</h3>
            <dl className="instrument-summary"><div><dt>Wallet</dt><dd>{wallet.address ? shortAddress(wallet.address) : "Not connected"}</dd></div><div><dt>Anchor session</dt><dd>{token ? "SEP-10 authenticated" : "Not connected"}</dd></div><div><dt>Testnet balance</dt><dd>{balance ?? "Not available"}</dd></div></dl>
            {balanceNote && <p className="mt-3">{balanceNote}</p>}
            {!token && <div className="instrument-actions"><GhostButton onClick={doAuth} disabled={busy !== null || !signer || !wallet.address}>{busy === "auth" ? "Authenticating…" : "Connect to anchor (SEP-10)"}</GhostButton></div>}
            <details className="instrument-technical"><summary>Testnet setup & anchor details</summary>
              <p>Friendbot provides test XLM for fees. A USDC trustline lets your account receive the asset.</p>
              {wallet.address && <div className="instrument-actions"><GhostButton onClick={doFriendbot} disabled={busy === "friendbot"}>{busy === "friendbot" ? "Funding…" : "Fund with friendbot"}</GhostButton><GhostButton onClick={doTrustline} disabled={busy === "trustline"}>{busy === "trustline" ? "Signing…" : "Create USDC trustline"}</GhostButton></div>}
              <dl className="instrument-summary"><div><dt>Anchor</dt><dd>{CONFIG.anchorUrl}</dd></div><div><dt>Asset issuer</dt><dd>{shortAddress(CONFIG.assetAddress)}</dd></div>{info?.feePercent != null && <div><dt>Fee</dt><dd>{info.feePercent}%</dd></div>}</dl>
            </details>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v?: string }) {
  if (!v) return null;
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-1">
      <span className="w-[130px] shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        {k}
      </span>
      <span className="tnum break-all text-ink">{v}</span>
    </div>
  );
}
