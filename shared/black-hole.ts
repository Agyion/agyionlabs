import * as THREE from 'three';

const IMPACT_SAMPLES = 1024;
const PHASE_SAMPLES = 768;
const MAX_IMPACT = 3.65;
const MAX_PHASE = Math.PI * 2;

/** Periodic turbulence, built once. Per-frame flow is a few texture reads. */
export function createAccretionTexture(): THREE.DataTexture {
  const size = 256;
  const pixels = new Uint8Array(size * size * 4);
  const random = (x: number, y: number, seed: number) => {
    let h = Math.imul(x + seed, 374761393) ^ Math.imul(y + seed, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const noise = (x: number, y: number, period: number, seed: number) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const wrap = (v: number) => (v % period + period) % period;
    const a = random(wrap(ix), wrap(iy), seed);
    const b = random(wrap(ix + 1), wrap(iy), seed);
    const c = random(wrap(ix), wrap(iy + 1), seed);
    const d = random(wrap(ix + 1), wrap(iy + 1), seed);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const warpX = noise(x / size * 4, y / size * 4, 4, 919) - .5;
    const warpY = noise(x / size * 4, y / size * 4, 4, 371) - .5;
    for (let channel = 0; channel < 3; channel++) {
      let value = 0, weight = channel === 2 ? .29 : .54;
      for (let octave = 0; octave < 5; octave++) {
        const period = 4 << octave;
        value += noise((x / size + warpX * .6) * period, (y / size + warpY * .6) * period, period, channel * 127 + 71) * weight;
        weight *= channel === 2 ? .75 : .48;
      }
      pixels[(y * size + x) * 4 + channel] = Math.round(value * 255);
    }
    pixels[(y * size + x) * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Schwarzschild null-ray orbit u'' + u = 3u²/2, with distances in horizon radii.
 * Integrate once, not per fragment/frame. The texture maps impact and orbital
 * angle to reciprocal radius; zero denotes a ray that has already escaped.
 * The disk shader intersects this curved orbit with one inclined physical plane.
 * The artistic emissivity includes a plunging region inside the stable orbit.
 * This is a non-spinning, infinitesimally thin disk illustration, not a GR solver.
 */
export function createLensTexture(): THREE.DataTexture {
  const data = new Uint16Array(IMPACT_SAMPLES * PHASE_SAMPLES * 4);
  const step = MAX_PHASE / (PHASE_SAMPLES - 1);
  const shadowImpact = Math.sqrt(27) / 2;
  const acceleration = (u: number) => 1.5 * u * u - u;
  for (let x = 0; x < IMPACT_SAMPLES; x += 1) {
    const impact = Math.max(.001, x / (IMPACT_SAMPLES - 1) * MAX_IMPACT) * shadowImpact;
    let u = 0;
    let velocity = 1 / impact;
    let finished: number | null = null;
    for (let y = 0; y < PHASE_SAMPLES; y += 1) {
      const offset = (y * IMPACT_SAMPLES + x) * 4;
      data[offset] = THREE.DataUtils.toHalfFloat(finished ?? Math.max(0, u));
      data[offset + 3] = THREE.DataUtils.toHalfFloat(1);
      if (finished !== null) continue;
      // Fourth-order Runge-Kutta keeps the critical, near-orbiting rays stable.
      const a = acceleration(u);
      const b = acceleration(u + velocity * step / 2);
      const c = acceleration(u + velocity * step / 2 + a * step * step / 4);
      const d = acceleration(u + velocity * step + b * step * step / 2);
      u += step * (velocity + 2 * (velocity + a * step / 2) + 2 * (velocity + b * step / 2) + velocity + c * step) / 6;
      velocity += step * (a + 2 * b + 2 * c + d) / 6;
      if (u > 1) finished = 1;
      else if (u < 0) finished = 0;
    }
  }
  const texture = new THREE.DataTexture(data, IMPACT_SAMPLES, PHASE_SAMPLES, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export const holeVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const holeFragment = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D uLens;
  uniform sampler2D uFlow;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uInclination;
  uniform float uDiskRoll;
  uniform float uDiskSide;
  const float PI = 3.14159265359;
  // RGB is coverage-weighted radiance; alpha is the occulting disk coverage.
  // The combined image is converted to straight alpha only at the output.
  vec4 diskImage(float impact, float phase, vec3 observer, vec3 tangent, float order) {
    vec2 lookup = vec2(impact / ${MAX_IMPACT.toFixed(2)}, phase / (2. * PI));
    lookup = lookup * vec2(${(IMPACT_SAMPLES - 1).toFixed(1)}, ${(PHASE_SAMPLES - 1).toFixed(1)})
      / vec2(${IMPACT_SAMPLES.toFixed(1)}, ${PHASE_SAMPLES.toFixed(1)})
      + .5 / vec2(${IMPACT_SAMPLES.toFixed(1)}, ${PHASE_SAMPLES.toFixed(1)});
    float reciprocal = texture2D(uLens, lookup).r;
    float radius = 1. / max(reciprocal, .00001);
    // Filter the physical inner edge in screen space instead of cutting a
    // stair-step through fragments whose radii straddle the plunging region.
    float radialPixel = clamp(fwidth(radius), .012, .18);
    if (radius < 1. || radius > 22.) return vec4(0.);
    vec3 position = (cos(phase) * observer + sin(phase) * tangent) * radius;
    float azimuth = atan(position.z, position.x);
    // Differential rotation, radial filaments, broken turbulent arcs. The
    // material flows around the hole, instead of a noise field sliding sideways.
    float flowAngle = uTime * .06 / pow(max(radius / 3., 1.), 1.5);
    float turn = (azimuth + flowAngle) / (2. * PI);
    // Density lives on the rotating physical plane. Pure polar density makes
    // clean hoops where lensing maps a rear arc to almost one azimuth.
    vec2 flowPosition = mat2(cos(flowAngle), sin(flowAngle), -sin(flowAngle), cos(flowAngle)) * position.xz;
    float radialFlow = log(radius);
    vec3 clouds = texture2D(uFlow, flowPosition * vec2(.42, .19)).rgb;
    float wisps = texture2D(uFlow, vec2(radialFlow * 8.5 + (clouds.g - .5) * .8, turn * 11. + (clouds.b - .5) * .35)).g;
    // A low-frequency luminous body holds finer, irregular hot filaments.
    // Its density stays below the white core instead of becoming empty wire.
    float filaments = pow(smoothstep(.35, .76, wisps), 2.2);
    float density = smoothstep(.2, .74, clouds.r);
    float texture = .045 + density * .42 + filaments * .4;
    float edge = smoothstep(1.52 - radialPixel, 1.7 + radialPixel, radius);
    float outer = exp(-max(radius - 2.3, 0.) * .45);
    float coverage = edge * outer * (1. - smoothstep(15., 21., radius));
    // Preserve a genuinely dim receding side instead of clipping both sides
    // into the same cream exposure. This is an artistic Doppler approximation.
    float approach = mix(.32, 1.5, pow(smoothstep(-.75, .9, position.x / radius), 1.25));
    float heat = pow(2.3 / max(radius, 2.3), 1.35);
    float radiance = texture * heat * approach * (order < .5 ? 3.5 : 1.65);
    float ember = smoothstep(.18, .9, heat) * (.65 + .35 * filaments);
    vec3 cool = vec3(.04, .055, .065);
    vec3 hot = vec3(1., .5, .2);
    vec3 color = mix(cool, hot, ember);
    // Keep white in the hottest inner filaments, not across the broad gas body.
    float whiteCore = smoothstep(2.2, 4.8, radiance) * smoothstep(.7, .95, heat);
    color = mix(color, vec3(1., .96, .88), whiteCore);
    return vec4(color * radiance * coverage, clamp(coverage * 1.8, 0., 1.));
  }
  void main() {
    vec2 p = (vUv - .5) * vec2(6., 3.7);
    // The lensed image and nearby gas share the same physical disk plane.
    p = mat2(cos(uDiskRoll), sin(uDiskRoll), -sin(uDiskRoll), cos(uDiskRoll)) * p;
    p.y *= uDiskSide;
    float impact = length(p);
    vec2 radial = p / max(impact, .0001);
    vec3 observer = vec3(0., sin(uInclination), cos(uInclination));
    vec3 tangent = vec3(radial.x, radial.y * observer.z, -radial.y * observer.y);
    float phase = atan(observer.y, -tangent.y);
    vec4 nearImage = diskImage(impact, phase, observer, tangent, 0.);
    vec4 farImage = diskImage(impact, phase + PI, observer, tangent, 1.);
    vec3 emission = nearImage.rgb + farImage.rgb * (1. - nearImage.a)
      * mix(.6, 1., smoothstep(-.3, .2, p.y));
    // A narrow critical edge survives the reduced background target without
    // increasing its resolution. The derivative guard gives it pixel coverage.
    float pixelWidth = max(fwidth(impact), .0005);
    float photonWidth = max(.0035, pixelWidth * .75);
    float photonDistance = (impact - 1.004) / photonWidth;
    float outside = smoothstep(1. - pixelWidth * .5, 1. + pixelWidth * .5, impact);
    // The critical rim lies behind the nearest disk intersection.
    // Adding it unconditionally draws a complete bright ring through that gas.
    float photon = exp(-photonDistance * photonDistance) * outside * .32 * (1. - nearImage.a);
    // Broad haze stays restrained and outside the black shadow.
    float halo = exp(-max(impact - 1., 0.) * 20.) * outside * .022;
    float edge = (1. - smoothstep(2.5, 3., abs(p.x)))
      * (1. - smoothstep(1.58, 1.85, abs(p.y)));
    vec3 color = (emission + vec3(1., .88, .63) * photon
      + vec3(.72, .28, .055) * halo) * edge * uIntensity;
    float diskAlpha = nearImage.a + farImage.a * (1. - nearImage.a);
    float shadow = 1. - smoothstep(1. - pixelWidth * .65, 1. + pixelWidth * .65, impact);
    float alpha = max(shadow, clamp(diskAlpha + photon + halo * 2., 0., 1.) * edge);
    // NormalBlending expects straight RGB. Disk radiance already contains its
    // coverage; dividing here prevents the blend from attenuating it twice.
    gl_FragColor = vec4(color / max(alpha, .0001), alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export const accretionVertex = /* glsl */ `
  varying vec2 vDisk;
  varying vec4 vProjected;
  uniform float uTime;
  void main() {
    vDisk = position.xy;
    vec3 gas = position;
    gas.z += sin(position.x * .008 + uTime * .05) * cos(position.y * .012) * 2.2;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(gas, 1.);
    vProjected = gl_Position;
  }
`;

/** A real plane in the world supplies parallax under the approaching camera. */
export const accretionFragment = /* glsl */ `
  varying vec2 vDisk;
  varying vec4 vProjected;
  uniform sampler2D uFlow;
  uniform float uTime;
  uniform float uOpacity;
  uniform vec2 uHoleScreen;
  uniform float uHoleRadius;
  uniform float uHoleDepth;
  uniform float uAspect;
  const float PI = 3.14159265359;
  void main() {
    float radius = length(vDisk);
    if(radius < 190. || radius > 1220.) discard;
    float alpha = smoothstep(190.,210.,radius) * (1.-smoothstep(850.,1220.,radius)) * uOpacity;
    // Keep the curved-ray image around the hole, but let the physically nearer
    // outer gas pass in front of it. Masking the entire projected circle also
    // removed foreground gas and left an impossible black lower semicircle.
    vec2 screenOffset = (vProjected.xy / vProjected.w - uHoleScreen) * vec2(uAspect, 1.);
    if (uHoleRadius > 0.) {
      float curvedImage = smoothstep(1.08, 1.55, length(screenOffset) / uHoleRadius);
      float inFront = 1. - smoothstep(uHoleDepth - 4., uHoleDepth + 4., vProjected.w);
      // Inner gas is still represented by curved rays, avoiding a second flat
      // inner edge. Only the approaching outer disk takes over the foreground.
      float outerForeground = inFront * smoothstep(230., 300., radius);
      alpha *= mix(curvedImage, 1., outerForeground);
    }
    if (alpha <= 0.) discard;
    float angle = atan(vDisk.y, vDisk.x);
    float flow = angle / (2. * PI) + uTime * .009 / pow(max(radius / 160., 1.), 1.5);
    float turn = uTime * .005;
    vec2 gasPosition = mat2(cos(turn), sin(turn), -sin(turn), cos(turn)) * vDisk;
    vec3 cloud = texture2D(uFlow, gasPosition * .004).rgb;
    float radialFlow = log(radius / 150.);
    float wisp = texture2D(uFlow, vec2(radialFlow * 5.4 + cloud.g * .22, flow * 7. + cloud.b * .3)).g;
    float fine = texture2D(uFlow, vec2(radialFlow * 23. + cloud.r * .28, flow * 11.), -.6).b;
    float heat = pow(150. / max(radius, 150.), .88);
    float filaments = pow(smoothstep(.35, .76, wisp), 2.2);
    float fineFilaments = pow(smoothstep(.53, .78, fine), 2.);
    float density = smoothstep(.2, .74, cloud.r);
    float light = (.035 + density * .24 + filaments * .7 + fineFilaments * .2) * heat * 2.5;
    float ember = smoothstep(.18, .8, heat) * (.6 + .4 * filaments);
    vec3 color = mix(vec3(.035,.05,.062), vec3(1.,.4,.075), pow(ember,.75));
    float whiteCore = smoothstep(2.2,4.5,light) * smoothstep(.65,.85,heat);
    color = mix(color, vec3(1.,.96,.88), whiteCore);
    // This plane emits straight radiance: its geometric mask is applied only
    // once by NormalBlending, matching the lensed image above.
    gl_FragColor = vec4(color * light, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
