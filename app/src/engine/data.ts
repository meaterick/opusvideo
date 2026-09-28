// Song data (data/audio.json, data/lyrics.json) and time queries on it.
// Everything here is a pure function of song time t (seconds on the gapless
// mp3 timeline), which keeps every frame deterministic.

export interface Section { name: string; title: string; start: number; end: number; bars: number }
export interface AudioData {
  duration: number;
  bpm: number;
  beat_period: number;
  first_downbeat: number;
  beats: number[];
  downbeats: number[];
  sections: Section[];
  bar_energy: number[];
  energy_events: { t: number; bar: number; kind: 'rise' | 'drop'; db: number }[];
  fps: number;
  env: Record<'rms' | 'low' | 'mid' | 'high' | 'vocal' | 'band', number[]>;
  onsets: Record<'kick' | 'snare' | 'hat' | 'vocal', [number, number][]>;
}
export interface Word { text: string; start: number; end: number; conf: number }
export interface Line { section: string; title: string; text: string; start: number; end: number; words: Word[] }
export interface LyricsData { lines: Line[]; sections: { id: string; title: string; start: number; end: number }[] }

export type EnvName = keyof AudioData['env'];
export type OnsetName = keyof AudioData['onsets'];

/** Largest index i with arr[i] <= t, or -1. */
export function floorIndex(arr: ArrayLike<number>, t: number): number {
  let lo = 0, hi = arr.length - 1, r = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (arr[m] <= t) { r = m; lo = m + 1; } else hi = m - 1;
  }
  return r;
}

/** Continuous position on a monotone grid: i + fraction between grid[i] and
 *  grid[i+1]; extrapolated with the edge spacing outside the grid. */
function gridPos(grid: number[], t: number) {
  const n = grid.length;
  if (t <= grid[0]) return (t - grid[0]) / (grid[1] - grid[0]);
  if (t >= grid[n - 1]) return n - 1 + (t - grid[n - 1]) / (grid[n - 1] - grid[n - 2]);
  const i = floorIndex(grid, t);
  return i + (t - grid[i]) / (grid[i + 1] - grid[i]);
}
/** Inverse of gridPos. */
function gridTime(grid: number[], x: number) {
  const n = grid.length;
  if (x <= 0) return grid[0] + x * (grid[1] - grid[0]);
  if (x >= n - 1) return grid[n - 1] + (x - n + 1) * (grid[n - 1] - grid[n - 2]);
  const i = Math.floor(x);
  return grid[i] + (x - i) * (grid[i + 1] - grid[i]);
}

// The tempo drifts through the song (about 132 -> 135 BPM), so beat and bar
// positions interpolate the analysed beat / downbeat arrays instead of
// assuming a constant period.
export class Music {
  /** Median beat period (s); use periodAt(t) for the local one. */
  readonly P: number;
  readonly bar: number;
  constructor(readonly a: AudioData, readonly l: LyricsData) {
    this.P = a.beat_period;
    this.bar = 4 * a.beat_period;
  }

  /** Continuous beat count (0 at the first beat of the grid). */
  beat(t: number) { return gridPos(this.a.beats, t); }
  /** Continuous bar count (0 at the first downbeat). */
  barPos(t: number) { return gridPos(this.a.downbeats, t); }
  /** 0..1 phase within the current beat. */
  beatPhase(t: number) { const b = this.beat(t); return b - Math.floor(b); }
  barPhase(t: number) { const b = this.barPos(t); return b - Math.floor(b); }
  /** Time of downbeat k (fractional k allowed; extrapolates). */
  downbeat(k: number) { return gridTime(this.a.downbeats, k); }
  /** Time of beat k (fractional k allowed). */
  beatTime(k: number) { return gridTime(this.a.beats, k); }
  /** Local beat period at t. */
  periodAt(t: number) { const b = this.beat(t); return this.beatTime(Math.floor(b) + 1) - this.beatTime(Math.floor(b)); }
  /** Nearest grid time at 1/div beat resolution. */
  snap(t: number, div = 1) { return this.beatTime(Math.round(this.beat(t) * div) / div); }

