"use client";

/** Fade creation, price preview and the loaded contract's claim/handoff flow. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { getClient, mockClient, SECONDS_PER_LEDGER } from "../../lib/client";
import { humanizeError } from "../../lib/errors";
import {
  FADE_STATE,
  priceAtLedger,
  type Fade,
} from "../../lib/agyionClient";
import { useLedgerStatus } from "../../lib/useLedger";
import { formatMinor, formatRemaining, parseMinor, shortAddress, shortHex } from "../../lib/format";
import { logEntry } from "../../lib/ledgerLog";
import { listTransactionAttempts, rememberReceipt, type TransactionIntent, type TransactionReceipt } from "../../lib/transactionReceipts";
import { signHandoff, publicKeyHex } from "../../lib/signers";
import { findVenueIdentity, getOrCreateVenueIdentity } from "../../lib/venueIdentity";
import { demoAddress } from "../../lib/wallet";
import type { WalletState } from "../../lib/useWallet";
import { CONFIG, IS_MOCK } from "../../lib/config";
import { ErrorNote, Field, FilledButton, GhostButton, OkNote, StateChip, TextInput } from "../ui";
import { WalletPrerequisite } from "./panelControls";
import { durationLedgers, ledgerDeadline } from "./panelValidation";
import { formatDraftMinor } from "./instrumentPresentation";

type ClaimConfirmation = { claimant: string; ledger: number | null };

export default function FadePanel({ wallet, existingOnly = false }: { wallet: WalletState; existingOnly?: boolean }) {
  const [fade, setFade] = useState<(Fade & { settlement?: { price: bigint; claimantPaid: bigint; claimantReceived: bigint; sellerReceived: bigint } }) | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const client = useMemo(() => {
    try {
      return getClient();
    } catch {
      return null;
    }
    // Re-resolve the shared client when its wallet signer changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.address]);

  const ledgerState = useLedgerStatus(client);
  const ledger = ledgerState.ledger;

  useEffect(() => {
    let live = true;
    let request = 0;
    let loadingId: string | null = null;
    const openRecord = async (id: unknown) => {
      if (!client || typeof id !== "string" || !/^\d+$/.test(id) || BigInt(id) > 0xffff_ffff_ffff_ffffn || loadingId === id) return;
      const ticket = ++request;
      loadingId = id;
      setError(null);
      try {
        const record = await client.get_fade(BigInt(id));
        if (!record) throw new Error(`Fade #${id} was not found.`);
        if (live && ticket === request) setFade(record);
      } catch (e) {
        if (live && ticket === request) setError(humanizeError(e));
      } finally { if (ticket === request) loadingId = null; }
    };
    const onRecord = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: string; id?: unknown }>).detail;
      if (detail?.tab === "fade") void openRecord(detail.id);
    };
    window.addEventListener("agyion:open-record", onRecord);
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "fade") void openRecord(params.get("ref"));
    return () => { live = false; request++; window.removeEventListener("agyion:open-record", onRecord); };
  }, [client]);

  const reload = useCallback(async (claim?: ClaimConfirmation) => {
    if (!client || !fade) throw new Error("The Fade record is not available. Refresh it before taking another action.");
    const fresh = await client.get_fade(fade.id);
    if (!fresh || fresh.id !== fade.id) throw new Error(`Fade #${fade.id} is not available yet. Refresh its record before taking another action.`);
    if (claim && (fresh.claimant !== claim.claimant ||
      (fresh.state !== FADE_STATE.Claimed && fresh.state !== FADE_STATE.Settled && fresh.state !== FADE_STATE.Refunded) ||
      fresh.claimed_at == null || !Number.isSafeInteger(fresh.claimed_at) ||
      fresh.claimed_at < fresh.start_ledger || fresh.claimed_at > fresh.deadline_ledger ||
      (claim.ledger != null && fresh.claimed_at !== claim.ledger))) {
      throw new Error("The returned Fade does not yet match your confirmed claim. Refresh the record; do not submit another claim.");
    }
    setFade(fresh as typeof fade);
    return fresh;
  }, [client, fade]);

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setError(null);
      setNotice(null);
      try {
        await fn();
      } catch (e) {
        setError(humanizeError(e));
      }
    },
    [],
  );

  return (
    <div className="instrument-panel panel-fade">
      {fade && <WalletPrerequisite address={wallet.address} />}

      {!fade && (
        <SellerForm
          wallet={wallet}
          existingOnly={existingOnly}
          onCreated={(f) => setFade(f)}
          onLoad={(f) => setFade(f)}
        />
      )}

      {fade && ledger != null && (
        <FadeStage
          fade={fade}
          ledger={ledger}
          ledgerFresh={ledgerState.fresh}
          wallet={wallet}
          run={run}
          onChanged={reload}
          onReset={() => setFade(null)}
        />
      )}

      {fade && ledger != null && !ledgerState.fresh && <p role="status" className="text-[13px] text-muted">Checking the ledger connection. Showing the last confirmed ledger {ledger}; transactions resume after a current ledger is confirmed. <button type="button" className="instrument-inline-action underline" onClick={ledgerState.refresh}>Retry connection</button></p>}

      {fade && ledger == null && <p role="status" className="text-[13px] text-muted">Fade #{fade.id.toString()} loaded. Waiting for the ledger connection before showing its current price.</p>}

      {error && <ErrorNote>{error}</ErrorNote>}
      {notice && <OkNote>{notice}</OkNote>}
    </div>
  );
}

/* --- Seller form --------------------------------------------------------- */

