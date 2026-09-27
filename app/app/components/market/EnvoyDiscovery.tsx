"use client";

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CatalogListing } from '../../../../market/client/catalog';
import MarketBrowse from './MarketBrowse';

/** Public discovery only. Private note authority never crosses into a market action. */
export default function EnvoyDiscovery({ active }: { active: boolean }) {
  const [open, setOpen] = useState(false), router = useRouter();
  const select = useCallback((listing: CatalogListing) => {
    const id = listing.publication.offerId;
    if (!/^[1-9]\d{0,19}$/.test(id) || BigInt(id) >= 1n << 64n) return;
    router.push(`/app/?tab=fade&marketOffer=${id}`, { scroll: false });
  }, [router]);
  return <details className="instrument-technical market-panel" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Find public pickups</summary>
    <p className="market-caption">Browse the public Fade catalog. Reserving or collecting still requires the merchant’s code and your wallet approval.</p>
    {open && <MarketBrowse active={active && open} onSelect={select} />}
  </details>;
}
