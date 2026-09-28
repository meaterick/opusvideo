// SYSTEM — verse 1, lines 5-8.  Capability: building complete working systems,
// testing and revising its own output.
//
// A blueprint seen from 3/4 above.  The caret types each line as the prompt
// at the back of the plan; each line changes the system on the plan:
//   "Draft the system,"        modules sketch in as wireframes, edges connect
//   "test the claim"           the caret drops in as a probe and sweeps: PASS / FAIL tags
//   "Refactor without ..."     modules slide to a clean layout; the aim reticle stays put
//   "... changing aim"         "aim" is typed at the reticle
//   "From a sketch"            wires flicker back to sketch
//   "to something live"        a fill wave turns wires into lit parts; signals run on the beat
//   "One more pass,"           the caret sweeps again as a scan plane
//   "then optimize"            the parts pack into a tight block, latency counts down
// The packed block is where the next scene (context) starts.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import type { Music, Word } from '../engine/data';
import { LyricLine } from '../engine/lyricline';
import { Caret, blink } from '../engine/motif';
import { PAL, hot } from '../engine/palette';
import { TextMesh } from '../engine/type';
import { clamp, easeInOut, easeOut, invLerp, lerp, noise1, smooth, easeBack } from '../engine/util';

const GROUND = -1.2;
// module footprints (x, z) for the three layouts
const SKETCH: [number, number][] = [[-3.3, 0.5], [-1.4, -0.5], [0.5, 0.9], [1.1, -1.2], [3.1, 0.1], [-0.4, 2.1]];
const CLEAN: [number, number][] = [[-3.0, 0.0], [-1.0, -0.95], [-1.0, 0.95], [1.0, -0.95], [1.0, 0.95], [3.0, 0.0]];
const PACKED: [number, number][] = [[-0.92, -0.5], [0, -0.5], [0.92, -0.5], [-0.92, 0.5], [0, 0.5], [0.92, 0.5]];
const EDGES: [number, number][] = [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 5], [1, 2]];
const FAIL = 3;
const MOD_W = 1.35, MOD_D = 0.95, MOD_H = 0.3;

interface Module {
  body: THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial>;
  wire: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  top: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  tag: { pass: TextMesh; fail: TextMesh };
  grp: THREE.Group;
}

export class SystemScene extends Scene {
  readonly id = 'system';
  readonly capability = 'building complete working systems · testing and revising its own output';
  lines: LyricLine[] = [];
  mods: Module[] = [];
  edges!: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  signals!: THREE.InstancedMesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  caret = new Caret();
  reticle = new THREE.Group();
  aimLabel!: TextMesh;
  metric: TextMesh[] = [];
  metricLabel!: TextMesh;
  grid!: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private w: (li: number, wi: number) => Word;
  constructor(m: Music, readonly lineIdx: number[], start: number, end: number) {
    super(m);
    this.start = start; this.end = end;
    this.w = (li, wi) => this.lines[li].words[wi].w;
  }

