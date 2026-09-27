export const SKIP_FLIGHT_STORAGE_KEY = 'agyion:skip-flight';
const CHANGE_EVENT = 'agyion:flight-preference';
// Only unsaved choices need a fallback; otherwise read other tabs' latest value.
let currentChoice: boolean | undefined;

export function readSkipFlightPreference(): boolean {
  if (currentChoice !== undefined) return currentChoice;
  if (typeof window === 'undefined') return false;
  try { return window.localStorage.getItem(SKIP_FLIGHT_STORAGE_KEY) === '1'; }
  catch { return false; }
}

export function writeSkipFlightPreference(skip: boolean): void {
  if (typeof window === 'undefined') return;
  currentChoice = skip;
  try {
    window.localStorage.setItem(SKIP_FLIGHT_STORAGE_KEY, skip ? '1' : '0');
    currentChoice = undefined;
  }
  catch { /* Keep the explicit choice for this document. */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeSkipFlightPreference(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== SKIP_FLIGHT_STORAGE_KEY) return;
    currentChoice = undefined;
    listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}
