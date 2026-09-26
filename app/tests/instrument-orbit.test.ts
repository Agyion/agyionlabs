import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createInstrumentOrbit, EXHIBIT_IDS, type ExhibitStage } from '../../shared/instrument-orbit';

const frame = { elapsed: 0, delta: 0, landing: true, launchProgress: 0, reducedMotion: false };
describe('physical product exhibits', () => {
  it('moves Fade light toward a lower price along its solid curve', () => {
    const orbit = createInstrumentOrbit({ softwareGraphics: true });
    orbit.update(frame);
    const packet = orbit.group.getObjectByName('fade-packet')!;
    const before = packet.position.clone();
    orbit.update({ ...frame, elapsed: 2, delta: .1 });
    expect(packet.position.x).toBeGreaterThan(before.x);
    expect(packet.position.y).toBeLessThan(before.y);
    orbit.dispose();
  });

  it('keeps all four products quiet around the hole and moves only the chosen product forward', () => {
    const orbit = createInstrumentOrbit({ softwareGraphics: true });
    orbit.update(frame);
    const objects = orbit.group.children;
    expect(objects.map(object => object.userData.exhibit)).toEqual(['fade', 'pod', 'trigger', 'envoy']);
    const before = objects.map(object => ({ position: object.position.clone(), scale: object.scale.x }));
    orbit.setSelected('pod');
    for (let i = 0; i < 12; i++) orbit.update({ ...frame, delta: .1 });
    objects.forEach((object, index) => {
      if (object.userData.exhibit === 'pod') {
        expect(object.position.z).toBeGreaterThan(before[index].position.z + 70);
        expect(object.scale.x).toBeGreaterThan(before[index].scale * 1.2);
      } else expect(object.position.equals(before[index].position)).toBe(true);
    });
    orbit.dispose();
  });

  it('removes every exhibit during launch and in station mode, including raycast interaction', () => {
    const orbit = createInstrumentOrbit({ softwareGraphics: true });
    orbit.update(frame); expect(orbit.group.visible).toBe(true);
    orbit.update({ ...frame, launchProgress: .08 });
    const faded: number[] = [];
    orbit.group.traverse(object => { if (object instanceof THREE.Mesh) faded.push((object.material as THREE.Material).opacity); });
    expect(faded.every(opacity => opacity > 0 && opacity < 1)).toBe(true);
    orbit.update({ ...frame, launchProgress: .16 }); expect(orbit.group.visible).toBe(false);
    expect(orbit.pick(new THREE.Raycaster())).toBeNull();
    orbit.update({ ...frame, landing: false }); expect(orbit.group.visible).toBe(false);
    orbit.update(frame); expect(orbit.group.visible).toBe(true);
    orbit.dispose();
  });

  it('brings the selected mechanism into a readable stage, changes it, and restores the home arrangement', () => {
    const orbit = createInstrumentOrbit({ softwareGraphics: true });
    const staticFrame = { ...frame, reducedMotion: true, stage: { center: new THREE.Vector3(45, 90, 220), span: 440 } };
    orbit.update(staticFrame);
    const original = orbit.group.children.map(object => ({ position: object.position.clone(), scale: object.scale.x }));
    const pod = orbit.group.getObjectByName('exhibit-pod')!;
    const trigger = orbit.group.getObjectByName('exhibit-trigger')!;
    orbit.setSelected('pod'); orbit.setExploring(true); orbit.update(staticFrame);
    expect(pod.position.equals(staticFrame.stage.center)).toBe(true);
    expect(pod.scale.x).toBeGreaterThan(original[1].scale * 2);
    orbit.setSelected('trigger'); orbit.update(staticFrame);
    expect(trigger.position.equals(staticFrame.stage.center)).toBe(true);
    expect(pod.position.equals(staticFrame.stage.center)).toBe(false);
    expect(trigger.scale.x).toBeGreaterThan(pod.scale.x * 2);
    orbit.setExploring(false); orbit.setSelected(null); orbit.update(staticFrame);
    orbit.group.children.forEach((object, index) => {
      expect(object.position.equals(original[index].position)).toBe(true);
      expect(object.scale.x).toBe(original[index].scale);
    });
    orbit.dispose();
  });

  it('eases the stage movement without teleporting and keeps reduced-motion explicit picks available', () => {
    const orbit = createInstrumentOrbit({ softwareGraphics: true });
    const stageFrame = { ...frame, stage: { center: new THREE.Vector3(45, 90, 220), span: 440 } };
    orbit.update(stageFrame);
    const pod = orbit.group.getObjectByName('exhibit-pod')!;
    const from = pod.position.clone();
    orbit.setSelected('pod'); orbit.setExploring(true);
    orbit.update({ ...stageFrame, delta: .016 });
    expect(pod.position.distanceTo(from)).toBeLessThan(25);
    expect(pod.position.distanceTo(stageFrame.stage.center)).toBeGreaterThan(100);
    orbit.update({ ...stageFrame, reducedMotion: true }); orbit.group.updateMatrixWorld(true);
    const before = pod.matrixWorld.clone();
    orbit.update({ ...stageFrame, elapsed: 30, delta: .1, reducedMotion: true }); orbit.group.updateMatrixWorld(true);
    expect(pod.matrixWorld.equals(before)).toBe(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(pod.position.x, pod.position.y, pod.position.z + 1000), new THREE.Vector3(0, 0, -1));
    expect(orbit.pick(ray)).toBe('pod');
    orbit.dispose();
  });

  it('uses compact portrait geometry placement and preserves physical picking after resize', () => {
    const orbit = createInstrumentOrbit({ softwareGraphics: true });
    orbit.update(frame); const pod = orbit.group.getObjectByName('exhibit-pod')!;
    const desktop = pod.position.clone(), desktopScale = pod.scale.x;
    orbit.update({ ...frame, aspect: 390 / 844 }); orbit.group.updateMatrixWorld(true);
    expect(pod.scale.x).toBeLessThan(desktopScale);
    expect(pod.position.equals(desktop)).toBe(false);
    const ray = new THREE.Raycaster(new THREE.Vector3(pod.position.x, pod.position.y, pod.position.z + 1000), new THREE.Vector3(0, 0, -1));
    expect(orbit.pick(ray)).toBe('pod');
    orbit.update({ ...frame, aspect: 1.44 });
    expect(pod.position.equals(desktop)).toBe(true);
    orbit.dispose();
  });

  it('freezes passive mechanisms under reduced motion while explicit selection still works', () => {
    const orbit = createInstrumentOrbit({ softwareGraphics: true });
    orbit.update({ ...frame, reducedMotion: true }); orbit.group.updateMatrixWorld(true);
    const packet = orbit.group.getObjectByName('fade-packet')!;
    const before = packet.matrixWorld.clone();
    orbit.update({ ...frame, elapsed: 30, delta: .1, reducedMotion: true }); orbit.group.updateMatrixWorld(true);
    expect(packet.matrixWorld.equals(before)).toBe(true);
    const pod = orbit.group.getObjectByName('exhibit-pod')!; const depth = pod.position.z;
    orbit.setSelected('pod'); orbit.update({ ...frame, reducedMotion: true });
    expect(pod.position.z).toBeGreaterThan(depth);
    orbit.dispose();
  });

  it('places Fade at successively lower points of its existing rail for Set, Claim and Settle', () => {
    const orbit = createInstrumentOrbit({ softwareGraphics: true });
    const packet = orbit.group.getObjectByName('fade-packet')!;
    orbit.setSelected('fade');
    const positions = ([0, 1, 2] as const).map(stage => {
      orbit.setStage(stage); orbit.update({ ...frame, reducedMotion: true });
      return packet.position.clone();
    });
    expect(positions[0].x).toBeLessThan(positions[1].x);
    expect(positions[1].x).toBeLessThan(positions[2].x);
    expect(positions[0].y).toBeGreaterThan(positions[1].y);
    expect(positions[1].y).toBeGreaterThan(positions[2].y);
    orbit.dispose();
  });

  it('aligns Pod locks for Commit, then moves both rings beyond the capsule for Reveal', () => {
    const orbit = createInstrumentOrbit({ softwareGraphics: true });
    const key = orbit.group.getObjectByName('pod-key-ring')!;
    const unlock = orbit.group.getObjectByName('pod-unlock-ring')!;
    orbit.setSelected('pod'); orbit.setStage(0); orbit.update({ ...frame, reducedMotion: true });
    expect(key.rotation.y).toBeGreaterThan(.3);
    expect(unlock.rotation.y).toBeLessThan(-.3);
    orbit.setStage(1); orbit.update({ ...frame, reducedMotion: true });
    expect(key.rotation.x).toBeCloseTo(Math.PI / 2);
    expect(key.rotation.y).toBeCloseTo(0); expect(unlock.rotation.y).toBeCloseTo(0);
    const separation = unlock.position.y - key.position.y;
    orbit.setStage(2); orbit.update({ ...frame, reducedMotion: true });
    expect(unlock.position.y - key.position.y).toBeGreaterThan(separation * 2);
    expect(key.position.y).toBeLessThan(-1.24); expect(unlock.position.y).toBeGreaterThan(1.24);
    expect(key.rotation.y).toBeCloseTo(0); expect(unlock.rotation.y).toBeCloseTo(0);
    orbit.dispose();
  });

  it('keeps the Pod hull closed while ready, then physically separates its two shells to expose the core', () => {
    const orbit = createInstrumentOrbit({ softwareGraphics: true });
    const upper = orbit.group.getObjectByName('pod-shell-upper')!;
    const lower = orbit.group.getObjectByName('pod-shell-lower')!;
    const core = orbit.group.getObjectByName('pod-inner-core')!;
    expect(upper).toBeDefined(); expect(lower).toBeDefined(); expect(core).toBeDefined();
    orbit.setSelected('pod'); orbit.setStage(1); orbit.update({ ...frame, reducedMotion: true });
    expect(upper.position.y).toBe(0); expect(lower.position.y).toBeCloseTo(0); expect(core.visible).toBe(false);
    orbit.setStage(2); orbit.update({ ...frame, delta: .016 });
    expect(upper.position.y).toBeGreaterThan(0); expect(upper.position.y).toBeLessThan(.43);
    expect(lower.position.y).toBeLessThan(0); expect(lower.position.y).toBeGreaterThan(-.43);
    orbit.update({ ...frame, reducedMotion: true });
    expect(upper.position.y).toBeCloseTo(.43); expect(lower.position.y).toBeCloseTo(-.43); expect(core.visible).toBe(true);
    const upperPose = upper.position.clone(), lowerPose = lower.position.clone();
    orbit.update({ ...frame, reducedMotion: true, elapsed: 30, delta: .1 });
    expect(upper.position.equals(upperPose)).toBe(true); expect(lower.position.equals(lowerPose)).toBe(true);
    orbit.setStage(0); orbit.update({ ...frame, reducedMotion: true });
    expect(upper.position.y).toBe(0); expect(lower.position.y).toBeCloseTo(0); expect(core.visible).toBe(false);
    orbit.setStage(2); orbit.update({ ...frame, reducedMotion: true });
    orbit.setStage(null); orbit.update({ ...frame, reducedMotion: true });
    expect(upper.position.y).toBe(0); expect(lower.position.y).toBeCloseTo(0); expect(core.visible).toBe(false);
    orbit.dispose();
  });

  it('carries Trigger proof from before the gate through attestation to the far side', () => {
    const orbit = createInstrumentOrbit({ softwareGraphics: true });
    const proof = orbit.group.getObjectByName('trigger-proof')!;
    orbit.setSelected('trigger');
    orbit.setStage(0); orbit.update({ ...frame, reducedMotion: true }); expect(proof.position.z).toBeGreaterThan(1);
    orbit.setStage(1); orbit.update({ ...frame, reducedMotion: true }); expect(proof.position.z).toBe(0);
    orbit.setStage(2); orbit.update({ ...frame, reducedMotion: true }); expect(proof.position.z).toBeLessThan(-1);
    orbit.dispose();
  });

  it('keeps an authorized Envoy inside its boundary and retracts it on Revoke', () => {
    const orbit = createInstrumentOrbit({ softwareGraphics: true });
    const probe = orbit.group.getObjectByName('envoy-probe')!;
    const halo = orbit.group.getObjectByName('envoy-boundary')!;
    orbit.setSelected('envoy'); orbit.setStage(0); orbit.update({ ...frame, reducedMotion: true });
    const authorized = probe.position.clone(), initialScale = probe.scale.x;
    orbit.setStage(1); orbit.update({ ...frame, reducedMotion: true });
    expect(probe.position.distanceTo(authorized)).toBeGreaterThan(.2);
    // The outer edge of the solar panels stays within the authority halo.
    expect(probe.position.length() + 1.265 * probe.scale.x).toBeLessThan(halo.scale.x);
    const claimScale = probe.scale.x;
    orbit.setStage(2); orbit.update({ ...frame, reducedMotion: true });
    expect(probe.position.x).toBe(0); expect(probe.position.y).toBe(0);
    expect(probe.position.z).toBeLessThan(-.5);
    expect(probe.scale.x).toBeLessThan(claimScale); expect(probe.scale.x).toBeLessThan(initialScale);
    orbit.dispose();
  });

  it.each(EXHIBIT_IDS)('eases %s stage changes, snaps for reduced motion, and restores the exact idle mechanism on null', id => {
    const orbit = createInstrumentOrbit({ softwareGraphics: true });
    const names = { fade: 'fade-packet', pod: 'pod-key-ring', trigger: 'trigger-proof', envoy: 'envoy-probe' };
    const part = orbit.group.getObjectByName(names[id])!;
    const snapshot = () => { part.updateMatrix(); return part.matrix.clone(); };
    orbit.update({ ...frame, reducedMotion: true }); const idle = snapshot();
    orbit.setSelected(id); orbit.setStage(0); orbit.update({ ...frame, reducedMotion: true });
    const before = snapshot();
    orbit.setStage(2); orbit.update({ ...frame, delta: .016 }); const eased = snapshot();
    expect(eased.equals(before)).toBe(false);
    orbit.update({ ...frame, reducedMotion: true }); const final = snapshot();
    expect(eased.equals(final)).toBe(false);
    // No ambient clock movement after the explicit reduced-motion change.
    orbit.update({ ...frame, reducedMotion: true, elapsed: 30, delta: .1 }); expect(snapshot().equals(final)).toBe(true);
    for (const invalid of [3, -1, NaN, undefined, '1']) {
      orbit.setStage(invalid as ExhibitStage); orbit.update({ ...frame, reducedMotion: true });
      expect(snapshot().equals(final)).toBe(true);
    }
    orbit.setStage(null); orbit.update({ ...frame, reducedMotion: true }); expect(snapshot().equals(idle)).toBe(true);
    orbit.dispose();
  });

  it('only changes the selected mechanism and reuses all resources through repeated stage changes', () => {
    const orbit = createInstrumentOrbit({ softwareGraphics: true });
    orbit.update({ ...frame, reducedMotion: true });
    const resources = new Set<THREE.BufferGeometry | THREE.Material>();
    const parts = new Map<THREE.Object3D, THREE.Matrix4>();
    orbit.group.traverse(object => {
      object.updateMatrix();
      if (object !== orbit.group && !orbit.group.children.includes(object)) parts.set(object, object.matrix.clone());
      if (object instanceof THREE.Mesh) { resources.add(object.geometry); resources.add(object.material as THREE.Material); }
    });
    const disposal = [...resources].map(resource => vi.spyOn(resource, 'dispose'));
    for (const id of EXHIBIT_IDS) for (const stage of [0, 1, 2, null] as const) {
      orbit.setSelected(id); orbit.setStage(stage); orbit.update({ ...frame, reducedMotion: true });
      let activeChanges = 0;
      for (const [part, original] of parts) {
        part.updateMatrix();
        let root = part; while (root.parent !== orbit.group) root = root.parent!;
        if (root.userData.exhibit !== id || stage === null) expect(part.matrix.equals(original)).toBe(true);
        else if (!part.matrix.equals(original)) activeChanges++;
        if (part instanceof THREE.Mesh) { expect(resources.has(part.geometry)).toBe(true); expect(resources.has(part.material as THREE.Material)).toBe(true); }
      }
      // Trigger's center gate pose intentionally coincides with its time-zero
      // idle pose; all completed mechanisms must differ from that idle state.
      if (stage === 2) expect(activeChanges).toBeGreaterThan(0);
    }
    disposal.forEach(spy => expect(spy).not.toHaveBeenCalled());
    orbit.dispose(); orbit.dispose(); disposal.forEach(spy => expect(spy).toHaveBeenCalledOnce());
  });

  it('shares and releases every owned geometry/material exactly once without creating frame loops', () => {
    const orbit = createInstrumentOrbit({ softwareGraphics: true });
    const resources = new Set<THREE.BufferGeometry | THREE.Material>(); let draws = 0;
    orbit.group.traverse(object => {
      if (object instanceof THREE.Mesh) { draws++; resources.add(object.geometry); resources.add(object.material as THREE.Material); }
    });
    expect(draws).toBeLessThanOrEqual(24);
    const disposed = [...resources].map(resource => vi.spyOn(resource, 'dispose'));
    orbit.dispose(); orbit.dispose();
    disposed.forEach(spy => expect(spy).toHaveBeenCalledOnce());
    expect(orbit.group.children).toHaveLength(0);
  });
});
