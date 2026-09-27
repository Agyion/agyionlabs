"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { createMarketCatalog, type CatalogListing, type MarketQuery } from '../../../../market/client/catalog';
import { assetName, units } from '../../lib/market/forms';
import MarketMap from './MarketMap';

export default function MarketBrowse({ active, onSelect, selectedId, refreshToken = 0 }: {
  active: boolean; onSelect(listing: CatalogListing): void; selectedId?: string; refreshToken?: number;
}) {
  const [listings, setListings] = useState<readonly CatalogListing[]>([]);
  const [query, setQuery] = useState<MarketQuery>({});
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const request = useRef(0);
  useEffect(() => {
    if (!active) return;
    const control = new AbortController(), requestRef = request, ticket = ++requestRef.current;
    setLoading(true); setError(null); setListings([]); setNext(null);
    Promise.resolve().then(() => createMarketCatalog().list(query, control.signal)).then(result => {
      if (control.signal.aborted || ticket !== request.current) return;
      setListings(result.records); setNext(result.next);
    }).catch(() => {
      if (!control.signal.aborted && ticket === request.current) setError('The live catalog could not be checked. Try again.');
    }).finally(() => { if (!control.signal.aborted && ticket === request.current) setLoading(false); });
    return () => { control.abort(); requestRef.current++; };
  }, [active, query, refresh, refreshToken]);
  const choose = useCallback((id: string) => {
    const listing = listings.find(item => item.publication.offerId === id);
    if (listing) onSelect(listing);
  }, [listings, onSelect]);

  return <section className="market-browse" aria-label="Fade listings">
    <div className="market-section-heading"><div><h3>Find a pickup</h3><p>Public listings · Stellar testnet</p></div>
      <button type="button" className="btn btn-secondary" onClick={() => setRefresh(value => value + 1)} disabled={loading}>Refresh</button></div>
    <MarketMap active={active} listings={listings.map(item => ({ id: item.publication.offerId, title: item.publication.metadata.title, shopName: item.publication.metadata.shopName, latE6: item.publication.metadata.latE6, lonE6: item.publication.metadata.lonE6 }))}
      selectedId={selectedId} onSelect={choose} onArea={bbox => setQuery({ bbox })} />
    {query.shop && <div className="market-filter"><span>{listings[0]?.publication.metadata.shopName ?? 'Selected shop'}</span><button type="button" onClick={() => setQuery({})}>All shops</button></div>}
    {query.bbox && <div className="market-filter"><span>Selected map area</span><button type="button" onClick={() => setQuery({})}>All areas</button></div>}
    {loading && <p role="status" className="market-empty">Checking the catalog…</p>}
    {error && <p role="alert" className="market-error">{error}</p>}
    {!loading && !error && listings.length === 0 && <div className="market-empty"><h4>No active listings here</h4><p>A merchant can publish a funded testnet offer from Sell.</p></div>}
    <div className="market-listings">{listings.map(listing => {
      const { publication: p, terms } = listing, metadata = p.metadata;
      return <article className="market-card" key={p.offerId} data-selected={p.offerId === selectedId || undefined}>
        <button type="button" className="market-shop-link" onClick={() => setQuery({ shop: { id: metadata.shopId, seller: p.seller } })}>{metadata.shopName}</button>
        <h4>{metadata.title}</h4><p>{metadata.quantity}</p><p className="market-address">{metadata.address}</p>
        <div className="market-card-price"><span>{units(terms.start_price)}</span><span aria-hidden="true">→</span><span>{units(terms.floor_price)} {assetName(terms.asset)}</span></div>
        <p className="market-caption">Price range. Check the current contract state before pickup.</p>
        <button type="button" className="btn btn-primary" onClick={() => onSelect(listing)}>View pickup</button>
      </article>;
    })}</div>
    {next && <button type="button" className="btn btn-secondary" onClick={() => setQuery(current => ({ ...current, after: next }))}>Next listings</button>}
  </section>;
}
