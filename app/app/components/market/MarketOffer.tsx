"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { StrKey } from '@stellar/stellar-sdk';
import { createMarketReader, type MarketRead } from '../../../../market/client/reader';
import { getMarketRelease } from '../../../../market/client/release';
import { createMarketCatalog, type CatalogListing } from '../../../../market/client/catalog';
import type { Merchant, Offer } from '../../../../market/client/spec';
import { signPickup, signPublication, merchantKeyBackupChecked, type MerchantKeyHandle } from '../../../../market/client/merchant-vault';
import { metadataHash, type PickupAction, type PickupReceipt, type Publication } from '../../../../market/shared/codec';
import { assetName, estimatedPrice, nonce, parseListingDraft, parsePickupCode, publicDownload, readListingFile, units, type ListingDraft, type PickupCode } from '../../lib/market/forms';
import { marketError, useMarketSession } from './MarketSession';

export default function MarketOffer({ id, listing, initialDraft, signingKey, active, onClose, onPublished }: {
  id: string; listing?: CatalogListing; initialDraft?: ListingDraft; signingKey: MerchantKeyHandle | null;
  active: boolean; onClose(): void; onPublished(): void;
}) {
  const { account, protocol, execute, busy } = useMarketSession();
  const [record, setRecord] = useState<MarketRead<Offer> | null>(null), [merchant, setMerchant] = useState<Merchant | null>(null);
  const [draft, setDraft] = useState<ListingDraft | null>(initialDraft ?? (listing ? { version: 1, kind: 'AgyionPublicListing', metadata: listing.publication.metadata, terms: listing.terms } : null));
  const [loading, setLoading] = useState(false), [working, setWorking] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const [claimant, setClaimant] = useState(''), [pickupAction, setPickupAction] = useState<PickupAction>('walk-in');
  const [issued, setIssued] = useState<PickupCode | null>(null), [code, setCode] = useState(''), [acceptedCode, setAcceptedCode] = useState<PickupCode | null>(null);
  const [acceptedPrice, setAcceptedPrice] = useState<bigint | null>(null);
  const epoch = useRef(0), lifetime = useRef(0), workRef = useRef(false);
  const [verifiedDraft, setVerifiedDraft] = useState<ListingDraft | null>(null);
  const refresh = useCallback(async () => {
    const ticket = ++epoch.current; setLoading(true); setError(null); setRecord(null); setMerchant(null); setIssued(null); setAcceptedCode(null); setAcceptedPrice(null);
    try {
      const reader = createMarketReader(), offer = await reader.offer(id), registered = await reader.merchant(offer.value.seller);
      if (ticket !== epoch.current) return;
      if (!registered.value) throw new Error('MERCHANT_UNAVAILABLE');
      setRecord(offer); setMerchant(registered.value);
    } catch (e) { if (ticket === epoch.current) setError(marketError(e)); }
    finally { if (ticket === epoch.current) setLoading(false); }
  }, [id]);
  useEffect(() => { const readEpoch = epoch, workLifetime = lifetime; workLifetime.current++; workRef.current = false; setWorking(false); setIssued(null); setAcceptedCode(null); setAcceptedPrice(null); setNotice(null); if (active) void refresh(); return () => { readEpoch.current++; workLifetime.current++; }; }, [active, refresh, account, protocol, signingKey]);
  useEffect(() => {
    let current = true; setVerifiedDraft(null);
    if (draft && record) void metadataHash(draft.metadata).then(hash => {
      if (current && hash === record.value.terms.metadata_hash.toString('hex')) setVerifiedDraft(draft);
    }).catch(() => {});
    return () => { current = false; };
  }, [draft, record]);
  useEffect(() => {
    if (!record || draft || record.value.seller !== account) return;
    try {
      const value = localStorage.getItem(`agyion.market.listingDraft.v1:${getMarketRelease().contract}:${account}:${record.value.terms.metadata_hash.toString('hex')}`);
      if (value) setDraft(parseListingDraft(JSON.parse(value)));
    } catch { /* An unreadable draft never supplies contract authority. */ }
  }, [record, account, draft]);
  useEffect(() => {
    if (!active || draft) return;
    const control = new AbortController();
    void Promise.resolve().then(() => createMarketCatalog().detail(id, control.signal)).then(value => {
      if (!control.signal.aborted) setDraft(parseListingDraft({ version: 1, kind: 'AgyionPublicListing', metadata: value.publication.metadata, terms: value.terms }));
    }).catch(() => {});
    return () => control.abort();
  }, [id, active, draft]);
  const doWork = async (task: (assertCurrent: () => void) => Promise<void>) => {
    if (workRef.current || busy || !active) return;
    const ticket = lifetime.current; workRef.current = true; setWorking(true); setError(null); setNotice(null);
    const assertCurrent = () => { if (ticket !== lifetime.current) throw new Error('OFFER_SESSION_CHANGED'); };
    try { assertCurrent(); await task(assertCurrent); } catch (e) { if (ticket === lifetime.current) setError(marketError(e)); }
    finally { if (ticket === lifetime.current) { workRef.current = false; setWorking(false); } }
  };
  const offer = record?.value, owner = !!account && offer?.seller === account;
  const reservation = offer?.reservation.tag === 'Active' ? offer.reservation.values[0] : null;
  const requiredMerchant = reservation?.merchant ?? merchant;
  const keyReady = !!signingKey && merchantKeyBackupChecked(signingKey) && signingKey.scope.seller === account && signingKey.scope.contract === getMarketRelease().contract && signingKey.scope.networkId === getMarketRelease().networkId && owner && !!requiredMerchant && signingKey.publicKey === requiredMerchant.public_key.toString('hex') && signingKey.scope.keyEpoch === requiredMerchant.epoch;
  const metadataMatches = !!draft && verifiedDraft === draft && !!offer && draft.terms.metadata_hash === offer.terms.metadata_hash.toString('hex');
  const shownPrice = !record ? null : record.value.state === 2 ? record.value.settled_price ?? null : record.value.state === 3 ? record.value.terms.pot : estimatedPrice(record.value, record.ledger);
  const priceLabel = shownPrice === null ? 'Unavailable' : offer?.state === 3 ? `Returned funding ${units(shownPrice)}` : offer?.state === 2 ? shownPrice < 0n ? `Received ${units(-shownPrice)}` : `Paid ${units(shownPrice)}` : shownPrice < 0n ? `Receive ${units(-shownPrice)}` : `Pay ${units(shownPrice)}`;

  const issue = () => doWork(async assertCurrent => {
    if (!protocol || !signingKey || !keyReady) throw new Error('MERCHANT_KEY_REQUIRED');
    const fresh = await protocol.offer(id); assertCurrent(); const value = fresh.value;
    if (value.seller !== account) throw new Error('MERCHANT_SCOPE_CHANGED');
    const reserved = value.reservation.tag === 'Active' ? value.reservation.values[0] : null;
    const action = reserved ? 'reserved' : pickupAction;
    const who = reserved?.claimant ?? claimant;
    if (!StrKey.isValidEd25519PublicKey(who)) { setError('Enter the collector’s Stellar account.'); return; }
    if (value.state !== 0 && value.state !== 1) throw new Error('OFFER_STATE_CHANGED');
    const receipt: PickupReceipt = { offer_id: id, claimant: who, terms_hash: value.terms_hash.toString('hex'), key_epoch: signingKey.scope.keyEpoch, sequence: (reserved?.sequence ?? value.sequence + 1n).toString(), valid_from: fresh.ledger, valid_until: fresh.ledger + 12, max_price: estimatedPrice(value, fresh.ledger).toString(), nonce: nonce() };
    const leaseUntil = action === 'reserve' ? fresh.ledger + value.terms.lease_ledgers : undefined;
    const request = { scope: signingKey.scope, action, receipt, ...(leaseUntil === undefined ? {} : { leaseUntil }) };
    const signature = await signPickup(signingKey, request); assertCurrent();
    setIssued({ version: 1, kind: 'AgyionPickup', contract: getMarketRelease().contract, action, receipt, signature, ...(leaseUntil === undefined ? {} : { leaseUntil }) });
    setRecord(fresh); setNotice('Code expires after 12 ledgers. Share it with the named collector.');
  });
  const reviewCode = () => doWork(async assertCurrent => {
    if (!protocol) throw new Error('WALLET_SESSION_CHANGED');
    const packet = parsePickupCode(code, getMarketRelease().contract), receipt = packet.receipt;
    if (receipt.offer_id !== id || receipt.claimant !== account) throw new Error('PICKUP_SCOPE_MISMATCH');
    const fresh = await protocol.offer(id); assertCurrent();
    const value = fresh.value, reserved = value.reservation.tag === 'Active' ? value.reservation.values[0] : null;
    if (receipt.terms_hash !== value.terms_hash.toString('hex') || receipt.valid_from < value.start_ledger || receipt.valid_until < receipt.valid_from || receipt.valid_until - receipt.valid_from > 12 || fresh.ledger < receipt.valid_from || fresh.ledger > receipt.valid_until) throw new Error('PICKUP_WINDOW_OR_SCOPE_CHANGED');
    if (packet.action === 'reserved') {
      if (value.state !== 1 || !reserved || reserved.claimant !== account || receipt.sequence !== reserved.sequence.toString() || receipt.key_epoch !== reserved.merchant.epoch || fresh.ledger > reserved.lease_until) throw new Error('RESERVED_PICKUP_CHANGED');
    } else if (fresh.ledger > value.deadline_ledger || value.state !== 0 || reserved || receipt.sequence !== (value.sequence + 1n).toString()) throw new Error('OFFER_STATE_CHANGED');
    const quote = estimatedPrice(value, packet.action === 'walk-in' ? receipt.valid_from : fresh.ledger);
    if (quote > BigInt(receipt.max_price)) throw new Error('PICKUP_PRICE_CHANGED');
    // This is a fresh contract quote, not a claim that the pasted signature is
    // authentic. The lifecycle verifies that signature before wallet access.
    setRecord(fresh); setAcceptedCode(packet); setAcceptedPrice(quote);
  });
  const submitCode = () => doWork(async assertCurrent => {
    const packet = parsePickupCode(code, getMarketRelease().contract);
    if (packet.receipt.offer_id !== id || packet.receipt.claimant !== account) throw new Error('PICKUP_SCOPE_MISMATCH');
    if (!acceptedCode || JSON.stringify(packet) !== JSON.stringify(acceptedCode)) throw new Error('PICKUP_REVIEW_REQUIRED');
    const result = await execute(packet.action === 'reserve' ? { action: 'reserve', receipt: packet.receipt, leaseUntil: packet.leaseUntil!, signature: packet.signature } : { action: packet.action === 'walk-in' ? 'settle_walk_in' : 'settle_reserved', receipt: packet.receipt, signature: packet.signature });
    assertCurrent();
    if (result?.status === 'confirmed') { await refresh(); assertCurrent(); setNotice(packet.action === 'reserve' ? 'Reservation confirmed on testnet.' : 'Pickup payment confirmed on testnet.'); setCode(''); }
    else if (result) setNotice('The operation is not confirmed. Check Recovery.');
  });
  const publish = () => doWork(async assertCurrent => {
    if (!protocol || !signingKey || !draft || !owner || !merchantKeyBackupChecked(signingKey)) throw new Error('MERCHANT_KEY_REQUIRED');
    const fresh = await protocol.offer(id); assertCurrent();
    const currentMerchant = await protocol.merchant(fresh.value.seller); assertCurrent();
    const hash = await metadataHash(draft.metadata); assertCurrent();
    if (!currentMerchant.value || currentMerchant.value.epoch !== signingKey.scope.keyEpoch || currentMerchant.value.public_key.toString('hex') !== signingKey.publicKey || fresh.value.terms.metadata_hash.toString('hex') !== hash) throw new Error('PUBLICATION_SCOPE_MISMATCH');
    const history = await protocol.history(); assertCurrent();
    if (history.some(row => row.attempt.kind === 'publication' && row.attempt.publication.offerId === id && !row.terminal)) throw new Error('PENDING_PUBLICATION');
    // The service supplies a revision hint only. It still atomically rejects a
    // concurrent publisher; no retry or new revision is silently generated.
    const current = await createMarketCatalog().currentPublication(id); assertCurrent();
    const now = Math.floor(Date.now() / 1000);
    const p: Publication = { version: 1, action: 'publish-offer', networkId: getMarketRelease().networkId, contract: getMarketRelease().contract, offerId: id, seller: fresh.value.seller, keyEpoch: currentMerchant.value.epoch, revision: current.revision + 1, termsHash: fresh.value.terms_hash.toString('hex'), metadataHash: fresh.value.terms.metadata_hash.toString('hex'), issuedAt: now, expiresAt: Math.min(now + 3600, draft.metadata.pickupEnd), nonce: nonce(), metadata: draft.metadata };
    const signature = await signPublication(signingKey, p); assertCurrent();
    const result = await protocol.publish(p, signature); assertCurrent();
    setNotice(result.status === 'accepted' ? 'Listing published for up to one hour. Renew explicitly while the offer stays open.' : result.status === 'known_not_sent' ? 'Not published. The request was cancelled before sending.' : 'Publication needs reconciliation. Check Recovery before publishing again.'); onPublished();
  });
  return <section className="market-offer" aria-label={`Offer ${id}`}>
    <div className="market-section-heading"><div><h3>{metadataMatches ? draft!.metadata.title : `Offer ${id}`}</h3><p>Contract record #{id}</p></div><div className="market-actions"><button type="button" className="btn btn-secondary" disabled={!active || loading || working || busy} onClick={() => void refresh()}>Refresh</button><button type="button" className="btn btn-secondary" onClick={onClose}>Back</button></div></div>
    {loading && <p role="status">Checking the contract…</p>}
    {offer && <>
      <div className="market-price-focus"><span>{['Open', 'Reserved', 'Settled', 'Refunded'][offer.state]}</span><strong>{priceLabel} <small>{assetName(offer.terms.asset)}</small></strong><p>Observed ledger {record!.ledger}{offer.state === 2 ? ' · Recorded settlement amount' : offer.state === 3 ? ' · Funding returned to seller' : reservation ? ' · Reservation price is fixed' : ' · A pickup code fixes a short lived quote'}</p></div>
      <p className="market-caption market-account">Seller {offer.seller}</p>
      {metadataMatches && <dl className="market-pickup-details"><div><dt>Collect from</dt><dd>{draft!.metadata.shopName}<br />{draft!.metadata.address}</dd></div><div><dt>Quantity</dt><dd>{draft!.metadata.quantity}</dd></div><div><dt>Pickup window</dt><dd>{new Date(draft!.metadata.pickupStart * 1000).toLocaleString()} to {new Date(draft!.metadata.pickupEnd * 1000).toLocaleString()}</dd></div>{(['allergens', 'storage', 'accessibility'] as const).filter(key => draft!.metadata[key]).map(key => <div key={key}><dt>{key === 'allergens' ? 'Allergens' : key === 'storage' ? 'Storage' : 'Collection notes'}</dt><dd>{draft!.metadata[key]}</dd></div>)}</dl>}
      {!metadataMatches && <p className="market-notice">No matching public listing file is loaded. The contract balance and state remain independently verifiable.</p>}
      {owner && <details className="market-terms" open><summary>Merchant actions</summary>
        {!metadataMatches && <label>Public listing file<input type="file" accept=".json,application/json" disabled={working || busy} onChange={event => { const file = event.target.files?.[0]; if (file) void doWork(async assertCurrent => { const loaded = await readListingFile(file); assertCurrent(); const hash = await metadataHash(loaded.metadata); assertCurrent(); if (hash !== offer.terms.metadata_hash.toString('hex')) throw new Error('LISTING_SCOPE_MISMATCH'); setDraft(loaded); }); }} /></label>}
        {metadataMatches && offer.state === 0 && <button type="button" className="btn btn-secondary" disabled={!active || !protocol || !keyReady || working || busy} onClick={() => void publish()}>Publish or renew listing</button>}
        {(offer.state === 0 || offer.state === 1) && <><p className="market-caption">Only sign a pickup when you are ready to authorize that collector. A signature does not prove physical delivery.</p>
          <div className="market-form-grid"><label>Collector account<input value={reservation?.claimant ?? claimant} readOnly={!!reservation} disabled={working || busy} onChange={e => { setClaimant(e.target.value); setIssued(null); }} placeholder="G…" /></label><label>Authorization<select value={reservation ? 'reserved' : pickupAction} disabled={!!reservation || working || busy} onChange={e => { setPickupAction(e.target.value as PickupAction); setIssued(null); }}><option value="walk-in">Pay at pickup</option>{offer.terms.lease_ledgers > 0 && <option value="reserve">Short reservation</option>}{reservation && <option value="reserved">Complete reserved pickup</option>}</select></label></div>
          {!keyReady && <p className="market-notice">Restore the merchant key at epoch {requiredMerchant?.epoch ?? '?'} in Sell.</p>}
          <button type="button" className="btn btn-primary" disabled={!active || !protocol || !keyReady || working || busy} onClick={() => void issue()}>Create pickup code</button>
        </>}
        {issued && <div className="market-code"><p>Collector {issued.receipt.claimant.slice(0, 8)}…{issued.receipt.claimant.slice(-8)} · Maximum payment {units(issued.receipt.max_price)} {assetName(offer.terms.asset)}</p><textarea aria-label="Signed pickup code" readOnly value={JSON.stringify(issued)} /><button type="button" className="btn btn-secondary" onClick={() => void doWork(async assertCurrent => { try { await navigator.clipboard.writeText(JSON.stringify(issued)); assertCurrent(); setNotice('Pickup code copied.'); } catch { assertCurrent(); setNotice('Select and copy the code above.'); } })}>Copy pickup code</button></div>}
        {metadataMatches && <button type="button" className="market-text-button" onClick={() => publicDownload(`agyion-listing-${id}.json`, draft)}>Download public listing file</button>}
      </details>}
      {!owner && (offer.state === 0 || offer.state === 1) && <div className="market-redeem"><h4>Have a code from the merchant?</h4><p>Give the merchant your connected account, then paste their pickup or reservation code.</p><label>Pickup code<textarea value={code} maxLength={8192} onChange={e => { setCode(e.target.value); setAcceptedCode(null); setAcceptedPrice(null); }} disabled={working || busy} /></label>
        {!acceptedCode && <button type="button" className="btn btn-secondary" disabled={!active || !protocol || !account || !code || busy || working} onClick={() => void reviewCode()}>Review code</button>}
        {acceptedCode && <div className="market-code-review"><p>{acceptedCode.action === 'reserve' ? 'Reserve this pickup' : 'Confirm pickup and payment'} · Maximum payment {units(acceptedCode.receipt.max_price)} {assetName(offer.terms.asset)}</p>{acceptedPrice !== null && <p>{acceptedPrice < 0n ? `Quoted payout ${units(-acceptedPrice)}` : `Quoted payment ${units(acceptedPrice)}`} {assetName(offer.terms.asset)}{acceptedCode.action === 'reserve' ? ' · The final reservation price is set when included.' : ` · Fixed at ledger ${acceptedCode.action === 'reserved' ? reservation?.claimed_at : acceptedCode.receipt.valid_from}`}</p>}<p>Valid through ledger {acceptedCode.receipt.valid_until}. Network fee is reviewed separately.</p><button type="button" className="btn btn-primary" disabled={!active || !protocol || busy || working} onClick={() => void submitCode()}>{acceptedCode.action === 'reserve' ? 'Confirm reservation' : 'Confirm pickup payment'}</button></div>}
      </div>}
      <div className="market-actions">
        {reservation && reservation.claimant === account && <button type="button" className="btn btn-secondary" disabled={!active || !protocol || working || busy} onClick={() => void doWork(async assertCurrent => { const result = await execute({ action: 'cancel_reservation', offerId: id, sequence: reservation.sequence.toString() }); assertCurrent(); if (result?.status === 'confirmed') await refresh(); })}>Cancel my reservation</button>}
        {reservation && record!.ledger > reservation.lease_until && <button type="button" className="btn btn-secondary" disabled={!active || !protocol || working || busy} onClick={() => void doWork(async assertCurrent => { const result = await execute({ action: 'expire_reservation', offerId: id }); assertCurrent(); if (result?.status === 'confirmed') await refresh(); })}>Release expired reservation</button>}
        {(offer.state === 0 || offer.state === 1) && record!.ledger > offer.deadline_ledger && (!reservation || record!.ledger > reservation.lease_until) && <button type="button" className="btn btn-secondary" disabled={!active || !protocol || working || busy} onClick={() => void doWork(async assertCurrent => { const result = await execute({ action: 'refund', offerId: id }); assertCurrent(); if (result?.status === 'confirmed') await refresh(); })}>Return funding to seller</button>}
      </div>
    </>}
    {notice && <p role="status" className="market-notice">{notice}</p>}{error && <p role="alert" className="market-error">{error}</p>}
  </section>;
}
