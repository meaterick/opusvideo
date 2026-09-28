// SHOTS 1-2 · the drafting wall (docs/V2_SHOTS.md)
//
// 1 · LIVE     (11.033-13.250)  building a working system from a sketch
// 2 · OPTIMIZE (13.250-15.040)  testing and revising its own output
//
// One continuous space: a graphite wall.  The cursor drafts LIVE's
// construction on the wall; on "something" the letters extrude out of their
// own drawing as porcelain relief; on "live" a mint current runs the letters
// as one circuit, leaves the E and the camera whips along the wall with it to
// a wasteful routed path.  The cursor makes one more pass along the path;
// on "optimize" the path snaps straight, OPTIMIZE gathers and condenses onto
// it, and the line is left to become the underline of shot 3.
import * as THREE from 'three';
import { Shot, type BuildCtx, type F2 } from '../shot';
import type { Music } from '../../engine/data';
import type { Cues } from '../cues';
import { COL, Lighting, emissive, flat, graphite, porcelain, shared } from '../materials';
import { GlyphWord, glyphContours, layout, fontOf } from '../glyphs';
import { Ribbon } from '../lines';
import { Cursor2, blink2 } from '../cursor';
import { Rig } from '../rig';
import { underlineSpan, DOC } from '../continuity';
import { clamp01, hash, inExpo, inOutCubic, lerp, outExpo, prog, recoil, spring, springOver, stepped } from '../motion';

const rig = new Rig(30, 20);
const U = rig.unit;
const CX2 = 17;                         // frame centre of shot 2 on the wall
const SPREAD_SCALE = 0.82;              // OPTIMIZE's size before it is optimised
const G = rig.y(700);                   // LIVE baseline
const CAP = rig.px(380);                // LIVE cap height
const DEPTH = 0.8;                      // relief depth
const XL = rig.x(Rig.col(2));           // LIVE left edge
const YP = rig.y(760);                  // shot 2 path baseline
const HAIR = rig.px(2);                 // construction hairline
const INK = new THREE.Color('#59616e');  // construction graphite (lighter than the wall)
const INK2 = new THREE.Color('#7f8794');

export class WallShot extends Shot {
  readonly id = 'wall';
  readonly capability = 'building a working system · testing and revising its own output';
  lighting = new Lighting(14);
  private live!: GlyphWord;
  private liveBoxes: { minX: number; maxX: number; cx: number }[] = [];
  private cap!: Ribbon; private base!: Ribbon; private verticals: Ribbon[] = []; private dims: Ribbon[] = [];
  private outlines: Ribbon[][] = [];
  private title!: GlyphWord; private dimLabel!: GlyphWord; private dwg!: GlyphWord;
  private current!: Ribbon; private head!: Ribbon; private liveLoops: Ribbon[][] = [];
  private cursor = new Cursor2();
  // shot 2
  private opt!: GlyphWord; private path!: Ribbon; private pathPts: THREE.Vector3[] = []; private straight: THREE.Vector3[] = [];
  private ticks: THREE.Mesh[] = []; private detourX: number[] = [];
  private counters: GlyphWord[] = []; private counterLabel!: GlyphWord; private passLine!: GlyphWord;
  private spreadX: number[] = []; private spreadY: number[] = []; private tightX: number[] = [];
  private exitPts: THREE.Vector3[] = [];
  span = { sx0: 0, sx1: 0, lineY: 0, lx0: 0, lx1: 0 };
  constructor(m: Music, private c: Cues) { super(m); this.start = 11.033 - 0.2; this.end = 15.04; }

  build(_ctx: BuildCtx) {
    const g = this.group;
    g.add(this.lighting);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(80, 30), graphite(COL.graphite, 0.92));
    wall.position.set(10, 0, 0);
    wall.receiveShadow = true;
    g.add(wall);
    const inkMat = flat(INK), ink2Mat = flat(INK2);

