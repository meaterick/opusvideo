// V2 engine: temporal accumulation renderer.
//
// A frame at song time t is the average of N sub-samples.  Each sub-sample:
//   * its own time inside the shutter (0.18 of a frame, stratified + seeded),
//     so movement blurs exactly as far as it travels while the shutter is open
//   * a Halton sub-pixel jitter of the projection, so N samples = N-x spatial
//     supersampling of type edges and hairlines (no MSAA needed)
//   * a key-light direction sample on a small disk: soft, physically plausible
//     shadow penumbrae
//   * optionally a lens sample: depth of field focused on f.dof.focus
// Samples accumulate in a float target; the post chain runs once per frame.
//
// N is chosen per frame from a motion probe (two tiny renders at the shutter
// edges): nearly static -> 12, ordinary -> 36, fast -> 72, very fast -> 108.
// Preview mode renders one sample at the canvas size.
import * as THREE from 'three';
import type { Music } from '../engine/data';
import type { F2, Post2, Shot } from './shot';
import { environment, shared } from './materials';
import { halton, hash2 } from './motion';

export const LW = 1920, LH = 1080; // logical layout frame (shots are designed at 1080p)

const fsVert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
class Pass {
  readonly mat: THREE.ShaderMaterial;
  private static geo = new THREE.PlaneGeometry(2, 2);
  private static cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private scene = new THREE.Scene();
  constructor(frag: string, uniforms: Record<string, THREE.IUniform>, additive = false) {
    this.mat = new THREE.ShaderMaterial({ vertexShader: fsVert, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, transparent: additive });
    if (additive) {
      // exact sum: dst = dst + src (three's AdditiveBlending would scale by src alpha)
      this.mat.blending = THREE.CustomBlending;
      this.mat.blendEquation = THREE.AddEquation;
      this.mat.blendSrc = THREE.OneFactor; this.mat.blendDst = THREE.OneFactor;
      this.mat.blendSrcAlpha = THREE.OneFactor; this.mat.blendDstAlpha = THREE.OneFactor;
    }
    const mesh = new THREE.Mesh(Pass.geo, this.mat);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }
  get u() { return this.mat.uniforms; }
  run(r: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null) { r.setRenderTarget(target); r.render(this.scene, Pass.cam); }
}

const accumFrag = /* glsl */ `uniform sampler2D src; uniform float w; varying vec2 vUv;
  void main(){ gl_FragColor = vec4(texture2D(src, vUv).rgb * w, w); }`;
const downFrag = /* glsl */ `uniform sampler2D src; uniform vec2 texel; uniform float threshold; uniform float first; varying vec2 vUv;
  vec3 pre(vec3 c){ if (first < 0.5) return c; float b = max(c.r, max(c.g, c.b)); return c * smoothstep(threshold, threshold * 1.6, b); }
  void main(){ vec3 s = pre(texture2D(src, vUv).rgb) * 4.0;
    s += pre(texture2D(src, vUv + texel * vec2(-1.0,-1.0)).rgb) + pre(texture2D(src, vUv + texel * vec2(1.0,-1.0)).rgb);
    s += pre(texture2D(src, vUv + texel * vec2(-1.0, 1.0)).rgb) + pre(texture2D(src, vUv + texel * vec2(1.0, 1.0)).rgb);
    gl_FragColor = vec4(s / 8.0, 1.0); }`;
const upFrag = /* glsl */ `uniform sampler2D src; uniform sampler2D base; uniform vec2 texel; varying vec2 vUv;
  void main(){ vec3 s = vec3(0.0);
    s += texture2D(src, vUv + texel * vec2(-2.0, 0.0)).rgb + texture2D(src, vUv + texel * vec2(2.0, 0.0)).rgb;
    s += texture2D(src, vUv + texel * vec2(0.0, -2.0)).rgb + texture2D(src, vUv + texel * vec2(0.0, 2.0)).rgb;
    s += (texture2D(src, vUv + texel * vec2(-1.0,-1.0)).rgb + texture2D(src, vUv + texel * vec2(1.0,-1.0)).rgb
        + texture2D(src, vUv + texel * vec2(-1.0, 1.0)).rgb + texture2D(src, vUv + texel * vec2(1.0, 1.0)).rgb) * 2.0;
    gl_FragColor = vec4(s / 12.0 + texture2D(base, vUv).rgb, 1.0); }`;
