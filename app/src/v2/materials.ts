// V2 material and light system (docs/V2_SHOTS.md, "Materials").
//
//   graphite   matte structural surfaces: high roughness, world-space grain,
//              so darkness keeps visible form instead of crushing to black
//   porcelain  typography: warm off-white, wrap-lit, crisp bevel highlight;
//              tone-mapped below the halation threshold (never blooms)
//   reasoning  translucent blue paths: fresnel-weighted, additive
//   mint       verification pulses: emissive HDR (the only thing besides the
//              cursor allowed to glow)
//   ember      the cursor: emissive HDR
//   metal      brushed highlights, completed machinery only
//
// All lit materials share `groundY` height occlusion (contact darkening where
// objects meet the ground) injected with onBeforeCompile.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export const COL = {
  ink: new THREE.Color('#0a0c10'),
  graphite: new THREE.Color('#2c3038'),
  graphiteHi: new THREE.Color('#2c323c'),
  porcelain: new THREE.Color('#eee9df'),
  porcelainShade: new THREE.Color('#b9b3a8'),
  reasoning: new THREE.Color('#5fa8ff'),
  mint: new THREE.Color('#7cf2c2'),
  ember: new THREE.Color('#ff6a3d'),
  metal: new THREE.Color('#c9ced6'),
  annotation: new THREE.Color('#8b93a1'),
};

export const shared = {
  groundY: { value: -1000 }, grainScale: { value: 38 },
  /** studio environment as order-2 spherical harmonics (see environmentSH) */
  envSH: { value: Array.from({ length: 9 }, () => new THREE.Vector3()) },
};

