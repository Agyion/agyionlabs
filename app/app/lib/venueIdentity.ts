import { newKeypair, publicKeyHex } from './signers';

export interface VenueIdentity { secret: string; pubkeyHex: string }
const DEFAULT_KEY = 'agyion.venueDefault.v1';
const PREFIX = 'agyion.venueSecret.v1:';
const LEGACY_KEY = 'agyion.venueSecret';
// Only storage failures use this fallback. Its lifetime is this document, never
// localStorage. Successful session writes do not leave a second hidden copy.
const unavailableStorage = new Map<string, string>();

function read(key: string): string | null {
  try { return window.sessionStorage.getItem(key) ?? unavailableStorage.get(key) ?? null; }
  catch { return unavailableStorage.get(key) ?? null; }
}
function write(key: string, value: string): void {
  try { window.sessionStorage.setItem(key, value); unavailableStorage.delete(key); }
  catch { unavailableStorage.set(key, value); }
}
function identity(secret: string | null, expected?: string): VenueIdentity | null {
  if (!secret) return null;
  try {
    const pubkeyHex = publicKeyHex(secret).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(pubkeyHex) || (expected && pubkeyHex !== expected.toLowerCase())) return null;
    return { secret, pubkeyHex };
  } catch { return null; }
}

/** Read only the generated demo identity matching this record; never save pasted keys. */
export function findVenueIdentity(pubkey: string): VenueIdentity | null {
  if (!/^[a-f0-9]{64}$/i.test(pubkey)) return null;
  const publicKey = pubkey.toLowerCase();
  return identity(read(PREFIX + publicKey), publicKey) ?? identity(read(LEGACY_KEY), publicKey);
}

/** Reuse this session's identity. Visiting a form must not rotate a signing key. */
export function getOrCreateVenueIdentity(): VenueIdentity {
  const defaultKey = read(DEFAULT_KEY);
  const existing = defaultKey ? findVenueIdentity(defaultKey) : null;
  if (existing) return existing;
  const chosen = identity(read(LEGACY_KEY)) ?? newKeypair();
  write(PREFIX + chosen.pubkeyHex.toLowerCase(), chosen.secret);
  write(DEFAULT_KEY, chosen.pubkeyHex.toLowerCase());
  return { secret: chosen.secret, pubkeyHex: chosen.pubkeyHex.toLowerCase() };
}
