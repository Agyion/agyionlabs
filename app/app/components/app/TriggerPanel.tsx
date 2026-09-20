"use client";

/**
 * TriggerPanel — event escrow (§5), two-pane.
 *
 * Left: the condition spec as readable clauses (serif) with mono parameters.
 * Right: the attestation feed — each event a row with a timestamp (mono) and
 * a stroke-drawn status mark; pending = sand, executed = olive, disputed/failed
 * = ember. Execution flips the escrow balance with the house easing.
 *
 * Framing: general conditional escrow — a deposit returns if a condition is
 * NOT attested, pays out when an independent attester signs that it happened.
 */

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { getClient, mockClient, SECONDS_PER_LEDGER } from "../../lib/client";
import { humanizeError } from "../../lib/errors";
import { TRIGGER_STATE, type Trigger } from "../../lib/hakClient";
import { useLedger } from "../../lib/useLedger";
import { formatMinor, formatRemaining, parseMinor, shortAddress, shortHex } from "../../lib/format";
import { logEntry } from "../../lib/ledgerLog";
import { demoAddress } from "../../lib/wallet";
import { newKeypair, publicKeyHex, signAttest } from "../../lib/signers";
import type { WalletState } from "../../lib/useWallet";
import { CONFIG, IS_MOCK } from "../../lib/config";
import { ErrorNote, Eyebrow, Field, FilledButton, GhostButton, OkNote, TextInput } from "../ui";

interface AttestEvent {
  ts: string;
  source: string;
  status: "pending" | "executed" | "failed";
  note: string;
}

export default function TriggerPanel({ wallet }: { wallet: WalletState }) {
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [events, setEvents] = useState<AttestEvent[]>([]);
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

  const refresh = async () => {
    if (IS_MOCK) setTriggers((await mockClient()?.listTriggers()) ?? []);
  };
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.address]);

  const pushEvent = (e: AttestEvent) => setEvents((cur) => [e, ...cur].slice(0, 12));

  return (
    <div className="space-y-10">
      <header>
        <Eyebrow>Trigger · event escrow</Eyebrow>
        <h1 className="display mt-2 text-[34px] text-ink md:text-[44px]">
          Released by proof, returned by rule
        </h1>
        <p className="mt-3 max-w-[64ch] text-[16px] leading-[1.65] text-muted">
          A funder locks an amount for a beneficiary behind a real-world
          condition. An independent attester — not the funder, not the
          beneficiary — signs that the condition happened, and the escrow
          executes. If the deadline lands first, the money walks home.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
        {/* left: condition spec */}
        <div className="space-y-8 lg:col-span-6">
          <CreateTrigger
            wallet={wallet}
            onCreated={() => void refresh()}
            setError={setError}
            setNotice={setNotice}
            pushEvent={pushEvent}
          />
          {triggers.map((t) => (
            <TriggerSpec key={t.id.toString()} trigger={t} ledger={ledger} />
          ))}
        </div>

        {/* right: attestation feed + actions */}
        <div className="space-y-8 lg:col-span-6">
          {triggers.map((t) => (
            <TriggerActions
              key={t.id.toString()}
              trigger={t}
              ledger={ledger}
              onChanged={() => void refresh()}
              setError={setError}
              setNotice={setNotice}
              pushEvent={pushEvent}
            />
          ))}
          <AttestFeed events={events} />
        </div>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      {notice && <OkNote>{notice}</OkNote>}
    </div>
  );
}

