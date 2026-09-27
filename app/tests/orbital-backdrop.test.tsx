// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const orbital = vi.hoisted(() => ({
  create: vi.fn(),
  handle: { setSelected: vi.fn(), previewInstrument: vi.fn(), setPanelOpen: vi.fn(), setPaused: vi.fn(), explore: vi.fn(), emitTransfer: vi.fn(), dispose: vi.fn() },
}));
vi.mock('../../shared/space-scene', () => ({ createOrbitalScene: orbital.create }));
import OrbitalBackdrop from '../app/components/app/OrbitalBackdrop';
import { writeFlightHandoff } from '../../shared/flight-handoff';
import { SKIP_FLIGHT_STORAGE_KEY } from '../../shared/flight-preference';

let visibility: (entries: Array<{ isIntersecting: boolean }>) => void;
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: typeof visibility) { visibility = callback; }
    observe() {}
    disconnect() {}
  });
  orbital.create.mockImplementation((_host, options) => {
    options.onReady();
    return orbital.handle;
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const saveFrame = (frame: { at: number; [key: string]: unknown }) => {
  sessionStorage.setItem('agyion:arrival', JSON.stringify({ at: frame.at }));
  sessionStorage.setItem('agyion:flight-frame', JSON.stringify(frame));
};
const props = () => ({ selected: 'fade', reduced: false, onSelect: vi.fn(), onArrival: vi.fn(), exploreRequest: 0, panelOpen: false });

describe('interactive orbital backdrop', () => {
  it('ignores a saved arrival when launch animation is disabled and keeps ambient motion', async () => {
    writeFlightHandoff(sessionStorage, { elapsed: 40, ringFocus: .2, yaw: 0, pitch: 0, zoom: 0 }, 'data:image/webp;base64,UklGRg==');
    localStorage.setItem(SKIP_FLIGHT_STORAGE_KEY, '1');
    const options = props();
    const view = render(<OrbitalBackdrop {...options} />);
    await waitFor(() => expect(orbital.create).toHaveBeenCalledOnce());
    expect(orbital.create.mock.calls[0][1]).toMatchObject({ arrival: false, arrivalPose: undefined, reducedMotion: false, interactive: true });
    expect(options.onArrival).not.toHaveBeenCalledWith(true);
    expect(view.container.querySelector('.orbital-arrival-poster')).toBeNull();
    expect(sessionStorage.getItem('agyion:arrival')).toBeNull();
    expect(sessionStorage.getItem('agyion:flight-frame')).toBeNull();
  });

  it('uses the fresh landing renderer hint without changing the arrival pose', async () => {
    const pose = { elapsed: 40, ringFocus: .2, yaw: 0, pitch: 0, zoom: 0 };
    writeFlightHandoff(sessionStorage, pose, undefined, Date.now(), { settled: true, softwareGraphics: true });
    render(<OrbitalBackdrop {...props()} />);
    await waitFor(() => expect(orbital.create).toHaveBeenCalledOnce());
    expect(orbital.create.mock.calls[0][1]).toMatchObject({ softwareGraphicsHint: true, arrivalPose: pose });
  });

  it('opens the requested instrument over the settled flight without a second camera move', async () => {
    const pose = { elapsed: 40, ringFocus: .2, yaw: 0, pitch: 0, zoom: 0 };
    writeFlightHandoff(sessionStorage, pose, 'data:image/webp;base64,UklGRg==', Date.now(), { settled: true });
    const options = { ...props(), selected: 'pod', panelOpen: true };
    const view = render(<OrbitalBackdrop {...options} />);
    await waitFor(() => expect(orbital.create).toHaveBeenCalledOnce());
    expect(orbital.handle.setSelected).toHaveBeenLastCalledWith('pod');
    expect(orbital.handle.setPanelOpen).toHaveBeenLastCalledWith(true, { focus: false });
    view.rerender(<OrbitalBackdrop {...options} panelOpen={false} />);
    view.rerender(<OrbitalBackdrop {...options} />);
    expect(orbital.handle.setPanelOpen).toHaveBeenLastCalledWith(true);
  });

  it('previews a dock bay without selecting it and releases the event listener on unmount', async () => {
    const options = props(); const view = render(<OrbitalBackdrop {...options} />);
    await waitFor(() => expect(orbital.create).toHaveBeenCalledOnce());
    orbital.handle.setSelected.mockClear();
    act(() => window.dispatchEvent(new CustomEvent('agyion:instrument-preview', { detail: { id: 'pod' } })));
    expect(orbital.handle.previewInstrument).toHaveBeenLastCalledWith('pod');
    expect(orbital.handle.setSelected).not.toHaveBeenCalled(); expect(options.onSelect).not.toHaveBeenCalled();
    act(() => window.dispatchEvent(new CustomEvent('agyion:instrument-preview', { detail: { id: null } })));
    expect(orbital.handle.previewInstrument).toHaveBeenLastCalledWith(null);
    view.unmount(); orbital.handle.previewInstrument.mockClear();
    act(() => window.dispatchEvent(new CustomEvent('agyion:instrument-preview', { detail: { id: 'fade' } })));
    expect(orbital.handle.previewInstrument).not.toHaveBeenCalled();
  });

  it('holds the completed destination through slow graphics startup and reveals controls without another approach', async () => {
    const pose = { elapsed: 40, ringFocus: .2, yaw: 0, pitch: 0, zoom: 0 };
    writeFlightHandoff(sessionStorage, pose, 'data:image/webp;base64,UklGRg==', Date.now(), { settled: true });
    const bridge = document.createElement('img'); bridge.id = 'agyion-flight-bridge'; document.body.appendChild(bridge);
    orbital.create.mockImplementation(() => orbital.handle);
    const options = props(); const view = render(<OrbitalBackdrop {...options} />);
    await waitFor(() => expect(orbital.create).toHaveBeenCalledOnce());
    expect(orbital.create.mock.calls[0][1]).toMatchObject({ arrival: false, arrivalPose: pose });
    expect(options.onArrival).toHaveBeenLastCalledWith(true);
    fireEvent.load(view.container.querySelector('.orbital-arrival-poster')!);
    expect(document.getElementById('agyion-flight-bridge')).toBe(bridge);
    act(() => {
      orbital.create.mock.calls[0][1].onReady();
      expect(document.getElementById('agyion-flight-bridge')).toBe(bridge);
    });
    expect(document.getElementById('agyion-flight-bridge')).toBeNull();
    expect(options.onArrival).toHaveBeenLastCalledWith(false);
    await waitFor(() => expect(view.container.querySelector('.orbital-arrival-poster')).toBeNull());
    view.rerender(<OrbitalBackdrop {...options} reduced />);
    await waitFor(() => expect(orbital.create).toHaveBeenCalledTimes(2));
    view.rerender(<OrbitalBackdrop {...options} reduced={false} />);
    await waitFor(() => expect(orbital.create).toHaveBeenCalledTimes(3));
    expect(orbital.create.mock.calls[2][1]).toMatchObject({ arrival: false, arrivalPose: undefined });
  });

  it('hands a recent launch to the camera exactly once and leaves the canvas accessible', async () => {
    sessionStorage.setItem('agyion:arrival', JSON.stringify({ at: Date.now() }));
    const options = props();
    const view = render(<OrbitalBackdrop {...options} />);
    await waitFor(() => expect(orbital.create).toHaveBeenCalledOnce());
    const sceneOptions = orbital.create.mock.calls[0][1];
    expect(sceneOptions).toMatchObject({ mode: 'station', interactive: true, arrival: true, reducedMotion: false });
    expect(sessionStorage.getItem('agyion:arrival')).toBeNull();
    expect(options.onArrival).toHaveBeenCalledWith(true);
    expect(view.container.querySelector('.orbital-backdrop')?.getAttribute('aria-hidden')).toBeNull();
    expect(view.container.querySelector('.orbital-fallback')?.getAttribute('aria-hidden')).toBe('true');
    act(() => sceneOptions.onSelect('pod'));
    expect(options.onSelect).toHaveBeenCalledWith('pod');
  });

  it('ignores a stale arrival and connects selection, drawer state and exploration', async () => {
    sessionStorage.setItem('agyion:arrival', JSON.stringify({ at: Date.now() - 60000 }));
    const options = props();
    const view = render(<OrbitalBackdrop {...options} />);
    await waitFor(() => expect(orbital.create).toHaveBeenCalledOnce());
    expect(orbital.create.mock.calls[0][1].arrival).toBe(false);
    view.rerender(<OrbitalBackdrop {...options} selected="pod" panelOpen />);
    expect(orbital.handle.setSelected).toHaveBeenLastCalledWith('pod');
    expect(orbital.handle.setPanelOpen).toHaveBeenLastCalledWith(true);
    view.rerender(<OrbitalBackdrop {...options} selected="pod" exploreRequest={1} />);
    expect(orbital.handle.explore).toHaveBeenCalledOnce();
    expect(orbital.handle.setPanelOpen).toHaveBeenLastCalledWith(false);
  });

  it('reveals the controls immediately when the scene completes or cancels arrival, with no independent flight timer', async () => {
    sessionStorage.setItem('agyion:arrival', JSON.stringify({ at: Date.now() }));
    const schedule = vi.spyOn(window, 'setTimeout');
    const options = props();
    const view = render(<OrbitalBackdrop {...options} />);
    await waitFor(() => expect(orbital.create).toHaveBeenCalledOnce());
    expect(options.onArrival).toHaveBeenLastCalledWith(true);
    expect(schedule.mock.calls.some(([, delay]) => delay === 6200)).toBe(false);
    act(() => orbital.create.mock.calls[0][1].onArrivalComplete());
    expect(options.onArrival).toHaveBeenLastCalledWith(false);
    view.rerender(<OrbitalBackdrop {...options} reduced />);
    await waitFor(() => expect(orbital.create).toHaveBeenCalledTimes(2));
    view.rerender(<OrbitalBackdrop {...options} reduced={false} />);
    await waitFor(() => expect(orbital.create).toHaveBeenCalledTimes(3));
    expect(orbital.create.mock.calls[2][1].arrival).toBe(false);
  });

  it('does not announce an arrival when returning without a marker', async () => {
    const options = props();
    render(<OrbitalBackdrop {...options} />);
    await waitFor(() => expect(orbital.create).toHaveBeenCalledOnce());
    expect(orbital.create.mock.calls[0][1].arrival).toBe(false);
    expect(options.onArrival).not.toHaveBeenCalled();
  });

  it('removes both loading covers and reveals controls if graphics fail', async () => {
    saveFrame({ at: Date.now(), data: 'data:image/webp;base64,UklGRg==' });
    const bridge = document.createElement('img'); bridge.id = 'agyion-flight-bridge'; document.body.appendChild(bridge);
    orbital.create.mockImplementation(() => orbital.handle);
    const options = props(); const view = render(<OrbitalBackdrop {...options} />);
    await waitFor(() => expect(orbital.create).toHaveBeenCalledOnce());
    act(() => orbital.create.mock.calls[0][1].onError(new Error('Lost graphics')));
    expect(document.getElementById('agyion-flight-bridge')).toBeNull();
    expect(view.container.querySelector('.orbital-arrival-poster')).toBeNull();
    expect(options.onArrival).toHaveBeenLastCalledWith(false);
    expect(view.container.querySelector('[role="status"]')?.textContent).toContain('3D view unavailable');
  });

  it('fails open when the renderer never becomes ready', async () => {
    saveFrame({ at: Date.now(), data: 'data:image/webp;base64,UklGRg==' });
    const schedule = vi.spyOn(window, 'setTimeout');
    orbital.create.mockImplementation(() => orbital.handle);
    const options = props(); const view = render(<OrbitalBackdrop {...options} />);
    await waitFor(() => expect(orbital.create).toHaveBeenCalledOnce());
    const failOpen = schedule.mock.calls.find(([, delay]) => delay === 8000)?.[0];
    expect(failOpen).toBeTypeOf('function');
    act(() => (failOpen as () => void)());
    expect(view.container.querySelector('.orbital-arrival-poster')).toBeNull();
    expect(options.onArrival).toHaveBeenLastCalledWith(false);
  });

  it('pauses only for visibility while reduced motion still allows explicit interaction', async () => {
    render(<OrbitalBackdrop {...props()} reduced />);
    await waitFor(() => expect(orbital.create).toHaveBeenCalledOnce());
    expect(orbital.create.mock.calls[0][1].reducedMotion).toBe(true);
    expect(orbital.handle.setPaused).toHaveBeenLastCalledWith(false);
    act(() => visibility([{ isIntersecting: false }]));
    expect(orbital.handle.setPaused).toHaveBeenLastCalledWith(true);
    act(() => visibility([{ isIntersecting: true }]));
    expect(orbital.handle.setPaused).toHaveBeenLastCalledWith(false);
  });


  it('holds the final flight frame until the new renderer is ready, then fades it away', async () => {
    const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    saveFrame({ at: Date.now(), data: image });
    orbital.create.mockImplementation(() => orbital.handle);
    const view = render(<OrbitalBackdrop {...props()} />);
    await waitFor(() => expect(orbital.create).toHaveBeenCalledOnce());
    expect(sessionStorage.getItem('agyion:flight-frame')).toBeNull();
    const poster = view.container.querySelector('.orbital-arrival-poster');
    expect(poster?.getAttribute('src')).toBe(image);
    expect(poster?.getAttribute('aria-hidden')).toBe('true');
    expect(poster?.getAttribute('draggable')).toBe('false');
    expect(view.container.querySelector('.orbital-backdrop')?.className).toContain('has-arrival-poster');
    act(() => orbital.create.mock.calls[0][1].onReady());
    expect(view.container.querySelector('.orbital-backdrop')?.className).toContain('is-ready');
    await waitFor(() => expect(view.container.querySelector('.orbital-arrival-poster')).toBeNull());
  });

  it('keeps the full-document bridge when the component poster loads before renderer readiness', async () => {
    saveFrame({ at: Date.now(), data: 'data:image/webp;base64,UklGRg==' });
    const bridge = document.createElement('img'); bridge.id = 'agyion-flight-bridge'; document.body.appendChild(bridge);
    orbital.create.mockImplementation(() => orbital.handle);
    const view = render(<OrbitalBackdrop {...props()} />);
    await waitFor(() => expect(orbital.create).toHaveBeenCalledOnce());
    const poster = view.container.querySelector('.orbital-arrival-poster')!;
    fireEvent.load(poster);
    expect(document.getElementById('agyion-flight-bridge')).toBe(bridge);
    expect(view.container.querySelector('.orbital-backdrop')?.className).not.toContain('is-ready');
    act(() => {
      orbital.create.mock.calls[0][1].onReady();
      // Calling the renderer callback has not committed React's ready/arrival
      // classes yet; the document cover must survive until that commit.
      expect(document.getElementById('agyion-flight-bridge')).toBe(bridge);
    });
    expect(document.getElementById('agyion-flight-bridge')).toBeNull();
    expect(view.container.querySelector('.orbital-arrival-poster')).not.toBeNull();
    await waitFor(() => expect(view.container.querySelector('.orbital-arrival-poster')).toBeNull());
  });

  it.each(['stale', 'future', 'svg', 'oversized'])('rejects a %s flight frame without blocking the scene', async (kind) => {
    const frame = { at: Date.now(), data: 'data:image/webp;base64,UklGRg==' };
    if (kind === 'stale') frame.at -= 31000;
    if (kind === 'future') frame.at += 60000;
    if (kind === 'svg') frame.data = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
    if (kind === 'oversized') frame.data += 'a'.repeat(2 * 1024 * 1024);
    saveFrame(frame);
    const view = render(<OrbitalBackdrop {...props()} />);
    await waitFor(() => expect(orbital.create).toHaveBeenCalledOnce());
    expect(sessionStorage.getItem('agyion:flight-frame')).toBeNull();
    expect(view.container.querySelector('.orbital-arrival-poster')).toBeNull();
    expect(view.container.querySelector('.orbital-backdrop')?.className).toContain('is-ready');
  });

  it('removes the flight frame immediately once ready when motion is reduced', async () => {
    saveFrame({ at: Date.now(), data: 'data:image/webp;base64,UklGRg==' });
    orbital.create.mockImplementation(() => orbital.handle);
    const view = render(<OrbitalBackdrop {...props()} reduced />);
    await waitFor(() => expect(orbital.create).toHaveBeenCalledOnce());
    expect(view.container.querySelector('.orbital-arrival-poster')).toBeNull();
    expect(orbital.create.mock.calls[0][1].arrival).toBe(false);
    act(() => orbital.create.mock.calls[0][1].onReady());
    expect(view.container.querySelector('.orbital-arrival-poster')).toBeNull();
  });


  it('restores a fresh validated flight pose independently of the optional poster', async () => {
    const pose = { elapsed: 76.2, ringFocus: 1.2, yaw: -.6, pitch: .15, zoom: -.1 };
    sessionStorage.setItem('agyion:arrival', JSON.stringify({ at: Date.now() }));
    saveFrame({ at: Date.now(), pose });
    const view = render(<OrbitalBackdrop {...props()} />);
    await waitFor(() => expect(orbital.create).toHaveBeenCalledOnce());
    expect(orbital.create.mock.calls[0][1]).toMatchObject({ arrival: true, arrivalPose: pose });
    expect(view.container.querySelector('.orbital-arrival-poster')).toBeNull();
  });

  it.each([
    { elapsed: -1 }, { elapsed: 1e7 + 1 }, { ringFocus: Math.PI + .01 },
    { yaw: -Math.PI - .01 }, { pitch: 1.131 }, { zoom: Math.log(42 / 19) + .01 },
    { zoom: Math.log(7.5 / 19) - .01 }, { pitch: '0' }, { elapsed: null },
  ])('ignores an invalid pose %j while preserving the image handoff', async (invalid) => {
    const pose = { elapsed: 5, ringFocus: .2, yaw: .1, pitch: .2, zoom: 0, ...invalid };
    saveFrame({ at: Date.now(), pose, data: 'data:image/webp;base64,UklGRg==' });
    orbital.create.mockImplementation(() => orbital.handle);
    const view = render(<OrbitalBackdrop {...props()} />);
    await waitFor(() => expect(orbital.create).toHaveBeenCalledOnce());
    expect(orbital.create.mock.calls[0][1].arrivalPose).toBeUndefined();
    expect(view.container.querySelector('.orbital-arrival-poster')).not.toBeNull();
  });

  it('rejects an expired pose even when all pose values are valid', async () => {
    const pose = { elapsed: 5, ringFocus: .2, yaw: .1, pitch: .2, zoom: 0 };
    saveFrame({ at: Date.now() - 31000, pose });
    render(<OrbitalBackdrop {...props()} />);
    await waitFor(() => expect(orbital.create).toHaveBeenCalledOnce());
    expect(orbital.create.mock.calls[0][1].arrivalPose).toBeUndefined();
  });

  it('sends successful records into the hole and cleans up the scene and event listener', async () => {
    const view = render(<OrbitalBackdrop {...props()} />);
    await waitFor(() => expect(orbital.create).toHaveBeenCalledOnce());
    act(() => {
      window.dispatchEvent(new CustomEvent('agyion:record', { detail: { status: 'locked' } }));
      window.dispatchEvent(new CustomEvent('agyion:record', { detail: { status: 'rejected' } }));
    });
    expect(orbital.handle.emitTransfer).toHaveBeenCalledOnce();
    view.unmount();
    expect(orbital.handle.dispose).toHaveBeenCalledOnce();
    window.dispatchEvent(new CustomEvent('agyion:record', { detail: { status: 'locked' } }));
    expect(orbital.handle.emitTransfer).toHaveBeenCalledOnce();
  });
});
