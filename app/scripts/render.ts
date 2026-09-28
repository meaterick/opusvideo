#!/usr/bin/env bun
// Offline renderer: drives the app in headless Chromium (?export=1), pulls
// exact frames over a WebSocket and pipes them into ffmpeg with the song.
//
//   bun scripts/render.ts video  [--poc | --from 0 --to 20] [--fps 60] [--samples 1] [--shutter 0.5]
//                                [--crf 16] [--preset slow] [--out ../out/video.mp4] [--noaudio] [--scale 1] [--fade]
//   bun scripts/render.ts stills --t 1.5,23,40.2 [--out ../out/stills]
//   bun scripts/render.ts sheet  [--poc | --from a --to b] [--n 12] [--cols 4] [--out ../out/sheet.png]
//   bun scripts/render.ts perf   [--poc | --from a --to b] [--n 30]
//
// --samples N averages N sub-frames spread over shutter x (1/fps): motion blur.
// Browser: $CHROME_PATH, else Playwright's Chromium in $PLAYWRIGHT_BROWSERS_PATH, else installed Chrome.
// GL: SwiftShader (CPU) on Linux without a GPU; pass --gl angle=metal|gl|vulkan to pick another backend.
// Uses the Vite dev server at --url (default http://localhost:5173) or starts a private one.
import { chromium, type Page } from 'playwright-core';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const mode = argv[0] ?? 'stills';
const opt = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (k: string) => argv.includes(`--${k}`);
const APP = path.resolve(import.meta.dir, '..');
const ROOT = path.resolve(APP, '..');
const SCALE = Math.max(1, Math.round(+opt('scale', '1')!));

