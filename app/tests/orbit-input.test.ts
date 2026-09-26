// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindOrbitInput } from '../../shared/orbit-input';

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach((cleanup) => cleanup()); document.body.replaceChildren(); });

function setup(wheelZoom = true, horizontalDragSensitivity = 1) {
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600, toJSON: () => ({}) });
  const captures = new Set<number>();
  canvas.setPointerCapture = vi.fn((id) => { captures.add(id); });
  canvas.hasPointerCapture = (id) => captures.has(id);
  canvas.releasePointerCapture = vi.fn((id) => { captures.delete(id); });
  const options = { wheelZoom, horizontalDragSensitivity, canInteract: vi.fn(() => true), onOrbit: vi.fn(), onZoom: vi.fn(), onPick: vi.fn(), onHover: vi.fn(), onAim: vi.fn(), onReset: vi.fn() };
  const dispose = bindOrbitInput(canvas, options);
  cleanups.push(dispose);
  function pointer(type: string, x: number, y: number, id = 1, pointerType = 'mouse') {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperties(event, { pointerId: { value: id }, pointerType: { value: pointerType } });
    canvas.dispatchEvent(event);
  }
  return { canvas, options, pointer, captures, dispose };
}

describe('orbital scene input', () => {
  it.each(['mouse', 'touch', 'pen'])('reduces horizontal %s dragging to a quarter while keeping vertical travel and click discrimination', pointerType => {
    const { pointer, options } = setup(true, .25);
    pointer('pointerdown', 100, 100, 1, pointerType);
    pointer('pointermove', 200, 130, 1, pointerType);
    pointer('pointerup', 200, 130, 1, pointerType);
    expect(options.onOrbit).toHaveBeenCalledExactlyOnceWith(Math.PI / 20, Math.PI / 20);
    expect(options.onPick).not.toHaveBeenCalled();
  });

  it('scales two-finger horizontal panning without changing pinch zoom or keyboard steps', () => {
    const normal = setup(true, 1), fine = setup(true, .25);
    for (const { pointer } of [normal, fine]) {
      pointer('pointerdown', 100, 100, 1, 'touch'); pointer('pointerdown', 200, 100, 2, 'touch');
      pointer('pointermove', 240, 120, 2, 'touch');
      pointer('pointerup', 240, 120, 2, 'touch'); pointer('pointerup', 100, 100, 1, 'touch');
    }
    expect(fine.options.onOrbit.mock.calls[0][0]).toBeCloseTo(normal.options.onOrbit.mock.calls[0][0] / 4, 12);
    expect(fine.options.onOrbit.mock.calls[0][1]).toBe(normal.options.onOrbit.mock.calls[0][1]);
    expect(fine.options.onZoom.mock.calls[0][0]).toBe(normal.options.onZoom.mock.calls[0][0]);
    for (const { canvas, options } of [normal, fine]) {
      canvas.focus(); canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
      expect(options.onOrbit).toHaveBeenLastCalledWith(.07, 0);
    }
  });

  it('reports bounded passive mouse aim without orbiting, zooming, focusing or selecting', () => {
    const { canvas, pointer, options } = setup();
    pointer('pointermove', 750, 150);
    expect(options.onAim).toHaveBeenLastCalledWith(.5, .5);
    pointer('pointermove', 1500, -100);
    expect(options.onAim).toHaveBeenLastCalledWith(1, 1);
    expect(options.onOrbit).not.toHaveBeenCalled();
    expect(options.onZoom).not.toHaveBeenCalled();
    expect(options.onPick).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(canvas);
  });

  it('neutralizes passive aim before dragging and only resumes on a later mouse move', () => {
    const { pointer, options } = setup();
    pointer('pointermove', 750, 150);
    pointer('pointerdown', 750, 150);
    expect(options.onAim).toHaveBeenLastCalledWith(null, null);
    pointer('pointermove', 800, 180);
    expect(options.onOrbit).toHaveBeenCalledWith(Math.PI / 10, Math.PI / 20);
    pointer('pointerup', 800, 180);
    expect(options.onAim).toHaveBeenLastCalledWith(null, null);
    expect(options.onPick).not.toHaveBeenCalled();
    pointer('pointermove', 500, 300);
    expect(options.onAim).toHaveBeenLastCalledWith(0, 0);
  });

  it('never aims from touch or pen and clears mouse aim on leave, blur and disabled interaction', () => {
    const { canvas, pointer, options } = setup();
    for (const type of ['touch', 'pen']) {
      pointer('pointermove', 750, 150, 1, type);
      expect(options.onAim).toHaveBeenLastCalledWith(null, null);
    }
    pointer('pointermove', 750, 150); pointer('pointerleave', 750, 150);
    expect(options.onAim).toHaveBeenLastCalledWith(null, null);
    pointer('pointermove', 750, 150); window.dispatchEvent(new Event('blur'));
    expect(options.onAim).toHaveBeenLastCalledWith(null, null);
    pointer('pointermove', 750, 150); options.canInteract.mockReturnValue(false); pointer('pointermove', 800, 150);
    expect(options.onAim).toHaveBeenLastCalledWith(null, null);
    expect(options.onOrbit).not.toHaveBeenCalled(); expect(options.onPick).not.toHaveBeenCalled();
    expect(canvas.hasPointerCapture(1)).toBe(false);
  });

  it('neutralizes aim for wheel zoom and keyboard camera controls', () => {
    const { canvas, pointer, options } = setup();
    pointer('pointermove', 750, 150);
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true }));
    expect(options.onAim).toHaveBeenLastCalledWith(null, null);
    canvas.focus();
    for (const key of ['ArrowLeft', '+', 'Home']) {
      pointer('pointermove', 750, 150);
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }));
      expect(options.onAim).toHaveBeenLastCalledWith(null, null);
    }
    expect(options.onOrbit).toHaveBeenCalledTimes(1);
    expect(options.onZoom).toHaveBeenCalledTimes(2);
  });

  it('picks a click but never picks after a camera drag', () => {
    const { pointer, options, captures } = setup();
    pointer('pointerdown', 100, 100); pointer('pointermove', 102, 101); pointer('pointerup', 102, 101);
    expect(options.onPick).toHaveBeenCalledExactlyOnceWith(102, 101);
    expect(options.onOrbit).not.toHaveBeenCalled();
    options.onPick.mockClear();
    pointer('pointerdown', 100, 100); pointer('pointermove', 150, 120); pointer('pointerup', 150, 120);
    expect(options.onOrbit).toHaveBeenCalled();
    expect(options.onPick).not.toHaveBeenCalled();
    expect(captures.size).toBe(0);
  });

  it('zooms and orbits a two-finger gesture without picking on either release', () => {
    const { pointer, options } = setup();
    pointer('pointerdown', 100, 100, 1, 'touch'); pointer('pointerdown', 200, 100, 2, 'touch');
    pointer('pointermove', 240, 120, 2, 'touch');
    expect(options.onZoom.mock.calls[0][0]).toBeLessThan(0);
    expect(options.onOrbit).toHaveBeenCalled();
    pointer('pointerup', 240, 120, 2, 'touch'); pointer('pointerup', 100, 100, 1, 'touch');
    expect(options.onPick).not.toHaveBeenCalled();
  });

  it('preserves landing-page vertical touch scrolling and wheel scrolling', () => {
    const { canvas, pointer, options } = setup(false);
    pointer('pointerdown', 100, 100, 1, 'touch'); pointer('pointermove', 102, 150, 1, 'touch'); pointer('pointerup', 102, 150, 1, 'touch');
    expect(options.onOrbit).not.toHaveBeenCalled(); expect(options.onPick).not.toHaveBeenCalled();
    const wheel = new WheelEvent('wheel', { deltaY: 100, cancelable: true }); canvas.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(false); expect(options.onZoom).not.toHaveBeenCalled();
    expect(canvas.style.touchAction).toBe('pan-y');
  });

  it('consumes scene wheel zoom only while interaction is enabled', () => {
    const { canvas, options } = setup();
    const wheel = new WheelEvent('wheel', { deltaY: 100, cancelable: true }); canvas.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true); expect(options.onZoom.mock.calls[0][0]).toBeGreaterThan(0);
    options.canInteract.mockReturnValue(false);
    const ignored = new WheelEvent('wheel', { deltaY: 100, cancelable: true }); canvas.dispatchEvent(ignored);
    expect(ignored.defaultPrevented).toBe(false); expect(options.onZoom).toHaveBeenCalledTimes(1);
  });

  it('cancels gestures and removes all input behavior and owned attributes on disposal', () => {
    const { canvas, options, pointer, captures, dispose } = setup();
    pointer('pointerdown', 100, 100); pointer('pointercancel', 100, 100); pointer('pointerup', 100, 100);
    expect(options.onPick).not.toHaveBeenCalled(); expect(captures.size).toBe(0);
    pointer('pointerdown', 100, 100); dispose();
    expect(captures.size).toBe(0); expect(canvas.hasAttribute('tabindex')).toBe(false);
    pointer('pointermove', 200, 100); pointer('pointerup', 200, 100);
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true }));
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true }));
    expect(options.onOrbit).not.toHaveBeenCalled(); expect(options.onZoom).not.toHaveBeenCalled(); expect(options.onPick).not.toHaveBeenCalled();
  });

  it('supports focused-canvas keyboard orbit, zoom and reset plus double-click reset', () => {
    const { canvas, options } = setup(); canvas.focus();
    for (const key of ['ArrowLeft', '+', 'Home']) canvas.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }));
    canvas.dispatchEvent(new MouseEvent('dblclick', { cancelable: true }));
    expect(options.onOrbit).toHaveBeenCalledTimes(1); expect(options.onZoom).toHaveBeenCalledTimes(1); expect(options.onReset).toHaveBeenCalledTimes(2);
  });

  it('never picks after losing capture and leaves keyboard events elsewhere untouched', () => {
    const { canvas, pointer, options } = setup();
    pointer('pointerdown', 100, 100); pointer('lostpointercapture', 100, 100); pointer('pointerup', 100, 100);
    expect(options.onPick).not.toHaveBeenCalled();
    const input = document.createElement('input'); document.body.append(input); input.focus();
    const arrow = new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true }); canvas.dispatchEvent(arrow);
    expect(arrow.defaultPrevented).toBe(false); expect(options.onOrbit).not.toHaveBeenCalled();
  });
});
