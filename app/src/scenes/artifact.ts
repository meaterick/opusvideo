// ARTIFACT — chorus 1, first half.  Capability: turning vague ideas into
// finished artifacts.
//
//   "Call in"           the band stops: black frame, the caret types CALL IN
//   "OPUS" (downbeat)   flash; the caret shoots up into a spine of light; OPUS is
//                       typed on the other side; a vague cloud bursts out
//   "Give the"          the cloud drifts, undecided
//   "difficult"         appears inside the cloud as a blurred, doubled word
//   "a name"            the ghosts snap into one crisp word, a bracket names it
//   "It can reason,"    cloud points snap into a ring graph around the spine
//   "write,"            code lines wrap the spine
//   "and build it"      slabs lock into a tower: the cloud is now the artifact
//   "Then inspect ..."  a scan runs up the tower (past the PoC window)
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import type { Music, Word } from '../engine/data';
import { LyricLine } from '../engine/lyricline';
import { Caret } from '../engine/motif';
import { PAL, hot } from '../engine/palette';
import { TextMesh } from '../engine/type';
import { clamp, easeBack, easeInOut, easeOut, hash, invLerp, lerp, smooth, noise1 } from '../engine/util';

const NP = 4200;
const TOWER_LEVELS = 9;

const cloudVert = /* glsl */ `
  attribute vec4 seed;      // xyz: unit sphere-ish offset, w: 0..1 stagger
  attribute vec3 target;    // where the point sits in the finished artifact
  uniform float time;       // song time (deterministic)
  uniform float condense;   // 0 vague .. 1 artifact
  uniform float burst;      // 0..1 explosion on OPUS
  uniform float size;
  uniform float pulse;
  varying float vHot;
  varying float vAlpha;
  void main(){
    // vague: a slow, curling nebula around the spine
    vec3 s = seed.xyz;
    float r = 2.2 + 1.6 * seed.w;
    vec3 v = s * r;
    v += 0.45 * vec3(sin(time * 0.7 + s.y * 3.1), cos(time * 0.55 + s.z * 2.7), sin(time * 0.63 + s.x * 2.9));
    v.y *= 0.8;
    v *= mix(0.1, 1.0, burst);
    float k = smoothstep(seed.w * 0.45, seed.w * 0.45 + 0.55, condense);
    vec3 p = mix(v, target, k);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size * (1.0 + pulse * 0.6 * (1.0 - k)) * (6.0 / -mv.z) * mix(1.6, 0.9, k);
    vHot = k;
    vAlpha = burst * mix(0.55, 1.0, k);
  }
`;
const cloudFrag = /* glsl */ `
  uniform vec3 cold; uniform vec3 warm;
  varying float vHot; varying float vAlpha;
  void main(){
    vec2 d = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.15, length(d));
    gl_FragColor = vec4(mix(cold, warm, vHot) * a, a * vAlpha);
  }
`;

export class ArtifactScene extends Scene {
  readonly id = 'artifact';
  readonly capability = 'turning vague ideas into finished artifacts';
  priority = 2;
  lines: LyricLine[] = [];
  caret = new Caret();
  callIn!: TextMesh[];
  opus!: TextMesh;
  cloud!: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  ghosts: TextMesh[] = [];
  bracket!: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  ring!: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  code!: THREE.InstancedMesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  slabs!: THREE.InstancedMesh<THREE.BoxGeometry, THREE.MeshLambertMaterial>;
  layerLabels: TextMesh[] = [];
  scan!: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  tower = new THREE.Group();
  private w: (li: number, wi: number) => Word;
  constructor(m: Music, readonly lineIdx: number[], start: number, end: number, readonly landing: number) {
    super(m);
    this.start = start; this.end = end;
    this.w = (li, wi) => this.lines[li].words[wi].w;
  }

