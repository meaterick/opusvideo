#!/usr/bin/env bun
// V2 offline renderer (temporal accumulation engine, src/v2).
//
//   stills  --t 12.95,14.6 [--samples auto|N] [--w 3840] [--out ../out/v2/stills]
//           full-resolution PNGs (lossless) + a Lanczos 1080p PNG of each
//   sheet   --t a,b,c... [--cols 4] [--out ../out/v2/sheet.png]   (from 1080p renders)
//   video   [--poc | --from a --to b] [--samples auto] [--shutter 0.18] [--fps 60] [--w 3840]
//           [--seg 60] [--name poc]
//           renders lossless FFV1 segments to ../out/v2/<name>/seg_*.mkv (resumable: finished
//           segments are kept), concatenates them into <name>_master.mkv (lossless 4K RGB),
//           then encodes <name>_review_1080p.mp4 (Lanczos, grain after downsampling, BT.709,
//           x264 CRF 12) and <name>_4k.mp4 (x264 CRF 12), both with the song's audio.
//   verify  --t 24.5 [--samples auto]   renders the same timestamp twice (other frames in
//           between) and compares SHA-256 of the pixels; also reports assets loaded
//   perf    --t 12.9 [--samples 1]
//
// Needs ffmpeg (libx264, ffv1) and Chromium (Playwright's, or $CHROME_PATH).
import { chromium, type Page } from 'playwright-core';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const mode = argv[0] ?? 'stills';
const opt = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (k: string) => argv.includes(`--${k}`);
const APP = path.resolve(import.meta.dir, '..');
const ROOT = path.resolve(APP, '..');
const OUT = path.join(ROOT, 'out', 'v2');
const W = +opt('w', '3840')!, H = Math.round((W * 9) / 16);
const SAMPLES: number | 'auto' = opt('samples', 'auto') === 'auto' ? 'auto' : +opt('samples', 'auto')!;
const SHUTTER = +opt('shutter', '0.18')!;
const FPS = +opt('fps', '60')!;

async function reachable(url: string) { try { return (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; } }
async function ensureServer() {
  const port = 5600 + Math.floor(Math.random() * 300);
  const proc = Bun.spawn(['bunx', 'vite', '--port', String(port), '--strictPort'], { cwd: APP, stdout: 'ignore', stderr: 'ignore', env: { ...process.env, OV_NO_HMR: '1' } });
  const u = `http://localhost:${port}`;
  for (let i = 0; i < 200 && !(await reachable(u)); i++) await Bun.sleep(100);
  if (!(await reachable(u))) throw new Error('vite did not start');
  return { url: u, stop: () => proc.kill() };
}
function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  if (existsSync(base)) for (const d of readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()) {
    const p = path.join(base, d, 'chrome-linux/chrome');
    if (existsSync(p)) return p;
  }
  return undefined;
}
async function openPage(url: string) {
  const exe = findChrome();
  const gl = opt('gl', process.platform === 'darwin' ? 'angle=metal' : 'angle=swiftshader')!;
  const glArgs = gl === 'angle=swiftshader' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [`--use-${gl}`];
  const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : { channel: 'chrome' }), headless: true,
    args: [...glArgs, '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const logs: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(`[console] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  page.setDefaultTimeout(0);
  await page.goto(`${url}/?export=1&w=${W}`);
  await page.waitForFunction(() => (window as any).__ov?.ready || (window as any).__ov?.error, null, { timeout: 600000 });
  const st = await page.evaluate(() => ({ err: (window as any).__ov.error, errors: (window as any).__ov.errors, v: (window as any).__ov.v, assets: (window as any).__ov.assets, w: (window as any).__ov.width }));
  if (st.err) throw new Error(`boot failed:\n${st.err}\n${logs.join('\n')}`);
  if (st.v !== 2) throw new Error('page is not the V2 engine');
  if (st.errors.length) throw new Error('shot errors:\n' + st.errors.join('\n'));
  if (st.w !== W) throw new Error(`renders ${st.w}px wide, expected ${W}`);
  if (st.assets.fontsStatus !== 'loaded' || st.assets.glyphFonts < 7) throw new Error(`assets not ready: ${JSON.stringify(st.assets)}`);
  console.log(`webgl: swiftshader=${gl.includes('swiftshader')}  size ${W}x${H}  assets ${JSON.stringify(st.assets)}`);
  return { browser, page, logs };
}
async function shotErrors(page: Page) {
  const e: string[] = await page.evaluate(() => (window as any).__ov.errors);
  if (e.length) throw new Error('shot errors:\n' + e.join('\n'));
}

