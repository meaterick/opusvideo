// CONTEXT — pre-chorus 1 (the transition).  Capability: reading and
// understanding large amounts of context.
//
//   "When the hard"    the packed block from SYSTEM tilts up to face us (the band drops out)
//   "parts"            the 6 parts split into 24 pages
//   "multiply"         pages multiply on every beat of the held note (24 -> 1536),
//                      the camera pulls back; the word itself is tiled across the wall
//   "Give it context," the caret turns horizontal and reads down the wall, pages it
//                      passes light up; CONTEXT is written across the wall
//   "let it try"       the caret stands up again
//   build (band back)  the wall is drawn into the caret, faster on each beat
//   stop               black frame, only the caret (hands over to ARTIFACT)
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import type { Music, Word } from '../engine/data';
import { LyricLine } from '../engine/lyricline';
import { Caret, blink } from '../engine/motif';
import { PAL, hot } from '../engine/palette';
import { TextMesh } from '../engine/type';
import { clamp, easeIn, easeInOut, easeOut, hash, invLerp, lerp, smooth, easeBack } from '../engine/util';

const COLS = 48, ROWS = 32, N = COLS * ROWS; // final wall: 1536 pages

function pageTexture() {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 160;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#fff';
  c.fillRect(0, 0, 128, 160);
  c.fillStyle = '#000';
  // "text lines" of a page: deterministic lengths
  for (let i = 0; i < 12; i++) {
    const w = 60 + Math.floor(hash(i * 7 + 3) * 50);
    c.globalAlpha = 0.55;
    c.fillRect(14, 18 + i * 11, i % 5 === 4 ? w * 0.5 : w, 5);
  }
  c.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

export class ContextScene extends Scene {
  readonly id = 'context';
  readonly capability = 'reading and understanding large amounts of context';
  priority = 1;
  lines: LyricLine[] = [];
  pages!: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  echoes: TextMesh[] = [];
  big!: TextMesh;
  caret = new Caret();
  readLine!: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private w: (li: number, wi: number) => Word;
  constructor(m: Music, readonly lineIdx: number[], start: number, end: number, readonly stopAt: number) {
    super(m);
    this.start = start; this.end = end;
    this.w = (li, wi) => this.lines[li].words[wi].w;
  }

  build() {
    const g = this.group;
    this.pages = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1.25), new THREE.MeshBasicMaterial({ map: pageTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide }), N);
    this.pages.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    this.pages.frustumCulled = false;
    g.add(this.pages);
    // echoes of "multiply" (the word literally multiplies)
    for (let i = 0; i < 16; i++) {
      const e = new TextMesh('multiply', { font: 'display', weight: 700 }, 0.5, 'center');
      this.echoes.push(e);
      g.add(e);
    }
    this.big = new TextMesh('CONTEXT', { font: 'display', weight: 700, tracking: 0.12 }, 3.2, 'center');
    g.add(this.big);
    this.readLine = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: hot(PAL.ember, 1.0), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(this.readLine);
    for (const li of this.lineIdx) {
      const l = new LyricLine(this.m.line(li), { font: 'display', weight: 500 }, 0.6, 'left');
      this.lines.push(l);
      g.add(l);
    }
    g.add(this.caret);
  }

  update(f: Frame) {
    const { t, m } = f;
    const W = this.w;
    const bp = m.beat(t);
    const tHard = W(0, 2).start, tParts = W(0, 3).start, tMult = W(0, 4).start, tMultEnd = W(0, 4).end;
    const tGive = W(1, 0).start, tContext = W(1, 2).start, tContextEnd = W(1, 2).end, tLet = W(1, 3).start, tTryEnd = W(1, 5).end;
    const tBuild = m.a.energy_events.find((e) => e.kind === 'rise' && e.t > tTryEnd - 0.5 && e.t < this.end)?.t ?? tTryEnd + 0.3;
    const tStop = this.stopAt;

    // ---------- camera first (labels billboard to it)
    const tilt = easeInOut(invLerp(this.start, tHard + 0.3, t)); // 0: looking down at the plan, 1: facing the wall
    const pull = easeInOut(invLerp(tMult - 0.2, tMultEnd + 0.4, t), 2);
    const suck = easeIn(invLerp(tBuild, tStop, t), 2.2);
    const dist = lerp(lerp(8.6, 7.2, tilt), 17.5, pull) * lerp(1, 0.55, suck) - m.barPulse(t, 0.3) * 0.2;
    f.cam.position.set(0, lerp(3.0, 0.2, tilt), dist);
    f.cam.lookAt(0, lerp(-0.9, 0, tilt), 0);
    f.cam.fov = 35 + suck * 12;
    const camQ = f.cam.quaternion.clone();

    // ---------- pages: packed block (6) -> 24 -> multiplying -> wall -> drawn into the caret
    // generation count: 6 until "parts", 24 after, then x4 on each beat of "multiply"
    const multBeats = Math.max(0, Math.floor(m.beat(t) - m.beat(tMult - 0.02)) + 1);
    let count = t < tParts ? 6 : t < tMult ? 24 : Math.min(N, 24 * Math.pow(4, Math.min(3, multBeats)));
    const gen = t < tParts ? 0 : t < tMult ? 1 : 1 + Math.min(3, multBeats);
    const since = t - (gen <= 1 ? (gen === 0 ? this.start : tParts) : m.beatTime(Math.floor(m.beat(tMult - 0.02)) + gen - 1));
    const split = easeBack(clamp(since / 0.22), 1.4); // pop into place after each split
    // wall layout for this generation: cols x rows grid centred at 0
    const layouts = [[3, 2], [6, 4], [12, 8], [24, 16], [48, 32]];
    const [gc, gr] = layouts[gen];
    const [pc, pr] = layouts[Math.max(0, gen - 1)];
    const wallW = lerp(2.9, 30, easeOut(clamp((gen - 1 + split) / 4), 1.5));
    const cellW = wallW / gc, prevCellW = wallW / pc;
    const reading = invLerp(tGive - 0.1, tTryEnd, t);
    const readY = lerp(0.62, -0.62, easeInOut(invLerp(tContext - 0.35, tLet, t), 2)); // normalised wall y of the reading line
    const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    const kick = m.pulse('kick', t, 0.09), hat = m.pulse('hat', t, 0.05);
    const qFlat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 * (1 - tilt), 0, 0));
    for (let i = 0; i < N; i++) {
      if (i >= count) { mat.makeScale(0, 0, 0); this.pages.setMatrixAt(i, mat); continue; }
      const cx = i % gc, cy = Math.floor(i / gc);
      const x = (cx - (gc - 1) / 2) * cellW, y = ((gr - 1) / 2 - cy) * cellW * 1.25;
      // where this page's parent sat in the previous generation (it splits out of it)
      const ratio = gc / pc;
      const px = (Math.floor(cx / ratio) - (pc - 1) / 2) * prevCellW, py = ((pr - 1) / 2 - Math.floor(cy / ratio)) * prevCellW * 1.25;
      const k = gen === 0 ? 1 : split;
      p.set(lerp(px, x, k), lerp(py, y, k), 0);
      // packed block lies on the plan before it tilts up
      if (gen === 0) p.set(x, lerp(-1.2 + 0.3, 0, tilt) + y * tilt, -y * (1 - tilt) * 1.0 + 0.0);
      // suck into the caret during the build: each page leaves on its own beat
      const hi = hash(i + 17);
      const leave = easeIn(clamp((suck * 1.35 - hi * 0.35)), 3);
      p.multiplyScalar(1 - leave);
      p.z += leave * lerp(0, 3.5, hi) + Math.sin(i * 1.7) * 0.02 * gen;
      const sz = cellW * 0.86 * (1 - leave * 0.9) * (gen === 0 ? 1 : lerp(1, 1, k));
      q.copy(qFlat);
      s.set(sz, sz, 1);
      mat.compose(p, q, s);
      this.pages.setMatrixAt(i, mat);
      // colour: graphite pages; read pages light up as the reading line passes
      const wallYn = y / Math.max(1e-3, (gr * cellW * 1.25) / 2);
      const read = reading > 0 && wallYn > readY ? smooth((wallYn - readY) / 0.08) * clamp(reading * 4) : 0;
      const nearLine = reading > 0 && reading < 1 ? Math.exp(-Math.abs(wallYn - readY) * 45) : 0;
      col.copy(PAL.graphite).multiplyScalar(0.55 + 0.3 * hash(i * 3 + 1));
      // read pages warm up a little; a few "relevant" ones stay lit ember
      const relevant = hash(i * 29 + 4) > 0.93 ? 1 : 0;
      col.lerp(PAL.slate, read * 0.55);
      col.lerp(hot(PAL.ember, 1.1), read * relevant * 0.8);
      col.lerp(hot(PAL.ember, 1.5), nearLine * 0.55);
      if (gen === 0) col.copy(PAL.inkLift).lerp(PAL.ember, 0.35 + 0.25 * kick);
      // leaving pages turn ember as they fall into the caret
      col.lerp(PAL.ember, leave * 0.7);
      col.multiplyScalar((1 + hat * 0.25 * hi) * (1 + leave * 1.2));
      this.pages.setColorAt(i, col);
    }
    this.pages.count = N;
    this.pages.instanceMatrix.needsUpdate = true;
    this.pages.instanceColor!.needsUpdate = true;
    this.pages.material.opacity = 1 - smooth(invLerp(tStop - 0.25, tStop, t));

    // ---------- "multiply" echoes: 1 -> 2 -> 4 -> 8 -> 16 copies across the wall
    const mw = W(0, 4);
    const nEcho = t < mw.start ? 0 : Math.min(16, Math.pow(2, Math.min(4, multBeats)));
    this.echoes.forEach((e, i) => {
      const on = i < nEcho && i > 0 && t < tGive + 0.2;
      const ex = ((i % 4) - 1.5) * 4.2 + (Math.floor(i / 4) % 2) * 1.2, ey = (1.5 - Math.floor(i / 4)) * 1.85;
      const born = easeOut(clamp((t - m.beatTime(Math.floor(m.beat(mw.start)) + Math.ceil(Math.log2(i + 1)))) / 0.2));
      e.position.set(ex * born, ey * born, 0.2);
      e.quaternion.copy(camQ);
      e.set(PAL.slate.clone().lerp(PAL.ember, 0.4), on ? 0.45 * born * (1 - smooth(invLerp(tGive - 0.3, tGive + 0.2, t))) : 0, 1, 0.2);
    });

    // ---------- the lyric lines: typed near the centre, in front of the wall
    const lineY = [lerp(-1.95, 0.0, 1), -0.2];
    let caretPos = new THREE.Vector3(), typing = false, doneCur = false;
    let cur = 0;
    this.lines.forEach((l, i) => { if (l.started(t)) cur = i; });
    // visible width of the frame at depth z (camera looks down -z)
    const visW = (z: number) => 2 * Math.tan((f.cam.fov * Math.PI) / 360) * Math.max(0.5, f.cam.position.z - z) * f.aspect;
    this.lines.forEach((l, i) => {
      const vis = i === cur ? 1 - smooth(invLerp(i === 0 ? tGive - 0.25 : tBuild + 0.3, i === 0 ? tGive : tBuild + 0.9, t)) : 0;
      // line 0 rides the wall back (it is part of the context), line 1 stays in front
      const z = i === 0 ? lerp(1.2, 0.4, pull) : 2.0;
      // scale so the whole line fits in 80% of the frame width
      const sc = Math.min(i === 0 ? lerp(1, 2.2, pull) : 1, (0.8 * visW(z)) / l.width);
      l.scale.setScalar(sc);
      l.position.set(-l.width * sc / 2, lineY[i] * (i === 0 ? 1 : 1) + (i === 0 ? -1.1 * (1 - tilt) : -2.4), z);
      l.quaternion.copy(camQ);
      const r = l.update(t, { opacity: vis });
      if (i === cur) {
        caretPos.set(l.position.x + r.caretX * sc, l.position.y + 0.2 * sc, z);
        typing = r.typing; doneCur = l.done(t);
      }
    });
    // "multiply" word in line 0 pulses with the splits
    const mulMesh = this.lines[0].words[4].mesh;
    mulMesh.scale.setScalar(1 + 0.12 * m.beatPulse(t, 0.12) * (t > mw.start && t < mw.end ? 1 : 0));

    // ---------- CONTEXT across the wall
    const cw = W(1, 2);
    const cRv = clamp((t - (cw.start - 0.05)) / 0.5);
    const cFade = 1 - smooth(invLerp(tLet - 0.1, tBuild, t));
    this.big.position.set(0, 0.2, 0.6);
    this.big.quaternion.copy(camQ);
    const cSettle = clamp((t - tContextEnd) / 0.5);
    this.big.set(hot(PAL.ember, 1.3).lerp(PAL.paper, cSettle * 0.6), 0.9 * cFade, cRv, 0.5 * (1 - cSettle));

    // ---------- the caret: cursor -> horizontal reading line -> cursor -> the point everything falls into
    const readBlend = smooth(invLerp(tContext - 0.35, tContext - 0.1, t)) * (1 - smooth(invLerp(tLet - 0.1, tLet + 0.15, t)));
    const wallH = (gr * cellW * 1.25);
    this.readLine.visible = readBlend > 0.01;
    if (readBlend > 0.001) {
      const ly = readY * wallH / 2;
      // rotate while short, then stretch across the wall (and the reverse on the way back)
      const rot = smooth(invLerp(0, 0.45, readBlend)), len = smooth(invLerp(0.45, 1, readBlend));
      this.caret.pose({ x: lerp(caretPos.x, 0, len), y: lerp(caretPos.y, ly, rot), z: 0.9, h: lerp(0.62, wallW * 1.02, len), w: 0.06, rotZ: Math.PI / 2 * rot, intensity: 2.4, glow: 0.35 });
      this.readLine.position.set(0, ly + 0.5, 0.85);
      this.readLine.scale.set(wallW, 1.0, 1);
      this.readLine.material.opacity = 0.08 * readBlend;
    } else {
      const toCenter = smooth(invLerp(tBuild - 0.2, tBuild + 0.6, t));
      const x = lerp(caretPos.x, 0, toCenter), y = lerp(caretPos.y, 0, toCenter);
      const grow = lerp(0.62, 1.1, toCenter) * (1 + suck * 0.4);
      const idle = !typing && doneCur;
      this.caret.pose({ x, y, z: lerp(2.0, 1.0, toCenter), h: grow, intensity: 1.9 + suck * 3 + kick * suck * 2, glow: 0.55 + suck * 0.6, opacity: idle && toCenter < 0.5 ? blink(bp) : 1 });
    }

    // ---------- post: breakdown is dim and clean, the build brightens and fringes
    f.post.bloom = 0.75 + suck * 0.9;
    f.post.fringe = 0.1 + suck * 0.8 * (0.5 + kick);
    f.post.exposure = 1 - smooth(invLerp(tStop - 0.2, tStop, t)) * 0.35;
  }
}
