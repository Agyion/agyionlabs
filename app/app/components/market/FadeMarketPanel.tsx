"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import type { WalletState } from '../../lib/useWallet';
import { IS_MOCK } from '../../lib/config';
import { MarketSession, useMarketSession, marketError } from './MarketSession';
import { getMarketRelease } from '../../../../market/client/release';
import type { CatalogListing } from '../../../../market/client/catalog';
import type { Merchant } from '../../../../market/client/spec';
import type { MerchantKeyHandle } from '../../../../market/client/merchant-vault';
import type { MarketJournalEntry } from '../../../../market/client/journal';
import type { ListingDraft } from '../../lib/market/forms';
import MarketBrowse from './MarketBrowse';
import MarketOffer from './MarketOffer';
import MarketSell from './MarketSell';
import MerchantKeys from './MerchantKeys';

export default function FadeMarketPanel({ wallet, active, publicRecordRequested, legacy }: { wallet: WalletState; active: boolean; publicRecordRequested: boolean; legacy: ReactNode }) {
  const [legacyOpen, setLegacyOpen] = useState(publicRecordRequested);
  useEffect(() => { if (publicRecordRequested) setLegacyOpen(true); }, [publicRecordRequested]);
  if (IS_MOCK) return <>{legacy}</>;
  let available = true; try { getMarketRelease(); } catch { available = false; }
  return <div className="instrument-panel market-panel">
    {available ? <MarketSession account={wallet.address} active={active && !legacyOpen} key={wallet.address ?? 'disconnected'}><MarketWorkspace wallet={wallet} active={active && !legacyOpen} /></MarketSession> : <p className="market-notice">The public marketplace release is not available in this build.</p>}
    <details className="instrument-technical market-legacy" open={legacyOpen} onToggle={event => setLegacyOpen(event.currentTarget.open)}>
      <summary>Existing public positions</summary><p>Earlier Fade records stay on their original contract.</p>{legacyOpen && legacy}
    </details>
  </div>;
}

function MarketWorkspace({ wallet, active }: { wallet: WalletState; active: boolean }) {
  const { account, protocol, error, busy, feeLimit, setFeeLimit } = useMarketSession();
  const [section, setSection] = useState<'browse' | 'sell' | 'recovery'>('browse');
  const [selected, setSelected] = useState<{ id: string; listing?: CatalogListing; draft?: ListingDraft } | null>(null);
  const [merchant, setMerchant] = useState<Merchant | null>(null), [key, setKey] = useState<MerchantKeyHandle | null>(null);
  const [merchantError, setMerchantError] = useState<string | null>(null);
  const [loadId, setLoadId] = useState(''), [loadError, setLoadError] = useState<string | null>(null), [refresh, setRefresh] = useState(0);
  const generation = useRef(0);
  const [merchantKnown, setMerchantKnown] = useState(false);
  const marketOffer = useSearchParams().get('marketOffer');
  const refreshMerchant = useCallback(async () => {
    const ticket = ++generation.current; setMerchant(null); setMerchantError(null); setMerchantKnown(false);
    if (!protocol || !account) return;
    try { const result = await protocol.merchant(account); if (ticket === generation.current) { setMerchant(result.value); setMerchantKnown(true); } }
    catch (e) { if (ticket === generation.current) setMerchantError(marketError(e)); }
  }, [protocol, account]);
  useEffect(() => { const lifecycle = generation; if (active) void refreshMerchant(); return () => { lifecycle.current++; }; }, [active, refreshMerchant]);
  const openOffer = useCallback((value: { id: string; listing?: CatalogListing; draft?: ListingDraft }) => {
    setSelected(value); const url = new URL(window.location.href); url.searchParams.set('tab', 'fade'); url.searchParams.set('marketOffer', value.id); url.searchParams.delete('ref'); window.history.replaceState(window.history.state, '', url);
  }, []);
  useEffect(() => {
    if (marketOffer && /^[1-9]\d{0,19}$/.test(marketOffer) && BigInt(marketOffer) < 1n << 64n) {
      setSelected(current => current?.id === marketOffer ? current : { id: marketOffer }); setSection('browse');
    } else setSelected(null);
  }, [marketOffer]);
  const browse = useCallback((listing: CatalogListing) => openOffer({ id: listing.publication.offerId, listing }), [openOffer]);
  return <>
    <nav className="market-navigation" aria-label="Fade workspace">{(['browse', 'sell', 'recovery'] as const).map(item => <button type="button" key={item} aria-pressed={section === item} disabled={busy} onClick={() => { setSection(item); }}>{item === 'browse' ? 'Find a pickup' : item === 'sell' ? 'Sell' : 'Recovery'}</button>)}</nav>
    {!account && <div className="market-connect"><p>Browse freely. Connect to fund or collect.</p><button type="button" className="btn btn-primary" disabled={wallet.connecting} onClick={() => void wallet.connectKit()}>{wallet.connecting ? 'Connecting…' : 'Connect wallet'}</button></div>}
    {error && <p role="alert" className="market-error">{error}</p>}
    {section === 'browse' && <><form className="market-record-search" onSubmit={event => { event.preventDefault(); const id = loadId.trim(); if (!/^[1-9]\d{0,19}$/.test(id) || BigInt(id) >= 1n << 64n) { setLoadError('Enter a positive offer ID.'); return; } setLoadError(null); openOffer({ id }); }}><label>Have an offer number?<input value={loadId} onChange={e => setLoadId(e.target.value)} inputMode="numeric" aria-label="Market offer number" /></label><button type="submit" className="btn btn-secondary">Open offer</button></form>{loadError && <p role="alert">{loadError}</p>}
      {!selected && <MarketBrowse active={active} selectedId={undefined} onSelect={browse} refreshToken={refresh} />}</>}
    {account && <div hidden={section !== 'sell'}><MerchantKeys active={active} merchantKnown={merchantKnown} merchant={merchant} onKey={setKey} onRegistered={refreshMerchant} key={account} />
      {merchantError && <p role="alert" className="market-error">{merchantError}</p>}
      {section === 'sell' && !selected && <MarketSell active={active} merchant={merchant} signingKey={key} onCreated={(id, draft) => openOffer({ id, draft })} />}</div>}
    {selected && section !== 'recovery' && <MarketOffer key={`${selected.id}:${account ?? 'reader'}`} id={selected.id} listing={selected.listing} initialDraft={selected.draft} signingKey={key} active={active} onClose={() => { setSelected(null); const url = new URL(window.location.href); url.searchParams.delete('marketOffer'); window.history.replaceState(window.history.state, '', url); }} onPublished={() => setRefresh(value => value + 1)} />}
    {section === 'recovery' && <MarketRecovery active={active} onMerchantRegistered={refreshMerchant} onOpen={id => { openOffer({ id }); setSection('browse'); }} />}
    {account && <details className="market-terms"><summary>Network fee limit</summary><label>Maximum fee per transaction · XLM<input inputMode="decimal" value={feeLimit} onChange={event => setFeeLimit(event.target.value)} disabled={busy} /></label><p className="market-caption">Default 1 XLM. Maximum 10 testnet XLM. Every transaction still needs a separate fee review and wallet approval.</p></details>}
  </>;
}