function CreateTrigger({
  wallet,
  onCreated,
  setError,
  setNotice,
  pushEvent,
}: {
  wallet: WalletState;
  onCreated: () => void;
  setError: (e: string | null) => void;
  setNotice: (n: string | null) => void;
  pushEvent: (e: AttestEvent) => void;
}) {
  const [amount, setAmount] = useState("750");
  const [beneficiary, setBeneficiary] = useState("");
  const [attesterPub, setAttesterPub] = useState("");
  const [minutes, setMinutes] = useState("6");
  const [busy, setBusy] = useState(false);

  const generateAttester = () => {
    const k = newKeypair();
    setAttesterPub(k.pubkeyHex);
    try {
      window.sessionStorage.setItem("agyion.attesterSecret", k.secret);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    try {
      const s = window.sessionStorage.getItem("agyion.attesterSecret");
      if (s) setAttesterPub(publicKeyHex(s));
    } catch {
      /* ignore */
    }
  }, []);

  const create = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (!attesterPub) throw new Error("Generate or paste an attester key first");
      const client = getClient();
      const now = await client.currentLedger();
      const deadline = now + Math.max(10, Math.round((Number(minutes) * 60) / SECONDS_PER_LEDGER));
      const ben = beneficiary.trim() || demoAddress();
      const id = await client.create_trigger(
        wallet.address ?? demoAddress(),
        CONFIG.assetContractId,
        parseMinor(amount),
        ben,
        attesterPub,
        deadline,
      );
      logEntry({
        ledger: now,
        template: "trigger",
        action: "create_trigger",
        refId: id.toString(),
        amount: parseMinor(amount).toString(),
        status: "locked",
        detail: `${amount} ${CONFIG.assetCode} for ${shortAddress(ben)} · deadline ledger ${deadline}`,
        txHash: null,
      });
      pushEvent({
        ts: new Date().toISOString(),
        source: "contract",
        status: "pending",
        note: `escrow #${id} locked — awaiting attestation`,
      });
      setNotice(`Trigger #${id} locked. The attester key can now decide its fate.`);
      onCreated();
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border bg-cream p-6" style={{ borderColor: "var(--hairline)" }}>
      <h2 className="display text-[24px] text-ink">Lock a conditional escrow</h2>
      <div className="mt-5 space-y-4">
        <Field label={`Amount (${CONFIG.assetCode})`}>
          <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="Beneficiary (G…)" hint="Empty = a demo address">
          <TextInput value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} className="font-mono text-[12px]" placeholder="G…" />
        </Field>
        <Field label="Attester pubkey (hex)" hint="The independent signer whose proof executes the escrow">
          <div className="flex gap-2">
            <TextInput value={attesterPub} onChange={(e) => setAttesterPub(e.target.value)} className="font-mono text-[12px]" />
            <GhostButton onClick={generateAttester}>Generate demo key</GhostButton>
          </div>
        </Field>
        <Field label="Deadline (minutes)" hint="After it, only the rule-based refund remains">
          <TextInput value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" />
        </Field>
      </div>
      <div className="mt-5">
        <FilledButton onClick={() => void create()} disabled={busy}>
          {busy ? "Locking…" : "Lock the escrow"}
        </FilledButton>
      </div>
    </div>
  );
}

/** Left pane: the condition as readable clauses (serif) + mono parameters */
function TriggerSpec({ trigger, ledger }: { trigger: Trigger; ledger: number | null }) {
  const stateLabel =
    trigger.state === TRIGGER_STATE.Pending
      ? "pending"
      : trigger.state === TRIGGER_STATE.Executed
        ? "executed"
        : "refunded";
  const color =
    trigger.state === TRIGGER_STATE.Pending
      ? "var(--accent)"
      : trigger.state === TRIGGER_STATE.Executed
        ? "#6B7256"
        : "var(--muted)";
  const secondsLeft = ledger == null ? 0 : Math.max(0, (trigger.deadline_ledger - ledger) * SECONDS_PER_LEDGER);

  return (
    <div className="rounded-xl border p-6" style={{ borderColor: "var(--hairline)" }}>
      <div className="flex items-baseline justify-between">
        <h3 className="display text-[22px] text-ink">Escrow #{trigger.id.toString()}</h3>
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color }}>
          {stateLabel}
        </span>
      </div>
      <p className="mt-3 font-serif text-[17px] leading-[1.6] text-ink">
        If the attester signs that the condition occurred before ledger{" "}
        <span className="tnum font-mono text-[14px]">{trigger.deadline_ledger}</span>, pay{" "}
        <span className="tnum font-mono text-[14px]">
          {formatMinor(trigger.amount)} {CONFIG.assetCode}
        </span>{" "}
        to the beneficiary. Otherwise, when the deadline passes, return
        everything to the funder. No third outcome exists.
      </p>
      <div className="mt-4 space-y-2 font-mono text-[13px]">
        <Row k="funder" v={shortAddress(trigger.funder)} />
        <Row k="beneficiary" v={shortAddress(trigger.beneficiary)} />
        <Row k="attester" v={shortHex(trigger.attester_pubkey)} />
        <Row k="deadline" v={`ledger ${trigger.deadline_ledger} · ${formatRemaining(secondsLeft)}`} />
      </div>
    </div>
  );
}