    // ---- LIVE: porcelain relief glyphs
    this.live = new GlyphWord('LIVE', 'sans100-700', CAP, porcelain(), { tracking: -8 }, { depth: DEPTH, bevel: rig.px(4) });
    this.live.position.set(XL, G, 0);
    g.add(this.live);
    // glyph boxes (for the construction verticals)
    this.live.placed.forEach((p, i) => {
      const pts = glyphContours('sans100-700', p.ch, CAP).flat();
      const minX = Math.min(...pts.map((q) => q.x)) + this.live.baseX(i), maxX = Math.max(...pts.map((q) => q.x)) + this.live.baseX(i);
      this.liveBoxes.push({ minX: XL + minX, maxX: XL + maxX, cx: XL + (minX + maxX) / 2 });
    });
    // ---- construction: baseline rule, cap line, glyph-box verticals, dimension
    this.base = new Ribbon(inkMat, HAIR).setPoints([new THREE.Vector3(-14, G, 0.004), new THREE.Vector3(CX2 + 14, G, 0.004)]);
    this.cap = new Ribbon(inkMat, HAIR).setPoints([new THREE.Vector3(XL - rig.px(60), G + CAP, 0.004), new THREE.Vector3(this.liveBoxes[3].maxX + rig.px(60), G + CAP, 0.004)]);
    g.add(this.base, this.cap);
    // the sheet is already set up when the PoC opens: faint guides (cap line,
    // glyph boxes) that the pen then redraws in full ink
    const ghost = flat(new THREE.Color('#2a3038'));
    const ghostPts: THREE.Vector3[][] = [[new THREE.Vector3(XL - rig.px(60), G + CAP, 0.003), new THREE.Vector3(this.liveBoxes[3].maxX + rig.px(60), G + CAP, 0.003)]];
    for (const b of this.liveBoxes) for (const x of [b.minX, b.maxX]) ghostPts.push([new THREE.Vector3(x, G - rig.px(34), 0.003), new THREE.Vector3(x, G + CAP + rig.px(34), 0.003)]);
    for (const pts of ghostPts) g.add(new Ribbon(ghost, HAIR, undefined, 4).setPoints(pts).draw(1));
    for (const b of this.liveBoxes) for (const x of [b.minX, b.maxX]) {
      const r = new Ribbon(inkMat, HAIR).setPoints([new THREE.Vector3(x, G - rig.px(34), 0.004), new THREE.Vector3(x, G + CAP + rig.px(34), 0.004)]);
      this.verticals.push(r); g.add(r);
    }
    const dx = XL - rig.px(44);
    for (const pts of [[dx, G, dx, G + CAP], [dx - rig.px(10), G, dx + rig.px(10), G], [dx - rig.px(10), G + CAP, dx + rig.px(10), G + CAP]]) {
      const r = new Ribbon(ink2Mat, HAIR).setPoints([new THREE.Vector3(pts[0], pts[1], 0.004), new THREE.Vector3(pts[2], pts[3], 0.004)]);
      this.dims.push(r); g.add(r);
    }
    this.dimLabel = new GlyphWord('380', 'mono500', rig.cap(30, 0.73), flat(INK2));
    this.dimLabel.rotation.z = Math.PI / 2;
    this.dimLabel.position.set(dx - rig.px(22), G + CAP / 2 - this.dimLabel.width / 2, 0.004);
    g.add(this.dimLabel);
    this.dwg = new GlyphWord('DWG-011  LIVE  1:1', 'mono500', rig.cap(30, 0.73), flat(INK2));
    this.dwg.position.set(this.liveBoxes[3].maxX - this.dwg.width, G - rig.px(48) - rig.cap(56, 0.73) - rig.px(48) - rig.cap(30, 0.73), 0.004);
    g.add(this.dwg);
    // ---- glyph outlines (the sketch)
    this.live.placed.forEach((p, i) => {
      const loops = glyphContours('sans100-700', p.ch, CAP, 8).map((loop) => {
        const pts = loop.map((q) => new THREE.Vector3(XL + this.live.baseX(i) + q.x, G + q.y, 0.006));
        pts.push(pts[0].clone());
        const r = new Ribbon(flat(INK2), rig.px(2.5), undefined, loop.length + 4).setPoints(pts);
        g.add(r);
        return r;
      });
      this.outlines.push(loops);
    });
    // ---- title block: the lyric, typed as the drawing's title
    const tl = this.c.m.line(this.c.line('From a sketch'));
    const titleText = tl.words.slice(0, 5).map((w) => w.text).join(' ');
    this.title = new GlyphWord(titleText, 'mono500', rig.cap(56, 0.73), flat(COL.porcelain));
    this.title.position.set(XL, G - rig.px(48) - rig.cap(56, 0.73), 0.004);
    g.add(this.title);