function SellerForm({
  wallet,
  existingOnly = false,
  onCreated,
  onLoad,
}: {
  wallet: WalletState;
  existingOnly?: boolean;
  onCreated: (f: Fade) => void;
  onLoad: (f: Fade) => void;
}) {
  const [pot, setPot] = useState("1000");
  const [startPrice, setStartPrice] = useState("600");
  const [floorPrice, setFloorPrice] = useState("-150");
  const [minutes, setMinutes] = useState("8");
  const [handoffMinutes, setHandoffMinutes] = useState("3");
  const [venuePub, setVenuePub] = useState("");
  const [venueSecret, setVenueSecret] = useState("");
  const [revealSecret, setRevealSecret] = useState(false);
  const [backupNote, setBackupNote] = useState<string | null>(null);
  const [loadId, setLoadId] = useState("");
  const [createdId, setCreatedId] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill the mock venue key
  useEffect(() => {
    if (existingOnly) return;
    const m = mockClient();
    if (m) setVenuePub(m.venuePubkey());
    else {
      const k = getOrCreateVenueIdentity();
      setVenuePub(k.pubkeyHex);
      setVenueSecret(k.secret);
    }
  }, [existingOnly]);

  const copyVenueSecret = async () => {
    try { await navigator.clipboard.writeText(venueSecret); setBackupNote("Venue secret copied. Store it somewhere private."); }
    catch { setRevealSecret(true); setBackupNote("Copy is unavailable. Select the revealed secret and save it privately."); }
  };
  const downloadVenueSecret = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ kind: "agyion-demo-venue", publicKey: publicKeyHex(venueSecret), secret: venueSecret }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `agyion-demo-venue-${publicKeyHex(venueSecret).slice(0, 12)}.json`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setBackupNote("Secret file downloaded. Keep it private; it authorizes venue proofs.");
  };

  const create = async () => {
    if (busy || createdId != null) return;
    setBusy(true);
    setError(null);
    let confirmedId: bigint | null = null;
    try {
      const client = getClient();
      const seller = wallet.address ?? demoAddress();
      const duration = durationLedgers(minutes, "Duration", 30, 1_000_000);
      const handoff = durationLedgers(handoffMinutes, "Handoff window", 10, 1_000_000);
      const now = await client.currentLedger();
      ledgerDeadline(now, duration, "Duration and handoff window", handoff + 1);
      const start = parseMinor(startPrice);
      const floor = parseMinor(floorPrice);
      // slope: linear from start to floor across the duration
      const drop = start - floor;
      const slopeDen = BigInt(duration);
      const slopeNum = drop > 0n ? drop : 1n;
      const id = await client.create_fade(
        seller,
        CONFIG.assetContractId,
        parseMinor(pot),
        start,
        floor,
        slopeNum,
        slopeDen,
        duration,
        handoff,
        venuePub,
      );
      confirmedId = id;
      setCreatedId(id);
      setLoadId(id.toString());
      logEntry({
        ledger: now,
        template: "fade",
        action: "create_fade",
        refId: id.toString(),
        amount: parseMinor(pot).toString(),
        status: "locked",
        detail: `pot ${pot} ${CONFIG.assetCode} · ${startPrice} → ${floorPrice} over ${minutes}m`,
        txHash: null,
      });
      const f = await client.get_fade(id);
      if (!f) throw new Error("The new record is not available yet.");
      onCreated(f);
    } catch (e) {
      setError(confirmedId != null
        ? `Fade #${confirmedId} was created. Load this ID to retry reading its record. ${humanizeError(e)}`
        : humanizeError(e));
    } finally {
      setBusy(false);
    }
  };

  const load = async () => {
    setError(null);
    try {
      const f = await getClient().get_fade(BigInt(loadId.trim()));
      if (!f) throw new Error(`Fade #${loadId} not found`);
      onLoad(f);
    } catch (e) {
      setError(humanizeError(e));
    }
  };

  return (
    <>
    {!existingOnly && <section className="fade-listing workbench-surface" aria-label="List a Fade">
      <div className="fade-price-ticket">
        <header className="workbench-heading"><h3>Set your price</h3></header>
        <div className="fade-price-editor">
          <div className="fade-price-endpoints">
          <Field label="Start price">
            <TextInput value={startPrice} onChange={(e) => setStartPrice(e.target.value)} inputMode="decimal" />
          </Field>
          <span className="fade-price-connector" aria-hidden="true">↓</span>
          <Field label="Floor price">
            <TextInput value={floorPrice} onChange={(e) => setFloorPrice(e.target.value)} inputMode="decimal" />
          </Field>
          </div>
          <div className="fade-price-chart"><DraftPriceCurve startPrice={startPrice} floorPrice={floorPrice} minutes={minutes} /></div>
        </div>
      </div>
      <div className="fade-listing-terms">
        <div className="fade-funding">
          <Field label={`Pot (${CONFIG.assetCode})`} hint="Covers rewards below zero">
            <TextInput value={pot} onChange={(e) => setPot(e.target.value)} inputMode="decimal" />
          </Field>
        </div>
        <div className="fade-time-terms">
          <Field label="Duration (minutes)" hint="Until the claim deadline">
            <TextInput value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Handoff window (minutes)" hint="Proof due after a claim">
            <TextInput value={handoffMinutes} onChange={(e) => setHandoffMinutes(e.target.value)} inputMode="numeric" />
          </Field>
        </div>
        <p className="fade-handoff-note">A claim fixes the price. Funds move at signed handoff.</p>
        <details className="instrument-technical">
          <summary>Venue signing key</summary>
          <p>Negative prices pay the claimant from the locked pot. A venue signature proves handoff before funds move.</p>
          <Field label="Venue pubkey (hex)" hint="Raw ed25519 key that proves handoff">
            <TextInput value={venuePub} onChange={(e) => setVenuePub(e.target.value)} className="font-mono text-[12px]" />
          </Field>
          {venueSecret && <div className="space-y-3">
            <p className="text-[12px] text-muted">This demo venue identity is reused in this browser session. Back it up before closing the session; it authorizes handoff proofs.</p>
            <div className="instrument-actions"><GhostButton onClick={() => setRevealSecret(value => !value)}>{revealSecret ? "Hide venue secret" : "Reveal venue secret"}</GhostButton><GhostButton onClick={() => void copyVenueSecret()}>Copy venue secret</GhostButton><GhostButton onClick={downloadVenueSecret}>Download venue key</GhostButton></div>
            {revealSecret && <TextInput aria-label="Generated venue secret" value={venueSecret} readOnly autoComplete="off" spellCheck={false} />}
            {backupNote && <p role="status" className="text-[12px] text-muted">{backupNote}</p>}
          </div>}
        </details>
        {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}
        {createdId != null && <div className="mt-4"><OkNote>Fade #{createdId.toString()} created. Its ID is ready in the load form.</OkNote></div>}
        <div className="workbench-commit">
          <WalletPrerequisite address={wallet.address} />
          <FilledButton transaction onClick={() => void create()} disabled={busy || createdId != null || (!IS_MOCK && !wallet.address)}>
            {busy ? "Locking…" : "Lock the pot"}
          </FilledButton>
        </div>
      </div>
    </section>}
    <section className="instrument-records">
          <header><h3>Load an existing Fade</h3></header>
          <div className="instrument-inline-control">
            <TextInput
              value={loadId}
              onChange={(e) => setLoadId(e.target.value)}
              placeholder="fade id"
              aria-label="Load Fade by ID"
              inputMode="numeric"
            />
            <GhostButton onClick={() => void load()}>Load</GhostButton>
          </div>
    </section>
    {existingOnly && error && <ErrorNote>{error}</ErrorNote>}
    </>
  );
}

