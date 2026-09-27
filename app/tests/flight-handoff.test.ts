// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLIGHT_BRIDGE_SCRIPT, readFlightHandoff, writeFlightHandoff, validArrivalPose } from '../../shared/flight-handoff';
import { SKIP_FLIGHT_STORAGE_KEY } from '../../shared/flight-preference';

const pose = { elapsed: 48, ringFocus: .1, yaw: -.08, pitch: .12, zoom: 0 };
const image = 'data:image/webp;base64,UklGRg==';
beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  const root = document.createElement('div'); root.id = 'agyion-flight-bridge-root'; document.body.appendChild(root);
});
afterEach(() => { document.getElementById('agyion-flight-bridge-root')?.remove(); document.getElementById('agyion-flight-bridge')?.remove(); vi.restoreAllMocks(); });

describe('cross-document flight handoff', () => {
  it('carries an independent gas clock and still accepts earlier handoffs without one', () => {
    writeFlightHandoff(sessionStorage, { ...pose, flowTime: 77 }, image, 10000);
    expect(readFlightHandoff(sessionStorage, 10010).pose).toEqual({ ...pose, flowTime: 77 });
    expect(validArrivalPose(pose)).toBe(true);
    for (const flowTime of [-1, NaN, Infinity, 20000001, '77', null]) {
      expect(validArrivalPose({ ...pose, flowTime })).toBe(false);
    }
  });

  it('clears an old flight before first paint when the saved skip preference is enabled', () => {
    writeFlightHandoff(sessionStorage, pose, image);
    localStorage.setItem(SKIP_FLIGHT_STORAGE_KEY, '1');
    const schedule = vi.fn();
    new Function('window', 'document', 'location', 'sessionStorage', 'setTimeout', FLIGHT_BRIDGE_SCRIPT)(
      { matchMedia: () => ({ matches: false }) }, document, { pathname: '/app/' }, sessionStorage, schedule,
    );
    expect(document.getElementById('agyion-flight-bridge')).toBeNull();
    expect(sessionStorage.getItem('agyion:arrival')).toBeNull();
    expect(sessionStorage.getItem('agyion:flight-frame')).toBeNull();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('commits a paired frame and pose and consumes them once', () => {
    writeFlightHandoff(sessionStorage, pose, image, 10000);
    expect(readFlightHandoff(sessionStorage, 10010)).toEqual({ arrival: true, pose, image });
    expect(readFlightHandoff(sessionStorage, 10020)).toEqual({ arrival: false });
  });

  it('marks a completed journey so app startup does not launch a second approach', () => {
    writeFlightHandoff(sessionStorage, pose, image, 10000, { settled: true });
    expect(readFlightHandoff(sessionStorage, 10010)).toEqual({ arrival: true, settled: true, pose, image });
    expect(readFlightHandoff(sessionStorage, 10020)).toEqual({ arrival: false });
  });

  it('carries an observed software renderer hint only with its fresh paired valid pose', () => {
    writeFlightHandoff(sessionStorage, pose, image, 10000, { settled: true, softwareGraphics: true });
    expect(readFlightHandoff(sessionStorage, 10010)).toEqual({ arrival: true, settled: true, pose, image, softwareGraphics: true });
    expect(readFlightHandoff(sessionStorage, 10020)).toEqual({ arrival: false });
  });

  it.each(['unpaired', 'stale', 'future', 'invalid-pose', 'legacy-pair', 'missing-frame'])('ignores software hints on %s handoffs', fault => {
    const frame = { at: 10000, id: 'flight', pose, softwareGraphics: true };
    sessionStorage.setItem('agyion:arrival', JSON.stringify({ at: 10000, id: fault === 'legacy-pair' ? undefined : 'flight', softwareGraphics: true }));
    if (fault === 'unpaired') frame.id = 'other';
    if (fault === 'stale') frame.at = -20000;
    if (fault === 'future') frame.at = 11000;
    if (fault === 'invalid-pose') frame.pose = { ...pose, zoom: 100 };
    sessionStorage.setItem('agyion:flight-frame', JSON.stringify({ ...frame, ...(fault === 'legacy-pair' ? { id: undefined } : {}) }));
    if (fault === 'missing-frame') sessionStorage.removeItem('agyion:flight-frame');
    expect(readFlightHandoff(sessionStorage, 10010).softwareGraphics).toBeUndefined();
  });

  it.each([false, 'true', 1, null])('ignores nontrue software metadata %s', softwareGraphics => {
    sessionStorage.setItem('agyion:arrival', JSON.stringify({ at: 10000, id: 'flight' }));
    sessionStorage.setItem('agyion:flight-frame', JSON.stringify({ at: 10000, id: 'flight', pose, softwareGraphics }));
    expect(readFlightHandoff(sessionStorage, 10010).softwareGraphics).toBeUndefined();
  });

  it('retains observed graphics metadata when only image storage exceeds quota', () => {
    const write = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (value.includes('data:image')) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      write.call(this, key, value);
    });
    writeFlightHandoff(sessionStorage, pose, image, 10000, { softwareGraphics: true });
    expect(readFlightHandoff(sessionStorage, 10010)).toEqual({ arrival: true, pose, image: undefined, softwareGraphics: true });
  });

  it('keeps a completed journey settled if its optional frame is unavailable', () => {
    writeFlightHandoff(sessionStorage, pose, image, 10000, { settled: true });
    sessionStorage.removeItem('agyion:flight-frame');
    expect(readFlightHandoff(sessionStorage, 10010)).toEqual({ arrival: true, settled: true });
  });

  it('does not reuse an orphan frame on a direct app visit', () => {
    sessionStorage.setItem('agyion:flight-frame', JSON.stringify({ at: 10000, pose, data: image }));
    expect(readFlightHandoff(sessionStorage, 10010)).toEqual({ arrival: false });
    expect(sessionStorage.getItem('agyion:flight-frame')).toBeNull();
  });

  it('rejects a frame from another flight even when both are fresh', () => {
    writeFlightHandoff(sessionStorage, pose, image, 10000);
    sessionStorage.setItem('agyion:arrival', JSON.stringify({ at: 10000, id: 'another-flight' }));
    expect(readFlightHandoff(sessionStorage, 10010)).toEqual({ arrival: true });
  });

  it('preserves the pose when image storage exceeds the quota', () => {
    const write = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (value.includes('data:image')) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      write.call(this, key, value);
    });
    writeFlightHandoff(sessionStorage, pose, image, 10000);
    expect(readFlightHandoff(sessionStorage, 10010)).toEqual({ arrival: true, pose, image: undefined });
  });

  it.each([9999, 40000])('rejects future/expired launches at %i', now => {
    writeFlightHandoff(sessionStorage, pose, image, 10000);
    expect(readFlightHandoff(sessionStorage, now)).toEqual({ arrival: false });
  });

  it('shows the validated frame before hydration and fails open if hydration never runs', () => {
    writeFlightHandoff(sessionStorage, pose, image);
    const schedule = vi.fn();
    const browser = { matchMedia: () => ({ matches: false }) };
    new Function('window', 'document', 'location', 'sessionStorage', 'setTimeout', FLIGHT_BRIDGE_SCRIPT)(browser, document, { pathname: '/app/' }, sessionStorage, schedule);
    const bridge = document.getElementById('agyion-flight-bridge');
    expect(bridge?.getAttribute('src')).toBe(image);
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 8000);
    expect(sessionStorage.getItem('agyion:arrival')).not.toBeNull();
    schedule.mock.calls[0][0]();
    expect(document.getElementById('agyion-flight-bridge')).toBeNull();
  });

  it('does not create the pre-hydration cover with reduced motion or an orphan frame', () => {
    writeFlightHandoff(sessionStorage, pose, image);
    const run = (reduced: boolean) => new Function('window', 'document', 'location', 'sessionStorage', 'setTimeout', FLIGHT_BRIDGE_SCRIPT)({ matchMedia: () => ({ matches: reduced }) }, document, { pathname: '/app/' }, sessionStorage, vi.fn());
    run(true);
    expect(document.getElementById('agyion-flight-bridge')).toBeNull();
    sessionStorage.removeItem('agyion:arrival'); run(false);
    expect(document.getElementById('agyion-flight-bridge')).toBeNull();
  });

  it('starts loading from the head and attaches only inside the parsed body root before hydration', async () => {
    document.getElementById('agyion-flight-bridge-root')?.remove();
    writeFlightHandoff(sessionStorage, pose, image);
    const create = document.createElement.bind(document);
    const images: HTMLImageElement[] = [];
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const element = create(tag);
      if (tag === 'img') images.push(element as HTMLImageElement);
      return element;
    }) as typeof document.createElement);
    const schedule = vi.fn();
    new Function('window', 'document', 'location', 'sessionStorage', 'setTimeout', FLIGHT_BRIDGE_SCRIPT)({ matchMedia: () => ({ matches: false }) }, document, { pathname: '/app/' }, sessionStorage, schedule);
    expect(images).toHaveLength(1);
    expect(images[0].src).toBe(image);
    expect(images[0].decoding).toBe('sync');
    expect(images[0].isConnected).toBe(false);
    expect(document.head.querySelector('img')).toBeNull();
    const root = document.createElement('div'); root.id = 'agyion-flight-bridge-root'; document.body.appendChild(root);
    await Promise.resolve();
    expect(root.firstElementChild).toBe(images[0]);
    expect(document.getElementById('agyion-flight-bridge')).toBe(images[0]);
    schedule.mock.calls[0][0]();
  });

  it('fails open before the body arrives without a late observer reviving the cover', async () => {
    document.getElementById('agyion-flight-bridge-root')?.remove();
    writeFlightHandoff(sessionStorage, pose, image);
    const schedule = vi.fn();
    new Function('window', 'document', 'location', 'sessionStorage', 'setTimeout', FLIGHT_BRIDGE_SCRIPT)({ matchMedia: () => ({ matches: false }) }, document, { pathname: '/app/' }, sessionStorage, schedule);
    schedule.mock.calls[0][0]();
    const root = document.createElement('div'); root.id = 'agyion-flight-bridge-root'; document.body.appendChild(root);
    await Promise.resolve();
    expect(root.children).toHaveLength(0);
  });

  it.each(['https://example.test/frame.webp', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/webp;base64,<script>'])('never preloads a disallowed image: %s', data => {
    writeFlightHandoff(sessionStorage, pose, data);
    const create = vi.spyOn(document, 'createElement');
    new Function('window', 'document', 'location', 'sessionStorage', 'setTimeout', FLIGHT_BRIDGE_SCRIPT)({ matchMedia: () => ({ matches: false }) }, document, { pathname: '/app/' }, sessionStorage, vi.fn());
    expect(create).not.toHaveBeenCalled();
  });
});
