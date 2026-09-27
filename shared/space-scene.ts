import * as THREE from 'three';
import { bindOrbitInput, ORBIT_DRAG_SENSITIVITY } from './orbit-input';
import { applyStationFlightPose, arrivalCameraDistance, freeOrbitFraming, ModuleCameraRig, zoomFreeOrbit } from './module-camera';
import { createSceneCompositor } from './scene-compositor';
import { createStarField } from './star-field';
import { createLensTexture, createAccretionTexture, holeVertex, holeFragment, accretionVertex, accretionFragment } from './black-hole';
import { ARRIVAL_DURATION_MS, LAUNCH_DURATION_MS, writeFlightHandoff } from './flight-handoff';
import type { ArrivalPose } from './flight-handoff';
import { sampleLaunchFlight } from './flight-path';
import { PointerAim } from './pointer-aim';
import { createInstrumentOrbit } from './instrument-orbit';
import type { ExhibitId } from './instrument-orbit';

export type Mode = 'landing' | 'station';

export type { ArrivalPose } from './flight-handoff';

/** Host-relative coordinates. The scene reuses this object; copy values to retain a frame. */
export interface HoleProjection {
  x: number;
  y: number;
  /** Critical-curve radius as a fraction of the host height. */
  radius: number;
  visible: boolean;
}

export interface OrbitalSceneOptions {
  mode: Mode;
  reducedMotion?: boolean;
  interactive?: boolean;
  showExhibits?: boolean;
  arrival?: boolean;
  arrivalPose?: ArrivalPose;
  softwareGraphicsHint?: boolean;
  arrivalRevealMs?: number;
  framePanel?: boolean;
  onSelect?: (id: string) => void;
  onExhibitSelect?: (id: ExhibitId) => void;
  onReady?: () => void;
  onHoleProjection?: (projection: Readonly<HoleProjection>) => void;
  onArrivalComplete?: () => void;
  onError?: (error: unknown) => void;
}

export interface OrbitalScene {
  dispose: () => void;
  setMode: (mode: Mode) => void;
  setSelected: (id: string) => void;
  setExhibit: (id: ExhibitId | null) => void;
  setExhibitView: (active: boolean) => void;
  setExhibitStage: (stage: 0 | 1 | 2 | null) => void;
  previewInstrument: (id: string | null) => void;
  emitTransfer: () => void;
  setPaused: (paused: boolean) => void;
  /** Re-measure the existing host after an explicit layout change. */
  refreshLayout: () => void;
  launch: () => Promise<void>;
  explore: () => void;
  setProgress: (progress: number) => void;
  setPanelOpen: (open: boolean, options?: { focus?: boolean }) => void;
}

export type OrbitalSceneHandle = OrbitalScene;

