import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyStationFlightPose, arrivalCameraDistance, freeOrbitFraming, ModuleCameraRig, zoomFreeOrbit } from '../../shared/module-camera';

function fixture() {
  const station = new THREE.Group();
  const ring = new THREE.Group(); station.add(ring);
  const anchors = Array.from({ length: 6 }, (_, index) => {
    const anchor = new THREE.Object3D();
    const angle = index * Math.PI / 3;
    anchor.position.set(Math.cos(angle) * 2.47, Math.sin(angle) * 2.47, 0);
    ring.add(anchor); return anchor;
  });
  const frame = { viewWidth: 18, viewHeight: 12, blend: 1, escape: 1, small: false, elapsed: 17, reducedMotion: false, ringPhase: .12 };
  applyStationFlightPose(station, ring, frame);
  const camera = new THREE.PerspectiveCamera(38, 1.44, .1, 180);
  const backdrop = new THREE.Vector3(-240, -10, -600);
  const rig = new ModuleCameraRig(station, anchors, 2.47, backdrop);
  const pose = { freePosition: station.position.clone().add(new THREE.Vector3(0, 0, 19)), freeTarget: station.position.clone(), panel: 0, small: false, delta: 1 / 60, snap: true };
  const matrices = () => { station.updateMatrixWorld(true); return [...station.matrixWorld.elements, ...ring.matrixWorld.elements, ...anchors.flatMap(anchor => anchor.matrixWorld.elements)]; };
  return { station, ring, anchors, frame, camera, rig, pose, matrices, backdrop };
}

