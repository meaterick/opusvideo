// Crisp constant-width lines for construction geometry, paths and rules.
// Built as thin camera-independent ribbons in a plane (quads between
// consecutive points, mitred joins), so they stay razor-sharp at 4K and get
// supersampled by the temporal jitter like everything else.  A line can be
// drawn progressively (`draw` 0..1 along its arc length).
import * as THREE from 'three';

export class Ribbon extends THREE.Mesh<THREE.BufferGeometry, THREE.Material> {
  private pts: THREE.Vector3[] = [];
  private lengths: number[] = [];
  total = 0;
  constructor(material: THREE.Material, readonly width = 0.02, readonly normal = new THREE.Vector3(0, 0, 1), maxPts = 256) {
    super(new THREE.BufferGeometry(), material);
    const pos = new Float32Array(maxPts * 2 * 3);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const idx: number[] = [];
    for (let i = 0; i < maxPts - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    this.geometry.setIndex(idx);
    this.frustumCulled = false;
  }
  setPoints(p: THREE.Vector3[]) {
    this.pts = p;
    this.lengths = [0];
    for (let i = 1; i < p.length; i++) this.lengths.push(this.lengths[i - 1] + p[i].distanceTo(p[i - 1]));
    this.total = this.lengths[this.lengths.length - 1] ?? 0;
    return this;
  }
  /** Point at arc length s. */
  at(s: number, out = new THREE.Vector3()) {
    const L = this.lengths, P = this.pts;
    if (s <= 0) return out.copy(P[0]);
    if (s >= this.total) return out.copy(P[P.length - 1]);
    let i = 1;
    while (L[i] < s) i++;
    const u = (s - L[i - 1]) / (L[i] - L[i - 1]);
    return out.copy(P[i - 1]).lerp(P[i], u);
  }
  /** Rebuild the ribbon for the arc [from, to] (0..1 of the total length). */
  draw(to = 1, from = 0, width = this.width) {
    const P = this.pts, L = this.lengths;
    const s0 = from * this.total, s1 = to * this.total;
    const use: THREE.Vector3[] = [];
    if (s1 - s0 > 1e-6 && P.length > 1) {
      use.push(this.at(s0));
      for (let i = 1; i < P.length - 1; i++) if (L[i] > s0 && L[i] < s1) use.push(P[i].clone());
      use.push(this.at(s1));
    }
    const pos = this.geometry.attributes.position as THREE.BufferAttribute;
    const n = this.normal, hw = width / 2;
    const side = new THREE.Vector3(), d1 = new THREE.Vector3();
    for (let i = 0; i < use.length; i++) {
      // mitred side vector (average of adjacent segment directions), clamped
      const a = i > 0 ? use[i].clone().sub(use[i - 1]).normalize() : use[1].clone().sub(use[0]).normalize();
      const b = i < use.length - 1 ? use[i + 1].clone().sub(use[i]).normalize() : a.clone();
      d1.copy(a).add(b).normalize();
      if (d1.lengthSq() < 1e-8) d1.copy(a);
      side.crossVectors(n, d1).normalize();
      const miter = 1 / Math.max(0.35, side.dot(new THREE.Vector3().crossVectors(n, a).normalize()));
      pos.setXYZ(i * 2, use[i].x + side.x * hw * miter, use[i].y + side.y * hw * miter, use[i].z + side.z * hw * miter);
      pos.setXYZ(i * 2 + 1, use[i].x - side.x * hw * miter, use[i].y - side.y * hw * miter, use[i].z - side.z * hw * miter);
    }
    pos.needsUpdate = true;
    this.geometry.setDrawRange(0, Math.max(0, use.length - 1) * 6);
    this.visible = use.length > 1;
    return this;
  }
}

/** Straight line helper. */
export function segment(a: THREE.Vector3, b: THREE.Vector3) { return [a.clone(), b.clone()]; }