    // ---- "live": the sketch contours re-light in mint on the relief faces,
    // letter by letter; the E's middle arm is where the current leaves
    this.live.placed.forEach((p, i) => {
      const loops = glyphContours('sans100-700', p.ch, CAP, 8).map((loop) => {
        const pts = loop.map((q) => new THREE.Vector3(XL + this.live.baseX(i) + q.x, G + q.y, DEPTH + 0.004));
        pts.push(pts[0].clone());
        const r = new Ribbon(emissive(COL.mint, 2.0), rig.px(5), undefined, loop.length + 4).setPoints(pts);
        g.add(r);
        return r;
      });
      this.liveLoops.push(loops);
    });
    const bE = this.liveBoxes[3];
    const armY = G + CAP * 0.5;
    const path0x = CX2 - 8.75;
    this.exitPts = [new THREE.Vector3(bE.maxX - rig.px(20), armY, DEPTH + 0.004), new THREE.Vector3(bE.maxX + rig.px(30), armY, DEPTH * 0.5), new THREE.Vector3(path0x - 0.8, armY, 0.004)];
    this.current = new Ribbon(emissive(COL.mint, 2.4), rig.px(5), undefined, 16).setPoints(this.exitPts);
    this.head = new Ribbon(emissive(COL.mint, 8), rig.px(7), undefined, 16).setPoints(this.exitPts);
    g.add(this.current, this.head);

