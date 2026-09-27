// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Three from 'three';
const flowGraphics = vi.hoisted(() => ({ samples: [] as number[][] }));
const graphics = vi.hoisted(() => ({ model: null as Three.Object3D | null, gpuName: '', rendererOptions: [] as Array<{ antialias?: boolean }>, disposed: 0, contextsLost: 0, frames: [] as Array<{ eye: number[]; rotation: number[]; ship: number[]; ring: number[]; exhibits: Array<{ id: string; visible: boolean; screen: number[] }>; previews: Array<{ id: string; visible: boolean; opacity: number; matrix: number[] }>; anchors: Array<{ id: string; matrix: number[] }> }> }));
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof Three>();
  return { ...actual, WebGLRenderer: class {
    constructor(options: { antialias?: boolean }) { graphics.rendererOptions.push(options); }
    domElement = document.createElement('canvas');
    debug = {}; shadowMap = {}; renderLists = { dispose() {} }; width = 1440; height = 900;
    getContext() { return { getExtension: () => graphics.gpuName ? { UNMASKED_RENDERER_WEBGL: 37446 } : null, getParameter: () => graphics.gpuName }; }
    setPixelRatio() {} setClearColor() {} setRenderTarget() {} render() {}
    dispose() { graphics.disposed += 1; } forceContextLoss() { graphics.contextsLost += 1; }
    setSize(width: number, height: number) { this.width = width; this.height = height; }
    getDrawingBufferSize(target: Three.Vector2) { return target.set(this.width, this.height); }
  } };
});
vi.mock('../../shared/black-hole', async importOriginal => {
  const actual = await importOriginal<typeof import('../../shared/black-hole')>();
  const three = await import('three');
  return { ...actual, createLensTexture: () => new three.DataTexture(), createAccretionTexture: () => new three.DataTexture() };
});
vi.mock('../../shared/scene-compositor', () => ({ createSceneCompositor: (_renderer: unknown, background: Three.Scene) => ({
  resize() {}, dispose() {}, render(scene: Three.Scene, camera: Three.PerspectiveCamera) {
    const clocks: number[] = [];
    background.traverse(object => {
      const material = (object as Three.Mesh).material as Three.ShaderMaterial | undefined;
      if (material?.uniforms?.uTime) clocks.push(material.uniforms.uTime.value);
    });
    flowGraphics.samples.push(clocks);
    scene.updateMatrixWorld(true);
    const ship = scene.children.find(child => child.type === 'Group')!;
    const ring = ship.children.find(child => child.type === 'Group')!;
    graphics.model = ring;
    const previews: ReturnType<typeof graphics.frames.slice>[number]['previews'] = [];
    const anchors: ReturnType<typeof graphics.frames.slice>[number]['anchors'] = [];
    const exhibits: ReturnType<typeof graphics.frames.slice>[number]['exhibits'] = [];
    scene.traverse(object => {
      if (object.type === 'Group' && object.userData.exhibit) exhibits.push({ id: object.userData.exhibit, visible: object.visible && !!object.parent?.visible, screen: object.getWorldPosition(camera.position.clone()).project(camera).toArray() });
      if (object.userData.previewInstrument) previews.push({ id: object.userData.previewInstrument, visible: object.visible, opacity: ((object as Three.LineSegments).material as Three.Material).opacity, matrix: [...object.matrixWorld.elements] });
      if (object.userData.instrument) anchors.push({ id: object.userData.instrument, matrix: [...object.matrixWorld.elements] });
    });
    graphics.frames.push({ eye: camera.position.toArray(), rotation: camera.quaternion.toArray(), ship: [...ship.matrixWorld.elements], ring: [...ring.matrixWorld.elements], previews, anchors, exhibits });
  },
}) }));
import { createOrbitalScene } from '../../shared/space-scene';
import type { HoleProjection } from '../../shared/space-scene';
import * as THREE from 'three';
import { ARRIVAL_DURATION_MS, ARRIVAL_REVEAL_MS, LAUNCH_DURATION_MS, readFlightHandoff } from '../../shared/flight-handoff';