  /** Envelope value at t, linearly interpolated (0..1). */
  env(name: EnvName, t: number) {
    const e = this.a.env[name];
    const x = t * this.a.fps;
    const i = Math.floor(x);
    if (i < 0) return e[0] ?? 0;
    if (i >= e.length - 1) return e[e.length - 1] ?? 0;
    const f = x - i;
    return e[i] * (1 - f) + e[i + 1] * f;
  }

  /** Sum of exponentially decaying pulses from past onsets of one kind:
   *  1 at the hit, e^-1 after `decay` seconds.  Deterministic in t. */
  pulse(name: OnsetName, t: number, decay = 0.12, lookback = 0.8) {
    const on = this.a.onsets[name];
    let i = floorIndex(cachedTimes(on), t);
    let s = 0;
    for (; i >= 0; i--) {
      const dt = t - on[i][0];
      if (dt > lookback) break;
      s += on[i][1] * Math.exp(-dt / decay);
    }
    return Math.min(1.5, s);
  }

  /** Pulse on the beat grid itself (independent of detected onsets). */
  beatPulse(t: number, decay = 0.12, div = 1) {
    const b = this.beat(t) * div;
    const dt = t - this.beatTime(Math.floor(b) / div);
    return Math.exp(-dt / decay);
  }
  barPulse(t: number, decay = 0.25) {
    const dt = t - this.downbeat(Math.floor(this.barPos(t)));
    return Math.exp(-dt / decay);
  }

  barEnergy(t: number) {
    const k = Math.floor(this.barPos(t));
    const e = this.a.bar_energy;
    return e[Math.max(0, Math.min(e.length - 1, k))] ?? 0;
  }

  section(t: number): Section {
    const s = this.a.sections;
    const i = Math.max(0, floorIndex(s.map((x) => x.start), t));
    return s[i];
  }

  /** Lines of a lyric section, in order. */
  linesOf(section: string) { return this.l.lines.filter((l) => l.section === section); }
  line(index: number) { return this.l.lines[index]; }
  /** Index of the line whose text starts with `prefix` inside `section`. */
  findLine(section: string, prefix: string) {
    const i = this.l.lines.findIndex((l) => l.section === section && l.text.startsWith(prefix));
    if (i < 0) throw new Error(`no line "${prefix}" in ${section}`);
    return i;
  }
}

const timeCache = new WeakMap<object, number[]>();
function cachedTimes(on: [number, number][]) {
  let c = timeCache.get(on);
  if (!c) { c = on.map((o) => o[0]); timeCache.set(on, c); }
  return c;
}

export async function loadMusic(base = './'): Promise<Music> {
  const [a, l] = await Promise.all([
    fetch(`${base}data/audio.json`).then((r) => { if (!r.ok) throw new Error('data/audio.json missing'); return r.json(); }),
    fetch(`${base}data/lyrics.json`).then((r) => { if (!r.ok) throw new Error('data/lyrics.json missing'); return r.json(); }),
  ]);
  return new Music(a, l);
}

/** Karaoke state of a word at time t. */
export function wordState(w: Word, t: number) {
  const lead = 0.06; // light the word a hair before the consonant lands
  const on = t >= w.start - lead;
  const active = on && t < Math.max(w.end, w.start + 0.18);
  const sung = t >= Math.max(w.end, w.start + 0.18);
  // 0..1 progress through the word, 1 afterwards
  const p = Math.max(0, Math.min(1, (t - (w.start - lead)) / Math.max(0.08, w.end - w.start + lead)));
  // attack pulse: 1 at the onset, decays over ~0.25 s
  const hit = on ? Math.exp(-(t - (w.start - lead)) / 0.22) : 0;
  return { on, active, sung, p, hit, since: t - w.start };
}
