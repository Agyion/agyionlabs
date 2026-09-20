"use client";

/**
 * FadePanel — the price is the hero (§5).
 *
 * 96px+ serif tabular numerals in terracotta, flipping to ember the instant
 * the price crosses zero (color IS the alarm — no banner). Below: full-width
 * decay curve with a draggable "now" handle. Right rail: parameters in mono.
 * Claim stays text+arrow until claimable, then becomes the single filled
 * terracotta moment on the screen.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { getClient, mockClient, SECONDS_PER_LEDGER } from "../../lib/client";
import {
  AgyionError,
  FADE_STATE,
  priceAtLedger,
  type Fade,
} from "../../lib/hakClient";
import { useLedger } from "../../lib/useLedger";
import { formatMinor, formatRemaining, parseMinor, shortAddress, shortHex } from "../../lib/format";
import { logEntry } from "../../lib/ledgerLog";
import { newKeypair, signHandoff, publicKeyHex } from "../../lib/signers";
import { demoAddress } from "../../lib/wallet";
import type { WalletState } from "../../lib/useWallet";
import { CONFIG, IS_MOCK } from "../../lib/config";
import { ArrowLink, ErrorNote, Eyebrow, Field, FilledButton, GhostButton, OkNote, TextInput } from "../ui";

export default function FadePanel({ wallet }: { wallet: WalletState }) {
  const [fade, setFade] = useState<(Fade & { settlement?: { price: bigint; claimantPaid: bigint; claimantReceived: bigint; sellerReceived: bigint } }) | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const client = useMemo(() => {
    try {
      return getClient();
    } catch {
      return null;
    }
  }, [wallet.address]);

  const ledger = useLedger(client);

  const reload = useCallback(async () => {
    if (!client || !fade) return;
    const fresh = IS_MOCK
      ? await mockClient()?.getLatestFade()
      : await client.get_fade(fade.id);
    if (fresh) setFade(fresh as typeof fade);
  }, [client, fade]);

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setError(null);
      setNotice(null);
      try {
        await fn();
      } catch (e) {
        setError(e instanceof AgyionError ? e.message : e instanceof Error ? e.message : String(e));
      }
    },
    [],
  );

  return (
    <div className="space-y-10">
      <header>
        <Eyebrow>Fade · declining price</Eyebrow>
        <h1 className="display mt-2 text-[34px] text-ink md:text-[44px]">The last hour, on a curve</h1>
        <p className="mt-3 max-w-[64ch] text-[16px] leading-[1.65] text-muted">
          A bakery at closing time: unsold portions, a price that walks
          backwards on a curve — and below zero the locked pot starts paying the
          claimant for rescuing the portion. The pot is the venue&apos;s
          campaign budget: it says &ldquo;waste costs us more than paying you to
          take it.&rdquo; The handoff is proven with the venue&apos;s signature —
          or the pot refunds by rule. No discretion.
        </p>
      </header>

      {!fade && (
        <SellerForm
          wallet={wallet}
          onCreated={(f) => setFade(f)}
          onLoad={(f) => setFade(f)}
        />
      )}

      {fade && ledger != null && (
        <FadeStage
          fade={fade}
          ledger={ledger}
          wallet={wallet}
          run={run}
          onChanged={reload}
          onReset={() => setFade(null)}
        />
      )}

      {error && <ErrorNote>{error}</ErrorNote>}
      {notice && <OkNote>{notice}</OkNote>}
    </div>
  );
}

/* --- Seller form --------------------------------------------------------- */

