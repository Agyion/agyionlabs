"use client";

/**
 * EnvoyPanel — on-chain limited mandate (§5).
 *
 * The effective permission is a bounded number of zero/negative-price Fade
 * claims for the owner, before expiry. Monetary fields remain part of the
 * contract but cannot be spent by these permitted claims. The local runner
 * stops when this panel is hidden; the on-chain mandate remains until revoked.
 */

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { InstrumentActivity } from "../../lib/instrumentActivity";
import { getClient, mockClient } from "../../lib/client";
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
import { ErrorNote, Field, FilledButton, GhostButton, OkNote, StateChip, TextInput } from "../ui";
import { RecordLoader, WalletPrerequisite } from "./panelControls";
import { durationLedgers, ledgerDeadline } from "./panelValidation";
import { MandateLimits, draftDelay } from "./instrumentPresentation";

interface AgentEvent {
  ts: string;
  kind: "watch" | "claim" | "rejected" | "stopped";
  note: string;
}

export default function EnvoyPanel({ wallet, active = true }: { wallet: WalletState; active?: boolean }) {
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
    // Re-resolve the shared client when its wallet signer changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div className="instrument-panel panel-envoy">
          <CreateMandate
            wallet={wallet}
            agentPub={agentPub}
            generateAgent={generateAgent}
            onCreated={onMandateCreated}
            setError={setError}
            setNotice={setNotice}
          />
      <div className="instrument-feedback">
        {error && <ErrorNote>{error}</ErrorNote>}
        {notice && <OkNote>{notice}</OkNote>}
      </div>
      <section className="instrument-records">
          <header><h3>Mandates</h3></header>
          {!IS_MOCK && <RecordLoader name="Mandate" load={(id) => getClient().get_mandate(id)} onLoaded={upsert} />}
          {mandates.length === 0 && (
            <p className="instrument-empty">No mandates loaded.</p>
          )}
          {mandates.map((m) => (
            <MandateCard
              key={m.id.toString()}
              mandate={m}
              ledger={ledger}
              agentSecret={agentSecret}
              canSign={IS_MOCK || Boolean(wallet.address)}
              active={active}
              onChanged={upsert}
              setError={setError}
              setNotice={setNotice}
            />
          ))}
      </section>
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
      const duration = durationLedgers(minutes, "Validity", 20);
      const client = getClient();
      const now = await client.currentLedger();
      const validUntil = ledgerDeadline(now, duration, "Validity");
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
        detail: `agent ${shortHex(agentPub)} · Fades priced at zero or less only · up to ${MAX_CLAIMS_PER_MANDATE} claims for owner · until ledger ${validUntil}`,
        txHash: null,
      });
      setNotice(`Mandate #${id} granted: up to ${MAX_CLAIMS_PER_MANDATE} Fade claims at zero or a negative price for you, until ledger ${validUntil}. The local runner is stopped.`);
      onCreated(id);
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="envoy-credential workbench-surface" aria-label="Grant a mandate">
      <section aria-label="Claim permission">
      <header className="workbench-heading"><h3>Authorize an agent</h3></header>
      <div className="envoy-permission-body">
        <div className="envoy-claim-count"><strong>{MAX_CLAIMS_PER_MANDATE}</strong><span>claims maximum</span></div>
        <dl className="envoy-permission-terms">
          <div><dt>Allowed</dt><dd>Only Fade claims at zero or a negative price</dd></div>
          <div><dt>Recipient (fixed to owner)</dt><dd>{wallet.address ? shortAddress(wallet.address) : IS_MOCK ? "Demo address" : "Your connected wallet"}</dd></div>
        </dl>
      </div>
      <div className="envoy-key-field">
        <Field label="Agent key (hex pubkey)" hint="Stored in this browser tab’s session">
          <div className="instrument-inline-control">
            <TextInput value={agentPub} readOnly className="font-mono text-[12px]" placeholder="generate →" />
            <GhostButton onClick={generateAgent}>{agentPub ? "Regenerate" : "Generate agent key"}</GhostButton>
          </div>
        </Field>
      </div>
      <div className="envoy-expiry-setting">
        <Field label="Valid for (minutes)" hint={draftDelay(minutes, "Validity", 20)}>
          <TextInput value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" />
        </Field>
      </div>
      </section>
      <details className="instrument-technical envoy-contract-limits">
        <summary>Contract monetary fields</summary>
        <p>Required contract values, not a spending allowance: permitted claims cost zero or less, so these monetary caps are not consumed.</p>
        <div className="instrument-fields">
          <Field label={`Max per tx (${CONFIG.assetCode})`} hint="Must be positive">
            <TextInput value={maxPerTx} onChange={(e) => setMaxPerTx(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label={`Daily cap (${CONFIG.assetCode})`} hint="Must be at least the value per transaction">
            <TextInput value={dailyCap} onChange={(e) => setDailyCap(e.target.value)} inputMode="decimal" />
          </Field>
        </div>
        <MandateLimits perClaim={maxPerTx} dailyCap={dailyCap} keySet={Boolean(agentPub)} />
      </details>
      <div className="workbench-commit">
        <WalletPrerequisite address={wallet.address} />
        <FilledButton transaction onClick={() => void create()} disabled={busy || (!IS_MOCK && !wallet.address)}>
          {busy ? "Granting…" : "Grant mandate"}
        </FilledButton>
      </div>
      <p className="envoy-local-note">Closing Envoy stops the runner. Its mandate remains valid until expiry or confirmed revocation.</p>
    </section>
  );
}