const finalFrag = /* glsl */ `uniform sampler2D acc; uniform sampler2D halo; uniform sampler2D blurL;
  uniform float exposure; uniform float halation; uniform float localContrast; uniform float vignette; uniform float lift;
  uniform vec2 res; uniform float seed; varying vec2 vUv;
  float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
  vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
  vec3 srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
  float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  void main(){
    vec4 a = texture2D(acc, vUv);
    vec3 c = a.rgb / max(a.a, 1e-5);
    // mild local contrast on luminance (unsharp against a wide blur)
    float L = luma(c), Lb = luma(texture2D(blurL, vUv).rgb);
    c *= 1.0 + localContrast * clamp((L - Lb) / max(Lb, 0.02), -0.6, 0.6);
    // halation: only what is above the emissive threshold, warm-tinted, subtle
    vec3 h = texture2D(halo, vUv).rgb;
    c += (h + vec3(0.06, 0.0, -0.03) * luma(h)) * halation;
    c = c * exposure + lift * (1.0 - smoothstep(0.0, 0.05, L));
    vec2 d = vUv - 0.5; d.x *= res.x / res.y;
    c *= 1.0 - vignette * smoothstep(0.35, 1.25, length(d));
    c = srgb(aces(c));
    // 1-LSB triangular dither (seeded; prevents banding in dark gradients)
    float n = h12(vUv * res + seed) + h12(vUv * res * 1.37 + seed * 3.1) - 1.0;
    gl_FragColor = vec4(c + n / 255.0, 1.0);
  }`;
const probeFrag = /* glsl */ `uniform sampler2D src; varying vec2 vUv;
  void main(){ vec3 c = texture2D(src, vUv).rgb; gl_FragColor = vec4(c / (1.0 + c), 1.0); }`;

export interface RenderOpts { samples: number | 'auto'; shutter: number; fps: number; minSamples?: number; maxSamples?: number }

