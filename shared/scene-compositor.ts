import * as THREE from 'three';

/** Keep the hull at display resolution; render the soft, distant gas every frame. */
export function createSceneCompositor(renderer: THREE.WebGLRenderer, background: THREE.Scene, softwareGraphics: boolean, stars?: THREE.Scene) {
  const size = new THREE.Vector2();
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
  });
  const presentation = new THREE.Scene();
  const eye = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.MeshBasicMaterial({map: target.texture, depthTest: false, depthWrite: false});
  presentation.add(new THREE.Mesh(geometry, material));
  return {
    backgroundTexture: target.texture,
    resize() {
      renderer.getDrawingBufferSize(size);
      const scale = softwareGraphics ? .4 : .8;
      target.setSize(Math.max(1, Math.round(size.x * scale)), Math.max(1, Math.round(size.y * scale)));
    },
    render(scene: THREE.Scene, camera: THREE.Camera) {
      const autoClear = renderer.autoClear;
      try {
        renderer.autoClear = true;
        renderer.setRenderTarget(target);
        renderer.render(background, camera);
        renderer.setRenderTarget(null);
        renderer.render(presentation, eye);
        renderer.autoClear = false;
        // Stars need display-pixel coverage. Their shader uses the gas target's
        // alpha to remain behind its disk and opaque shadow without upscaling.
        if (stars) renderer.render(stars, camera);
        // Presentation already cleared depth and its quad never writes to it.
        renderer.render(scene, camera);
      } finally {
        renderer.autoClear = autoClear;
        renderer.setRenderTarget(null);
      }
    },
    dispose() { target.dispose(); material.dispose(); geometry.dispose(); presentation.clear(); },
  };
}
