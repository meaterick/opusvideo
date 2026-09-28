// SHOTS 7-9 · OPUS -> the reasoning space -> the machine (docs/V2_SHOTS.md)
//
// 7 · OPUS (24.417-25.800)  hard cut on the sung "O": OPUS across the full
//     width, standing on the floor.  Band downbeat (24.582): the O opens.
//     "-pus" (24.80): P-U-S recoil.  24.85-25.40: the camera travels through
//     the O's counter into the space behind it, where the reasoning paths are.
// 8 · DIFFICULT / NAME (25.800-27.600)  "difficult" sits soft inside a knot of
//     translucent blue paths; on "name" a rack focus lands on it and four
//     brackets lock on (critically damped).
// 9 · REASON / WRITE / BUILD (27.600-29.958)  one path pulls taut into a
//     straight line; REASON / WRITE / BUILD land on it as they are sung while
//     the code line below accumulates `difficult.reason().write().build()`.
//     On "build" each token grows a machined block behind it (one per 16th).
//     A mint verification pulse runs under the machine into the cursor, which
//     stands at its end as the spine and gains its fifth notch.
import * as THREE from 'three';
import { Shot, type BuildCtx, type F2 } from '../shot';
import type { Music } from '../../engine/data';
import type { Cues } from '../cues';
import { COL, Lighting, emissive, flat, graphite, metal, porcelain, reasoning } from '../materials';
import { GlyphWord, layout, fontOf } from '../glyphs';
import { Ribbon } from '../lines';
import { Cursor2, blink2 } from '../cursor';
import { Rig } from '../rig';
import { typeTimes, reveal, caretAfter } from './common';
import { clamp01, inExpo, inOutCubic, lerp, outExpo, prog, recoil, spring, springOver } from '../motion';

const FONT = 'sans75-700' as const;
const rigO = new Rig(34, 16);          // OPUS camera
const ZK = -18;                        // reasoning plane (behind OPUS)
const RD = 12;                         // camera distance to the reasoning plane
const unitR = (2 * RD * Math.tan((34 * Math.PI) / 360)) / 1080;

class KnotCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private p: number, private q: number, private R: number, private seed: number, private amp: number) { super(); }
  getPoint(u: number, out = new THREE.Vector3()) {
    const a = u * Math.PI * 2 * 1;
    const r = this.R * (0.62 + 0.38 * Math.cos(this.q * a));
    const n = (k: number) => Math.sin(a * (2 + k) + this.seed * 3.1 + k) * this.amp;
    return out.set(r * Math.cos(this.p * a) + n(1), r * Math.sin(this.p * a) * 0.62 + n(2), this.R * 0.55 * Math.sin(this.q * a) + n(3));
  }
}

export class OpusShot extends Shot {
  readonly id = 'opus';
  readonly capability = 'reasoning · writing code · building a verified system';
  lighting = new Lighting(20, 1.5);
  priority = 3;
  private opus!: GlyphWord;
  private floorY = 0;
  private oc = new THREE.Vector3();         // O counter centre (world)
  private rc = new THREE.Vector3();         // reasoning frame centre (world)
  private knot = new THREE.Group();
  private tubes: THREE.Mesh<THREE.TubeGeometry, THREE.ShaderMaterial>[] = [];
  private reasonPts: THREE.Vector3[] = [];  // the taut path's points in knot space
  private floor!: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private reasonPath!: Ribbon;
  private give!: GlyphWord; private giveTimes: number[] = [];
  private diff!: GlyphWord;
  private brackets: Ribbon[] = [];
  private aName!: GlyphWord; private aNameTimes: number[] = [];
  private itCan!: GlyphWord; private itCanTimes: number[] = [];
  private heroes: GlyphWord[] = [];
  private code: GlyphWord[] = []; private codeX: number[] = [];
  private blocks: THREE.Mesh[] = []; private edges: THREE.Mesh[] = []; private leds: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>[] = [];
  private pulse!: Ribbon; private verified!: Ribbon;
  private bench!: THREE.Mesh;
  private diffHome = new THREE.Vector3();
  private cursor = new Cursor2();
  private emberLight = new THREE.PointLight(0xff6a3d, 0, 0, 2);
  constructor(m: Music, private c: Cues) { super(m); this.start = 24.417; this.end = 29.958 + 0.2; }