function MarketRecovery({ active, onOpen, onMerchantRegistered }: { active: boolean; onOpen(id: string): void; onMerchantRegistered(): Promise<void> }) {
  const { account, protocol, busy } = useMarketSession();
  const [entries, setEntries] = useState<readonly MarketJournalEntry[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const request = useRef(0), operation = useRef(0), checking = useRef(false);
  const refresh = useCallback(async () => {
    const ticket = ++request.current; setEntries([]); setError(null); setLoading(false);
    if (!protocol) return;
    setLoading(true);
    try { const rows = await protocol.history(); if (ticket === request.current) setEntries(rows.filter(row => row.attempt.source === account).slice(-50).reverse()); }
    catch (e) { if (ticket === request.current) setError(marketError(e)); }
    finally { if (ticket === request.current) setLoading(false); }
  }, [protocol, account]);
  useEffect(() => { const readRequest = request, workOperation = operation; workOperation.current++; checking.current = false; setLoading(false); setNotice(null); setEntries([]); if (active) void refresh(); return () => { readRequest.current++; workOperation.current++; }; }, [active, refresh]);
  const check = async (entry: MarketJournalEntry, retry = false) => {
    if (!active || !protocol || loading || busy || checking.current || entry.attempt.source !== account) return;
    const ticket = operation.current; checking.current = true;
    const current = () => ticket === operation.current;
    setLoading(true); setError(null); setNotice(null);
    try {
      if (entry.attempt.kind === 'publication') {
        const result = retry ? await protocol.retryPublication(entry.attempt.hash) : await protocol.reconcilePublication(entry.attempt.hash);
        if (!current()) return;
        setNotice(result.status === 'accepted' ? 'Publication acceptance verified.' : result.status === 'known_not_sent' ? 'Not published. The request was cancelled before sending.' : 'Publication remains uncertain. No new revision has been created.');
      } else {
        const result = await protocol.reconcile(entry.attempt.hash);
        if (!current()) return;
        if (result.status === 'confirmed' && entry.attempt.action === 'register_merchant') {
          await onMerchantRegistered();
          if (!current()) return;
        }
        setNotice(`Transaction result: ${result.status.replaceAll('_', ' ')}.`);
        if (result.status === 'confirmed' && result.offerId) onOpen(result.offerId);
      }
      await refresh();
    } catch (e) { if (current()) setError(marketError(e)); } finally { if (current()) { checking.current = false; setLoading(false); } }
  };
  return <section aria-label="Market recovery"><div className="market-section-heading"><div><h3>Check an earlier action</h3><p>Checks do not resubmit transactions.</p></div><button type="button" className="btn btn-secondary" disabled={!active || !protocol || loading} onClick={() => void refresh()}>Refresh</button></div>
    {!account && <p className="market-empty">Connect the account that submitted the action.</p>}
    {account && !loading && entries.length === 0 && <p className="market-empty">No saved market actions for this account in this browser.</p>}
    {entries.map(entry => <article className="market-recovery-row" key={entry.attempt.hash}><div><strong>{entry.attempt.kind === 'publication' ? `Publish offer ${entry.attempt.publication.offerId}` : entry.attempt.action.replaceAll('_', ' ')}</strong><p>{entry.terminal?.status.replaceAll('_', ' ') ?? 'Awaiting confirmation'}</p><code>{entry.attempt.hash}</code></div><div className="market-actions"><button type="button" className="btn btn-secondary" disabled={!active || !protocol || loading || busy} onClick={() => void check(entry)}>Check result</button>{entry.attempt.kind === 'publication' && !entry.terminal && <button type="button" className="btn btn-secondary" disabled={!active || !protocol || loading || busy} onClick={() => void check(entry, true)}>Retry saved publication</button>}</div></article>)}
    {notice && <p role="status" className="market-notice">{notice}</p>}{error && <p role="alert" className="market-error">{error}</p>}
  </section>;
}
