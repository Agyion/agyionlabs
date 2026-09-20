"use client";

/**
 * PodPanel — time capsule (§5).
 *
 * Create: amount + unlock date + hidden key generator (the preimage is shown
 * once; only its sha256 hash goes on-chain). Claim: enter the preimage after
 * the horizon. Visualization: a strata cross-section — the pod sits at depth,
 * the unlock horizon rises as time passes.
 */

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { getClient, mockClient, SECONDS_PER_LEDGER } from "../../lib/client";
import { humanizeError } from "../../lib/errors";
import { sha256Hex, POD_STATE, type Pod } from "../../lib/hakClient";
import { useLedger } from "../../lib/useLedger";
import { formatMinor, formatRemaining, parseMinor, shortAddress, shortHex } from "../../lib/format";
import { logEntry } from "../../lib/ledgerLog";
import { demoAddress } from "../../lib/wallet";
import type { WalletState } from "../../lib/useWallet";
import { CONFIG, IS_MOCK } from "../../lib/config";
import { ErrorNote, Eyebrow, Field, FilledButton, GhostButton, OkNote, TextInput } from "../ui";

function randomPreimage(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export default function PodPanel({ wallet }: { wallet: WalletState }) {
  const [pods, setPods] = useState<Pod[]>([]);
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
    if (IS_MOCK) setPods((await mockClient()?.listPods()) ?? []);
  };
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.address]);

  return (
    <div className="space-y-10">
      <header>
        <Eyebrow>Pod · time capsule</Eyebrow>
        <h1 className="display mt-2 text-[34px] text-ink md:text-[44px]">Buried money, a dated key</h1>
        <p className="mt-3 max-w-[64ch] text-[16px] leading-[1.65] text-muted">
          Lock funds until a future ledger. The capsule opens only for the
          preimage whose hash was buried with it — show the secret early and the
          contract stays silent.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <CreatePod
            wallet={wallet}
            onCreated={() => void refresh()}
            setError={setError}
            setNotice={setNotice}
          />
        </div>

        <div className="lg:col-span-7">
          {!IS_MOCK && <LoadPod onLoaded={(p) => setPods((cur) => [p, ...cur.filter((x) => x.id !== p.id)])} />}
          {pods.length === 0 ? (
            <p className="rounded-xl border p-6 text-[14px] text-muted" style={{ borderColor: "var(--hairline)" }}>
              No pods yet. Bury one on the left — the strata will draw itself here.
            </p>
          ) : (
            <div className="space-y-6">
              {pods.map((p) => (
                <PodCard
                  key={p.id.toString()}
                  pod={p}
                  ledger={ledger}
                  wallet={wallet}
                  onChanged={() => void refresh()}
                  setError={setError}
                  setNotice={setNotice}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      {notice && <OkNote>{notice}</OkNote>}
    </div>
  );
}

function CreatePod({
  wallet,
  onCreated,
  setError,
  setNotice,
}: {
  wallet: WalletState;
  onCreated: () => void;
  setError: (e: string | null) => void;
  setNotice: (n: string | null) => void;
}) {
  const [amount, setAmount] = useState("500");
  const [minutes, setMinutes] = useState("5");
  const [preimage, setPreimage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const client = getClient();
      const pre = randomPreimage();
      const hash = await sha256Hex(pre);
      const now = await client.currentLedger();
      const unlock = now + Math.max(10, Math.round((Number(minutes) * 60) / SECONDS_PER_LEDGER));
      const id = await client.create_pod(
        wallet.address ?? demoAddress(),
        CONFIG.assetContractId,
        parseMinor(amount),
        unlock,
        hash,
      );
      setPreimage(pre);
      logEntry({
        ledger: now,
        template: "pod",
        action: "create_pod",
        refId: id.toString(),
        amount: parseMinor(amount).toString(),
        status: "locked",
        detail: `buried until ledger ${unlock} (~${minutes}m)`,
        txHash: null,
      });
      setNotice(`Pod #${id} buried. Save the preimage — only its hash is on-chain.`);
      onCreated();
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border bg-cream p-6" style={{ borderColor: "var(--hairline)" }}>
      <h2 className="display text-[24px] text-ink">Bury a Pod</h2>
      <div className="mt-5 space-y-4">
        <Field label={`Amount (${CONFIG.assetCode})`}>
          <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="Unlock in (minutes)" hint="Converted to a ledger height at creation">
          <TextInput value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" />
        </Field>
      </div>
      {preimage && (
        <div className="mt-4 rounded-lg border p-4" style={{ borderColor: "var(--accent)" }}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--accent)" }}>
            Your preimage — shown once
          </div>
          <div className="tnum mt-1 break-all font-mono text-[13px] text-ink">{preimage}</div>
          <p className="mt-2 text-[12px] text-muted">
            Whoever presents this after the horizon opens the pod. The chain
            stores only sha256(preimage).
          </p>
        </div>
      )}
      <div className="mt-5">
        <FilledButton onClick={() => void create()} disabled={busy}>
          {busy ? "Burying…" : "Bury the pod"}
        </FilledButton>
      </div>
    </div>
  );
}

function LoadPod({ onLoaded }: { onLoaded: (p: Pod) => void }) {
  const [id, setId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="mb-6 flex items-end gap-2">
      <Field label="Load pod by id">
        <TextInput value={id} onChange={(e) => setId(e.target.value)} inputMode="numeric" className="w-[160px]" />
      </Field>
      <GhostButton
        onClick={() => {
          setErr(null);
          getClient()
            .get_pod(BigInt(id.trim()))
            .then((p) => (p ? onLoaded(p) : setErr("not found")))
            .catch((e) => setErr(humanizeError(e)));
        }}
      >
        Load
      </GhostButton>
      {err && <span className="text-[13px]" style={{ color: "#8F4E2A" }}>{err}</span>}
    </div>
  );
}

function PodCard({
  pod,
  ledger,
  wallet,
  onChanged,
  setError,
  setNotice,
}: {
  pod: Pod;
  ledger: number | null;
  wallet: WalletState;
  onChanged: () => void;
  setError: (e: string | null) => void;
  setNotice: (n: string | null) => void;
}) {
  const reduced = useReducedMotion();
  const [preimage, setPreimage] = useState("");
  const [busy, setBusy] = useState(false);

  const opened = pod.state === POD_STATE.Opened;
  const buriedAt = pod.unlock_ledger - 100; // visual anchor
  const progress =
    ledger == null ? 0 : Math.min(1, Math.max(0, (ledger - buriedAt) / Math.max(1, pod.unlock_ledger - buriedAt)));
  const unlocked = ledger != null && ledger >= pod.unlock_ledger;
  const secondsLeft = ledger == null ? 0 : Math.max(0, (pod.unlock_ledger - ledger) * SECONDS_PER_LEDGER);

  const claim = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await getClient().claim_pod(pod.id, preimage.trim(), wallet.address ?? demoAddress());
      logEntry({
        ledger,
        template: "pod",
        action: "claim_pod",
        refId: pod.id.toString(),
        amount: pod.amount.toString(),
        status: "executed",
        detail: "preimage matched — capsule opened",
        txHash: null,
      });
      setNotice(`Pod #${pod.id} opened — ${formatMinor(pod.amount)} ${CONFIG.assetCode} released.`);
      onChanged();
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-cream" style={{ borderColor: "var(--hairline)" }}>
      <div className="grid grid-cols-1 md:grid-cols-12">
        {/* strata cross-section */}
        <div className="relative min-h-[220px] md:col-span-5">
          <svg viewBox="0 0 260 220" className="absolute inset-0 h-full w-full">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <path
                key={i}
                d={`M 0 ${70 + i * 26} C 80 ${64 + i * 26}, 180 ${76 + i * 26}, 260 ${70 + i * 26}`}
                stroke="var(--sand)"
                strokeWidth="1.5"
                fill="none"
                opacity={0.35 + i * 0.13}
              />
            ))}
            {/* unlock horizon — rises as time passes */}
            <motion.line
              x1="0" x2="260"
              stroke="var(--accent)"
              strokeWidth="1.6"
              initial={false}
              animate={{ y1: 190 - progress * 160, y2: 190 - progress * 160 }}
              transition={{ duration: reduced ? 0 : 0.6, ease: [1, 0, 0.3, 0.93] }}
            />
            {/* the pod at depth */}
            <g transform={`translate(130, ${opened ? 60 : 150})`}>
              <motion.ellipse
                rx="16" ry="24" fill="none"
                stroke={opened ? "#6B7256" : "var(--accent)"}
                strokeWidth="2"
                animate={opened && !reduced ? { y: [-4, 0] } : undefined}
              />
              <line x1="-9" y1="0" x2="9" y2="0" stroke={opened ? "#6B7256" : "var(--accent)"} strokeWidth="1.5" />
            </g>
          </svg>
          <div className="absolute left-4 top-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            strata · depth {Math.round((1 - progress) * 100)}%
          </div>
        </div>

        {/* data + claim */}
        <div className="p-6 md:col-span-7">
          <div className="flex items-baseline justify-between">
            <h3 className="display text-[22px] text-ink">Pod #{pod.id.toString()}</h3>
            <span
              className="text-[11px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: opened ? "#6B7256" : "var(--accent)" }}
            >
              {opened ? "opened" : unlocked ? "at horizon" : "buried"}
            </span>
          </div>
          <div className="mt-4 space-y-2 font-mono text-[13px]">
            <Row k="amount" v={`${formatMinor(pod.amount)} ${CONFIG.assetCode}`} />
            <Row k="unlock ledger" v={pod.unlock_ledger.toString()} />
            <Row k="remaining" v={unlocked ? "now" : formatRemaining(secondsLeft)} />
            <Row k="funder" v={shortAddress(pod.funder)} />
            <Row k="key hash" v={shortHex(pod.key_hash)} />
          </div>
          {!opened && (
            <div className="mt-5 space-y-3">
              <Field label="Preimage" hint={unlocked ? "Horizon reached — present the secret" : "Early attempts fail by rule"}>
                <TextInput
                  value={preimage}
                  onChange={(e) => setPreimage(e.target.value)}
                  className="font-mono text-[12px]"
                  placeholder="the 32-char hex secret"
                />
              </Field>
              {unlocked ? (
                <FilledButton onClick={() => void claim()} disabled={busy || !preimage.trim()}>
                  {busy ? "Opening…" : "Open the pod"}
                </FilledButton>
              ) : (
                <GhostButton onClick={() => void claim()} disabled={busy || !preimage.trim()}>
                  Try early — the contract will refuse
                </GhostButton>
              )}
            </div>
          )}
        </div>
      </div>
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
