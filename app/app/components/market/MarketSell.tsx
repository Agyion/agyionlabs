"use client";

import { useEffect, useRef, useState } from 'react';
import { metadataHash, parseMetadata } from '../../../../market/shared/codec';
import { merchantKeyBackupChecked, type MerchantKeyHandle } from '../../../../market/client/merchant-vault';
import { getMarketRelease } from '../../../../market/client/release';
import type { Merchant } from '../../../../market/client/spec';
import { amount, assetName, coordinate, ledgerDuration, parseListingDraft, publicDownload, NATIVE_MARKET_ASSET, type ListingDraft } from '../../lib/market/forms';
import { useMarketSession } from './MarketSession';

export default function MarketSell({ merchant, signingKey, active = true, onCreated }: { active?: boolean; merchant: Merchant | null; signingKey: MerchantKeyHandle | null; onCreated(id: string, draft: ListingDraft): void }) {
  const { account, protocol, busy, execute } = useMarketSession();
  const [form, setForm] = useState({ title: '', quantity: '', shopName: '', shopId: '', address: '', latitude: '', longitude: '', pickupStart: '', pickupEnd: '', allergens: '', storage: '', accessibility: '', asset: NATIVE_MARKET_ASSET, pot: '1', start: '0.1', floor: '0', minutes: '60', lease: '0' });
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const [working, setWorking] = useState(false), [submitted, setSubmitted] = useState(false);
  const generation = useRef(0), workingRef = useRef(false);
  useEffect(() => { const lifecycle = generation; lifecycle.current++; workingRef.current = false; setWorking(false); setSubmitted(false); setNotice(null); setError(null); return () => { lifecycle.current++; }; }, [active, account, protocol, signingKey]);
  const field = (key: keyof typeof form, label: string, props: { type?: string; placeholder?: string; inputMode?: 'decimal' | 'numeric'; maxLength?: number } = {}) => <label>{label}<input {...props} value={form[key]} disabled={working || busy || submitted} onChange={e => setForm(current => ({ ...current, [key]: e.target.value }))} /></label>;
  const registered = !!account && !!merchant && !!signingKey && merchantKeyBackupChecked(signingKey) && signingKey.scope.seller === account && signingKey.scope.keyEpoch === merchant.epoch && signingKey.publicKey === merchant.public_key.toString('hex');
  const create = async () => {
    if (!active || !registered || workingRef.current || busy || submitted) return;
    const ticket = generation.current; workingRef.current = true;
    const current = () => ticket === generation.current;
    const finish = () => { if (current()) { workingRef.current = false; setWorking(false); } };
    setWorking(true); setError(null); setNotice(null);
    let draft: ListingDraft;
    try {
      const start = Math.floor(Date.parse(form.pickupStart) / 1000), end = Math.floor(Date.parse(form.pickupEnd) / 1000);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= Date.now() / 1000) throw new Error('Choose a future pickup window.');
      const metadata = parseMetadata({ title: form.title.trim(), quantity: form.quantity.trim(), allergens: form.allergens.trim(), storage: form.storage.trim(), shopId: form.shopId.trim(), shopName: form.shopName.trim(), address: form.address.trim(), latE6: coordinate(form.latitude, true), lonE6: coordinate(form.longitude, false), pickupStart: start, pickupEnd: end, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', accessibility: form.accessibility.trim(), imageHash: null });
      const duration = ledgerDuration(form.minutes, 1_000_000), startPrice = amount(form.start, true), floor = amount(form.floor, true);
      draft = parseListingDraft({ version: 1, kind: 'AgyionPublicListing', metadata, terms: { asset: form.asset, pot: amount(form.pot).toString(), start_price: startPrice.toString(), floor_price: floor.toString(), slope_num: (startPrice - floor).toString(), slope_den: String(duration), duration_ledgers: duration, lease_ledgers: ledgerDuration(form.lease, 720, true), metadata_hash: await metadataHash(metadata) } });
      if (!current()) return;
      if (!getMarketRelease().assets.includes(draft.terms.asset)) throw new Error('Choose a supported asset.');
    } catch (e) { if (current()) setError(e instanceof Error && e.message !== 'Invalid public catalog data' ? e.message : 'Check the listing details and limits.'); finish(); return; }
    if (!current() || !signingKey || !merchantKeyBackupChecked(signingKey)) { finish(); return; }
    try {
      // Public draft only. Persist before asking the wallet so inclusion followed
      // by navigation cannot silently lose the immutable metadata commitment.
      localStorage.setItem(`agyion.market.listingDraft.v1:${getMarketRelease().contract}:${account}:${draft.terms.metadata_hash}`, JSON.stringify(draft));
      publicDownload(`agyion-listing-${draft.terms.metadata_hash.slice(0, 12)}.json`, draft);
    } catch { setError('The public listing draft could not be saved. Funding has not started.'); finish(); return; }
    if (!current() || !merchantKeyBackupChecked(signingKey)) { finish(); return; }
    let result;
    try { result = await execute({ action: 'create_offer', terms: draft.terms }); } catch { if (current()) setError('Funding could not be verified. Check Recovery before another attempt.'); finish(); return; }
    if (!current()) return;
    finish();
    if (!result) return;
    if (result.status === 'confirmed' && result.offerId) { setSubmitted(true); onCreated(result.offerId, draft); }
    else if (result.status === 'pending') { setSubmitted(true); setNotice('Funding is pending. Keep the listing file and check Recovery before creating another offer.'); }
    else setNotice('Funding was not confirmed. Check the transaction result in Recovery.');
  };
  return <section className="market-sell" aria-label="New public offer">
    <div className="market-section-heading"><div><h3>Publish a pickup</h3><p>One offer represents one collection.</p></div></div>
    {!registered && <p className="market-notice">Restore and check the registered merchant key before funding an offer.</p>}
    <div className="market-form-grid">
      {field('title', 'What is available?', { maxLength: 120, placeholder: 'Product or collection' })}{field('quantity', 'Quantity', { maxLength: 80 })}
      {field('shopName', 'Shop name', { maxLength: 100 })}{field('shopId', 'Shop identifier', { maxLength: 64, placeholder: 'lowercase-shop-name' })}
      <div className="market-form-wide">{field('address', 'Pickup address', { maxLength: 240 })}</div>
      {field('latitude', 'Latitude', { inputMode: 'decimal', placeholder: '41.0082' })}{field('longitude', 'Longitude', { inputMode: 'decimal', placeholder: '28.9784' })}
      {field('pickupStart', 'Pickup starts · your local time', { type: 'datetime-local' })}{field('pickupEnd', 'Pickup ends · your local time', { type: 'datetime-local' })}
      {field('allergens', 'Allergens', { maxLength: 240 })}{field('storage', 'Storage instructions', { maxLength: 240 })}
      <div className="market-form-wide">{field('accessibility', 'Access or collection instructions', { maxLength: 160 })}</div>
    </div>
    <details className="market-terms" open><summary>Price and funding</summary><div className="market-form-grid">
      <label>Test asset<select value={form.asset} disabled={working || busy || submitted} onChange={e => setForm(current => ({ ...current, asset: e.target.value }))}>{getMarketRelease().assets.map(asset => <option key={asset} value={asset}>{assetName(asset)}</option>)}</select></label>
      {field('pot', 'Seller funding', { inputMode: 'decimal' })}{field('start', 'Starting price', { inputMode: 'decimal' })}{field('floor', 'Lowest price', { inputMode: 'decimal' })}
      {field('minutes', 'Price duration · approx. minutes', { inputMode: 'numeric' })}{field('lease', 'Reservation limit · minutes', { inputMode: 'numeric', placeholder: '0 means walk in only' })}
    </div><p className="market-caption">A negative price pays the collector from seller funding. Reservations require your signed authorization. Ledger time controls expiry; the pickup dates are your declared hours.</p></details>
    <button type="button" className="btn btn-primary" disabled={!active || !registered || busy || working || submitted} onClick={() => void create()}>{busy || working ? 'Preparing…' : submitted ? 'Offer submitted' : 'Save listing and fund offer'}</button>
    {notice && <p role="status" className="market-notice">{notice}</p>}{error && <p role="alert" className="market-error">{error}</p>}
  </section>;
}
