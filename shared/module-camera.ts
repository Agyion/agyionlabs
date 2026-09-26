import * as THREE from 'three';

const ORBIT_DISTANCE = 19;
const MIN_CAMERA_DISTANCE = 7.5;
const MAX_CAMERA_DISTANCE = 600;
const sheetFraming = (small: boolean, panel: number) => small ? 1 + THREE.MathUtils.clamp(panel, 0, 1) * 1.15 : 1;

/** The free-orbit radius multiplier includes viewport and open-sheet framing. */
export function freeOrbitFraming(small: boolean, panel = 0) {
  return (small ? 1.18 : 1) * sheetFraming(small, panel);
}

/** Match the exact overview endpoint, including the mobile viewport multiplier. */
export function arrivalCameraDistance(progress: number, small: boolean) {
  return Math.exp(THREE.MathUtils.lerp(Math.log(190), Math.log(ORBIT_DISTANCE * freeOrbitFraming(small)), THREE.MathUtils.clamp(progress, 0, 1)));
}

/** Bounds describe world-space eye distance, not a pre-framing zoom value. */
export function zoomFreeOrbit(zoom: number, amount: number, framing: number) {
  const minimum = Math.log(MIN_CAMERA_DISTANCE / (ORBIT_DISTANCE * framing));
  const maximum = Math.log(MAX_CAMERA_DISTANCE / (ORBIT_DISTANCE * framing));
  // A sheet may have closed since the previous input. Normalize its old zoom
  // first so the next outward gesture responds immediately from the new bound.
  return THREE.MathUtils.clamp(THREE.MathUtils.clamp(zoom, minimum, maximum) + amount, minimum, maximum);
}

export interface StationFlightFrame {
  viewWidth: number;
  viewHeight: number;
  blend: number;
  escape: number;
  small: boolean;
  elapsed: number;
  reducedMotion: boolean;
  ringPhase: number;
}

/** Flight alone moves the spacecraft. Selection and drawer state are deliberately absent. */
export function applyStationFlightPose(station: THREE.Object3D, ring: THREE.Object3D, frame: StationFlightFrame) {
  const { escape, elapsed, reducedMotion, ringPhase } = frame;
  station.position.set(0, escape * 120 + (reducedMotion ? 0 : Math.sin(elapsed * .21) * .012), escape * 60);
  station.scale.setScalar(1);
  station.rotation.set(.32, -.42, -.2);
  ring.rotation.z = ringPhase + (reducedMotion ? 0 : elapsed * .045);
  station.updateMatrixWorld(true);
}

export interface ModuleCameraFrame {
  freePosition: THREE.Vector3;
  freeTarget: THREE.Vector3;
  panel: number;
  small: boolean;
  delta: number;
  snap: boolean;
  direct?: boolean;
}

/** Read physical anchors; write the camera only. Ship spin has its own clock. */
export class ModuleCameraRig {
  private readonly station: THREE.Object3D;
  private readonly anchors: readonly THREE.Object3D[];
  private readonly ringRadius: number;
  private selected: number | null = null;
  private initialized = false;
  private readonly center = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly stationRotation = new THREE.Quaternion();
  private readonly normal = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly outward = new THREE.Vector3();
  private readonly goalPosition = new THREE.Vector3();
  private readonly goalTarget = new THREE.Vector3();
  private readonly currentTarget = new THREE.Vector3();
  private readonly fromDirection = new THREE.Vector3();
  private readonly toDirection = new THREE.Vector3();
  private readonly turn = new THREE.Quaternion();
  private readonly partialTurn = new THREE.Quaternion();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly screenUp = new THREE.Vector3();

  constructor(station: THREE.Object3D, anchors: readonly THREE.Object3D[], ringRadius: number) {
    this.station = station;
    this.anchors = anchors;
    this.ringRadius = ringRadius;
  }

  get focused() { return this.selected !== null; }

  select(index: number) {
    if (Number.isInteger(index) && this.anchors[index]) this.selected = index;
  }

  clear() { this.selected = null; }