/** Right pane: attestation controls */
function TriggerActions({
  trigger,
  ledger,
  onChanged,
  setError,
  setNotice,
  pushEvent,
}: {
  trigger: Trigger;
  ledger: number | null;
  onChanged: () => void;
  setError: (e: string | null) => void;
  setNotice: (n: string | null) => void;
  pushEvent: (e: AttestEvent) => void;
}) {
  const reduced = useReducedMotion();
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    try {
      const s = window.sessionStorage.getItem("agyion.attesterSecret");
      if (s) setSecret(s);
    } catch {
      /* ignore */
    }
  }, []);

  if (trigger.state !== TRIGGER_STATE.Pending) return null;

  const expired = ledger != null && ledger > trigger.deadline_ledger;

  const attest = async () => {
    setBusy("attest");
    setError(null);
    setNotice(null);
    try {
      if (!secret.trim()) throw new Error("Paste the attester secret to sign");
      if (publicKeyHex(secret) !== trigger.attester_pubkey.toLowerCase())
        throw new Error("This secret does not match the attester recorded on the escrow");
      const ts = BigInt(Math.floor(Date.now() / 1000));
      const sig = signAttest(secret, trigger.id, trigger.beneficiary, ts);
      await getClient().attest(trigger.id, ts, sig);
      logEntry({
        ledger,
        template: "trigger",
        action: "attest",
        refId: trigger.id.toString(),
        amount: trigger.amount.toString(),
        status: "executed",
        detail: "attester signature verified — beneficiary paid",
        txHash: null,
      });
      pushEvent({
        ts: new Date().toISOString(),
        source: shortHex(trigger.attester_pubkey),
        status: "executed",
        note: `escrow #${trigger.id} executed — sig verified`,
      });
      setNotice(`Escrow #${trigger.id} executed — ${formatMinor(trigger.amount)} ${CONFIG.assetCode} to the beneficiary.`);
      onChanged();
    } catch (e) {
      pushEvent({
        ts: new Date().toISOString(),
        source: "attester",
        status: "failed",
        note: humanizeError(e),
      });
      setError(humanizeError(e));
    } finally {
      setBusy(null);
    }
  };

  const refund = async () => {
    setBusy("refund");
    setError(null);
    try {
      await getClient().refund_trigger(trigger.id);
      logEntry({
        ledger,
        template: "trigger",
        action: "refund_trigger",
        refId: trigger.id.toString(),
        amount: trigger.amount.toString(),
        status: "returned",
        detail: "deadline passed without attestation — returned to funder",
        txHash: null,
      });
      pushEvent({
        ts: new Date().toISOString(),
        source: "contract",
        status: "failed",
        note: `escrow #${trigger.id} refunded — deadline rule`,
      });
      setNotice(`Escrow #${trigger.id} refunded to the funder.`);
      onChanged();
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <motion.div
      className="rounded-xl border bg-cream p-6"
      style={{ borderColor: "var(--hairline)" }}
      layout={!reduced}
    >
      <div className="flex items-center justify-between">
        <h3 className="display text-[20px] text-ink">Attest escrow #{trigger.id.toString()}</h3>
        {/* stroke-drawn status mark */}
        <svg viewBox="0 0 32 32" className="h-7 w-7">
          <circle cx="16" cy="16" r="13" fill="none" stroke={expired ? "#8F4E2A" : "var(--sand)"} strokeWidth="1.6" />
          <motion.path
            d="M 16 8 v 8 l 5 3"
            stroke={expired ? "#8F4E2A" : "var(--accent)"}
            strokeWidth="1.8" fill="none" strokeLinecap="round"
            animate={reduced ? undefined : { rotate: expired ? 0 : [0, 360] }}
            transition={reduced ? undefined : { duration: 24, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "16px 16px" }}
          />
        </svg>
      </div>
      <div className="mt-4 space-y-3">
        <Field label="Attester secret (demo signer)" hint="S… or 64-hex seed">
          <TextInput value={secret} onChange={(e) => setSecret(e.target.value)} className="font-mono text-[12px]" placeholder="S…" />
        </Field>
        <div className="flex flex-wrap gap-3">
          {!expired ? (
            <FilledButton onClick={() => void attest()} disabled={busy === "attest"}>
              {busy === "attest" ? "Verifying…" : "Attest the condition"}
            </FilledButton>
          ) : (
            <GhostButton onClick={() => void refund()} disabled={busy === "refund"}>
              {busy === "refund" ? "Refunding…" : "Refund to funder (deadline passed)"}
            </GhostButton>
          )}
          {!expired && (
            <GhostButton onClick={() => void refund()} disabled={busy === "refund"}>
              Try early refund
            </GhostButton>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/** Attestation feed — rows with mono timestamps and lifecycle colors */
function AttestFeed({ events }: { events: AttestEvent[] }) {
  return (
    <div className="rounded-xl border" style={{ borderColor: "var(--hairline)" }}>
      <div className="border-b px-6 py-4 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted" style={{ borderColor: "var(--hairline)" }}>
        Attestation feed
      </div>
      {events.length === 0 ? (
        <p className="px-6 py-5 text-[13px] text-muted">No events yet.</p>
      ) : (
        <ul>
          {events.map((e, i) => (
            <li key={i} className="ledger-row flex items-center gap-4 px-6 py-3">
              <span className="tnum font-mono text-[12px] text-muted">{e.ts.slice(11, 19)}</span>
              <span className="font-mono text-[12px] text-ink">{e.source}</span>
              <span
                className="ml-auto text-[11px] font-semibold uppercase tracking-[0.1em]"
                style={{
                  color:
                    e.status === "executed" ? "#6B7256" : e.status === "failed" ? "#8F4E2A" : "var(--sand)",
                }}
              >
                {e.status}
              </span>
              <span className="hidden text-[12px] text-muted md:inline">{e.note}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
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
