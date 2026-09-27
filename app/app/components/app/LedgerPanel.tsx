"use client";

/**
 * LedgerPanel — the user's own history (§5).
 *
 * IBM Plex Mono table, 1px hairlines, no zebra striping. Status chips are
 * text-only in lifecycle colors. Rows expand inline into the detail.
 * Proof Pack: signed JSON export (checksum + ed25519 signature when a test
 * secret is active).
 */

import { useContext, useEffect, useState } from "react";
import { InstrumentActivity } from "../../lib/instrumentActivity";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  buildProofPack,
  clearLog,
  downloadProofPack,
  listEntries,
  entryRecordHref,
  type LedgerEntry,
} from "../../lib/ledgerLog";
import { formatMinor } from "../../lib/format";
import type { WalletState } from "../../lib/useWallet";
import { CONFIG, IS_MOCK } from "../../lib/config";
import { humanizeError } from "../../lib/errors";
import { ErrorNote, GhostButton, OkNote, StatusChip } from "../ui";
import { InstrumentNote } from "./instrumentPresentation";

export default function LedgerPanel({ wallet }: { wallet: WalletState }) {
  const active = useContext(InstrumentActivity);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!active) return;
    setEntries(listEntries());
    const sync = () => setEntries(listEntries());
    const t = setInterval(sync, 3_000);
    window.addEventListener("agyion:record", sync);
    window.addEventListener("storage", sync);
    return () => { clearInterval(t); window.removeEventListener("agyion:record", sync); window.removeEventListener("storage", sync); };
  }, [active]);

  const exportPack = async () => {
    setExporting(true);
    setError(null);
    setNotice(null);
    try {
      const pack = await buildProofPack(wallet.address);
      downloadProofPack(pack);
      setNotice(pack.signature
        ? `Proof Pack downloaded: signed by ${pack.signer?.slice(0, 8)}… (checksum ${pack.checksum.slice(0, 12)}…)`
        : "Proof Pack downloaded: unsigned local history with an integrity checksum. A connected wallet does not sign this export.");
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="ledger-workspace panel-ledger">
      <div className="ledger-toolbar">
        <h3>Activity</h3>
        <div className="ledger-toolbar-actions">
          <GhostButton onClick={() => void exportPack()} disabled={exporting}>{exporting ? "Exporting…" : "Download Proof Pack"}</GhostButton>
          <GhostButton onClick={() => {
            setError(null); setNotice(null);
            try { clearLog(); setEntries([]); }
            catch (e) { setError(humanizeError(e)); }
          }} disabled={entries.length === 0}>Clear history</GhostButton>
        </div>
      </div>
      <div className="instrument-feedback">
        {notice && <OkNote>{notice}</OkNote>}
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
      <dl className="ledger-register" aria-label="Local record summary">
        <div className="ledger-register__count"><dt>Records</dt><dd>{entries.length}</dd></div>
        <div className="ledger-register__hashes"><dt>Hashes recorded</dt><dd>{entries.filter((entry) => entry.txHash != null).length}</dd></div>
        <div className="ledger-register__source"><dt>Source</dt><dd>This browser</dd></div>
      </dl>
      {entries.length === 0 ? (
        <div className="ledger-empty">
          <svg viewBox="0 0 94 110" aria-hidden="true"><path d="M17 12h42l18 18v68H17z"/><path d="M59 12v19h18M29 47h35M29 60h35M29 73h20"/><circle cx="66" cy="82" r="17" fill="var(--surface)"/><path d="M60 82h12m-6-6v12"/></svg>
          <div><h4>No activity recorded yet</h4><Link href="/app/?tab=fade">Create a Fade <span aria-hidden="true">→</span></Link></div>
        </div>
      ) : (
        <div className="ledger-register-entries" aria-label="Recorded activity">
          <div className="ledger-column-head" aria-hidden="true"><span>Instrument / action</span><span>Entry / recorded</span><span>Amount</span><span>Status</span><span /></div>
          {entries.map(entry => <LedgerRow key={entry.seq} entry={entry} open={open === entry.seq} onToggle={() => setOpen(open === entry.seq ? null : entry.seq)} reduced={reduced ?? false} />)}
        </div>
      )}
      <p className="instrument-disclosure">Local history is not chain verification. Exports may be unsigned.</p>
      <InstrumentNote title="About Proof Packs"><p>Each export includes an integrity checksum. A signature is included only when a supported signing key is available.</p></InstrumentNote>
    </div>
  );
}

function LedgerRow({ entry, open, onToggle, reduced }: {
  entry: LedgerEntry;
  open: boolean;
  onToggle: () => void;
  reduced: boolean;
}) {
  const recordLink = entryRecordHref(entry, { network: CONFIG.networkPassphrase, contractId: CONFIG.contractId, mock: IS_MOCK });
  return (
    <article className="ledger-entry">
      <button type="button" className="ledger-entry__button" onClick={onToggle} aria-expanded={open} aria-controls={`record-detail-${entry.seq}`} aria-label={`Record ${entry.seq}: ${entry.template} ${entry.action.replaceAll("_", " ")}, ${entry.amount != null ? `${formatMinor(BigInt(entry.amount))} ${CONFIG.assetCode}, ` : ""}${entry.status}. Details`}>
        <span><strong>{entry.template} #{entry.refId}</strong><small>{entry.action.replaceAll("_", " ")}</small></span>
        <span><strong>#{entry.seq}</strong><small>{entry.ts.slice(0, 19).replace("T", " ")}</small></span>
        <span className="ledger-entry__amount">{entry.amount != null ? `${formatMinor(BigInt(entry.amount))} ${CONFIG.assetCode}` : "Not recorded"}</span>
        <span><StatusChip status={entry.status} /></span>
        <span className="ledger-entry__arrow" aria-hidden="true">+</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={`record-detail-${entry.seq}`} initial={reduced ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={reduced ? undefined : { height: 0, opacity: 0 }} transition={{ duration: .3, ease: [.22, 1, .36, 1] }} style={{ overflow: "hidden" }}>
            <dl className="ledger-entry__details">
              <div><dt>Action detail</dt><dd>{entry.detail}</dd></div>
              <div><dt>Transaction hash</dt><dd>{entry.txHash ?? "Transaction hash not recorded"}</dd></div>
              <div><dt>Recorded</dt><dd>{entry.ts}<br/>Ledger {entry.ledger ?? "not recorded"}</dd></div>
              <div><dt>Network / deployment</dt><dd>{entry.network ?? (IS_MOCK ? "Local simulation" : "Not recorded")}{entry.contractId && <><br/>{entry.contractId}</>}</dd></div>
              {entry.account && <div><dt>Account</dt><dd>{entry.account}</dd></div>}
            </dl>
            {recordLink ? <div className="instrument-actions"><Link href={recordLink}>Open {entry.template === "envoy" ? "mandate" : entry.template} record →</Link></div> : !IS_MOCK && <p>Record lookup requires the matching network and deployment. This entry’s scope is different or was not recorded.</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}
