// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
const load = () => import('../../shared/flight-preference');
beforeEach(() => { vi.restoreAllMocks(); vi.resetModules(); localStorage.clear(); });
describe('remembered launch animation preference', () => {
  it('starts with animation enabled and remembers an explicit choice across document modules', async () => {
    const preference = await load();
    expect(preference.readSkipFlightPreference()).toBe(false);
    preference.writeSkipFlightPreference(true);
    expect(localStorage.getItem(preference.SKIP_FLIGHT_STORAGE_KEY)).toBe('1');
    vi.resetModules();
    expect((await load()).readSkipFlightPreference()).toBe(true);
  });
  it('keeps the current choice in memory when browser storage is unavailable', async () => {
    const preference = await load();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(preference.readSkipFlightPreference()).toBe(false);
    preference.writeSkipFlightPreference(true);
    expect(preference.readSkipFlightPreference()).toBe(true);
    preference.writeSkipFlightPreference(false);
    expect(preference.readSkipFlightPreference()).toBe(false);
  });
  it('reads another tab\'s saved choice after the UI has unmounted without subscribers', async () => {
    const preference = await load();
    preference.writeSkipFlightPreference(true);
    localStorage.setItem(preference.SKIP_FLIGHT_STORAGE_KEY, '0');
    expect(preference.readSkipFlightPreference()).toBe(false);
  });
  it('updates subscribers in this tab and accepts changes from another tab', async () => {
    const preference = await load(); const listener = vi.fn();
    const off = preference.subscribeSkipFlightPreference(listener);
    preference.writeSkipFlightPreference(true);
    expect(listener).toHaveBeenCalledOnce();
    localStorage.setItem(preference.SKIP_FLIGHT_STORAGE_KEY, '0');
    window.dispatchEvent(new StorageEvent('storage', { key: preference.SKIP_FLIGHT_STORAGE_KEY }));
    expect(preference.readSkipFlightPreference()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' }));
    expect(listener).toHaveBeenCalledTimes(2);
    off(); preference.writeSkipFlightPreference(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });
  it('treats malformed saved values as animation enabled', async () => {
    const preference = await load();
    localStorage.setItem(preference.SKIP_FLIGHT_STORAGE_KEY, 'true');
    expect(preference.readSkipFlightPreference()).toBe(false);
  });
});
