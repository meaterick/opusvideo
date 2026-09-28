// SHOTS 3-4 · the document (docs/V2_SHOTS.md)
//
// 3 · MULTIPLY (15.040-18.620)  reading large amounts of context
// 4 · CONTEXT  (18.620-23.611)  reading and understanding context; trying
//
// The line straightened in shot 2 arrives as the underline of "hard parts".
// On "parts" it breaks into three.  On "multiply" the word lands in porcelain
// and its echoes double into depth on every beat of the held note (the only
// camera move reveals the stack).  The echoes are then pulled forward and
// flattened into rows of compressed text inside a window: the strata become
// the context.  CONTEXT slams in at exactly the window's inner width and the
// cursor, turned horizontal, reads down through it.  "let it try" is the
// cursor's first output line.  From the band's return the rails close on
// every 8th note, pulling everything into themselves, until one ember stroke
// stands still before CALL.
import * as THREE from 'three';
import { Shot, type BuildCtx, type F2 } from '../shot';
import type { Music } from '../../engine/data';
import type { Cues } from '../cues';
import { COL, Lighting, emissive, flat, graphite, porcelain } from '../materials';
import { GlyphWord, layout, fontOf } from '../glyphs';
import { Ribbon } from '../lines';
import { Cursor2, blink2 } from '../cursor';
import { Rig } from '../rig';
import { DOC, STROKE, UNDERLINE_GAP, underlineSpan } from '../continuity';
import { typeTimes, reveal, caretAfter } from './common';
import { clamp01, hash2, inExpo, inOutCubic, lerp, outExpo, prog, springOver, stepped } from '../motion';

const rig = new Rig(30, 20);
const LAYERS = 32;
const WIN = { left: 96, right: 1824, top: 236, bottom: 844 };  // context window (px)
const INK = new THREE.Color('#59616e');

export class DocumentShot extends Shot {
  readonly id = 'document';
  readonly capability = 'reading and understanding large amounts of context · trying';
  lighting = new Lighting(16, 1.15);
  priority = 1;
  private cursor = new Cursor2();
  private doc!: GlyphWord; private docTimes: number[] = [];
  private under: Ribbon[] = [];
  private mult!: GlyphWord;
  private echoes: THREE.InstancedMesh[] = []; private echoLines!: THREE.InstancedMesh;
  private counters: GlyphWord[] = []; private counterLabel!: GlyphWord;
  private rails: Ribbon[] = []; private corners: Ribbon[] = [];
  private give!: GlyphWord; private giveTimes: number[] = [];
  private ctx!: GlyphWord;
  private tryLine!: GlyphWord; private tryTimes: number[] = [];
  private tick!: THREE.Mesh;
  private stroke!: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  private span = { x0: 0, x1: 0, y: 0 };
  private context: GlyphWord[] = [];
  constructor(m: Music, private c: Cues) { super(m); this.start = 15.04; this.end = 23.611; }

  build(_ctx: BuildCtx) {
    const g = this.group;
    g.add(this.lighting);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(200, 120), graphite(COL.graphite, 0.95));
    back.position.set(0, 0, -45);
    back.receiveShadow = true;
    g.add(back);
    this.lighting.keyDist = 34;

