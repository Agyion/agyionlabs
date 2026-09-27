"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPrivateVaultController, PrivateVaultControllerProvider, type PrivateVaultController, type PrivacyVaultScope } from '../../lib/privateVault';
import { getPrivatePoolRelease } from '../../lib/private/release';
import { onWalletSessionChange, walletSessionVersion } from '../../lib/wallet';
import { privateAmount } from '../../lib/privateWorkspaceInputs';
import { formatMinor, shortAddress } from '../../lib/format';
import type { FeeConfirmation, PrivateProtocol, PrivateProtocolSnapshot } from '../../lib/private/protocol-types';

const EMPTY: PrivateProtocolSnapshot = Object.freeze({ status: 'locked', phase: null, ledger: null, balances: [], notes: [], pending: [], error: null, feeQuote: null });
const noSubscribe = () => () => {};
const emptySnapshot = () => EMPTY;
type Workspace = Readonly<{
  scope: PrivacyVaultScope | null;
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

export default function PrivateWorkspaceProvider({ address, children }: { address: string | null; children: ReactNode }) {
  const session = useSyncExternalStore(onWalletSessionChange, walletSessionVersion, () => 0);
  const [scope, setScope] = useState<PrivacyVaultScope | null>(null);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [protocol, setProtocol] = useState<PrivateProtocol | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [feeLimit, setFeeLimitValue] = useState('1');
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [fee, setFee] = useState<FeeConfirmation | null>(null);
  const pendingFee = useRef<((approved: boolean) => void) | null>(null);
  const feeDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let active = true;
    void getPrivatePoolRelease().then(release => { if (active) setScope(release.scope); }).catch(() => {
      if (active) setReleaseError('The private deployment could not be verified. Private operations are unavailable.');
    });
    return () => { active = false; };
  }, []);
  const vault = useMemo(() => scope ? createPrivateVaultController(scope) : null, [scope, address, session]);
  useEffect(() => () => vault?.lock(), [vault]);

  const confirmFee = useCallback((value: FeeConfirmation): Promise<boolean> => {
    pendingFee.current?.(false);
    if (value.signal.aborted) return Promise.resolve(false);
    return new Promise(resolve => {
      const finish = (approved: boolean) => {
        value.signal.removeEventListener('abort', cancel);
        if (pendingFee.current === finish) { pendingFee.current = null; setFee(null); }
        resolve(approved && !value.signal.aborted);
      };
      const cancel = () => finish(false);
      pendingFee.current = finish;
      value.signal.addEventListener('abort', cancel, { once: true });
      setFee(value);
    });
  }, []);
  useEffect(() => () => { pendingFee.current?.(false); }, []);
  useEffect(() => {
    const dialog = feeDialog.current;
    if (!fee || !dialog) return;
    dialog.showModal();
    return () => { dialog.close(); };
  }, [fee]);

  useEffect(() => {
    let active = true, instance: PrivateProtocol | null = null;
    setProtocol(null); setConnectionError(null); setReviewId(null);
    if (!vault || !address) { setConnecting(false); return; }
    setConnecting(true);
    void import('../../lib/private/protocol').then(module => module.createPrivateProtocol({ vault, maxFeeStroops: '10000000', confirmFee })).then(created => {
      instance = created;
      if (!active) { created.dispose(); return; }
      setProtocol(created); setConnecting(false);
      void created.refreshPending().catch(() => {});
    }).catch(() => {
      if (active) { setConnecting(false); setConnectionError('The private wallet session could not be verified. Reconnect before trying again.'); }
    });
    return () => { active = false; pendingFee.current?.(false); instance?.dispose(); };
  }, [vault, address, confirmFee]);

  const subscribe = useCallback((listener: () => void) => protocol ? protocol.subscribe(listener) : noSubscribe(), [protocol]);
  const readSnapshot = useCallback(() => protocol?.getSnapshot() ?? EMPTY, [protocol]);
  const snapshot = useSyncExternalStore(subscribe, readSnapshot, emptySnapshot);
  const setFeeLimit = (value: string) => {
    if (snapshot.phase) throw new Error('Wait for the current private operation before changing its fee limit.');
    if (BigInt(privateAmount(value)) > 0xffff_ffffn) throw new Error('The fee limit exceeds the supported transaction range.');
    setFeeLimitValue(value);
  };
  const value: Workspace = { scope, vault, protocol, snapshot, feeLimit, setFeeLimit, reviewId, setReviewId, loading: !scope && !releaseError || connecting, error: releaseError ?? connectionError };
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