const MODULE_IDS = ['fade', 'pod', 'trigger', 'envoy', 'ramp', 'ledger'];
const CREAM = 0xf2eee5;
const AMBER = 0xe8b77b;

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** One continuous world: distant approach, escape flight, and direct orbital control. */
export function createOrbitalScene(
  container: HTMLElement,
  options: OrbitalSceneOptions,
): OrbitalScene {
  const reducedMotion = options.reducedMotion ?? window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const initialAntialias = options.softwareGraphicsHint !== true;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: initialAntialias,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false,
    });
  } catch (error) {
    options.onError?.(error);
    throw error;
  }

  const debugInfo = renderer.getContext().getExtension('WEBGL_debug_renderer_info');
  const gpuName = debugInfo ? String(renderer.getContext().getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : '';
  const softwareGraphics = /swiftshader|llvmpipe|software|lavapipe/i.test(gpuName);
  if (initialAntialias === softwareGraphics) {
    // Reuse a correctly hinted software context. If the actual GPU changed (or
    // cannot be identified), restore hardware AA instead of trusting the hint.
    renderer.dispose(); renderer.forceContextLoss();
    renderer = new THREE.WebGLRenderer({alpha:true, antialias:!softwareGraphics, powerPreference:'high-performance'});
  }
  const fullPixelRatio = Math.min(window.devicePixelRatio || 1, softwareGraphics ? 1 : 1.5);
  renderer.setPixelRatio(fullPixelRatio);
  renderer.debug.onShaderError = () => { throw new Error("The orbital shader could not compile."); };
  renderer.setClearColor(0x07090d, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = !softwareGraphics;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  if (!options.interactive) renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.style.cssText = `display:block;width:100%;height:100%;pointer-events:${options.interactive ? 'auto' : 'none'};`;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const background = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(44, 1, .1, 4000);
  camera.position.set(0, 0, 19);
  const resources: Array<{ dispose: () => void }> = [];
  const own = <T extends { dispose: () => void }>(resource: T): T => {
    resources.push(resource);
    return resource;
  };

  // A small repeatable surface map adds seams, fasteners and uneven ceramic
  // finish. It is generated locally and shared by the complete pressure hull.
  const skinSize = 256;
  const skinPixels = new Uint8Array(skinSize * skinSize * 4);
  const skinRandom = seededRandom(7214);
  for (let y = 0; y < skinSize; y += 1) {
    for (let x = 0; x < skinSize; x += 1) {
      const tileX = x % 64;
      const tileY = y % 64;
      const edge = Math.min(tileX, 63 - tileX, tileY, 63 - tileY);
      const fastener = (Math.abs(tileX - 6) < 1.4 || Math.abs(tileX - 57) < 1.4)
        && (Math.abs(tileY - 6) < 1.4 || Math.abs(tileY - 57) < 1.4);
      const panel = ((Math.floor(x / 64) * 7 + Math.floor(y / 64) * 3) % 5) * 4;
      const value = fastener ? 124 : edge < 1 ? 149 : 231 - panel + skinRandom() * 10;
      const offset = (y * skinSize + x) * 4;
      skinPixels[offset] = value;
      skinPixels[offset + 1] = value;
      skinPixels[offset + 2] = value;
      skinPixels[offset + 3] = 255;
    }
  }
  const skinMap = own(new THREE.DataTexture(skinPixels, skinSize, skinSize));
  skinMap.colorSpace = THREE.SRGBColorSpace;
  skinMap.wrapS = THREE.RepeatWrapping;
  skinMap.wrapT = THREE.RepeatWrapping;
  skinMap.magFilter = THREE.LinearFilter;
  skinMap.minFilter = THREE.LinearMipmapLinearFilter;
  skinMap.generateMipmaps = true;
  skinMap.needsUpdate = true;

  // Ceramic cladding sits over a dark load-bearing frame. The small foil
  // blankets remain dull in shade rather than making every bay a gold tile.
  const surface = (parameters: THREE.MeshStandardMaterialParameters) => softwareGraphics
    ? new THREE.MeshLambertMaterial({
      color: parameters.color, map: parameters.map,
      emissive: parameters.emissive, emissiveIntensity: parameters.emissiveIntensity,
    })
    : new THREE.MeshStandardMaterial(parameters);
  const hullMaterial = own(surface({
    color: 0xa8acaa, roughness: .72, metalness: .28, map: skinMap, bumpMap: skinMap, bumpScale: .008,
  }));
  const lightHullMaterial = own(surface({
    color: 0xd5d4cd, roughness: .82, metalness: .14, map: skinMap, bumpMap: skinMap, bumpScale: .008,
  }));
  const frameMaterial = own(surface({
    color: 0x333b42, roughness: .64, metalness: .68,
  }));
  const darkMaterial = own(surface({
    color: 0x101820, roughness: .8, metalness: .24,
  }));
  const goldMaterial = own(surface({
    color: 0x695b40, roughness: .87, metalness: .45,
  }));
  const glassMaterial = own(surface({
    color: 0x15222d, metalness: .48, roughness: .24,
    emissive: 0x496a87, emissiveIntensity: .06,
  }));
  const lampMaterial = own(new THREE.MeshBasicMaterial({color: CREAM}));
  const navigationMaterial = own(new THREE.MeshBasicMaterial({color: AMBER}));

  const boxGeometry = own(new THREE.BoxGeometry(1, 1, 1));
  const cylinderGeometry = own(new THREE.CylinderGeometry(1, 1, 1, 12));
  const sphereGeometry = own(new THREE.SphereGeometry(1, 8, 6));
  const hullProfile = new THREE.Shape();
  hullProfile.moveTo(-.29, -.3);
  hullProfile.lineTo(.29, -.3);
  hullProfile.lineTo(.35, -.23);
  hullProfile.lineTo(.35, .23);
  hullProfile.lineTo(.27, .31);
  hullProfile.lineTo(-.27, .31);
  hullProfile.lineTo(-.35, .23);
  hullProfile.lineTo(-.35, -.23);
  hullProfile.closePath();
  const hullGeometry = own(new THREE.ExtrudeGeometry(hullProfile, {
    steps: 1, depth: .77, bevelEnabled: true,
    bevelSegments: 1, bevelSize: .014, bevelThickness: .014, curveSegments: 1,
  }));
  hullGeometry.translate(0, 0, -.385);
  const addBox = (
    parent: THREE.Object3D, material: THREE.Material,
    size: [number, number, number], position: [number, number, number],
  ) => {
    const mesh = new THREE.Mesh(boxGeometry, material);
    mesh.scale.set(...size);
    mesh.position.set(...position);
    parent.add(mesh);
    return mesh;
  };
  const addCylinder = (
    parent: THREE.Object3D, material: THREE.Material,
    radius: number, length: number, position: [number, number, number],
  ) => {
    const mesh = new THREE.Mesh(cylinderGeometry, material);
    mesh.scale.set(radius, length, radius);
    mesh.position.set(...position);
    parent.add(mesh);
    return mesh;
  };

  // The accretion disk is the principal light source: a hard warm edge,
  // with restrained blue fill to keep the unlit construction readable.
  scene.add(new THREE.AmbientLight(0x809ab1, .2));
  const accretionLight = new THREE.DirectionalLight(0xffd6a2, 5.6);
  accretionLight.position.set(-18, 7, -25);
  accretionLight.castShadow = true;
  accretionLight.shadow.mapSize.set(1024, 1024);
  accretionLight.shadow.camera.left = -8;
  accretionLight.shadow.camera.right = 8;
  accretionLight.shadow.camera.top = 8;
  accretionLight.shadow.camera.bottom = -8;
  accretionLight.shadow.camera.near = .5;
  accretionLight.shadow.camera.far = 60;
  accretionLight.shadow.normalBias = .018;
  accretionLight.shadow.bias = -.00012;
  own(accretionLight.shadow);
  scene.add(accretionLight, accretionLight.target);
  const fillLight = new THREE.DirectionalLight(0xc0d3e2, 1.6);
  fillLight.position.set(-4, 6, 10);
  scene.add(fillLight);
  const undersideLight = new THREE.DirectionalLight(0x6688a5, .22);
  undersideLight.position.set(-3, -8, 3);
  scene.add(undersideLight);

  const stars = own(createStarField(fullPixelRatio));

  const accretionTexture = own(createAccretionTexture());
  const holeMaterial = own(new THREE.ShaderMaterial({
    uniforms: {uTime: {value: 0}, uIntensity: {value: 1.1}, uLens: {value: own(createLensTexture())}, uFlow: {value: accretionTexture}, uInclination: {value: .1564}, uDiskRoll: {value: 0}, uDiskSide: {value: 1}},
    vertexShader: holeVertex,
    fragmentShader: holeFragment,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.FrontSide,
  }));
  // Material flow is rendered every display frame; no 4/10 Hz image cache.
  const hole = new THREE.Mesh(own(new THREE.PlaneGeometry(1380, 851)), holeMaterial);
  hole.position.set(-240, -10, -600);
  hole.renderOrder = 1;
  background.add(hole);
  const foregroundMaterial = own(new THREE.ShaderMaterial({
    uniforms: {uTime:{value:0},uFlow:{value:accretionTexture},uOpacity:{value:1},uHoleScreen:{value:new THREE.Vector2()},uHoleRadius:{value:0},uHoleDepth:{value:0},uAspect:{value:1}},
    vertexShader: accretionVertex, fragmentShader: accretionFragment,
    transparent:true, depthWrite:false, side:THREE.DoubleSide,
  }));
  const accretionPlane = new THREE.Mesh(own(new THREE.PlaneGeometry(2440,2440,64,64)),foregroundMaterial);
  accretionPlane.rotation.x = -Math.PI / 2;
  accretionPlane.position.copy(hole.position);
  accretionPlane.renderOrder = 2;
  background.add(accretionPlane);

  const station = new THREE.Group();
  station.renderOrder = 2;
  scene.add(station);
  const ring = new THREE.Group();
  station.add(ring);
  // Connection endpoints are expressed in the same parent's coordinates; a
  // rotated bay or docking craft cannot leave its pressure tube pointing away.
  const connectCylinder = (parent: THREE.Object3D, material: THREE.Material, radius: number, from: THREE.Vector3, to: THREE.Vector3) => {
    const direction = to.clone().sub(from);
    const middle = from.clone().add(to).multiplyScalar(.5);
    const tube = addCylinder(parent, material, radius, direction.length(), [middle.x, middle.y, middle.z]);
    tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return tube;
  };
  const bayHatch = (index: number, side: number) => {
    const angle = index / 12 * Math.PI * 2;
    return new THREE.Vector3(side * .389, -.012, -.012)
      .applyAxisAngle(new THREE.Vector3(0, 0, 1), angle - Math.PI / 2)
      .add(new THREE.Vector3(Math.cos(angle) * 2.47, Math.sin(angle) * 2.47, 0));
  };
  // Two pressure rails and a service conduit connect twelve independent
  // pressurized modules. The open gaps retain the station's wheel silhouette.
  const railGeometry = own(new THREE.TorusGeometry(2.47, .052, 8, 144));
  for (const depth of [-.29, .29]) {
    const rail = new THREE.Mesh(railGeometry, frameMaterial);
    rail.position.z = depth;
    ring.add(rail);
  }
  const conduit = new THREE.Mesh(own(new THREE.TorusGeometry(2.39, .016, 5, 144)), hullMaterial);
  conduit.position.z = -.38;
  ring.add(conduit);

  // Keep physical light anchors in the bay hierarchy for transfer departure
  // points; their visible strips are instanced after the hull fittings.
  const bayIndicators: THREE.Object3D[] = [];
  for (let index = 0; index < 12; index += 1) {
    const angle = index / 12 * Math.PI * 2;
    const bay = new THREE.Group();
    bay.position.set(Math.cos(angle) * 2.47, Math.sin(angle) * 2.47, 0);
    bay.rotation.z = angle - Math.PI / 2;
    ring.add(bay);
    const variant = index % 3;

    // Faceted pressure shell, exposed corner longerons, and separate cladding
    // tiles give the hull real side faces instead of a flat decorative plaque.
    bay.add(new THREE.Mesh(hullGeometry, variant === 2 ? hullMaterial : lightHullMaterial));
    addBox(bay, darkMaterial, [.6, .025, .64], [0, .326, -.015]);
    addBox(bay, frameMaterial, [.62, .04, .67], [0, -.318, -.005]);
    for (const x of [-.285, .285]) {
      addBox(bay, hullMaterial, [.032, .49, .032], [x, 0, .414]);
      addBox(bay, frameMaterial, [.037, .54, .037], [x, 0, -.414]);
    }
    // Broad side faces carry cladding seams and a recessed service panel,
    // making depth legible as the bays turn through the key light.
    for (const side of [-1, 1]) {
      addBox(bay, hullMaterial, [.018, .205, .49], [side * .364, .063, .005]);
      addBox(bay, frameMaterial, [.023, .012, .57], [side * .367, -.147, -.009]);
      addBox(bay, darkMaterial, [.025, .018, .41], [side * .372, .132, .004]);
      addBox(bay, lightHullMaterial, [.026, .119, .17], [side * .378, .001, .181]);
      for (const depth of [-.27, .27]) {
        addBox(bay, frameMaterial, [.019, .48, .014], [side * .369, .009, depth]);
      }
    }
    // Recessed central avionics and two offset removable access panels.
    addBox(bay, darkMaterial, [.37, .43, .019], [0, .002, .405]);
    addBox(bay, hullMaterial, [.155, .205, .03], [-.096, .1, .421]);
    addBox(bay, lightHullMaterial, [.155, .135, .033], [.091, -.113, .424]);
    addBox(bay, goldMaterial, [.115, .115, .025], [.096, .12, .417]);
    addBox(bay, darkMaterial, [.127, .081, .036], [-.093, -.086, .427]);
    // A handful of readable louvers work at landing scale; tiny seams remain
    // geometric rather than being painted with emissive outlines.
    for (let vent = 0; vent < 4; vent += 1) {
      addBox(bay, hullMaterial, [.12, .009, .012], [-.093, -.117 + vent * .02, .45]);
      addBox(bay, frameMaterial, [.12, .012, .026], [.096, .077 + vent * .027, .437]);
    }
    for (const x of [-.22, .22]) {
      for (const y of [-.24, .24]) {
        addBox(bay, darkMaterial, [.014, .014, .01], [x, y, .418]);
      }
    }
    // Every third module has a different payload: an observation slit,
    // a paired storage canister, or an exposed thermal-control compartment.
    if (variant === 0) {
      addBox(bay, darkMaterial, [.41, .07, .03], [0, .246, .413]);
      for (const x of [-.135, 0, .135]) {
        addBox(bay, glassMaterial, [.105, .043, .016], [x, .246, .437]);
      }
      addBox(bay, hullMaterial, [.42, .026, .075], [0, .286, .429]);
    } else if (variant === 1) {
      for (const x of [-.12, .12]) {
        const tank = addCylinder(bay, hullMaterial, .047, .35, [x, .03, -.465]);
        tank.rotation.x = Math.PI / 2;
        addBox(bay, frameMaterial, [.026, .075, .36], [x, .029, -.46]);
      }
      addBox(bay, goldMaterial, [.37, .012, .47], [0, .344, -.035]);
      for (let seam = 0; seam < 4; seam += 1) {
        addBox(bay, frameMaterial, [.015, .017, .45], [-.15 + seam * .1, .353, -.035]);
      }
    } else {
      addBox(bay, darkMaterial, [.036, .39, .51], [.37, 0, 0]);
      for (let fin = 0; fin < 7; fin += 1) {
        addBox(bay, hullMaterial, [.04, .013, .45], [.392, -.153 + fin * .052, .015]);
      }
      addBox(bay, frameMaterial, [.35, .14, .095], [0, .19, -.449]);
    }

    const indicator = new THREE.Object3D();
    indicator.position.set(0, -.253, .421);
    indicator.scale.set(.11, .012, .012);
    bay.add(indicator);
    bayIndicators.push(indicator);

    // Side hatches, inter-module pressure tunnels and external cable trunks.
    for (const side of [-1, 1]) {
      const hatch = addCylinder(bay, frameMaterial, .11, .028, [side * .373, -.012, -.012]);
      hatch.rotation.z = Math.PI / 2;
      const cover = addCylinder(bay, hullMaterial, .075, .039, [side * .389, -.012, -.012]);
      cover.rotation.z = Math.PI / 2;
    }
    // Each tunnel reaches the opposite hatch on the preceding rotated module,
    // with overlapping flanges and a short ribbed flexible middle section.
    const hatchFrom = bayHatch(index, 1);
    const hatchTo = bayHatch((index + 11) % 12, -1);
    const coupler = connectCylinder(ring, frameMaterial, .078, hatchFrom, hatchTo);
    for (const fraction of [.08, .32, .5, .68, .92]) {
      const center = hatchFrom.clone().lerp(hatchTo, fraction);
      const rib = addCylinder(ring, hullMaterial, fraction === .08 || fraction === .92 ? .101 : .087, .022, [center.x, center.y, center.z]);
      rib.quaternion.copy(coupler.quaternion);
    }
    addBox(bay, darkMaterial, [.078, .58, .09], [-.22, 0, -.44]);
    addBox(bay, hullMaterial, [.016, .51, .018], [-.237, 0, -.494]);
    const lamp = new THREE.Mesh(sphereGeometry, index % 3 === 0 ? navigationMaterial : lampMaterial);
    lamp.scale.setScalar(.011);
    lamp.position.set(.28, .225, .436);
    bay.add(lamp);

    // Thin graphite radiators expose dark ribs and narrow metal perimeter rails.
    if (index % 3 === 1) {
      addBox(bay, darkMaterial, [.42, .68, .022], [-.025, .7, -.22]);
      addBox(bay, frameMaterial, [.026, .76, .028], [-.025, .69, -.22]);
      for (const side of [-1, 1]) {
        addBox(bay, hullMaterial, [.01, .68, .022], [-.025 + side * .215, .7, -.215]);
      }
      for (let rib = 0; rib < 9; rib += 1) {
        addBox(bay, frameMaterial, [.43, .009, .025], [-.025, .392 + rib * .077, -.204]);
      }
    }
    if (index === 2 || index === 8) {
      addCylinder(bay, frameMaterial, .01, .68, [.21, .58, .14]);
      addBox(bay, hullMaterial, [.2, .009, .012], [.21, .79, .14]);
      addBox(bay, hullMaterial, [.13, .009, .012], [.21, .67, .14]);
    }
    if (index === 5) {
      const dish = new THREE.Mesh(own(new THREE.ConeGeometry(.14, .065, 16, 1, true)), hullMaterial);
      dish.position.set(-.16, .46, .1);
      dish.rotation.x = .48;
      bay.add(dish);
      addCylinder(bay, frameMaterial, .015, .24, [-.16, .4, .1]);
    }
  }

  // Narrow open trusses carry the docking spine without visually filling in
  // the wheel. Both rails and their triangular braces are structural geometry.
  const trussMaterial = own(new THREE.LineBasicMaterial({color: 0x52616d, transparent: true, opacity: .45}));
  const trussVertices: number[] = [];
  for (let index = 0; index < 4; index += 1) {
    const angle = index / 4 * Math.PI * 2;
    const spoke = new THREE.Group();
    spoke.rotation.z = angle - Math.PI / 2;
    ring.add(spoke);
    // Girders pass inside the hub skin and the bay floor, rather than stopping
    // .14 short of the hub. Visible root clamps carry the offset service rail.
    addBox(spoke, frameMaterial, [.058, 2.16, .08], [0, 1.25, -.11]);
    addBox(spoke, hullMaterial, [.022, 2.16, .032], [.095, 1.25, -.19]);
    addBox(spoke, frameMaterial, [.19, .25, .16], [.035, .25, -.13]);
    for (const radial of [.27, 2.19]) addBox(spoke, hullMaterial, [.16, .052, .13], [.025, radial, -.14]);
    for (let step = 0; step < 7; step += 1) {
      const a = new THREE.Vector3(step % 2 ? .095 : 0, .4 + step * .275, -.16).applyAxisAngle(new THREE.Vector3(0, 0, 1), angle - Math.PI / 2);
      const b = new THREE.Vector3(step % 2 ? 0 : .095, .675 + step * .275, -.16).applyAxisAngle(new THREE.Vector3(0, 0, 1), angle - Math.PI / 2);
      trussVertices.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }
  const trussGeometry = own(new THREE.BufferGeometry());
  trussGeometry.setAttribute('position', new THREE.Float32BufferAttribute(trussVertices, 3));
  ring.add(new THREE.LineSegments(trussGeometry, trussMaterial));

  const hub = addCylinder(ring, hullMaterial, .225, 1.06, [0, 0, .04]);
  hub.rotation.x = Math.PI / 2;
  const dockingCollar = addCylinder(ring, lightHullMaterial, .205, .17, [0, 0, .63]);
  dockingCollar.rotation.x = Math.PI / 2;
  const port = addCylinder(ring, darkMaterial, .143, .07, [0, 0, .729]);
  port.rotation.x = Math.PI / 2;
  const hubRingGeometry = own(new THREE.TorusGeometry(.232, .016, 6, 24));
  for (const depth of [-.42, -.25, .29, .49]) {
    const hubRing = new THREE.Mesh(hubRingGeometry, frameMaterial);
    hubRing.position.z = depth;
    ring.add(hubRing);
  }
  for (let index = 0; index < 8; index += 1) {
    const angle = index / 8 * Math.PI * 2;
    addBox(ring, darkMaterial, [.023, .023, .63], [Math.cos(angle) * .223, Math.sin(angle) * .223, .04]);
  }

  // A faceted lifting-body tender and paired engine bells give the station a
  // human scale without oversized toy wings or a luminous cockpit billboard.
  const shuttle = new THREE.Group();
  shuttle.position.set(.18, -.19, 1.0);
  shuttle.rotation.set(.1, -.3, -.6);
  ring.add(shuttle);
  // A sealed axial neck, articulated elbow and belly collar dock the tender to
  // the hub. The offset craft retains its silhouette but no longer floats ahead
  // of the port. Two slim stays brace the pressure joint against twisting.
  const neck = addCylinder(ring, hullMaterial, .09, .21, [0, 0, .785]);
  neck.rotation.x = Math.PI / 2;
  const pivot = new THREE.Vector3(0, 0, .875);
  const tenderPoint = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyEuler(shuttle.rotation).add(shuttle.position);
  const tenderDock = tenderPoint(0, -.065, -.1);
  const dockingTube = connectCylinder(ring, frameMaterial, .076, pivot, tenderDock);
  for (const fraction of [.12, .78]) {
    const center = pivot.clone().lerp(tenderDock, fraction);
    const clamp = addCylinder(ring, hullMaterial, .096, .028, [center.x, center.y, center.z]);
    clamp.quaternion.copy(dockingTube.quaternion);
  }
  const bellyCollar = addCylinder(shuttle, hullMaterial, .098, .12, [0, -.065, -.079]);
  bellyCollar.rotation.x = Math.PI / 2;
  for (const side of [-1, 1]) {
    const foot = new THREE.Vector3(side * .14, 0, .65);
    connectCylinder(ring, frameMaterial, .017, foot, tenderPoint(side * .067, -.175, -.038));
    addBox(shuttle, hullMaterial, [.055, .068, .042], [side * .067, -.175, -.046]);
  }
  const shuttleProfile = new THREE.Shape();
  shuttleProfile.moveTo(0, .27);
  shuttleProfile.lineTo(.085, .13);
  shuttleProfile.lineTo(.115, -.17);
  shuttleProfile.lineTo(.065, -.235);
  shuttleProfile.lineTo(-.065, -.235);
  shuttleProfile.lineTo(-.115, -.17);
  shuttleProfile.lineTo(-.085, .13);
  shuttleProfile.closePath();
  const shuttleGeometry = own(new THREE.ExtrudeGeometry(shuttleProfile, {
    depth: .08, bevelEnabled: true, bevelSize: .018, bevelThickness: .026, bevelSegments: 1, steps: 1,
  }));
  shuttleGeometry.translate(0, 0, -.04);
  shuttle.add(new THREE.Mesh(shuttleGeometry, lightHullMaterial));
  addBox(shuttle, glassMaterial, [.085, .065, .016], [0, .113, .071]);
  addBox(shuttle, frameMaterial, [.019, .066, .022], [0, .113, .077]);
  for (const side of [-1, 1]) {
    const wing = addBox(shuttle, hullMaterial, [.09, .23, .015], [side * .11, -.077, -.032]);
    wing.rotation.z = side * -.28;
    const engine = addCylinder(shuttle, frameMaterial, .029, .08, [side * .06, -.243, 0]);
    const engineBell = addCylinder(shuttle, darkMaterial, .021, .016, [side * .06, -.288, 0]);
    engine.rotation.z = 0;
    engineBell.rotation.z = 0;
  }

  // Hundreds of physical fittings share a handful of GPU draws.
  ring.updateMatrixWorld(true);
  const batches = new Map<string, THREE.Mesh[]>();
  ring.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const key = `${object.geometry.uuid}:${(object.material as THREE.Material).uuid}`;
    const batch = batches.get(key) ?? [];
    batch.push(object);
    batches.set(key, batch);
  });
  for (const meshes of batches.values()) {
    if (meshes.length < 2) continue;
    const batch = new THREE.InstancedMesh(meshes[0].geometry, meshes[0].material, meshes.length);
    batch.castShadow = true;
    batch.receiveShadow = true;
    meshes.forEach((mesh, index) => {
      batch.setMatrixAt(index, mesh.matrixWorld);
      mesh.removeFromParent();
    });
    batch.instanceMatrix.needsUpdate = true;
    batch.computeBoundingSphere();
    ring.add(batch);
    own(batch);
  }

  // Per-instance HDR colors let all twelve independently lit strips share one
  // draw. Ring-local matrices follow the same rotation as the retained anchors.
  const indicatorMaterial = own(new THREE.MeshBasicMaterial({color: 0xffffff}));
  const indicatorBatch = own(new THREE.InstancedMesh(boxGeometry, indicatorMaterial, bayIndicators.length));
  const indicatorMatrix = new THREE.Matrix4();
  const ringInverse = new THREE.Matrix4().copy(ring.matrixWorld).invert();
  const indicatorColor = new THREE.Color();
  bayIndicators.forEach((indicator, index) => {
    indicatorMatrix.multiplyMatrices(ringInverse, indicator.matrixWorld);
    indicatorBatch.setMatrixAt(index, indicatorMatrix);
    indicatorColor.setHex(index % 2 === 0 ? AMBER : 0x77848b).multiplyScalar(index === 0 ? 2.2 : .18);
    indicatorBatch.setColorAt(index, indicatorColor);
  });
  indicatorBatch.instanceMatrix.needsUpdate = true;
  if (indicatorBatch.instanceColor) indicatorBatch.instanceColor.needsUpdate = true;
  indicatorBatch.computeBoundingSphere();
  ring.add(indicatorBatch);

  // Thin faceted edges follow the pressure shell without filling its panels.
  // Only hovered bays draw them; shared geometry is created once after batching.
  const rimProfile = new THREE.Shape();
  rimProfile.moveTo(-.32, -.35);
  rimProfile.lineTo(.32, -.35); rimProfile.lineTo(.4, -.27);
  rimProfile.lineTo(.4, .27); rimProfile.lineTo(.31, .36);
  rimProfile.lineTo(-.31, .36); rimProfile.lineTo(-.4, .27);
  rimProfile.lineTo(-.4, -.27); rimProfile.closePath();
  const rimHole = new THREE.Path();
  rimHole.moveTo(-.29, -.3);
  rimHole.lineTo(-.35, -.23); rimHole.lineTo(-.35, .23);
  rimHole.lineTo(-.27, .31); rimHole.lineTo(.27, .31);
  rimHole.lineTo(.35, .23); rimHole.lineTo(.35, -.23);
  rimHole.lineTo(.29, -.3); rimHole.closePath();
  rimProfile.holes.push(rimHole);
  const rimShellGeometry = own(new THREE.ExtrudeGeometry(rimProfile, { depth: .9, bevelEnabled: false, steps: 1, curveSegments: 1 }));
  rimShellGeometry.translate(0, 0, -.45);
  const rimGeometry = own(new THREE.EdgesGeometry(rimShellGeometry));
  const rimTargets = new Float32Array(bayIndicators.length);
  const previewRims = bayIndicators.map((indicator, index) => {
    const material = own(new THREE.LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0, depthWrite: false }));
    const rim = new THREE.LineSegments(rimGeometry, material);
    rim.visible = false;
    rim.renderOrder = 3;
    rim.userData.previewInstrument = MODULE_IDS[Math.floor(index / 2)];
    indicator.parent!.add(rim);
    return rim;
  });

  const packetMaterial = own(new THREE.MeshBasicMaterial({color: 0xffe6b7, transparent: true, opacity: 0, depthTest: false}));
  const packet = new THREE.Mesh(sphereGeometry, packetMaterial);
  packet.scale.setScalar(.06);
  packet.visible = false;
  packet.renderOrder = 5;
  scene.add(packet);
  const trailGeometry = own(new THREE.BufferGeometry());
  const trailPositions = new Float32Array(18 * 3);
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  const trailMaterial = own(new THREE.LineBasicMaterial({color: AMBER, transparent: true, opacity: 0, depthTest: false}));
  const trail = new THREE.Line(trailGeometry, trailMaterial);
  trail.frustumCulled = false;
  trail.renderOrder = 4;
  trail.visible = false;
  scene.add(trail);

  // Raycast volumes stay independent of render batching and match physical bays.
  const pickMaterial = own(new THREE.MeshBasicMaterial({visible: false}));
  const pickGeometry = own(new THREE.BoxGeometry(.88, .83, 1.05));
  const pickTargets: THREE.Mesh[] = [];
  for (let index = 0; index < 12; index += 1) {
    const angle = index / 12 * Math.PI * 2;
    const target = new THREE.Mesh(pickGeometry, pickMaterial);
    target.position.set(Math.cos(angle) * 2.47, Math.sin(angle) * 2.47, 0);
    target.rotation.z = angle - Math.PI / 2;
    target.userData.instrument = MODULE_IDS[Math.floor(index / 2)];
    ring.add(target);
    pickTargets.push(target);
  }
  const thrustMaterial = own(new THREE.MeshBasicMaterial({
    color: 0xc4d9ed, transparent: true, opacity: .18, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  const thrustGeometry = own(new THREE.ConeGeometry(.058, .58, 10, 1, true));
  const thrusters: THREE.Mesh[] = [];
  for (const index of [1, 5, 9]) {
    const angle = index / 12 * Math.PI * 2;
    const plume = new THREE.Mesh(thrustGeometry, thrustMaterial);
    plume.position.set(Math.cos(angle) * 2.47, Math.sin(angle) * 2.47, -.7);
    plume.rotation.x = -Math.PI / 2;
    ring.add(plume);
    thrusters.push(plume);
  }

  // At landing distance the complete station occupies only a few pixels.
  // Keep its silhouette while avoiding dozens of invisible fitting draws.
  const distantStation = new THREE.Mesh(
    own(new THREE.TorusGeometry(2.47, .16, 5, 24)),
    own(new THREE.MeshBasicMaterial({ color: 0x8b969b })),
  );
  distantStation.name = 'distant-station';
  distantStation.visible = false;
  station.add(distantStation);

  let mode = options.mode;
  let instrumentOrbit: ReturnType<typeof createInstrumentOrbit> | null = null;
  let selectedExhibit: ExhibitId | null = null;
  let exhibitView = false;
  let exhibitStage: 0 | 1 | 2 | null = null;
  const getInstrumentOrbit = () => {
    if (!instrumentOrbit) {
      instrumentOrbit = own(createInstrumentOrbit({ softwareGraphics }));
      instrumentOrbit.setSelected(selectedExhibit);
      instrumentOrbit.setExploring(exhibitView);
      instrumentOrbit.setStage(exhibitStage);
      scene.add(instrumentOrbit.group);
    }
    return instrumentOrbit;
  };
  let disposed = false;
  let paused = false;
  let contextLost = false;
  let renderFailed = false;
  let frame = 0;
  let previousTime = 0;
  let lastShadowTime = -Infinity;
  // A settled handoff restores its world clock without starting another flight.
  const arrivalPose = mode === 'station' && !reducedMotion ? options.arrivalPose : undefined;
  let elapsed = arrivalPose?.elapsed ?? 0;
  let flowTime = arrivalPose?.flowTime ?? elapsed * 1.35;
  let ready = false;
  let hasPresented = false;
  let selected = 0;
  let selectionInitialized = false;
  let hovered: string | null = null;
  let previewed: string | null = null;
  let transferTime = -1;
  let width = 1;
  let height = 1;
  const arrivalDuration = ARRIVAL_DURATION_MS / 1000;
  let arrivalTime = reducedMotion || !options.arrival ? arrivalDuration : 0;
  let flightInterrupted = false;
  let arrivalStart: number | null = null;
  let launchStart: number | null = null;
  let launchFrom = 0;
  let launchProgress = 0;
  let launchOrbit = { yaw: 0, pitch: 0, zoom: 0 };
  let launchResolve: (() => void) | null = null;
  let launchTimer: number | null = null;
  let launchPromise: Promise<void> | null = null;
  let launchDone = false;
  let sceneBlend = mode === 'station' ? 1 : 0;
  let exploration = 0;
  let progress = 0;
  const arriving = mode === 'station' && options.arrival && !reducedMotion;
  let arrivalCompletionPending = Boolean(arriving);
  let yaw = arrivalPose?.yaw ?? 0, yawGoal = 0;
  let pitch = arrivalPose?.pitch ?? 0, pitchGoal = 0;
  let zoom = arrivalPose?.zoom ?? 0, zoomGoal = 0;
  // Retain the launch handoff phase, but never retime spin to present a bay.
  const ringFocus = arrivalPose?.ringFocus ?? 0;
  let panel = 0, panelGoal = 0;
  let workspaceOpen = false;
  let pointerMoved = false;
  const pointerAim = new PointerAim({ reducedMotion });
  const finePointer = window.matchMedia?.('(hover: hover) and (pointer: fine)');
  const orbitPivot = new THREE.Vector3();
  const orbitOffset = new THREE.Vector3();
  const viewTarget = new THREE.Vector3();
  const cameraGoal = new THREE.Vector3();
  const moduleCamera = new ModuleCameraRig(station, pickTargets.filter((_, index) => index % 2 === 0), 2.47, hole.position);
  const canAim = () => Boolean(options.interactive && finePointer?.matches && !workspaceOpen && !moduleCamera.focused
    && launchStart === null && !launchDone && (!arriving || flightInterrupted || arrivalTime >= arrivalDuration));
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const packetStart = new THREE.Vector3();
  const packetEnd = new THREE.Vector3();
  const packetControl = new THREE.Vector3();
  const diskView = new THREE.Vector3();
  const diskAxis = new THREE.Vector3();
  const diskCenterScreen = new THREE.Vector3();
  const diskCenterCamera = new THREE.Vector3();
  const holeProjection: HoleProjection = { x: 0, y: 0, radius: 0, visible: false };
  const exhibitStageCenter = new THREE.Vector3();
  const diskAxisScreen = new THREE.Vector3();
  const keyDirection = new THREE.Vector3();
  const packetCurve = new THREE.QuadraticBezierCurve3(packetStart, packetControl, packetEnd);
  const compositor = own(createSceneCompositor(renderer, background, softwareGraphics, stars.scene));
  stars.setOcclusion(compositor.backgroundTexture);
  const smooth = (value: number) => value * value * (3 - 2 * value);
  const damp = (value: number, target: number, delta: number, speed = 7) =>
    reducedMotion ? target : THREE.MathUtils.lerp(value, target, 1 - Math.exp(-speed * delta));
  const shortest = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
  const completeArrival = () => {
    if (!arrivalCompletionPending) return;
    arrivalCompletionPending = false;
    container.dataset.flightPhase = 'interactive';
    options.onArrivalComplete?.();
  };
  const interruptArrival = () => {
    flightInterrupted = true;
    if (arrivalStart !== null) arrivalStart = Math.min(arrivalStart, performance.now());
    completeArrival();
  };

  const updatePreviewRims = (delta: number) => {
    previewRims.forEach((rim, index) => {
      const target = rimTargets[index];
      const current = rim.material.opacity;
      const next = reducedMotion ? target : THREE.MathUtils.lerp(current, target, 1 - Math.exp(-(target > current ? 14 : 10) * delta));
      rim.material.opacity = next < .002 ? 0 : next;
      rim.visible = rim.material.opacity > 0;
    });
  };
  const illuminate = () => {
    bayIndicators.forEach((_, bayIndex) => {
      const id = MODULE_IDS[Math.floor(bayIndex / 2)];
      const active = Math.floor(bayIndex / 2) === selected;
      const highlight = id === hovered || id === previewed;
      rimTargets[bayIndex] = highlight ? .95 : 0;
      const intensity = highlight ? 4.2 : active ? 2.6 : .1;
      indicatorColor.setHex(active || highlight ? AMBER : 0x69777c).multiplyScalar(intensity);
      indicatorBatch.setColorAt(bayIndex, indicatorColor);
    });
    if (indicatorBatch.instanceColor) indicatorBatch.instanceColor.needsUpdate = true;
    if (reducedMotion) updatePreviewRims(0);
  };

  const positionWorld = (delta = 0) => {
    updatePreviewRims(delta);
    pointerAim.setEnabled(canAim());
    const aim = pointerAim.step(delta);
    const aspect = width / height;
    const small = aspect < .95;
    // Framing is based on a fixed reference lens, independent of user orbit.
    const viewHeight = 2 * Math.tan(THREE.MathUtils.degToRad(44 / 2)) * 19;
    const viewWidth = viewHeight * aspect;
    const journey = mode === 'landing' && (launchStart !== null || launchDone)
      ? sampleLaunchFlight(launchProgress, launchFrom, small) : null;
    const blend = journey?.blend ?? smooth(THREE.MathUtils.clamp(sceneBlend, 0, 1));
    const escape = journey?.escape ?? (mode === 'station' ? smooth(Math.min(1, arrivalTime / arrivalDuration)) : 0);
    applyStationFlightPose(station, ring, {
      viewWidth, viewHeight, blend, escape, small, elapsed, reducedMotion, ringPhase: ringFocus,
    });
    keyDirection.copy(hole.position).sub(station.position).normalize();
    accretionLight.position.copy(station.position).addScaledVector(keyDirection, 32);
    accretionLight.target.position.copy(station.position);
    thrustMaterial.opacity = blend * (.09 + (1 - escape) * .32);
    thrusters.forEach((thruster, index) => {
      thruster.scale.y = .45 + (1 - escape) * 1.7 + (reducedMotion ? 0 : Math.sin(elapsed * 14 + index) * .08);
    });

    // The ship and Gargantua keep their world scale. A travelling camera changes
    // the view from distant space to the illuminated disk and then the hull.
    const travelling = mode === 'landing' || (arriving && !flightInterrupted && escape < 1);
    const baseDistance = journey?.distance ?? (mode === 'landing'
      ? THREE.MathUtils.lerp(1400, 190, blend)
      : travelling ? arrivalCameraDistance(escape, small) : 19 * freeOrbitFraming(small));
    const flightYaw = journey?.yaw ?? (mode === 'landing' ? THREE.MathUtils.lerp(small ? .6 : 1.15, -.1, blend)
      : travelling ? THREE.MathUtils.lerp(-.1, 0, escape) : 0);
    const flightPitch = journey?.pitch ?? (mode === 'landing' ? .13
      : travelling ? THREE.MathUtils.lerp(.13, .16, escape) : .16);
    orbitPivot.copy(station.position);
    const distance = baseDistance * Math.exp(zoom);
    orbitOffset.setFromSphericalCoords(distance, Math.PI / 2 - pitch - flightPitch - aim.pitch, yaw + flightYaw + aim.yaw);
    cameraGoal.copy(orbitPivot).add(orbitOffset);
    viewTarget.copy(orbitPivot);
    if (mode === 'landing' && small) {
      viewTarget.x += journey?.targetShiftX ?? 100 * (1 - blend);
      viewTarget.y += journey?.targetLift ?? 0;
    }
    scene.updateMatrixWorld(true);
    if (mode === 'station') {
      moduleCamera.update(camera, {
        freePosition: cameraGoal, freeTarget: viewTarget, panel, small,
        delta, snap: reducedMotion, direct: pointerMoved,
      });
    } else {
      // Landing/launch composition remains owned by its existing flight path.
      camera.position.copy(cameraGoal);
      camera.lookAt(viewTarget);
    }
    camera.rotateZ(.07 + (1 - escape) * blend * -.035);
    camera.updateMatrixWorld(true);
    const stationPixels = 2.47 * height * camera.projectionMatrix.elements[5] / camera.position.distanceTo(station.position);
    ring.visible = mode === 'station' || stationPixels >= 10;
    distantStation.visible = !ring.visible;
    hole.quaternion.copy(camera.quaternion);
    const exhibits = mode === 'landing' && options.showExhibits !== false ? getInstrumentOrbit() : instrumentOrbit;
    if (exhibits) {
      exhibits.group.position.copy(hole.position);
      exhibits.group.quaternion.copy(hole.quaternion);
      // Keep the selected mechanism inside the actual available screen band,
      // even when a narrow page becomes taller than the viewport and scrolls.
      const holeDepth = -diskCenterCamera.copy(hole.position).applyMatrix4(camera.matrixWorldInverse).z;
      const stageDepth = Math.max(100, holeDepth - 220);
      const stageY = small ? Math.min(235, window.innerHeight * .29) : height * .46;
      exhibitStageCenter.set(
        (small ? 0 : .4) * stageDepth / camera.projectionMatrix.elements[0],
        (1 - stageY / height * 2) * stageDepth / camera.projectionMatrix.elements[5],
        -stageDepth,
      ).applyMatrix4(camera.matrixWorld);
      exhibits.group.updateMatrixWorld(true);
      exhibits.group.worldToLocal(exhibitStageCenter);
      const stagePixels = small ? Math.min(172, width * .5) : Math.min(370, height * .42);
      const stageSpan = stagePixels * stageDepth * 2 / (height * camera.projectionMatrix.elements[5]);
      exhibits.update({ elapsed, delta, landing: mode === 'landing', launchProgress: launchStart !== null || launchDone ? launchProgress : 0, reducedMotion, aspect, stage: { center: exhibitStageCenter, span: stageSpan } });
    }
    diskView.copy(camera.position).sub(hole.position);
    diskAxis.set(diskView.z, 0, -diskView.x).normalize();
    diskCenterScreen.copy(hole.position).project(camera);
    diskCenterCamera.copy(hole.position).applyMatrix4(camera.matrixWorldInverse);
    diskAxisScreen.copy(hole.position).addScaledVector(diskAxis, 100).project(camera);
    holeMaterial.uniforms.uDiskRoll.value = -Math.atan2((diskAxisScreen.y - diskCenterScreen.y) * height, (diskAxisScreen.x - diskCenterScreen.x) * width);
    holeMaterial.uniforms.uDiskSide.value = diskView.y < 0 ? -1 : 1;
    holeMaterial.uniforms.uInclination.value = THREE.MathUtils.clamp(Math.abs(Math.atan2(diskView.y, Math.hypot(diskView.x, diskView.z))), .008, 1.5);
    // Retain one physical flow clock across the lensed disk and nearby gas.
    // This does not retime the camera, station rotation, or connecting flight.
    holeMaterial.uniforms.uTime.value = flowTime;
    foregroundMaterial.uniforms.uTime.value = flowTime;
    foregroundMaterial.uniforms.uOpacity.value = mode === 'landing' ? smooth(blend) : 1;
    accretionPlane.visible = foregroundMaterial.uniforms.uOpacity.value > 0;
    foregroundMaterial.uniforms.uHoleScreen.value.set(diskCenterScreen.x, diskCenterScreen.y);
    foregroundMaterial.uniforms.uHoleRadius.value = diskCenterCamera.z < 0 ? 230 * camera.projectionMatrix.elements[5] / -diskCenterCamera.z : 0;
    foregroundMaterial.uniforms.uHoleDepth.value = -diskCenterCamera.z;
    foregroundMaterial.uniforms.uAspect.value = aspect;
    if (options.onHoleProjection) {
      holeProjection.x = (diskCenterScreen.x + 1) * .5;
      holeProjection.y = (1 - diskCenterScreen.y) * .5;
      holeProjection.radius = foregroundMaterial.uniforms.uHoleRadius.value * .5;
      holeProjection.visible = diskCenterCamera.z < 0
        && diskCenterScreen.z >= -1 && diskCenterScreen.z <= 1
        && holeProjection.x + holeProjection.radius / aspect > 0
        && holeProjection.x - holeProjection.radius / aspect < 1
        && holeProjection.y + holeProjection.radius > 0
        && holeProjection.y - holeProjection.radius < 1;
      options.onHoleProjection(holeProjection);
    }
    packetEnd.set(hole.position.x, hole.position.y, hole.position.z + 1);
  };

  const render = () => {
    if (disposed || contextLost || renderFailed) return;
    try {
      if (elapsed - lastShadowTime >= .16 || lastShadowTime === -Infinity) {
        renderer.shadowMap.needsUpdate = true;
        lastShadowTime = elapsed;
      }
      // Prepare the shared transparent-rim shader behind the initial cover.
      // Its zero-opacity first draw avoids a compile hitch on the first hover.
      const warmRim = previewRims[0];
      const rimWasVisible = warmRim.visible;
      const ringWasVisible = ring.visible;
      const gasWasVisible = accretionPlane.visible;
      // At landing distance the nearby gas has zero opacity. Compile its
      // material now, before its first nonzero contribution during departure.
      if (!ready) { warmRim.visible = true; ring.visible = true; accretionPlane.visible = true; }
      try {
        compositor.render(scene, camera);
        if (!ready && renderer.shadowMap.enabled) {
          // Warm depth variants with the full hull visible as well. LOD must
          // never postpone this shader work until the approaching flight.
          renderer.shadowMap.needsUpdate = true;
          compositor.render(scene, camera);
        }
      }
      finally { warmRim.visible = rimWasVisible; ring.visible = ringWasVisible; accretionPlane.visible = gasWasVisible; }
      if (!ready) {
        ready = true;
        // Shader preparation must not consume the first visible escape flight.
        // Context recovery must preserve a flight that already started or ended.
        const revealDelay = !hasPresented && (arriving || arrivalPose) ? options.arrivalRevealMs ?? 0 : 0;
        arrivalStart = performance.now() - arrivalTime * 1000 + revealDelay;
        hasPresented = true;
        options.onReady?.();
      }
    } catch (error) {
      renderFailed = true;
      stop();
      finishLaunch();
      options.onError?.(error);
    }
  };

  function finishLaunch() {
    if (!launchResolve) return;
    launchDone = true;
    launchProgress = 1;
    sceneBlend = 1;
    yaw = pitch = zoom = 0;
    stop();
    launchStart = null;
    if (launchTimer !== null) window.clearTimeout(launchTimer);
    launchTimer = null;
    const resolve = launchResolve;
    launchResolve = null;
    if (!disposed && !renderFailed && !contextLost && !document.hidden) {
      positionWorld();
      render();
      try {
        let data: string | undefined;
        try { data = renderer.domElement.toDataURL('image/webp', .9); } catch { /* Pose still connects the flight. */ }
        writeFlightHandoff(sessionStorage, {elapsed, flowTime, ringFocus: shortest(ringFocus), yaw: shortest(yaw), pitch, zoom}, data, Date.now(), { settled: true, softwareGraphics });
      } catch { /* A frame handoff is optional; navigation must always continue. */ }
    }
    container.dataset.flightPhase = 'handoff';
    resolve();
  }

  const update = (delta: number, now: number) => {
    if (arrivalStart === null) arrivalStart = now - arrivalTime * 1000;
    const advance = reducedMotion || now < arrivalStart ? 0 : Math.min(delta, (now - arrivalStart) / 1000);
    elapsed += advance;
    // Integrate a separate clock: 25% faster in the app, continuous on arrival.
    flowTime += advance * 1.35 * (mode === 'station' ? 1.25 : 1);
    // Manual input ends camera travel, while the remaining roll and engine fade
    // continue on their existing clock without an abrupt visual reset.
    arrivalTime = reducedMotion || !arriving ? arrivalDuration : Math.min(arrivalDuration, Math.max(0, (now - arrivalStart) / 1000));
    if (arrivalTime >= arrivalDuration) completeArrival();
    if (launchStart !== null) {
      launchProgress = Math.min(1, (now - launchStart) / LAUNCH_DURATION_MS);
      if (launchProgress >= 1) { finishLaunch(); return; }
    } else if (!launchDone) {
      sceneBlend = damp(sceneBlend, mode === 'station' ? 1 : Math.max(exploration, progress * .22), delta, 3.2);
    }
    if (launchStart !== null) {
      const remaining = 1 - smooth(launchProgress);
      yaw = launchOrbit.yaw * remaining;
      pitch = launchOrbit.pitch * remaining;
      zoom = launchOrbit.zoom * remaining;
    } else {
      yaw = damp(yaw, yawGoal, delta, pointerMoved ? 12 : 4.5);
      pitch = damp(pitch, pitchGoal, delta, pointerMoved ? 12 : 4.5);
      zoom = damp(zoom, zoomGoal, delta, 9);
    }
    panel = damp(panel, panelGoal, delta, 4);
    positionWorld(delta);
    if (transferTime >= 0) {
      transferTime += delta;
      const amount = Math.min(1, transferTime / 2.8);
      const eased = Math.pow(amount, 2.2);
      packetCurve.getPoint(eased, packet.position);
      // An emissive speck stays legible while receding across the much larger
      // world, then disappears at the horizon instead of vanishing at launch.
      packet.scale.setScalar(.065 * Math.max(1, packet.position.distanceTo(camera.position) / 19) * (1 - amount * .8));
      const opacity = Math.min(1, amount * 8) * (1 - Math.pow(amount, 5));
      packetMaterial.opacity = opacity;
      trailMaterial.opacity = opacity * .6;
      for (let index = 0; index < 18; index += 1) {
        const point = packetCurve.getPoint(Math.max(0, eased - index * .007));
        trailPositions[index * 3] = point.x;
        trailPositions[index * 3 + 1] = point.y;
        trailPositions[index * 3 + 2] = point.z;
      }
      trailGeometry.attributes.position.needsUpdate = true;
      if (amount >= 1) { transferTime = -1; packet.visible = false; trail.visible = false; }
    }
  };

  function stop() {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
    if (hasPresented) arrivalStart = null;
  }
  const tick = (time: number) => {
    frame = 0;
    if (disposed || paused || contextLost || renderFailed || document.hidden || launchDone) return;
    const seconds = previousTime ? (time - previousTime) / 1000 : 0;
    previousTime = time;
    // Motion follows elapsed time, even when a device drops a frame.
    update(Math.min(seconds, .25), time);
    render();
    if (!disposed && !paused && !contextLost && !renderFailed && !reducedMotion && !launchDone) frame = window.requestAnimationFrame(tick);
  };
  const resume = () => {
    if (disposed || paused || contextLost || renderFailed || document.hidden) return;
    if (reducedMotion) { update(0, performance.now()); render(); }
    else if (!frame) frame = window.requestAnimationFrame(tick);
  };
  const resize = () => {
    if (disposed) return;
    const bounds = container.getBoundingClientRect();
    width = Math.max(1, bounds.width); height = Math.max(1, bounds.height);
    renderer.setSize(width, height, false);
    compositor.resize();
    stars.resize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    positionWorld();
    if (reducedMotion || paused) render();
  };

  const selectInstrument = (id: string) => {
    const index = MODULE_IDS.indexOf(id);
    if (disposed || index < 0) return;
    const changed = selectionInitialized && (index !== selected || !moduleCamera.focused);
    selected = index;
    selectionInitialized = true;
    if (changed) {
      pointerAim.clear(true);
      pointerMoved = false;
      interruptArrival();
      moduleCamera.select(index);
    }
    illuminate();
    resume();
  };
  const pickAt = (clientX: number, clientY: number) => {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set((clientX - bounds.left) / bounds.width * 2 - 1, -(clientY - bounds.top) / bounds.height * 2 + 1);
    scene.updateMatrixWorld(true);
    raycaster.setFromCamera(pointer, camera);
    const exhibit = mode === 'landing' ? instrumentOrbit?.pick(raycaster) : null;
    if (exhibit) return { exhibit };
    const instrument = raycaster.intersectObjects(pickTargets, false)[0]?.object.userData.instrument as string | undefined;
    return instrument ? { instrument } : null;
  };
  const inheritFreeOrbit = () => {
    if (!moduleCamera.focused && (!arriving || flightInterrupted || arrivalTime >= arrivalDuration)) return;
    interruptArrival();
    // Start manual control exactly where the eye is now, not at stale pre-focus
    // yaw/zoom values. The look target then eases back toward the orbital center.
    orbitOffset.copy(camera.position).sub(orbitPivot);
    const radius = Math.max(.001, orbitOffset.length());
    yaw = yawGoal = Math.atan2(orbitOffset.x, orbitOffset.z);
    pitch = pitchGoal = Math.asin(THREE.MathUtils.clamp(orbitOffset.y / radius, -1, 1)) - .16;
    const framing = freeOrbitFraming(width / height < .95, panel);
    zoom = zoomGoal = Math.log(radius / framing / 19);
    moduleCamera.clear();
  };
  const releaseInput = options.interactive ? bindOrbitInput(renderer.domElement, {
    wheelZoom: mode === 'station',
    dragSensitivity: ORBIT_DRAG_SENSITIVITY,
    get horizontalDragSensitivity() { return mode === 'station' ? .25 : 1; },
    canInteract: () => !disposed && !contextLost && !renderFailed && launchStart === null && !launchDone,
    onOrbit: (horizontal, vertical) => {
      pointerAim.clear();
      inheritFreeOrbit();
      pointerMoved = true;
      yawGoal += horizontal;
      pitchGoal = THREE.MathUtils.clamp(pitchGoal + vertical, -1.13, 1.13);
      resume();
    },
    onZoom: (amount) => {
      pointerAim.clear();
      inheritFreeOrbit();
      pointerMoved = true;
      zoomGoal = zoomFreeOrbit(zoomGoal, amount, freeOrbitFraming(width / height < .95, panel));
      resume();
    },
    onPick: (x, y) => {
      const hit = pickAt(x, y);
      if (hit?.exhibit) { options.onExhibitSelect?.(hit.exhibit); return; }
      const id = hit?.instrument;
      if (!id) return;
      selectInstrument(id);
      options.onSelect?.(id);
    },
    onHover: (x, y) => {
      const hit = x === null || y === null ? null : pickAt(x, y);
      const id = hit?.instrument ?? null;
      const exhibitHoverChanged = instrumentOrbit?.setHovered(hit?.exhibit ?? null);
      if (reducedMotion && instrumentOrbit && exhibitHoverChanged) {
        positionWorld();
        render();
      }
      renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
      if (id === hovered) return;
      hovered = id; illuminate();
      if (reducedMotion) render();
    },
    onAim: (x, y) => {
      pointerAim.setEnabled(canAim());
      if (x === null || y === null) pointerAim.clear();
      else pointerAim.setPointer(x, y);
    },
    onReset: () => {
      pointerAim.clear(true);
      pointerMoved = false; interruptArrival(); moduleCamera.clear(); yawGoal = yaw + shortest(-yaw); pitchGoal = 0; zoomGoal = 0;
      resume();
    },
  }) : () => {};

  const visibility = () => {
    if (document.hidden) { stop(); finishLaunch(); }
    else resume();
  };
  const lost = (event: Event) => {
    event.preventDefault(); contextLost = true; stop(); finishLaunch();
    options.onError?.(new Error('The orbital scene lost its graphics context.'));
  };
  const restored = () => {
    if (disposed) return;
    arrivalStart = null;
    contextLost = false; ready = false; lastShadowTime = -Infinity; resize(); resume();
  };
  renderer.domElement.addEventListener('webglcontextlost', lost);
  renderer.domElement.addEventListener('webglcontextrestored', restored);
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('resize', resize, {passive: true});
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  observer?.observe(container);
  container.dataset.flightPhase = arriving ? 'arriving' : mode === 'landing' ? 'landing' : 'interactive';
  resize(); render(); resume();

  return {
    dispose() {
      if (disposed) return;
      disposed = true; stop(); finishLaunch(); releaseInput(); observer?.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', visibility);
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      renderer.domElement.removeEventListener('webglcontextrestored', restored);
      scene.clear(); background.clear();
      for (const resource of resources) resource.dispose();
      renderer.renderLists.dispose(); renderer.dispose(); renderer.forceContextLoss();
      renderer.domElement.remove();
    },
    setMode(nextMode) {
      if (disposed) return;
      finishLaunch(); launchPromise = null; launchDone = false; launchStart = null; launchProgress = 0;
      mode = nextMode; arrivalStart = null; arrivalTime = reducedMotion || !options.arrival ? arrivalDuration : 0; flightInterrupted = false;
      container.dataset.flightPhase = nextMode === 'landing' ? 'landing' : 'interactive';
      sceneBlend = nextMode === 'station' ? 1 : 0; exploration = 0; progress = 0;
      pointerAim.clear(true);
      yawGoal = yaw + shortest(-yaw); pitchGoal = 0; zoomGoal = 0; moduleCamera.clear();
      resume();
    },
    setSelected: selectInstrument,
    setExhibit(id) {
      if (disposed) return;
      selectedExhibit = id;
      instrumentOrbit?.setSelected(id);
      if (reducedMotion) { positionWorld(); render(); }
      else resume();
    },
    setExhibitView(active) {
      if (disposed) return;
      exhibitView = active;
      instrumentOrbit?.setExploring(active);
      // A repeat navigation also brings a manually orbited exhibit back into
      // its readable stage; it never alters the spacecraft or flight clock.
      pointerAim.clear(true);
      pointerMoved = false;
      yawGoal = yaw + shortest(-yaw); pitchGoal = 0; zoomGoal = 0;
      resume();
    },
    setExhibitStage(stage) {
      if (disposed) return;
      exhibitStage = stage;
      instrumentOrbit?.setStage(stage);
      if (reducedMotion) { positionWorld(); render(); }
      else resume();
    },
    previewInstrument(id) {
      if (disposed) return;
      previewed = id !== null && MODULE_IDS.includes(id) ? id : null;
      illuminate();
      if (reducedMotion) render();
    },
    emitTransfer() {
      if (disposed || reducedMotion) return;
      scene.updateMatrixWorld(true);
      bayIndicators[selected * 2].getWorldPosition(packetStart);
      packetControl.copy(packetStart).lerp(packetEnd, .5);
      packetControl.y += 2.8;
      transferTime = 0; packet.visible = true; trail.visible = true;
      packetMaterial.opacity = 0; trailMaterial.opacity = 0; resume();
    },
    setPaused(nextPaused) {
      if (disposed) return;
      paused = nextPaused;
      if (paused) stop(); else resume();
    },
    refreshLayout: resize,
    launch() {
      if (disposed || reducedMotion || renderFailed || contextLost) return Promise.resolve();
      if (launchPromise) return launchPromise;
      pointerMoved = false; interruptArrival(); moduleCamera.clear(); yawGoal = yaw + shortest(-yaw); pitchGoal = 0; zoomGoal = 0;
      const aim = pointerAim.step(0);
      launchFrom = sceneBlend; launchProgress = 0; launchOrbit = { yaw: shortest(yaw + aim.yaw), pitch: pitch + aim.pitch, zoom };
      pointerAim.clear(true);
      launchStart = performance.now(); paused = false;
      container.dataset.flightPhase = 'launching';
      launchPromise = new Promise<void>((resolve) => { launchResolve = resolve; });
      // Navigation is never held hostage by a throttled/hidden GPU frame loop.
      launchTimer = window.setTimeout(finishLaunch, LAUNCH_DURATION_MS + 250);
      resume();
      return launchPromise;
    },
    explore() {
      if (disposed) return;
      pointerAim.clear(true);
      interruptArrival();
      exploration = .3; pointerMoved = false; yawGoal = yaw + shortest(-.18 - yaw); pitchGoal = .055;
      moduleCamera.clear(); zoomGoal = 0; resume();
    },
    setProgress(amount) {
      if (disposed) return;
      progress = THREE.MathUtils.clamp(amount, 0, 1);
      if (progress < .02) exploration = 0;
      resume();
    },
    setPanelOpen(open, { focus = true } = {}) {
      if (disposed) return;
      workspaceOpen = open;
      if (open) pointerAim.clear(true);
      if (open && focus && mode === 'station') { pointerMoved = false; interruptArrival(); moduleCamera.select(selected); }
      panelGoal = open && options.framePanel !== false ? 1 : 0; resume();
    },
  };
}
