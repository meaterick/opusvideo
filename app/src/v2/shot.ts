// V2 shot API.  Like V1 scenes, a shot is a pure function of song time: the
// engine calls update() once per temporal sub-sample with that sample's time,
// so motion blur, jitter and depth of field all come from re-evaluating the
// shot, never from accumulated state.
import * as THREE from 'three';
import type { Music } from '../engine/data';
import type { Lighting } from './materials';

export interface Post2 {
  exposure: number;
  halation: number;    // weight of the emissive-only halation (0 = none)
  threshold: number;   // linear HDR level where halation starts (porcelain stays below)
  localContrast: number;
  vignette: number;    // kept below perceptual notice (~0.1)
  lift: number;        // shadow lift so darkness keeps structure
}

export interface F2 {
  t: number;
  /** the time the frame stands for (its shutter centre), the same for all of
   *  its temporal samples.  Discrete graphics (counters, numerals) choose
   *  their state from this, so a step never blends two states in one frame. */
  tf: number;
  m: Music;
  cam: THREE.PerspectiveCamera;
  post: Post2;
  aspect: number;
  /** focus distance (world) and aperture radius (world) for lens-sampled DoF */
  dof: { focus: number; aperture: number } | null;
  /** shots can demand a minimum number of temporal samples (e.g. with DoF) */
  minSamples: number;
  /** where the key light points (shadow frustum centre) */
  lightTarget: THREE.Vector3;
}

export interface BuildCtx { renderer: THREE.WebGLRenderer; env: THREE.Texture }

export abstract class Shot {
  readonly group = new THREE.Group();
  abstract readonly id: string;
  abstract readonly capability: string;
  start = 0;
  end = 0;
  priority = 0;
  lighting?: Lighting;
  constructor(protected m: Music) {}
  abstract build(ctx: BuildCtx): void;
  abstract update(f: F2): void;
}