    // ---- shot 2: OPTIMIZE on a wasteful path
    const capO = rig.px(260);
    this.opt = new GlyphWord('OPTIMIZE', 'sans100-700', capO, porcelain(), { tracking: -6 }, { depth: 0.5, bevel: rig.px(3.5) });
    this.opt.enableMorph('sans75-700', { tracking: -14 });
    g.add(this.opt);
    const nL = this.opt.placed.length;
    // unoptimised: the same word, wide (w100) with loose tracking so nothing
    // collides, every letter riding its own kink of the path (seeded +-70 px)
    const Ls = layout('sans100-700', 'OPTIMIZE', { tracking: 70 });
    const ss = (capO / fontOf('sans100-700').kern.capHeight) * SPREAD_SCALE;
    const sw = Ls.width * ss;
    const bob = [0.2, -0.75, 0.55, -0.3, 0.9, -0.55, 0.35, 0.7];
    for (let i = 0; i < nL; i++) {
      this.spreadX.push(CX2 - sw / 2 + (Ls.glyphs[i].x + Ls.glyphs[i].adv / 2) * ss);
      this.spreadY.push(YP + rig.px(26) + bob[i] * rig.px(70));
    }
    const span = sw;
    // tight layout (w75), centred on CX2
    const Lt = layout('sans75-700', 'OPTIMIZE', { tracking: -14 });
    const sc = capO / fontOf('sans75-700').kern.capHeight;
    const tw = Lt.width * sc;
    for (let i = 0; i < nL; i++) this.tightX.push(CX2 - tw / 2 + Lt.glyphs[i].x * sc);
    // path points: entry drop, then one detour (plateau) per letter plus three
    // letterless loops; y of each plateau = letter baseline - gap
    const gap = rig.px(26);
    const P: [number, number][] = [[path0x - 0.8, G + CAP * 0.5], [path0x, G + CAP * 0.5], [path0x, YP], [path0x + 0.15, YP], [path0x + 0.15, YP - rig.px(110)], [path0x + 0.45, YP - rig.px(110)], [path0x + 0.45, YP]];
    for (let i = 0; i < nL; i++) {
      const half = (Ls.glyphs[i].adv * ss) / 2 + rig.px(10);
      const a = this.spreadX[i] - half, b = this.spreadX[i] + half;
      const py = this.spreadY[i] - gap;
      P.push([a, YP], [a, py], [b, py], [b, YP]);
      this.detourX.push((a + b) / 2);
    }
    const endX = CX2 + span / 2 + 0.7;
    P.push([endX, YP], [endX, YP + rig.px(90)], [endX + 0.5, YP + rig.px(90)], [endX + 0.5, YP], [CX2 + 11, YP]);
    this.pathPts = P.map(([x, y]) => new THREE.Vector3(x, y, 0.005));
    // straightened: every vertex onto the line, x compressed into the span the
    // underline of shot 3 will occupy (in shot 2's frame)
    const us = underlineSpan(this.docText(), 2);
    const sx0 = rig.x(us.x0, CX2), sx1 = rig.x(us.x1, CX2);
    const lineY = rig.y(us.y, 0); // the underline height (shot 3 frame centre y = 0)
    const x0 = P[0][0], x1 = P[P.length - 1][0];
    const lx0 = CX2 - tw / 2 - rig.px(40), lx1 = CX2 + tw / 2 + rig.px(40);
    this.straight = this.pathPts.map((p) => new THREE.Vector3(lerp(lx0, lx1, (p.x - x0) / (x1 - x0)), YP, 0.005));
    this.span = { sx0, sx1, lineY, lx0, lx1 };
    this.path = new Ribbon(emissive(COL.mint, 1.35), rig.px(5), undefined, 128);
    g.add(this.path);
    for (let k = 0; k < this.detourX.length; k++) {
      const tk = new THREE.Mesh(new THREE.BoxGeometry(rig.px(4), rig.px(34), 0.02), emissive(COL.mint, 5));
      this.ticks.push(tk); g.add(tk);
    }
    // counter (stepped machine state)
    const cy = YP - rig.px(26) - rig.cap(56, 0.73) - rig.px(20);
    for (const v of ['412', '311', '190', '96', '38']) {
      const w = new GlyphWord(`${v} ms`, 'mono500', rig.cap(56, 0.73), flat(COL.porcelain));
      w.position.set(CX2 + 8.2 - w.width, cy, 0.004);
      this.counters.push(w); g.add(w);
    }
    this.counterLabel = new GlyphWord('p95 latency', 'mono500', rig.cap(30, 0.73), flat(INK2));
    this.counterLabel.position.set(CX2 + 8.2 - this.counterLabel.width, cy - rig.px(44), 0.004);
    g.add(this.counterLabel);
    const pl = this.c.m.line(this.c.line('One more pass'));
    this.passLine = new GlyphWord(pl.words.slice(0, 3).map((w) => w.text).join(' '), 'mono500', rig.cap(56, 0.73), flat(COL.porcelain));
    this.passLine.position.set(rig.x(Rig.col(2), CX2), cy, 0.004);
    g.add(this.passLine);
    g.add(this.cursor);
  }

  private docText() { const l = this.c.m.line(this.c.line('When the hard')); return l.words.slice(0, 4).map((w) => w.text).join(' '); }

  /** Reveal a GlyphWord character by character: stepped, one glyph per `per` s from t0. */
  private typeOn(w: GlyphWord, t: number, starts: number[]) {
    w.glyphs.forEach((gg, i) => { gg.visible = t >= starts[i]; });
  }

  update(f: F2) {
    const t = f.t, c = this.c;
    shared.groundY.value = -1000;
    const tFrom = c.on('From a sketch', 0), tSketch = c.on('From a sketch', 2), tSome = c.on('From a sketch', 4), tLive = c.on('From a sketch', 5);
    const tPass = c.on('One more pass', 2), tThen = c.on('One more pass', 3), tOpt = c.on('One more pass', 4), tOptEnd = c.end('One more pass', 4);
    const tOne = c.on('One more pass', 0);
    const tWhip0 = 13.02, tWhip1 = 13.25;

    // ---------------- camera: holds; push after "live"; whip with the current; holds
    const push = inOutCubic(prog(t, tLive + 0.04, tLive + 0.54));
    const whip = inOutCubic(prog(t, tWhip0, tWhip1));
    const lift = inExpo(prog(t, 14.72, 15.0)); // shot 2 exit: nothing moves but the word
    const cx = lerp(lerp(0, 0.7, push), CX2, whip);
    const D = lerp(lerp(20, 18.8, push), 20, whip);
    rig.place(f.cam, cx, 0, [lerp(1.6, 1.2, whip), 0.9], D);
    f.lightTarget.set(cx, 0, 0);
    f.post.halation = 0.14;
    // the practical light is the event: dim and cool while drafting, warmer as
    // the relief rises, fully on at "live" (outExpo), then held
    const warm = outExpo(prog(t, tSome, tSome + 0.35)), lampOn = outExpo(prog(t, tLive - 0.02, tLive + 0.25));
    this.lighting.key.intensity = lerp(lerp(0.5, 0.78, warm), 1.3, lampOn);
    this.lighting.key.color.setRGB(lerp(0.86, 1.0, lampOn), lerp(0.9, 0.94, lampOn), lerp(1.0, 0.86, lampOn));

    // ---------------- construction drawing
    this.base.draw(1);
    this.cap.draw(outExpo(prog(t, tFrom, tFrom + 0.22)));
    this.verticals.forEach((r, k) => r.draw(outExpo(prog(t, tFrom + 0.1 + (k >> 1) * 0.11 + (k & 1) * 0.04, tFrom + 0.28 + (k >> 1) * 0.11 + (k & 1) * 0.04))));
    this.dims.forEach((r, k) => r.draw(outExpo(prog(t, tFrom + 0.2 + k * 0.05, tFrom + 0.4 + k * 0.05))));
    this.dimLabel.visible = t > tFrom + 0.35;
    this.dwg.visible = true; // the sheet's drawing number is there from the start
    // title block typed with the words (stepped per character across each word)
    const tl = c.m.line(c.line('From a sketch'));
    const starts: number[] = [];
    tl.words.slice(0, 5).forEach((w, wi) => {
      const on = c.on('From a sketch', wi), dur = Math.min(0.28, Math.max(0.08, w.end - w.start));
      [...w.text].forEach((_, k) => starts.push(on + (dur * k) / w.text.length));
      starts.push(on + dur); // the space after the word
    });
    this.typeOn(this.title, t, starts);

    // ---------------- sketch outlines on "sketch"; fade as the relief rises
    this.outlines.forEach((loops, i) => {
      const d = outExpo(prog(t, tSketch + i * 0.045, tSketch + 0.28 + i * 0.045));
      for (const r of loops) r.draw(d);
    });
    // ---------------- extrude on "something": relief rises out of its drawing
    const tRelief: number[] = [];
    this.live.glyphs.forEach((gg, i) => {
      const t0 = tSome + i * 0.06;
      tRelief.push(t0);
      const e = t < t0 ? 0 : outExpo(prog(t, t0, t0 + 0.18));
      gg.visible = e > 0.001;
      const comp = 1 - 0.03 * Math.max(0, recoil(t - tLive, 30, 0.45));
      gg.scale.set(1, comp, Math.max(0.002, e));
      gg.position.z = DEPTH * Math.max(0.002, e);
      gg.position.y = 0;
    });

    // ---------------- "live": contours re-light L -> I -> V -> E (each flashes,
    // then holds as a mint inlay), then the current leaves from the E's arm
    this.liveLoops.forEach((loops, i) => {
      const t0 = tLive - 0.02 + i * 0.055;
      const d = outExpo(prog(t, t0, t0 + 0.16));
      const flash = t > t0 ? 1 + 3.2 * Math.exp(-(t - t0) / 0.09) : 1;
      for (const r of loops) {
        r.visible = d > 0.001;
        if (r.visible) r.draw(d);
        (r.material as THREE.MeshBasicMaterial).color.copy(COL.mint).multiplyScalar(2.0 * flash);
      }
    });
    const exitU = inOutCubic(prog(t, tWhip0 - 0.04, tWhip1));
    const headS = exitU * this.current.total;
    const on = t >= tWhip0 - 0.04;
    if (on) {
      this.current.draw(Math.max(1e-4, exitU));
      this.head.draw(Math.max(1e-4, exitU), Math.max(0, headS - 0.9) / this.current.total, rig.px(7));
    }
    // (Ribbon.draw sets visibility, so gate it afterwards)
    this.current.visible = this.current.visible && on && t < tWhip1 + 0.45; // the exit wire hands over to the path
    this.head.visible = this.head.visible && on && exitU < 1;

    // ---------------- shot 2: path, pass, optimize
    const pathOn = t > tWhip0;
    const drawn = stepped(prog(t, tWhip1 - 0.08, tWhip1 + 0.34), 14); // arrives in machine steps
    const k = spring(t - tOpt, 26);                                    // straighten (critically damped)
    const ko = springOver(t - tOpt, 24, 0.55);                         // letters overshoot a touch
    // exit: the straight line contracts to the span that becomes the underline
    // under "hard parts" in shot 3 (same screen position across the cut)
    const contract = inOutCubic(prog(t, 14.72, 15.02));
    const { sx0, sx1, lx0, lx1 } = this.span;
    const pts = this.pathPts.map((p, i) => {
      const q = p.clone().lerp(this.straight[i], k);
      if (contract > 0) q.x = lerp(q.x, lerp(sx0, sx1, (q.x - lx0) / (lx1 - lx0)), contract);
      return q;
    });
    this.path.setPoints(pts);
    this.path.visible = pathOn;
    if (pathOn) this.path.draw(Math.max(0.0001, drawn));
    // the pass: cursor runs the path (anticipation, acceleration, settle)
    const passU = t < tPass ? 0 : outExpo(prog(t, tPass, tPass + 0.32)) * 0.35 + inOutCubic(prog(t, tPass, tPass + 0.32)) * 0.65;
    const antic = t > tPass - 0.13 && t < tPass ? -rig.px(60) * Math.sin(Math.PI * 0.5 * inOutCubic(prog(t, tPass - 0.13, tPass))) : 0;
    // the pass starts where the cursor rests (path point 3), so it never jumps
    const s0 = this.path.lengthAt(3);
    const passS = s0 + passU * (this.path.total - s0);
    const passPos = this.path.at(passS);
    this.ticks.forEach((tk, i) => {
      const passed = passPos.x > this.detourX[i] && t >= tPass;
      const gone = 1 - clamp01(k * 1.4);
      tk.visible = passed && gone > 0.02;
      const py = this.pathPts.length ? YP + rig.px(40) : YP;
      tk.position.set(this.detourX[i], py + rig.px(30), 0.02);
      tk.scale.setScalar(Math.max(0.001, gone));
    });
    // OPTIMIZE: spread on the plateaus -> tight, condensed, on the straight line
    this.opt.setWidth(clamp01(ko));
    const lineY = YP + rig.px(26);
    const liftY = lift * rig.px(900);
    this.opt.glyphs.forEach((gg, i) => {
      const x = lerp(this.spreadX[i] - (this.opt.advance(i) * SPREAD_SCALE) / 2, this.tightX[i], ko);
      gg.position.set(x - this.opt.position.x, lerp(this.spreadY[i], lineY, ko) + liftY, 0.5);
      const sc = lerp(SPREAD_SCALE, 1, ko);
      gg.scale.set(sc, sc, 1);
      gg.visible = t > tOne - 0.1 + i * 0.03;
    });
    this.opt.position.set(0, 0, 0);
    // counter: stepped values through "optimize"
    const ci = f.tf < tOpt ? 0 : Math.min(4, Math.floor(prog(f.tf, tOpt, tOptEnd) * 5)); // discrete: frame time
    this.counters.forEach((w, i) => { w.visible = t > tOne && i === ci && lift < 0.3; });
    this.counterLabel.visible = t > tOne && lift < 0.3;
    // "One more pass," typed with the words
    const pl = c.m.line(c.line('One more pass'));
    const ps: number[] = [];
    pl.words.slice(0, 3).forEach((w, wi) => {
      const on2 = c.on('One more pass', wi), dur = Math.min(0.24, Math.max(0.08, w.end - w.start));
      [...w.text].forEach((_, j) => ps.push(on2 + (dur * j) / w.text.length));
      ps.push(on2 + dur);
    });
    this.typeOn(this.passLine, t, ps);
    if (lift > 0.3) this.passLine.visible = false; else this.passLine.visible = true;

    // ---------------- the cursor
    const bp = this.m.beat(t);
    if (t < tLive - 0.05) {
      // drafting pen: rides the construction as it is drawn, else rests at the title
      const tx = this.title.position.x + (this.title.glyphs.filter((gg) => gg.visible).length > 0
        ? this.title.baseX(Math.max(0, this.title.glyphs.filter((gg) => gg.visible).length - 1)) + this.title.advance(0) : 0);
      const drafting = t > tFrom && t < tFrom + 0.62;
      const penX = lerp(this.cap.at(0).x, this.cap.at(this.cap.total).x, outExpo(prog(t, tFrom, tFrom + 0.22)));
      const x = drafting && t < tFrom + 0.22 ? penX : tx + rig.px(8);
      const y = drafting && t < tFrom + 0.22 ? G + CAP : this.title.position.y + rig.cap(56, 0.73) / 2;
      this.cursor.pose({ x, y, z: 0.02, h: rig.px(88), intensity: 6, notches: 0, opacity: t < tFrom ? blink2(bp) : 1 });
    } else if (t < tPass - 0.13) {
      // rides the current's head
      const hp = this.current.at(headS);
      const settle = spring(t - tWhip1, 30);
      const rest = this.path.visible ? this.pathPts[3].clone() : hp;
      const p = t > tWhip1 ? hp.clone().lerp(rest, settle) : hp;
      this.cursor.pose({ x: p.x + rig.px(18), y: p.y + rig.px(10), z: p.z + 0.06, h: rig.px(88), notches: 1, opacity: t > tWhip1 + 0.3 ? blink2(bp) : 1 });
    } else {
      const p = this.path.at(passS);
      this.cursor.pose({ x: p.x + antic, y: p.y + rig.px(34), z: 0.03, h: rig.px(88), notches: t > tPass + 0.2 ? 2 : 1, intensity: 6 + 3 * clamp01(1 - Math.abs(passU - 0.5) * 2) });
    }
    if (t > tThen && t < tOpt) this.cursor.visible = true; // stillness: the cursor holds at the path end
    void hash;
  }
}
