// DRAFT — the stand-in for sections whose bespoke scene is not built yet
// (everything outside the proof-of-concept window).  Still follows the rules:
// every word is typed into the space by the caret (no subtitles), the camera
// breathes with the bars, and the HUD names the capability the final scene
// will be about (see docs/TREATMENT.md).
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import type { Music } from '../engine/data';
import { LyricLine } from '../engine/lyricline';
import { Caret, blink } from '../engine/motif';
import { PAL } from '../engine/palette';
import { clamp, easeOut, noise1 } from '../engine/util';

export class DraftScene extends Scene {
  lines: LyricLine[] = [];
  caret = new Caret();
  grid!: THREE.LineSegments;
  constructor(m: Music, readonly id: string, readonly capability: string, readonly lineIdx: number[], start: number, end: number) {
    super(m);
    this.start = start; this.end = end;
  }
  build() {
    const g = new THREE.BufferGeometry();
    const pts: number[] = [];
    for (let i = -20; i <= 20; i++) { pts.push(i, -3, -30, i, -3, 10); pts.push(-20, -3, i - 10, 20, -3, i - 10); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.grid = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: PAL.graphite.clone().multiplyScalar(0.6), transparent: true, opacity: 0.5 }));
    this.group.add(this.grid, this.caret);
    for (const i of this.lineIdx) {
      const l = new LyricLine(this.m.line(i), { font: 'display', weight: 500 }, 0.62, 'left');
      this.lines.push(l);
      this.group.add(l);
    }
  }
  update(f: Frame) {
    const { t, m } = f;
    // stack of lines: the current one sits at y=0, earlier ones scroll up and dim
    let cur = 0;
    this.lines.forEach((l, i) => { if (l.started(t)) cur = i; });
    let caretPos = { x: -5.2, y: 0 };
    let typing = false;
    this.lines.forEach((l, i) => {
      const scroll = cur - i;
      const target = scroll * 0.95;
      l.position.set(-5.2, target, 0);
      const vis = i <= cur ? clamp(1 - (scroll - 2) * 0.8) : 0;
      const r = l.update(t, { opacity: vis * (scroll === 0 ? 1 : 0.45) });
      if (i === cur) { caretPos = { x: -5.2 + r.caretX, y: 0 }; typing = r.typing; }
    });
    const bp = m.beat(t);
    this.caret.pose({ x: caretPos.x, y: caretPos.y + 0.24, h: 0.72, opacity: typing ? 1 : blink(bp), intensity: 1.8 });
    // camera: slow drift + bar breathing
    const lt = t - this.start;
    const push = easeOut(m.barPulse(t, 0.35));
    f.cam.position.set(noise1(lt * 0.2, 3) * 0.4, 0.6 + noise1(lt * 0.17, 7) * 0.2, 10.5 - push * 0.15);
    f.cam.lookAt(0, 0, 0);
    f.post.bloom = 0.7 + m.env('band', t) * 0.3;
  }
}
