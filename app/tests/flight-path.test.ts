import { describe, expect, it } from 'vitest';
import { sampleLaunchFlight } from '../../shared/flight-path';

describe('portrait launch framing', () => {
  it.each([0, .3])('reduces the lateral framing angle continuously from landing blend %s', startBlend => {
    const first = sampleLaunchFlight(0, startBlend, true);
    let priorAngle = Math.atan2(first.targetShiftX, first.distance);
    for (let frame = 1; frame <= 200; frame++) {
      const pose = sampleLaunchFlight(frame / 200, startBlend, true);
      const angle = Math.atan2(pose.targetShiftX, pose.distance);
      // The prior path looked increasingly above the hole as radius shrank,
      // putting both hole and ship below the mobile screen for several seconds.
      expect(angle).toBeLessThanOrEqual(priorAngle + 1e-12);
      expect(angle).toBeLessThan(.25);
      expect(pose.targetLift).toBe(0);
      priorAngle = angle;
    }
    expect(priorAngle).toBe(0);
  });

  it('starts at the centered portrait landing view and keeps the exact app destination', () => {
    const first = sampleLaunchFlight(0, 0, true);
    expect(first).toMatchObject({ yaw: .6, pitch: .13, escape: 0 });
    expect(first.distance).toBeCloseTo(1400, 10);
    expect(first.targetLift).toBe(0);
    expect(first.targetShiftX).toBeCloseTo(100, 10);
    const final = sampleLaunchFlight(1, 0, true);
    expect(final).toMatchObject({ targetLift: 0, targetShiftX: 0, yaw: 0, pitch: .16, escape: 1 });
    expect(final.distance).toBe(19 * 1.18);
  });
});