let callbacks: Map<number, FrameRequestCallback>;
let nextId: number;
const scenes: ReturnType<typeof createOrbitalScene>[] = [];
beforeEach(() => {
  flowGraphics.samples.length = 0;
  vi.useFakeTimers(); callbacks = new Map(); nextId = 0; graphics.frames.length = 0; sessionStorage.clear();
  graphics.gpuName = ''; graphics.rendererOptions.length = 0; graphics.disposed = 0; graphics.contextsLost = 0;
  graphics.model = null;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { const id = ++nextId; callbacks.set(id, callback); return id; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/webp;base64,UklGRg==');
});
afterEach(() => { scenes.splice(0).forEach(scene => scene.dispose()); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const create = (options: Parameters<typeof createOrbitalScene>[1], viewport = { width: 1440, height: 900 }) => {
  const host = document.createElement('div');
  host.getBoundingClientRect = () => viewport as DOMRect;
  const scene = createOrbitalScene(host, { reducedMotion: false, ...options }); scenes.push(scene);
  return { scene, host };
};
const step = (milliseconds: number) => {
  vi.advanceTimersByTime(milliseconds);
  const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(callback => callback(performance.now()));
};
const latest = () => graphics.frames.at(-1)!;
const expectSamePose = (actual: ReturnType<typeof latest>, expected: ReturnType<typeof latest>) => {
  for (const field of ['eye', 'rotation', 'ship', 'ring'] as const) {
    actual[field].forEach((value, index) => expect(value).toBeCloseTo(expected[field][index], 10));
  }
};

describe('visible connecting flight', () => {
  it('advances both app gas layers 25 percent faster while leaving the landing rate unchanged', () => {
    const landing = create({ mode: 'landing' });
    step(16); step(100);
    const landingClock = flowGraphics.samples.at(-1)!;
    expect(landingClock).toHaveLength(2);
    expect(landingClock[0]).toBeCloseTo(.135, 8);
    expect(landingClock[1]).toBeCloseTo(landingClock[0], 10);
    landing.scene.dispose();
    create({ mode: 'station' });
    step(16); step(100);
    const appClock = flowGraphics.samples.at(-1)!;
    expect(appClock[0]).toBeCloseTo(landingClock[0] * 1.25, 8);
    expect(appClock[1]).toBeCloseTo(appClock[0], 10);
  });

  it('retains the recorded gas phase on arrival and freezes it for the reveal interval', () => {
    create({ mode: 'station', arrival: true, arrivalPose: { elapsed: 40, flowTime: 57, ringFocus: 0, yaw: 0, pitch: 0, zoom: 0 }, arrivalRevealMs: 450 });
    expect(flowGraphics.samples.at(-1)).toEqual([57, 57]);
    step(16); step(100);
    expect(flowGraphics.samples.at(-1)).toEqual([57, 57]);
    step(250); step(200);
    expect(flowGraphics.samples.at(-1)![0]).toBeGreaterThan(57);
    expect(flowGraphics.samples.at(-1)![0]).toBe(flowGraphics.samples.at(-1)![1]);
  });

  it.each([
    { mode: 'landing' as const, pointerType: 'mouse', width: 1440, height: 900, horizontal: .375 },
    { mode: 'landing' as const, pointerType: 'touch', width: 390, height: 844, horizontal: .375 },
    { mode: 'station' as const, pointerType: 'mouse', width: 1440, height: 900, horizontal: .09375 },
    { mode: 'station' as const, pointerType: 'touch', width: 390, height: 844, horizontal: .09375 },
  ])('uses 50-percent increased $pointerType camera travel in $mode at $width px', viewport => {
    // Freeze ambient ship drift so the measured angle isolates input gain.
    // Reduced motion changes damping, not the pointer sensitivity setting.
    const { host } = create({ mode: viewport.mode, interactive: true, showExhibits: false, reducedMotion: true }, viewport);
    const canvas = host.querySelector('canvas')!;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: viewport.width, height: viewport.height } as DOMRect);
    const angles = () => {
      const frame = latest();
      const offset = new THREE.Vector3(...frame.eye).sub(new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(frame.ship)));
      return { yaw: Math.atan2(offset.x, offset.z), pitch: Math.asin(offset.y / offset.length()) };
    };
    for (let frame = 0; frame < 30; frame++) step(100);
    const before = angles();
    for (const [type, x, y] of [['pointerdown', 80, 200], ['pointermove', 280, 300], ['pointerup', 280, 300]] as const) {
      const event = new MouseEvent(type, { clientX: x, clientY: y, button: 0 });
      Object.defineProperties(event, { pointerType: { value: viewport.pointerType }, pointerId: { value: 1 } });
      canvas.dispatchEvent(event);
    }
    for (let frame = 0; frame < 30; frame++) step(100);
    const after = angles();
    expect(after.yaw - before.yaw).toBeCloseTo(200 / viewport.width * Math.PI * 2 * viewport.horizontal, 8);
    expect(after.pitch - before.pitch).toBeCloseTo(viewport.mode === 'landing' && viewport.pointerType === 'touch' ? 0 : 100 / viewport.height * Math.PI * .375, 8);
  });

  it('reports the projected hole in host coordinates without changing the scene pose', () => {
    const viewport = { width: 1440, height: 900 };
    const baseline = create({ mode: 'landing', showExhibits: false, reducedMotion: true }, viewport);
    const expectedPose = latest();
    baseline.scene.dispose();
    const projections: Array<Readonly<HoleProjection>> = [];
    const { scene } = create({
      mode: 'landing', showExhibits: false, reducedMotion: true,
      onHoleProjection: value => projections.push(value),
    }, viewport);
    expectSamePose(latest(), expectedPose);
    const first = { ...projections.at(-1)! };
    const verifyProjection = () => {
      const projection = projections.at(-1)!;
      const camera = new THREE.PerspectiveCamera(44, viewport.width / viewport.height, .1, 4000);
      camera.position.fromArray(latest().eye);
      camera.quaternion.fromArray(latest().rotation);
      camera.updateMatrixWorld(true);
      const center = new THREE.Vector3(-240, -10, -600);
      const worldRadius = new THREE.Vector3(0, 230, 0).applyQuaternion(camera.quaternion).add(center);
      const screen = center.project(camera);
      const rim = worldRadius.project(camera);
      expect(projection.x * viewport.width).toBeCloseTo((screen.x + 1) * viewport.width / 2, 7);
      expect(projection.y * viewport.height).toBeCloseTo((1 - screen.y) * viewport.height / 2, 7);
      expect(projection.radius * viewport.height).toBeCloseTo((rim.y - screen.y) * viewport.height / 2, 7);
      expect([projection.x, projection.y, projection.radius].every(Number.isFinite)).toBe(true);
      expect(projection.visible).toBe(true);
    };
    verifyProjection();
    viewport.width /= 2; viewport.height /= 2;
    scene.refreshLayout();
    verifyProjection();
    expect(projections.at(-1)).toBe(projections[0]);
    expect(projections.at(-1)!.x).toBeCloseTo(first.x, 9);
    expect(projections.at(-1)!.y).toBeCloseTo(first.y, 9);
    expect(projections.at(-1)!.radius).toBeCloseTo(first.radius, 9);
  });

  it('keeps projected particle destinations attached while the user orbits', () => {
    const projections: HoleProjection[] = [];
    const { host } = create({ mode: 'landing', interactive: true, showExhibits: false, onHoleProjection: value => projections.push({ ...value }) });
    const first = projections.at(-1)!;
    const canvas = host.querySelector('canvas')!;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1440, height: 900 } as DOMRect);
    for (const [type, x] of [['pointerdown', 700], ['pointermove', 1000], ['pointerup', 1000]] as const) {
      const event = new MouseEvent(type, { clientX: x, clientY: 400, button: 0 });
      Object.defineProperties(event, { pointerType: { value: 'mouse' }, pointerId: { value: 1 } });
      canvas.dispatchEvent(event);
    }
    step(16); step(100);
    expect(projections.length).toBeGreaterThan(1);
    expect(projections.at(-1)!.x).not.toBeCloseTo(first.x, 3);
    expect(projections.at(-1)!.radius).toBeGreaterThan(0);
  });
  it('has continuous solid connections from hub to all four wheel spokes and between neighboring bay hatches', () => {
    create({ mode: 'station', reducedMotion: true });
    const solids: Array<{ geometry: Three.BufferGeometry; inverse: Three.Matrix4 }> = [];
    const modelInverse = graphics.model!.matrixWorld.clone().invert();
    graphics.model!.traverse(object => {
      if (!(object instanceof THREE.Mesh) || !(object.material as Three.Material).visible || !['BoxGeometry', 'CylinderGeometry'].includes(object.geometry.type)) return;
      const transform = new THREE.Matrix4().multiplyMatrices(modelInverse, object.matrixWorld);
      if (object instanceof THREE.InstancedMesh) {
        for (let index = 0; index < object.count; index++) {
          const matrix = new THREE.Matrix4(); object.getMatrixAt(index, matrix);
          solids.push({ geometry: object.geometry, inverse: transform.clone().multiply(matrix).invert() });
        }
      } else solids.push({ geometry: object.geometry, inverse: transform.invert() });
    });
    const solidAt = (point: Three.Vector3) => solids.some(({ geometry, inverse }) => {
      const local = point.clone().applyMatrix4(inverse);
      return geometry.type === 'CylinderGeometry'
        ? Math.abs(local.y) <= .50001 && Math.hypot(local.x, local.z) <= .966
        : Math.max(Math.abs(local.x), Math.abs(local.y), Math.abs(local.z)) <= .50001;
    });
    const checkConnection = (start: Three.Vector3, end: Three.Vector3, label: string) => {
      for (let sample = 0; sample <= 40; sample++) {
        const point = start.clone().lerp(end, sample / 40);
        expect(solidAt(point), `${label} has an unsupported gap at ${point.toArray().join(',')}`).toBe(true);
      }
    };
    for (let index = 0; index < 4; index++) {
      const rotation = new THREE.Matrix4().makeRotationZ(index * Math.PI / 2 - Math.PI / 2);
      checkConnection(new THREE.Vector3(0, .17, -.11).applyMatrix4(rotation), new THREE.Vector3(0, 2.26, -.11).applyMatrix4(rotation), `spoke ${index}`);
    }
    const hatch = (index: number, side: number) => {
      const angle = index / 12 * Math.PI * 2;
      return new THREE.Vector3(side * .389, -.012, -.012)
        .applyAxisAngle(new THREE.Vector3(0, 0, 1), angle - Math.PI / 2)
        .add(new THREE.Vector3(Math.cos(angle) * 2.47, Math.sin(angle) * 2.47, 0));
    };
    for (let index = 0; index < 12; index++) checkConnection(hatch(index, 1), hatch((index + 11) % 12, -1), `bay tunnel ${index}`);
    const tenderDock = new THREE.Vector3(0, -.065, -.1).applyEuler(new THREE.Euler(.1, -.3, -.6)).add(new THREE.Vector3(.18, -.19, 1));
    checkConnection(new THREE.Vector3(0, 0, .5), new THREE.Vector3(0, 0, .875), 'hub docking neck');
    checkConnection(new THREE.Vector3(0, 0, .875), tenderDock, 'tender docking neck');
    let draws = 0;
    graphics.model!.traverse(object => { if (object instanceof THREE.Mesh && object.visible && (object.material as Three.Material).visible) draws++; });
    expect(draws).toBeLessThanOrEqual(23);
  });

  it.each([
    { gpu: 'ANGLE NVIDIA RTX', hint: undefined, antialias: [true], software: false },
    { gpu: '', hint: undefined, antialias: [true], software: false },
    { gpu: 'ANGLE SwiftShader', hint: undefined, antialias: [true, false], software: true },
    { gpu: 'ANGLE SwiftShader', hint: true, antialias: [false], software: true },
    { gpu: 'ANGLE NVIDIA RTX', hint: true, antialias: [false, true], software: false },
    { gpu: '', hint: true, antialias: [false, true], software: false },
  ])('uses observed $gpu with hint=$hint to create antialias=$antialias', async ({ gpu, hint, antialias, software }) => {
    graphics.gpuName = gpu;
    const { scene, host } = create({ mode: 'landing', softwareGraphicsHint: hint });
    expect(graphics.rendererOptions.map(options => options.antialias)).toEqual(antialias);
    expect(graphics.disposed).toBe(antialias.length - 1);
    expect(graphics.contextsLost).toBe(antialias.length - 1);
    expect(host.querySelectorAll('canvas')).toHaveLength(1);
    const flight = scene.launch(); step(LAUNCH_DURATION_MS); await flight;
    expect(readFlightHandoff(sessionStorage).softwareGraphics).toBe(software ? true : undefined);
  });

  it('keeps utility pages clear of physical exhibits while preserving the connecting flight', async () => {
    const { scene, host } = create({ mode: 'landing', showExhibits: false });
    expect(latest().exhibits).toEqual([]);
    const launch = scene.launch();
    step(LAUNCH_DURATION_MS); await launch;
    expect(host.dataset.flightPhase).toBe('handoff');
    expect(latest().exhibits).toEqual([]);
    expect(readFlightHandoff(sessionStorage).settled).toBe(true);
  });

  it.each([{ width: 1440, height: 1000 }, { width: 390, height: 940 }])('keeps the focused exhibit in its screen stage at $width px without moving the ship', viewport => {
    const { scene, host } = create({ mode: 'landing', reducedMotion: true, interactive: true }, viewport);
    const home = latest();
    scene.setExhibit('pod'); scene.setExhibitView(true);
    const staged = latest();
    expectSamePose(staged, home);
    const pod = staged.exhibits.find(exhibit => exhibit.id === 'pod')!;
    expect(pod.screen[0]).toBeCloseTo(viewport.width < 500 ? 0 : .4, 5);
    const expectedY = viewport.width < 500 ? Math.min(235, window.innerHeight * .29) : viewport.height * .46;
    expect((1 - pod.screen[1]) * viewport.height / 2).toBeCloseTo(expectedY, 5);
    // Hover redraw must retain projected stage coordinates under reduced motion.
    const canvas = host.querySelector('canvas')!;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, ...viewport } as DOMRect);
    const event = new MouseEvent('pointermove', { clientX: (pod.screen[0] + 1) * viewport.width / 2, clientY: expectedY });
    Object.defineProperty(event, 'pointerType', { value: 'mouse' }); canvas.dispatchEvent(event);
    const hoveredPod = latest().exhibits.find(exhibit => exhibit.id === 'pod')!;
    expect(hoveredPod.screen[0]).toBeCloseTo(pod.screen[0], 5);
    expect(hoveredPod.screen[1]).toBeCloseTo(pod.screen[1], 5);
    scene.setExhibit(null); scene.setExhibitView(false);
    latest().exhibits.forEach((exhibit, index) => exhibit.screen.forEach((value, coordinate) => expect(value).toBeCloseTo(home.exhibits[index].screen[coordinate], 5)));
  });

  it('routes physical product picks separately and removes exhibits from station mode', () => {
    const onSelect = vi.fn(), onExhibitSelect = vi.fn();
    const { scene, host } = create({ mode: 'landing', interactive: true, reducedMotion: true, onSelect, onExhibitSelect });
    expect(latest().exhibits).toHaveLength(4);
    scene.setExhibit('pod');
    expect(onExhibitSelect).not.toHaveBeenCalled();
    const pod = latest().exhibits.find(exhibit => exhibit.id === 'pod')!;
    const canvas = host.querySelector('canvas')!;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1440, height: 900 } as DOMRect);
    for (const type of ['pointerdown', 'pointerup']) {
      const event = new MouseEvent(type, { clientX: (pod.screen[0] + 1) * 720, clientY: (1 - pod.screen[1]) * 450, button: 0 });
      Object.defineProperties(event, { pointerType: { value: 'mouse' }, pointerId: { value: 1 } });
      canvas.dispatchEvent(event);
    }
    expect(onExhibitSelect).toHaveBeenCalledWith('pod'); expect(onSelect).not.toHaveBeenCalled();
    scene.setMode('station');
    expect(latest().exhibits.every(exhibit => !exhibit.visible)).toBe(true);
    scene.setMode('landing');
    expect(latest().exhibits.every(exhibit => exhibit.visible)).toBe(true);
  });

  it('reveals only the previewed physical bay pair and keeps its rim attached while the ring rotates', () => {
    const select = vi.fn();
    const { scene, host } = create({ mode: 'station', interactive: true, onSelect: select });
    expect(latest().previews.filter(rim => rim.visible && rim.opacity > 0)).toHaveLength(0);
    step(16);
    scene.previewInstrument('pod'); step(100);
    const early = latest().previews.filter(rim => rim.visible && rim.opacity > 0);
    expect(early.map(rim => rim.id)).toEqual(['pod', 'pod']);
    expect(early.every(rim => rim.opacity > 0 && rim.opacity < .95)).toBe(true);
    step(100); step(100);
    const lit = latest().previews.filter(rim => rim.visible && rim.opacity > 0);
    expect(lit.every(rim => rim.opacity > .9)).toBe(true);
    const anchors = latest().anchors.filter(anchor => anchor.id === 'pod');
    lit.forEach((rim, index) => rim.matrix.forEach((value, coordinate) => expect(value).toBeCloseTo(anchors[index].matrix[coordinate], 10)));
    expect(lit[0].matrix).not.toEqual(early[0].matrix);
    scene.previewInstrument(null);
    for (let frame = 0; frame < 8; frame++) step(100);
    expect(latest().previews.filter(rim => rim.visible && rim.opacity > 0)).toHaveLength(0);
    expect(select).not.toHaveBeenCalled();
    expect(host.dataset.flightPhase).toBe('interactive');
  });

  it('shows and clears preview rims immediately under reduced motion without changing the view', () => {
    const { scene } = create({ mode: 'station', reducedMotion: true });
    const before = latest();
    scene.previewInstrument('trigger');
    expect(latest().previews.filter(rim => rim.visible && rim.opacity > 0).map(rim => rim.id)).toEqual(['trigger', 'trigger']);
    expectSamePose(latest(), before);
    scene.previewInstrument('invalid');
    expect(latest().previews.filter(rim => rim.visible && rim.opacity > 0)).toHaveLength(0);
    expectSamePose(latest(), before);
  });

  it('keeps dock previews independent of camera travel and selected-module input', () => {
    const complete = vi.fn(), select = vi.fn();
    const { scene, host } = create({ mode: 'station', arrival: true, onArrivalComplete: complete, onSelect: select });
    const before = latest();
    scene.previewInstrument('pod'); step(0);
    expectSamePose(latest(), before);
    scene.previewInstrument(null); scene.previewInstrument('invalid'); step(0);
    expectSamePose(latest(), before);
    expect(complete).not.toHaveBeenCalled(); expect(select).not.toHaveBeenCalled();
    expect(host.dataset.flightPhase).toBe('arriving');
  });

  it('adds bounded passive mouse aim and eases home without changing the free orbit', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const { host } = create({ mode: 'station', interactive: true });
    const canvas = host.querySelector('canvas')!;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1440, height: 900 } as DOMRect);
    const move = new MouseEvent('pointermove', { clientX: 1400, clientY: 300 });
    Object.defineProperty(move, 'pointerType', { value: 'mouse' });
    canvas.dispatchEvent(move);
    for (let frame = 0; frame < 5; frame++) step(100);
    expect(latest().eye[0]).toBeGreaterThan(.2);
    expect(latest().eye[0]).toBeLessThan(.8);
    canvas.dispatchEvent(new MouseEvent('pointerleave'));
    for (let frame = 0; frame < 20; frame++) step(100);
    expect(Math.abs(latest().eye[0])).toBeLessThan(.002);
  });

  it.each(['drag', 'zoom'] as const)('preserves the visible hover pose when %s input begins', input => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const { host } = create({ mode: input === 'drag' ? 'landing' : 'station', interactive: true });
    const canvas = host.querySelector('canvas')!;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1440, height: 900 } as DOMRect);
    const pointer = (type: string, x: number) => {
      const event = new MouseEvent(type, { clientX: x, clientY: 300, button: 0 });
      Object.defineProperties(event, { pointerType: { value: 'mouse' }, pointerId: { value: 1 } });
      canvas.dispatchEvent(event);
    };
    pointer('pointermove', 1400);
    for (let frame = 0; frame < 30; frame++) step(100);
    const eyeYaw = () => Math.atan2(latest().eye[0] - latest().ship[12], latest().eye[2] - latest().ship[14]);
    const beforeYaw = eyeYaw();
    if (input === 'drag') {
      pointer('pointerdown', 1400); pointer('pointermove', 1408);
    } else canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true }));
    step(input === 'drag' ? 1 : 16);
    const nextYaw = eyeYaw();
    // Dropping the settled ~.038rad pointer offset creates an immediate recoil.
    // Starting direct input should preserve the eye and ease that offset away.
    expect(Math.abs(nextYaw - beforeYaw)).toBeLessThan(.002);
  });

  it.each([
    { width: 1440, height: 900, instrument: undefined },
    { width: 390, height: 844, instrument: undefined },
    { width: 1440, height: 900, instrument: 'pod' },
    { width: 390, height: 844, instrument: 'fade' },
  ])('finishes the complete journey on the exact settled $instrument app pose at $width px', async viewport => {
    const { scene, host } = create({ mode: 'landing' }, viewport);
    const completed = vi.fn(); const launch = scene.launch().then(completed);
    expect(host.dataset.flightPhase).toBe('launching');
    step(LAUNCH_DURATION_MS / 2); await Promise.resolve(); expect(completed).not.toHaveBeenCalled();
    step(LAUNCH_DURATION_MS / 2); await launch;
    expect(host.dataset.flightPhase).toBe('handoff');
    const landing = latest(); const saved = readFlightHandoff(sessionStorage);
    const landingGas = [...flowGraphics.samples.at(-1)!];
    expect(saved.arrival).toBe(true); expect(saved.settled).toBe(true); expect(saved.pose).toBeDefined();
    expect(callbacks.size).toBe(0);
    const complete = vi.fn();
    const app = create({ mode: 'station', arrival: !saved.settled, arrivalPose: saved.pose, arrivalRevealMs: ARRIVAL_REVEAL_MS, framePanel: false, onArrivalComplete: complete }, viewport);
    if (viewport.instrument) {
      app.scene.setSelected(viewport.instrument);
      app.scene.setPanelOpen(true, { focus: false });
    }
    const arrival = latest();
    expect(flowGraphics.samples.at(-1)).toEqual(landingGas);
    expectSamePose(arrival, landing);
    expect(app.host.dataset.flightPhase).toBe('interactive');
    step(ARRIVAL_REVEAL_MS + 1000);
    // The final overview has no second camera flight. Ambient hull bob is tiny.
    expect(Math.hypot(...latest().eye.map((value, index) => value - arrival.eye[index]))).toBeLessThan(.02);
    expect(complete).not.toHaveBeenCalled();
    if (viewport.instrument) {
      app.scene.setPanelOpen(false);
      app.scene.setPanelOpen(true);
      step(200);
      expect(Math.hypot(...latest().eye.map((value, index) => value - arrival.eye[index]))).toBeGreaterThan(.1);
    }
  });

  it('keeps moving through the former document handoff and the journey midpoint', async () => {
    const { scene, host } = create({ mode: 'landing' });
    const complete = vi.fn(); void scene.launch().then(complete);
    const speeds: number[] = [];
    let prior = latest().eye;
    for (let time = 100; time <= 6000; time += 100) {
      step(100);
      if (time >= 2800) speeds.push(Math.hypot(...latest().eye.map((value, index) => value - prior[index])) / .1);
      prior = latest().eye;
    }
    await Promise.resolve();
    expect(host.dataset.flightPhase).toBe('launching');
    expect(complete).not.toHaveBeenCalled();
    expect(Math.min(...speeds)).toBeGreaterThan(15);
    for (let index = 1; index < speeds.length; index++) {
      expect(speeds[index] / speeds[index - 1]).toBeGreaterThan(.75);
      expect(speeds[index] / speeds[index - 1]).toBeLessThan(1.25);
    }
  });

  it('holds the exact handoff while the poster reveals the renderer, then completes one arrival', () => {
    const complete = vi.fn();
    const { host } = create({ mode: 'station', arrival: true, arrivalRevealMs: ARRIVAL_REVEAL_MS, onArrivalComplete: complete });
    const handoff = latest();
    step(200); step(200); expectSamePose(latest(), handoff);
    step(200); expect(latest().eye).not.toEqual(handoff.eye);
    step(ARRIVAL_DURATION_MS); expect(complete).toHaveBeenCalledOnce();
    expect(host.dataset.flightPhase).toBe('interactive');
    step(1000); expect(complete).toHaveBeenCalledOnce();
  });

  it('does not spend visible arrival time while the scene is paused or graphics are unavailable', () => {
    const complete = vi.fn();
    const { scene } = create({ mode: 'station', arrival: true, onArrivalComplete: complete });
    step(1000); const before = latest();
    scene.setPaused(true); step(15000); expect(complete).not.toHaveBeenCalled();
    scene.setPaused(false); step(0); expectSamePose(latest(), before);
    step(ARRIVAL_DURATION_MS - 1000); expect(complete).toHaveBeenCalledOnce();
  });

  it('lets a workspace selection interrupt the flight without right-drawer framing', () => {
    const complete = vi.fn();
    const { scene, host } = create({ mode: 'station', arrival: true, framePanel: false, onArrivalComplete: complete });
    scene.setSelected('pod'); scene.setPanelOpen(true);
    expect(complete).toHaveBeenCalledOnce(); expect(host.dataset.flightPhase).toBe('interactive');
    scene.explore(); expect(complete).toHaveBeenCalledOnce();
  });
});