  /** world position of a pixel on the reasoning plane (z offset dz toward the camera) */
  private R(px: number, py: number, dz = 0) {
    const s = (RD - dz) / RD;
    return new THREE.Vector3(this.rc.x + (px - 960) * unitR * s, this.rc.y + (540 - py) * unitR * s, ZK + dz);
  }

  build(_ctx: BuildCtx) {
    const g = this.group;
    g.add(this.lighting);
    this.lighting.keyDist = 30;
    const floor = this.floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), graphite(new THREE.Color('#1c1f25'), 0.9));
    floor.material.transparent = true;
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    g.add(floor);

    // ---- OPUS, full width
    const Lo = layout(FONT, 'OPUS', { tracking: 10 });
    const capPx = ((1824 - 96) / Lo.width) * fontOf(FONT).kern.capHeight;
    this.floorY = rigO.y(862);
    floor.position.y = this.floorY - 0.001;
    this.opus = new GlyphWord('OPUS', FONT, rigO.px(capPx), porcelain(), { tracking: 10 }, { depth: 1.8, bevel: rigO.px(6) });
    this.opus.position.set(rigO.x(96), this.floorY, 0);
    g.add(this.opus);
    // O pivot at its centre so it can open outward
    const og = this.opus.glyphs[0];
    const ocx = this.opus.centerX(0), ocy = this.opus.capHeight / 2;
    og.children[0].position.set(og.position.x - ocx, -ocy, 0); // mesh offset so the group pivots on the O's centre
    og.position.set(ocx, ocy, 0);
    this.oc.set(this.opus.position.x + ocx, this.floorY + ocy, 0);
    this.rc.set(this.oc.x, this.oc.y, ZK);

    // ---- the reasoning space: a knot of translucent paths behind the O
    this.knot.position.copy(this.rc);
    g.add(this.knot);
    const specs: [number, number, number][] = [[2, 3, 0.18], [3, 5, 0.22], [2, 5, 0.16], [3, 4, 0.2], [5, 3, 0.14]];
    specs.forEach(([p, q, amp], i) => {
      const curve = new KnotCurve(p, q, 3.1 + i * 0.12, i + 1, amp);
      const mat = reasoning(0.75);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 700, 0.028 + (i % 2) * 0.012, 8, true), mat);
      tube.rotation.set(0.35 * i, 0.5 * i, 0.2 * i);
      this.tubes.push(tube); this.knot.add(tube);
      if (i === 1) {
        // the path that will be pulled taut: sample it in world space
        tube.updateMatrix();
        for (let k = 0; k <= 160; k++) this.reasonPts.push(curve.getPoint(k / 160).applyMatrix4(tube.matrix));
      }
    });
    this.reasonPath = new Ribbon(new THREE.MeshBasicMaterial({ color: COL.reasoning.clone().multiplyScalar(1.3), toneMapped: false, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }), unitR * 6, undefined, 200);
    g.add(this.reasonPath);

    // ---- shot 8 type
    const gt = typeTimes(this.c, 'Give the difficult', 0, 2);
    this.give = new GlyphWord(gt.text, 'mono500', unitR * 56 * 0.73, flat(COL.porcelain));
    this.give.position.copy(this.R(246, 300, 0.4));
    this.giveTimes = gt.times;
    g.add(this.give);
    const dword = this.c.word('Give the difficult', 2).text.replace(/[^A-Za-z]/g, '');
    this.diff = new GlyphWord(dword, 'serifItalic', unitR * 250, porcelain(), { tracking: 6 });
    const dpos = this.R(960, 640, 0);
    this.diff.position.set(dpos.x - this.diff.width / 2, dpos.y, dpos.z + 0.4);
    this.diffHome.copy(this.diff.position);
    g.add(this.diff);
    for (let i = 0; i < 4; i++) { const r = new Ribbon(flat(COL.porcelain), unitR * 4, undefined, 4); this.brackets.push(r); g.add(r); }
    const at = typeTimes(this.c, 'Give the difficult', 3, 5);
    this.aName = new GlyphWord(at.text, 'mono500', unitR * 56 * 0.73, flat(COL.porcelain));
    this.aNameTimes = at.times;
    g.add(this.aName);

    // ---- shot 9 type: "It can", the verbs on the line, the code line
    const it = typeTimes(this.c, 'It can reason', 0, 2);
    this.itCan = new GlyphWord(it.text, 'mono500', unitR * 56 * 0.73, flat(COL.porcelain));
    this.itCan.position.copy(this.R(246, 300, 2));
    this.itCanTimes = it.times;
    g.add(this.itCan);
    for (const v of ['REASON', 'WRITE', 'BUILD']) {
      const w = new GlyphWord(v, FONT, unitR * 230, porcelain(), { tracking: 8 }, { depth: 0.5, bevel: unitR * 4 });
      const p = this.R(246, 560, 0.5);
      w.position.copy(p);
      this.heroes.push(w); g.add(w);
    }
    const tokens = ['difficult', '.reason()', '.write()', '.build()'];
    let x = 0;
    const codeCap = unitR * 60 * 0.73;
    tokens.forEach((tk, i) => {
      const w = new GlyphWord(tk, i === 0 ? 'serifItalic' : 'mono500', i === 0 ? unitR * 60 * 0.72 : codeCap, flat(COL.porcelain));
      this.codeX.push(x);
      x += w.width - unitR * (i === 0 ? 2 : 9); // one expression: no visible gaps between tokens
      this.code.push(w); g.add(w);
      // the machined block this token becomes
      const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), graphite(new THREE.Color('#3a404a'), 0.8));
      b.castShadow = true; b.receiveShadow = true;
      this.blocks.push(b); g.add(b);
      const e = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), metal());
      this.edges.push(e); g.add(e);
      const led = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false }));
      this.leds.push(led); g.add(led);
    });
    // the workbench the machine stands on (edge-on, invisible until the crane)
    this.bench = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), graphite(new THREE.Color('#23272e'), 0.85));
    this.bench.rotation.x = -Math.PI / 2;
    this.bench.receiveShadow = true;
    g.add(this.bench);
    this.pulse = new Ribbon(emissive(COL.mint, 7), unitR * 6, undefined, 8);
    this.verified = new Ribbon(emissive(COL.mint, 2.2), unitR * 4, undefined, 8);
    g.add(this.pulse, this.verified, this.emberLight, this.cursor);
  }

  private pulseU(t: number, tEnd: number) { return inOutCubic(prog(t, tEnd - 0.05, tEnd + 0.35)); }

  update(f: F2) {
    const t = f.t, c = this.c, m = this.m;
    const tO = c.on('Call in Opus', 2), tBand = 24.582, tPus = 24.80;
    const tGive = c.on('Give the difficult', 0), tDiff = c.on('Give the difficult', 2), tName = c.on('Give the difficult', 4);
    const tIt = c.on('It can reason', 0), tReason = c.on('It can reason', 2), tWrite = c.on('It can reason', 3), tBuild = c.on('It can reason', 5);
    const tEnd = c.end('It can reason', 6);
    const tFly0 = 24.85, tFly1 = 25.4;
    const bp = m.beat(t);

    // ---------------- camera: OPUS (floor level) -> through the O -> reasoning frame
    const fly = inOutCubic(prog(t, tFly0, tFly1));
    const p0 = new THREE.Vector3(0, this.floorY + 0.25, 16), l0 = new THREE.Vector3(0, 0.3, 0);
    const pa = new THREE.Vector3(this.oc.x, this.oc.y, 3.2), pb = new THREE.Vector3(this.rc.x, this.rc.y, ZK + RD);
    const la = new THREE.Vector3(this.oc.x, this.oc.y, -2), lb = this.rc.clone();
    const pos = fly < 0.5 ? p0.clone().lerp(pa, fly / 0.5) : pa.clone().lerp(pb, (fly - 0.5) / 0.5);
    const look = fly < 0.5 ? l0.clone().lerp(la, fly / 0.5) : la.clone().lerp(lb, (fly - 0.5) / 0.5);
    f.cam.fov = lerp(34, 44, Math.sin(Math.PI * fly));
    // "build": a crane up to a 3/4 view that shows the machine's depth
    const crane = inOutCubic(prog(t, tBuild + 0.02, tBuild + 0.6));
    if (crane > 0) {
      // end framing computed from the machine itself: look at its centre from
      // a fixed 3/4 offset, so the finished machine always sits in frame
      const cb = this.R(246, 700, 0.5);
      const mEnd = cb.x + this.codeX[3] + this.code[3].width + unitR * 50;
      const mc = new THREE.Vector3((cb.x + mEnd) / 2 + unitR * 60, cb.y + unitR * 120, cb.z - 0.5);
      const endPos = mc.clone().add(new THREE.Vector3(2.4, 2.1, RD * 0.95));
      pos.lerp(endPos, crane);
      look.lerp(mc, crane);
    }
    f.cam.position.copy(pos);
    f.cam.lookAt(look);
    f.lightTarget.set(fly < 0.6 ? 0 : this.rc.x, fly < 0.6 ? this.floorY + 3 : this.rc.y, fly < 0.6 ? 0 : ZK);
    const inside = fly > 0.6;

    // ---------------- light: impact flare on OPUS, full on at the band's downbeat
    const flare = Math.exp(-Math.max(0, t - tO) / 0.08) + Math.exp(-Math.max(0, t - tBand) / 0.12) * 0.8;
    const stageOn = outExpo(prog(t, tBand - 0.01, tBand + 0.2));
    this.lighting.key.intensity = inside ? 0.9 : lerp(0.5, 1.7, stageOn) + 0.9 * flare;
    this.lighting.fill.intensity = 0;
    f.post.halation = inside ? 0.16 : 0.14;
    f.post.localContrast = 0.16;

    // ---------------- OPUS
    this.opus.visible = t < tFly1 + 0.05;
    const or = 1 - 0.015 * Math.max(0, recoil(t - tO, 36, 0.5));
    this.opus.scale.set(1, or, 1);
    const open = outExpo(prog(t, tBand, tBand + 0.35));
    this.opus.glyphs[0].scale.setScalar(1 + 0.22 * open);
    for (let i = 1; i < 4; i++) this.opus.glyphs[i].position.z = -0.35 * Math.max(0, recoil(t - tPus, 30, 0.45)) * (t > tPus ? 1 : 0);

    // ---------------- the knot: revealed only after OPUS (paths draw in)
    const reveal0 = outExpo(prog(t, tBand, tFly1));
    this.knot.visible = t > tBand;
    // the problem is turned over slowly (parallax through the paths) and
    // signal pulses run along every path, one step per beat
    this.knot.rotation.y = 0.12 * Math.max(0, t - tBand);
    this.knot.updateMatrix();
    const flowAmt = outExpo(prog(t, tFly1 - 0.2, tFly1 + 0.3));
    this.tubes.forEach((tube, i) => {
      const u = tube.material.uniforms;
      u.flowAmt.value = flowAmt;
      // advance on the beat: a fast outExpo step at each beat, then stillness
      const b = bp - m.beat(tBand), k = Math.floor(b), fr = b - k;
      u.flowPhase.value = (k + outExpo(clamp01(fr * 3))) * 0.25 + i * 0.37;
    });
    // the floor dissolves as the camera enters the O: no horizon crosses the knot
    this.floor.material.opacity = 1 - inOutCubic(prog(fly, 0.45, 0.8));
    this.floor.visible = this.floor.material.opacity > 0.001;
    const straightened = spring(t - tReason, 18);
    this.tubes.forEach((tube, i) => {
      tube.material.uniforms.opacity.value = reveal0 * (t > tReason ? lerp(1, 0.35, outExpo(prog(t, tReason, tReason + 0.6))) : 1) * (i === 1 && t > tReason ? 0 : 1);
      tube.scale.setScalar(lerp(0.6, 1, reveal0));
    });

    // ---------------- shot 8: "Give the" / difficult / name
    const lg = reveal(this.give, t, this.giveTimes);
    this.give.visible = t > tGive - 0.05 && t < tIt - 0.1;
    const dOn = outExpo(prog(t, tDiff - 0.02, tDiff + 0.25));
    // into the code line: anticipation on "can", gone just before REASON lands
    const pull = inExpo(prog(t, tReason - 0.16, tReason - 0.01));
    this.diff.visible = t > tDiff - 0.02 && pull < 0.999;
    const codeHome = this.R(246, 700, 0.5);
    const sc = lerp(1, (unitR * 60 * 0.72) / (unitR * 250), pull);
    this.diff.scale.setScalar(sc);
    this.diff.position.set(lerp(this.diffHome.x, codeHome.x, pull), lerp(this.diffHome.y, codeHome.y, pull), lerp(ZK + 0.4 + (1 - dOn) * -2, codeHome.z, pull));
    // depth of field: focus behind the word, rack to the word on "name"
    const rack = inOutCubic(prog(t, tName - 0.02, tName + 0.2));
    if (t > 25.8 && t < tReason) {
      f.dof = { focus: RD - 0.4 + lerp(2.6, 0, rack), aperture: lerp(0.22, 0.1, rack) };
      f.minSamples = 36;
    }
    // brackets lock onto the named word (critically damped)
    const lock = spring(t - tName, 26);
    const bw = this.diff.width / 2 + unitR * 50, bh = unitR * 140, cx = this.diff.position.x + this.diff.width / 2, cy = this.diff.position.y + this.diff.capHeight / 2;
    const spread = lerp(1.6, 1, lock), L = unitR * 46;
    const corners: [number, number][] = [[-1, 1], [1, 1], [-1, -1], [1, -1]];
    this.brackets.forEach((r, i) => {
      const [sx, sy] = corners[i];
      const x0 = cx + sx * bw * spread, y0 = cy + sy * bh * spread, z = ZK + 0.5;
      r.setPoints([new THREE.Vector3(x0 - sx * L, y0, z), new THREE.Vector3(x0, y0, z), new THREE.Vector3(x0, y0 - sy * L, z)]).draw(1);
      r.visible = t > tName - 0.02 && pull < 0.3; // they leave with the word
    });
    const an = reveal(this.aName, t, this.aNameTimes);
    this.aName.position.set(cx + bw - this.aName.width, cy - bh - unitR * 70, ZK + 0.5);
    this.aName.visible = t > this.aNameTimes[0] - 0.02 && pull < 0.3;

    // ---------------- shot 9: the path pulled taut, verbs on the line, code, machine
    const lineY = this.R(960, 600).y, lx0 = this.R(246, 600).x, lx1 = this.R(1674, 600).x;
    const knotPts = this.reasonPts.map((p) => p.clone().applyMatrix4(this.knot.matrix));
    const straight = this.reasonPts.map((_, k) => new THREE.Vector3(lerp(lx0, lx1, k / (this.reasonPts.length - 1)), lineY, ZK + 0.3));
    this.reasonPath.visible = t > tReason - 0.01;
    if (this.reasonPath.visible) {
      this.reasonPath.setPoints(knotPts.map((p, k) => p.clone().lerp(straight[k], straightened))).draw(1);
    }
    const li = reveal(this.itCan, t, this.itCanTimes);
    this.itCan.visible = t > tIt - 0.05 && crane < 0.02;
    // verbs: land on the line as sung (outExpo up from the line), leave with inExpo
    const vt = [tReason, tWrite, tBuild];
    this.heroes.forEach((w, i) => {
      const t0 = vt[i], t1 = i < 2 ? vt[i + 1] : 99;
      // each verb lands on its onset and has left before the next one lands
      const inn = outExpo(prog(t, t0, t0 + 0.2)), out = inExpo(prog(t, t1 - 0.12, t1 - 0.01));
      w.visible = t > t0 && out < 0.99;
      const base = this.R(246, 570, 0.5);
      w.position.set(base.x, base.y - (1 - inn) * unitR * 60 + out * unitR * 260, base.z);
      w.glyphs.forEach((gg, k) => { gg.scale.set(1, lerp(0.2, 1, springOver(t - t0 - k * 0.018, 30, 0.55)), 1); });
    });
    // code line accumulating below the line: one token per verb (+ the named word first)
    const tokT = [tReason - 0.01, tWrite, tWrite + 0.18, tBuild]; // the named word lands as the pull ends
    const codeBase = this.R(246, 700, 0.5);
    const buildT = (i: number) => tBuild + 0.04 + i * (m.P / 4);  // one block per 16th
    this.code.forEach((w, i) => {
      w.position.set(codeBase.x + this.codeX[i], codeBase.y, codeBase.z + 0.02);
      w.visible = t > tokT[i];
      // blocks grow behind each token on "build" and lock (critically damped)
      const bgrow = spring(t - buildT(i), 30);
      const b = this.blocks[i], e = this.edges[i];
      const padX = unitR * 12, padY = unitR * 60;
      const bwid = w.width + padX * 2, bhei = w.capHeight + padY * 2, depth = 1.5 * bgrow;
      b.visible = bgrow > 0.002; e.visible = b.visible;
      const gapClose = unitR * (5 + 22 * (1 - spring(t - buildT(i) - 0.05, 26))); // lock together, seams stay
      b.scale.set(bwid - unitR * 3, bhei, Math.max(0.001, depth));
      b.position.set(codeBase.x + this.codeX[i] + w.width / 2 + gapClose * (i - 1.5), codeBase.y + w.capHeight / 2, codeBase.z - depth / 2 - 0.001);
      w.position.x += gapClose * (i - 1.5);
      // machined lip: a thin metal edge along the front top edge only
      e.scale.set(bwid - unitR * 3, unitR * 6, Math.max(0.001, unitR * 10 * bgrow));
      e.position.set(b.position.x, b.position.y + bhei / 2 + unitR * 3, codeBase.z - unitR * 5);
      // status light: switches on as the verification pulse passes this block
      const led = this.leds[i];
      const ledOn = t > tEnd && (this.pulseU(t, tEnd) * 4.2 > i + 0.8);
      led.visible = b.visible;
      led.scale.set(unitR * 16, unitR * 6, unitR * 4);
      led.position.set(b.position.x + bwid / 2 - unitR * 26, b.position.y - bhei / 2 + unitR * 18, codeBase.z + 0.012);
      led.material.color.copy(ledOn ? COL.mint.clone().multiplyScalar(6) : new THREE.Color('#0d0f12'));
    });
    const benchY = codeBase.y + this.code[0].capHeight / 2 - (this.code[0].capHeight + unitR * 120) / 2;
    this.bench.position.set(codeBase.x + 6, benchY - 0.002, codeBase.z - 4);
    this.bench.visible = t > tBuild - 0.05;
    // verification pulse under the machine into the cursor, then a held mint line
    const mx0 = codeBase.x - unitR * 14, mx1 = codeBase.x + this.codeX[3] + this.code[3].width + unitR * 30;
    const my = benchY + unitR * 3;
    const pu = this.pulseU(t, tEnd);
    this.verified.setPoints([new THREE.Vector3(mx0, my, codeBase.z + 0.05), new THREE.Vector3(mx1, my, codeBase.z + 0.05)]).draw(Math.max(1e-4, pu));
    this.verified.visible = pu > 0;
    this.pulse.setPoints([new THREE.Vector3(mx0, my, codeBase.z + 0.06), new THREE.Vector3(mx1, my, codeBase.z + 0.06)]).draw(Math.max(1e-4, pu), Math.max(0, pu - 0.12));
    this.pulse.visible = pu > 0 && pu < 1;

    // ---------------- the cursor
    const notch5 = t > tEnd + 0.33;
    if (!inside) {
      this.cursor.visible = false;
      this.emberLight.intensity = 0;
    } else if (t < tIt) {
      // anchor chosen by time (not visibility): no jump inside the shutter
      const onName = t >= this.aNameTimes[0] - 0.05;
      const g0 = onName ? this.aName : this.give;
      const idx = onName ? an : lg;
      const x = g0.position.x + caretAfter(g0, idx) + unitR * 10;
      this.cursor.pose({ x, y: g0.position.y + unitR * 22, z: g0.position.z + 0.05, h: unitR * 62, notches: 4, opacity: idx < 0 ? blink2(bp) : 1 });
      this.emberLight.intensity = 0;
    } else if (t < tBuild) {
      const onCode = t > tokT[0];
      const w = onCode ? this.code[Math.max(0, this.code.filter((cw) => cw.visible).length - 1)] : this.itCan;
      const x = onCode ? w.position.x + w.width + unitR * 10 : this.itCan.position.x + caretAfter(this.itCan, li) + unitR * 10;
      this.cursor.pose({ x, y: w.position.y + unitR * 22, z: w.position.z + 0.05, h: unitR * 66, notches: 4, opacity: 1 });
      this.emberLight.intensity = 0;
    } else {
      // the spine: stands at the machine's end, tall
      const rise = spring(t - tBuild - 0.1, 22);
      const x = mx1 + unitR * 20, base = my;
      const h = lerp(unitR * 66, unitR * 420, rise);
      this.cursor.pose({ x, y: base + h / 2, z: codeBase.z + 0.1, h, w: lerp(unitR * 6, unitR * 16, rise), notches: notch5 ? 5 : 4, intensity: 6 + (pu > 0.95 && pu < 1.02 ? 6 : 0) + 4 * Math.exp(-Math.max(0, t - (tEnd + 0.33)) / 0.1) * (notch5 ? 1 : 0) });
      this.emberLight.position.set(x + 0.2, base + h * 0.5, codeBase.z + 0.8);
      this.emberLight.intensity = 3 * rise;
    }
  }
}