function inject(mat: THREE.MeshStandardMaterial, opts: { wrap?: number; grain?: number; ao?: number; aoHeight?: number; sh?: boolean }) {
  // sh: rough dielectrics take the studio environment from spherical
  // harmonics instead of the PMREM (the engine skips them when assigning
  // envMap).  At roughness >= 0.8 the PMREM lookup is effectively irradiance,
  // and in SwiftShader it was 2/3 of the per-sample cost on the big planes.
  if (opts.sh) mat.userData.envSH = true;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.v2sh = shared.envSH;
    sh.uniforms.v2envK = { value: mat.envMapIntensity };
    sh.uniforms.groundY = shared.groundY;
    sh.uniforms.grainScale = shared.grainScale;
    sh.uniforms.wrapAmt = { value: opts.wrap ?? 0 };
    sh.uniforms.grainAmt = { value: opts.grain ?? 0 };
    sh.uniforms.aoAmt = { value: opts.ao ?? 0.55 };
    sh.uniforms.aoHeight = { value: opts.aoHeight ?? 0.35 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPosV2;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldPosV2 = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWorldPosV2;
        uniform float groundY; uniform float grainScale; uniform float wrapAmt; uniform float grainAmt;
        uniform float aoAmt; uniform float aoHeight;
        uniform vec3 v2sh[9]; uniform float v2envK;
        float v2hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float v2noise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(mix(v2hash(i), v2hash(i+vec3(1,0,0)), f.x), mix(v2hash(i+vec3(0,1,0)), v2hash(i+vec3(1,1,0)), f.x), f.y),
                     mix(mix(v2hash(i+vec3(0,0,1)), v2hash(i+vec3(1,0,1)), f.x), mix(v2hash(i+vec3(0,1,1)), v2hash(i+vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <lights_fragment_maps>', opts.sh ? `#include <lights_fragment_maps>
        {
          vec3 wN = inverseTransformDirection(geometryNormal, viewMatrix);
          iblIrradiance += shGetIrradianceAt(wN, v2sh) * v2envK;
          vec3 rV = normalize(mix(reflect(-geometryViewDir, geometryNormal), geometryNormal, material.roughness * material.roughness));
          radiance += shGetIrradianceAt(inverseTransformDirection(rV, viewMatrix), v2sh) * (v2envK * RECIPROCAL_PI);
        }` : '#include <lights_fragment_maps>')
      // grain: modulate albedo and roughness in world space (stable under camera motion)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float gn = v2noise(vWorldPosV2 * grainScale) * 0.6 + v2noise(vWorldPosV2 * grainScale * 3.7) * 0.4;
        diffuseColor.rgb *= 1.0 + (gn - 0.5) * grainAmt;`)
      // height occlusion near the ground plane
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        float hAO = mix(1.0 - aoAmt, 1.0, smoothstep(0.0, aoHeight, vWorldPosV2.y - groundY));
        reflectedLight.indirectDiffuse *= hAO; reflectedLight.directDiffuse *= mix(1.0, hAO, 0.6);`)
      // wrap lighting: lift the terminator (porcelain reads softer, less plastic)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.directDiffuse += diffuseColor.rgb * wrapAmt * 0.18;`);
  };
  mat.customProgramCacheKey = () => `v2-${opts.sh ? 'sh' : 'pm'}-${mat.envMapIntensity}-${opts.wrap ?? 0}-${opts.grain ?? 0}-${opts.ao ?? 0.55}-${opts.aoHeight ?? 0.35}`;
  return mat;
}

export function graphite(color = COL.graphite, rough = 0.88) {
  return inject(new THREE.MeshStandardMaterial({ color: color.clone(), roughness: rough, metalness: 0.0, envMapIntensity: 0.12 }), { grain: 0.45, ao: 0.6, aoHeight: 0.6, sh: true });
}
export function porcelain(color = COL.porcelain) {
  return inject(new THREE.MeshPhysicalMaterial({ color: color.clone(), roughness: 0.5, metalness: 0.0, envMapIntensity: 0.22, clearcoat: 0.35, clearcoatRoughness: 0.24 }), { wrap: 1, grain: 0.03, ao: 0.5, aoHeight: 0.25 });
}
export function metal() {
  return inject(new THREE.MeshStandardMaterial({ color: COL.metal.clone(), roughness: 0.28, metalness: 1.0, envMapIntensity: 1.1 }), { grain: 0.08, ao: 0.4 });
}
/** Emissive HDR (cursor, pulses): unlit, value above the halation threshold. */
export function emissive(color: THREE.Color, intensity: number) {
  return new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(intensity), toneMapped: false });
}
/** Flat unlit ink for annotations / graphic lines (stays below halation). */
export function flat(color: THREE.Color, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color: color.clone(), transparent: opacity < 1, opacity, toneMapped: false, depthWrite: opacity >= 1 });
}

/** Translucent reasoning material for tubes: fresnel edges, additive. */
export function reasoning(intensity = 0.7) {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: COL.reasoning.clone() }, intensity: { value: intensity }, opacity: { value: 1 } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 color; uniform float intensity; uniform float opacity; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        float a = (0.18 + 0.82 * f) * opacity; gl_FragColor = vec4(color * intensity * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

/** Key + rim + environment for a scene group. Key casts shadows; its
 *  direction is jittered per temporal sample by the engine (soft shadows). */
/**
 * One motivated key (a spot with a soft pool that falls off into darkness),
 * a cool rim from behind, and a very low fill.  The key casts the shadows;
 * the engine jitters its position per temporal sample on a small disk, so
 * penumbrae are soft and physically plausible.
 */
export class Lighting extends THREE.Group {
  readonly key = new THREE.SpotLight(0xfff0e0, 1, 0, 0.30, 0.95, 0);
  readonly rim = new THREE.DirectionalLight(0x9fc8ff, 0.35);
  readonly fill = new THREE.HemisphereLight(0x8090a8, 0x0a0c10, 0.06);
  keyDir = new THREE.Vector3(-0.5, 0.62, 0.6).normalize();
  keyDist = 26;
  /** offset of the pool centre from the target (world units) */
  poolOffset = new THREE.Vector3();
  target = new THREE.Vector3();
  constructor(_extent = 12, intensity = 1.25) {
    super();
    this.key.intensity = intensity;
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.camera.near = 4; this.key.shadow.camera.far = 60;
    this.key.shadow.bias = -0.0002;
    this.key.shadow.normalBias = 0.015;
    this.rim.position.set(6, 3, -8);
    this.add(this.key, this.key.target, this.rim, this.fill);
  }
  /** Place the key; `jitter` (0..1 pair) samples a disk for soft shadows. */
  aim(target: THREE.Vector3, jitter: [number, number] = [0.5, 0.5], softness = 0.05) {
    this.target.copy(target);
    const a = jitter[0] * Math.PI * 2, r = Math.sqrt(jitter[1]) * softness;
    const d = this.keyDir.clone();
    const u = new THREE.Vector3(1, 0, 0).cross(d).normalize(), v = d.clone().cross(u);
    d.addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r).normalize();
    const aimAt = target.clone().add(this.poolOffset);
    this.key.position.copy(aimAt).addScaledVector(d, this.keyDist);
    this.key.target.position.copy(aimAt);
    this.key.target.updateMatrixWorld();
    this.rim.position.copy(target).add(new THREE.Vector3(6, 3, -8));
  }
}

