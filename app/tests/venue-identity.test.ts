import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { newKeypair, publicKeyHex } from '../app/lib/signers';

let storage: Storage;
beforeEach(() => {
  vi.resetModules();
  const values = new Map<string, string>();
  storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); }, clear: () => values.clear(), key: index => Array.from(values.keys())[index] ?? null, get length() { return values.size; } };
  vi.stubGlobal('window', { sessionStorage: storage });
});
afterEach(() => vi.unstubAllGlobals());

it('reuses a valid legacy identity and keeps it recoverable after the legacy slot changes', async () => {
  const first = newKeypair(), second = newKeypair();
  storage.setItem('agyion.venueSecret', first.secret);
  const { getOrCreateVenueIdentity, findVenueIdentity } = await import('../app/lib/venueIdentity');
  const recovered = getOrCreateVenueIdentity();
  expect(recovered.pubkeyHex).toBe(first.pubkeyHex);
  storage.setItem('agyion.venueSecret', second.secret);
  expect(getOrCreateVenueIdentity().pubkeyHex).toBe(first.pubkeyHex);
  expect(publicKeyHex(findVenueIdentity(first.pubkeyHex)!.secret)).toBe(first.pubkeyHex);
  expect(findVenueIdentity('00'.repeat(32))).toBeNull();
});

it('does not return a stored secret under the wrong public identity', async () => {
  const first = newKeypair(), second = newKeypair();
  storage.setItem(`agyion.venueSecret.v1:${first.pubkeyHex}`, second.secret);
  const { findVenueIdentity } = await import('../app/lib/venueIdentity');
  expect(findVenueIdentity(first.pubkeyHex)).toBeNull();
});

it('does not silently rotate when sessionStorage is unavailable within the same document', async () => {
  storage.getItem = () => { throw new Error('Storage denied'); };
  storage.setItem = () => { throw new Error('Storage denied'); };
  const { getOrCreateVenueIdentity, findVenueIdentity } = await import('../app/lib/venueIdentity');
  const first = getOrCreateVenueIdentity();
  expect(getOrCreateVenueIdentity().pubkeyHex).toBe(first.pubkeyHex);
  expect(publicKeyHex(findVenueIdentity(first.pubkeyHex)!.secret)).toBe(first.pubkeyHex);
});