function MandateCard({
  mandate,
  ledger,
  agentSecret,
  canSign,
  active,
  onChanged,
  setError,
  setNotice,
}: {
  mandate: Mandate;
  ledger: number | null;
  agentSecret: string;
  canSign: boolean;
  active: boolean;
  /** Replaces the card's record with the freshest on-chain state after claim/revoke */
  onChanged: (fresh: Mandate) => void;
  setError: (e: string | null) => void;
  setNotice: (n: string | null) => void;
}) {
  const [running, setRunning] = useState(false);
  const [threshold, setThreshold] = useState("0");
  const [fadeId, setFadeId] = useState("");
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [liveFade, setLiveFade] = useState<Fade | null>(null);
  const [busy, setBusy] = useState(false);
  const [claimPending, setClaimPending] = useState(false);
  const [runnerNote, setRunnerNote] = useState("Stopped. Run only while Envoy is open; leaving does not revoke this mandate.");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptInFlight = useRef(false);
  const runGeneration = useRef(0);

  const expired = ledger != null && ledger > mandate.valid_until;
  const exhausted = mandate.claims_used >= MAX_CLAIMS_PER_MANDATE;
  const canRun = active && canSign && !expired && !mandate.revoked && !exhausted;
  const canRunRef = useRef(canRun);
  canRunRef.current = canRun;

  // the agent loop reads the freshest ledger through a ref (interval closures)
  const ledgerRef = useRef(ledger);
  ledgerRef.current = ledger;
  const thresholdRef = useRef(threshold);
  thresholdRef.current = threshold;

  const push = (e: AgentEvent) => setEvents((cur) => [e, ...cur].slice(0, 14));

  const stop = useCallback(() => {
    runGeneration.current += 1;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setRunning(false);
  }, []);

  useEffect(() => stop, [stop]);
  useEffect(() => {
    if (!canRun) {
      if (timer.current || attemptInFlight.current) setRunnerNote(!active
        ? "Stopped when you left Envoy. Return and start it explicitly; the mandate on the network is unchanged."
        : "Local runner stopped: wallet or mandate permission is no longer available.");
      stop();
    }
  }, [active, canRun, stop]);

  /** Find the fade the agent watches: explicit id, else the latest open one */
  const resolveFade = useCallback(async (): Promise<Fade | null> => {
    const client = getClient();
    if (fadeId.trim()) {
      const id = fadeId.trim();
      if (!/^\d+$/.test(id) || BigInt(id) > 0xffff_ffff_ffff_ffffn) throw new Error("Enter a valid Fade ID.");
      return client.get_fade(BigInt(id));
    }
    if (IS_MOCK) {
      const fades = (await mockClient()?.listFades()) ?? [];
      return fades.filter((f) => f.state === 0).pop() ?? null;
    }
    throw new Error("Enter a Fade ID to watch on testnet.");
  }, [fadeId]);

  const attemptClaim = useCallback(
    async (kind: "auto" | "manual") => {
      if (attemptInFlight.current || !canRunRef.current) return;
      const generation = runGeneration.current;
      const maySubmit = () => canRunRef.current && generation === runGeneration.current;
      attemptInFlight.current = true;
      try {
        const client = getClient();
        const fade = await resolveFade();
        if (!maySubmit()) return;
        if (!fade) {
          push({ ts: now(), kind: "watch", note: "no open fade to watch" });
          return;
        }
        setLiveFade(fade);
        const cur = ledgerRef.current;
        if (cur == null) {
          push({ ts: now(), kind: "watch", note: "ledger clock not synced yet: waiting for the RPC" });
          return;
        }
        const price = priceAtLedger(fade, cur);
        const thresholdMinor = parseMinor(thresholdRef.current);

        if (kind === "auto" && thresholdMinor > 0n) throw new Error("Use zero or a negative claim threshold; Envoy cannot buy Fades with a positive price.");
        if (kind === "auto" && price > 0n) {
          push({ ts: now(), kind: "watch", note: `fade #${fade.id} at ${formatMinor(price)}: only claims at zero or a negative price are permitted; waiting` });
          return;
        }

        if (kind === "auto" && price > thresholdMinor) {
          push({
            ts: now(),
            kind: "watch",
            note: `fade #${fade.id} at ${formatMinor(price)}: above ${formatMinor(thresholdMinor)}, waiting`,
          });
          return;
        }
        if (!agentSecret) {
          push({ ts: now(), kind: "stopped", note: "no agent key in this tab" });
          stop();
          setRunnerNote("Stopped: no agent key is available in this browser tab.");
          return;
        }
        try {
          const ts = BigInt(Math.floor(Date.now() / 1000));
          const sig = signEnvoy(agentSecret, mandate.id, fade.id, ts);
          if (!maySubmit()) return;
          setClaimPending(true);
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
          if (generation === runGeneration.current) {
            stop();
            setRunnerNote("Stopped after the confirmed claim. The mandate may still authorize other claims until expiry or revocation.");
          }
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
          if (generation === runGeneration.current && kind === "auto") {
            stop();
            setRunnerNote("Stopped after a rejected claim. Check the rejection before restarting.");
          }
        }
      } catch (e) {
        if (generation === runGeneration.current) {
          setError(humanizeError(e));
          stop();
          setRunnerNote("Stopped after an error. Check the message before restarting.");
        }
      } finally {
        setClaimPending(false);
        attemptInFlight.current = false;
      }
    },
    [agentSecret, mandate, onChanged, resolveFade, setError, stop],
  );

  const start = () => {
    if (timer.current || attemptInFlight.current || !canRunRef.current) return;
    setError(null);
    setRunning(true);
    setRunnerNote("Watching locally while Envoy is open. Leaving stops new attempts; the mandate itself remains active.");
    push({ ts: now(), kind: "watch", note: `agent loop started: threshold ${threshold} ${CONFIG.assetCode}` });
    timer.current = setInterval(() => void attemptClaim("auto"), 2_000);
    void attemptClaim("auto");
  };

  const attemptNow = () => void attemptClaim("manual");

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
        detail: `demo fade for the agent: starts at ${formatMinor(start)} ${CONFIG.assetCode} (90% of the cap)`,
        txHash: null,
      });
      push({ ts: now(), kind: "watch", note: `demo fade #${id} listed at ${formatMinor(start)}: decaying toward the threshold` });
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
        detail: "mandate revoked by owner: instant",
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
    <div className="instrument-record envoy-loaded-mandate">
      <div className="instrument-layout envoy-loaded-layout">
        {/* The count is the effective bound; monetary usage remains zero. */}
        <div className="instrument-aside order-2 flex items-center justify-center" aria-hidden="true">
          <LimitRings
            claimsUsed={mandate.claims_used}
            revoked={mandate.revoked}
            expired={expired}
            running={running}
            rejected={!!lastRejected}
          />
        </div>

        {/* data + controls */}
        <div className="instrument-main instrument-section order-1">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="display text-[20px] text-ink">Mandate #{mandate.id.toString()}</h3>
            <StateChip
              live={!mandate.revoked && !expired && !exhausted}
              color={mandate.revoked ? "var(--muted)" : expired || exhausted ? "var(--ember)" : "var(--accent)"}
            >
              {mandate.revoked ? "revoked" : expired ? "expired" : exhausted ? "claim limit reached" : "permission active"}
            </StateChip>
          </div>
          <div className="mt-4 space-y-2 font-mono text-[13px]">
            <Row k="scope" v="Fade claims at zero or a negative price" />
            <Row k="recipient · owner" v={shortAddress(mandate.owner)} />
            <Row k="agent" v={shortHex(mandate.agent_pubkey)} />
            {/* claim-count cap (audit v2 fix): the active bound — monetary caps are dead under price<=0 */}
            <Row k="claims" v={`${mandate.claims_used} / ${MAX_CLAIMS_PER_MANDATE}`} />
            <Row k="valid until" v={`ledger ${mandate.valid_until}`} />
          </div>
          <details className="instrument-technical"><summary>Stored monetary values</summary>
            <p>Permitted claims cost zero or less. These values do not represent an available spending allowance.</p>
            <Row k="max / tx" v={`${formatMinor(mandate.max_per_tx, CONFIG.decimals)} ${CONFIG.assetCode}`} />
            <Row k="daily used" v={`${formatMinor(mandate.daily_used, CONFIG.decimals)} / ${formatMinor(mandate.daily_cap, CONFIG.decimals)} ${CONFIG.assetCode}`} />
          </details>

          {!mandate.revoked && !expired && (
            <div className="mt-5 space-y-3">
              <div className="instrument-fields">
                <Field label={`Claim threshold (${CONFIG.assetCode})`} hint="Zero or a negative value">
                  <TextInput value={threshold} onChange={(e) => setThreshold(e.target.value)} inputMode="decimal" />
                </Field>
                <Field label={IS_MOCK ? "Fade id (blank = latest open)" : "Fade id (required on testnet)"}>
                  <TextInput value={fadeId} onChange={(e) => setFadeId(e.target.value)} inputMode="numeric" disabled={running || claimPending} />
                </Field>
              </div>
              {liveFade && ledger != null && (
                <div className="tnum font-mono text-[12px] text-muted">
                  watching fade #{liveFade.id.toString()} · price {formatMinor(priceAtLedger(liveFade, ledger))}{" "}
                  {CONFIG.assetCode}
                </div>
              )}
              <div className="instrument-actions">
                {running ? (
                  <GhostButton onClick={() => { stop(); setRunnerNote("Stopped locally. The mandate on the network remains active until expiry or confirmed revocation."); }}>Stop agent</GhostButton>
                ) : (
                  <FilledButton transaction onClick={start} disabled={!canRun || claimPending}>Run the agent</FilledButton>
                )}
                <GhostButton transaction onClick={attemptNow} disabled={!canRun || claimPending}>Attempt claim now</GhostButton>
                <GhostButton transaction onClick={() => void revoke()} disabled={busy || !canSign}>
                  {busy ? "Revoking…" : "Revoke"}
                </GhostButton>
              </div>
              <p className="instrument-disclosure envoy-runner-status" role="status">{claimPending ? "Claim request in progress. Stopping cannot cancel a wallet request or a transaction already sent." : runnerNote}</p>
              {IS_MOCK && (
                <button
                  type="button"
                  onClick={() => void demoFade()}
                  className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted underline-offset-4 transition-colors hover:text-[var(--accent)] hover:underline"
                >
                  need a target? list a demo fade just under the cap
                </button>
              )}
            </div>
          )}
          {(mandate.revoked || expired) && (
            <p className="mt-4 text-[13px] text-muted">
              This mandate is inert: the contract rejects any claim signed by the agent key.
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
                  className="font-mono text-[10px] uppercase tracking-[0.14em]"
                  style={{
                    color:
                      e.kind === "claim"
                        ? "var(--olive)"
                        : e.kind === "rejected"
                          ? "var(--ember)"
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

/** The outer ring tracks confirmed claims, not a monetary allowance. */
function LimitRings({
  claimsUsed,
  revoked,
  expired,
  running,
  rejected,
}: {
  claimsUsed: number;
  revoked: boolean;
  expired: boolean;
  running: boolean;
  rejected: boolean;
}) {
  const active = useContext(InstrumentActivity);
  const reduced = useReducedMotion() || !active;
  const [angle, setAngle] = useState(0);
  const usedPct = Math.max(0, Math.min(100, claimsUsed / MAX_CLAIMS_PER_MANDATE * 100));
  useEffect(() => {
    if (!running || reduced) return;
    const id = setInterval(() => setAngle((a) => a + 0.12), 120);
    return () => clearInterval(id);
  }, [running, reduced]);

  const dim = revoked || expired;
  const dotColor = rejected ? "var(--ember)" : dim ? "var(--muted)" : "var(--accent)";
  const cx = 90 + Math.cos(angle) * 46;
  const cy = 90 + Math.sin(angle) * 46;

  return (
    <svg viewBox="0 0 180 180" className="h-[180px] w-[180px]">
      {/* Confirmed claim count */}
      <circle cx="90" cy="90" r="64" fill="none" stroke="var(--sand)" strokeWidth="2" />
      <motion.circle
        cx="90" cy="90" r="64" fill="none"
        stroke={usedPct >= 100 ? "var(--ember)" : "var(--accent)"}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={2 * Math.PI * 64}
        strokeDashoffset={2 * Math.PI * 64 * (1 - Math.min(1, usedPct / 100))}
        animate={{ strokeDashoffset: 2 * Math.PI * 64 * (1 - Math.min(1, usedPct / 100)) }}
        transition={{ duration: reduced ? 0 : 0.5, ease: [1, 0, 0.3, 0.93] }}
        transform="rotate(-90 90 90)"
      />
      {/* Agent restricted to the mandate boundary */}
      <circle cx="90" cy="90" r="46" fill="none" stroke="var(--sand)" strokeWidth="1.2" strokeDasharray="3 5" />
      {/* expiry ring */}
      <circle cx="90" cy="90" r="28" fill="none" stroke={dim ? "var(--hairline)" : "var(--sand)"} strokeWidth="1" />
      {/* owner at the center */}
      <circle cx="90" cy="90" r="3" fill="var(--ink)" />
      {/* the agent dot — stops at the wall when rejected */}
      <circle cx={rejected ? 90 + 46 : cx} cy={rejected ? 90 : cy} r="4.5" fill={dotColor} />
      {rejected && !reduced && (
        <motion.circle
          cx={90 + 46} cy={90} r="10" fill="none" stroke="var(--ember)" strokeWidth="1.2"
          animate={{ r: [10, 16, 10], opacity: [0.7, 0.15, 0.7] }}
          transition={{ duration: 1.6, repeat: Infinity }}
        />
      )}
      <text x="90" y="170" textAnchor="middle" fontSize="9.5" fill="var(--muted)" fontFamily="var(--font-mono)">
        {revoked ? "revoked" : expired ? "expired" : `${claimsUsed} / ${MAX_CLAIMS_PER_MANDATE} claims used`}
      </text>
    </svg>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-1.5" style={{ borderColor: "var(--hairline)" }}>
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{k}</span>
      <span className="tnum font-mono text-[12px] text-ink">{v}</span>
    </div>
  );
}
