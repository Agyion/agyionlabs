import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const EXHIBIT_IDS = ['fade', 'pod', 'trigger', 'envoy'] as const;
export type ExhibitId = typeof EXHIBIT_IDS[number];
export type ExhibitStage = 0 | 1 | 2;
type Surface = THREE.MeshLambertMaterial | THREE.MeshStandardMaterial;
type Palette = { metal: Surface; dark: Surface; light: THREE.MeshBasicMaterial };
type ExhibitFrame = { elapsed: number; delta: number; landing: boolean; launchProgress: number; reducedMotion: boolean; aspect?: number; stage?: { center: THREE.Vector3; span: number } };
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => value * value * (3 - 2 * value);

/** Four illustrative mechanisms, sharing the scene clock and no browser lifecycle. */
export function createInstrumentOrbit({ softwareGraphics }: { softwareGraphics: boolean }) {
  const group = new THREE.Group(); group.name = 'instrument-orbit';
  const owned = new Set<THREE.BufferGeometry | THREE.Material>();
  const own = <T extends THREE.BufferGeometry | THREE.Material>(resource: T): T => { owned.add(resource); return resource; };
  const box = own(new THREE.BoxGeometry(1, 1, 1));
  const ball = own(new THREE.SphereGeometry(1, 16, 10));
  const cylinder = own(new THREE.CylinderGeometry(1, 1, 1, 24));
  const torus = own(new THREE.TorusGeometry(1, .052, 6, 40));
  const capsule = own(new THREE.CapsuleGeometry(.56, 1.36, 6, 24));
  const screw = own(new THREE.CylinderGeometry(.035, .035, .028, 6));
  const proofShape = own(new THREE.OctahedronGeometry(.29, 0));
  const matrix = new THREE.Matrix4();
  const transform = new THREE.Object3D();
  const pickMeshes: THREE.Mesh[] = [];
  let disposed = false;
  let selected: ExhibitId | null = null, hovered: ExhibitId | null = null;
  let conditionStage: ExhibitStage | null = null;
  let exploring = false, view = 0;
  let opacity = 1;
  const portraitPositions = [[-200, -150, 120], [-210, 135, 140], [180, -140, 120], [180, 150, 100]];

  const palette = (): Palette => {
    const surface = (color: number) => own(softwareGraphics
      ? new THREE.MeshLambertMaterial({ color, transparent: true })
      : new THREE.MeshStandardMaterial({ color, metalness: .65, roughness: .43, transparent: true }));
    return {
      metal: surface(0xbfc6c8), dark: surface(0x283037),
      light: own(new THREE.MeshBasicMaterial({ color: 0xe8b77b, transparent: true, toneMapped: false })),
    };
  };
  const products = EXHIBIT_IDS.map((id, index) => {
    const root = new THREE.Group(); root.name = `exhibit-${id}`; root.userData.exhibit = id;
    const positions = [[-490, -210, 160], [-150, -330, 190], [220, -270, 220], [300, 90, 100]];
    const base = new THREE.Vector3(...positions[index] as [number, number, number]);
    const size = [58, 52, 58, 64][index];
    root.position.copy(base); root.scale.setScalar(size); group.add(root);
    return { id, root, base, size, focus: 0, hover: 0, phase: 0, engagement: 0, materials: palette(), animate: (_time: number, _phase: number, _engagement: number) => {} };
  });
  const mesh = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, id: ExhibitId) => {
    const result = new THREE.Mesh(geometry, material);
    result.userData.exhibit = id; parent.add(result); pickMeshes.push(result); return result;
  };
  // Merge hardware by material: ribs, fasteners and seals do not each cost a draw.
  const builder = (parent: THREE.Object3D, id: ExhibitId) => {
    const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
    return {
      part(geometry: THREE.BufferGeometry, material: THREE.Material, position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0]) {
        transform.position.fromArray(position); transform.scale.fromArray(scale); transform.rotation.set(rotation[0], rotation[1], rotation[2]); transform.updateMatrix();
        matrix.copy(transform.matrix);
        const copy = geometry.index ? geometry.toNonIndexed() : geometry.clone(); copy.applyMatrix4(matrix);
        const bucket = buckets.get(material) ?? []; bucket.push(copy); buckets.set(material, bucket);
      },
      finish() {
        for (const [material, parts] of buckets) {
          const merged = mergeGeometries(parts, false);
          parts.forEach(part => part.dispose());
          if (!merged) throw new Error('Instrument hardware geometry could not be merged.');
          mesh(parent, own(merged), material, id);
        }
      },
    };
  };

  {
    const { root, materials: m, id } = products[0];
    root.rotation.set(.12, -.25, -.24);
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-1.48, .61, 0), new THREE.Vector3(-.72, .43, .14), new THREE.Vector3(.08, .02, .02), new THREE.Vector3(.73, -.58, .15), new THREE.Vector3(1.47, -.91, -.08)]);
    const section = new THREE.Shape(); section.moveTo(-.24, -.075); section.lineTo(.24, -.075); section.lineTo(.24, .075); section.lineTo(-.24, .075); section.closePath();
    const ribbon = own(new THREE.ExtrudeGeometry(section, { steps: 48, bevelEnabled: false, extrudePath: curve }));
    const rail = own(new THREE.TubeGeometry(curve, 48, .027, 6, false));
    const hardware = builder(root, id);
    hardware.part(ribbon, m.metal);
    hardware.part(rail, m.light, [0, 0, .14]);
    for (let i = 0; i <= 8; i++) {
      const point = curve.getPoint(i / 8); const tangent = curve.getTangent(i / 8);
      hardware.part(box, m.dark, [point.x, point.y, point.z - .14], [.065, .52, .12], [0, 0, Math.atan2(tangent.y, tangent.x)]);
      hardware.part(screw, m.metal, [point.x, point.y, point.z + .16], [1, 1, 1], [Math.PI / 2, 0, 0]);
    }
    hardware.finish();
    const packet = mesh(root, ball, m.light, id); packet.name = 'fade-packet'; packet.scale.setScalar(.105);
    products[0].animate = (time, phase, engagement) => {
      const idle = (time * .12 + .35) % 1;
      curve.getPoint(THREE.MathUtils.lerp(idle, .05 + phase * .45, engagement), packet.position);
      packet.position.z += .2;
    };
  }
  {
    const { root, materials: m, id } = products[1]; root.rotation.set(.1, .36, -.37);
    // A hollow half-shell, including its inner wall and lip. Mirroring a second
    // instance closes the capsule at y=0; the two groups can then retract without
    // clipping shaders, per-frame geometry changes or a solid hull hiding the core.
    const profile = [new THREE.Vector2(.56, 0), new THREE.Vector2(.56, .68)];
    for (let i = 1; i <= 6; i++) {
      const angle = i / 6 * Math.PI / 2;
      profile.push(new THREE.Vector2(Math.cos(angle) * .56, .68 + Math.sin(angle) * .56));
    }
    for (let i = 6; i >= 0; i--) {
      const angle = i / 6 * Math.PI / 2;
      profile.push(new THREE.Vector2(Math.cos(angle) * .515, .68 + Math.sin(angle) * .515));
    }
    profile.push(new THREE.Vector2(.515, 0), new THREE.Vector2(.56, 0));
    const shellGeometry = own(new THREE.LatheGeometry(profile, 24));
    const shells = [1, -1].map(side => {
      const shell = new THREE.Group(); shell.name = side === 1 ? 'pod-shell-upper' : 'pod-shell-lower';
      if (side < 0) shell.rotation.z = Math.PI;
      root.add(shell);
      const hardware = builder(shell, id);
      hardware.part(shellGeometry, m.metal);
      hardware.part(box, m.dark, [0, .34, .54], [.21, .58, .045]);
      hardware.part(box, m.light, [0, .34, .571], [.035, .26, .016]);
      for (let i = 0; i < 8; i++) {
        const angle = i / 8 * Math.PI * 2;
        hardware.part(box, m.dark, [Math.sin(angle) * .54, .33, Math.cos(angle) * .54], [.047, .56, .066], [0, angle, 0]);
        hardware.part(screw, m.metal, [Math.sin(angle) * .581, .55, Math.cos(angle) * .581], [1.15, 1, 1.15], [Math.PI / 2, 0, -angle]);
      }
      hardware.finish();
      return shell;
    });
    const core = new THREE.Group(); core.name = 'pod-inner-core'; core.visible = false; root.add(core);
    const inner = builder(core, id);
    inner.part(capsule, m.dark, [0, 0, 0], [.67, .4, .67]);
    for (const y of [-.25, 0, .25]) inner.part(torus, m.light, [0, y, 0], [.34, .34, .34], [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 4; i++) {
      const angle = i / 4 * Math.PI * 2;
      inner.part(box, m.light, [Math.sin(angle) * .3, 0, Math.cos(angle) * .3], [.028, .65, .028]);
    }
    inner.finish();
    const ringA = mesh(root, torus, m.metal, id); ringA.name = 'pod-key-ring'; ringA.scale.setScalar(.81); ringA.position.y = -.4;
    const ringB = mesh(root, torus, m.light, id); ringB.name = 'pod-unlock-ring'; ringB.scale.setScalar(.83); ringB.position.y = .45;
    products[1].animate = (time, phase, engagement) => {
      const alignment = clamp(phase), reveal = clamp(phase - 1);
      const tilt = THREE.MathUtils.lerp(Math.sin(time * .4) * .34, (1 - alignment) * .38, engagement);
      const turn = THREE.MathUtils.lerp(.2, (1 - alignment) * .36, engagement);
      ringA.rotation.set(Math.PI / 2 + tilt, turn, 0);
      ringB.rotation.set(Math.PI / 2 - tilt, -turn, 0);
      ringA.position.y = -.4 - reveal * engagement * .95;
      ringB.position.y = .45 + reveal * engagement * .9;
      ringA.scale.setScalar(.81 + reveal * engagement * .12);
      ringB.scale.setScalar(.83 + reveal * engagement * .12);
      const opening = smooth(reveal) * engagement;
      shells[0].position.y = opening * .43;
      shells[1].position.y = -opening * .43;
      core.visible = opening > .005;
    };
  }
  {
    const { root, materials: m, id } = products[2]; root.rotation.set(-.1, -.31, .14);
    const hardware = builder(root, id);
    for (const x of [-.97, .97]) {
      hardware.part(box, m.metal, [x, 0, 0], [.29, 2.38, .45]);
      hardware.part(box, m.dark, [x, 0, .246], [.14, 1.84, .055]);
      for (const y of [-.78, -.39, 0, .39, .78]) {
        hardware.part(box, m.light, [x, y, .282], [.07, .075, .012]);
        hardware.part(screw, m.metal, [x, y + .15, .288], [1, 1, 1], [Math.PI / 2, 0, 0]);
      }
    }
    for (const y of [-1.1, 1.1]) {
      hardware.part(box, m.metal, [0, y, 0], [2.17, .24, .45]);
      hardware.part(box, m.dark, [0, y, .24], [1.61, .1, .03]);
    }
    hardware.part(box, m.dark, [0, -1.33, -.08], [2.53, .14, .86]);
    hardware.finish();
    const proof = mesh(root, proofShape, m.light, id); proof.name = 'trigger-proof';
    products[2].animate = (time, phase, engagement) => {
      proof.position.z = THREE.MathUtils.lerp(Math.sin(time * .58) * 1.15, 1.25 - phase * 1.25, engagement);
      proof.rotation.set(time * .27, time * .4, .3);
    };
  }
  {
    const { root, materials: m, id } = products[3]; root.rotation.set(.18, .22, -.2);
    const probe = new THREE.Group(); probe.name = 'envoy-probe'; root.add(probe);
    const hardware = builder(probe, id);
    hardware.part(box, m.metal, [0, 0, 0], [.67, .82, .7]);
    hardware.part(ball, m.dark, [0, 0, .36], [.24, .24, .09]);
    hardware.part(ball, m.light, [0, 0, .431], [.105, .105, .035]);
    for (const side of [-1, 1]) {
      hardware.part(box, m.metal, [side * .78, 0, -.06], [.9, .055, .09]);
      hardware.part(box, m.dark, [side * .96, 0, -.12], [.61, .81, .045]);
      for (let i = -2; i <= 2; i++) hardware.part(box, m.metal, [side * .96, i * .15, -.086], [.6, .018, .014]);
    }
    hardware.part(cylinder, m.metal, [0, .61, 0], [.022, .46, .022]);
    hardware.part(ball, m.light, [0, .85, 0], [.054, .054, .054]);
    hardware.finish();
    const halo = mesh(root, torus, m.light, id); halo.name = 'envoy-boundary'; halo.scale.setScalar(1.53);
    products[3].animate = (time, phase, engagement) => {
      const authorized = clamp(phase), revoked = clamp(phase - 1);
      const orbit = authorized * (1 - revoked);
      probe.position.set(
        THREE.MathUtils.lerp(Math.sin(time * .33) * .13, Math.cos(time * .33) * .24 * orbit, engagement),
        THREE.MathUtils.lerp(Math.cos(time * .33) * .1, Math.sin(time * .33) * .2 * orbit, engagement),
        -.6 * revoked * engagement,
      );
      probe.scale.setScalar(THREE.MathUtils.lerp(1, .9 - authorized * .04 - revoked * .36, engagement));
      probe.rotation.y = Math.sin(time * .23) * .22;
      halo.rotation.set(.25, .4 + Math.sin(time * .22) * .16, 0);
    };
  }

  return {
    group,
    setSelected(id: ExhibitId | null) { selected = EXHIBIT_IDS.includes(id as ExhibitId) ? id : null; },
    setStage(stage: ExhibitStage | null) {
      if (!disposed && (stage === null || stage === 0 || stage === 1 || stage === 2)) conditionStage = stage;
    },
    setExploring(active: boolean) { exploring = active; },
    setHovered(id: ExhibitId | null) {
      const next = EXHIBIT_IDS.includes(id as ExhibitId) ? id : null;
      if (hovered === next) return false;
      hovered = next; return true;
    },
    update(frame: ExhibitFrame) {
      if (disposed) return;
      opacity = frame.landing ? 1 - smooth(clamp(frame.launchProgress / .15)) : 0;
      group.visible = opacity > .001;
      if (!group.visible) return;
      const time = frame.reducedMotion ? 0 : frame.elapsed;
      const alpha = frame.reducedMotion ? 1 : 1 - Math.exp(-5 * Math.max(0, frame.delta));
      view += ((exploring ? 1 : 0) - view) * alpha;
      for (const [index, product] of products.entries()) {
        const small = (frame.aspect ?? 1.44) < .95;
        const size = small ? [40, 38, 40, 40][index] : product.size;
        product.focus += ((selected === product.id ? 1 : 0) - product.focus) * alpha;
        product.hover += ((hovered === product.id ? 1 : 0) - product.hover) * alpha;
        const active = selected === product.id && conditionStage !== null;
        if (active) product.phase += (conditionStage! - product.phase) * alpha;
        product.engagement += ((active ? 1 : 0) - product.engagement) * alpha;
        if (small) product.root.position.fromArray(portraitPositions[index]);
        else product.root.position.copy(product.base);
        product.root.position.z += product.focus * 95;
        // One selected mechanism occupies the physical stage. Others recede,
        // keeping their real pick surfaces while making the view change legible.
        const stage = view * product.focus;
        const outer = view * (1 - product.focus);
        product.root.position.x *= 1 + outer * .24;
        product.root.position.y *= 1 + outer * .12;
        product.root.position.x += ((frame.stage?.center.x ?? 0) - product.root.position.x) * stage;
        product.root.position.y += ((frame.stage?.center.y ?? (small ? 115 : 45)) - product.root.position.y) * stage;
        product.root.position.z += ((frame.stage?.center.z ?? 220) - product.root.position.z) * stage;
        const baseSize = size * (1 + product.focus * .28 + product.hover * .055) * (1 - outer * .22);
        const stageSize = frame.stage ? frame.stage.span / [3.3, 2.65, 2.8, 3.35][index] : baseSize * 2.75;
        product.root.scale.setScalar(baseSize + (stageSize - baseSize) * stage);
        product.materials.metal.color.setHex(0xbfc6c8).multiplyScalar(.82 + product.focus * .35 + product.hover * .12 + stage * .25);
        product.materials.dark.color.setHex(0x283037).multiplyScalar(.9 + product.focus * .22);
        product.materials.light.color.setHex(0xe8b77b).multiplyScalar(.7 + product.focus * 1.7 + product.hover * .6);
        for (const material of Object.values(product.materials)) material.opacity = opacity * (1 - outer * .74);
        product.animate(time, product.phase, product.engagement);
      }
    },
    pick(raycaster: THREE.Raycaster): ExhibitId | null {
      if (disposed || !group.visible || opacity < .15) return null;
      return raycaster.intersectObjects(pickMeshes, false)[0]?.object.userData.exhibit as ExhibitId | undefined ?? null;
    },
    dispose() {
      if (disposed) return;
      disposed = true; group.removeFromParent(); group.clear(); pickMeshes.length = 0;
      for (const resource of owned) resource.dispose(); owned.clear();
    },
  };
}