  build() {
    const g = this.group;
    g.add(new THREE.AmbientLight(0xffffff, 0.45));
    const key = new THREE.DirectionalLight(0xffe6d0, 1.4);
    key.position.set(3, 5, 6);
    g.add(key);
    const rim = new THREE.DirectionalLight(0x7fdfff, 0.6);
    rim.position.set(-5, 2, -4);
    g.add(rim);
    g.add(this.tower);

    // CALL IN | OPUS around the caret
    const big = { font: 'display' as const, weight: 700, tracking: 0.01 };
    const l0 = this.m.line(this.lineIdx[0]);
    this.callIn = [new TextMesh(l0.words[0].text.toUpperCase(), big, 1.25, 'right'), new TextMesh(l0.words[1].text.toUpperCase(), big, 1.25, 'right')];
    this.opus = new TextMesh(l0.words[2].text.toUpperCase(), big, 1.25, 'left');
    g.add(...this.callIn, this.opus);

    // the cloud: seeds + targets on the finished tower (ring graph, code band, slabs)
    const seed = new Float32Array(NP * 4), target = new Float32Array(NP * 3);
    for (let i = 0; i < NP; i++) {
      const u = hash(i * 3 + 1), v = hash(i * 3 + 2);
      const th = u * Math.PI * 2, ph = Math.acos(2 * v - 1);
      seed.set([Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th), hash(i * 3 + 3)], i * 4);
      const lvl = Math.floor(hash(i * 11 + 5) * TOWER_LEVELS);
      const a = hash(i * 13 + 7) * Math.PI * 2;
      const rr = 0.95 + 0.25 * hash(i * 17 + 9);
      target.set([Math.cos(a) * rr, -2.3 + lvl * 0.52 + hash(i * 19) * 0.3, Math.sin(a) * rr], i * 3);
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(NP * 3), 3));
    cg.setAttribute('seed', new THREE.Float32BufferAttribute(seed, 4));
    cg.setAttribute('target', new THREE.Float32BufferAttribute(target, 3));
    cg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20);
    this.cloud = new THREE.Points(cg, new THREE.ShaderMaterial({
      vertexShader: cloudVert, fragmentShader: cloudFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 }, condense: { value: 0 }, burst: { value: 0 }, size: { value: 7 }, pulse: { value: 0 },
        cold: { value: PAL.slate.clone().multiplyScalar(1.3) }, warm: { value: hot(PAL.emberHot, 1.3) } },
    }));
    this.tower.add(this.cloud);

    // "difficult": ghosts in the cloud, snapping into one word on "name"
    const dw = this.m.line(this.lineIdx[1]).words;
    const diff = dw.find((w) => /difficult/i.test(w.text))?.text ?? 'difficult';
    for (let i = 0; i < 4; i++) {
      const gm = new TextMesh(diff.replace(/[^A-Za-z]/g, ''), { font: 'serif', italic: true, weight: 400, px: 200 }, 1.15, 'center');
      this.ghosts.push(gm);
      g.add(gm);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(16 * 3), 3));
    this.bracket = new THREE.LineSegments(bg, new THREE.LineBasicMaterial({ color: hot(PAL.ember, 1.6), transparent: true }));
    g.add(this.bracket);

    // reason: ring graph (nodes on a ring, chords between them)
    const rp: number[] = [];
    const K = 14;
    for (let i = 0; i < K; i++) {
      const a = (i / K) * Math.PI * 2, b = ((i + 1) / K) * Math.PI * 2, c = ((i + 5) / K) * Math.PI * 2;
      rp.push(Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6, Math.cos(b) * 1.6, 0, Math.sin(b) * 1.6);
      rp.push(Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6, Math.cos(c) * 1.6, 0, Math.sin(c) * 1.6);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
    this.ring = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: hot(PAL.cyan, 1.4), transparent: true }));
    this.tower.add(this.ring);
    // write: code lines (thin bars wrapped on a cylinder)
    this.code = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.045, 0.02), new THREE.MeshBasicMaterial({ color: hot(PAL.paper, 1.0), transparent: true }), 120);
    this.tower.add(this.code);
    // build: slabs
    this.slabs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: PAL.inkLift.clone().lerp(PAL.graphite, 0.6), transparent: true }), TOWER_LEVELS);
    this.tower.add(this.slabs);
    this.scan = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 0.06, 64, 1, true), new THREE.MeshBasicMaterial({ color: hot(PAL.pass, 2.0), transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tower.add(this.scan);

    // lyric lines 2..4 (line 1 is CALL IN OPUS above)
    this.lineIdx.slice(1).forEach((li) => {
      const l = new LyricLine(this.m.line(li), { font: 'display', weight: 500 }, 0.46, 'center');
      this.lines.push(l);
      g.add(l);
    });
    // layer labels for "reason," "write," "build"
    for (const txt of ['reason', 'write', 'build']) {
      const lm = new TextMesh(txt, { font: 'mono', weight: 700, px: 128 }, 0.36, 'left');
      this.layerLabels.push(lm);
      g.add(lm);
    }
    g.add(this.caret);
    this.lines.unshift(new LyricLine(this.m.line(this.lineIdx[0]), {}, 0.01)); // timing only (index 0 = CALL IN OPUS)
  }

  update(f: Frame) {
    const { t, m } = f;
    const W = this.w;
    const call = W(0, 0), inn = W(0, 1), opusW = W(0, 2);
    const land = this.landing; // downbeat where the band lands (OPUS)
    const tGive = W(1, 0).start, tDiff = W(1, 2).start, tName = W(1, 4).start;
    const tIt = W(2, 0).start, tReason = W(2, 2).start, tWrite = W(2, 3).start, tBuild = W(2, 5).start, tBuildEnd = W(2, 6).end;
    const tInspect = this.lines[3] ? W(3, 1).start : tBuildEnd + 0.5;
    const since = t - land;
    const landed = since >= 0;
    const kick = m.pulse('kick', t, 0.1), snare = m.pulse('snare', t, 0.12);

    // ---------- camera: static in the stop, then an orbit around the spine
    const orbit = landed ? 0.12 + since * 0.07 : 0.0;
    const punch = landed ? Math.exp(-since / 0.35) : 0;
    const dist = (landed ? lerp(12.5, 10.8, easeInOut(invLerp(tIt, tBuildEnd, t))) : lerp(9.5, 8.8, invLerp(this.start, land, t))) + punch * 1.4;
    const camY = landed ? lerp(0.5, 3.2, easeInOut(invLerp(tGive, tReason, t))) : 0.1;
    f.cam.position.set(Math.sin(orbit) * dist, camY, Math.cos(orbit) * dist);
    f.cam.lookAt(0, landed ? lerp(0.2, -0.1, easeInOut(invLerp(tGive, tBuildEnd, t))) : 0.1, 0);
    f.cam.fov = 35 + punch * 10 - m.barPulse(t, 0.2) * 0.8 * (landed ? 1 : 0);
    f.cam.updateMatrixWorld();
    const camQ = f.cam.quaternion.clone();

    // ---------- CALL IN | OPUS
    const titleFade = 1 - smooth(invLerp(tGive - 0.35, tGive + 0.1, t));
    const titleUp = easeInOut(invLerp(tGive - 0.4, tGive + 0.2, t));
    const gap = 0.55;
    [call, inn].forEach((w, i) => {
      const tm = this.callIn[i];
      const rv = clamp((t - (w.start - 0.05)) / 0.22);
      const settle = clamp((t - w.end) / 0.3);
      tm.position.set(-gap - (i === 0 ? this.callIn[1].widthWorld + 0.4 : 0), 0.0 + (i === 0 ? 0 : 0) + titleUp * 2.2, 0);
      tm.quaternion.copy(camQ);
      tm.set(PAL.ember.clone().lerp(PAL.paper, settle), titleFade, rv, 0.8 * (1 - settle), 0);
    });
    // CALL above IN? keep them on one line: CALL IN | OPUS
    this.callIn[0].position.x = -gap - this.callIn[1].widthWorld - 0.42;
    const oRv = clamp((t - (Math.min(opusW.start, land) - 0.03)) / 0.18);
    const oSettle = clamp((t - Math.max(opusW.end, land + 0.4)) / 0.6);
    this.opus.position.set(gap, titleUp * 2.2, 0);
    this.opus.quaternion.copy(camQ);
    this.opus.set(hot(PAL.ember, 1.4).lerp(PAL.paper, oSettle * 0.7), titleFade, oRv, 0.6 * (1 - oSettle) + 0.3 * punch, 0);
    // parent the title to the camera-facing plane through the spine
    for (const tm of [...this.callIn, this.opus]) {
      const v = new THREE.Vector3(tm.position.x, tm.position.y, 0).applyQuaternion(camQ);
      tm.position.copy(v);
    }

    // ---------- caret: cursor in the silence, then the spine
    const spine = landed ? easeOut(clamp(since / 0.28), 4) : 0;
    const typingCall = t > call.start - 0.05 && t < inn.end;
    this.caret.pose({
      x: 0, y: lerp(0.3, 0.6, spine), z: 0,
      h: lerp(1.1, 7.5, spine), w: lerp(0.09, 0.075, spine),
      intensity: lerp(2.2, 2.6, spine) + punch * 1.5 + kick * 0.6 * spine,
      glow: lerp(0.6, 0.3, spine) + punch * 0.2,
      opacity: landed || typingCall ? 1 : 0.35 + 0.65 * Math.exp(-((m.beat(t) % 1) * 3)),
    });

    // ---------- the cloud
    const burst = landed ? easeOut(clamp(since / 0.5), 3) : 0;
    const condense = clamp(0.12 * smooth(invLerp(tName, tName + 0.3, t)) + 0.3 * easeOut(invLerp(tReason - 0.05, tReason + 0.35, t))
      + 0.25 * easeOut(invLerp(tWrite - 0.05, tWrite + 0.35, t)) + 0.33 * easeOut(invLerp(tBuild - 0.05, tBuildEnd + 0.1, t)));
    const cu = this.cloud.material.uniforms;
    cu.time.value = t; cu.condense.value = condense; cu.burst.value = burst; cu.pulse.value = kick;
    cu.size.value = 6 + punch * 2;
    this.cloud.visible = burst > 0.001;
    this.tower.rotation.y = landed ? since * 0.25 : 0;

    // ---------- "difficult": ghosts -> one word, bracket
    const dW = W(1, 2);
    const dOn = clamp((t - (dW.start - 0.05)) / 0.3);
    const snap = easeBack(invLerp(tName - 0.02, tName + 0.25, t), 2);
    const dOut = 1 - smooth(invLerp(tReason - 0.3, tReason + 0.1, t));
    this.ghosts.forEach((gm, i) => {
      const jit = (1 - snap) * 0.35;
      const ox = i === 0 ? 0 : noise1(t * 3 + i * 10, i) * jit * 1.8, oy = i === 0 ? 0 : noise1(t * 2.7 + i * 20, i + 5) * jit;
      gm.position.set(ox, 1.2 + oy, 1.6 + i * 0.02);
      gm.quaternion.copy(camQ);
      gm.position.applyQuaternion(camQ);
      const alpha = i === 0 ? dOn : dOn * (1 - snap) * 0.45;
      const settle = clamp((t - (tName + 0.3)) / 0.4);
      gm.set(i === 0 ? PAL.paper.clone().lerp(PAL.ember, snap * (1 - settle)) : PAL.slate, alpha * dOut, 1, i === 0 ? 0.3 + snap * 0.9 * (1 - settle) : 0.1);
    });
    // bracket corners around the named word
    const bw = this.ghosts[0].widthWorld / 2 + 0.25, bh = 0.62, bl = 0.28;
    const corners = [[-bw, bh, 1, -1], [bw, bh, -1, -1], [-bw, -bh + 0.15, 1, 1], [bw, -bh + 0.15, -1, 1]];
    const bp2 = this.bracket.geometry.attributes.position as THREE.BufferAttribute;
    const bs = 1 + (1 - snap) * 0.4;
    corners.forEach(([x, y, sx, sy], k) => {
      const base = new THREE.Vector3(x * bs, 1.2 + 0.3 + y * bs, 1.6);
      const a = base.clone().applyQuaternion(camQ);
      const b = new THREE.Vector3(x * bs + sx * bl, 1.5 + y * bs, 1.6).applyQuaternion(camQ);
      const c = new THREE.Vector3(x * bs, 1.5 + y * bs + sy * bl, 1.6).applyQuaternion(camQ);
      bp2.setXYZ(k * 4, a.x, a.y, a.z); bp2.setXYZ(k * 4 + 1, b.x, b.y, b.z);
      bp2.setXYZ(k * 4 + 2, a.x, a.y, a.z); bp2.setXYZ(k * 4 + 3, c.x, c.y, c.z);
    });
    bp2.needsUpdate = true;
    this.bracket.material.opacity = smooth(invLerp(tName - 0.05, tName + 0.15, t)) * dOut;
    this.bracket.visible = this.bracket.material.opacity > 0.01;

    // ---------- lyric lines 2..4, typed under the artifact, older ones fade
    let cur = 1;
    for (let i = 1; i < this.lines.length; i++) if (this.lines[i].started(t)) cur = i;
    for (let i = 1; i < this.lines.length; i++) {
      const l = this.lines[i];
      const vis = i === cur && t > tGive - 0.3 ? 1 : 0;
      l.position.set(0, -2.55, 2.4).applyQuaternion(camQ);
      l.quaternion.copy(camQ);
      l.update(t, { opacity: vis });
      // the special words live in the artifact instead of the line
      l.words.forEach((lw) => {
        if (/^(difficult|reason|write|build)/i.test(lw.w.text)) lw.mesh.material.uniforms.opacity.value *= 0.28;
      });
    }

    // ---------- tower layers
    // reason: ring graph snaps in at mid height
    const rOn = easeBack(invLerp(tReason - 0.05, tReason + 0.3, t), 1.6);
    this.ring.position.y = 0.9;
    this.ring.scale.setScalar(Math.max(0.001, rOn));
    this.ring.material.opacity = clamp(rOn) * (0.6 + 0.4 * m.beatPulse(t, 0.15));
    this.ring.visible = rOn > 0.001;
    this.ring.rotation.y = -t * 0.3;
    // write: code lines wrap the spine, typed bottom-up over "write,"
    const wOn = invLerp(tWrite - 0.05, tBuild, t);
    const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < 120; i++) {
      const row = i % 24, ring = Math.floor(i / 24);
      const a = (ring / 5) * Math.PI * 2 + row * 0.07;
      const len = (0.25 + 0.55 * hash(i * 7 + 1)) * (row % 6 === 5 ? 0.4 : 1);
      const on = easeOut(clamp(wOn * 1.6 - row / 24 * 0.6 - ring * 0.04), 2);
      p.set(Math.cos(a) * 1.28, -1.2 + row * 0.1, Math.sin(a) * 1.28);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + Math.PI / 2);
      s.set(len * on, on > 0 ? 1 : 0, 1);
      mat.compose(p, q, s);
      this.code.setMatrixAt(i, mat);
    }
    this.code.instanceMatrix.needsUpdate = true;
    this.code.material.opacity = 0.85;
    this.code.visible = wOn > 0;
    // build: slabs lock in, bottom up, one per 16th
    const bOn = invLerp(tBuild - 0.05, tBuildEnd + 0.25, t);
    for (let i = 0; i < TOWER_LEVELS; i++) {
      const on = easeBack(clamp(bOn * 1.8 - i * 0.09), 1.2);
      const y = -2.3 + i * 0.52 + (1 - clamp(on)) * 1.2;
      const wd = (1.5 - Math.abs(i - 4) * 0.06) * Math.max(0.001, clamp(on, 0, 1.2));
      p.set(0, y, 0);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 0.18);
      s.set(wd * 1.7, on > 0 ? 0.3 : 0.001, wd * 1.7);
      mat.compose(p, q, s);
      this.slabs.setMatrixAt(i, mat);
    }
    this.slabs.instanceMatrix.needsUpdate = true;
    this.slabs.visible = bOn > 0;
    this.slabs.material.opacity = 0.92;
    // inspect scan (after the PoC window)
    const insp = invLerp(tInspect - 0.05, tInspect + 1.2, t);
    this.scan.visible = insp > 0 && insp < 1;
    this.scan.position.y = lerp(-2.4, 2.4, easeInOut(insp));
    (this.scan.material as THREE.MeshBasicMaterial).opacity = 0.5;

    // layer labels, typed when the word is sung, placed beside their layer
    const labelAt = [[tReason, 0.9 + 0.2, -1], [tWrite, -0.1, 1], [tBuild, -1.35, -1]] as const;
    const words = [W(2, 2), W(2, 3), W(2, 5)];
    this.layerLabels.forEach((lm, i) => {
      const w = words[i];
      const rv = clamp((t - (w.start - 0.05)) / 0.2);
      const settle = clamp((t - w.end) / 0.4);
      const side = labelAt[i][2];
      const pos = new THREE.Vector3(side * 2.05 - (side < 0 ? lm.widthWorld : 0), labelAt[i][1], 0.6).applyQuaternion(camQ);
      lm.position.copy(pos);
      lm.quaternion.copy(camQ);
      lm.set(hot(i === 0 ? PAL.cyan : i === 1 ? PAL.paper : PAL.ember, 1.15).lerp(PAL.paper, settle * 0.5), rv, 1, 0.35 * (1 - settle));
    });

    // ---------- post
    f.post.flash = landed ? Math.exp(-since / 0.035) * 0.6 : 0;
    f.post.bloom = landed ? 0.95 + 0.25 * kick : 0.7;
    f.post.fringe = 0.15 + punch * 1.2 + snare * 0.25;
    f.post.exposure = landed ? 1.0 : 0.9;
    f.post.vignette = landed ? 0.5 : 0.75;
  }
}
