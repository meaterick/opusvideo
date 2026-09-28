// Small deterministic math helpers (no Math.random anywhere in the renderer).

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, x: number) => clamp((x - a) / (b - a));
export const smooth = (x: number) => { x = clamp(x); return x * x * (3 - 2 * x); };
export const smoother = (x: number) => { x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10); };
export const easeOut = (x: number, p = 3) => 1 - Math.pow(1 - clamp(x), p);
export const easeIn = (x: number, p = 3) => Math.pow(clamp(x), p);
export const easeInOut = (x: number, p = 3) => { x = clamp(x); return x < 0.5 ? Math.pow(2 * x, p) / 2 : 1 - Math.pow(2 - 2 * x, p) / 2; };
/** Overshooting ease-out (back). */
export const easeBack = (x: number, s = 1.7) => { x = clamp(x) - 1; return x * x * ((s + 1) * x + s) + 1; };
/** Window: rises over [a, a+fi], holds, falls over [b-fo, b]. */
export const win = (t: number, a: number, b: number, fi = 0.3, fo = 0.3) =>
  Math.min(smooth((t - a) / Math.max(1e-6, fi)), smooth((b - t) / Math.max(1e-6, fo)));

/** Integer hash -> [0, 1). */
export function hash(n: number) {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
export const hash2 = (a: number, b: number) => hash(Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663));
export const hash3 = (a: number, b: number, c: number) => hash(Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791));
/** Smooth 1D value noise in [-1, 1]. */
export function noise1(x: number, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const a = hash2(i, seed) * 2 - 1, b = hash2(i + 1, seed) * 2 - 1;
  return lerp(a, b, smooth(f));
}