  update(camera: THREE.PerspectiveCamera, frame: ModuleCameraFrame) {
    const { freePosition, freeTarget, panel, small, delta, snap, direct = false } = frame;
    this.station.getWorldPosition(this.center);
    this.station.getWorldScale(this.scale);
    this.station.getWorldQuaternion(this.stationRotation);
    const radius = this.ringRadius * Math.max(this.scale.x, this.scale.y, this.scale.z);
    const selectedAnchor = this.selected === null ? null : this.anchors[this.selected];
    if (selectedAnchor) {
      selectedAnchor.getWorldPosition(this.goalTarget);
      this.normal.set(0, 0, 1).applyQuaternion(this.stationRotation);
      this.up.set(0, 1, 0).applyQuaternion(this.stationRotation);
      this.outward.copy(this.goalTarget).sub(this.center);
      this.outward.addScaledVector(this.normal, -this.outward.dot(this.normal)).normalize();
      // The deployed camera uses offsets 28 / 7.5 / 19 on a radius-12 ring.
      this.goalPosition.copy(this.goalTarget)
        .addScaledVector(this.outward, radius * 28 / 12)
        .addScaledVector(this.up, radius * 7.5 / 12)
        .addScaledVector(this.normal, radius * 19 / 12);
    } else {
      this.goalPosition.copy(freePosition);
      this.goalTarget.copy(freeTarget);
    }

    // A bottom sheet reduces the available view. Move the eye back; never shrink
    // the spacecraft. Free-orbit inheritance removes this factor before input.
    if (small && panel > 0) {
      this.goalPosition.sub(this.goalTarget).multiplyScalar(sheetFraming(small, panel)).add(this.goalTarget);
    }
    this.toDirection.copy(this.goalPosition).sub(this.center);
    const worldDistance = this.toDirection.length();
    const boundedDistance = THREE.MathUtils.clamp(worldDistance, Math.max(MIN_CAMERA_DISTANCE, radius * 1.6), MAX_CAMERA_DISTANCE);
    if (worldDistance > .001 && worldDistance !== boundedDistance) {
      this.goalPosition.copy(this.center).addScaledVector(this.toDirection, boundedDistance / worldDistance);
    }
    this.forward.copy(this.goalTarget).sub(this.goalPosition).normalize();
    this.right.crossVectors(this.forward, camera.up).normalize();
    if (this.right.lengthSq() < .001) this.right.set(1, 0, 0);
    this.screenUp.crossVectors(this.right, this.forward).normalize();
    const halfHeight = this.goalPosition.distanceTo(this.goalTarget) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    if (small) this.goalTarget.addScaledVector(this.screenUp, -halfHeight * panel * .67);
    else this.goalTarget.addScaledVector(this.right, halfHeight * camera.aspect * panel * .47);

    if (!this.initialized || snap) {
      camera.position.copy(this.goalPosition);
      this.currentTarget.copy(this.goalTarget);
      this.initialized = true;
    } else {
      // Spherical travel around the ship avoids the straight-line shortcut
      // through the hub when two selected modules lie on opposite sides.
      const alpha = 1 - Math.exp(-(direct ? 12 : 4.5) * Math.max(0, delta));
      this.fromDirection.copy(camera.position).sub(this.center);
      this.toDirection.copy(this.goalPosition).sub(this.center);
      const fromRadius = this.fromDirection.length();
      const toRadius = this.toDirection.length();
      if (fromRadius > .001) this.fromDirection.divideScalar(fromRadius); else this.fromDirection.set(0, 0, 1);
      if (toRadius > .001) this.toDirection.divideScalar(toRadius); else this.toDirection.copy(this.fromDirection);
      this.turn.setFromUnitVectors(this.fromDirection, this.toDirection);
      this.partialTurn.identity().slerp(this.turn, alpha);
      this.fromDirection.applyQuaternion(this.partialTurn).normalize();
      const distance = Math.max(MIN_CAMERA_DISTANCE, radius * 1.6, THREE.MathUtils.lerp(fromRadius, toRadius, alpha));
      camera.position.copy(this.center).addScaledVector(this.fromDirection, distance);
      this.currentTarget.lerp(this.goalTarget, 1 - Math.exp((direct ? -12 : -5.5) * Math.max(0, delta)));
    }
    camera.lookAt(this.currentTarget);
    camera.updateMatrixWorld(true);
  }
}