export class Engine2 {
  readonly renderer: THREE.WebGLRenderer;
  readonly world = new THREE.Scene();
  readonly cam = new THREE.PerspectiveCamera(30, LW / LH, 0.05, 400);
  readonly W: number; readonly H: number;
  readonly errors: string[] = [];
  private sampleRT: THREE.WebGLRenderTarget;
  private accRT: THREE.WebGLRenderTarget;
  private probeRT: THREE.WebGLRenderTarget;
  private probeOut: THREE.WebGLRenderTarget;
  private levels: THREE.WebGLRenderTarget[] = [];
  private ups: THREE.WebGLRenderTarget[] = [];
  private blurRT: THREE.WebGLRenderTarget;
  private blurChain: THREE.WebGLRenderTarget[] = [];
  private accum = new Pass(accumFrag, { src: { value: null }, w: { value: 1 } }, true);
  private down = new Pass(downFrag, { src: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 1.5 }, first: { value: 1 } });
  private up = new Pass(upFrag, { src: { value: null }, base: { value: null }, texel: { value: new THREE.Vector2() } });
  private fin: Pass;
  private probe = new Pass(probeFrag, { src: { value: null } });
  lastSamples = 0;
  lastProbe = 0;
  constructor(readonly canvas: HTMLCanvasElement, readonly m: Music, readonly shots: Shot[], W: number, H: number) {
    this.W = W; this.H = H;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(W, H, false);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // the final pass encodes sRGB itself
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.autoClear = true;
    const lin = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    this.sampleRT = new THREE.WebGLRenderTarget(W, H, { ...lin, type: THREE.HalfFloatType, depthBuffer: true });
    this.accRT = new THREE.WebGLRenderTarget(W, H, { ...lin, type: THREE.FloatType });
    this.probeRT = new THREE.WebGLRenderTarget(Math.round(W / 16), Math.round(H / 16), { ...lin, type: THREE.HalfFloatType, depthBuffer: true });
    this.probeOut = new THREE.WebGLRenderTarget(this.probeRT.width, this.probeRT.height, { ...lin, type: THREE.UnsignedByteType });
    let lw = W, lh = H;
    for (let i = 0; i < 4; i++) {
      lw = Math.max(1, lw >> 1); lh = Math.max(1, lh >> 1);
      this.levels.push(new THREE.WebGLRenderTarget(lw, lh, { ...lin, type: THREE.HalfFloatType }));
      this.ups.push(new THREE.WebGLRenderTarget(lw, lh, { ...lin, type: THREE.HalfFloatType }));
    }
    for (const d of [2, 4, 8]) this.blurChain.push(new THREE.WebGLRenderTarget(Math.round(W / d), Math.round(H / d), { ...lin, type: THREE.HalfFloatType }));
    this.blurRT = new THREE.WebGLRenderTarget(Math.round(W / 16), Math.round(H / 16), { ...lin, type: THREE.HalfFloatType });
    this.fin = new Pass(finalFrag, {
      acc: { value: this.accRT.texture }, halo: { value: null }, blurL: { value: this.blurRT.texture },
      exposure: { value: 1 }, halation: { value: 0.12 }, localContrast: { value: 0.12 }, vignette: { value: 0.1 }, lift: { value: 0.004 },
      res: { value: new THREE.Vector2(W, H) }, seed: { value: 0 },
    });
    const env = environment(this.renderer);
    this.world.background = new THREE.Color('#0a0c10');
    for (const s of shots) {
      try { s.build({ renderer: this.renderer, env }); } catch (e) { this.errors.push(`${s.id}.build: ${(e as Error).stack}`); }
      s.group.visible = false;
      this.world.add(s.group);
    }
    // Environment reflections per material, NOT scene.environment: since
    // three r163 material.envMapIntensity does not scale scene.environment,
    // which would light every surface with the full studio (a flat, washed
    // look).  Assigning envMap per material makes each envMapIntensity count.
    this.world.traverse((o: any) => {
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) if (m.isMeshStandardMaterial && !m.envMap) { m.envMap = env; m.needsUpdate = true; }
    });
  }

  defaults(): Post2 { return { exposure: 1, halation: 0.12, threshold: 1.5, localContrast: 0.12, vignette: 0.1, lift: 0.004 }; }
  active(t: number) { return this.shots.filter((s) => t >= s.start && t < s.end).sort((a, b) => a.priority - b.priority); }

  /** Evaluate every active shot at time t; returns the frame state. */
  private evaluate(t: number): F2 {
    const f: F2 = { t, m: this.m, cam: this.cam, post: this.defaults(), aspect: LW / LH, dof: null, minSamples: 0, lightTarget: new THREE.Vector3() };
    for (const s of this.shots) s.group.visible = false;
    this.cam.position.set(0, 0, 10); this.cam.up.set(0, 1, 0); this.cam.lookAt(0, 0, 0); this.cam.fov = 30; this.cam.clearViewOffset();
    for (const s of this.active(t)) {
      s.group.visible = true;
      try { s.update(f); } catch (e) { if (this.errors.length < 40) this.errors.push(`${s.id}.update(${t.toFixed(3)}): ${(e as Error).stack}`); }
    }
    return f;
  }

  private sample(t: number, i: number, n: number, frameSeed: number, target: THREE.WebGLRenderTarget, jitter: boolean) {
    const f = this.evaluate(t);
    const cam = this.cam;
    // lens sample for depth of field: move the eye on the aperture disk and
    // shear the frustum so the focus plane stays fixed
    let ox = 0, oy = 0;
    if (f.dof && jitter) {
      const a = halton(i + 1, 5) * Math.PI * 2, r = Math.sqrt(halton(i + 1, 7)) * f.dof.aperture;
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      cam.updateMatrixWorld();
      const lx = Math.cos(a) * r, ly = Math.sin(a) * r;
      cam.position.addScaledVector(right, lx).addScaledVector(up, ly);
      const fpx = (target.height / 2) / Math.tan((cam.fov * Math.PI) / 360);
      ox -= (lx * fpx) / f.dof.focus;
      oy += (ly * fpx) / f.dof.focus;
    }
    if (jitter) { ox += halton(i + 1, 2) - 0.5; oy += halton(i + 1, 3) - 0.5; }
    cam.aspect = LW / LH;
    if (ox || oy) cam.setViewOffset(target.width, target.height, ox, oy, target.width, target.height); else cam.clearViewOffset();
    cam.updateProjectionMatrix();
    // soft key light
    for (const s of this.active(t)) s.lighting?.aim(f.lightTarget, jitter ? [halton(i + 1, 11), halton(i + 1, 13)] : [0, 0], jitter ? 0.05 : 0);
    this.renderer.setRenderTarget(target);
    this.renderer.clear();
    this.renderer.render(this.world, cam);
    return f;
  }

  /** Mean absolute luma difference (0-255) between the shutter edges. */
  private motion(t: number, shutterSec: number) {
    const px: Uint8Array[] = [];
    for (const dt of [-shutterSec / 2, shutterSec / 2]) {
      this.sample(t + dt, 0, 1, 0, this.probeRT, false);
      this.probe.u.src.value = this.probeRT.texture;
      this.probe.run(this.renderer, this.probeOut);
      const b = new Uint8Array(this.probeOut.width * this.probeOut.height * 4);
      this.renderer.readRenderTargetPixels(this.probeOut, 0, 0, this.probeOut.width, this.probeOut.height, b);
      px.push(b);
    }
    let s = 0;
    for (let k = 0; k < px[0].length; k += 4) s += Math.abs(px[0][k] - px[1][k]) * 0.2126 + Math.abs(px[0][k + 1] - px[1][k + 1]) * 0.7152 + Math.abs(px[0][k + 2] - px[1][k + 2]) * 0.0722;
    return s / (px[0].length / 4);
  }

  /** Render the frame for song time t (and frame number for seeding). */
  render(t: number, frame: number, o: RenderOpts = { samples: 1, shutter: 0.18, fps: 60 }) {
    const shutterSec = o.shutter / o.fps;
    let n: number;
    const fProbe = this.evaluate(t); // also tells us the shot's minimum
    if (o.samples === 'auto') {
      const d = this.motion(t, shutterSec);
      this.lastProbe = d;
      n = d < 0.25 ? 12 : d < 1.2 ? 36 : d < 3.5 ? 72 : 108;
      n = Math.max(n, o.minSamples ?? 12, fProbe.minSamples);
      n = Math.min(n, o.maxSamples ?? 108);
    } else n = Math.max(1, o.samples);
    this.lastSamples = n;
    this.renderer.setRenderTarget(this.accRT);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    let post: Post2 = fProbe.post;
    for (let i = 0; i < n; i++) {
      // stratified time inside the shutter, jittered by a seeded hash
      const u = n === 1 ? 0.5 : (i + hash2(frame, i)) / n;
      const f = this.sample(t + (u - 0.5) * shutterSec * (n === 1 ? 0 : 1), i, n, frame, this.sampleRT, n > 1);
      if (i === (n >> 1)) post = f.post;
      this.accum.u.src.value = this.sampleRT.texture;
      this.accum.u.w.value = 1 / n; // accRT holds the mean (alpha sums to 1)
      this.accum.run(this.renderer, this.accRT);
    }
    this.renderer.setClearColor(0x000000, 1);
    this.postProcess(post, frame);
    return n;
  }

  private postProcess(p: Post2, frame: number) {
    // halation chain (emissive only: threshold above lit porcelain)
    let src: THREE.Texture = this.accRT.texture, sw = this.W, sh = this.H;
    this.levels.forEach((lv, i) => {
      this.down.u.src.value = src; this.down.u.texel.value.set(1 / sw, 1 / sh);
      this.down.u.first.value = i === 0 ? 1 : 0; this.down.u.threshold.value = p.threshold;
      this.down.run(this.renderer, lv);
      src = lv.texture; sw = lv.width; sh = lv.height;
    });
    let upSrc = this.levels[this.levels.length - 1].texture;
    for (let i = this.levels.length - 2; i >= 0; i--) {
      const s = this.levels[i + 1];
      this.up.u.src.value = upSrc; this.up.u.base.value = this.levels[i].texture; this.up.u.texel.value.set(0.5 / s.width, 0.5 / s.height);
      this.up.run(this.renderer, this.ups[i]);
      upSrc = this.ups[i].texture;
    }
    // wide blur of the whole scene (no threshold) for local contrast
    let bsrc: THREE.Texture = this.accRT.texture, bw = this.W, bh = this.H;
    for (const rt of [...this.blurChain, this.blurRT]) {
      this.down.u.src.value = bsrc; this.down.u.first.value = 0; this.down.u.texel.value.set(1 / bw, 1 / bh);
      this.down.run(this.renderer, rt);
      bsrc = rt.texture; bw = rt.width; bh = rt.height;
    }
    const u = this.fin.u;
    u.halo.value = upSrc; u.exposure.value = p.exposure; u.halation.value = p.halation; u.localContrast.value = p.localContrast;
    u.vignette.value = p.vignette; u.lift.value = p.lift; u.seed.value = (frame % 1024) * 1.618;
    this.fin.run(this.renderer, null);
  }

  read(buf?: Uint8Array) {
    const gl = this.renderer.getContext();
    const out = buf ?? new Uint8Array(this.W * this.H * 4);
    gl.readPixels(0, 0, this.W, this.H, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return out;
  }
}
