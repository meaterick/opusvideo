// THE CARET — the one recurring motif.
//
// A bar of ember light: the text cursor waiting for input.  Through the video
// it is always the same object but it takes on the capability of each scene:
//   cursor (writes the labels)  ->  reading line (sweeps context)
//   ->  probe / needle  ->  plotting pen  ->  connector  ->  the spine of what
//   gets built  ->  back to a blinking cursor on an empty line.
// Geometry: a core box (HDR ember, feeds bloom) + a soft glow plane + an
// optional trail (a stretched, fading copy along the motion direction).
import * as THREE from 'three';
import { PAL } from './palette';

const glowFrag = /* glsl */ `
  uniform vec3 color; uniform float opacity; varying vec2 vUv;
  void main(){
    vec2 d = (vUv - 0.5) * 2.0;
    // elliptical falloff that reaches exactly 0 before the plane's edge
    float r = length(d);
    float g = exp(-r * r * 4.0) * smoothstep(1.0, 0.55, r);
    gl_FragColor = vec4(color * g, g * opacity);
  }
`;
const glowVert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export interface CaretPose {
  x: number; y: number; z?: number;
  h: number;            // bar height (world units)
  w?: number;           // bar width
  intensity?: number;   // HDR multiplier of the core (1 = ember, >2 blooms hard)
  glow?: number;        // glow plane opacity
  opacity?: number;
  rotZ?: number;        // rotate the bar (a horizontal caret = reading line)
  trail?: number;       // world length of the motion trail (along -x of the bar's frame)
  color?: THREE.Color;
}

export class Caret extends THREE.Group {
  private core: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  private glow: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private trail: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  constructor() {
    super();
    this.core = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: PAL.ember.clone(), transparent: true }));
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: { color: { value: PAL.ember.clone() }, opacity: { value: 1 } }, vertexShader: glowVert, fragmentShader: glowFrag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.trail = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(-0.5, 0, 0), new THREE.ShaderMaterial({
      uniforms: { color: { value: PAL.ember.clone() }, opacity: { value: 1 } }, vertexShader: glowVert,
      fragmentShader: /* glsl */ `uniform vec3 color; uniform float opacity; varying vec2 vUv;
        void main(){ float a = pow(vUv.x, 2.2) * smoothstep(0.0, 0.5, 0.5 - abs(vUv.y - 0.5)); gl_FragColor = vec4(color * a, a * opacity); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.add(this.glow, this.trail, this.core);
    this.renderOrder = 10;
  }
  pose(p: CaretPose) {
    const w = p.w ?? p.h * 0.075;
    const I = p.intensity ?? 1.6;
    const op = p.opacity ?? 1;
    const col = p.color ?? PAL.ember;
    this.position.set(p.x, p.y, p.z ?? 0);
    this.rotation.set(0, 0, p.rotZ ?? 0);
    this.core.scale.set(w, p.h, w * 0.6);
    this.core.material.color.copy(col).multiplyScalar(I);
    this.core.material.opacity = op;
    // glow: across the bar it depends on thickness (and a little on length,
    // capped), along the bar it just overhangs the ends
    this.glow.scale.set(w * 16 + Math.min(p.h, 1.2) * 0.6, p.h * 1.15 + w * 16, 1);
    this.glow.material.uniforms.color.value.copy(col).multiplyScalar(0.9);
    this.glow.material.uniforms.opacity.value = (p.glow ?? 0.55) * op;
    const tr = p.trail ?? 0;
    this.trail.visible = tr > 0.001;
    this.trail.scale.set(tr, p.h * 0.95, 1);
    this.trail.position.x = -w / 2;
    this.trail.material.uniforms.color.value.copy(col).multiplyScalar(0.8);
    this.trail.material.uniforms.opacity.value = 0.6 * op;
    this.visible = op > 0.002;
  }
}

/** Classic cursor blink, phase-locked to the beat (on for the first 60%). */
export function blink(beatPos: number, soft = 0.08) {
  const f = beatPos - Math.floor(beatPos);
  const on = Math.min(1, Math.max(0, (0.6 - f) / soft + 0.5));
  return 0.12 + 0.88 * on;
}
