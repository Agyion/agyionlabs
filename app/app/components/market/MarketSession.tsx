"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { bindPrivateWallet } from '../../lib/private/wallet-session';
import { walletSessionVersion, onWalletSessionChange } from '../../lib/wallet';
import type { MarketCommand, MarketFeeConfirmation, MarketOutcome, MarketProtocol } from '../../../../market/client/protocol-types';
import { amount, units } from '../../lib/market/forms';

interface Session {
  protocol: MarketProtocol | null; account: string | null; busy: boolean; error: string | null;
  feeLimit: string; setFeeLimit(value: string): void; clearError(): void;
  execute(command: MarketCommand): Promise<MarketOutcome | null>;
}
const Context = createContext<Session | null>(null);
export function useMarketSession(): Session { const value = useContext(Context); if (!value) throw new Error('Market session missing.'); return value; }
export function marketError(error: unknown): string {
  const diagnostic = error instanceof Error || (typeof DOMException !== 'undefined' && error instanceof DOMException) ? error : null;
  const code = diagnostic?.message ?? '', name = diagnostic?.name ?? '';
  const errorCode: unknown = diagnostic ? (diagnostic as Error & { code?: unknown }).code : undefined;
  const transportCode = typeof errorCode === 'string' ? errorCode : '';
  // An aborted request or disposed screen does not establish whether signing
  // or broadcast had begun. Preserve that uncertainty and point to recovery.
  if (name === 'AbortError' || name === 'CanceledError' || transportCode === 'ERR_CANCELED' || /\babort(?:ed)?\b/i.test(code) || code === 'MARKET_SESSION_DISPOSED' || code === 'OFFER_SESSION_CHANGED') return 'The operation was interrupted. Check Recovery before trying again.';
  if (/reject|cancel|denied/i.test(code)) return 'The operation was cancelled. Check Recovery if a transaction was already submitted.';
  if (name === 'TimeoutError' || /^(?:ERR_NETWORK|ECONNABORTED|ETIMEDOUT|ENETUNREACH)$/.test(transportCode) || /failed to fetch|network(?:\s+request)?\s*(?:error|failed)|load failed|timeout|timed out/i.test(code)) return 'The network request did not complete. Check Recovery before trying again.';
  if (/FEE|fee.*(limit|cap)/i.test(code)) return 'The network fee exceeds your limit. Review the fee limit before preparing again.';
  if (/PENDING|RECOVERY|CONFLICT|RESERVED/i.test(code)) return 'An earlier action may still be pending. Check Recovery before starting another transaction.';
  if (/(?:^|[\s_])WALLET(?:[\s_]|$)/i.test(code)) return 'The wallet session changed or could not be verified. Reconnect on Stellar testnet.';
  if (/EXPIRED|STALE|WINDOW|STATE_CHANGED/i.test(code)) return 'The offer or authorization changed. Refresh it and request a fresh pickup code.';
  if (/SIGNATURE|AUTH|KEY|SCOPE/i.test(code)) return 'This authorization does not match the offer, wallet or current merchant key.';
  if (/ARCHIV|UNAVAILABLE|RPC|FETCH|READ|NETWORK|CODE_MISMATCH/i.test(code)) return 'The contract could not be verified. Transactions remain blocked until a fresh check succeeds.';
  return 'The action could not be verified. Refresh the record and check Recovery before trying again.';
}

export function MarketSession({ account, active, children }: { account: string | null; active: boolean; children: ReactNode }) {
  const [protocol, setProtocol] = useState<MarketProtocol | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), busyRef = useRef(false);
  const [feeLimit, setFeeLimit] = useState('1');
  const [fee, setFee] = useState<MarketFeeConfirmation | null>(null);
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const finishFee = useRef<((yes: boolean) => void) | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const generation = useRef(0);
  useEffect(() => onWalletSessionChange(() => setSessionEpoch(value => value + 1)), []);
  const confirmFee = useCallback((value: MarketFeeConfirmation): Promise<boolean> => {
    finishFee.current?.(false);
    return new Promise(resolve => {
      let done = false;
      const abort = () => finish(false);
      const finish = (yes: boolean) => {
        if (done) return; done = true; value.signal.removeEventListener('abort', abort);
        if (finishFee.current === finish) { finishFee.current = null; setFee(null); }
        resolve(yes);
      };
      if (value.signal.aborted) return finish(false);
      finishFee.current = finish; value.signal.addEventListener('abort', abort, { once: true }); setFee(value);
    });
  }, []);
  useEffect(() => { if (fee && dialog.current && !dialog.current.open) dialog.current.showModal(); }, [fee]);
  useEffect(() => {
    const lifecycle = generation, feeResolver = finishFee;
    const ticket = ++lifecycle.current, version = walletSessionVersion(); let disposed = false, created: MarketProtocol | null = null;
    setProtocol(null); setError(null); busyRef.current = false; setBusy(false);
    if (active && account) void (async () => {
      const bound = await bindPrivateWallet(() => {
        if (disposed || ticket !== generation.current || version !== walletSessionVersion()) throw new Error('WALLET_SESSION_CHANGED');
      });
      if (disposed || ticket !== generation.current || bound.account !== account) throw new Error('WALLET_SESSION_CHANGED');
      const { createMarketProtocol } = await import('../../../../market/client/protocol');
      if (disposed || ticket !== generation.current) return;
      const instance = await createMarketProtocol({ wallet: bound.wallet, maxFeeStroops: '10000000', confirmFee });
      if (disposed || ticket !== generation.current) { instance.dispose(); return; }
      created = instance; setProtocol(instance);
    })().catch(e => { if (!disposed && ticket === generation.current) setError(marketError(e)); });
    return () => { disposed = true; lifecycle.current++; feeResolver.current?.(false); created?.dispose(); };
  }, [account, active, sessionEpoch, confirmFee]);
  const execute = useCallback(async (command: MarketCommand): Promise<MarketOutcome | null> => {
    if (!active || !protocol || busyRef.current) return null;
    const ticket = generation.current; busyRef.current = true; setBusy(true); setError(null);
    try {
      const cap = amount(feeLimit); if (cap <= 0n || cap > 100_000_000n) throw new Error('FEE_CAP_RANGE');
      const prepared = await protocol.prepare(command);
      if (ticket !== generation.current) return null;
      const result = await protocol.submit(protocol.withFeeLimit(prepared, cap.toString()));
      return ticket === generation.current ? result : null;
    } catch (e) { if (ticket === generation.current) setError(marketError(e)); return null; }
    finally { if (ticket === generation.current) { busyRef.current = false; setBusy(false); } }
  }, [protocol, feeLimit, active]);
  return <Context.Provider value={{ protocol, account, busy, error, feeLimit, setFeeLimit, clearError: () => setError(null), execute }}>
    {children}
    {fee && <dialog className="private-fee-dialog workbench-surface" ref={dialog} aria-labelledby="market-fee-title" onCancel={event => { event.preventDefault(); finishFee.current?.(false); }}>
      <h2 id="market-fee-title">Review network fee</h2><strong>{units(fee.feeStroops)} XLM</strong>
      <p>Maximum fee authorized by this signature. Your limit: {units(fee.maxFeeStroops)} XLM.</p>
      <div className="market-actions"><button type="button" className="btn btn-secondary" onClick={() => finishFee.current?.(false)}>Cancel</button><button type="button" className="btn btn-primary" autoFocus onClick={() => finishFee.current?.(true)}>Continue to wallet</button></div>
    </dialog>}
  </Context.Provider>;
}