/** WebSocket receiver: each binary message is one RGBA frame, handed to onFrame. */
function receiver(onFrame: (buf: Uint8Array) => Promise<void> | void) {
  let n = 0;
  const server = Bun.serve({
    port: 0,
    fetch(req, srv) { return srv.upgrade(req) ? undefined : new Response('ws only', { status: 400 }); },
    websocket: {
      maxPayloadLength: W * H * 4 + 1024,
      async message(ws, msg) {
        const buf = new Uint8Array(msg as unknown as ArrayBuffer);
        if (buf.byteLength !== W * H * 4) throw new Error(`frame size ${buf.byteLength}`);
        await onFrame(buf);
        n++;
        ws.send('k');
      },
    },
  });
  return { url: `ws://localhost:${server.port}`, count: () => n, stop: () => server.stop(true) };
}

async function rawToPng(buf: Uint8Array, out: string, scale?: number) {
  const vf = scale ? `vflip,scale=${scale}:-1:flags=lanczos` : 'vflip';
  const ff = Bun.spawn(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-i', 'pipe:0', '-vf', vf, '-frames:v', '1', out], { stdin: 'pipe' });
  ff.stdin.write(buf); await ff.stdin.end();
  if (await ff.exited !== 0) throw new Error('ffmpeg png failed');
}

async function stills(page: Page, times: number[], dir: string) {
  mkdirSync(dir, { recursive: true });
  const files: string[] = [];
  let i = 0;
  const rx = receiver(async (buf) => {
    const k = i++;
    const base = path.join(dir, `v2_${times[k].toFixed(2).padStart(6, '0')}`);
    files[k] = `${base}_${W}.png`;
    await rawToPng(buf, `${base}_${W}.png`);
    await rawToPng(buf, `${base}_1080.png`, 1920);
  });
  const t0 = performance.now();
  const counts: number[] = await page.evaluate(([u, ts, s, sh, fps]) => (window as any).__ov.streamTimes(u, ts, s, sh, fps), [rx.url, times, SAMPLES, SHUTTER, FPS] as const);
  while (rx.count() < times.length) await Bun.sleep(50);
  rx.stop();
  await shotErrors(page);
  times.forEach((t, k) => console.log(`t=${t.toFixed(3)}  ${counts[k]} samples  -> ${files[k]}`));
  console.log(`${((performance.now() - t0) / 1000 / times.length).toFixed(1)} s per still`);
  return files;
}

async function sheet(files1080: string[], labels: string[], cols: number, out: string) {
  // tile the 1080p stills at 480x270 with time labels
  const rows = Math.ceil(files1080.length / cols);
  const inputs = files1080.flatMap((f) => ['-i', f]);
  const lab = (i: number) => `[${i}:v]scale=480:270:flags=lanczos,drawtext=text='${labels[i]}':x=6:y=6:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.55[v${i}]`;
  const pads = files1080.map((_, i) => lab(i)).join(';');
  const blanks = rows * cols - files1080.length;
  let chain = pads;
  const names = files1080.map((_, i) => `[v${i}]`);
  for (let b = 0; b < blanks; b++) { chain += `;color=c=0x111111:s=480x270:d=1[b${b}]`; names.push(`[b${b}]`); }
  const layout = Array.from({ length: rows * cols }, (_, i) => `${(i % cols) * 484}_${Math.floor(i / cols) * 274}`).join('|');
  chain += `;${names.join('')}xstack=inputs=${rows * cols}:layout=${layout}:fill=0x111111[out]`;
  const p = Bun.spawn(['ffmpeg', '-y', '-loglevel', 'error', ...inputs, '-filter_complex', chain, '-map', '[out]', '-frames:v', '1', out]);
  if (await p.exited !== 0) throw new Error('sheet failed');
  console.log(out);
}

async function video(page: Page, from: number, to: number, name: string) {
  const dir = path.join(OUT, name);
  mkdirSync(dir, { recursive: true });
  const f0 = Math.round(from * FPS), f1 = Math.round(to * FPS), seg = +opt('seg', '60')!;
  const log: string[] = [];
  const tStart = performance.now();
  let done = 0;
  for (let a = f0; a < f1; a += seg) {
    const b = Math.min(f1, a + seg);
    const file = path.join(dir, `seg_${String(a).padStart(6, '0')}_${String(b).padStart(6, '0')}.mkv`);
    if (existsSync(file) && statSync(file).size > 1000 && existsSync(file + '.ok')) { done += b - a; continue; }
    const ff = Bun.spawn(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', 'pipe:0',
      '-vf', 'vflip', '-c:v', 'ffv1', '-level', '3', '-g', '1', '-slices', '16', '-slicecrc', '1', '-pix_fmt', 'bgr0', file], { stdin: 'pipe', stderr: 'inherit' });
    const rx = receiver(async (buf) => { ff.stdin.write(buf); await ff.stdin.flush(); });
    const ts = performance.now();
    const counts: number[] = await page.evaluate(([u, x, y, fps, s, sh]) => (window as any).__ov.stream(u, x, y, fps, s, sh), [rx.url, a, b, FPS, SAMPLES, SHUTTER] as const);
    while (rx.count() < b - a) await Bun.sleep(20);
    rx.stop();
    await ff.stdin.end();
    if (await ff.exited !== 0) throw new Error(`ffmpeg segment ${file} failed`);
    writeFileSync(file + '.ok', JSON.stringify({ frames: b - a, samples: counts }));
    done += b - a;
    const el = (performance.now() - tStart) / 1000;
    const hist: Record<number, number> = {};
    counts.forEach((c) => { hist[c] = (hist[c] ?? 0) + 1; });
    const line = `frames ${a}-${b}: ${((performance.now() - ts) / 1000 / (b - a)).toFixed(1)} s/frame, samples ${JSON.stringify(hist)}  [${done}/${f1 - f0}, ${el.toFixed(0)} s]`;
    console.log(line); log.push(line);
    await shotErrors(page);
  }
  // concat -> lossless master
  const list = readdirSync(dir).filter((f) => f.startsWith('seg_') && f.endsWith('.mkv')).sort()
    .filter((f) => { const [, a, b] = f.match(/seg_(\d+)_(\d+)/)!.map(Number); return a >= f0 && b <= f1; });
  writeFileSync(path.join(dir, 'concat.txt'), list.map((f) => `file '${f}'`).join('\n'));
  const master = path.join(OUT, `${name}_master.mkv`);
  await run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'concat.txt'), '-c', 'copy', master]);
  await encodeDeliverables(master, from, to, name);
}