describe('physical module camera travel', () => {
  it('moves to each physical bay without rotating the spacecraft or circling away from the background', () => {
    const { station, ring, anchors, frame, camera, rig, pose, matrices } = fixture();
    const world = matrices();
    const positions: THREE.Vector3[] = [];
    for (let index = 0; index < anchors.length; index += 1) {
      rig.select(index);
      applyStationFlightPose(station, ring, frame);
      rig.update(camera, pose);
      expect(matrices()).toEqual(world);
      const anchor = anchors[index].getWorldPosition(new THREE.Vector3());
      const projected = anchor.clone().project(camera);
      expect(Math.abs(projected.x)).toBeLessThan(1e-6);
      expect(Math.abs(projected.y)).toBeLessThan(1e-6);
      positions.push(camera.position.clone());
    }
    for (let index = 0; index < positions.length; index += 1) {
      expect(positions[index].distanceTo(positions[(index + 1) % positions.length])).toBeGreaterThan(1);
    }
  });

  it('travels outside the hull to the opposite bay without a position shortcut through the station', () => {
    const { camera, rig, station, pose } = fixture();
    rig.select(0); rig.update(camera, pose);
    const start = camera.position.clone();
    rig.select(3);
    let distanceTravelled = 0;
    for (let frame = 0; frame < 180; frame += 1) {
      const previous = camera.position.clone();
      rig.update(camera, { ...pose, snap: false });
      distanceTravelled += camera.position.distanceTo(previous);
      expect(camera.position.distanceTo(station.position)).toBeGreaterThan(2.47 * 1.4);
    }
    expect(camera.position.distanceTo(start)).toBeGreaterThan(3);
    expect(distanceTravelled).toBeGreaterThan(camera.position.distanceTo(start));
  });

  it.each([
    { width: 1440, height: 1000, small: false },
    { width: 390, height: 844, small: true },
    { width: 320, height: 844, small: true },
  ])('retains the black hole during all six bay selections and continuous ring motion at $width px', viewport => {
    const { station, ring, anchors, frame, camera, rig, pose, matrices, backdrop } = fixture();
    camera.aspect = viewport.width / viewport.height;
    camera.fov = 44; camera.far = 4000; camera.updateProjectionMatrix();
    const assertBackdrop = () => {
      // The scene applies this roll after the rig has chosen its look target.
      camera.rotateZ(.07); camera.updateMatrixWorld(true);
      const depth = backdrop.clone().applyMatrix4(camera.matrixWorldInverse).z;
      const projected = backdrop.clone().project(camera);
      expect(depth).toBeLessThan(0);
      expect(Math.abs(projected.x)).toBeLessThan(.9);
      expect(Math.abs(projected.y)).toBeLessThan(.9);
      expect(projected.z).toBeGreaterThan(-1);
      expect(projected.z).toBeLessThan(1);
    };
    // Sample the complete revolution, not only the default ring phase.
    for (const elapsed of [0, 30, 70, 110, 140]) {
      for (const panel of [0, .5, 1]) for (let index = 0; index < anchors.length; index++) {
        applyStationFlightPose(station, ring, { ...frame, elapsed });
        const world = matrices();
        rig.select(index); rig.update(camera, { ...pose, panel, small: viewport.small });
        assertBackdrop(); expect(matrices()).toEqual(world);
      }
    }
    // The travel itself must keep the background, not only its settled endpoint.
    let elapsed = 140;
    for (const index of [0, 3, 1, 5, 2, 4]) {
      rig.select(index);
      for (let tick = 0; tick < 120; tick++) {
        elapsed += 1 / 60;
        applyStationFlightPose(station, ring, { ...frame, elapsed });
        rig.update(camera, { ...pose, panel: 1, small: viewport.small, snap: false });
        assertBackdrop();
        expect(camera.position.distanceTo(station.position)).toBeGreaterThan(7.49);
      }
    }
  });

  it('frames the desktop drawer and mobile sheet through the camera without rescaling or rotating the ship', () => {
    const { anchors, camera, rig, pose, matrices, station } = fixture();
    const world = matrices(); rig.select(0); rig.update(camera, pose);
    const initialDistance = camera.position.distanceTo(station.position);
    rig.update(camera, { ...pose, panel: 1 });
    expect(anchors[0].getWorldPosition(new THREE.Vector3()).project(camera).x).toBeLessThan(-.25);
    expect(matrices()).toEqual(world);
    camera.aspect = 390 / 760; camera.updateProjectionMatrix();
    rig.update(camera, { ...pose, small: true, panel: 1 });
    expect(anchors[0].getWorldPosition(new THREE.Vector3()).project(camera).y).toBeGreaterThan(.35);
    expect(camera.position.distanceTo(station.position)).toBeGreaterThan(initialDistance);
    expect(matrices()).toEqual(world);
  });

  it('keeps ambient spin continuous across focus and overview changes', () => {
    const { station, ring, anchors, frame, camera, rig, pose } = fixture();
    const before = ring.rotation.z;
    rig.select(4); rig.update(camera, pose); rig.clear(); rig.update(camera, pose);
    expect(ring.rotation.z).toBe(before);
    applyStationFlightPose(station, ring, { ...frame, elapsed: frame.elapsed + .1 });
    expect(ring.rotation.z - before).toBeCloseTo(.0045, 10);
    expect(anchors[4].parent).toBe(ring);
  });

  it('lets free orbit inherit the current camera without an instantaneous position jump', () => {
    const { camera, rig, pose } = fixture();
    rig.select(2); rig.update(camera, pose);
    const inherited = camera.position.clone(); rig.clear();
    rig.update(camera, { ...pose, freePosition: inherited.clone(), snap: false, delta: 0 });
    expect(camera.position.distanceTo(inherited)).toBeLessThan(1e-10);
    expect(rig.focused).toBe(false);
  });

  it('preserves the eye position when every mobile bay hands control to a framed free orbit', () => {
    const { camera, rig, pose, station, anchors } = fixture();
    camera.aspect = 390 / 760; camera.updateProjectionMatrix();
    const panel = 1;
    for (let index = 0; index < anchors.length; index += 1) {
      rig.select(index); rig.update(camera, { ...pose, small: true, panel });
      const inherited = camera.position.clone();
      // The free-orbit frame supplied to the rig is already viewport-scaled by
      // the scene. Undo only this rig's sheet framing, around the station pivot.
      const freePosition = inherited.clone().sub(station.position).divideScalar(1 + panel * 1.15).add(station.position);
      rig.clear(); rig.update(camera, { ...pose, freePosition, small: true, panel });
      expect(camera.position.distanceTo(inherited)).toBeLessThan(1e-10);
    }
  });

  it('accepts the distant launch handoff exactly before applying any orbital damping', () => {
    const { camera, rig, pose, station } = fixture();
    const landingEye = new THREE.Vector3().setFromSphericalCoords(190, Math.PI / 2 - .035, -.58).add(station.position);
    rig.update(camera, { ...pose, freePosition: landingEye, delta: 0, snap: false });
    expect(camera.position.distanceTo(landingEye)).toBeLessThan(1e-10);
    const initial = camera.position.clone();
    rig.update(camera, { ...pose, delta: 0, snap: false });
    expect(camera.position.distanceTo(initial)).toBeLessThan(1e-10);
  });

  it('keeps the first mobile zoom-in directed inward after inheriting every physical bay', () => {
    const { camera, rig, pose, station, anchors } = fixture();
    camera.aspect = 390 / 760; camera.updateProjectionMatrix();
    const framing = freeOrbitFraming(true, 1);
    for (let index = 0; index < anchors.length; index += 1) {
      rig.select(index); rig.update(camera, { ...pose, small: true, panel: 1 });
      const inheritedDistance = camera.position.distanceTo(station.position);
      const inheritedZoom = Math.log(inheritedDistance / (19 * framing));
      const nextZoom = zoomFreeOrbit(inheritedZoom, -.05, framing);
      const nextWorldDistance = 19 * framing * Math.exp(nextZoom);
      expect(nextWorldDistance).toBeLessThan(inheritedDistance);
      expect(nextWorldDistance).toBeGreaterThanOrEqual(7.5 - 1e-10);
    }
  });

  it('ends the mobile approach at the overview distance without a zoom-back step', () => {
    for (const small of [false, true]) {
      const overview = 19 * freeOrbitFraming(small);
      expect(arrivalCameraDistance(0, small)).toBeCloseTo(190, 10);
      expect(arrivalCameraDistance(1, small)).toBeCloseTo(overview, 10);
      expect(Math.abs(arrivalCameraDistance(1 - 1e-6, small) - overview)).toBeLessThan(.0001);
    }
  });

  it('keeps world-distance bounds as the mobile drawer closes and responds to the next zoom-out', () => {
    const { camera, rig, pose, station } = fixture();
    const openFraming = freeOrbitFraming(true, 1);
    const zoomAtOpenMinimum = zoomFreeOrbit(0, -100, openFraming);
    rig.clear();
    for (const panel of [1, .5, 0]) {
      const rawDistance = 19 * freeOrbitFraming(true) * Math.exp(zoomAtOpenMinimum);
      rig.update(camera, { ...pose, small: true, panel, freePosition: station.position.clone().add(new THREE.Vector3(0, 0, rawDistance)) });
      expect(camera.position.distanceTo(station.position)).toBeCloseTo(7.5, 10);
    }
    const closedFraming = freeOrbitFraming(true);
    const outwardZoom = zoomFreeOrbit(zoomAtOpenMinimum, .1, closedFraming);
    expect(19 * closedFraming * Math.exp(outwardZoom)).toBeGreaterThan(7.5);
    expect(19 * closedFraming * Math.exp(zoomFreeOrbit(outwardZoom, 100, closedFraming))).toBeCloseTo(600, 8);
  });
});