/** Uses the same integer price calculation as the contract preview, without a live ledger or a transaction. */
function DraftPriceCurve({ startPrice, floorPrice, minutes }: { startPrice: string; floorPrice: string; minutes: string }) {
  let curve: { path: string; zeroY: number; start: bigint; floor: bigint; duration: number };
  try {
    const start = parseMinor(startPrice), floor = parseMinor(floorPrice);
    if (floor > start) throw new Error("Floor exceeds starting price");
    const duration = durationLedgers(minutes, "Duration", 30, 1_000_000);
    const top = start > 0n ? start : 0n, bottom = floor < 0n ? floor : 0n;
    const span = top - bottom || 1n;
    const y = (value: bigint) => 20 + Number((top - value) * 10000n / span) / 10000 * 120;
    const pricing = { start_price: start, floor_price: floor, start_ledger: 0, slope_num: start - floor || 1n, slope_den: BigInt(duration) };
    const path = Array.from({ length: 65 }, (_, i) => `${i ? "L" : "M"}${20 + i * 4.375},${y(priceAtLedger(pricing, Math.round(duration * i / 64)))}`).join(" ");
    curve = { path, zeroY: y(0n), start, floor, duration };
  } catch {
    return <p className="instrument-empty">Enter valid prices and a duration to preview the curve. The floor must not exceed the start price.</p>;
  }
  return (
    <svg viewBox="0 0 320 190" className="instrument-draft-curve" role="img" aria-label={`Draft price curve from ${formatDraftMinor(curve.start)} to ${formatDraftMinor(curve.floor)} ${CONFIG.assetCode} over ${curve.duration} ledgers`}>
      <path d="M20 20H300M20 60H300M20 100H300M20 140H300M90 20V140M160 20V140M230 20V140M300 20V140" className="diagram-guide" />
      <path d={`${curve.path} L300,140 L20,140 Z`} className="curve-envelope" />
      <line x1="20" x2="300" y1={curve.zeroY} y2={curve.zeroY} stroke="var(--hairline-strong)" strokeDasharray="3 5" />
      <path d={curve.path} className="curve-trajectory" />
      <text x="20" y="163" className="curve-value">{formatDraftMinor(curve.start)}</text>
      <text x="300" y="163" textAnchor="end" className="curve-value">{formatDraftMinor(curve.floor)}</text>
    </svg>
  );
}