let envTex: THREE.Texture | null = null;
export function environment(r: THREE.WebGLRenderer) {
  if (envTex) return envTex;
  const pm = new THREE.PMREMGenerator(r);
  envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  pm.dispose();
  return envTex;
}

/**
 * Project the same studio (RoomEnvironment) onto order-2 spherical harmonics,
 * synchronously, into shared.envSH.  Irradiance from these matches
 * getIBLIrradiance of the PMREM (both return E, pi included).  Mirrors
 * three's LightProbeGenerator.fromCubeRenderTarget (which is async).
 */
let shDone = false;
export function environmentSH(r: THREE.WebGLRenderer) {
  if (shDone) return shared.envSH.value;
  shDone = true;
  const size = 64;
  const rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.FloatType });
  const cc = new THREE.CubeCamera(0.1, 100, rt);
  const room = new RoomEnvironment();
  const auto = r.autoClear;
  r.autoClear = true;
  cc.update(r, room);
  r.autoClear = auto;
  const sh = shared.envSH.value;
  for (const v of sh) v.set(0, 0, 0);
  const basis = new Array(9).fill(0);
  const data = new Float32Array(size * size * 4);
  const coord = new THREE.Vector3(), dir = new THREE.Vector3();
  const flip = -1; // WebGL coordinate system
  const pixelSize = 2 / size;
  let total = 0;
  for (let face = 0; face < 6; face++) {
    r.readRenderTargetPixels(rt as unknown as THREE.WebGLRenderTarget, 0, 0, size, size, data, face);
    for (let i = 0; i < data.length; i += 4) {
      const px = i / 4;
      const col = (1 - ((px % size) + 0.5) * pixelSize) * flip;
      const row = 1 - (Math.floor(px / size) + 0.5) * pixelSize;
      switch (face) {
        case 0: coord.set(-1 * flip, row, col * flip); break;
        case 1: coord.set(1 * flip, row, -col * flip); break;
        case 2: coord.set(col, 1, -row); break;
        case 3: coord.set(col, -1, row); break;
        case 4: coord.set(col, row, 1); break;
        case 5: coord.set(-col, row, -1); break;
      }
      const l2 = coord.lengthSq(), w = 4 / (Math.sqrt(l2) * l2);
      total += w;
      dir.copy(coord).normalize();
      THREE.SphericalHarmonics3.getBasisAt(dir, basis);
      for (let j = 0; j < 9; j++) { sh[j].x += basis[j] * data[i] * w; sh[j].y += basis[j] * data[i + 1] * w; sh[j].z += basis[j] * data[i + 2] * w; }
    }
  }
  const norm = (4 * Math.PI) / total;
  for (const v of sh) v.multiplyScalar(norm);
  rt.dispose();
  room.dispose?.();
  return sh;
}
