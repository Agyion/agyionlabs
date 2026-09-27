"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPrivateVaultController, PrivateVaultControllerProvider, type PrivateVaultController, type PrivacyVaultScope } from '../../lib/privateVault';
import { DEFAULT_PRIVATE_RELEASE_KEY, listPrivateReleaseOptions, resolvePrivateRelease, assertPrivateReleaseSelection, type PrivateReleaseSelection } from '../../lib/private/release';
import { onWalletSessionChange, walletSessionVersion } from '../../lib/wallet';
import { privateAmount } from '../../lib/privateWorkspaceInputs';
import { formatMinor, shortAddress } from '../../lib/format';
import type { PrivateAccountPendingAttempt } from '../../lib/private/pending-recovery';
import type { PrivateOperationOutcome } from '../../lib/private/protocol-types';
import type { FeeConfirmation, PrivateProtocol, PrivateProtocolSnapshot } from '../../lib/private/protocol-types';

const EMPTY: PrivateProtocolSnapshot = Object.freeze({ status: 'locked', phase: null, ledger: null, balances: [], notes: [], pending: [], error: null, feeQuote: null });
const noSubscribe = () => () => {};
const emptySnapshot = () => EMPTY;
type Workspace = Readonly<{
  scope: PrivacyVaultScope | null;
  releaseKey: string; selection: PrivateReleaseSelection | null;
  releaseOptions: ReturnType<typeof listPrivateReleaseOptions>; selectRelease(key: string): void;
  accountPending: readonly PrivateAccountPendingAttempt[]; pendingError: string | null; pendingChecked: boolean; pendingBusy: string | null;
  refreshPending(): Promise<void>; reconcilePending(hash: string): Promise<PrivateOperationOutcome>;
  vault: PrivateVaultController | null; protocol: PrivateProtocol | null; snapshot: PrivateProtocolSnapshot;
  feeLimit: string; setFeeLimit(value: string): void; loading: boolean; error: string | null;
  reviewId: string | null; setReviewId(value: string | null): void;
}>;
const Context = createContext<Workspace | null>(null);
export function usePrivateWorkspace(): Workspace {
  const state = useContext(Context);
  if (!state) throw new Error('Private instruments require their shared workspace.');
  return state;
}

type OwnedWorkspace = {
  selection: PrivateReleaseSelection; address: string | null; session: number;
  vault: PrivateVaultController; protocol: PrivateProtocol | null; retired: boolean;
};
function retire(owner: OwnedWorkspace | null) {
  if (!owner || owner.retired) return;
  owner.retired = true;
  owner.protocol?.dispose();
  owner.vault.lock();
}

