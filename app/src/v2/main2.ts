// V2 boot: fonts (FontFace for any canvas text + TTF outlines for geometry),
// data, cues, shots -> Engine2.  Export mode exposes window.__ov for
// scripts/render2.ts; the first frame is only allowed once every font, data
// file and shot geometry is loaded (window.__ov.assets reports what loaded).
import { loadMusic } from '../engine/data';
import { loadFonts } from '../engine/type';
import { loadGlyphFonts } from './glyphs';
import { loadCues } from './cues';
import { Engine2, LW, LH } from './engine2';
import { buildShots, POC2 } from './timeline2';

export async function bootV2(qs: URLSearchParams, EXPORT: boolean) {
  const W = +(qs.get('w') ?? (EXPORT ? 3840 : LW)), H = Math.round((W * LH) / LW);
  const [nFonts] = await Promise.all([loadGlyphFonts('./'), loadFonts('./')]);
  const m = await loadMusic('./');
  const cues = await loadCues(m, './');
  const shots = buildShots(m, cues);
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  canvas.width = W; canvas.height = H;
  const eng = new Engine2(canvas, m, shots, W, H);
  // warm-up: compile every shot's shaders before the first real frame
  for (const s of shots) eng.render((s.start + s.end) / 2, 0, { samples: 1, shutter: 0.18, fps: 60 });
  const assets = { glyphFonts: nFonts, faces: document.fonts.size, fontsStatus: document.fonts.status, shots: shots.length };
  return { eng, m, shots, W, H, assets, poc: POC2 };
}

export type V2 = Awaited<ReturnType<typeof bootV2>>;

/** Export API for scripts/render2.ts. */
export function exposeV2(v: V2) {
  const { eng } = v;
  Object.assign(window.__ov, {
    ready: true, v: 2, width: v.W, height: v.H, duration: v.m.a.duration, errors: eng.errors, poc: v.poc, assets: v.assets,
    shots: v.shots.map((s) => ({ id: s.id, start: s.start, end: s.end, capability: s.capability })),
    /** Render one frame into the canvas; returns the sample count used. */
    frame(t: number, frame: number, samples: number | 'auto', shutter = 0.18, fps = 60) {
      return eng.render(t, frame, { samples, shutter, fps });
    },
    probe() { return eng.lastProbe; },
    /** Every light in the world (debugging the lighting balance). */
    lights() {
      const out: string[] = [];
      eng.world.traverse((o: any) => { if (o.isLight) out.push(`${o.type} i=${o.intensity} visible=${o.visible} parentVisible=${o.parent?.visible}`); });
      return { lights: out, env: !!eng.world.environment, envIntensity: (eng.world as any).environmentIntensity };
    },
    /** SHA-256 of the canvas pixels (determinism checks). */
    async hash() {
      const px = eng.read();
      const d = await crypto.subtle.digest('SHA-256', new Uint8Array(px));
      return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
    },
    /** Stream frames at arbitrary song times (stills, sheets) as raw RGBA. */
    async streamTimes(url: string, times: number[], samples: number | 'auto', shutter: number, fps = 60) {
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      await new Promise<void>((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error('ws failed')); });
      let acks = 0;
      const waiters: (() => void)[] = [];
      ws.onmessage = () => { acks++; waiters.shift()?.(); };
      const buf = new Uint8Array(v.W * v.H * 4);
      const counts: number[] = [];
      for (let i = 0; i < times.length; i++) {
        counts.push(eng.render(times[i], Math.round(times[i] * fps), { samples, shutter, fps }));
        eng.read(buf);
        ws.send(buf);
        if (i + 1 - acks > 1) await new Promise<void>((r) => waiters.push(r));
      }
      while (acks < times.length) await new Promise<void>((r) => waiters.push(r));
      ws.close();
      return counts;
    },
    /** Stream frames [f0, f1) as raw RGBA (bottom-up) over a WebSocket. */
    async stream(url: string, f0: number, f1: number, fps: number, samples: number | 'auto', shutter: number) {
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      await new Promise<void>((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error('ws failed')); });
      let acks = 0;
      const waiters: (() => void)[] = [];
      ws.onmessage = () => { acks++; waiters.shift()?.(); };
      const buf = new Uint8Array(v.W * v.H * 4);
      const counts: number[] = [];
      for (let f = f0; f < f1; f++) {
        counts.push(eng.render(f / fps, f, { samples, shutter, fps }));
        eng.read(buf);
        ws.send(buf);
        if (f - f0 + 1 - acks > 2) await new Promise<void>((r) => waiters.push(r));
      }
      while (acks < f1 - f0) await new Promise<void>((r) => waiters.push(r));
      ws.close();
      return counts;
    },
  });
}