    // ---- the document line and its underline (continuity from shot 2)
    const tt = typeTimes(this.c, 'When the hard', 0, 4);
    this.doc = new GlyphWord(tt.text, DOC.font, rig.cap(DOC.px), porcelain());
    this.doc.position.set(rig.x(DOC.left), rig.y(DOC.baseline), 0);
    this.docTimes = tt.times;
    g.add(this.doc);
    // the rest of the document: the hard parts of this very job (micro detail)
    const facts = [
      'tempo drifts 132.1 → 135.3 BPM over 170 s', 'stem offset +23.0 ms (encoder delay)',
      'whisper puts line starts ~0.4 s early', 'OPUS: vowel 24.417 s, band lands 24.582 s',
      'JetBrains 8: two self-crossing contours', 'CTC vs whisper: median offset 80 ms', '4K × 1,135 frames × 12–108 samples',
    ];
    const rows = [-6, -5, -4, -3, 2, 3, 4];
    facts.forEach((txt, i) => {
      const w = new GlyphWord(txt, 'sans100-500', rig.cap(48), flat(new THREE.Color(i % 2 ? '#30353e' : '#383e48')));
      w.position.set(rig.x(DOC.left), rig.y(DOC.baseline + rows[i] * 84), -0.02);
      this.context.push(w); g.add(w);
    });
    const us = underlineSpan(tt.text, 2);
    this.span = { x0: rig.x(us.x0), x1: rig.x(us.x1), y: rig.y(us.y) };
    for (let k = 0; k < 3; k++) {
      const r = new Ribbon(emissive(COL.mint, 1.35), rig.px(5), undefined, 4);
      this.under.push(r); g.add(r);
    }

