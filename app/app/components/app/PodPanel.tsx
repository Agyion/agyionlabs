"use client";

/**
 * PodPanel — time capsule (§5).
 *
 * Create: amount + unlock date + hidden key generator (the preimage is shown
 * once; only its sha256 hash goes on-chain). Claim: enter the preimage after
 * the horizon. Readiness comes from the confirmed ledger and recipient commitment.
 */

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { InstrumentActivity } from "../../lib/instrumentActivity";
import { getClient, mockClient, SECONDS_PER_LEDGER } from "../../lib/client";
import { humanizeError } from "../../lib/errors";
import { sha256Hex, POD_STATE, type Pod } from "../../lib/hakClient";
import { useLedger } from "../../lib/useLedger";
import { formatMinor, formatRemaining, parseMinor, shortAddress, shortHex } from "../../lib/format";
import { logEntry } from "../../lib/ledgerLog";
import { demoAddress } from "../../lib/wallet";
import { podClaimCommitment } from "../../lib/signers";
import type { WalletState } from "../../lib/useWallet";
import { CONFIG, IS_MOCK } from "../../lib/config";
import { ErrorNote, Field, FilledButton, GhostButton, OkNote, StateChip, TextInput } from "../ui";
import { RecordLoader, WalletPrerequisite } from "./panelControls";
import { durationLedgers, ledgerDeadline } from "./panelValidation";
import { DraftSummary, PodSeal, draftAmount, draftDelay } from "./instrumentPresentation";

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
    // Re-resolve the shared client when its wallet signer changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.address]);
  const ledger = useLedger(client);

  const upsert = (pod: Pod) => setPods((cur) => [pod, ...cur.filter((item) => item.id !== pod.id)]);
  const refresh = async (id?: bigint) => {
    try {
      if (IS_MOCK) setPods((await mockClient()?.listPods()) ?? []);
      else if (id != null) {
        const fresh = await getClient().get_pod(id);
        if (!fresh) throw new Error("The record is not available yet.");
        upsert(fresh);
      }
    } catch (e) {
      setError(`Could not refresh Pod #${id}. Load it by ID to retry. ${humanizeError(e)}`);
    }
  };
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.address]);

  return (
    <div className="instrument-panel panel-pod">
      <WalletPrerequisite address={wallet.address} />
          <CreatePod
            wallet={wallet}
            onCreated={(id) => void refresh(id)}
            setError={setError}
            setNotice={setNotice}
          />
      <div className="instrument-feedback">
        {error && <ErrorNote>{error}</ErrorNote>}
        {notice && <OkNote>{notice}</OkNote>}
      </div>
      <section className="instrument-records">
          <header><h3>Pods</h3></header>
          {!IS_MOCK && <RecordLoader name="Pod" load={(id) => getClient().get_pod(id)} onLoaded={upsert} />}
          {pods.length === 0 ? (
            <p className="instrument-empty">{IS_MOCK ? "No Pods created in this browser." : "No Pods loaded."}</p>
          ) : (
            <div className="space-y-6">
              {pods.map((p) => (
                <PodCard
                  key={p.id.toString()}
                  pod={p}
                  ledger={ledger}
                  wallet={wallet}
                  onChanged={() => void refresh(p.id)}
                  setError={setError}
                  setNotice={setNotice}
                />
              ))}
            </div>
          )}
      </section>
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
  onCreated: (id: bigint) => void;
  setError: (e: string | null) => void;
  setNotice: (n: string | null) => void;
}) {
  const [amount, setAmount] = useState("500");
  const [minutes, setMinutes] = useState("5");
  const [preimage, setPreimage] = useState<string | null>(null);
  const [secretSaved, setSecretSaved] = useState(false);
  const [replaceSaved, setReplaceSaved] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [createdId, setCreatedId] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const submissionAttempted = useRef(false);

  const prepare = () => {
    if (busy || (preimage && (!submitted || !replaceSaved))) return;
    try {
      setPreimage(randomPreimage());
      setSecretSaved(false);
      setReplaceSaved(false);
      setSubmitted(false);
      setCreatedId(null);
      submissionAttempted.current = false;
      setError(null);
      setNotice(null);
    } catch (e) {
      setError(humanizeError(e));
    }
  };

  const create = async () => {
    if (!preimage || !secretSaved || submissionAttempted.current || busy || (!IS_MOCK && !wallet.address)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const duration = durationLedgers(minutes, "Unlock time", 10);
      const amountMinor = parseMinor(amount);
      const client = getClient();
      const hash = await sha256Hex(preimage);
      const now = await client.currentLedger();
      const unlock = ledgerDeadline(now, duration, "Unlock time");
      // A timeout can leave a confirmed transaction. Never silently retry this secret.
      submissionAttempted.current = true;
      setSubmitted(true);
      const id = await client.create_pod(
        wallet.address ?? demoAddress(),
        CONFIG.assetContractId,
        amountMinor,
        unlock,
        hash,
      );
      setCreatedId(id);
      setNotice(`Pod #${id} buried. Keep its saved preimage — only its hash is on-chain.`);
      logEntry({
        ledger: now,
        template: "pod",
        action: "create_pod",
        refId: id.toString(),
        amount: amountMinor.toString(),
        status: "locked",
        detail: `buried until ledger ${unlock} (~${minutes}m)`,
        txHash: null,
      });
      onCreated(id);
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="instrument-layout">
    <section className="instrument-main instrument-section">
      <header><h3>Bury a Pod</h3></header>
      <div className="instrument-fields">
        <Field label={`Amount (${CONFIG.assetCode})`}>
          <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" disabled={busy || submitted} />
        </Field>
        <Field label="Unlock in (minutes)" hint="Converted to a ledger height at creation">
          <TextInput value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" disabled={busy || submitted} />
        </Field>
      </div>
      {preimage && (
        <div className="pod-secret-vault">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: "var(--accent)" }}>
            Your preimage — save before submitting
          </div>
          <TextInput aria-label="Generated Pod secret" value={preimage} readOnly autoComplete="off" spellCheck={false} className="mt-2" />
          <p className="mt-2 text-[12px] text-muted">
            Save this secret outside the app. Reloading or changing wallets clears
            this draft. Anyone with the secret can claim after unlock; never reuse it.
          </p>
          <label className="mt-3 flex items-start gap-2 text-[12px] text-ink">
            <input type="checkbox" checked={secretSaved} onChange={(event) => setSecretSaved(event.target.checked)} disabled={busy || submitted} className="mt-0.5" />
            I saved this secret outside this page.
          </label>
          {submitted && !busy && (
            <div className="mt-4 space-y-3">
              <p className="text-[12px] text-muted">
                {createdId != null ? `Keep this secret for Pod #${createdId}.` : "The submission may still confirm. Keep this secret and check your wallet transaction history before creating another Pod."}
              </p>
              <label className="flex items-start gap-2 text-[12px] text-ink">
                <input type="checkbox" checked={replaceSaved} onChange={(event) => setReplaceSaved(event.target.checked)} className="mt-0.5" />
                I saved this secret and checked the previous transaction status.
              </label>
              <GhostButton onClick={prepare} disabled={!replaceSaved}>Prepare another Pod</GhostButton>
            </div>
          )}
        </div>
      )}
      <div className="instrument-actions">
        {!preimage && <GhostButton onClick={prepare}>Prepare pod secret</GhostButton>}
        <FilledButton transaction onClick={() => void create()} disabled={busy || submitted || !secretSaved || !preimage || (!IS_MOCK && !wallet.address)}>
          {busy ? "Burying…" : "Bury the pod"}
        </FilledButton>
      </div>
    </section>
    <DraftSummary title="Unlock conditions" visual={<PodSeal prepared={Boolean(preimage)} saved={secretSaved} />} rows={[
      { label: "Amount to lock", value: draftAmount(amount) },
      { label: "Unlock after", value: draftDelay(minutes, "Unlock time", 10) },
      ...(createdId != null ? [{ label: "Created Pod", value: `#${createdId}` }] : []),
    ]} />
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
  const active = useContext(InstrumentActivity);
  const [preimage, setPreimage] = useState("");
  const [busy, setBusy] = useState<"commit" | "claim" | null>(null);
  const [commitment, setCommitment] = useState<{ commitment: string; committed_at: number } | null>(null);
  const [confirmedLedger, setConfirmedLedger] = useState<number | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  const opened = pod.state === POD_STATE.Opened;
  const recipient = wallet.address ?? (IS_MOCK ? demoAddress() : null);
  const expectedCommitment = useMemo(() => {
    if (!recipient || !preimage.trim()) return null;
    try { return podClaimCommitment(pod.id, recipient, preimage.trim()); }
    catch { return null; }
  }, [pod.id, recipient, preimage]);

  const refreshClaimStatus = useCallback(async () => {
    if (!recipient || opened) return;
    try {
      const client = getClient();
      const [record, height] = await Promise.all([
        client.get_pod_claim_commitment(pod.id, recipient), client.currentLedger(),
      ]);
      setCommitment(record);
      setConfirmedLedger(height);
      setClaimError(null);
    } catch (e) {
      setConfirmedLedger(null);
      setClaimError(`Could not refresh claim status. ${humanizeError(e)}`);
    }
  }, [pod.id, recipient, opened]);

  useEffect(() => {
    setCommitment(null);
    setConfirmedLedger(null);
    if (!active || !recipient || opened) return;
    void refreshClaimStatus();
    const timer = window.setInterval(() => void refreshClaimStatus(), 5_000);
    return () => window.clearInterval(timer);
  }, [active, recipient, opened, refreshClaimStatus]);

  const commitmentMatches = Boolean(expectedCommitment && commitment?.commitment === expectedCommitment);
  const claimReady = commitmentMatches && confirmedLedger != null && commitment != null
    && confirmedLedger > commitment.committed_at && confirmedLedger >= pod.unlock_ledger;

  const commit = async () => {
    if (!recipient || !expectedCommitment) return;
    setBusy("commit");
    setError(null);
    setNotice(null);
    setClaimError(null);
    try {
      await getClient().commit_pod_claim(pod.id, recipient, expectedCommitment);
      setNotice(`Claim committed for Pod #${pod.id}. Keep the preimage in this input; opening requires a later confirmed ledger.`);
      await refreshClaimStatus();
    } catch (e) {
      setClaimError(humanizeError(e));
    } finally {
      setBusy(null);
    }
  };
  const unlocked = ledger != null && ledger >= pod.unlock_ledger;
  const secondsLeft = ledger == null ? 0 : Math.max(0, (pod.unlock_ledger - ledger) * SECONDS_PER_LEDGER);

  const claim = async () => {
    setBusy("claim");
    setError(null);
    setNotice(null);
    try {
      if (!recipient || !expectedCommitment) throw new Error("Enter the preimage and connect the recipient wallet first.");
      const client = getClient();
      const [record, height] = await Promise.all([
        client.get_pod_claim_commitment(pod.id, recipient), client.currentLedger(),
      ]);
      setCommitment(record);
      setConfirmedLedger(height);
      if (record?.commitment !== expectedCommitment) throw new Error("Commit this claim for the connected recipient before opening the capsule.");
      if (height <= record.committed_at) throw new Error("Wait for the next confirmed ledger before opening the capsule.");
      if (height < pod.unlock_ledger) throw new Error("The capsule has not reached its unlock ledger yet.");
      await client.claim_pod(pod.id, preimage.trim(), recipient);
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
      setBusy(null);
    }
  };

  return (
    <div className="instrument-record">
      <div className="instrument-layout">
        <aside className="instrument-aside pod-readiness order-2" aria-label={`Pod ${pod.id} opening conditions`}>
          <div className="pod-readiness__seal" data-open={opened} aria-hidden="true">
            <svg viewBox="0 0 320 240"><ellipse cx="160" cy="120" rx="120" ry="78" className="diagram-guide"/><path d="m127 65 33-18 33 18v110l-33 18-33-18Z" className="diagram-body"/><path d="m127 65 33 18 33-18m-33 18v110M127 108l33 18 33-18" className="diagram-line"/><g className="pod-readiness__rings"><ellipse cx="160" cy="98" rx="76" ry="25"/><ellipse cx="160" cy="142" rx="76" ry="25"/></g><path d="M29 120h51m160 0h51" className="diagram-guide"/></svg>
          </div>
          <h4>{opened ? "Capsule opened" : claimReady ? "Ready to open" : "Opening conditions"}</h4>
          <ul>
            <li data-met={unlocked || opened}><span>Unlock ledger</span><strong>{opened || unlocked ? "Reached" : ledger == null ? "Checking…" : "Waiting"}</strong></li>
            <li data-met={Boolean(preimage.trim()) || opened}><span>Secret</span><strong>{opened ? "Revealed" : preimage.trim() ? "Entered" : "Required"}</strong></li>
            <li data-met={commitmentMatches && confirmedLedger != null && commitment != null && confirmedLedger > commitment.committed_at || opened}><span>Recipient commitment</span><strong>{opened ? "Verified" : commitmentMatches ? "Committed" : "Required"}</strong></li>
          </ul>
          {!opened && <p>The contract verifies the secret when you open.</p>}
        </aside>

        {/* data + claim */}
        <div className="instrument-main instrument-section order-1">
          <div className="flex items-baseline justify-between">
            <h3 className="display text-[20px] text-ink">Pod #{pod.id.toString()}</h3>
            <StateChip
              live={!opened && !unlocked}
              color={opened ? "var(--olive)" : "var(--accent)"}
            >
              {opened ? "opened" : unlocked ? "at horizon" : "buried"}
            </StateChip>
          </div>
          <div className="mt-4 space-y-2 font-mono text-[13px]">
            <Row k="amount" v={`${formatMinor(pod.amount)} ${CONFIG.assetCode}`} />
            <Row k="unlock ledger" v={pod.unlock_ledger.toString()} />
            <Row k="remaining" v={ledger == null ? "Unavailable" : unlocked ? "Reached" : `~${formatRemaining(secondsLeft)}`} />
            <details className="instrument-technical"><summary>Record details</summary><Row k="funder" v={shortAddress(pod.funder)} /><Row k="key hash" v={shortHex(pod.key_hash)} /></details>
          </div>
          {!opened && (
            <div className="mt-5 space-y-3">
              <Field label="Preimage" hint="Commit its digest first. The secret is sent only when you open the capsule.">
                <TextInput
                  value={preimage}
                  onChange={(e) => setPreimage(e.target.value)}
                  className="font-mono text-[12px]"
                  placeholder="the 32-char hex secret"
                  disabled={busy !== null}
                />
              </Field>
              <div className="instrument-actions">
                <GhostButton transaction onClick={() => void commit()} disabled={busy !== null || !expectedCommitment || commitmentMatches}>
                  {busy === "commit" ? "Committing…" : "Commit claim"}
                </GhostButton>
                <FilledButton transaction onClick={() => void claim()} disabled={busy !== null || !claimReady || !recipient}>
                  {busy === "claim" ? "Opening…" : "Open capsule"}
                </FilledButton>
              </div>
              <p role="status" className="text-[12px] leading-relaxed text-muted">
                {!commitmentMatches ? "Step 1: commit this claim for your recipient wallet without revealing the preimage."
                  : confirmedLedger == null ? "Checking the confirmed ledger. Refresh the claim status before opening."
                    : commitment && confirmedLedger <= commitment.committed_at ? "Claim committed. Waiting for the next confirmed ledger; status refreshes every 5 seconds."
                      : confirmedLedger < pod.unlock_ledger ? `Claim committed. The capsule unlocks at ledger ${pod.unlock_ledger}.`
                        : "Step 2: the claim is ready. Open the capsule with the same wallet and preimage."}
              </p>
              <GhostButton onClick={() => void refreshClaimStatus()} disabled={busy !== null || !recipient}>Refresh claim status</GhostButton>
              {claimError && <ErrorNote>{claimError}</ErrorNote>}
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
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{k}</span>
      <span className="tnum font-mono text-[12px] text-ink">{v}</span>
    </div>
  );
}
