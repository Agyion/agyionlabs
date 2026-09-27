import { Buffer } from 'buffer';
import { address, exact, hex32, parseMetadata, receiptBytes, requireValue, termsBytes, uint32 } from '../../../../market/shared/codec';
import type { Metadata, OfferTerms, PickupAction, PickupReceipt } from '../../../../market/shared/codec';
import type { Offer } from '../../../../market/client/spec';

export const NATIVE_MARKET_ASSET = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
export const USDC_MARKET_ASSET = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
export function assetName(asset: string): string { return asset === NATIVE_MARKET_ASSET ? 'XLM' : asset === USDC_MARKET_ASSET ? 'USDC' : 'Unknown asset'; }
export function amount(value: string, signed = false): bigint {
  requireValue((signed ? /^-?(?:0|[1-9]\d*)(?:\.\d{1,7})?$/ : /^(?:0|[1-9]\d*)(?:\.\d{1,7})?$/).test(value) && value.length <= 42, 'Use a decimal amount with at most seven places.');
  const negative = value.startsWith('-'), [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  const result = (BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, '0'))) * (negative ? -1n : 1n);
  requireValue(result > -(1n << 127n) && result < 1n << 127n, 'Amount is outside the supported range.');
  return result;
}
export function units(value: bigint | string): string {
  const n = BigInt(value), magnitude = n < 0n ? -n : n;
  const fraction = (magnitude % 10_000_000n).toString().padStart(7, '0').replace(/0+$/, '');
  return `${n < 0n ? '−' : ''}${magnitude / 10_000_000n}${fraction ? '.' + fraction : ''}`;
}
export function estimatedPrice(offer: Offer, ledger: number): bigint {
  uint32(ledger, 1);
  if (offer.reservation.tag === 'Active') return offer.reservation.values[0].price;
  const decline = offer.terms.slope_num * BigInt(Math.max(0, ledger - offer.start_ledger)) / offer.terms.slope_den;
  const price = offer.terms.start_price - decline;
  return price < offer.terms.floor_price ? offer.terms.floor_price : price;
}
export function coordinate(value: string, latitude: boolean): number {
  requireValue(/^-?(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value), 'Use coordinates with at most six decimal places.');
  const scaled = amount(value, true) / 10n;
  const limit = latitude ? 90_000_000n : 180_000_000n;
  requireValue(scaled >= -limit && scaled <= limit, 'Coordinate is outside the map.');
  return Number(scaled);
}
export function ledgerDuration(minutes: string, max: number, allowZero = false): number {
  requireValue(minutes.length <= 10 && /^(0|[1-9]\d*)$/.test(minutes), 'Enter whole minutes.');
  const ledgers = BigInt(minutes) * 12n;
  requireValue(ledgers >= (allowZero ? 0n : 12n) && ledgers <= BigInt(max), 'Duration is outside the supported range.');
  return Number(ledgers);
}
export interface ListingDraft { version: 1; kind: 'AgyionPublicListing'; metadata: Metadata; terms: OfferTerms }
export function parseListingDraft(value: unknown): ListingDraft {
  const draft = exact(value, ['version', 'kind', 'metadata', 'terms']);
  requireValue(draft.version === 1 && draft.kind === 'AgyionPublicListing', 'Choose an Agyion listing file.');
  const metadata = parseMetadata(draft.metadata), terms = draft.terms as OfferTerms;
  termsBytes(terms);
  requireValue(BigInt(terms.pot) > 0n && BigInt(terms.start_price) >= BigInt(terms.floor_price) && BigInt(terms.slope_num) >= 0n && BigInt(terms.slope_den) > 0n, 'Listing prices are invalid.');
  requireValue(BigInt(terms.floor_price) >= -BigInt(terms.pot) && terms.duration_ledgers <= 1_000_000 && terms.lease_ledgers <= 720, 'Listing limits exceed their funding.');
  return { version: 1, kind: 'AgyionPublicListing', metadata, terms: { ...terms } };
}
export interface PickupCode { version: 1; kind: 'AgyionPickup'; contract: string; action: PickupAction; receipt: PickupReceipt; signature: string; leaseUntil?: number }
export function parsePickupCode(value: string, expectedContract: string): PickupCode {
  requireValue(value.length > 0 && value.length <= 8192, 'Paste a complete pickup code.');
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error('Pickup code is not valid JSON.'); }
  requireValue(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed), 'Pickup code is invalid.');
  const raw = exact(parsed, Object.hasOwn(parsed as object, 'leaseUntil') ? ['version', 'kind', 'contract', 'action', 'receipt', 'signature', 'leaseUntil'] : ['version', 'kind', 'contract', 'action', 'receipt', 'signature']);
  requireValue(raw.version === 1 && raw.kind === 'AgyionPickup' && address(raw.contract, true) === expectedContract, 'Pickup code belongs to a different release.');
  requireValue(raw.action === 'walk-in' || raw.action === 'reserved' || raw.action === 'reserve', 'Unknown pickup action.');
  receiptBytes(raw.receipt as PickupReceipt);
  requireValue(typeof raw.signature === 'string' && /^[a-f0-9]{128}$/.test(raw.signature), 'Pickup signature is invalid.');
  if (raw.action === 'reserve') uint32(raw.leaseUntil, 1); else requireValue(raw.leaseUntil === undefined, 'Unexpected reservation time.');
  return raw as unknown as PickupCode;
}
export function nonce(): string { return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex'); }
export function publicDownload(name: string, value: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function readListingFile(file: File): Promise<ListingDraft> {
  let size: number;
  try {
    Object.getOwnPropertyDescriptor(File.prototype, 'name')!.get!.call(file);
    size = Object.getOwnPropertyDescriptor(Blob.prototype, 'size')!.get!.call(file) as number;
    requireValue(size > 0 && size <= 16_384);
  } catch { throw new Error('Select a bounded listing file smaller than 16 KB.'); }
  const bytes = await Blob.prototype.arrayBuffer.call(file) as ArrayBuffer;
  requireValue(bytes.byteLength === size && bytes.byteLength <= 16_384, 'Listing file size differs.');
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw new Error('Listing file is invalid.'); }
  const result = parseListingDraft(parsed); hex32(result.terms.metadata_hash); return result;
}