    // ---- MULTIPLY (front, extruded) + its echoes (flat, instanced per glyph)
    this.mult = new GlyphWord('MULTIPLY', 'sans75-700', rig.px(300), porcelain(), { tracking: -10 }, { depth: 0.6, bevel: rig.px(4) });
    this.mult.position.set(rig.x(DOC.left), rig.y(DOC.baseline), 0);
    g.add(this.mult);
    const flatWord = new GlyphWord('MULTIPLY', 'sans75-700', rig.px(300), flat(COL.porcelain), { tracking: -10 });
    flatWord.meshes.forEach((mesh, i) => {
      const inst = new THREE.InstancedMesh(mesh.geometry, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), LAYERS + 1);
      inst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array((LAYERS + 1) * 3), 3);
      inst.userData.baseX = flatWord.baseX(i);
      inst.frustumCulled = false;
      this.echoes.push(inst); g.add(inst);
    });
    this.echoLines = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 0.001), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), LAYERS + 1);
    this.echoLines.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array((LAYERS + 1) * 3), 3);
    this.echoLines.frustumCulled = false;
    g.add(this.echoLines);
    // stepped layer counter
    for (const n of [1, 2, 4, 8, 16, 32]) {
      const w = new GlyphWord(`×${n}`, 'mono500', rig.cap(56, 0.73), flat(COL.porcelain));
      w.position.set(rig.x(1824) - w.width, rig.y(946), 0.3);
      this.counters.push(w); g.add(w);
    }
    this.counterLabel = new GlyphWord('layers in context', 'mono500', rig.cap(30, 0.73), flat(COL.annotation));
    this.counterLabel.position.set(rig.x(1824) - this.counterLabel.width, rig.y(990), 0.3);
    g.add(this.counterLabel);

    // ---- the context window
    for (const x of [WIN.left, WIN.right]) {
      const r = new Ribbon(flat(COL.porcelain), rig.px(4), undefined, 4).setPoints([new THREE.Vector3(rig.x(x), rig.y(WIN.top), 0.02), new THREE.Vector3(rig.x(x), rig.y(WIN.bottom), 0.02)]);
      this.rails.push(r); g.add(r);
    }
    const L = rig.px(28);
    for (const [x, y, sx, sy] of [[WIN.left, WIN.top, 1, -1], [WIN.right, WIN.top, -1, -1], [WIN.left, WIN.bottom, 1, 1], [WIN.right, WIN.bottom, -1, 1]] as const) {
      const X = rig.x(x) + sx * rig.px(12), Y = rig.y(y) + sy * rig.px(12);
      const r = new Ribbon(flat(COL.annotation), rig.px(2), undefined, 4).setPoints([new THREE.Vector3(X + sx * L, Y, 0.02), new THREE.Vector3(X, Y, 0.02), new THREE.Vector3(X, Y + sy * L, 0.02)]);
      this.corners.push(r); g.add(r);
    }
    const gt = typeTimes(this.c, 'Give it context', 0, 2);
    this.give = new GlyphWord(gt.text, 'mono500', rig.cap(56, 0.73), flat(COL.porcelain));
    this.give.position.set(rig.x(WIN.left + 40), rig.y(WIN.top + 40) - rig.cap(56, 0.73), 0.3);
    this.giveTimes = gt.times;
    g.add(this.give);
    // CONTEXT fitted to the inner width (tracking set per shot)
    const inner = WIN.right - WIN.left - 80;
    const Lc = layout('sans75-700', 'CONTEXT', { tracking: 4 });
    const capC = (inner / Lc.width) * fontOf('sans75-700').kern.capHeight; // px
    this.ctx = new GlyphWord('CONTEXT', 'sans75-700', rig.px(capC), porcelain(), { tracking: 4 }, { depth: 0.45, bevel: rig.px(3) });
    this.ctx.position.set(rig.x(WIN.left + 40), rig.y(716), 0.2);
    g.add(this.ctx);
    const yt = typeTimes(this.c, 'Give it context', 3, 6);
    this.tryLine = new GlyphWord(yt.text, 'mono500', rig.cap(56, 0.73), flat(COL.porcelain));
    this.tryLine.position.set(rig.x(WIN.left + 40), rig.y(WIN.bottom - 40), 0.3);
    this.tryTimes = yt.times;
    g.add(this.tryLine);
    this.tick = new THREE.Mesh(new THREE.BoxGeometry(rig.px(26), rig.px(5), 0.01), emissive(COL.mint, 5));
    g.add(this.tick);
    this.stroke = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.05), emissive(COL.ember, 6));
    g.add(this.stroke);
    g.add(this.cursor);
  }

  update(f: F2) {
    const t = f.t, c = this.c, m = this.m;
    const tParts = c.on('When the hard', 3), tMult = c.on('When the hard', 4);
    const tGive = c.on('Give it context', 0), tCtx = c.on('Give it context', 2), tTry = c.on('Give it context', 5);
    const tLet = c.on('Give it context', 3);
    const tBuild = 20.985, tCollapse = 23.55;
    const tRise = 18.2, tFold = 18.62, tFolded = 19.0;
    const bp = m.beat(t);

    // ---------------- camera: frontal (matches shot 2); one motivated move
    const rise = inOutCubic(prog(t, tRise, tFold));
    const back = inOutCubic(prog(t, tFold, tFolded));
    const k = rise * (1 - back);
    f.cam.fov = 30;
    f.cam.position.set(lerp(1.2, 4.2, k), lerp(0.9, 6.2, k), lerp(20, 25, k));
    f.cam.lookAt(0, lerp(0, -0.8, k), lerp(0, -9, k));
    if (t >= tFolded) { f.cam.position.set(0, 0, 20); f.cam.lookAt(0, 0, 0); }
    else if (back > 0) { f.cam.position.lerp(new THREE.Vector3(0, 0, 20), back); f.cam.lookAt(0, 0, 0); }
    f.lightTarget.set(0, 0, 0);
    this.lighting.poolOffset.set(-1.5, 1, 0);

    // ---------------- the document line
    const last = reveal(this.doc, t, this.docTimes);
    const docOut = outExpo(prog(t, tMult - 0.02, tMult + 0.2));
    // gone the moment MULTIPLY starts its slam (20 ms before the onset):
    // fragments between its letters read as a collision (the echoes carry
    // the depth from here)
    this.doc.visible = t < tMult - 0.02;
    this.doc.position.z = -docOut * 3;
    this.context.forEach((w, i) => {
      const on = outExpo(prog(t, 15.1 + i * 0.05, 15.5 + i * 0.05));
      w.visible = on > 0.01 && t < tMult + 0.2;
      w.position.z = -0.02 - docOut * (3 + i * 0.4);
      w.scale.setScalar(on > 0 ? 1 : 0.001);
    });
    // underline: mint (carried in) cools to porcelain ink; breaks into three on "parts"
    const cool = clamp01((t - 15.1) / 0.4);
    const brk = springOver(t - tParts, 26, 0.55);
    const gapW = rig.px(34) * brk;
    const segs = [0, 1, 2].map((s) => {
      const a = lerp(this.span.x0, this.span.x1, s / 3), b = lerp(this.span.x0, this.span.x1, (s + 1) / 3);
      return [a + (s > 0 ? gapW / 2 : 0), b - (s < 2 ? gapW / 2 : 0)];
    });
    this.under.forEach((r, s) => {
      const drop = s === 1 ? brk * rig.px(10) : 0;
      r.setPoints([new THREE.Vector3(segs[s][0], this.span.y - drop, 0.01), new THREE.Vector3(segs[s][1], this.span.y - drop, 0.01)]).draw(1);
      (r.material as THREE.MeshBasicMaterial).color.copy(COL.mint).multiplyScalar(1.35).lerp(COL.porcelainShade, cool);
      r.visible = t < tMult - 0.02;
    });

    // ---------------- MULTIPLY and its echoes
    const multOn = t >= tMult - 0.02;
    this.mult.visible = multOn && t < tFolded;
    const slam = springOver(t - tMult + 0.02, 30, 0.5);
    this.mult.position.z = (1 - slam) * 2.5;
    // layers double on each beat of the held note: x1 x2 x4 x8 x16 x32
    const beatsIn = [tMult, m.snap(tMult + 0.5), m.snap(tMult + 0.5) + m.P, m.snap(tMult + 0.5) + 2 * m.P, m.snap(tMult + 0.5) + 3 * m.P, 18.5];
    let gen = 0;
    for (let i = 0; i < beatsIn.length; i++) if (t >= beatsIn[i]) gen = i;
    const n = multOn ? Math.pow(2, gen) : 0;
    const bornAt = (layer: number) => { for (let i = 0; i < beatsIn.length; i++) if (layer < Math.pow(2, i)) return beatsIn[i]; return 99; };
    // fold into the window: echoes come forward (inExpo) and flatten into rows
    const fold = inExpo(prog(t, tFold, tFolded));
    const rowY = (layer: number) => rig.y(WIN.top + 70 + (layer / LAYERS) * (WIN.bottom - WIN.top - 150));
    const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    // build: rails close on every 8th note from the band's return
    // Steps and the ease inside each step share one grid: the 8th notes
    // from the first one at/after tBuild.  (Counting steps from tBuild but
    // easing on the absolute half-beat grid made closeU run backwards on
    // every step: the window re-opened and the cursor double-exposed.)
    const k0 = Math.ceil(m.beat(tBuild) * 2 - 1e-6) / 2;
    const hb = (m.beat(t) - k0) * 2;
    const eighths = hb < 0 ? 0 : Math.floor(hb) + 1;
    const total = Math.max(1, Math.floor((m.beat(tCollapse) - k0) * 2));
    const within = hb < 0 ? 0 : inExpo(clamp01((hb - Math.floor(hb)) * 1.4));
    const closeU = t < tBuild ? 0 : clamp01((Math.min(eighths, total) - 1 + (eighths > total ? 1 : within)) / total);
    const closeE = inExpo(closeU) * 0.35 + closeU * 0.65;
    const xL = lerp(rig.x(WIN.left), rig.x(STROKE.x), closeE), xR = lerp(rig.x(WIN.right), rig.x(STROKE.x), closeE);
    for (let layer = 0; layer <= LAYERS; layer++) {
      const alive = layer >= 1 && layer < n + 1 && t < tCollapse;
      const born = bornAt(layer - 1);
      const b = outExpo(prog(t, born, born + 0.3));
      const zStack = -(layer * 0.85) * b;
      const yStack = rig.y(DOC.baseline) + layer * rig.px(7) * b;
      const y = lerp(yStack, rowY(layer), fold), z = lerp(zStack, -0.25, fold);
      const sy = lerp(1, 0.032, fold);
      const rowShift = fold * (hash2(layer, 7) - 0.3) * rig.px(260);
      const rowLen = 3 + Math.floor(hash2(layer, 11) * 6); // glyphs kept in this row
      const shade = 1 - Math.min(0.85, layer / LAYERS * 1.3);
      col.copy(COL.porcelain).multiplyScalar(0.55 * shade + 0.05).lerp(INK, fold * 0.55);
      this.echoes.forEach((inst, gi) => {
        const x = rig.x(DOC.left) + inst.userData.baseX + rowShift;
        const inside = x > xL - rig.px(40) && x < xR + rig.px(10);
        const kept = fold < 0.5 || gi < rowLen;
        const sc = alive && kept && (t < tBuild || inside) && closeU < 0.85 ? 1 : 0;
        p.set(x, y, z); s.set(sc, sy * sc, 1);
        mat.compose(p, q, s);
        inst.setMatrixAt(layer, mat);
        inst.setColorAt(layer, col);
      });
      // echo underline
      const ux0 = rig.x(DOC.left), ux1 = ux0 + this.mult.width;
      const cx = Math.max(ux0, xL), cx1 = Math.min(ux1, xR);
      const lw = alive && cx1 > cx && closeU < 0.85 ? cx1 - cx : 0;
      p.set((cx + cx1) / 2, y - rig.px(UNDERLINE_GAP) * (1 - fold), z); s.set(Math.max(1e-4, lw), rig.px(3), 1);
      mat.compose(p, q, s);
      this.echoLines.setMatrixAt(layer, mat);
      this.echoLines.setColorAt(layer, col.clone().multiplyScalar(0.8));
    }
    for (const inst of [...this.echoes, this.echoLines]) { inst.instanceMatrix.needsUpdate = true; inst.instanceColor!.needsUpdate = true; }
    this.counters.forEach((w, i) => { w.visible = multOn && i === gen && t < tFold; });
    this.counterLabel.visible = multOn && t < tFold;

    // ---------------- the window
    const railsIn = outExpo(prog(t, tFold + 0.1, tFolded));
    this.rails[0].setPoints([new THREE.Vector3(xL, rig.y(WIN.top), 0.02), new THREE.Vector3(xL, rig.y(WIN.bottom), 0.02)]).draw(railsIn);
    this.rails[1].setPoints([new THREE.Vector3(xR, rig.y(WIN.top), 0.02), new THREE.Vector3(xR, rig.y(WIN.bottom), 0.02)]).draw(railsIn);
    const railsVisible = t > tFold && t < tCollapse;
    this.rails.forEach((r) => { r.visible = railsVisible && railsIn > 0.001; });
    this.corners.forEach((r, i) => { r.draw(Math.max(1e-4, outExpo(prog(t, tFolded - 0.1 + i * 0.03, tFolded + 0.15 + i * 0.03)))); r.visible = r.visible && railsVisible && t > tFolded - 0.1 && closeU < 0.05; });
    const lg = reveal(this.give, t, this.giveTimes);
    this.give.visible = t > tGive - 0.05 && closeU < 0.2;
    // CONTEXT slams in; letters are pulled into the closing rails
    const ctxOn = t >= tCtx - 0.02;
    const cs = springOver(t - tCtx + 0.02, 32, 0.5);
    this.ctx.visible = ctxOn && t < tCollapse;
    this.ctx.position.z = 0.2 + (1 - cs) * 3;
    this.ctx.glyphs.forEach((gg, i) => {
      const cxw = this.ctx.position.x + this.ctx.centerX(i);
      const outL = xL - cxw, outR = cxw - xR;
      const pull = inExpo(clamp01(Math.max(outL, outR, -1) / rig.px(60) + 0.5));
      const toX = outL > outR ? xL : xR;
      gg.position.x = lerp(this.ctx.baseX(i), toX - this.ctx.position.x - this.ctx.advance(i) / 2, pull);
      gg.scale.set(1 - pull, 1, 1);
      gg.visible = pull < 0.98;
    });
    // "let it try": the cursor's first output line
    const ly = reveal(this.tryLine, t, this.tryTimes);
    this.tryLine.visible = t > tLet - 0.05 && closeU < 0.3;
    this.tick.visible = t > tTry && closeU < 0.3;
    this.tick.position.set(this.tryLine.position.x + caretAfter(this.tryLine, this.tryLine.glyphs.length - 1) + rig.px(24), this.tryLine.position.y + rig.px(20), 0.32);
    // the stroke: at the end of the build the rails are one ember line
    // lit only once the rails have met (the last 8th's ease is done), so the
    // stroke never shows beside a still-open window
    const tClosed = m.beatTime(k0 + (total - 1) / 2) + (m.P / 2) / 1.4;
    const merge = outExpo(prog(t, tClosed, tClosed + 0.08));
    this.stroke.visible = merge > 0.001;
    this.stroke.scale.set(rig.px(12), rig.y(STROKE.top) - rig.y(STROKE.bottom), 1);
    this.stroke.position.set(rig.x(STROKE.x), (rig.y(STROKE.top) + rig.y(STROKE.bottom)) / 2, 0.05);
    this.stroke.material.color.copy(COL.ember).multiplyScalar(6 * merge);

    // ---------------- the cursor
    const read0 = tCtx + 0.06, read1 = tCtx + 0.4;
    if (t < tMult) {
      const x = this.doc.position.x + caretAfter(this.doc, last) + rig.px(10);
      this.cursor.pose({ x, y: this.doc.position.y + rig.cap(DOC.px) / 2, z: 0.1, h: rig.px(130), notches: 2, opacity: last === this.doc.glyphs.length - 1 ? blink2(bp) : 1 });
    } else if (t < tFold) {
      const x = this.mult.position.x + this.mult.width + rig.px(18);
      this.cursor.pose({ x, y: this.mult.position.y + rig.px(150), z: this.mult.position.z + 0.3, h: rig.px(270), notches: 2, opacity: blink2(bp) });
    } else if (t < read0) {
      const x = this.give.position.x + caretAfter(this.give, lg) + rig.px(10);
      this.cursor.pose({ x, y: this.give.position.y + rig.px(20), z: 0.35, h: rig.px(60), notches: 2, opacity: t > tGive ? 1 : blink2(bp) });
    } else if (t < read1 + 0.08) {
      // reading line: horizontal, sweeps down through CONTEXT
      const u = inOutCubic(prog(t, read0, read1));
      const y = lerp(this.ctx.position.y + this.ctx.capHeight + rig.px(16), this.ctx.position.y - rig.px(16), u);
      this.cursor.pose({ x: (xL + xR) / 2, y, z: 0.9, h: (xR - xL) - rig.px(40), w: rig.px(6), rotZ: Math.PI / 2, notches: 0, intensity: 5 });
    } else if (t < tBuild) {
      const ty = t >= tTry ? stepped(prog(t, tTry, tTry + 0.05), 1) * rig.px(48) : 0;
      const x = this.tryLine.position.x + caretAfter(this.tryLine, ly) + rig.px(10);
      this.cursor.pose({ x, y: this.tryLine.position.y + rig.px(20) + ty, z: 0.35, h: rig.px(60), notches: 3, opacity: t > tLet ? (ly === this.tryLine.glyphs.length - 1 && t > tTry + 0.3 ? blink2(bp) : 1) : blink2(bp) });
    } else {
      // pulled along by the closing window; becomes the stroke
      const x = xR - rig.px(30) * (1 - closeE); // rides the right rail, pulling the window shut
      this.cursor.pose({ x, y: rig.y(540), z: 0.35, h: lerp(rig.px(60), rig.px(780), inExpo(closeU)), w: rig.px(12), notches: 3, opacity: merge > 0.9 ? 0 : 1 });
    }
    f.post.halation = 0.13;
  }
}
