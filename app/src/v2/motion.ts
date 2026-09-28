// V2 motion vocabulary (docs/V2_SHOTS.md). Every curve is a pure function
// of normalised time, so motion stays deterministic.
//
//   outExpo      rapid assembly and reveals
//   inExpo       things pulled into the cursor
//   inOutCubic   deliberate camera travel
//   spring       critically damped: mechanical locking, no overshoot
//   springOver   underdamped: impact with overshoot, then settle
//   stepped      diagnostic / machine states
//   impact       anticipation -> acceleration -> impact -> overshoot -> settle,
//                as one curve for a single action

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0..1 progress of t through [a, b]. */
export const prog = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

export const outExpo = (x: number) => { x = clamp01(x); return x === 1 ? 1 : 1 - Math.pow(2, -10 * x); };
export const inExpo = (x: number) => { x = clamp01(x); return x === 0 ? 0 : Math.pow(2, 10 * x - 10); };
export const inOutCubic = (x: number) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
export const outCubic = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
export const inCubic = (x: number) => Math.pow(clamp01(x), 3);
export const outQuart = (x: number) => 1 - Math.pow(1 - clamp01(x), 4);

/** Critically damped spring from 0 to 1, `dt` seconds after release, natural
 *  frequency w (rad/s).  Reaches ~99% at dt = 6.6 / w. */
export function spring(dt: number, w = 30) {
  if (dt <= 0) return 0;
  return 1 - (1 + w * dt) * Math.exp(-w * dt);
}

/** Underdamped spring 0 -> 1 (overshoots), damping ratio z < 1. */
export function springOver(dt: number, w = 28, z = 0.45) {
  if (dt <= 0) return 0;
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * dt) * (Math.cos(wd * dt) + ((z * w) / wd) * Math.sin(wd * dt));
}

/** Decaying impulse: 0 before the hit, jumps to 1 and rings down (for
 *  compression / recoil on impact).  Returns a signed value that settles to 0. */
export function recoil(dt: number, w = 34, z = 0.5) {
  if (dt <= 0) return 0;
  const wd = w * Math.sqrt(1 - z * z);
  return Math.exp(-z * w * dt) * Math.cos(wd * dt);
}

/** Quantise progress into n steps (machine states). */
export const stepped = (x: number, n: number) => Math.min(n, Math.floor(clamp01(x) * n)) / n;

/**
 * One action with weight, over [t0, t0 + dur]:
 *   anticipation: moves `antic` (fraction) the wrong way over the first `a` of
 *   the duration (inOutCubic), then accelerates (inExpo-ish) to the target,
 *   then overshoots and settles with an underdamped spring after `t0 + dur`.
 * Returns position 0 -> 1 (with the anticipation dip and overshoot).
 */
export function action(t: number, t0: number, dur: number, antic = 0.08, a = 0.35, over = true) {
  if (t <= t0) return 0;
  const tA = t0 + dur * a, t1 = t0 + dur;
  if (t < tA) return -antic * Math.sin(Math.PI * inOutCubic((t - t0) / (tA - t0)) * 0.5);
  if (t < t1) {
    const x = (t - tA) / (t1 - tA);
    return lerp(-antic, 1, Math.pow(x, 2.2)); // accelerating into the impact
  }
  return over ? springOver(t - t1 + 0.012, 34, 0.5) : 1;
}

/** Smooth ramp window [a, b] with fade in / out durations. */
export function windowed(t: number, a: number, b: number, fin = 0.2, fout = 0.2) {
  return Math.min(clamp01((t - a) / fin), clamp01((b - t) / fout));
}

/** Seeded hash -> [0, 1). */
export function hash(n: number) {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
export const hash2 = (a: number, b: number) => hash(Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663));

/** Halton low-discrepancy sequence (sub-pixel jitter, lens samples). */
export function halton(i: number, base: number) {
  let f = 1, r = 0;
  while (i > 0) { f /= base; r += f * (i % base); i = Math.floor(i / base); }
  return r;
}
