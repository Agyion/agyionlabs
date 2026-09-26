export interface PointerAimOffset {
  readonly yaw: number;
  readonly pitch: number;
}

/** Ambient offsets only; saved orbit coordinates belong to the scene. */
export class PointerAim {
  private readonly reducedMotion: boolean;
  private enabled = true;
  private targetYaw = 0;
  private targetPitch = 0;
  private readonly offset = { yaw: 0, pitch: 0 };

  constructor({ reducedMotion = false }: { reducedMotion?: boolean } = {}) {
    this.reducedMotion = reducedMotion;
  }

  /** Coordinates are normalized to the visible canvas: right/up are positive. */
  setPointer(x: number, y: number): void {
    if (!this.enabled || this.reducedMotion) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) { this.clear(); return; }
    this.targetYaw = Math.max(-1, Math.min(1, x)) * .04;
    this.targetPitch = Math.max(-1, Math.min(1, y)) * .025;
  }

  /** Leave eases home; direct camera input can first remove the offset exactly. */
  clear(immediate = false): void {
    this.targetYaw = this.targetPitch = 0;
    if (immediate) this.offset.yaw = this.offset.pitch = 0;
  }

  /** Flight, an open form or a coarse pointer cannot accumulate deferred aim. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled || this.reducedMotion) this.clear(true);
  }

  /** Called by the existing scene clock; this helper never starts a frame loop. */
  step(deltaSeconds: number): PointerAimOffset {
    if (!this.enabled || this.reducedMotion) { this.clear(true); return this.offset; }
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return this.offset;
    const alpha = 1 - Math.exp(-6 * deltaSeconds);
    this.offset.yaw += (this.targetYaw - this.offset.yaw) * alpha;
    this.offset.pitch += (this.targetPitch - this.offset.pitch) * alpha;
    return this.offset;
  }
}
