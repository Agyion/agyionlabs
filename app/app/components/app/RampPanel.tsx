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

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { defaultSigner } from "../../lib/wallet";
import {
  createAssetTrustline,
  friendbotFund,
  sendAnchorPayment,
} from "../../lib/accountOps";
import { CONFIG, IS_MOCK } from "../../lib/config";
import { shortAddress } from "../../lib/format";
import type { WalletState } from "../../lib/useWallet";
import {
  ArrowLink,
  ErrorNote,
  Eyebrow,
  Field,
  FilledButton,
  GhostButton,
  OkNote,
  TextInput,
} from "../ui";

const HORIZON_URL = "https://horizon-testnet.stellar.org";

export default function RampPanel({ wallet }: { wallet: WalletState }) {
  const signer = useMemo(() => defaultSigner(), [wallet.address]);

  const [token, setToken] = useState<string | null>(null);
  const [info, setInfo] = useState<{ feePercent?: number } | null>(null);
  const [quote, setQuote] = useState<TryUsdcPrice | null>(null);
  const [quoteAmount, setQuoteAmount] = useState("1000");
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceNote, setBalanceNote] = useState<string | null>(null);

  const [depAmount, setDepAmount] = useState("1000");
  const [deposit, setDeposit] = useState<DepositInstructions | null>(null);
  const [wdAmount, setWdAmount] = useState("20");
  const [wdIban, setWdIban] = useState("TR330006100519786457841326");
  const [withdraw, setWithdraw] = useState<WithdrawInstructions | null>(null);
  const [status, setStatus] = useState<AnchorTransaction | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = useCallback(async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof AnchorError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setBusy(null);
    }
  }, []);

  // Capability sheet + first quote on mount
  useEffect(() => {
    sep6Info()
      .then((i) =>
        setInfo({ feePercent: i.deposit?.[CONFIG.assetCode]?.fee_percent }),
      )
      .catch(() => setInfo(null));
    tryUsdcPrice("1000")
      .then(setQuote)
      .catch(() => setQuote(null));
  }, []);

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
          "No funded testnet account for this key yet — friendbot funding is a separate step. The ramp itself does not require it.",
        ),
      );
  }, [wallet.address]);

  const ensureAuth = useCallback(async (): Promise<string> => {
    if (token) return token;
    if (!signer) {
      throw new AnchorError(
        "auth",
        "Connect a wallet or paste a test secret in the top bar first — SEP-10 needs a signer.",
      );
    }
    const t = await authenticate(signer);
    setToken(t);
    return t;
  }, [token, signer]);

  const doAuth = () =>
    run("auth", async () => {
      await ensureAuth();
      setNotice("SEP-10 authenticated with the mock anchor.");
    });

  const doQuote = () =>
    run("quote", async () => {
      const q = await tryUsdcPrice(quoteAmount || "1000");
      setQuote(q);
    });

  const doDeposit = () =>
    run("deposit", async () => {
      const t = await ensureAuth();
      const account = wallet.address ?? (await signer!.address());
      const d = await depositTry(t, account, depAmount);
      setDeposit(d);
      setStatus(null);
      setNotice("Deposit instructions received from the anchor.");
    });

  const doWithdraw = () =>
    run("withdraw", async () => {
      const t = await ensureAuth();
      const w = await withdrawTry(t, wdAmount, wdIban.trim());
      setWithdraw(w);
      setStatus(null);
      setNotice("Withdrawal registered — send the USDC payment with the exact memo below.");
    });

  const doStatus = () =>
    run("status", async () => {
      const id = deposit?.id ?? withdraw?.id;
      if (!id) throw new AnchorError("anchor", "No transaction to check yet.");
      const t = await ensureAuth();
      setStatus(await transactionStatus(t, id));
    });

  const doFriendbot = () =>
    run("friendbot", async () => {
      if (!wallet.address) throw new AnchorError("auth", "Connect a wallet first.");
      await friendbotFund(wallet.address);
      setNotice("Friendbot funded the account with testnet XLM (fees covered).");
    });

  const doTrustline = () =>
    run("trustline", async () => {
      if (!signer || !wallet.address)
        throw new AnchorError("auth", "Connect a wallet first.");
      const hash = await createAssetTrustline(signer, wallet.address);
      setNotice(`USDC trustline created (tx ${hash.slice(0, 12)}…) — deposits can now land.`);
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
        wdAmount,
        withdraw.memoType,
        withdraw.memo,
      );
      setNotice(`USDC sent to the anchor (tx ${hash.slice(0, 12)}…). The TRY payout is simulated by the sandbox.`);
    });

  return (
    <div className="space-y-10">
      <header>
        <Eyebrow>On/Off-ramp · SEP-6</Eyebrow>
        <h1 className="display mt-2 text-[34px] text-ink md:text-[44px]">
          TRY in, TRY out
        </h1>
        <p className="mt-3 max-w-[64ch] text-[16px] leading-[1.65] text-muted">
          The official hackathon TR mock anchor ramps TRY against testnet USDC:
          deposit TRY by (simulated) bank transfer, receive USDC on Stellar,
          withdraw back to a TRY IBAN. KYC lives off-chain at the ramp; the
          merchant only ever sees TRY.
        </p>
        <p className="mt-2 max-w-[64ch] font-mono text-[12px] leading-relaxed text-muted">
          anchor: {CONFIG.anchorUrl} · asset: {CONFIG.assetCode}:
          {shortAddress(CONFIG.assetAddress)}
          {info?.feePercent != null && ` · fee: ${info.feePercent}%`}
        </p>
        {IS_MOCK && (
          <p className="mt-2 max-w-[64ch] text-[13px] italic text-muted">
            Note: the contract templates above are in mock mode, but this panel
            is not — it talks to the live testnet anchor. Sandbox only: no real
            money moves.
          </p>
        )}
      </header>

      {/* quote + balance */}
      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border p-5" style={{ borderColor: "var(--hairline)" }}>
          <Eyebrow>rate · SEP-38</Eyebrow>
          <div className="mt-3 flex items-end gap-3">
            <Field label="TRY amount">
              <TextInput
                value={quoteAmount}
                onChange={(e) => setQuoteAmount(e.target.value)}
                inputMode="decimal"
              />
            </Field>
            <GhostButton onClick={doQuote} disabled={busy === "quote"}>
              {busy === "quote" ? "…" : "Quote"}
            </GhostButton>
          </div>
          {quote && (
            <div className="mt-4 space-y-1 font-mono text-[13px] text-muted">
              <div className="tnum font-serif text-[28px] text-ink">
                1 USDC ≈ {Number(quote.price).toFixed(2)} TRY
              </div>
              <div>
                {quote.sellAmount} TRY → {Number(quote.buyAmount).toFixed(2)} USDC
                {quote.feeTotal && ` · fee ${quote.feeTotal} TRY (0.5% spread)`}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border p-5" style={{ borderColor: "var(--hairline)" }}>
          <Eyebrow>your side</Eyebrow>
          <div className="mt-3 space-y-2 text-[14px] text-muted">
            <div>
              wallet:{" "}
              <span className="font-mono text-ink">
                {wallet.address ? shortAddress(wallet.address) : "not connected"}
              </span>
            </div>
            <div>
              anchor session:{" "}
              <span className="font-mono text-ink">
                {token ? "SEP-10 authenticated" : "—"}
              </span>
            </div>
            <div>
              testnet balance:{" "}
              <span className="tnum font-mono text-ink">{balance ?? "—"}</span>
            </div>
            {balanceNote && <p className="text-[12px] italic">{balanceNote}</p>}
            {wallet.address && (
              <div className="flex flex-wrap gap-2 pt-2">
                <GhostButton onClick={doFriendbot} disabled={busy === "friendbot"}>
                  {busy === "friendbot" ? "Funding…" : "Fund with friendbot"}
                </GhostButton>
                <GhostButton onClick={doTrustline} disabled={busy === "trustline"}>
                  {busy === "trustline" ? "Signing…" : "Create USDC trustline"}
                </GhostButton>
              </div>
            )}
            <p className="text-[12px] text-muted">
              New testnet key? Friendbot covers the XLM for fees, the trustline
              opens your account to USDC — then the deposit below lands.
            </p>
          </div>
          {!token && (
            <div className="mt-4">
              <GhostButton onClick={doAuth} disabled={busy === "auth" || !signer}>
                {busy === "auth" ? "Authenticating…" : "Connect to anchor (SEP-10)"}
              </GhostButton>
              {!signer && (
                <p className="mt-2 text-[12px] text-muted">
                  Connect a wallet or paste a test secret in the top bar first.
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* deposit */}
      <section className="rounded-xl border p-5" style={{ borderColor: "var(--hairline)" }}>
        <Eyebrow>deposit · TRY → USDC</Eyebrow>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Field label="TRY amount" hint="Funding method: bank transfer (simulated)">
            <TextInput
              value={depAmount}
              onChange={(e) => setDepAmount(e.target.value)}
              inputMode="decimal"
            />
          </Field>
          <FilledButton onClick={doDeposit} disabled={busy === "deposit"}>
            {busy === "deposit" ? "Requesting…" : "Get deposit instructions"}
          </FilledButton>
        </div>

        {deposit && (
          <div className="mt-5 space-y-2 rounded-lg bg-cream p-4 font-mono text-[13px] text-ink">
            <Row k="bank" v={deposit.bankName} />
            <Row k="IBAN" v={deposit.iban} />
            <Row k="reference" v={deposit.transferMemo} />
            <Row k="tx id" v={deposit.id} />
            {deposit.eta != null && <Row k="eta" v={`${deposit.eta}s (sandbox)`} />}
            <p className="pt-1 text-[12px] leading-relaxed text-muted">{deposit.how}</p>
            {deposit.message && (
              <p className="text-[12px] italic leading-relaxed text-muted">
                {deposit.message}
              </p>
            )}
          </div>
        )}
      </section>

      {/* withdraw */}
      <section className="rounded-xl border p-5" style={{ borderColor: "var(--hairline)" }}>
        <Eyebrow>withdraw · USDC → TRY</Eyebrow>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Field label={`Amount (${CONFIG.assetCode})`}>
            <TextInput
              value={wdAmount}
              onChange={(e) => setWdAmount(e.target.value)}
              inputMode="decimal"
            />
          </Field>
          <Field label="Destination IBAN (TRY)">
            <TextInput
              value={wdIban}
              onChange={(e) => setWdIban(e.target.value)}
              className="min-w-[280px]"
            />
          </Field>
          <GhostButton onClick={doWithdraw} disabled={busy === "withdraw"}>
            {busy === "withdraw" ? "Registering…" : "Register withdrawal"}
          </GhostButton>
        </div>

        {withdraw && (
          <div className="mt-5 space-y-2 rounded-lg bg-cream p-4 font-mono text-[13px] text-ink">
            <Row k="send USDC to" v={withdraw.accountId} />
            <Row k={`memo (${withdraw.memoType})`} v={withdraw.memo} />
            <Row k="tx id" v={withdraw.id} />
            {withdraw.message && (
              <p className="pt-1 text-[12px] leading-relaxed text-muted">
                {withdraw.message}
              </p>
            )}
            <p className="text-[12px] italic leading-relaxed text-muted">
              Sign the USDC payment from your wallet with the exact memo above —
              without it the anchor cannot match your transfer. The TRY payout
              to your IBAN is simulated by the sandbox.
            </p>
            <div className="pt-1">
              <FilledButton onClick={doSendPayment} disabled={busy === "pay"}>
                {busy === "pay" ? "Sending…" : `Send ${wdAmount} ${CONFIG.assetCode} to the anchor`}
              </FilledButton>
            </div>
            {withdraw.paymentUri && (
              <ArrowLink href={withdraw.paymentUri}>open payment URI</ArrowLink>
            )}
          </div>
        )}
      </section>

      {/* status */}
      {(deposit || withdraw) && (
        <section className="rounded-xl border p-5" style={{ borderColor: "var(--hairline)" }}>
          <div className="flex items-center justify-between">
            <Eyebrow>transaction status</Eyebrow>
            <GhostButton onClick={doStatus} disabled={busy === "status"}>
              {busy === "status" ? "…" : "Refresh"}
            </GhostButton>
          </div>
          {status ? (
            <div className="mt-3 space-y-1 font-mono text-[13px] text-ink">
              <Row k="id" v={status.id} />
              <Row k="kind" v={status.kind} />
              <Row k="status" v={status.status} />
              {status.amountIn && <Row k="in" v={status.amountIn} />}
              {status.amountOut && <Row k="out" v={status.amountOut} />}
              {status.message && (
                <p className="pt-1 text-[12px] italic text-muted">{status.message}</p>
              )}
            </div>
          ) : (
            <p className="mt-3 text-[13px] text-muted">
              No status fetched yet — hit Refresh to poll the anchor.
            </p>
          )}
        </section>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}
      {notice && <OkNote>{notice}</OkNote>}
    </div>
  );
}

function Row({ k, v }: { k: string; v?: string }) {
  if (!v) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <span className="w-[130px] shrink-0 uppercase tracking-[0.08em] text-muted" style={{ fontSize: 11 }}>
        {k}
      </span>
      <span className="break-all">{v}</span>
    </div>
  );
}