export default function PrivateWorkspaceProvider({ address, children }: { address: string | null; children: ReactNode }) {
  const session = useSyncExternalStore(onWalletSessionChange, walletSessionVersion, () => 0);
  const [releaseKey, setReleaseKey] = useState<string>(DEFAULT_PRIVATE_RELEASE_KEY);
  const [verified, setVerified] = useState<PrivateReleaseSelection | null>(null);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [ownerState, setOwner] = useState<OwnedWorkspace | null>(null);
  const [protocolState, setProtocol] = useState<{ owner: OwnedWorkspace; value: PrivateProtocol } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [feeLimit, setFeeLimitValue] = useState('1');
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [fee, setFee] = useState<FeeConfirmation | null>(null);
  const pendingFee = useRef<((approved: boolean) => void) | null>(null);
  const feeDialog = useRef<HTMLDialogElement>(null);
  const releaseRevision = useRef(0);
  const releaseOptions = listPrivateReleaseOptions();
  const [pendingState, setPendingState] = useState<{ identity: string; rows: readonly PrivateAccountPendingAttempt[]; error: string | null } | null>(null);
  const [pendingBusy, setPendingBusy] = useState<string | null>(null);
  const pendingOperation = useRef(false);
  const pendingRefresh = useRef(0);
  const accountIdentity = `${address ?? ''}:${session}`;
  // Do not wait for an effect to clear another wallet's public activity. Its
  // association with this browser must not appear in the replacement render.
  const accountPending = pendingState?.identity === accountIdentity ? pendingState.rows : [];
  const pendingError = pendingState?.identity === accountIdentity ? pendingState.error : null;
  const pendingChecked = pendingState?.identity === accountIdentity;
  const currentAccount = useRef(accountIdentity);
  currentAccount.current = accountIdentity;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const selection = verified?.key === releaseKey ? verified : null;
  const scope = selection?.release.scope ?? null;
  const owner = ownerState && !ownerState.retired && ownerState.selection === selection && ownerState.address === address && ownerState.session === session ? ownerState : null;
  const vault = owner?.vault ?? null;
  const protocol = owner && protocolState?.owner === owner ? protocolState.value : null;

  const refreshPending = useCallback(async () => {
    const currentSession = () => mounted.current && currentAccount.current === accountIdentity && walletSessionVersion() === session;
    // An obsolete operation's finally must not invalidate its replacement's read.
    if (!address || !currentSession()) return;
    const refresh = ++pendingRefresh.current;
    const revision = releaseRevision.current;
    const current = () => currentSession() && revision === releaseRevision.current && refresh === pendingRefresh.current;
    try {
      const helper = await import('../../lib/private/pending-recovery');
      if (!current()) return;
      const rows = await helper.listPrivatePendingForAccount({ source: address });
      if (current()) setPendingState({identity:accountIdentity,rows,error:null});
    } catch {
      if (current()) setPendingState(previous=>({identity:accountIdentity,rows:previous?.identity===accountIdentity?previous.rows:[],error:'Pending private activity could not be checked. Do not submit a replacement transaction.'}));
    }
  }, [address, accountIdentity, session]);
  const reconcilePending = useCallback(async (hash: string) => {
    if (!address || pendingOperation.current) throw new Error('Private transaction recovery is unavailable.');
    const revision = releaseRevision.current;
    const current = () => mounted.current && currentAccount.current === accountIdentity && walletSessionVersion() === session && revision === releaseRevision.current;
    if (!current()) throw new Error('Private recovery session changed.');
    pendingOperation.current = true; setPendingBusy(hash);
    try {
      const helper = await import('../../lib/private/pending-recovery');
      if (!current()) throw new Error('Private recovery session changed.');
      const result = await helper.reconcilePrivatePending(hash, { source: address });
      if (!current()) throw new Error('Private recovery session changed.');
      return result;
    } finally {
      pendingOperation.current = false;
      if (mounted.current) setPendingBusy(null);
      await refreshPending();
    }
  }, [address, accountIdentity, session, refreshPending]);
  useEffect(() => { setPendingState(null); }, [accountIdentity]);
  useEffect(() => { void refreshPending(); }, [refreshPending, releaseKey]);

  const selectRelease = useCallback((key: string) => {
    if (!listPrivateReleaseOptions().some(option => option.key === key)) throw new Error('Unknown private release.');
    if (key === releaseKey) return;
    // Retire capabilities before scheduling a render: a wallet or worker can
    // finish between this event and React's effect cleanup.
    releaseRevision.current++;
    pendingFee.current?.(false);
    retire(owner);
    setProtocol(null); setOwner(null); setVerified(null); setReleaseError(null);
    setConnectionError(null); setReviewId(null); setFeeLimitValue('1');
    setReleaseKey(key);
  }, [owner, releaseKey]);

  useEffect(() => {
    let active = true;
    const revision = releaseRevision.current;
    void resolvePrivateRelease(releaseKey).then(value => {
      assertPrivateReleaseSelection(value);
      if (value.key !== releaseKey) throw new Error('Private release mismatch.');
      if (active && revision === releaseRevision.current) { setVerified(value); setReleaseError(null); }
    }).catch(() => {
      if (active && revision === releaseRevision.current) setReleaseError('The private deployment could not be verified. Private operations are unavailable.');
    });
    return () => { active = false; };
  }, [releaseKey]);
  useEffect(() => {
    if (!selection) return;
    const next: OwnedWorkspace = { selection, address, session, vault: createPrivateVaultController(selection.release.scope), protocol: null, retired: false };
    setOwner(next);
    return () => { pendingFee.current?.(false); retire(next); };
  }, [selection, address, session]);

  const confirmFee = useCallback((value: FeeConfirmation): Promise<boolean> => {
    pendingFee.current?.(false);
    if (!owner || owner.retired || value.signal.aborted) return Promise.resolve(false);
    return new Promise(resolve => {
      const finish = (approved: boolean) => {
        value.signal.removeEventListener('abort', cancel);
        if (pendingFee.current === finish) { pendingFee.current = null; setFee(null); }
        resolve(approved && !owner.retired && !value.signal.aborted);
      };
      const cancel = () => finish(false);
      pendingFee.current = finish;
      value.signal.addEventListener('abort', cancel, { once: true });
      setFee(value);
    });
  }, [owner]);
  useEffect(() => () => { pendingFee.current?.(false); }, []);
  useEffect(() => {
    const dialog = feeDialog.current;
    if (!fee || !dialog) return;
    dialog.showModal();
    return () => { dialog.close(); };
  }, [fee]);

  useEffect(() => {
    let active = true;
    setProtocol(null); setConnectionError(null); setReviewId(null);
    if (!owner || !address) { setConnecting(false); return; }
    const own = owner;
    setConnecting(true);
    void import('../../lib/private/protocol').then(module => {
      if (!active || own.retired) return null;
      return module.createPrivateProtocol({ vault: own.vault, releaseKey: own.selection.key, maxFeeStroops: '10000000', confirmFee });
    }).then(created => {
      if (!created) return;
      if (!active || own.retired) { created.dispose(); return; }
      own.protocol = created;
      setProtocol({ owner: own, value: created }); setConnecting(false);
      void created.refreshPending().catch(() => {});
    }).catch(() => {
      if (active && !own.retired) { setConnecting(false); setConnectionError('The private wallet session could not be verified. Reconnect before trying again.'); }
    });
    return () => { active = false; pendingFee.current?.(false); retire(own); };
  }, [owner, address, confirmFee]);

  const subscribe = useCallback((listener: () => void) => protocol ? protocol.subscribe(listener) : noSubscribe(), [protocol]);
  const readSnapshot = useCallback(() => protocol?.getSnapshot() ?? EMPTY, [protocol]);
  const snapshot = useSyncExternalStore(subscribe, readSnapshot, emptySnapshot);
  const setFeeLimit = (value: string) => {
    if (snapshot.phase) throw new Error('Wait for the current private operation before changing its fee limit.');
    if (BigInt(privateAmount(value)) > 0xffff_ffffn) throw new Error('The fee limit exceeds the supported transaction range.');
    setFeeLimitValue(value);
  };
  const value: Workspace = { scope, releaseKey, selection, releaseOptions, selectRelease, accountPending, pendingError, pendingChecked, pendingBusy, refreshPending, reconcilePending, vault, protocol, snapshot, feeLimit, setFeeLimit, reviewId, setReviewId, loading: !owner && !releaseError || connecting, error: releaseError ?? connectionError };
  return <Context.Provider value={value}><PrivateVaultControllerProvider controller={vault}>
    {children}
    {fee && <dialog ref={feeDialog} className="private-fee-dialog workbench-surface" aria-labelledby="private-fee-title" onCancel={event => { event.preventDefault(); pendingFee.current?.(false); }}>
      <h2 id="private-fee-title">Confirm the network fee</h2>
      <p>Simulated maximum transaction fee <strong>{formatMinor(BigInt(fee.feeStroops), 7)} XLM</strong></p>
      <p>Your limit {formatMinor(BigInt(fee.maxFeeStroops), 7)} XLM · Payer {shortAddress(fee.source)}</p>
      <p>The final charged fee may be lower. The wallet opens after you continue. Check a submitted transaction before another attempt.</p>
      <div className="instrument-actions">
        <button type="button" className="btn btn-secondary px-5 py-3" onClick={() => pendingFee.current?.(false)}>Cancel</button>
        <button type="button" className="btn btn-primary px-5 py-3" autoFocus onClick={() => pendingFee.current?.(true)}>Continue to wallet</button>
      </div>
    </dialog>}
  </PrivateVaultControllerProvider></Context.Provider>;
}
