"use client";

import { useEffect, useRef, useState } from 'react';
import { usePrivateWorkspace } from './PrivateWorkspaceProvider';
import { shortAddress, shortHex } from '../../lib/format';

/** Public journal recovery stays available without decrypted keys or a ready
 * selected pool. Only the original recorded hash is reconciled; no replacement
 * transaction, release import or signing capability is exposed here. */
export default function PrivatePendingRecovery() {
  const { accountPending, pendingError, pendingChecked, pendingBusy, refreshPending, reconcilePending } = usePrivateWorkspace();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const operation = useRef(false), generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const run = async (hash?: string) => {
    if (operation.current || pendingBusy) return;
    operation.current = true; setBusy(true); setNotice(null); setError(null);
    const token = generation.current;
    try {
      if (hash) {
        const result = await reconcilePending(hash);
        if (token === generation.current) setNotice(`Transaction ${result.hash}: ${result.status}.`);
      } else await refreshPending();
    } catch {
      if (token === generation.current) setError('Transaction status is still unavailable. Do not submit a replacement.');
    } finally {
      if (token === generation.current) { operation.current = false; setBusy(false); }
    }
  };
  const blocked = busy || pendingBusy !== null;
  return <section className="private-pending workbench-surface" aria-label="Private transaction recovery">
    <header><h4>Pending transactions</h4><button type="button" className="btn btn-secondary px-4 py-2" disabled={blocked} onClick={() => void run()}>Check pending activity</button></header>
    {pendingError && <p role="alert">{pendingError}</p>}
    {!pendingChecked && <p role="status">Checking local recovery records…</p>}
    {pendingChecked && !pendingError && accountPending.length === 0 && <p>No pending transaction recorded on this device.</p>}
    {accountPending.map(attempt => <div className="instrument-record" key={attempt.hash}>
      <p>{attempt.releaseStatus === 'known' ? attempt.releaseLabel : 'Unrecognized private pool'} · {shortHex(attempt.hash)}</p>
      <p>Original payer {shortAddress(attempt.source)} · Pool {shortAddress(attempt.pool)}</p>
      {attempt.releaseStatus === 'unknown' && <p>This record remains reserved. Its pool cannot be verified by this app. Do not send a replacement.</p>}
      <button type="button" className="btn btn-secondary px-4 py-2" disabled={blocked || attempt.releaseStatus !== 'known'} onClick={() => void run(attempt.hash)}>Check transaction status</button>
    </div>)}
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