async function reachable(url: string) {
  try { return (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; }
}

async function ensureServer() {
  const url = opt('url', 'http://localhost:5173')!;
  if (!flag('fresh') && await reachable(url)) return { url, stop: () => {} };
  const port = 5300 + Math.floor(Math.random() * 500);
  const proc = Bun.spawn(['bunx', 'vite', '--port', String(port), '--strictPort'], {
    cwd: APP, stdout: 'ignore', stderr: 'ignore', env: { ...process.env, OV_NO_HMR: '1' },
  });
  const u = `http://localhost:${port}`;
  for (let i = 0; i < 150 && !(await reachable(u)); i++) await Bun.sleep(100);
  if (!(await reachable(u))) throw new Error('vite dev server did not start');
  return { url: u, stop: () => proc.kill() };
}

function findChrome(): string | undefined {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  if (existsSync(base)) {
    for (const d of readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()) {
      for (const sub of ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const p = path.join(base, d, sub);
        if (existsSync(p)) return p;
      }
    }
  }
  return undefined; // fall back to the installed Chrome channel
}

async function openPage(url: string) {
  const exe = findChrome();
  const gl = opt('gl', process.platform === 'darwin' ? 'angle=metal' : 'angle=swiftshader')!;
  const glArgs = gl === 'angle=swiftshader'
    ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    : [`--use-${gl}`, '--enable-gpu-rasterization'];
  const browser = await chromium.launch({
    ...(exe ? { executablePath: exe } : { channel: 'chrome' }),
    headless: !flag('headed'),
    args: [...glArgs, '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const logs: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`${url}/?export=1${SCALE !== 1 ? `&scale=${SCALE}` : ''}`);
  await page.waitForFunction(() => (window as any).__ov?.ready || (window as any).__ov?.error, null, { timeout: 180000 });
  const err = await page.evaluate(() => (window as any).__ov.error);
  if (err) throw new Error(`app failed to boot:\n${err}\n${logs.join('\n')}`);
  const errors: string[] = await page.evaluate(() => (window as any).__ov.errors);
  if (errors.length) throw new Error('scene build errors:\n' + errors.join('\n'));
  const renderer: string = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  });
  console.log(`browser: ${exe ?? 'chrome channel'}\nwebgl:   ${renderer}`);
  return { browser, page, logs };
}

async function info(page: Page) {
  return page.evaluate(() => { const o = (window as any).__ov; return { duration: o.duration as number, poc: o.poc as { from: number; to: number } }; });
}

function range(inf: { duration: number; poc: { from: number; to: number } }) {
  if (flag('poc')) return [inf.poc.from, inf.poc.to] as const;
  return [+opt('from', '0')!, +opt('to', String(inf.duration))!] as const;
}

async function sceneErrors(page: Page) {
  const e: string[] = await page.evaluate(() => (window as any).__ov.errors);
  if (e.length) throw new Error('scene errors:\n' + e.join('\n'));
}

async function stills(page: Page, times: number[], outDir: string) {
  mkdirSync(outDir, { recursive: true });
  for (const t of times) {
    await page.evaluate((t) => (window as any).__ov.still(t), t);
    const f = path.join(outDir, `f_${t.toFixed(2).padStart(7, '0')}.png`);
    await page.screenshot({ path: f, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
    console.log(f);
  }
  await sceneErrors(page);
}

async function sheet(page: Page, times: number[], cols: number, out: string) {
  const dataUrl: string = await page.evaluate(({ times, cols }) => {
    const O = (window as any).__ov;
    const cw = 480, ch = 270, pad = 4, lab = 18;
    const rows = Math.ceil(times.length / cols);
    const cv = document.createElement('canvas');
    cv.width = cols * (cw + pad) + pad; cv.height = rows * (ch + lab + pad) + pad;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#1a1d24'; c.fillRect(0, 0, cv.width, cv.height);
    const src = document.getElementById('c') as HTMLCanvasElement;
    times.forEach((t: number, i: number) => {
      O.still(t);
      const x = pad + (i % cols) * (cw + pad), y = pad + Math.floor(i / cols) * (ch + lab + pad);
      c.drawImage(src, x, y + lab, cw, ch);
      c.fillStyle = '#ddd'; c.font = '13px monospace'; c.fillText(`${t.toFixed(2)}s`, x + 2, y + 13);
    });
    return cv.toDataURL('image/png');
  }, { times, cols });
  mkdirSync(path.dirname(out), { recursive: true });
  await Bun.write(out, Buffer.from(dataUrl.split(',')[1]!, 'base64'));
  await sceneErrors(page);
  console.log(out);
}

async function perf(page: Page, from: number, to: number, n: number) {
  const ms: number[] = await page.evaluate(({ from, to, n }) => {
    const O = (window as any).__ov;
    const c = document.getElementById('c') as HTMLCanvasElement;
    const gl = (c.getContext('webgl2') as WebGL2RenderingContext);
    const px = new Uint8Array(4);
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const t = from + (to - from) * (i + 0.5) / n;
      const a = performance.now();
      O.still(t);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // GPU sync
      out.push(performance.now() - a);
    }
    return out;
  }, { from, to, n });
  ms.sort((a, b) => a - b);
  console.log(`frame ms: median ${ms[ms.length >> 1].toFixed(1)}  p90 ${ms[Math.floor(ms.length * 0.9)].toFixed(1)}  max ${ms[ms.length - 1].toFixed(1)}`);
}

async function video(page: Page, from: number, to: number, fps: number, out: string) {
  mkdirSync(path.dirname(out), { recursive: true });
  const W = 1920 * SCALE, H = 1080 * SCALE;
  const samples = +opt('samples', '1')!, shutter = +opt('shutter', '0.5')!;
  const audio = path.join(ROOT, 'audio/song.mp3');
  const args = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps), '-i', 'pipe:0'];
  if (!flag('noaudio')) args.push('-ss', from.toFixed(4), '-t', (to - from).toFixed(4), '-i', audio);
  args.push('-map', '0:v');
  if (!flag('noaudio')) args.push('-map', '1:a');
  // --fade: short fade in/out of picture and sound (for excerpts such as the PoC)
  const dur = to - from;
  const fade = flag('fade');
  const vf = fade ? `vflip,fade=t=in:st=0:d=0.2,fade=t=out:st=${(dur - 0.35).toFixed(3)}:d=0.35` : 'vflip';
  args.push('-vf', vf, '-c:v', 'libx264', '-preset', opt('preset', 'slow')!, '-crf', opt('crf', '16')!,
    '-pix_fmt', 'yuv420p', '-tune', 'grain', '-x264-params', 'aq-mode=3', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709');
  if (!flag('noaudio')) {
    const fi = fade ? 0.2 : 0.02, fo = fade ? 0.35 : 0.05;
    args.push('-c:a', 'aac', '-b:a', '320k', '-af', `afade=t=in:d=${fi},afade=t=out:st=${(dur - fo).toFixed(3)}:d=${fo}`);
  }
  args.push('-movflags', '+faststart', out);
  const ff = Bun.spawn(args, { stdin: 'pipe', stdout: 'inherit', stderr: 'inherit' });
  const total = Math.round(to * fps) - Math.round(from * fps);
  let frames = 0;
  const t0 = performance.now();
  const server = Bun.serve({
    port: 0,
    fetch(req, srv) { return srv.upgrade(req) ? undefined : new Response('ws only', { status: 400 }); },
    websocket: {
      maxPayloadLength: W * H * 4 + 1024,
      async message(ws, msg) {
        const buf = msg as unknown as Uint8Array;
        if (buf.byteLength !== W * H * 4) throw new Error(`frame size ${buf.byteLength}`);
        ff.stdin.write(buf);
        await ff.stdin.flush();
        frames++;
        ws.send('k');
        if (frames % 30 === 0 || frames === total) {
          const el = (performance.now() - t0) / 1000;
          process.stdout.write(`\r  frame ${frames}/${total}  ${(frames / el).toFixed(2)} fps  eta ${((total - frames) / (frames / el)).toFixed(0)}s   `);
        }
      },
    },
  });
  const n: number = await page.evaluate(([u, a, b, fps, s, sh]) => (window as any).__ov.stream(u, a, b, fps, s, sh),
    [`ws://localhost:${server.port}`, from, to, fps, samples, shutter] as const);
  // wait for the server side to drain
  for (let i = 0; i < 600 && frames < n; i++) await Bun.sleep(50);
  ff.stdin.end();
  const code = await ff.exited;
  server.stop(true);
  if (code !== 0) throw new Error(`ffmpeg exited ${code}`);
  await sceneErrors(page);
  console.log(`\nwrote ${out}: ${n} frames, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}

const { url, stop } = await ensureServer();
const { browser, page, logs } = await openPage(url);
try {
  const inf = await info(page);
  const [from, to] = range(inf);
  if (mode === 'video') {
    await video(page, from, to, +opt('fps', '60')!, path.resolve(opt('out', path.join(ROOT, 'out', flag('poc') ? 'poc.mp4' : 'video.mp4'))!));
  } else if (mode === 'stills') {
    const ts = opt('t') ? opt('t')!.split(',').map(Number) : Array.from({ length: 6 }, (_, i) => from + (to - from) * (i + 0.5) / 6);
    await stills(page, ts, path.resolve(opt('out', path.join(ROOT, 'out', 'stills'))!));
  } else if (mode === 'sheet') {
    const n = +opt('n', '12')!;
    const ts = opt('times') ? opt('times')!.split(',').map(Number) : Array.from({ length: n }, (_, i) => from + (to - from) * (i + 0.5) / n);
    await sheet(page, ts, +opt('cols', '4')!, path.resolve(opt('out', path.join(ROOT, 'out', 'sheet.png'))!));
  } else if (mode === 'perf') {
    await perf(page, from, to, +opt('n', '30')!);
  } else throw new Error(`unknown mode ${mode}`);
  if (logs.length) console.log('browser log:\n' + logs.slice(0, 30).join('\n'));
} finally {
  await browser.close();
  stop();
}
