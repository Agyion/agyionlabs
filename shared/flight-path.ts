import { freeOrbitFraming } from './module-camera';

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => value * value * (3 - 2 * value);
const mix = (start: number, end: number, progress: number) => start + (end - start) * progress;

/** One easing clock, with no intermediate stop or second camera approach. */
export function sampleLaunchFlight(progress: number, startBlend: number, small: boolean) {
  const amount = smooth(clamp(progress));
  const initialBlend = smooth(clamp(startBlend));
  const initialDistance = mix(1400, 190, initialBlend);
  const distance = progress >= 1 ? 19 * freeOrbitFraming(small)
    : Math.exp(mix(Math.log(initialDistance), Math.log(19 * freeOrbitFraming(small)), amount));
  return {
    amount,
    blend: mix(initialBlend, 1, amount),
    escape: amount,
    distance,
    yaw: mix(mix(small ? .6 : 1.15, -.1, initialBlend), 0, amount),
    pitch: mix(.13, .16, amount),
    targetLift: 0,
    // Portrait starts centered on the hole below the compact brand. Decay the
    // lateral look angle with the journey so it cannot overtake the camera.
    targetShiftX: small ? 100 * (1 - initialBlend) * (1 - amount) * distance / initialDistance : 0,
  };
}
