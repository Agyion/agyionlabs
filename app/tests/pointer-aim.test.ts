import { describe, expect, it } from 'vitest';
import { PointerAim } from '../../shared/pointer-aim';

describe('passive pointer camera offset', () => {
  it('approaches a bounded view offset without immediately snapping or overshooting', () => {
    const aim = new PointerAim();
    aim.setPointer(20, -20);
    const first = { ...aim.step(1 / 60) };
    expect(first.yaw).toBeGreaterThan(0); expect(first.yaw).toBeLessThan(.04);
    expect(first.pitch).toBeLessThan(0); expect(first.pitch).toBeGreaterThan(-.025);
    for (let index = 0; index < 180; index++) {
      const offset = aim.step(1 / 60);
      expect(offset.yaw).toBeLessThanOrEqual(.04);
      expect(offset.pitch).toBeGreaterThanOrEqual(-.025);
    }
    expect(aim.step(0).yaw).toBeCloseTo(.04, 4);
    expect(aim.step(0).pitch).toBeCloseTo(-.025, 4);
  });

  it('uses elapsed time so dropped frames do not change the intended response speed', () => {
    const frequent = new PointerAim(), sparse = new PointerAim();
    frequent.setPointer(.8, .6); sparse.setPointer(.8, .6);
    for (let index = 0; index < 60; index++) frequent.step(1 / 60);
    for (let index = 0; index < 10; index++) sparse.step(.1);
    expect(frequent.step(0).yaw).toBeGreaterThan(0);
    expect(frequent.step(0).yaw).toBeCloseTo(sparse.step(0).yaw, 8);
    expect(frequent.step(0).pitch).toBeCloseTo(sparse.step(0).pitch, 8);
  });

  it('returns smoothly to neutral on leave and supports an immediate reset before direct input', () => {
    const aim = new PointerAim(); aim.setPointer(1, 1);
    const before = { ...aim.step(.2) };
    aim.clear();
    const returning = { ...aim.step(.1) };
    expect(returning.yaw).toBeGreaterThan(0); expect(returning.yaw).toBeLessThan(before.yaw);
    expect(returning.pitch).toBeGreaterThan(0); expect(returning.pitch).toBeLessThan(before.pitch);
    aim.clear(true);
    expect(aim.step(.1)).toEqual({ yaw: 0, pitch: 0 });
  });

  it('discards stale pointer intent while disabled, so ending a flight or closing a workspace does not kick the camera', () => {
    const aim = new PointerAim(); aim.setPointer(1, 1); aim.step(.2);
    aim.setEnabled(false);
    aim.setPointer(-1, -1);
    expect(aim.step(.2)).toEqual({ yaw: 0, pitch: 0 });
    aim.setEnabled(true);
    expect(aim.step(.2)).toEqual({ yaw: 0, pitch: 0 });
    aim.setPointer(-1, -1);
    expect(aim.step(.2).yaw).toBeLessThan(0);
  });

  it('never adds incidental camera movement under reduced motion even if interaction is enabled', () => {
    const aim = new PointerAim({ reducedMotion: true });
    aim.setEnabled(true); aim.setPointer(1, 1);
    expect(aim.step(.2)).toEqual({ yaw: 0, pitch: 0 });
    aim.setEnabled(false); aim.setEnabled(true); aim.setPointer(-1, -1);
    expect(aim.step(.2)).toEqual({ yaw: 0, pitch: 0 });
  });

  it('does not poison the view with invalid coordinates or elapsed time', () => {
    const aim = new PointerAim(); aim.setPointer(1, 1); aim.step(.1);
    const before = { ...aim.step(0) };
    expect(aim.step(Number.NaN)).toEqual(before);
    expect(aim.step(-1)).toEqual(before);
    aim.setPointer(Number.NaN, Infinity);
    expect(Number.isFinite(aim.step(.1).yaw)).toBe(true);
    expect(aim.step(.1).yaw).toBeLessThan(before.yaw);
  });
});
