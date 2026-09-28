// Boot: fonts + data -> timeline -> engine.  Two engines:
//   V2 (default): the directed proof of concept (src/v2), temporal
//                 accumulation renderer; the window outside the PoC is empty.
//   V1 (?v=1):    the first pass, whole song with draft scenes.
// Two modes:
//   preview (default): plays the song through Web Audio, renders at the audio
//                      clock, scrub bar + keyboard transport.
//   export (?export=1): no audio, no UI; exposes window.__ov for the offline
//                      renderers (scripts/render.ts for V1, render2.ts for V2).
// URL params: ?t=12.5 start time, ?poc=1 loop the proof-of-concept window,
//             ?bare=1 hide the UI; V1: ?scale=2; V2: ?w=3840 render width.
import { loadMusic, type Music } from './engine/data';
import { loadFonts } from './engine/type';
import { Engine, W, H } from './engine/engine';
import { buildTimeline, POC } from './timeline';
import { bootV2, exposeV2 } from './v2/main2';

const qs = new URLSearchParams(location.search);
const EXPORT = qs.has('export');
const V1 = qs.get('v') === '1';
const SCALE = Math.max(1, Math.round(+(qs.get('scale') ?? 1)));
const BASE = './';

declare global {
  interface Window { __ov: any }
}
window.__ov = { ready: false, error: null };

interface Player {
  m: Music;
  render(t: number, frame: number): void;
  label(t: number): string;
  starts: number[];
  poc: { from: number; to: number };
  errors: string[];
}

async function bootV1(): Promise<Player | null> {
  await loadFonts(BASE);
  const m = await loadMusic(BASE);
  const scenes = buildTimeline(m);
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  canvas.width = W * SCALE; canvas.height = H * SCALE;
  const eng = new Engine(canvas, m, scenes, SCALE);
  if (eng.errors.length) console.error(eng.errors.join('\n'));
  if (EXPORT) {
    Object.assign(window.__ov, {
      ready: true, v: 1, width: W * SCALE, height: H * SCALE, duration: m.a.duration, errors: eng.errors, poc: POC,
      scenes: scenes.map((s) => ({ id: s.id, start: s.start, end: s.end, capability: s.capability })),
      still(t: number) { eng.render(t, Math.round(t * 60)); return true; },
      /** Stream frames [from, to) over a WebSocket as raw RGBA (bottom-up). */
      async stream(url: string, from: number, to: number, fps: number, samples: number, shutter: number) {
        const ws = new WebSocket(url);
        ws.binaryType = 'arraybuffer';
        await new Promise<void>((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error('ws failed')); });
        let acks = 0;
        const waiters: (() => void)[] = [];
        ws.onmessage = () => { acks++; waiters.shift()?.(); };
        const f0 = Math.round(from * fps), f1 = Math.round(to * fps);
        for (let f = f0; f < f1; f++) {
          const px = eng.readBlurred(f / fps, f, fps, samples, shutter);
          ws.send(px);
          // keep at most 3 frames in flight
          if (f - f0 + 1 - acks > 3) await new Promise<void>((r) => waiters.push(r));
        }
        while (acks < f1 - f0) await new Promise<void>((r) => waiters.push(r));
        ws.close();
        return f1 - f0;
      },
    });
    return null;
  }
  const sceneAt = (t: number) => eng.active(t).sort((a, b) => b.priority - a.priority)[0];
  return {
    m, render: (t, f) => eng.render(t, f), starts: scenes.map((s) => s.start), poc: POC, errors: eng.errors,
    label: (t) => { const s = sceneAt(t); return s ? `<b>${s.id}</b> ${s.capability}` : 'placeholder'; },
  };
}

async function bootV2Player(): Promise<Player | null> {
  const v = await bootV2(qs, EXPORT);
  if (EXPORT) { exposeV2(v); return null; }
  const at = (t: number) => v.eng.active(t).sort((a, b) => b.priority - a.priority)[0];
  return {
    m: v.m, render: (t, f) => { v.eng.render(t, f, { samples: 1, shutter: 0.18, fps: 60 }); }, starts: v.shots.map((s) => s.start),
    poc: v.poc, errors: v.eng.errors,
    label: (t) => { const s = at(t); return s ? `<b>${s.id}</b> ${s.capability}` : 'outside the V2 window'; },
  };
}

