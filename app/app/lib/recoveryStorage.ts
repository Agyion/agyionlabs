/** Immutable public recovery records; unrelated tabs never rewrite a shared array. */
const memory = new Map<string, string>();
const local = () => typeof window === 'undefined' ? null : window.localStorage;
function read(key: string): string | null { return local()?.getItem(key) ?? (typeof window === 'undefined' ? memory.get(key) ?? null : null); }
export function readRecoveryArray<T>(key: string, valid: (value: unknown) => value is T): T[] {
  try {
    const value: unknown = JSON.parse(read(key) ?? '[]');
    if (!Array.isArray(value) || value.length > 10_000 || !value.every(valid)) throw new Error('corrupt');
    return value;
  } catch { throw new Error('Recovery storage is unreadable or corrupt. New transactions are blocked.'); }
}
export function readRecoveryRecords<T>(prefix: string, valid: (value: unknown) => value is T): T[] {
  try {
    const storage = local();
    const keys = storage ? Array.from({length:storage.length}, (_, index) => storage.key(index)).filter((key): key is string => !!key && key.startsWith(prefix)) : [...memory.keys()].filter(key=>key.startsWith(prefix));
    if (keys.length > 10_000) throw new Error('full');
    return keys.map(key => {
      const value: unknown = JSON.parse(read(key) ?? 'null');
      if (!valid(value)) throw new Error('corrupt');
      return value;
    });
  } catch { throw new Error('Recovery storage is unreadable or corrupt. New transactions are blocked.'); }
}
export function writeRecoveryRecord(prefix: string, id: string, value: unknown, event: string): void {
  try {
    const key = prefix + id;
    if (read(key) !== null) throw new Error('Record already exists');
    const json = JSON.stringify(value), storage = local();
    if (storage) storage.setItem(key, json); else memory.set(key, json);
  } catch { throw new Error('Cannot save transaction recovery storage. Nothing new was sent.'); }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(event));
}
export function appendRecoveryEvidence(prefix: string, value: unknown, event: string): void {
  try { writeRecoveryRecord(prefix, crypto.randomUUID(), value, event); }
  catch {
    const hash = value && typeof value === 'object' && 'hash' in value ? value.hash : undefined;
    const reference = typeof hash === 'string' && /^[a-f0-9]{64}$/i.test(hash) ? ` ${hash}` : '';
    throw new Error(`Could not save the latest transaction outcome. It may have been sent; check${reference} in transaction activity before retrying.`);
  }
}
/** Fail closed when the browser cannot coordinate signing across its tabs. */
export async function withRecoveryLock<T>(intent: string, action: () => Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks) throw new Error('This browser cannot safely coordinate transaction recovery. Use a browser with Web Locks support. Nothing was sent.');
  return navigator.locks.request(`agyion:recovery:${intent}`, {ifAvailable:true}, lock => {
    if (!lock) throw new Error('This transaction is already awaiting a wallet or network result in another tab.');
    return action();
  });
}