/* --- Live stage ------------------------------------------------------------ */

function FadeStage({
  fade,
  ledger,
  ledgerFresh,
  wallet,
  run,
  onChanged,
  onReset,
}: {
  fade: Fade & { settlement?: { price: bigint; claimantPaid: bigint; claimantReceived: bigint; sellerReceived: bigint } };
  ledger: number;
  ledgerFresh: boolean;
  wallet: WalletState;
  run: (fn: () => Promise<void>) => Promise<void>;
  onChanged: (claim?: ClaimConfirmation) => Promise<Fade>;
  onReset: () => void;
}) {
  const reduced = useReducedMotion();
  // Settlement uses the claim ledger, even after the live curve crosses zero.
  const priceLedger = fade.claimed_at ?? ledger;
  const price = priceAtLedger(fade, priceLedger);
  const belowZero = price < 0n;
  const [scrub, setScrub] = useState<number | null>(null); // dragged "now" handle
  const shownLedger = scrub ?? priceLedger;
  const shownPrice = priceAtLedger(fade, shownLedger);
  const priceLabel = fade.claimed_at != null
    ? fade.state === FADE_STATE.Settled ? "Settled price" : "Frozen at claim"
    : ledgerFresh ? "Estimated price" : "Last price estimate";

  const stateLabel =
    fade.state === FADE_STATE.Open
      ? "locked"
      : fade.state === FADE_STATE.Claimed
        ? "claimed: awaiting handoff"
        : fade.state === FADE_STATE.Settled
          ? "executed"
          : "returned";

  const secondsLeft = Math.max(0, (fade.deadline_ledger - ledger) * SECONDS_PER_LEDGER);

  return (
    <div className="instrument-records fade-live-ticket">
      {/* status line */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          <span className="tnum">fade #{fade.id.toString()}</span>
          <span style={{ color: "var(--hairline-strong)" }}>·</span>
          <span>
            ledger <span className="tnum text-ink">{ledger}</span>
          </span>
          <StateChip
            live={fade.state === FADE_STATE.Open}
            color={
              fade.state === FADE_STATE.Settled
                ? "var(--olive)"
                : fade.state === FADE_STATE.Refunded
                  ? "var(--muted)"
                  : "var(--accent)"
            }
          >
            {stateLabel}
          </StateChip>
        </div>
        <GhostButton onClick={onReset}>New fade</GhostButton>
      </div>

      <div className="instrument-layout fade-live-layout">
        {/* price hero + curve */}
        <div className="instrument-main instrument-section">
          <div className="flex items-end justify-between">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                {scrub != null ? "Preview at dragged ledger" : priceLabel}
              </div>
              <motion.div
                className="tnum display text-[48px] leading-none tracking-[-0.04em] md:text-[72px]"
                animate={{ color: shownPrice < 0n ? "var(--ember)" : "var(--accent)" }}
                transition={{ duration: reduced ? 0 : 0.3 }}
              >
                {formatMinor(shownPrice)}
                <span className="ml-3 text-[22px] text-muted">{CONFIG.assetCode}</span>
              </motion.div>
              <AnimatePresence>
                {belowZero && scrub == null && fade.state === FADE_STATE.Open && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="mt-2 font-mono text-[11px] uppercase tracking-[0.16em]"
                    style={{ color: "var(--ember)" }}
                  >
                    Below zero: the pot pays at confirmed handoff
                  </motion.div>
                )}
              </AnimatePresence>
              {scrub == null && fade.state === FADE_STATE.Claimed && (
                <p className="mt-2 text-[13px] text-muted">
                  {price < 0n ? "Claimant receives the frozen amount" : price > 0n ? "Claimant pays the frozen amount" : "No claimant payment at the frozen price"}
                </p>
              )}
            </div>
            {fade.state === FADE_STATE.Open && (
              <div className="text-right">
                <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                  Claim window
                </div>
                <div className="tnum font-mono text-[22px] text-ink">{formatRemaining(secondsLeft)}</div>
              </div>
            )}
          </div>

          <DecayCurve fade={fade} ledger={priceLedger} scrub={scrub} onScrub={setScrub} frozen={fade.claimed_at != null} />
        </div>

        {/* right rail: parameters in mono */}
        <aside className="instrument-aside instrument-section space-y-4">
          <header><h3>Listing terms</h3></header>
          <RailRow k="Locked pot" v={`${formatMinor(fade.pot)} ${CONFIG.assetCode}`} />
          {fade.claimed_at != null && <RailRow k="Frozen price" v={`${formatMinor(price)} ${CONFIG.assetCode}`} />}
          <RailRow
            k="Decay rate"
            v={`${formatMinor(fade.slope_num)} / ${fade.slope_den.toString()} ledgers`}
          />
          <RailRow k="Start → floor" v={`${formatMinor(fade.start_price)} → ${formatMinor(fade.floor_price)}`} />
          <RailRow k="Deadline ledger" v={fade.deadline_ledger.toString()} />
          <RailRow k="Handoff window" v={`${fade.handoff_window} ledgers`} />
          <RailRow k="Seller" v={shortAddress(fade.seller)} />
          <RailRow k="Claimant" v={fade.claimant ? shortAddress(fade.claimant) : "Not claimed"} />
          <RailRow k="Venue key" v={shortHex(fade.venue_pubkey)} />
        </aside>
      </div>

      {/* settlement receipt */}
      {fade.state === FADE_STATE.Settled && fade.settlement && (
        <div className="instrument-section">
          <div className="font-mono text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--olive)" }}>
            Settled at handoff
          </div>
          <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-4">
            <RailRow k="Price" v={formatMinor(fade.settlement.price)} />
            <RailRow k="Claimant paid" v={formatMinor(fade.settlement.claimantPaid)} />
            <RailRow k="Claimant received" v={formatMinor(fade.settlement.claimantReceived)} />
            <RailRow k="Seller received" v={formatMinor(fade.settlement.sellerReceived)} />
          </div>
        </div>
      )}
      {fade.state === FADE_STATE.Refunded && (
        <div className="instrument-section">
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
            Returned
          </div>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            No claim before the deadline, or no handoff inside the window. The
            pot went back to the seller by rule. No discretion was involved.
          </p>
        </div>
      )}

      {/* actions */}
      <FadeActions fade={fade} ledger={ledger} ledgerFresh={ledgerFresh} wallet={wallet} run={run} onChanged={onChanged} />
    </div>
  );
}

function RailRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b pb-2" style={{ borderColor: "var(--hairline)" }}>
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{k}</span>
      <span className="tnum font-mono text-[12px] text-ink">{v}</span>
    </div>
  );
}

/* --- Decay curve with draggable "now" handle ------------------------------- */

function DecayCurve({
  fade,
  ledger,
  scrub,
  onScrub,
  frozen,
}: {
  fade: Fade;
  ledger: number;
  scrub: number | null;
  onScrub: (l: number | null) => void;
  frozen: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);

  const W = 900;
  const H = 300;
  const pad = 24;

  const start = fade.start_ledger;
  const end = fade.deadline_ledger + fade.handoff_window;
  const maxP = Number(fade.start_price) / 1e7;
  const minP = Math.min(Number(fade.floor_price) / 1e7, 0);

  const x = useCallback((l: number) => pad + ((l - start) / Math.max(1, end - start)) * (W - pad * 2), [start, end]);
  const y = useCallback(
    (p: bigint) => {
      const v = Number(p) / 1e7;
      const t = (maxP - v) / Math.max(1e-9, maxP - minP);
      return pad + t * (H - pad * 2);
    },
    [maxP, minP],
  );

  const path = useMemo(() => {
    const pts: string[] = [];
    const n = 90;
    for (let i = 0; i <= n; i++) {
      const l = start + ((end - start) * i) / n;
      pts.push(`${i === 0 ? "M" : "L"} ${x(l).toFixed(1)} ${y(priceAtLedger(fade, l)).toFixed(1)}`);
    }
    return pts.join(" ");
  }, [fade, start, end, x, y]);

  const zeroY = y(0n);
  const nowX = x(Math.min(Math.max(scrub ?? ledger, start), end));

  const pointerToLedger = (clientX: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return start;
    const frac = (clientX - rect.left) / rect.width;
    const px = frac * W;
    const l = start + ((px - pad) / (W - pad * 2)) * (end - start);
    return Math.round(Math.min(Math.max(l, start), end));
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="mt-4 w-full touch-none select-none"
      onPointerDown={(e) => {
        setDragging(true);
        onScrub(pointerToLedger(e.clientX));
        (e.target as Element).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (dragging) onScrub(pointerToLedger(e.clientX));
      }}
      onPointerUp={() => { setDragging(false); onScrub(null); }}
      onPointerCancel={() => { setDragging(false); onScrub(null); }}
      onLostPointerCapture={() => { setDragging(false); onScrub(null); }}
      onKeyDown={(event) => {
        const current = Math.min(end, Math.max(start, scrub ?? ledger));
        let next: number;
        if (event.key === "ArrowRight" || event.key === "ArrowUp") next = current + 1;
        else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = current - 1;
        else if (event.key === "Home") next = start;
        else if (event.key === "End") next = end;
        else if (event.key === "Escape") { event.preventDefault(); onScrub(null); return; }
        else return;
        event.preventDefault();
        onScrub(Math.min(end, Math.max(start, next)));
      }}
      onBlur={() => onScrub(null)}
      role="slider"
      aria-label="Preview ledger"
      aria-valuemin={start}
      aria-valuemax={end}
      aria-valuenow={Math.min(end, Math.max(start, scrub ?? ledger))}
      aria-valuetext={`Ledger ${Math.min(end, Math.max(start, scrub ?? ledger))}. ${scrub == null ? frozen ? "Frozen at claim" : "Live" : frozen ? "Preview; press Escape to return to the claim price" : "Preview; press Escape to return to live"}`}
      tabIndex={0}
    >
      {/* zero line */}
      <line x1={pad} y1={zeroY} x2={W - pad} y2={zeroY} stroke="var(--sand)" strokeDasharray="4 6" />
      <text x={pad} y={zeroY - 6} fontSize="11" fill="var(--muted)" fontFamily="var(--font-mono)">0</text>

      {/* deadline marker */}
      <line
        x1={x(fade.deadline_ledger)} y1={pad} x2={x(fade.deadline_ledger)} y2={H - pad}
        stroke="var(--sand)" strokeDasharray="2 5"
      />
      <text x={x(fade.deadline_ledger)} y={pad - 6} fontSize="10" fill="var(--muted)" fontFamily="var(--font-mono)" textAnchor="middle">
        deadline
      </text>

      {/* full curve in sand */}
      <path d={path} stroke="var(--sand)" strokeWidth="2" fill="none" />

      {/* elapsed curve in terracotta → ember below zero */}
      <path
        d={path}
        stroke="var(--accent)"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        clipPath="url(#fadeAboveZero)"
        strokeDasharray="1400"
        strokeDashoffset={1400 - Math.min(1, Math.max(0, (nowX - pad) / (W - pad * 2))) * 1400}
      />
      <path
        d={path}
        stroke="var(--ember)"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        clipPath="url(#fadeBelowZero)"
        strokeDasharray="1400"
        strokeDashoffset={1400 - Math.min(1, Math.max(0, (nowX - pad) / (W - pad * 2))) * 1400}
      />
      <defs>
        <clipPath id="fadeAboveZero">
          <rect x="0" y="0" width={W} height={zeroY} />
        </clipPath>
        <clipPath id="fadeBelowZero">
          <rect x="0" y={zeroY} width={W} height={H - zeroY} />
        </clipPath>
      </defs>

      {/* draggable now handle */}
      <line x1={nowX} y1={pad} x2={nowX} y2={H - pad} stroke="var(--ink)" strokeWidth="1" opacity="0.4" />
      <circle
        cx={nowX}
        cy={y(priceAtLedger(fade, scrub ?? ledger))}
        r="9"
        fill="var(--paper)"
        stroke={priceAtLedger(fade, scrub ?? ledger) < 0n ? "var(--ember)" : "var(--accent)"}
        strokeWidth="2.5"
        style={{ cursor: "grab" }}
      />
      <text x={nowX} y={H - 6} fontSize="10" fill="var(--muted)" fontFamily="var(--font-mono)" textAnchor="middle">
        {scrub != null ? `ledger ${scrub}: release or press Escape to return` : frozen ? "claim ledger: drag to preview" : "now: drag me"}
      </text>
    </svg>
  );
}

