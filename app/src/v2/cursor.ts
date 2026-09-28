// The cursor, V2.  One object through the whole film: an ember bar (the only
// warm light source in most frames) that gains a notch for every capability
// it has shown.  Notches are micro detail: thin ticks on its right side,
// visible at full resolution, invisible in a thumbnail.
import * as THREE from 'three';
import { COL, emissive } from './materials';

export class Cursor2 extends THREE.Group {
  private core: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  private notches: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly base = COL.ember.clone();
  constructor() {
    super();
    this.core = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), emissive(COL.ember, 6));
    this.add(this.core);
    for (let i = 0; i < 6; i++) {
      const n = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), emissive(COL.ember, 2.2));
      this.notches.push(n);
      this.add(n);
    }
  }
  /**
   * Pose in the parent's space.  `h` height, `w` width (default h/11),
   * `intensity` HDR multiplier, `notches` how many capability notches it has
   * earned so far, `rotZ` to lay it horizontal (reading line / pass).
   */
  pose(p: { x: number; y: number; z?: number; h: number; w?: number; intensity?: number; notches?: number; rotZ?: number; opacity?: number; color?: THREE.Color }) {
    const w = p.w ?? p.h / 11;
    this.position.set(p.x, p.y, p.z ?? 0);
    this.rotation.set(0, 0, p.rotZ ?? 0);
    this.core.scale.set(w, p.h, w);
    const c = (p.color ?? this.base).clone().multiplyScalar(p.intensity ?? 6);
    this.core.material.color.copy(c);
    const k = p.notches ?? 0;
    this.notches.forEach((n, i) => {
      n.visible = i < k && (p.opacity ?? 1) > 0.5;
      // fine ticks at any scale: thin, short, spaced by their own height
      const nh = Math.min(w * 0.16, Math.max(0.012, p.h * 0.006));
      const nw = Math.min(w * 0.7, nh * 5);
      n.scale.set(nw, nh, Math.min(w * 0.5, nh * 3));
      n.position.set(w / 2 + nw / 2 + nh * 0.8, p.h / 2 - p.h * 0.1 - i * nh * 3.5, 0);
      n.material.color.copy(c).multiplyScalar(0.45);
    });
    this.visible = (p.opacity ?? 1) > 0.01;
  }
}

/** Beat-locked cursor blink: on for the first 60% of each beat (stepped). */
export function blink2(beatPos: number) {
  const f = beatPos - Math.floor(beatPos);
  return f < 0.6 ? 1 : 0.12;
}