async function boot() {
  if (EXPORT) document.body.classList.add('export');
  if (qs.has('bare')) document.body.classList.add('bare');
  const p = V1 ? await bootV1() : await bootV2Player();
  if (!p) return; // export mode: window.__ov is set up
  const { m } = p;

  // ---------------------------------------------------------------- preview
  const gate = document.getElementById('gate')!;
  const playBtn = document.getElementById('play') as HTMLButtonElement;
  const loopBtn = document.getElementById('loop') as HTMLButtonElement;
  const bar = document.getElementById('bar')!;
  const fill = document.getElementById('fill')!;
  const info = document.getElementById('info')!;
  for (const s of m.a.sections) {
    const d = document.createElement('div');
    d.className = 'sec';
    d.style.left = `${(s.start / m.a.duration) * 100}%`;
    d.style.width = `${((s.end - s.start) / m.a.duration) * 100}%`;
    d.textContent = s.name;
    bar.appendChild(d);
  }
  // PoC loop: ?poc=1, #poc, a host page that sets window.OV_DEFAULT_POC, or V2 (PoC only)
  let loop = qs.has('poc') || location.hash === '#poc' || !!(window as any).OV_DEFAULT_POC || !V1;
  loopBtn.style.borderColor = loop ? 'var(--ember)' : '';

  const ac = new AudioContext();
  const buf = await fetch(`${BASE}audio/song.mp3`).then((r) => r.arrayBuffer()).then((b) => ac.decodeAudioData(b));
  let src: AudioBufferSourceNode | null = null;
  let playing = false;
  let t0 = +(qs.get('t') ?? (loop ? p.poc.from : 0)); // song time at the last (re)start
  let c0 = 0; // ac.currentTime at the last (re)start
  const now = () => (playing ? t0 + (ac.currentTime - c0) - (ac.outputLatency || 0) : t0);

  const start = (t: number) => {
    src?.stop(); src = null;
    t0 = Math.max(0, Math.min(m.a.duration - 0.01, t));
    if (playing) {
      src = ac.createBufferSource();
      src.buffer = buf;
      src.connect(ac.destination);
      c0 = ac.currentTime + 0.03;
      src.start(c0, t0);
    }
  };
  const setPlaying = async (on: boolean) => {
    const t = now();
    playing = on;
    if (on) await ac.resume();
    start(t);
    playBtn.textContent = on ? '❚❚ pause' : '▶ play';
  };
  gate.querySelector('.small')!.textContent = 'click to play · space play/pause · ←/→ seek · [ ] shots · l loop PoC · h hide UI';
  gate.onclick = () => { gate.remove(); void setPlaying(true); };
  playBtn.onclick = () => void setPlaying(!playing);
  loopBtn.onclick = () => { loop = !loop; loopBtn.style.borderColor = loop ? 'var(--ember)' : ''; if (loop) start(p.poc.from); };
  const seekFromEvent = (e: PointerEvent) => {
    const r = bar.getBoundingClientRect();
    start(((e.clientX - r.left) / r.width) * m.a.duration);
  };
  bar.addEventListener('pointerdown', (e) => { seekFromEvent(e); bar.setPointerCapture(e.pointerId); });
  bar.addEventListener('pointermove', (e) => { if (e.buttons) seekFromEvent(e); });
  window.addEventListener('keydown', (e) => {
    const t = now();
    if (e.key === ' ') { e.preventDefault(); gate.remove(); void setPlaying(!playing); }
    else if (e.key === 'ArrowRight') start(t + (e.shiftKey ? 5 : 1));
    else if (e.key === 'ArrowLeft') start(t - (e.shiftKey ? 5 : 1));
    else if (e.key === ',') start(t - 1 / 60);
    else if (e.key === '.') start(t + 1 / 60);
    else if (e.key === ']') { const s = p.starts.find((s) => s > t + 0.05); if (s !== undefined) start(s); }
    else if (e.key === '[') { const s = [...p.starts].reverse().find((s) => s < t - 0.3); start(s ?? 0); }
    else if (e.key === 'l') loopBtn.click();
    else if (e.key === 'h') document.body.classList.toggle('bare');
  });

  let frame = 0;
  const tick = () => {
    let t = now();
    if (loop && (t >= p.poc.to || t < p.poc.from - 0.5)) { start(p.poc.from); t = now(); }
    if (t >= m.a.duration) { playing = false; start(0); t = 0; }
    p.render(t, frame++);
    fill.style.width = `${(t / m.a.duration) * 100}%`;
    const sec = m.section(t);
    const mm = Math.floor(t / 60), ss = (t % 60).toFixed(2).padStart(5, '0');
    info.innerHTML = `<b>${mm}:${ss}</b> · ${sec?.name ?? ''} · bar ${Math.floor(m.barPos(t)) + 1}.${Math.floor(m.barPhase(t) * 4) + 1} · ${p.label(t)}`;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  if (qs.has('autoplay')) { gate.remove(); void setPlaying(true); }
  window.__ov = { ready: true, now, errors: p.errors };
}

boot().catch((e) => {
  window.__ov.error = String(e?.stack ?? e);
  document.getElementById('err')!.textContent = String(e?.stack ?? e);
  console.error(e);
});
