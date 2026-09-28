// Engine: owns the renderer, the scene graph and the post chain, and renders
// the frame for a given song time.  render(t) is deterministic: the same t
// (and frame number, which only seeds grain) always gives the same image.
import * as THREE from 'three';
import type { Music } from './data';
import { Post, type PostParams } from './post';
import type { Frame, Scene } from './scene';
import { PAL } from './palette';

export const W = 1920, H = 1080;

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly world = new THREE.Scene();
  readonly cam = new THREE.PerspectiveCamera(35, W / H, 0.05, 400);
  readonly post: Post;
  readonly errors: string[] = [];
  constructor(readonly canvas: HTMLCanvasElement, readonly m: Music, readonly scenes: Scene[], readonly scale = 1) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(W * scale, H * scale, false);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // post does its own gamma
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.post = new Post(W * scale, H * scale, 4);
    this.world.background = PAL.ink.clone();
    for (const s of scenes) {
      try { s.build(); } catch (e) { this.errors.push(`${s.id}.build: ${(e as Error).stack}`); }
      s.group.visible = false;
      this.world.add(s.group);
    }
  }

  defaults(): PostParams {
    return { bloom: 0.85, fringe: 0.15, exposure: 1.0, flash: 0, grain: 0.045, vignette: 0.55, flashColor: new THREE.Color(1, 0.8, 0.65), threshold: 0.75 };
  }

  active(t: number) { return this.scenes.filter((s) => t >= s.start && t < s.end); }

  render(t: number, frame: number) {
    const f: Frame = { t, m: this.m, cam: this.cam, post: this.defaults(), aspect: W / H };
    const act = this.active(t).sort((a, b) => a.priority - b.priority);
    for (const s of this.scenes) s.group.visible = false;
    this.cam.position.set(0, 0, 10); this.cam.up.set(0, 1, 0); this.cam.lookAt(0, 0, 0); this.cam.fov = 35;
    for (const s of act) {
      s.group.visible = true;
      try { s.update(f); } catch (e) { const msg = `${s.id}.update(${t.toFixed(3)}): ${(e as Error).stack}`; if (this.errors.length < 50) this.errors.push(msg); }
    }
    this.cam.updateProjectionMatrix();
    this.renderer.setRenderTarget(this.post.sceneRT);
    this.renderer.clear();
    this.renderer.render(this.world, this.cam);
    this.post.render(this.renderer, frame, f.post);
    return f;
  }

  /** RGBA pixels of the canvas (bottom-up rows). */
  read(buf?: Uint8Array) {
    const gl = this.renderer.getContext();
    const w = W * this.scale, h = H * this.scale;
    const out = buf ?? new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return out;
  }

  /** Motion blur: average `n` sub-frames spread over `shutter` of a frame
   *  (centred on t), accumulated in float, returned as RGBA8 bottom-up. */
  readBlurred(t: number, frame: number, fps: number, n: number, shutter: number) {
    const w = W * this.scale, h = H * this.scale;
    if (n <= 1) { this.render(t, frame); return this.read(); }
    const acc = new Float32Array(w * h * 4);
    const tmp = new Uint8Array(w * h * 4);
    for (let i = 0; i < n; i++) {
      const dt = ((i + 0.5) / n - 0.5) * shutter / fps;
      this.render(t + dt, frame);
      this.read(tmp);
      for (let k = 0; k < acc.length; k++) acc[k] += tmp[k];
    }
    for (let k = 0; k < acc.length; k++) tmp[k] = Math.round(acc[k] / n);
    return tmp;
  }
}
