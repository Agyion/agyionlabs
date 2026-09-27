import * as THREE from 'three';

/** Stable, angular pinpoints. Their soft footprint is measured in display pixels. */
export function createStarField(pixelRatio: number) {
  let seed = 20260924;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const count = 1300;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const intensities = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const elevation = 2 * random() - 1;
    const azimuth = random() * Math.PI * 2;
    const horizontal = Math.sqrt(1 - elevation * elevation);
    positions.set([2300 * horizontal * Math.cos(azimuth), 2300 * elevation, 2300 * horizontal * Math.sin(azimuth)], index * 3);
    const temperature = random();
    colors.set(temperature < .3 ? [.98, .89, .76] : temperature < .75 ? [.68, .78, .94] : [.9, .93, .98], index * 3);
    const magnitude = Math.pow(random(), 4);
    sizes[index] = 3.2 + magnitude * 1.3;
    intensities[index] = .07 + magnitude * .43;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aIntensity', new THREE.BufferAttribute(intensities, 1));
  const material = new THREE.ShaderMaterial({
    name: 'AgyionStarField',
    uniforms: {
      uPixelRatio: { value: pixelRatio },
      uBackground: { value: null as THREE.Texture | null },
      uResolution: { value: new THREE.Vector2(1, 1) },
    },
    vertexColors: true,
    vertexShader: /* glsl */ `
      // AGYION_STAR_FIELD
      attribute float aSize;
      attribute float aIntensity;
      uniform float uPixelRatio;
      uniform vec2 uResolution;
      varying vec3 vStarColor;
      varying float vStarIntensity;
      varying vec2 vPixelCenter;
      varying float vSigma;
      void main() {
        vStarColor = color;
        vStarIntensity = aIntensity * uPixelRatio * uPixelRatio;
        // The sky follows camera rotation, never the station's translation.
        vec3 direction = mat3(modelViewMatrix) * position;
        gl_Position = projectionMatrix * vec4(direction, 1.);
        vPixelCenter = (gl_Position.xy / gl_Position.w * .5 + .5) * uResolution;
        vSigma = aSize * .16 * uPixelRatio;
        // Pad rasterized point bounds; the actual center remains subpixel precise.
        gl_PointSize = ceil(aSize * uPixelRatio) + 2.;
      }
    `,
    fragmentShader: /* glsl */ `
      // AGYION_STAR_FIELD
      uniform sampler2D uBackground;
      uniform vec2 uResolution;
      varying vec3 vStarColor;
      varying float vStarIntensity;
      varying vec2 vPixelCenter;
      varying float vSigma;
      vec2 erfApprox(vec2 value) {
        vec2 x = abs(value);
        vec2 t = 1. / (1. + .3275911 * x);
        vec2 polynomial = (((((1.061405429 * t - 1.453152027) * t)
          + 1.421413741) * t - .284496736) * t + .254829592) * t;
        return sign(value) * (1. - polynomial * exp(-x * x));
      }
      void main() {
        vec2 offset = gl_FragCoord.xy - vPixelCenter;
        // Integrate a Gaussian across this pixel, rather than sampling its
        // center. Total light remains steady as a star crosses a pixel boundary.
        vec2 coverage = .5 * (erfApprox((offset + .5) / (1.41421356 * vSigma))
          - erfApprox((offset - .5) / (1.41421356 * vSigma)));
        float profile = coverage.x * coverage.y;
        float occultation = texture2D(uBackground, gl_FragCoord.xy / uResolution).a;
        gl_FragColor = vec4(vStarColor, profile * 2. * vStarIntensity * (1. - occultation));
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  // Vertex positions ignore view translation, so CPU world-space culling does not apply.
  points.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(points);
  return {
    scene,
    setOcclusion(texture: THREE.Texture) { material.uniforms.uBackground.value = texture; },
    resize(width: number, height: number) { material.uniforms.uResolution.value.set(Math.floor(width * pixelRatio), Math.floor(height * pixelRatio)); },
    dispose() { geometry.dispose(); material.dispose(); scene.clear(); },
  };
}