  build() {
    const g = this.group;
    g.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xfff1e0, 1.6);
    key.position.set(-3, 6, 4);
    g.add(key);
    // blueprint grid
    const pts: number[] = [];
    for (let i = -24; i <= 24; i++) {
      pts.push(i * 0.5, GROUND, -8, i * 0.5, GROUND, 8);
      if (i >= -16 && i <= 16) pts.push(-12, GROUND, i * 0.5, 12, GROUND, i * 0.5);
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.grid = new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: PAL.graphite.clone(), transparent: true, opacity: 0.55, depthWrite: false }));
    g.add(this.grid);

    // modules
    for (let i = 0; i < 6; i++) {
      const grp = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(MOD_W, MOD_H, MOD_D), new THREE.MeshLambertMaterial({ color: PAL.inkLift.clone(), transparent: true }));
      body.position.y = MOD_H / 2;
      const wire = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), new THREE.LineBasicMaterial({ color: PAL.slate.clone(), transparent: true }));
      wire.position.y = MOD_H / 2;
      const top = new THREE.Mesh(new THREE.PlaneGeometry(MOD_W * 0.86, MOD_D * 0.78), new THREE.MeshBasicMaterial({ color: PAL.ember.clone(), transparent: true, depthWrite: false }));
      top.rotation.x = -Math.PI / 2;
      top.position.y = MOD_H + 0.003;
      const pass = new TextMesh('PASS', { font: 'mono', weight: 700, px: 96 }, 0.26, 'center');
      const fail = new TextMesh('FAIL', { font: 'mono', weight: 700, px: 96 }, 0.26, 'center');
      for (const tg of [pass, fail]) { tg.position.set(0, MOD_H + 0.42, 0); grp.add(tg); }
      grp.add(body, wire, top);
      grp.position.y = GROUND;
      g.add(grp);
      this.mods.push({ body, wire, top, tag: { pass, fail }, grp });
    }
    // edges (updated every frame)
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(EDGES.length * 6), 3));
    this.edges = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: PAL.slate.clone(), transparent: true }));
    g.add(this.edges);
    // signals: 3 per edge
    this.signals = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 10, 8), new THREE.MeshBasicMaterial({ color: hot(PAL.cyan, 2.2) }), EDGES.length * 3);
    g.add(this.signals);
    // reticle (fixed aim) on the plan
    const ringMat = new THREE.MeshBasicMaterial({ color: hot(PAL.ember, 1.3), transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const r1 = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.66, 64), ringMat);
    const r2 = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.23, 48), ringMat);
    const cross = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.025), ringMat);
    const cross2 = cross.clone(); cross2.rotation.z = Math.PI / 2;
    this.reticle.add(r1, r2, cross, cross2);
    this.reticle.rotation.x = -Math.PI / 2;
    this.reticle.position.set(0, GROUND + 0.01, 0);
    g.add(this.reticle);
    this.aimLabel = new TextMesh('aim', { font: 'serif', italic: true, weight: 400, px: 160 }, 0.62, 'left');
    this.aimLabel.rotation.x = -Math.PI / 2;
    this.aimLabel.position.set(0.8, GROUND + 0.02, 0.62);
    g.add(this.aimLabel);
    // scan plane (the caret stretched into a sweep)
    // metric
    this.metricLabel = new TextMesh('p95 latency', { font: 'mono', weight: 400, px: 96 }, 0.22, 'left');
    this.metricLabel.position.set(-4.6, GROUND + 1.25, 0.6);
    g.add(this.metricLabel);
    for (const v of [212, 180, 141, 96, 61, 38]) {
      const tm = new TextMesh(`${v} ms`, { font: 'mono', weight: 700, px: 128 }, 0.42, 'left');
      tm.position.set(-4.6, GROUND + 0.78, 0.6);
      this.metric.push(tm);
      g.add(tm);
    }
    // prompt lines (typed by the caret at the back of the plan)
    for (const li of this.lineIdx) {
      const l = new LyricLine(this.m.line(li), { font: 'display', weight: 500 }, 0.58, 'left');
      this.lines.push(l);
      g.add(l);
    }
    g.add(this.caret);
  }

  update(f: Frame) {
    const { t, m } = f;
    const W = this.w;
    const bp = m.beat(t);
    // ---------- key times from the words
    const tDraft = W(0, 0).start, tSystem = W(0, 2).end;
    const tTest = W(0, 3).start, tClaim = W(0, 5).end;
    const tRefactor = W(1, 0).start, tAim = W(1, 3).start;
    const tSketch = W(2, 2).start, tSomething = W(2, 4).start, tLive = W(2, 5).start;
    const tPass = W(3, 2).start, tOpt = W(3, 4).start, tOptEnd = W(3, 4).end;

    // ---------- camera first (tags billboard to it): slow orbit, push on
    // downbeats, dolly in on "optimize"
    const lt = t - this.start;
    const orbit = -0.16 + lt * 0.018 + noise1(lt * 0.25, 11) * 0.02;
    const r = lerp(9.6, 8.2, easeInOut(invLerp(tOpt - 0.4, this.end, t)));
    const push = m.barPulse(t, 0.3) * 0.12;
    f.cam.position.set(Math.sin(orbit) * (r - push), lerp(3.6, 3.0, easeInOut(invLerp(tOpt - 0.4, this.end, t))), Math.cos(orbit) * (r - push));
    f.cam.lookAt(0, -0.35, -0.4);

    // ---------- module positions: sketch -> clean (refactor) -> packed (optimize)
    const refac = (i: number) => easeInOut(invLerp(tRefactor + i * 0.07, tRefactor + 0.95 + i * 0.07, t), 3);
    const pack = (i: number) => easeInOut(invLerp(tOpt + i * 0.05, tOptEnd + 0.1 + i * 0.05, t), 3);
    const pos: [number, number][] = [];
    for (let i = 0; i < 6; i++) {
      const a = SKETCH[i], b = CLEAN[i], c = PACKED[i];
      const r = refac(i), p = pack(i);
      pos.push([lerp(lerp(a[0], b[0], r), c[0], p), lerp(lerp(a[1], b[1], r), c[1], p)]);
    }
    // fill: 0 = sketch wire, 1 = lit part (wave from left)
    const fillOf = (x: number) => {
      const wave = invLerp(tSomething - 0.1, tLive + 0.25, t) * 9 - 4.5; // wave front in x
      const on = smooth((wave - x) / 1.2);
      const backToSketch = smooth(invLerp(tSketch - 0.05, tSketch + 0.12, t));
      return t < tSketch ? 0.35 * smooth(invLerp(tRefactor, tRefactor + 0.9, t)) * (1 - backToSketch) : on;
    };
    // ---------- tests: the probe sweep x position
    const probeU = invLerp(tTest - 0.05, tClaim + 0.05, t);
    const probeX = lerp(-4.6, 4.4, easeInOut(probeU, 2));
    const probing = t >= tTest - 0.12 && t < tClaim + 0.25;
    const passU = invLerp(tPass - 0.05, tPass + 0.75, t);
    const scanning = t >= tPass - 0.12 && t < tPass + 0.95;
    const scanX = lerp(-4.2, 4.2, easeInOut(passU, 2));

    const kick = m.pulse('kick', t, 0.1);
    this.mods.forEach((md, i) => {
      const [x, z] = pos[i];
      // draw-in during "Draft the system,"
      const draw = easeOut(invLerp(tDraft + i * 0.12, tDraft + i * 0.12 + 0.35, t), 3);
      const s = 1 - 0.28 * pack(i);
      md.grp.position.set(x, GROUND, z);
      md.grp.scale.set(s * lerp(0.6, 1, draw), lerp(0.05, 1, draw), s * lerp(0.6, 1, draw));
      const fill = fillOf(x);
      const failed = i === FAIL && t > tTest && t < tRefactor + 0.5;
      md.body.material.opacity = draw * lerp(0.0, 0.96, fill);
      md.body.material.color.copy(PAL.inkLift).lerp(PAL.graphite, fill * 0.5);
      const flick = t < tSketch + 0.35 && t > tSketch - 0.05 ? 0.55 + 0.45 * Math.sign(Math.sin(t * 90 + i)) : 1;
      md.wire.material.color.copy(failed ? hot(PAL.fail, 1.5) : PAL.slate).lerp(hot(PAL.paper, 1.1), fill * 0.8);
      md.wire.material.opacity = draw * flick;
      const liveGlow = fill * (0.25 + 0.75 * m.beatPulse(t, 0.18)) * smooth(invLerp(tLive - 0.1, tLive + 0.2, t));
      const scanHit = scanning ? Math.exp(-Math.abs(scanX - x) * 2.2) * 1.4 : 0;
      md.top.material.color.copy(PAL.ember).multiplyScalar(0.3 + liveGlow * 1.4 + scanHit + kick * fill * 0.3);
      md.top.material.opacity = draw * Math.max(fill * 0.9, scanHit);
      // PASS / FAIL tags appear when the probe passes the module (visible until refactor lands)
      const tagOn = probing || (t >= tClaim && t < tRefactor + 0.6);
      const hit = tagOn && probeX > x - 0.2 ? easeBack(invLerp(0, 0.18, (probeX - x) / 6)) : 0;
      const tagFade = 1 - smooth(invLerp(tRefactor + 0.2, tRefactor + 0.6, t));
      md.tag.pass.set(hot(PAL.pass, 1.6), i !== FAIL ? hit * tagFade : 0, 1, 0.4);
      md.tag.fail.set(hot(PAL.fail, 1.8), i === FAIL ? hit * tagFade : 0, 1, 0.6 + 0.4 * m.beatPulse(t, 0.1, 2));
      for (const tg of [md.tag.pass, md.tag.fail]) { tg.scale.setScalar(0.8 + 0.2 * hit); tg.quaternion.copy(f.cam.quaternion); }
    });

    // ---------- edges
    const ep = this.edges.geometry.attributes.position as THREE.BufferAttribute;
    const edgeDraw = easeOut(invLerp(tSystem - 0.35, tSystem + 0.25, t));
    EDGES.forEach(([a, b], k) => {
      const [ax, az] = pos[a], [bx, bz] = pos[b];
      const u = clamp(edgeDraw * 1.6 - k * 0.09);
      const y = GROUND + 0.02;
      ep.setXYZ(k * 2, ax, y, az);
      ep.setXYZ(k * 2 + 1, lerp(ax, bx, u), y, lerp(az, bz, u));
    });
    ep.needsUpdate = true;
    const liveOn = smooth(invLerp(tLive - 0.1, tLive + 0.3, t));
    this.edges.material.color.copy(PAL.slate).lerp(hot(PAL.cyan, 1.2), liveOn);
    this.edges.material.opacity = 0.9 * edgeDraw;
    // signals: 3 per edge, one leaves on each 8th note
    const mat = new THREE.Matrix4();
    EDGES.forEach(([a, b], k) => {
      for (let j = 0; j < 3; j++) {
        const ph = (bp * 2 + j / 3 + k * 0.37) % 1;
        const [ax, az] = pos[a], [bx, bz] = pos[b];
        const sc = liveOn * Math.sin(Math.PI * ph) * (1 - pack(0) * 0.6);
        mat.makeScale(sc, sc, sc).setPosition(lerp(ax, bx, ph), GROUND + 0.06, lerp(az, bz, ph));
        this.signals.setMatrixAt(k * 3 + j, mat);
      }
    });
    this.signals.instanceMatrix.needsUpdate = true;

    // ---------- reticle: appears on "Refactor", never moves
    const ret = easeBack(invLerp(tRefactor - 0.1, tRefactor + 0.35, t));
    const retFade = 1 - smooth(invLerp(tOpt, tOptEnd, t));
    this.reticle.scale.setScalar(Math.max(0.001, ret * (1 + 0.06 * m.beatPulse(t, 0.12))));
    this.reticle.visible = ret > 0.001 && retFade > 0.01;
    (this.reticle.children[0] as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>).material.opacity = retFade;
    this.reticle.rotation.z = 0;
    const aimW = W(1, 3);
    const aimRv = clamp((t - (aimW.start - 0.05)) / 0.25);
    const aimSettle = clamp((t - aimW.end) / 0.4);
    this.aimLabel.set(PAL.ember.clone().lerp(PAL.paper, aimSettle), retFade, aimRv, 0.8 * (1 - aimSettle));

    // ---------- metric: counts down through "optimize"
    const mu = invLerp(tOpt, tOptEnd + 0.15, t);
    const mi = Math.min(this.metric.length - 1, Math.floor(easeOut(mu, 2) * this.metric.length));
    const mOn = smooth(invLerp(tOpt - 0.1, tOpt + 0.15, t));
    this.metric.forEach((tm, i) => tm.set(i === this.metric.length - 1 ? hot(PAL.pass, 1.3) : PAL.paper, i === mi ? mOn : 0, 1, i === mi ? 0.3 : 0));
    this.metricLabel.set(PAL.slate, mOn, 1);
    const mq = f.cam.quaternion;
    for (const tm of [...this.metric, this.metricLabel]) tm.quaternion.copy(mq);

    // ---------- prompt lines: current at the back of the plan, older ones rise and fade
    let cur = 0;
    this.lines.forEach((l, i) => { if (l.started(t)) cur = i; });
    let caretX = 0, typing = false;
    const baseX = -4.35, baseY = 0.95, baseZ = -1.9;
    this.lines.forEach((l, i) => {
      const age = cur - i;
      const entering = i === cur ? easeOut(invLerp(l.words[0].w.start - 0.3, l.words[0].w.start, t)) : 1;
      const y = baseY + age * 0.62 + (1 - entering) * -0.25;
      l.position.set(baseX, y, baseZ - age * 0.4);
      const vis = i > cur ? 0 : i === cur ? 1 : (age === 1 ? 0.3 : 0);
      const r = l.update(t, { opacity: vis });
      if (i === cur) { caretX = r.caretX; typing = r.typing; }
    });
    const cl = this.lines[cur];
    const promptCaret = new THREE.Vector3(baseX + caretX, baseY + 0.2, baseZ);
    // ---------- the caret: prompt cursor -> probe -> scan plane -> cursor
    const probeBlend = smooth(invLerp(tTest - 0.12, tTest + 0.02, t)) * (1 - smooth(invLerp(tClaim + 0.05, tClaim + 0.25, t)));
    const scanBlend = smooth(invLerp(tPass - 0.12, tPass + 0.02, t)) * (1 - smooth(invLerp(tPass + 0.75, tPass + 0.95, t)));
    if (probeBlend > 0.001) {
      const px = lerp(promptCaret.x, probeX, probeBlend), py = lerp(promptCaret.y, GROUND + 0.55, probeBlend), pz = lerp(promptCaret.z, 0, probeBlend);
      this.caret.pose({ x: px, y: py, z: pz, h: lerp(0.62, 1.1, probeBlend), color: PAL.cyan.clone().lerp(PAL.ember, 1 - probeBlend), intensity: 2.2, trail: probeBlend * 1.4 });
    } else if (scanBlend > 0.001) {
      const px = lerp(promptCaret.x, scanX, scanBlend), py = lerp(promptCaret.y, GROUND + 0.9, scanBlend), pz = lerp(promptCaret.z, 0, scanBlend);
      this.caret.pose({ x: px, y: py, z: pz, h: lerp(0.62, 1.8, scanBlend), intensity: 2.6, trail: scanBlend * 2.2 });
    } else {
      const idle = !typing && cl.done(t);
      this.caret.pose({ x: promptCaret.x, y: promptCaret.y, z: promptCaret.z, h: 0.62, intensity: 1.9, opacity: idle ? blink(bp) : 1 });
    }

    f.post.bloom = 0.8 + liveOn * 0.2;
    f.post.fringe = 0.15 + kick * 0.35;
  }
}
