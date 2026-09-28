// SHOTS 5-6 · CALL / IN (docs/V2_SHOTS.md) — chorus impacts 1 and 2
//
// 5 · CALL (23.611-24.113)  hard cut on the sung "Call": four massive
//     porcelain blocks standing on a graphite floor, seen from floor level;
//     the ember stroke left by the collapsed context window stands to their
//     left.  1.5% compression + key flare on impact, then the band stops
//     (23.90) and the stage light dims: only the stroke stays bright.
// 6 · IN   (24.113-24.417)  hard cut, positional match: the stroke IS the
//     ember I; the N fills the frame beside it at a 900 px cap, cropped by
//     the frame, deep extrusion receding.  The I brightens toward the cut.
import * as THREE from 'three';
import { Shot, type BuildCtx, type F2 } from '../shot';
import type { Music } from '../../engine/data';
import type { Cues } from '../cues';
import { COL, Lighting, graphite, porcelain } from '../materials';
import { GlyphWord, layout, fontOf } from '../glyphs';
import { Cursor2 } from '../cursor';
import { Rig } from '../rig';
import { STROKE } from '../continuity';
import { lerp, outExpo, prog, recoil } from '../motion';

const FONT = 'sans75-700' as const;
const CALL_X = 0, IN_X = 60;            // the two words live far apart on one stage
const rigC = new Rig(34, 15);            // CALL camera: 34 deg, 15 units
const rigI = new Rig(40, 11);            // IN camera: wider and closer

export class CallInShot extends Shot {
  readonly id = 'call-in';
  readonly capability = 'called in (chorus impacts 1-2)';
  lighting = new Lighting(20, 1.6);
  priority = 2;
  private call!: GlyphWord;
  private n!: GlyphWord;
  private cursor = new Cursor2();
  private floorY = { call: 0, in: 0 };
  private iBox = { x: 0, w: 0, cap: 0 };
  private emberLight = new THREE.PointLight(0xff6a3d, 0, 0, 2);
  private housing!: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  constructor(m: Music, private c: Cues) { super(m); this.start = 23.611; this.end = 24.417; }

  build(_ctx: BuildCtx) {
    const g = this.group;
    g.add(this.lighting);
    this.lighting.keyDist = 30;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), graphite(new THREE.Color('#1c1f25'), 0.9));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(400, 160), graphite(new THREE.Color('#1c1f25'), 0.95));
    back.position.z = -150;
    back.receiveShadow = true;
    g.add(floor, back);

    // CALL: fitted between the stroke (x = STROKE.x + 60) and the right margin
    const Lc = layout(FONT, 'CALL', { tracking: 24 });
    const capPx = ((1824 - (STROKE.x + 70)) / Lc.width) * fontOf(FONT).kern.capHeight;
    const baseCall = 836;
    this.floorY.call = rigC.y(baseCall);
    this.call = new GlyphWord('CALL', FONT, rigC.px(capPx), porcelain(), { tracking: 24 }, { depth: 1.6, bevel: rigC.px(6) });
    this.call.position.set(CALL_X + rigC.x(STROKE.x + 70), this.floorY.call, 0);
    g.add(this.call);
    floor.position.y = this.floorY.call - 0.001;

    // IN: the N in porcelain; the I is the cursor (ember), sized as the I stem
    const capI = rigI.px(900);
    const baseIn = 1010;
    this.floorY.in = rigI.y(baseIn);
    this.n = new GlyphWord('IN', FONT, capI, porcelain(), { tracking: 10 }, { depth: 2.2, bevel: rigI.px(8) });
    this.n.position.set(IN_X + rigI.x(STROKE.x) - this.n.centerX(0), this.floorY.in, 0);
    this.n.glyphs[0].visible = false; // the I is the cursor
    g.add(this.n);
    const Iadv = this.n.advance(0);
    this.iBox = { x: this.n.position.x + this.n.centerX(0), w: Iadv * 0.62, cap: capI };
    // the I's housing: dim ember glass around the cursor's hot core
    this.housing = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: COL.ember.clone().multiplyScalar(0.12), transparent: true, opacity: 0.5, toneMapped: false, depthWrite: false }));
    g.add(this.housing, this.emberLight);
    g.add(this.cursor);
  }

  update(f: F2) {
    const t = f.t, c = this.c;
    const tCall = c.on('Call in Opus', 0), tIn = c.on('Call in Opus', 1);
    const stop = 23.90;
    const isIn = t >= tIn;
    // ---------------- cameras (hard cut at "in"); floor-level, looking up
    if (!isIn) {
      rigC.place(f.cam, CALL_X, 0, [0, this.floorY.call + 0.22], 15);
      f.cam.lookAt(CALL_X, 0.2, 0);
      f.lightTarget.set(CALL_X, this.floorY.call + 2.5, 0);
    } else {
      rigI.place(f.cam, IN_X, 0, [0, this.floorY.in + 0.18], 11);
      f.cam.lookAt(IN_X, 0.4, 0);
      f.lightTarget.set(IN_X, this.floorY.in + 3, 0);
    }
    // ---------------- light: hard key, flare on each impact, dims when the band stops
    const flare = Math.exp(-Math.max(0, t - (isIn ? tIn : tCall)) / 0.08);
    const dim = outExpo(prog(t, stop, stop + 0.12));
    // the stage key dies with the band; the cursor becomes the light source
    this.lighting.key.intensity = isIn ? 0.22 + 0.4 * flare : (1.6 + 1.0 * flare) * lerp(1, 0.12, dim);
    this.lighting.fill.intensity = 0;
    this.lighting.rim.intensity = isIn ? 0.15 : 0.35;
    f.post.halation = 0.16;
    f.post.localContrast = 0.18;
    f.post.vignette = 0.12;
    // ---------------- impact compression (1.5%) and recovery
    const cr = 1 - 0.015 * Math.max(0, recoil(t - tCall, 36, 0.5));
    this.call.visible = !isIn;
    this.call.scale.set(1 + (1 - cr) * 0.5, cr, 1);
    const nr = 1 - 0.015 * Math.max(0, recoil(t - tIn, 36, 0.5));
    this.n.visible = isIn;
    this.n.scale.set(1, nr, 1);
    // ---------------- the cursor: the stroke, then the I
    if (!isIn) {
      const top = rigC.y(STROKE.top), bottom = this.floorY.call;
      const x = CALL_X + rigC.x(STROKE.x);
      this.cursor.pose({ x, y: (top + bottom) / 2, z: 0.2, h: top - bottom, w: rigC.px(18), notches: 3, intensity: 7 });
      this.emberLight.position.set(x + 0.4, (top + bottom) / 2, 1.2);
      this.emberLight.intensity = lerp(3, 7, dim);
      this.housing.visible = false;
    } else {
      const bright = lerp(7, 10, prog(t, tIn, this.end)) * (1 - 0.02 * Math.max(0, recoil(t - tIn, 36, 0.5)));
      const y = this.floorY.in + this.iBox.cap / 2;
      this.cursor.pose({ x: this.iBox.x, y, z: 0.9, h: this.iBox.cap * 0.97, w: this.iBox.w * 0.26, notches: 4, intensity: bright * 1.4 });
      this.housing.visible = true;
      this.housing.scale.set(this.iBox.w, this.iBox.cap, 1.6);
      this.housing.position.set(this.iBox.x, y, 0.9 - 0.8);
      this.emberLight.position.set(this.iBox.x + this.iBox.w * 0.6, y, 1.4);
      this.emberLight.intensity = 26 * (bright / 10);
    }
  }
}
