"use client";

/**
 * PodPanel — time capsule (§5).
 *
 * Create: a saved random credential proves key possession. Claim: sign the Pod
 * and connected recipient locally; only the public key and signatures reach RPC.
 */

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { InstrumentActivity } from "../../lib/instrumentActivity";
import { getClient, mockClient, SECONDS_PER_LEDGER } from "../../lib/client";
import { humanizeError } from "../../lib/errors";
import { POD_STATE, type Pod } from "../../lib/hakClient";
import { useLedger } from "../../lib/useLedger";
import { formatMinor, formatRemaining, parseMinor, shortAddress, shortHex } from "../../lib/format";
import { logEntry } from "../../lib/ledgerLog";
import { demoAddress, onWalletSessionChange, walletSessionVersion } from "../../lib/wallet";
import { newPodSeed, podPublicKey, signPodCreation, signPodClaim } from "../../lib/signers";
import type { WalletState } from "../../lib/useWallet";
import { CONFIG, IS_MOCK } from "../../lib/config";
import { ErrorNote, Field, FilledButton, GhostButton, OkNote, StateChip, TextInput } from "../ui";
import { RecordLoader, WalletPrerequisite } from "./panelControls";
import { durationLedgers, ledgerDeadline } from "./panelValidation";
import { DraftSummary, PodSeal, draftAmount, draftDelay } from "./instrumentPresentation";

/** Invalidate pending local work and clear credentials on close, wallet change or unmount. */
function usePodSecretLifetime(address: string | null, clear: () => void) {
  const active = useContext(InstrumentActivity);
  const generation = useRef(0);
  const activeRef = useRef(active); activeRef.current = active;
  useEffect(() => {
    generation.current += 1; clear();
    return () => { generation.current += 1; };
  }, [active, address, clear]);
  useEffect(() => onWalletSessionChange(() => { generation.current += 1; clear(); }), [clear]);
  return () => {
    const epoch = generation.current, session = walletSessionVersion();
    return () => activeRef.current && generation.current === epoch && walletSessionVersion() === session;
  };
}