/* --- Actions: claim / handoff / refund ------------------------------------- */

function FadeActions({
  fade,
  ledger,
  ledgerFresh,
  wallet,
  run,
  onChanged,
}: {
  fade: Fade;
  ledger: number;
  ledgerFresh: boolean;
  wallet: WalletState;
  run: (fn: () => Promise<void>) => Promise<void>;
  onChanged: (claim?: ClaimConfirmation) => Promise<Fade>;
}) {
  const [venueSecret, setVenueSecret] = useState("");
  const [sig, setSig] = useState("");
  const [sigTs, setSigTs] = useState<bigint | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const actionBusy = useRef(false);
  const pendingClaim = useRef<{ claimant: string; intent: TransactionIntent | null; receipt: TransactionReceipt | null } | null>(null);
  const [confirmedAction, setConfirmedAction] = useState<string | null>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);

  useEffect(() => {
    setVenueSecret(findVenueIdentity(fade.venue_pubkey)?.secret ?? "");
    setSig("");
    setSigTs(null);
    setConfirmedAction(null);
    pendingClaim.current = null;
    setLocalErr(null);
  }, [fade.id, fade.venue_pubkey]);

  const refreshConfirmedRecord = async () => {
    const pending = pendingClaim.current;
    if (pending?.intent && !pending.receipt) {
      // submit persists this exact scope even when a changed wallet session
      // prevents an in-memory receipt. Never substitute another account/chain,
      // or choose an arbitrary hash from ambiguous local recovery evidence.
      const intent = pending.intent;
      const confirmations = listTransactionAttempts(intent).filter(attempt =>
        attempt.action === intent.action && attempt.refId === intent.refId && attempt.status === "success");
      if (confirmations.length !== 1) {
        throw new Error("Your claim's confirmation receipt is unavailable or ambiguous. Check transaction activity and refresh; do not submit another claim.");
      }
      const confirmation = confirmations[0];
      pending.receipt = {
        hash: confirmation.hash, ledger: confirmation.ledger,
        account: intent.account, network: intent.network, contractId: intent.contractId,
      };
      // logEntry consumes the matching in-memory receipt. Supply the verified
      // original scope explicitly even if generic recovery consumed it first.
      rememberReceipt("claim", intent.refId!, pending.receipt);
      logEntry({
        ...pending.receipt,
        template: "fade", action: "claim", refId: intent.refId!,
        amount: null, status: "recorded",
        detail: "Claim confirmed. Refresh the record to verify its frozen price.",
        txHash: pending.receipt.hash,
      });
    }
    const fresh = await onChanged(pending ? { claimant: pending.claimant, ledger: pending.receipt?.ledger ?? null } : undefined);
    if (pending) {
      // reload validates the claimant, state and execution ledger first.
      // Preserve the same confirmed hash while enriching the unknown amount.
      const price = priceAtLedger(fresh, fresh.claimed_at!);
      if (pending.receipt) rememberReceipt("claim", fresh.id.toString(), pending.receipt);
      logEntry({
        ...pending.receipt,
        ledger: fresh.claimed_at,
        template: "fade",
        action: "claim",
        refId: fresh.id.toString(),
        amount: price.toString(),
        status: "locked",
        detail: `claimed at ${formatMinor(price)} ${CONFIG.assetCode}; frozen at ledger ${fresh.claimed_at}`,
        txHash: pending.receipt?.hash ?? null,
      });
      pendingClaim.current = null;
    }
  };

  const disabled = busy !== null || confirmedAction !== null || !ledgerFresh || (!IS_MOCK && !wallet.address);
  const perform = (action: string, send: () => Promise<void>, record: () => void) => run(async () => {
    if (actionBusy.current || confirmedAction || !ledgerFresh || (!IS_MOCK && !wallet.address)) return;
    actionBusy.current = true;
    setBusy(action);
    try {
      await send();
      // A subsequent read failure must offer a read retry, never a second send.
      setConfirmedAction(action);
      record();
      await refreshConfirmedRecord();
      setConfirmedAction(null);
    } finally {
      actionBusy.current = false;
      setBusy(null);
    }
  });
  const refreshRecord = () => run(async () => {
    if (actionBusy.current) return;
    actionBusy.current = true;
    setBusy("refresh");
    try { await refreshConfirmedRecord(); setConfirmedAction(null); }
    finally { actionBusy.current = false; setBusy(null); }
  });

  const claimable = fade.state === FADE_STATE.Open && ledger <= fade.deadline_ledger;
  const refundable =
    (fade.state === FADE_STATE.Open && ledger > fade.deadline_ledger) ||
    (fade.state === FADE_STATE.Claimed &&
      fade.claimed_at != null &&
      ledger > fade.claimed_at + fade.handoff_window);

  const doClaim = () => {
    const claimant = wallet.address ?? demoAddress();
    // Capture the submission identity before awaiting wallet/network work.
    const intent: TransactionIntent | null = IS_MOCK ? null : {
      account: claimant, network: CONFIG.networkPassphrase, contractId: CONFIG.contractId,
      action: "claim", refId: fade.id.toString(),
    };
    return perform("claim", () => getClient().claim(fade.id, claimant), () => {
      pendingClaim.current = { claimant, intent, receipt: null };
    });
  };

  const produceSig = () => {
    if (!ledgerFresh || actionBusy.current || confirmedAction) return;
    setLocalErr(null);
    try {
      const claimant = fade.claimant;
      if (!claimant) throw new Error("Claim first");
      const ts = BigInt(Math.floor(Date.now() / 1000));
      let s: string;
      const m = mockClient();
      if (m && fade.venue_pubkey === m.venuePubkey()) {
        s = m.mockVenueSign(fade.id, claimant, ts);
      } else {
        if (!venueSecret.trim()) throw new Error("Paste the venue secret to sign");
        const derived = publicKeyHex(venueSecret);
        if (derived !== fade.venue_pubkey.toLowerCase())
          throw new Error("This secret does not match the venue key recorded on the fade");
        s = signHandoff(venueSecret, fade.id, claimant, ts);
      }
      setSigTs(ts);
      setSig(s);
    } catch (e) {
      setLocalErr(humanizeError(e));
    }
  };

  const doConfirm = () =>
    perform("handoff", async () => {
      if (!sig || sigTs == null) throw new Error("Produce the venue signature first");
      await getClient().confirm_handoff(fade.id, sigTs, sig);
    }, () => {
      logEntry({
        ledger,
        template: "fade",
        action: "confirm_handoff",
        refId: fade.id.toString(),
        amount: fade.claimed_at != null ? priceAtLedger(fade, fade.claimed_at).toString() : null,
        status: "executed",
        detail: "venue signature verified: settled at the frozen price",
        txHash: null,
      });
    });

  const doRefund = () =>
    perform("refund", () => getClient().refund(fade.id), () => {
      logEntry({
        ledger,
        template: "fade",
        action: "refund",
        refId: fade.id.toString(),
        amount: fade.pot.toString(),
        status: "returned",
        detail: "refund under the rule: pot returned to the seller",
        txHash: null,
      });
    });

  return (
    <div className="instrument-section space-y-6">
      {confirmedAction && <p role="status" className="text-[13px] text-muted">Transaction confirmed. Refresh the record to load its current state. <button type="button" onClick={() => void refreshRecord()} disabled={busy !== null} className="instrument-inline-action underline">{busy === "refresh" ? "Refreshing record…" : "Refresh record"}</button></p>}
      {/* claim */}
      {fade.state === FADE_STATE.Open && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-[52ch] text-[14px] leading-relaxed text-muted">
            The first valid claim on the network wins and fixes the price at its execution
            ledger. If the claimant does not complete handoff, the seller can
            recover the pot after the window; the listing stays closed.
          </p>
          {claimable ? (
            <FilledButton transaction onClick={() => void doClaim()} disabled={disabled}>
              {busy === "claim" ? "Claiming…" : `Claim at ${formatMinor(priceAtLedger(fade, ledger))} ${CONFIG.assetCode} (estimate)`}
            </FilledButton>
          ) : (
            <span className="text-[13px] text-muted">claim closed: deadline passed</span>
          )}
        </div>
      )}

      {/* handoff */}
      {fade.state === FADE_STATE.Claimed && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h3 className="display text-[20px] text-ink">Prove the handoff</h3>
            <span className="tnum font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              window ends at ledger{" "}
              {fade.claimed_at != null ? fade.claimed_at + fade.handoff_window : "Not recorded"}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Venue secret (demo signer)" hint="S… or 64-hex seed; mock mode signs itself">
              <TextInput
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={venueSecret}
                onChange={(e) => setVenueSecret(e.target.value)}
                className="font-mono text-[12px]"
                placeholder="S…"
              />
            </Field>
            <Field label="Signature (hex, 64 bytes)" hint="payload: fade_id ‖ claimant ‖ ts">
              <TextInput value={sig} onChange={(e) => setSig(e.target.value)} className="font-mono text-[12px]" placeholder="ab12…" />
            </Field>
          </div>
          {localErr && <ErrorNote>{localErr}</ErrorNote>}
          <div className="flex flex-wrap gap-3">
            <GhostButton onClick={produceSig} disabled={!ledgerFresh || busy !== null || confirmedAction !== null}>Produce signature</GhostButton>
            {sig ? (
              <FilledButton transaction onClick={() => void doConfirm()} disabled={disabled}>
                {busy === "handoff" ? "Settling…" : "Confirm handoff"}
              </FilledButton>
            ) : (
              <GhostButton disabled>Enter a handoff signature to confirm</GhostButton>
            )}
          </div>
        </div>
      )}

      {/* refund */}
      {(fade.state === FADE_STATE.Open || fade.state === FADE_STATE.Claimed) && (
        <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-5" style={{ borderColor: "var(--hairline)" }}>
          <p className="max-w-[52ch] text-[13px] leading-relaxed text-muted">
            Refund under the rule: callable by anyone once the deadline or the
            handoff window lapses. The pot returns to the seller.
          </p>
          {refundable ? (
            <GhostButton transaction onClick={() => void doRefund()} disabled={disabled}>
              {busy === "refund" ? "Refunding…" : "Refund to seller"}
            </GhostButton>
          ) : (
            <span className="font-mono text-[12px] text-muted">refund condition not met yet</span>
          )}
        </div>
      )}
    </div>
  );
}
