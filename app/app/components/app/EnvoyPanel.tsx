"use client";

/**
 * EnvoyPanel — on-chain limited mandate (§5).
 *
 * Delegation card shows the agent's limits as concentric rings (per-tx
 * ceiling, daily cap, expiry). A simulated agent loop watches a Fade's price
 * and calls envoy_claim when it drops below the threshold; the over-cap
 * attempt surfaces the contract's rejection — "the contract said no".
 * Revoke is always one click, never buried.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { getClient, mockClient, SECONDS_PER_LEDGER } from "../../lib/client";
import { humanizeError } from "../../lib/errors";
import {
  AgyionError,
  AgyionErrorCode,
  MAX_CLAIMS_PER_MANDATE,
  priceAtLedger,
  type Fade,
  type Mandate,
} from "../../lib/hakClient";
import { useLedger } from "../../lib/useLedger";
import { formatMinor, parseMinor, shortAddress, shortHex } from "../../lib/format";
import { logEntry } from "../../lib/ledgerLog";
import { demoAddress } from "../../lib/wallet";
import { newKeypair, publicKeyHex, signEnvoy } from "../../lib/signers";
import type { WalletState } from "../../lib/useWallet";
import { CONFIG, IS_MOCK } from "../../lib/config";
import { ErrorNote, Eyebrow, Field, FilledButton, GhostButton, OkNote, TextInput } from "../ui";

interface AgentEvent {
  ts: string;
  kind: "watch" | "claim" | "rejected" | "stopped";
  note: string;
}

export default function EnvoyPanel({ wallet }: { wallet: WalletState }) {
  const [mandates, setMandates] = useState<Mandate[]>([]);
  const [agentSecret, setAgentSecret] = useState("");
  const [agentPub, setAgentPub] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const client = useMemo(() => {
    try {
      return getClient();
    } catch {
      return null;
    }
  }, [wallet.address]);
  const ledger = useLedger(client);

  const refresh = useCallback(async () => {
    if (IS_MOCK) setMandates((await mockClient()?.listMandates()) ?? []);
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh, wallet.address]);

  /** Insert or replace one mandate card (soroban mode has no list view) */
  const upsert = useCallback((m: Mandate) => {
    setMandates((cur) => [m, ...cur.filter((x) => x.id !== m.id)]);
  }, []);

  /** After create: mock re-lists from the store; soroban reads the fresh record */
  const onMandateCreated = useCallback(
    (id: bigint) => {
      void (async () => {
        if (IS_MOCK) {
          await refresh();
          return;
        }
        try {
          const m = await getClient().get_mandate(id);
          if (m) upsert(m);
        } catch {
          /* the grant notice is already shown; the card can be loaded by id */
        }
      })();
    },
    [refresh, upsert],
  );

  useEffect(() => {
    try {
      const s = window.sessionStorage.getItem("agyion.agentSecret");
      if (s) {
        setAgentSecret(s);
        setAgentPub(publicKeyHex(s));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const generateAgent = () => {
    const k = newKeypair();
    setAgentSecret(k.secret);
    setAgentPub(k.pubkeyHex);
    try {
      window.sessionStorage.setItem("agyion.agentSecret", k.secret);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-10">
      <header>
        <Eyebrow>Envoy · agent mandate</Eyebrow>
        <h1 className="display mt-2 text-[34px] text-ink md:text-[44px]">
          Delegate spending, not trust
        </h1>
        <p className="mt-3 max-w-[64ch] text-[16px] leading-[1.65] text-muted">
          Grant an agent key a bounded right to claim Fade listings for you:
          a per-transaction ceiling, a daily cap, an expiry. The contract
          enforces every limit — the agent never touches anything else.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <CreateMandate
            wallet={wallet}
            agentPub={agentPub}
            generateAgent={generateAgent}
            onCreated={onMandateCreated}
            setError={setError}
            setNotice={setNotice}
          />
        </div>
        <div className="space-y-8 lg:col-span-7">
          {!IS_MOCK && <LoadMandate onLoaded={upsert} />}
          {mandates.length === 0 && (
            <p className="rounded-xl border p-6 text-[14px] text-muted" style={{ borderColor: "var(--hairline)" }}>
              No mandates yet. Grant one on the left — the limit rings will draw here.
            </p>
          )}
          {mandates.map((m) => (
            <MandateCard
              key={m.id.toString()}
              mandate={m}
              ledger={ledger}
              agentSecret={agentSecret}
              onChanged={upsert}
              setError={setError}
              setNotice={setNotice}
            />
          ))}
        </div>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      {notice && <OkNote>{notice}</OkNote>}
    </div>
  );
}

function CreateMandate({
  wallet,
  agentPub,
  generateAgent,
  onCreated,
  setError,
  setNotice,
}: {
  wallet: WalletState;
  agentPub: string;
  generateAgent: () => void;
  onCreated: (id: bigint) => void;
  setError: (e: string | null) => void;
  setNotice: (n: string | null) => void;
}) {
  const [maxPerTx, setMaxPerTx] = useState("200");
  const [dailyCap, setDailyCap] = useState("500");
  const [minutes, setMinutes] = useState("15");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (!agentPub) throw new Error("Generate an agent key first");
      const mins = Number(minutes);
      if (!Number.isFinite(mins) || mins <= 0) throw new Error("Validity must be a positive number of minutes");
      const client = getClient();
      const now = await client.currentLedger();
      const validUntil = now + Math.max(20, Math.round((mins * 60) / SECONDS_PER_LEDGER));
      const owner = wallet.address ?? demoAddress();
      const id = await client.create_mandate(
        owner,
        agentPub,
        parseMinor(maxPerTx),
        parseMinor(dailyCap),
        validUntil,
      );
      logEntry({
        ledger: now,
        template: "envoy",
        action: "create_mandate",
        refId: id.toString(),
        amount: parseMinor(dailyCap).toString(),
        status: "locked",
        detail: `agent ${shortHex(agentPub)} · ${maxPerTx}/tx · ${dailyCap}/day · until ledger ${validUntil}`,
        txHash: null,
      });
      setNotice(`Mandate #${id} granted. The agent can act until ledger ${validUntil}.`);
      onCreated(id);
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border bg-cream p-6" style={{ borderColor: "var(--hairline)" }}>
      <h2 className="display text-[24px] text-ink">Grant a mandate</h2>
      <div className="mt-5 space-y-4">
        <Field label="Agent key (hex pubkey)" hint="The agent signs claims; the recipient is fixed to you">
          <div className="flex gap-2">
            <TextInput value={agentPub} readOnly className="font-mono text-[12px]" placeholder="generate →" />
            <GhostButton onClick={generateAgent}>{agentPub ? "Regenerate" : "Generate agent key"}</GhostButton>
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={`Max per tx (${CONFIG.assetCode})`} hint="One claim can never exceed this">
            <TextInput value={maxPerTx} onChange={(e) => setMaxPerTx(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label={`Daily cap (${CONFIG.assetCode})`} hint="Total per day — binds when a mandate lives for days">
            <TextInput value={dailyCap} onChange={(e) => setDailyCap(e.target.value)} inputMode="decimal" />
          </Field>
        </div>
        <Field label="Valid for (minutes)" hint="When the mandate dies — after this the agent key is inert, whatever the caps say">
          <TextInput value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" />
        </Field>
      </div>
      <div className="mt-5">
        <FilledButton onClick={() => void create()} disabled={busy}>
          {busy ? "Granting…" : "Grant mandate"}
        </FilledButton>
      </div>
    </div>
  );
}

function LoadMandate({ onLoaded }: { onLoaded: (m: Mandate) => void }) {
  const [id, setId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setErr(null);
    const t = id.trim();
    if (!/^\d+$/.test(t)) {
      setErr("enter a mandate id");
      return;
    }
    setBusy(true);
    getClient()
      .get_mandate(BigInt(t))
      .then((m) => (m ? onLoaded(m) : setErr("not found")))
      .catch((e) => setErr(humanizeError(e)))
      .finally(() => setBusy(false));
  };

  return (
    <div className="flex items-end gap-2">
      <Field label="Load mandate by id">
        <TextInput value={id} onChange={(e) => setId(e.target.value)} inputMode="numeric" className="w-[160px]" />
      </Field>
      <GhostButton onClick={load} disabled={busy}>
        {busy ? "Loading…" : "Load"}
      </GhostButton>
      {err && (
        <span className="text-[13px]" style={{ color: "#8F4E2A" }}>
          {err}
        </span>
      )}
    </div>
  );
}

function MandateCard({
  mandate,
  ledger,
  agentSecret,
  onChanged,
  setError,
  setNotice,
}: {
  mandate: Mandate;
  ledger: number | null;
  agentSecret: string;
  /** Replaces the card's record with the freshest on-chain state after claim/revoke */
  onChanged: (fresh: Mandate) => void;
  setError: (e: string | null) => void;
  setNotice: (n: string | null) => void;
}) {
  const [running, setRunning] = useState(false);
  const [threshold, setThreshold] = useState("170");
  const [fadeId, setFadeId] = useState("");
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [liveFade, setLiveFade] = useState<Fade | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const expired = ledger != null && ledger > mandate.valid_until;
  const usedPct = mandate.daily_cap > 0n ? Number((mandate.daily_used * 100n) / mandate.daily_cap) : 0;

  // the agent loop reads the freshest ledger through a ref (interval closures)
  const ledgerRef = useRef(ledger);
  ledgerRef.current = ledger;
  const thresholdRef = useRef(threshold);
  thresholdRef.current = threshold;

  const push = (e: AgentEvent) => setEvents((cur) => [e, ...cur].slice(0, 14));

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setRunning(false);
  }, []);

  useEffect(() => stop, [stop]);

  /** Find the fade the agent watches: explicit id, else the latest open one */
  const resolveFade = useCallback(async (): Promise<Fade | null> => {
    const client = getClient();
    if (fadeId.trim()) return client.get_fade(BigInt(fadeId.trim()));
    if (IS_MOCK) {
      const fades = (await mockClient()?.listFades()) ?? [];
      return fades.filter((f) => f.state === 0).pop() ?? null;
    }
    return null;
  }, [fadeId]);

  const attemptClaim = useCallback(
    async (kind: "auto" | "breach") => {
      const client = getClient();
      const fade = await resolveFade();
      if (!fade) {
        push({ ts: now(), kind: "watch", note: "no open fade to watch" });
        return;
      }
      setLiveFade(fade);
      const cur = ledgerRef.current;
      if (cur == null) {
        push({ ts: now(), kind: "watch", note: "ledger clock not synced yet — waiting for the RPC" });
        return;
      }
      const price = priceAtLedger(fade, cur);
      const thresholdMinor = parseMinor(thresholdRef.current);

      if (kind === "auto" && price > thresholdMinor) {
        push({
          ts: now(),
          kind: "watch",
          note: `fade #${fade.id} at ${formatMinor(price)} — above ${formatMinor(thresholdMinor)}, waiting`,
        });
        return;
      }
      if (!agentSecret) {
        push({ ts: now(), kind: "stopped", note: "no agent key in this tab" });
        stop();
        return;
      }
      try {
        const ts = BigInt(Math.floor(Date.now() / 1000));
        const sig = signEnvoy(agentSecret, mandate.id, fade.id, ts);
        await client.envoy_claim(mandate.id, fade.id, ts, sig);
        push({
          ts: now(),
          kind: "claim",
          note: `claimed fade #${fade.id} at ${formatMinor(price)} ${CONFIG.assetCode} for the owner`,
        });
        logEntry({
          ledger: cur,
          template: "envoy",
          action: "envoy_claim",
          refId: `${mandate.id}→${fade.id}`,
          amount: price.toString(),
          status: "executed",
          detail: `agent claimed fade #${fade.id} at ${formatMinor(price)} within mandate`,
          txHash: null,
        });
        stop();
        // pull the freshest record so claims_used / daily_used reflect the chain
        // (in soroban mode the parent list is not re-read automatically)
        try {
          const fresh = await client.get_mandate(mandate.id);
          onChanged(fresh ?? mandate);
        } catch {
          onChanged(mandate);
        }
      } catch (e) {
        // Mock raises AgyionError; the soroban bindings throw a plain Error
        // whose message is the contract error name (e.g. "CapExceeded")
        const cap =
          (e instanceof AgyionError &&
            (e.code === AgyionErrorCode.CapExceeded || e.code === AgyionErrorCode.MandateExpired)) ||
          (e instanceof Error && /CapExceeded|MandateExpired/.test(e.message));
        push({
          ts: now(),
          kind: "rejected",
          note: cap
            ? `${e.message}`
            : `rejected: ${humanizeError(e)}`,
        });
        logEntry({
          ledger: cur,
          template: "envoy",
          action: "envoy_claim",
          refId: `${mandate.id}→${fade.id}`,
          amount: price.toString(),
          status: "rejected",
          detail: humanizeError(e),
          txHash: null,
        });
        if (kind === "auto") stop();
      }
    },
    [agentSecret, mandate.id, onChanged, resolveFade, stop],
  );

  const start = () => {
    setRunning(true);
    push({ ts: now(), kind: "watch", note: `agent loop started — threshold ${threshold} ${CONFIG.assetCode}` });
    timer.current = setInterval(() => void attemptClaim("auto"), 2_000);
    void attemptClaim("auto");
  };

  const breach = () => void attemptClaim("breach");

  /** Mock demo: a fade priced at 90% of max_per_tx — inside the cap, above the default threshold */
  const demoFade = async () => {
    const m = mockClient();
    if (!m) return;
    setError(null);
    try {
      const nowL = await m.currentLedger();
      const start = (mandate.max_per_tx * 9n) / 10n;
      const floor = -parseMinor("40");
      const duration = 300;
      const id = await m.create_fade(
        mandate.owner,
        CONFIG.assetContractId,
        parseMinor("1000"),
        start,
        floor,
        start - floor,
        BigInt(duration),
        duration,
        120,
        m.venuePubkey(),
      );
      logEntry({
        ledger: nowL,
        template: "fade",
        action: "create_fade",
        refId: id.toString(),
        amount: parseMinor("1000").toString(),
        status: "locked",
        detail: `demo fade for the agent — starts at ${formatMinor(start)} ${CONFIG.assetCode} (90% of the cap)`,
        txHash: null,
      });
      push({ ts: now(), kind: "watch", note: `demo fade #${id} listed at ${formatMinor(start)} — decaying toward the threshold` });
    } catch (e) {
      setError(humanizeError(e));
    }
  };

  const revoke = async () => {
    setBusy(true);
    setError(null);
    try {
      stop();
      await getClient().revoke_mandate(mandate.owner, mandate.id);
      logEntry({
        ledger,
        template: "envoy",
        action: "revoke_mandate",
        refId: mandate.id.toString(),
        amount: null,
        status: "returned",
        detail: "mandate revoked by owner — instant",
        txHash: null,
      });
      setNotice(`Mandate #${mandate.id} revoked. The agent key is now inert.`);
      // the card must flip to "revoked" even though its local record is stale
      try {
        const fresh = await getClient().get_mandate(mandate.id);
        onChanged(fresh ?? { ...mandate, revoked: true });
      } catch {
        onChanged({ ...mandate, revoked: true });
      }
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };

  const lastRejected = events.find((e) => e.kind === "rejected");

  return (
    <div className="overflow-hidden rounded-xl border bg-cream" style={{ borderColor: "var(--hairline)" }}>
      <div className="grid grid-cols-1 md:grid-cols-12">
        {/* limit rings */}
        <div className="flex items-center justify-center p-6 md:col-span-5">
          <LimitRings
            usedPct={usedPct}
            revoked={mandate.revoked}
            expired={expired}
            running={running}
            rejected={!!lastRejected}
          />
        </div>

        {/* data + controls */}
        <div className="p-6 md:col-span-7">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="display text-[22px] text-ink">Mandate #{mandate.id.toString()}</h3>
            <span
              className="text-[11px] font-semibold uppercase tracking-[0.12em]"
              style={{
                color: mandate.revoked ? "var(--muted)" : expired ? "#8F4E2A" : "var(--accent)",
              }}
            >
              {mandate.revoked ? "revoked" : expired ? "expired" : "active"}
            </span>
          </div>
          <div className="mt-4 space-y-2 font-mono text-[13px]">
            <Row k="owner" v={shortAddress(mandate.owner)} />
            <Row k="agent" v={shortHex(mandate.agent_pubkey)} />
            <Row k="max / tx" v={`${formatMinor(mandate.max_per_tx)} ${CONFIG.assetCode}`} />
            <Row
              k="daily used"
              v={`${formatMinor(mandate.daily_used)} / ${formatMinor(mandate.daily_cap)} ${CONFIG.assetCode}`}
            />
            {/* claim-count cap (audit v2 fix): the active bound — monetary caps are dead under price<=0 */}
            <Row k="claims" v={`${mandate.claims_used} / ${MAX_CLAIMS_PER_MANDATE}`} />
            <Row k="valid until" v={`ledger ${mandate.valid_until}`} />
          </div>

          {!mandate.revoked && !expired && (
            <div className="mt-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label={`Claim threshold (${CONFIG.assetCode})`}>
                  <TextInput value={threshold} onChange={(e) => setThreshold(e.target.value)} inputMode="decimal" />
                </Field>
                <Field label="Fade id (blank = latest open)">
                  <TextInput value={fadeId} onChange={(e) => setFadeId(e.target.value)} inputMode="numeric" />
                </Field>
              </div>
              {liveFade && ledger != null && (
                <div className="tnum font-mono text-[12px] text-muted">
                  watching fade #{liveFade.id.toString()} · price {formatMinor(priceAtLedger(liveFade, ledger))}{" "}
                  {CONFIG.assetCode}
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                {running ? (
                  <GhostButton onClick={stop}>Stop agent</GhostButton>
                ) : (
                  <FilledButton onClick={start}>Run the agent</FilledButton>
                )}
                <GhostButton onClick={breach}>Attempt over-cap claim</GhostButton>
                <GhostButton onClick={() => void revoke()} disabled={busy}>
                  {busy ? "Revoking…" : "Revoke"}
                </GhostButton>
              </div>
              {IS_MOCK && (
                <button
                  type="button"
                  onClick={() => void demoFade()}
                  className="text-[13px] font-medium text-muted underline underline-offset-4"
                >
                  need a target? list a demo fade just under the cap
                </button>
              )}
            </div>
          )}
          {(mandate.revoked || expired) && (
            <p className="mt-4 text-[13px] text-muted">
              This mandate is inert — the contract rejects any claim signed by the agent key.
            </p>
          )}
        </div>
      </div>

      {/* agent feed */}
      {events.length > 0 && (
        <div className="border-t px-6 py-4" style={{ borderColor: "var(--hairline)" }}>
          <ul className="space-y-1.5">
            {events.map((e, i) => (
              <li key={i} className="flex items-baseline gap-3 font-mono text-[12px]">
                <span className="tnum text-muted">{e.ts}</span>
                <span
                  className="font-semibold uppercase tracking-[0.08em]"
                  style={{
                    color:
                      e.kind === "claim"
                        ? "#6B7256"
                        : e.kind === "rejected"
                          ? "#8F4E2A"
                          : "var(--muted)",
                  }}
                >
                  {e.kind}
                </span>
                <span className="text-ink">{e.note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function now(): string {
  return new Date().toISOString().slice(11, 19);
}

/** Concentric limit rings: daily cap fill, agent dot orbit, cap-wall pulse */
function LimitRings({
  usedPct,
  revoked,
  expired,
  running,
  rejected,
}: {
  usedPct: number;
  revoked: boolean;
  expired: boolean;
  running: boolean;
  rejected: boolean;
}) {
  const reduced = useReducedMotion();
  const [angle, setAngle] = useState(0);
  useEffect(() => {
    if (!running || reduced) return;
    const id = setInterval(() => setAngle((a) => a + 0.12), 120);
    return () => clearInterval(id);
  }, [running, reduced]);

  const dim = revoked || expired;
  const dotColor = rejected ? "#8F4E2A" : dim ? "var(--muted)" : "var(--accent)";
  const cx = 90 + Math.cos(angle) * 46;
  const cy = 90 + Math.sin(angle) * 46;

  return (
    <svg viewBox="0 0 180 180" className="h-[180px] w-[180px]">
      {/* daily cap ring — fills with use */}
      <circle cx="90" cy="90" r="64" fill="none" stroke="var(--sand)" strokeWidth="2" />
      <motion.circle
        cx="90" cy="90" r="64" fill="none"
        stroke={usedPct >= 100 ? "#8F4E2A" : "var(--accent)"}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={2 * Math.PI * 64}
        animate={{ strokeDashoffset: 2 * Math.PI * 64 * (1 - Math.min(1, usedPct / 100)) }}
        transition={{ duration: reduced ? 0 : 0.5, ease: [1, 0, 0.3, 0.93] }}
        transform="rotate(-90 90 90)"
      />
      {/* per-tx ceiling ring */}
      <circle cx="90" cy="90" r="46" fill="none" stroke="var(--sand)" strokeWidth="1.2" strokeDasharray="3 5" />
      {/* expiry ring */}
      <circle cx="90" cy="90" r="28" fill="none" stroke={dim ? "var(--hairline)" : "var(--sand)"} strokeWidth="1" />
      {/* owner at the center */}
      <circle cx="90" cy="90" r="3" fill="var(--ink)" />
      {/* the agent dot — stops at the wall when rejected */}
      <circle cx={rejected ? 90 + 46 : cx} cy={rejected ? 90 : cy} r="4.5" fill={dotColor} />
      {rejected && !reduced && (
        <motion.circle
          cx={90 + 46} cy={90} r="10" fill="none" stroke="#8F4E2A" strokeWidth="1.2"
          animate={{ r: [10, 16, 10], opacity: [0.7, 0.15, 0.7] }}
          transition={{ duration: 1.6, repeat: Infinity }}
        />
      )}
      <text x="90" y="170" textAnchor="middle" fontSize="9.5" fill="var(--muted)" fontFamily="var(--font-mono)">
        {revoked ? "revoked" : expired ? "expired" : `${usedPct}% of daily cap`}
      </text>
    </svg>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-1.5" style={{ borderColor: "var(--hairline)" }}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{k}</span>
      <span className="tnum text-ink">{v}</span>
    </div>
  );
}
