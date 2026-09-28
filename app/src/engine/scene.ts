// Scene API. A scene owns a THREE.Group and is a pure function of song time:
// update(t) must set every transform / uniform it uses from t alone (no
// accumulated state), so seeking, looping and the offline export all produce
// the same frame for the same t.
import * as THREE from 'three';
import type { Music } from './data';
import type { PostParams } from './post';

export interface Frame {
  t: number;              // song time (s)
  m: Music;
  cam: THREE.PerspectiveCamera;
  post: PostParams;       // scenes adjust the defaults set by the engine
  aspect: number;
}

export abstract class Scene {
  readonly group = new THREE.Group();
  abstract readonly id: string;
  /** Capability this scene is about (shown in the preview HUD, documented in TREATMENT.md). */
  abstract readonly capability: string;
  start = 0;
  end = 0;
  /** Higher priority scenes own the camera when windows overlap. */
  priority = 0;
  constructor(protected m: Music) {}
  /** Called once after the window is known. */
  abstract build(): void;
  abstract update(f: Frame): void;
  /** Local time and 0..1 progress through the window. */
  local(t: number) { return { lt: t - this.start, u: (t - this.start) / Math.max(1e-6, this.end - this.start) }; }
}