export default function PodPanel({ wallet }: { wallet: WalletState }) {
  const [sessionVersion, setSessionVersion] = useState(walletSessionVersion);
  useEffect(() => onWalletSessionChange(() => setSessionVersion(walletSessionVersion())), []);
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
  }, [wallet.address, sessionVersion]);
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
  const [seed, setSeed] = useState<string | null>(null);
  const [secretSaved, setSecretSaved] = useState(false);
  const [replaceSaved, setReplaceSaved] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [createdId, setCreatedId] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const submissionAttempted = useRef(false);
  const clearSecret = useCallback(() => {
    setSeed(null); setSecretSaved(false); setReplaceSaved(false); setSubmitted(false);
    setCreatedId(null); setBusy(false); submissionAttempted.current = false;
  }, []);
  const begin = usePodSecretLifetime(wallet.address, clearSecret);


  const prepare = () => {
    if (busy || (seed && (!submitted || !replaceSaved))) return;
    try {
      setSeed(newPodSeed());
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
    if (!seed || !secretSaved || submissionAttempted.current || busy || (!IS_MOCK && !wallet.address)) return;
    const current = begin();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const duration = durationLedgers(minutes, "Unlock time", 10);
      const amountMinor = parseMinor(amount);
      const client = getClient();
      const now = await client.currentLedger();
      const unlock = ledgerDeadline(now, duration, "Unlock time");
      if (!current()) return;
      const funder = wallet.address ?? demoAddress();
      const claimPubkey = podPublicKey(seed);
      const keyProof = signPodCreation(seed, funder, CONFIG.assetContractId, amountMinor, unlock);
      // A timeout can leave a confirmed transaction. Never silently retry this secret.
      submissionAttempted.current = true;
      setSubmitted(true);
      const id = await client.create_pod(
        funder,
        CONFIG.assetContractId,
        amountMinor,
        unlock,
        claimPubkey,
        keyProof,
      );
      if (!current()) return;
      setCreatedId(id);
      setNotice(`Pod #${id} buried. Keep the saved secret; its public key is on-chain.`);
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
      if (current()) setError(humanizeError(e));
    } finally {
      if (current()) setBusy(false);
    }
  };

  return (
    <div className="instrument-layout">
    <section className="instrument-main instrument-section">
      <header><h3>Bury a Pod</h3></header>
      <p className="instrument-disclosure">Amounts and addresses are public. Your secret stays on this device and signs each claim.</p>
      <div className="instrument-fields">
        <Field label={`Amount (${CONFIG.assetCode})`}>
          <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" disabled={busy || submitted} />
        </Field>
        <Field label="Unlock in (minutes)" hint="Converted to a ledger height at creation">
          <TextInput value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" disabled={busy || submitted} />
        </Field>
      </div>
      {seed && (
        <div className="pod-secret-vault">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: "var(--accent)" }}>
            Your Pod secret — save before submitting
          </div>
          <TextInput aria-label="Generated Pod secret" value={seed} readOnly autoComplete="off" spellCheck={false} className="mt-2" />
          <p className="mt-2 text-[12px] text-muted">
            Save this secret outside the app. Closing, reloading or changing wallets clears
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
        {!seed && <GhostButton onClick={prepare}>Prepare pod secret</GhostButton>}
        <FilledButton transaction onClick={() => void create()} disabled={busy || submitted || !secretSaved || !seed || (!IS_MOCK && !wallet.address)}>
          {busy ? "Burying…" : "Bury the pod"}
        </FilledButton>
      </div>
    </section>
    <DraftSummary title="Unlock conditions" visual={<PodSeal prepared={Boolean(seed)} saved={secretSaved} />} rows={[
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
  const [seed, setSeed] = useState("");
  const [busy, setBusy] = useState(false);
  const clearSecret = useCallback(() => { setSeed(""); setBusy(false); }, []);
  const begin = usePodSecretLifetime(wallet.address, clearSecret);
  const opened = pod.state === POD_STATE.Opened;
  const recipient = wallet.address ?? (IS_MOCK ? demoAddress() : null);
  const matches = useMemo(() => {
    try { return podPublicKey(seed.trim()) === pod.claim_pubkey; } catch { return false; }
  }, [seed, pod.claim_pubkey]);
  const unlocked = ledger != null && ledger >= pod.unlock_ledger;
  const claimReady = unlocked && matches && !!recipient;
  const secondsLeft = ledger == null ? 0 : Math.max(0, (pod.unlock_ledger - ledger) * SECONDS_PER_LEDGER);
  const claim = async () => {
    if (busy || !claimReady || !recipient) return;
    const current = begin();
    setBusy(true); setError(null); setNotice(null);
    try {
      const client = getClient();
      const height = await client.currentLedger();
      if (!current()) return;
      if (height < pod.unlock_ledger) throw new Error("The capsule has not reached its unlock ledger yet.");
      const signature = signPodClaim(seed.trim(), pod.id, recipient);
      await client.claim_pod(pod.id, recipient, signature);
      if (!current()) return;
      setSeed("");
      logEntry({ ledger: height, template: "pod", action: "claim_pod", refId: pod.id.toString(),
        amount: pod.amount.toString(), status: "executed", detail: "recipient-bound signature verified — capsule opened", txHash: null });
      setNotice(`Pod #${pod.id} opened — ${formatMinor(pod.amount)} ${CONFIG.assetCode} released.`);
      onChanged();
    } catch (e) { if (current()) setError(humanizeError(e)); }
    finally { if (current()) setBusy(false); }
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
            <li data-met={matches || opened}><span>Secret</span><strong>{opened ? "Verified" : matches ? "Matches" : "Required"}</strong></li>
            <li data-met={!!recipient || opened}><span>Recipient wallet</span><strong>{opened ? "Verified" : recipient ? "Connected" : "Required"}</strong></li>
          </ul>
          {!opened && <p>The contract verifies a signature bound to this Pod and recipient.</p>}
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
            <details className="instrument-technical"><summary>Record details</summary><Row k="funder" v={shortAddress(pod.funder)} /><Row k="claim public key" v={shortHex(pod.claim_pubkey)} /></details>
          </div>
          {!opened && (
            <div className="mt-5 space-y-3">
              <Field label="Pod secret" hint="The saved 64-character hex secret. It signs locally and is never sent to RPC.">
                <TextInput type="password" value={seed} onChange={(e) => setSeed(e.target.value)} className="font-mono text-[12px]"
                  placeholder="the saved 64-char hex secret" disabled={busy} autoComplete="off" spellCheck={false} />
              </Field>
              <div className="instrument-actions">
                <FilledButton transaction onClick={() => void claim()} disabled={busy || !claimReady}>
                  {busy ? "Opening…" : "Open capsule"}
                </FilledButton>
              </div>
              {seed.trim() && !matches && <p className="text-[12px] text-muted">This secret does not match the Pod’s public key.</p>}

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
