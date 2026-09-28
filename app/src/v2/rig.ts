// Layout rig: shots are designed in 1080p pixels on a 12-column editorial
// grid (docs/V2_SHOTS.md) and placed in world units on a plane at z = 0 seen
// by a camera at distance D.  px(n) converts a pixel length to world units on
// that plane; col / baseline helpers give grid positions.
import * as THREE from 'three';

export const GRID = { margin: 96, top: 72, col: 126, gutter: 24, baseline: 24 };

export class Rig {
  readonly unit: number; // world units per px at the subject plane
  constructor(readonly fov = 30, readonly D = 20) {
    this.unit = (2 * D * Math.tan((fov * Math.PI) / 360)) / 1080;
  }
  px(n: number) { return n * this.unit; }
  /** World x of a pixel column (0 = left edge of frame), relative to the frame centre cx. */
  x(pxFromLeft: number, cx = 0) { return cx + (pxFromLeft - 960) * this.unit; }
  /** World y of a pixel row (0 = top), relative to the frame centre cy. */
  y(pxFromTop: number, cy = 0) { return cy + (540 - pxFromTop) * this.unit; }
  /** Left edge (px) of grid column c (1-based). */
  static col(c: number) { return GRID.margin + (c - 1) * (GRID.col + GRID.gutter); }
  /** Pixel font size -> world cap height for a font with capHeight/em ratio r. */
  cap(fontPx: number, r = 0.72) { return this.px(fontPx * r); }
  /** Frontal camera on (cx, cy), with an optional oblique offset of the eye. */
  place(cam: THREE.PerspectiveCamera, cx: number, cy: number, eye: [number, number] = [0, 0], D = this.D) {
    cam.fov = this.fov;
    cam.position.set(cx + eye[0], cy + eye[1], D);
    cam.lookAt(cx, cy, 0);
  }
}
