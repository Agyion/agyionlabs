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
import { ErrorNote, Field, FilledButton, GhostButton, OkNote, StateChip, TextInput } from "../ui";
import { RecordLoader, WalletPrerequisite } from "./panelControls";
import { durationLedgers, ledgerDeadline } from "./panelValidation";
import { ConditionGate, draftDelay } from "./instrumentPresentation";

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
    // Re-resolve the shared client when its wallet signer changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.address]);
  const ledger = useLedger(client);

  const upsert = (trigger: Trigger) => setTriggers((cur) => [trigger, ...cur.filter((item) => item.id !== trigger.id)]);
  const refresh = async (id?: bigint) => {
    try {
      if (IS_MOCK) setTriggers((await mockClient()?.listTriggers()) ?? []);
      else if (id != null) {
        const fresh = await getClient().get_trigger(id);
        if (!fresh) throw new Error("The record is not available yet.");
        upsert(fresh);
      }
    } catch (e) {
      setError(`Could not refresh Trigger #${id}. Load it by ID to retry. ${humanizeError(e)}`);
    }
  };
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.address]);

  const pushEvent = (e: AttestEvent) => setEvents((cur) => [e, ...cur].slice(0, 12));

  return (
    <div className="instrument-panel panel-trigger">
          <CreateTrigger
            wallet={wallet}
            onCreated={(id) => void refresh(id)}
            setError={setError}
            setNotice={setNotice}
            pushEvent={pushEvent}
          />
      <div className="instrument-feedback">
        {error && <ErrorNote>{error}</ErrorNote>}
        {notice && <OkNote>{notice}</OkNote>}
      </div>
      <section className="instrument-records">
          <header><h3>Escrows</h3></header>
          {!IS_MOCK && <RecordLoader name="Trigger" load={(id) => getClient().get_trigger(id)} onLoaded={upsert} />}
          {triggers.length === 0 && <p className="instrument-empty">No escrows loaded.</p>}
          {triggers.map((t) => (
            <article className="instrument-record instrument-layout" key={t.id.toString()}>
            <TriggerSpec trigger={t} ledger={ledger} />
            <TriggerActions
              trigger={t}
              ledger={ledger}
              wallet={wallet}
              onChanged={() => void refresh(t.id)}
              setError={setError}
              setNotice={setNotice}
              pushEvent={pushEvent}
            />
            </article>
          ))}
          {events.length > 0 && <AttestFeed events={events} />}
      </section>
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
  onCreated: (id: bigint) => void;
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
      const duration = durationLedgers(minutes, "Deadline", 10);
      const client = getClient();
      const now = await client.currentLedger();
      const deadline = ledgerDeadline(now, duration, "Deadline", 1);
      const ben = beneficiary.trim() || (IS_MOCK ? demoAddress() : wallet.address);
      if (!ben) throw new Error("Connect a wallet or enter a beneficiary first.");
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
        note: `escrow #${id} locked: awaiting attestation`,
      });
      setNotice(`Trigger #${id} locked. The attester key can now decide its fate.`);
      onCreated(id);
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="trigger-agreement workbench-surface" aria-label="Lock a conditional escrow">
      <header className="workbench-heading"><h3>Set payment conditions</h3></header>
      <div className="trigger-clause">
        <div className="trigger-clause__content"><div className="trigger-recipient-fields">
        <Field label="Beneficiary (G…)" hint={IS_MOCK ? "Empty = a demo address" : "Empty = your connected wallet"}>
          <TextInput value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} className="font-mono text-[12px]" placeholder="G…" />
        </Field>
        <Field label={`Amount (${CONFIG.assetCode})`}>
          <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        </Field>
        </div></div>
      </div>
      <div className="trigger-clause">
        <div className="trigger-clause__content">
        <Field label="Attester pubkey (hex)">
          <div className="instrument-inline-control">
            <TextInput value={attesterPub} onChange={(e) => setAttesterPub(e.target.value)} className="font-mono text-[12px]" />
            <GhostButton onClick={generateAttester}>Generate demo key</GhostButton>
          </div>
        </Field>
        <p className="trigger-clause__note">Choose a trusted signer. The contract verifies their signature, not the event itself.</p>
        </div>
      </div>
      <div className="trigger-clause">
        <div className="trigger-clause__content">
          <div className="trigger-expiry-fields"><Field label="Deadline (minutes)" hint={draftDelay(minutes, "Deadline", 10)}>
            <TextInput value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" />
          </Field></div>
        </div>
      </div>
      <div className="trigger-outcomes"><ConditionGate keySet={Boolean(attesterPub.trim())} beneficiary={beneficiary.trim() ? shortAddress(beneficiary.trim()) : IS_MOCK ? "the demo beneficiary" : wallet.address ? shortAddress(wallet.address) : "the beneficiary you choose"} /></div>
      <div className="workbench-commit">
        <WalletPrerequisite address={wallet.address} />
        <FilledButton transaction onClick={() => void create()} disabled={busy || (!IS_MOCK && !wallet.address)}>
          {busy ? "Locking…" : "Lock the escrow"}
        </FilledButton>
      </div>
    </section>
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
        ? "var(--olive)"
        : "var(--muted)";
  const secondsLeft = ledger == null ? 0 : Math.max(0, (trigger.deadline_ledger - ledger) * SECONDS_PER_LEDGER);

  return (
    <div className="instrument-aside instrument-section order-2">
      <div className="flex items-baseline justify-between">
        <h3 className="display text-[20px] text-ink">Escrow #{trigger.id.toString()}</h3>
        <StateChip live={trigger.state === TRIGGER_STATE.Pending} color={color}>
          {stateLabel}
        </StateChip>
      </div>
      <p className="mt-3 text-[14px] leading-relaxed text-muted">
        A valid attestation before ledger{" "}
        <span className="tnum font-mono text-[14px]">{trigger.deadline_ledger}</span> pays{" "}
        <span className="tnum font-mono text-[14px]">
          {formatMinor(trigger.amount)} {CONFIG.assetCode}
        </span>{" "}
        to the beneficiary. After the deadline, the funder can submit a refund transaction.
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
  wallet,
  onChanged,
  setError,
  setNotice,
  pushEvent,
}: {
  trigger: Trigger;
  ledger: number | null;
  wallet: WalletState;
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
        detail: "attester signature verified: beneficiary paid",
        txHash: null,
      });
      pushEvent({
        ts: new Date().toISOString(),
        source: shortHex(trigger.attester_pubkey),
        status: "executed",
        note: `escrow #${trigger.id} executed: sig verified`,
      });
      setNotice(`Escrow #${trigger.id} executed: ${formatMinor(trigger.amount)} ${CONFIG.assetCode} to the beneficiary.`);
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
        detail: "deadline passed without attestation: returned to funder",
        txHash: null,
      });
      pushEvent({
        ts: new Date().toISOString(),
        source: "contract",
        status: "failed",
        note: `escrow #${trigger.id} refunded: deadline rule`,
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
      className="instrument-main instrument-section order-1"
      layout={!reduced}
    >
      <div className="flex items-center justify-between">
        <h3 className="display text-[20px] text-ink">Attest escrow #{trigger.id.toString()}</h3>
        {/* stroke-drawn status mark */}
        <svg viewBox="0 0 32 32" className="h-7 w-7">
          <circle cx="16" cy="16" r="13" fill="none" stroke={expired ? "var(--ember)" : "var(--sand)"} strokeWidth="1.6" />
          <motion.path
            d="M 16 8 v 8 l 5 3"
            stroke={expired ? "var(--ember)" : "var(--accent)"}
            strokeWidth="1.8" fill="none" strokeLinecap="round"
            animate={reduced ? undefined : { rotate: expired ? 0 : [0, 360] }}
            transition={reduced ? undefined : { duration: 24, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "16px 16px" }}
          />
        </svg>
      </div>
      <div className="mt-4 space-y-3">
        <Field label="Attester secret (demo signer)" hint="S… or 64-hex seed">
          <TextInput type="password" autoComplete="off" spellCheck={false} value={secret} onChange={(e) => setSecret(e.target.value)} className="font-mono text-[12px]" placeholder="S…" />
        </Field>
        <div className="instrument-actions">
          {!expired ? (
            <FilledButton transaction onClick={() => void attest()} disabled={busy !== null || (!IS_MOCK && !wallet.address)}>
              {busy === "attest" ? "Verifying…" : "Attest the condition"}
            </FilledButton>
          ) : (
            <GhostButton transaction onClick={() => void refund()} disabled={busy !== null || (!IS_MOCK && !wallet.address)}>
              {busy === "refund" ? "Refunding…" : "Refund to funder (deadline passed)"}
            </GhostButton>
          )}
          {!expired && (
            <GhostButton transaction onClick={() => void refund()} disabled={busy !== null || (!IS_MOCK && !wallet.address)}>
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
    <div className="instrument-section">
      <div className="border-b px-6 py-4 font-mono text-[10px] uppercase tracking-[0.16em] text-muted" style={{ borderColor: "var(--hairline)" }}>
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
                className="ml-auto font-mono text-[10px] uppercase tracking-[0.14em]"
                style={{
                  color:
                    e.status === "executed" ? "var(--olive)" : e.status === "failed" ? "var(--ember)" : "var(--muted)",
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
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{k}</span>
      <span className="tnum font-mono text-[12px] text-ink">{v}</span>
    </div>
  );
}
