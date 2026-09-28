// Post-processing: the scene renders into a multisampled HDR target, then
//   bloom  : bright-pass + dual-filter (Kawase) down/up chain, 5 levels
//   grade  : filmic tone curve, ink-blue shadows, warm highlights
//   lens   : chromatic fringe (beat-driven), vignette, halation
//   grain  : per-frame hashed film grain (seeded by frame number -> deterministic)
import * as THREE from 'three';

const fsVert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

class Pass {
  readonly mat: THREE.ShaderMaterial;
  private static geo = new THREE.PlaneGeometry(2, 2);
  private static cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mesh: THREE.Mesh;
  private scene = new THREE.Scene();
  constructor(frag: string, uniforms: Record<string, THREE.IUniform>) {
    this.mat = new THREE.ShaderMaterial({ vertexShader: fsVert, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    this.mesh = new THREE.Mesh(Pass.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }
  get u() { return this.mat.uniforms; }
  run(r: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null) {
    r.setRenderTarget(target);
    r.render(this.scene, Pass.cam);
  }
}

const downFrag = /* glsl */ `
  uniform sampler2D src; uniform vec2 texel; uniform float threshold; uniform float first;
  varying vec2 vUv;
  vec3 pre(vec3 c){ // soft-knee bright pass on the first level only
    if (first < 0.5) return c;
    float b = max(c.r, max(c.g, c.b));
    float k = clamp((b - threshold + 0.25) / 0.5, 0.0, 1.0);
    float w = max(b - threshold, 0.0) + k * k * 0.125;
    return c * (w / max(b, 1e-4));
  }
  void main(){
    vec3 s = pre(texture2D(src, vUv).rgb) * 4.0;
    s += pre(texture2D(src, vUv + texel * vec2(-1.0, -1.0)).rgb);
    s += pre(texture2D(src, vUv + texel * vec2( 1.0, -1.0)).rgb);
    s += pre(texture2D(src, vUv + texel * vec2(-1.0,  1.0)).rgb);
    s += pre(texture2D(src, vUv + texel * vec2( 1.0,  1.0)).rgb);
    gl_FragColor = vec4(s / 8.0, 1.0);
  }
`;
const upFrag = /* glsl */ `
  uniform sampler2D src; uniform sampler2D base; uniform vec2 texel; uniform float mixBase;
  varying vec2 vUv;
  void main(){
    vec3 s = vec3(0.0);
    s += texture2D(src, vUv + texel * vec2(-2.0, 0.0)).rgb;
    s += texture2D(src, vUv + texel * vec2( 2.0, 0.0)).rgb;
    s += texture2D(src, vUv + texel * vec2(0.0, -2.0)).rgb;
    s += texture2D(src, vUv + texel * vec2(0.0,  2.0)).rgb;
    s += texture2D(src, vUv + texel * vec2(-1.0, -1.0)).rgb * 2.0;
    s += texture2D(src, vUv + texel * vec2( 1.0, -1.0)).rgb * 2.0;
    s += texture2D(src, vUv + texel * vec2(-1.0,  1.0)).rgb * 2.0;
    s += texture2D(src, vUv + texel * vec2( 1.0,  1.0)).rgb * 2.0;
    gl_FragColor = vec4(s / 12.0 + texture2D(base, vUv).rgb * mixBase, 1.0);
  }
`;
const compFrag = /* glsl */ `
  uniform sampler2D scene; uniform sampler2D bloom;
  uniform vec2 res; uniform float frame; uniform float bloomAmt; uniform float fringe;
  uniform float exposure; uniform float flash; uniform float grain; uniform float vignette;
  uniform vec3 shadowTint; uniform vec3 flashColor;
  varying vec2 vUv;
  float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  vec3 filmic(vec3 x){ // smooth shoulder, keeps saturated highlights from clipping to flat
    vec3 a = x * (2.51 * x + 0.03); vec3 b = x * (2.43 * x + 0.59) + 0.14; return clamp(a / b, 0.0, 1.0);
  }
  void main(){
    vec2 d = vUv - 0.5;
    float r2 = dot(d, d);
    vec2 off = d * fringe * 0.012 * (0.4 + r2 * 2.0);
    vec3 c;
    c.r = texture2D(scene, vUv - off).r;
    c.g = texture2D(scene, vUv).g;
    c.b = texture2D(scene, vUv + off).b;
    vec3 bl = texture2D(bloom, vUv).rgb;
    c += bl * bloomAmt;
    // halation: warm red spill around the brightest bloom
    c += vec3(1.0, 0.35, 0.18) * max(bl.r - 0.35, 0.0) * 0.18 * bloomAmt;
    c += flashColor * flash;
    c *= exposure;
    c = filmic(c);
    // grade: shadows pulled toward ink blue
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c += shadowTint * (1.0 - smoothstep(0.0, 0.35, l)) * 0.06;
    c *= 1.0 - vignette * smoothstep(0.15, 0.75, r2 * 1.6);
    // grain (luma-weighted: strongest in the mids)
    float g = h12(vUv * res + fract(frame * 0.6180339) * 1000.0) - 0.5;
    g += h12(vUv * res * 0.5 + fract(frame * 0.3819660) * 777.0) - 0.5;
    c += g * grain * (0.35 + 0.65 * (1.0 - abs(l - 0.45) * 1.6));
    gl_FragColor = vec4(pow(max(c, 0.0), vec3(1.0 / 2.2)), 1.0);
  }
`;

export interface PostParams {
  bloom: number; fringe: number; exposure: number; flash: number; grain: number; vignette: number;
  flashColor: THREE.Color; threshold: number;
}

export class Post {
  readonly sceneRT: THREE.WebGLRenderTarget;
  private levels: THREE.WebGLRenderTarget[] = [];
  private ups: THREE.WebGLRenderTarget[] = [];
  private down = new Pass(downFrag, { src: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 0.8 }, first: { value: 1 } });
  private up = new Pass(upFrag, { src: { value: null }, base: { value: null }, texel: { value: new THREE.Vector2() }, mixBase: { value: 1 } });
  private comp: Pass;
  constructor(readonly w: number, readonly h: number, msaa = 4) {
    const opts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, { ...opts, depthBuffer: true, samples: msaa });
    let lw = w, lh = h;
    for (let i = 0; i < 5; i++) {
      lw = Math.max(1, lw >> 1); lh = Math.max(1, lh >> 1);
      this.levels.push(new THREE.WebGLRenderTarget(lw, lh, opts));
      this.ups.push(new THREE.WebGLRenderTarget(lw, lh, opts));
    }
    this.comp = new Pass(compFrag, {
      scene: { value: this.sceneRT.texture }, bloom: { value: null }, res: { value: new THREE.Vector2(w, h) },
      frame: { value: 0 }, bloomAmt: { value: 0.8 }, fringe: { value: 0 }, exposure: { value: 1 }, flash: { value: 0 },
      grain: { value: 0.05 }, vignette: { value: 0.5 }, shadowTint: { value: new THREE.Color(0.05, 0.08, 0.2) },
      flashColor: { value: new THREE.Color(1, 1, 1) },
    });
  }

  render(r: THREE.WebGLRenderer, frame: number, p: PostParams) {
    // bloom down chain
    let src = this.sceneRT.texture, sw = this.w, sh = this.h;
    this.levels.forEach((lv, i) => {
      this.down.u.src.value = src;
      this.down.u.texel.value.set(1 / sw, 1 / sh);
      this.down.u.first.value = i === 0 ? 1 : 0;
      this.down.u.threshold.value = p.threshold;
      this.down.run(r, lv);
      src = lv.texture; sw = lv.width; sh = lv.height;
    });
    // up chain: ups[i] = blur(up[i+1]) + levels[i]
    let upSrc = this.levels[this.levels.length - 1].texture;
    for (let i = this.levels.length - 2; i >= 0; i--) {
      const s = this.levels[i + 1];
      this.up.u.src.value = upSrc;
      this.up.u.base.value = this.levels[i].texture;
      this.up.u.texel.value.set(0.5 / s.width, 0.5 / s.height);
      this.up.u.mixBase.value = 1;
      this.up.run(r, this.ups[i]);
      upSrc = this.ups[i].texture;
    }
    const u = this.comp.u;
    u.bloom.value = upSrc;
    u.frame.value = frame;
    u.bloomAmt.value = p.bloom;
    u.fringe.value = p.fringe;
    u.exposure.value = p.exposure;
    u.flash.value = p.flash;
    u.grain.value = p.grain;
    u.vignette.value = p.vignette;
    u.flashColor.value.copy(p.flashColor);
    this.comp.run(r, null);
  }
}