async function run(args: string[]) {
  const p = Bun.spawn(args, { stdout: 'inherit', stderr: 'inherit' });
  if (await p.exited !== 0) throw new Error(`failed: ${args.join(' ')}`);
}

/** Review + 4K deliverables from the lossless master. Grain is added after
 *  downsampling, on luma only (monochromatic), seeded (deterministic). */
async function encodeDeliverables(master: string, from: number, to: number, name: string) {
  const audio = path.join(ROOT, 'audio/song.mp3');
  const dur = to - from;
  const aud = ['-ss', from.toFixed(4), '-t', dur.toFixed(4), '-i', audio];
  const tags = ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv'];
  // fades clamped to the clip (a clip shorter than a fade must not get a negative start)
  const fi = Math.min(0.15, dur / 4), fo = Math.min(0.3, dur / 3);
  const afade = ['-af', `afade=t=in:d=${fi.toFixed(3)},afade=t=out:st=${Math.max(0, dur - fo).toFixed(3)}:d=${fo.toFixed(3)}`, '-c:a', 'aac', '-b:a', '320k'];
  const fade = flag('fade') ? `,fade=t=in:st=0:d=${fi.toFixed(3)},fade=t=out:st=${Math.max(0, dur - fo).toFixed(3)}:d=${fo.toFixed(3)}` : '';
  const grain = +opt('grain', '5')!;
  // review 1080p: Lanczos down, then fine monochrome grain, BT.709 matrix
  await run(['ffmpeg', '-y', '-loglevel', 'error', '-i', master, ...aud, '-map', '0:v', '-map', '1:a',
    // one explicit RGB -> Y'CbCr conversion (BT.709, limited range) right after the Lanczos down,
    // then grain on luma only (monochrome), then 4:2:0
    '-vf', `scale=1920:1080:flags=lanczos+accurate_rnd+full_chroma_int:out_color_matrix=bt709:out_range=tv,format=yuv444p,noise=c0s=${grain}:c0f=t+u:all_seed=7${fade},format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', opt('crf', '12')!, '-x264-params', 'aq-mode=3', ...tags, ...afade, '-movflags', '+faststart', path.join(OUT, `${name}_review_1080p.mp4`)]);
  // 4K high-bitrate
  await run(['ffmpeg', '-y', '-loglevel', 'error', '-i', master, ...aud, '-map', '0:v', '-map', '1:a',
    '-vf', `scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv444p,noise=c0s=${Math.round(grain * 0.8)}:c0f=t+u:all_seed=7${fade},format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', opt('crf', '12')!, '-x264-params', 'aq-mode=3', ...tags, ...afade, '-movflags', '+faststart', path.join(OUT, `${name}_4k.mp4`)]);
  console.log(`wrote ${master}\n      ${path.join(OUT, `${name}_review_1080p.mp4`)}\n      ${path.join(OUT, `${name}_4k.mp4`)}`);
}

async function verify(page: Page, t: number) {
  const a = await page.evaluate(async ([t, s]) => { const O = (window as any).__ov; O.frame(t, Math.round(t * 60), s); return O.hash(); }, [t, SAMPLES] as const);
  // render unrelated frames in between, then the same timestamp again
  await page.evaluate(async ([t, s]) => { const O = (window as any).__ov; O.frame(t + 1.7, 1, s); O.frame(t - 2.3, 2, s); }, [t, SAMPLES] as const);
  const b = await page.evaluate(async ([t, s]) => { const O = (window as any).__ov; O.frame(t, Math.round(t * 60), s); return O.hash(); }, [t, SAMPLES] as const);
  console.log(`t=${t}: ${a}\n       ${b}\n${a === b ? 'IDENTICAL' : 'DIFFERENT'}`);
  if (a !== b) process.exitCode = 1;
}

const { url, stop } = await ensureServer();
const { browser, page, logs } = await openPage(url);
try {
  const poc = await page.evaluate(() => (window as any).__ov.poc as { from: number; to: number });
  const times = (opt('t') ?? '').split(',').filter(Boolean).map(Number);
  if (mode === 'stills') await stills(page, times, path.resolve(opt('out', path.join(OUT, 'stills'))!));
  else if (mode === 'sheet') {
    const dir = path.join(OUT, 'sheet_tmp');
    await stills(page, times, dir);
    const files = times.map((t) => path.join(dir, `v2_${t.toFixed(2).padStart(6, '0')}_1080.png`));
    await sheet(files, times.map((t) => `${t.toFixed(2)}s`), +opt('cols', '4')!, path.resolve(opt('out', path.join(OUT, 'sheet.png'))!));
  } else if (mode === 'video') {
    const from = flag('poc') ? poc.from : +opt('from', String(poc.from))!, to = flag('poc') ? poc.to : +opt('to', String(poc.to))!;
    await video(page, from, to, opt('name', flag('poc') ? 'poc' : `clip_${from}_${to}`)!);
  } else if (mode === 'verify') await verify(page, times[0] ?? 24.5);
  else if (mode === 'perf') {
    const ms = await page.evaluate(([t, s]) => { const O = (window as any).__ov; const a = performance.now(); const n = O.frame(t, 1, s); const px = new Uint8Array(4); const c = document.getElementById('c') as HTMLCanvasElement; (c.getContext('webgl2') as WebGL2RenderingContext).readPixels(0, 0, 1, 1, 0x1908, 0x1401, px); return [performance.now() - a, n, O.probe()]; }, [times[0] ?? 12.9, SAMPLES] as const);
    console.log(`t=${times[0]}: ${(ms[0] as number).toFixed(0)} ms for ${ms[1]} samples (probe ${(+ms[2]).toFixed(2)})`);
  } else throw new Error(`unknown mode ${mode}`);
  if (logs.length) console.log('browser log:\n' + logs.slice(0, 20).join('\n'));
} finally {
  await browser.close();
  stop();
}