function SellerForm({
  wallet,
  onCreated,
  onLoad,
}: {
  wallet: WalletState;
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
  const [loadId, setLoadId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill the mock venue key
  useEffect(() => {
    const m = mockClient();
    if (m) setVenuePub(m.venuePubkey());
    else {
      const k = newKeypair();
      setVenuePub(k.pubkeyHex);
      setVenueSecret(k.secret);
      try {
        window.sessionStorage.setItem("agyion.venueSecret", k.secret);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const client = getClient();
      const seller = wallet.address ?? demoAddress();
      const duration = Math.max(30, Math.round(Number(minutes) * 60 / SECONDS_PER_LEDGER));
      const handoff = Math.max(10, Math.round(Number(handoffMinutes) * 60 / SECONDS_PER_LEDGER));
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
      const now = await client.currentLedger();
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
      const f = IS_MOCK ? await mockClient()?.getLatestFade() : await client.get_fade(id);
      if (f) onCreated(f);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
      <div className="rounded-xl border bg-cream p-6 lg:col-span-7 md:p-8" style={{ borderColor: "var(--hairline)" }}>
        <h2 className="display text-[24px] text-ink">List a Fade</h2>
        <div className="mt-6 grid grid-cols-2 gap-4">
          <Field label={`Pot (${CONFIG.assetCode})`} hint="Locked in the contract">
            <TextInput value={pot} onChange={(e) => setPot(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Start price" hint="Asking price at ledger zero">
            <TextInput value={startPrice} onChange={(e) => setStartPrice(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Floor price" hint="You decide: 0 = never goes negative · negative = the pot pays the claimant">
            <TextInput value={floorPrice} onChange={(e) => setFloorPrice(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Duration (minutes)" hint="Until the claim deadline">
            <TextInput value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Handoff window (minutes)" hint="After a claim, before refund wins">
            <TextInput value={handoffMinutes} onChange={(e) => setHandoffMinutes(e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Venue pubkey (hex)" hint="Raw ed25519 key that proves handoff">
            <TextInput value={venuePub} onChange={(e) => setVenuePub(e.target.value)} className="font-mono text-[12px]" />
          </Field>
        </div>
        {venueSecret && (
          <p className="mt-3 font-mono text-[11px] text-muted">
            demo venue secret: {venueSecret.slice(0, 12)}… (kept in this tab for the handoff step)
          </p>
        )}
        {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}
        <div className="mt-6">
          <FilledButton onClick={() => void create()} disabled={busy}>
            {busy ? "Locking…" : "Lock the pot"}
          </FilledButton>
        </div>
      </div>

      <div className="lg:col-span-5">
        <div className="rounded-xl border p-6" style={{ borderColor: "var(--hairline)" }}>
          <h3 className="display text-[20px] text-ink">Load an existing Fade</h3>
          <div className="mt-4 flex gap-2">
            <TextInput
              value={loadId}
              onChange={(e) => setLoadId(e.target.value)}
              placeholder="fade id"
              inputMode="numeric"
            />
            <GhostButton onClick={() => void load()}>Load</GhostButton>
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-muted">
            Mock mode keeps fades in this browser. On testnet, any fade id is
            readable by anyone — rules are public by design.
          </p>
        </div>
      </div>
    </div>
  );
}

/* --- Live stage ------------------------------------------------------------ */

function FadeStage({
  fade,
  ledger,
  wallet,
  run,
  onChanged,
  onReset,
}: {
  fade: Fade & { settlement?: { price: bigint; claimantPaid: bigint; claimantReceived: bigint; sellerReceived: bigint } };
  ledger: number;
  wallet: WalletState;
  run: (fn: () => Promise<void>) => Promise<void>;
  onChanged: () => Promise<void>;
  onReset: () => void;
}) {
  const reduced = useReducedMotion();
  const price = priceAtLedger(fade, ledger);
  const belowZero = price < 0n;
  const [scrub, setScrub] = useState<number | null>(null); // dragged "now" handle
  const shownLedger = scrub ?? ledger;
  const shownPrice = priceAtLedger(fade, shownLedger);

  const stateLabel =
    fade.state === FADE_STATE.Open
      ? "locked"
      : fade.state === FADE_STATE.Claimed
        ? "claimed — awaiting handoff"
        : fade.state === FADE_STATE.Settled
          ? "executed"
          : "returned";

  const secondsLeft = Math.max(0, (fade.deadline_ledger - ledger) * SECONDS_PER_LEDGER);

  return (
    <div className="space-y-8">
      {/* status line */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-mono text-[13px] text-muted">
          fade #{fade.id.toString()} · ledger <span className="tnum">{ledger}</span> ·{" "}
          <span style={{ color: fade.state === FADE_STATE.Settled ? "#6B7256" : fade.state === FADE_STATE.Refunded ? "var(--muted)" : "var(--accent)" }}>
            {stateLabel}
          </span>
        </div>
        <GhostButton onClick={onReset}>New fade</GhostButton>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* price hero + curve */}
        <div className="lg:col-span-8">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
                {scrub != null ? "Preview at dragged ledger" : "Live price"}
              </div>
              <motion.div
                className="tnum display text-[72px] leading-none md:text-[110px]"
                animate={{ color: shownPrice < 0n ? "#8F4E2A" : "#BC773F" }}
                transition={{ duration: reduced ? 0 : 0.3 }}
              >
                {formatMinor(shownPrice)}
                <span className="ml-3 text-[22px] text-muted">{CONFIG.assetCode}</span>
              </motion.div>
              <AnimatePresence>
                {belowZero && scrub == null && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="mt-2 text-[12px] font-semibold uppercase tracking-[0.12em]"
                    style={{ color: "#8F4E2A" }}
                  >
                    Below zero — the pot now pays the claimant
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {fade.state === FADE_STATE.Open && (
              <div className="text-right">
                <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
                  Claim window
                </div>
                <div className="tnum font-mono text-[20px] text-ink">{formatRemaining(secondsLeft)}</div>
              </div>
            )}
          </div>

          <DecayCurve fade={fade} ledger={ledger} scrub={scrub} onScrub={setScrub} />
        </div>

        {/* right rail — parameters in mono */}
        <aside className="space-y-4 lg:col-span-4">
          <RailRow k="Locked pot" v={`${formatMinor(fade.pot)} ${CONFIG.assetCode}`} />
          <RailRow
            k="Decay rate"
            v={`${formatMinor(fade.slope_num)} / ${fade.slope_den.toString()} ledgers`}
          />
          <RailRow k="Start → floor" v={`${formatMinor(fade.start_price)} → ${formatMinor(fade.floor_price)}`} />
          <RailRow k="Deadline ledger" v={fade.deadline_ledger.toString()} />
          <RailRow k="Handoff window" v={`${fade.handoff_window} ledgers`} />
          <RailRow k="Seller" v={shortAddress(fade.seller)} />
          <RailRow k="Claimant" v={fade.claimant ? shortAddress(fade.claimant) : "—"} />
          <RailRow k="Venue key" v={shortHex(fade.venue_pubkey)} />
        </aside>
      </div>

      {/* settlement receipt */}
      {fade.state === FADE_STATE.Settled && fade.settlement && (
        <div className="rounded-xl border p-6" style={{ borderColor: "#6B7256" }}>
          <div className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: "#6B7256" }}>
            Settled at handoff
          </div>
          <div className="mt-3 grid grid-cols-2 gap-4 font-mono text-[14px] md:grid-cols-4">
            <RailRow k="Price" v={formatMinor(fade.settlement.price)} />
            <RailRow k="Claimant paid" v={formatMinor(fade.settlement.claimantPaid)} />
            <RailRow k="Claimant received" v={formatMinor(fade.settlement.claimantReceived)} />
            <RailRow k="Seller received" v={formatMinor(fade.settlement.sellerReceived)} />
          </div>
        </div>
      )}
      {fade.state === FADE_STATE.Refunded && (
        <div className="rounded-xl border p-6" style={{ borderColor: "var(--hairline)" }}>
          <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
            Returned
          </div>
          <p className="mt-2 text-[15px] text-muted">
            No claim before the deadline, or no handoff inside the window — the
            pot went back to the seller by rule. No discretion was involved.
          </p>
        </div>
      )}

      {/* actions */}
      <FadeActions fade={fade} ledger={ledger} wallet={wallet} run={run} onChanged={onChanged} />
    </div>
  );
}

function RailRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b pb-2" style={{ borderColor: "var(--hairline)" }}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{k}</span>
      <span className="tnum font-mono text-[13px] text-ink">{v}</span>
    </div>
  );
}

/* --- Decay curve with draggable "now" handle ------------------------------- */

function DecayCurve({
  fade,
  ledger,
  scrub,
  onScrub,
}: {
  fade: Fade;
  ledger: number;
  scrub: number | null;
  onScrub: (l: number | null) => void;
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
      onPointerUp={() => setDragging(false)}
      onPointerLeave={() => setDragging(false)}
      role="slider"
      aria-label="Preview ledger"
      aria-valuenow={scrub ?? ledger}
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
        stroke={priceAtLedger(fade, scrub ?? ledger) < 0n ? "#8F4E2A" : "var(--accent)"}
        strokeWidth="2.5"
        style={{ cursor: "grab" }}
      />
      <text x={nowX} y={H - 6} fontSize="10" fill="var(--muted)" fontFamily="var(--font-mono)" textAnchor="middle">
        {scrub != null ? `ledger ${scrub} — release to resume live` : "now — drag me"}
      </text>
    </svg>
  );
}

/* --- Actions: claim / handoff / refund ------------------------------------- */

function FadeActions({
  fade,
  ledger,
  wallet,
  run,
  onChanged,
}: {
  fade: Fade;
  ledger: number;
  wallet: WalletState;
  run: (fn: () => Promise<void>) => Promise<void>;
  onChanged: () => Promise<void>;
}) {
  const [venueSecret, setVenueSecret] = useState("");
  const [sig, setSig] = useState("");
  const [sigTs, setSigTs] = useState<bigint | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);

  useEffect(() => {
    try {
      const s = window.sessionStorage.getItem("agyion.venueSecret");
      if (s) setVenueSecret(s);
    } catch {
      /* ignore */
    }
  }, []);

  const claimable = fade.state === FADE_STATE.Open && ledger <= fade.deadline_ledger;
  const refundable =
    (fade.state === FADE_STATE.Open && ledger > fade.deadline_ledger) ||
    (fade.state === FADE_STATE.Claimed &&
      fade.claimed_at != null &&
      ledger > fade.claimed_at + fade.handoff_window);

  const doClaim = () =>
    run(async () => {
      setBusy("claim");
      const claimant = wallet.address ?? demoAddress();
      await getClient().claim(fade.id, claimant);
      logEntry({
        ledger,
        template: "fade",
        action: "claim",
        refId: fade.id.toString(),
        amount: priceAtLedger(fade, ledger).toString(),
        status: "locked",
        detail: `claimed at ${formatMinor(priceAtLedger(fade, ledger))} ${CONFIG.assetCode}`,
        txHash: null,
      });
      await onChanged();
      setBusy(null);
    });

  const produceSig = () => {
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
      setLocalErr(e instanceof Error ? e.message : String(e));
    }
  };

  const doConfirm = () =>
    run(async () => {
      if (!sig || sigTs == null) throw new Error("Produce the venue signature first");
      setBusy("handoff");
      await getClient().confirm_handoff(fade.id, sigTs, sig);
      logEntry({
        ledger,
        template: "fade",
        action: "confirm_handoff",
        refId: fade.id.toString(),
        amount: fade.claimed_at != null ? priceAtLedger(fade, fade.claimed_at).toString() : null,
        status: "executed",
        detail: "venue signature verified — settled at the frozen price",
        txHash: null,
      });
      await onChanged();
      setBusy(null);
    });

  const doRefund = () =>
    run(async () => {
      setBusy("refund");
      await getClient().refund(fade.id);
      logEntry({
        ledger,
        template: "fade",
        action: "refund",
        refId: fade.id.toString(),
        amount: fade.pot.toString(),
        status: "returned",
        detail: "rule-based refund — pot returned to the seller",
        txHash: null,
      });
      await onChanged();
      setBusy(null);
    });

  return (
    <div className="space-y-6 rounded-xl border bg-cream p-6" style={{ borderColor: "var(--hairline)" }}>
      {/* claim */}
      {fade.state === FADE_STATE.Open && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-[52ch] text-[14px] leading-relaxed text-muted">
            Claiming freezes the price at this ledger and starts the handoff
            window. The claimant pays the frozen price; if it is negative, the
            pot pays the claimant.
          </p>
          {claimable ? (
            <FilledButton onClick={() => void doClaim()} disabled={busy === "claim"}>
              {busy === "claim" ? "Claiming…" : `Claim at ${formatMinor(priceAtLedger(fade, ledger))} ${CONFIG.assetCode}`}
            </FilledButton>
          ) : (
            <span className="text-[13px] text-muted">claim closed — deadline passed</span>
          )}
        </div>
      )}

      {/* handoff */}
      {fade.state === FADE_STATE.Claimed && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h3 className="display text-[20px] text-ink">Prove the handoff</h3>
            <span className="tnum font-mono text-[13px] text-muted">
              window ends at ledger{" "}
              {fade.claimed_at != null ? fade.claimed_at + fade.handoff_window : "—"}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Venue secret (demo signer)" hint="S… or 64-hex seed; mock mode signs itself">
              <TextInput
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
            <GhostButton onClick={produceSig}>Produce signature</GhostButton>
            {sig ? (
              <FilledButton onClick={() => void doConfirm()} disabled={busy === "handoff"}>
                {busy === "handoff" ? "Settling…" : "Confirm handoff"}
              </FilledButton>
            ) : (
              <ArrowLink onClick={() => void doConfirm()}>Confirm handoff</ArrowLink>
            )}
          </div>
        </div>
      )}

      {/* refund */}
      {(fade.state === FADE_STATE.Open || fade.state === FADE_STATE.Claimed) && (
        <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-5" style={{ borderColor: "var(--hairline)" }}>
          <p className="max-w-[52ch] text-[13px] leading-relaxed text-muted">
            Rule-based refund: callable by anyone once the deadline or the
            handoff window lapses. The pot returns to the seller.
          </p>
          {refundable ? (
            <GhostButton onClick={() => void doRefund()}>
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
