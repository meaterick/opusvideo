// Hero typography as geometry.
//
// Glyph outlines come from the TTF instances (opentype.js); kerning comes from
// the precomputed GPOS pair tables (scripts/kerning.ts, fontkit); tracking and
// per-pair optical adjustments are set per shot.  Each glyph is its own mesh,
// so shots animate individual letters.  Instrument Sans width 75 and 100 are
// point-compatible, so a word can morph its width (see GlyphWord.setWidth).
//
// Units: layout is in font units (1000/em, cap height 720); a word is built
// for a cap height in world units.
import * as THREE from 'three';
import opentype from 'opentype.js';
import polygonClipping from 'polygon-clipping';

export type FontId = 'sans75-700' | 'sans100-700' | 'sans75-500' | 'sans100-500' | 'serifItalic' | 'mono500' | 'mono700';
const FILES: Record<FontId, string> = {
  'sans75-700': 'InstrumentSans-w75-700', 'sans100-700': 'InstrumentSans-w100-700',
  'sans75-500': 'InstrumentSans-w75-500', 'sans100-500': 'InstrumentSans-w100-500',
  serifItalic: 'InstrumentSerif-Italic', mono500: 'JetBrainsMono-500', mono700: 'JetBrainsMono-700',
};

interface Kern { unitsPerEm: number; capHeight: number; xHeight: number; pairs: Record<string, number> }
export interface LoadedFont { font: opentype.Font; kern: Kern }
const fonts = new Map<FontId, LoadedFont>();

export async function loadGlyphFonts(base = './') {
  await Promise.all((Object.keys(FILES) as FontId[]).map(async (id) => {
    const [buf, kern] = await Promise.all([
      fetch(`${base}fonts/ttf/${FILES[id]}.ttf`).then((r) => { if (!r.ok) throw new Error(`font ${id} missing`); return r.arrayBuffer(); }),
      fetch(`${base}fonts/ttf/${FILES[id]}.kern.json`).then((r) => r.json()),
    ]);
    fonts.set(id, { font: opentype.parse(buf), kern });
  }));
  return fonts.size;
}
export const fontOf = (id: FontId) => { const f = fonts.get(id); if (!f) throw new Error(`font ${id} not loaded`); return f; };

export interface LayoutOpts {
  /** extra tracking in font units (1/1000 em) */
  tracking?: number;
  /** manual optical adjustments for specific pairs, font units, added to kerning */
  pairs?: Record<string, number>;
  /** per-glyph extra offset after glyph i (font units) */
  after?: number[];
}
export interface Placed { ch: string; index: number; x: number; adv: number }

/** Kerned layout of a string: x of each glyph's origin in font units. */
export function layout(id: FontId, text: string, o: LayoutOpts = {}) {
  const { font, kern } = fontOf(id);
  const out: Placed[] = [];
  let x = 0;
  const chars = [...text];
  chars.forEach((ch, i) => {
    const g = font.charToGlyph(ch);
    const adv = g.advanceWidth ?? 0;
    out.push({ ch, index: i, x, adv });
    x += adv;
    if (i < chars.length - 1) {
      const pair = ch + chars[i + 1];
      x += (kern.pairs[pair] ?? 0) + (o.pairs?.[pair] ?? 0) + (o.tracking ?? 0) + (o.after?.[i] ?? 0);
    }
  });
  const last = out[out.length - 1];
  return { glyphs: out, width: last ? last.x + last.adv : 0 };
}

/** THREE shapes of a glyph (holes resolved), in font units, y up. */
function commandsToShapes(cmds: opentype.PathCommand[]) {
  const sp = new THREE.ShapePath();
  for (const c of cmds) {
    if (c.type === 'M') sp.moveTo(c.x, -c.y);
    else if (c.type === 'L') sp.lineTo(c.x, -c.y);
    else if (c.type === 'Q') sp.quadraticCurveTo(c.x1, -c.y1, c.x, -c.y);
    else if (c.type === 'C') sp.bezierCurveTo(c.x1, -c.y1, c.x2, -c.y2, c.x, -c.y);
  }
  // TrueType outer contours are clockwise in y-down, i.e. CCW once y is flipped
  return sp.toShapes(false);
}

/**
 * Clean shapes: static instances cut from variable fonts keep overlapping
 * contours (the E's arms overlap its stem), which would show as seams in
 * bevels and as internal boxes when outlines are drawn.  Linearise every
 * contour and boolean-union them into outer rings + holes.
 */
export function cleanShapes(cmds: opentype.PathCommand[], divisions = 12): THREE.Shape[] {
  // Nonzero winding, the TrueType fill rule: contours sorted by area, largest
  // first; a contour wound like the largest one adds, the opposite subtracts.
  // Handles overlapping strokes (E), counters (8, B) and islands (the dot in
  // JetBrains Mono's 0) without trusting per-font contour direction.
  const sp = new THREE.ShapePath();
  for (const c of cmds) {
    if (c.type === 'M') sp.moveTo(c.x, -c.y);
    else if (c.type === 'L') sp.lineTo(c.x, -c.y);
    else if (c.type === 'Q') sp.quadraticCurveTo(c.x1, -c.y1, c.x, -c.y);
    else if (c.type === 'C') sp.bezierCurveTo(c.x1, -c.y1, c.x2, -c.y2, c.x, -c.y);
  }
  // Some fonts (JetBrains Mono's 8) draw a bowl and its counter as ONE
  // self-touching "keyhole" contour joined by a zero-width slit.  Split every
  // contour at repeated vertices into simple rings first; the counter then
  // comes out with the opposite winding and is subtracted below.
  const split = (pts: [number, number][]) => {
    const out: [number, number][][] = [];
    const cur: [number, number][] = [];
    const seen = new Map<string, number>();
    const key = (p: [number, number]) => `${Math.round(p[0] * 20)},${Math.round(p[1] * 20)}`;
    for (const p of pts) {
      const k = key(p), j = seen.get(k);
      if (j !== undefined) {
        const loop = cur.splice(j + 1); // points after the first occurrence
        loop.unshift(cur[j]);
        for (const q of loop.slice(1)) seen.delete(key(q));
        if (loop.length > 2) out.push(loop);
      } else { seen.set(k, cur.length); cur.push(p); }
    }
    if (cur.length > 2) out.push(cur);
    return out;
  };
  // Contours that cross themselves (JetBrains Mono's 8 is two figure-eights,
  // each tracing one bowl and the other bowl's counter) are split at every
  // self-intersection into simple loops; each loop keeps its own winding.
  const cross = (a: [number, number], b: [number, number], c: [number, number], d: [number, number]): [number, number] | null => {
    const r1 = b[0] - a[0], r2 = b[1] - a[1], s1 = d[0] - c[0], s2 = d[1] - c[1];
    const den = r1 * s2 - r2 * s1;
    if (Math.abs(den) < 1e-9) return null;
    const u = ((c[0] - a[0]) * s2 - (c[1] - a[1]) * s1) / den, v = ((c[0] - a[0]) * r2 - (c[1] - a[1]) * r1) / den;
    if (u <= 1e-7 || u >= 1 - 1e-7 || v <= 1e-7 || v >= 1 - 1e-7) return null;
    return [a[0] + u * r1, a[1] + u * r2];
  };
  const untangle = (ring: [number, number][], depth = 0): [number, number][][] => {
    const n = ring.length;
    if (depth > 16 || n < 4) return [ring];
    for (let i = 0; i < n; i++) {
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue; // adjacent through the wrap
        const x = cross(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n]);
        if (!x) continue;
        const a: [number, number][] = [x, ...ring.slice(i + 1, j + 1)];
        const b: [number, number][] = [x, ...ring.slice(j + 1), ...ring.slice(0, i + 1)];
        return [...untangle(a, depth + 1), ...untangle(b, depth + 1)];
      }
    }
    return [ring];
  };
  const area = (pts: [number, number][]) => {
    let a = 0;
    for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; a += x0 * y1 - x1 * y0; }
    return a / 2;
  };
  const rings = sp.subPaths.flatMap((p) => {
    const pts = p.getPoints(divisions).map((q) => [q.x, q.y] as [number, number]);
    if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
    return split(pts).flatMap((r) => untangle(r)).map((r) => ({ pts: r, area: area(r) }));
  }).filter((r) => r.pts.length > 2 && Math.abs(r.area) > 1e-3).sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
  if (!rings.length) return [];
  type Ring = [number, number][];
  const outerSign = Math.sign(rings[0].area);
  // each contour is first resolved on its own (a self-touching "keyhole"
  // contour becomes an outer ring + hole), then added or subtracted
  const resolve = (r: Ring) => polygonClipping.union([[r]] as any) as Ring[][];
  let merged: Ring[][] = resolve(rings[0].pts);
  for (const r of rings.slice(1)) {
    const pr = resolve(r.pts);
    merged = (Math.sign(r.area) === outerSign ? polygonClipping.union(merged as any, pr as any) : polygonClipping.difference(merged as any, pr as any)) as Ring[][];
  }
  // polygon-clipping returns closed rings (first point repeated); a glyph with
  // one contour never went through it, so only drop a real duplicate
  const open = (r: Ring) => (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r.slice(0, -1) : r);
  return merged.map((poly) => {
    const [outer, ...holes] = poly;
    const shape = new THREE.Shape(open(outer).map(([x, y]) => new THREE.Vector2(x, y)));
    for (const h of holes) shape.holes.push(new THREE.Path(open(h).map(([x, y]) => new THREE.Vector2(x, y))));
    return shape;
  });
}

function glyphCommands(id: FontId, ch: string) {
  // path at size = unitsPerEm so coordinates are font units (opentype flips y)
  const { font, kern } = fontOf(id);
  return font.charToGlyph(ch).getPath(0, 0, kern.unitsPerEm).commands;
}

/** Glyph contours as point loops in world units (for drawing outlines). */
export function glyphContours(id: FontId, ch: string, capHeight: number, divisions = 10) {
  const scale = capHeight / fontOf(id).kern.capHeight;
  const out: THREE.Vector2[][] = [];
  for (const s of cleanShapes(glyphCommands(id, ch), divisions)) {
    out.push(s.getPoints().map((p) => p.multiplyScalar(scale)));
    for (const h of s.holes) out.push(h.getPoints().map((p) => p.multiplyScalar(scale)));
  }
  return out;
}

/** Interpolate two point-compatible command lists. */
function lerpCommands(a: opentype.PathCommand[], b: opentype.PathCommand[], t: number) {
  if (a.length !== b.length) return t < 0.5 ? a : b;
  return a.map((c, i) => {
    const d = b[i] as any, s = c as any;
    const o: any = { type: c.type };
    for (const k of ['x', 'y', 'x1', 'y1', 'x2', 'y2']) if (k in s) o[k] = s[k] + ((d[k] ?? s[k]) - s[k]) * t;
    return o as opentype.PathCommand;
  });
}

export interface GeoOpts { depth?: number; bevel?: number; curveSegments?: number }

function buildGeometry(cmds: opentype.PathCommand[], scale: number, g: GeoOpts) {
  const shapes = cleanShapes(cmds, g.curveSegments ?? 14);
  let geo: THREE.BufferGeometry;
  if (g.depth && g.depth > 0) {
    const bevel = g.bevel ?? g.depth * 0.08;
    geo = new THREE.ExtrudeGeometry(shapes, {
      depth: g.depth / scale - 2 * (bevel / scale), curveSegments: g.curveSegments ?? 14,
      bevelEnabled: bevel > 0, bevelThickness: bevel / scale, bevelSize: bevel / scale * 0.9, bevelSegments: 3,
    });
    geo.translate(0, 0, -g.depth / scale + bevel / scale); // front face at z = 0
  } else {
    geo = new THREE.ShapeGeometry(shapes, g.curveSegments ?? 14);
  }
  geo.scale(scale, scale, scale);
  geo.computeVertexNormals();
  return geo;
}

/**
 * A word of individual glyph meshes.  Origin: left end of the baseline.
 * `capHeight` is in world units.  Glyph i is `glyphs[i]` (a Group holding its
 * mesh, positioned at its kerned x); animate the groups, not the meshes.
 */
export class GlyphWord extends THREE.Group {
  readonly glyphs: THREE.Group[] = [];
  readonly meshes: THREE.Mesh[] = [];
  readonly placed: Placed[];
  width: number; // world units
  readonly scale0: number; // world units per font unit
  private morph?: { a: FontId; b: FontId; cache: Map<number, THREE.BufferGeometry[]>; o: LayoutOpts; w: number };
  constructor(readonly text: string, readonly font: FontId, readonly capHeight: number, material: THREE.Material | ((i: number) => THREE.Material),
    readonly lay: LayoutOpts = {}, readonly geoOpts: GeoOpts = {}) {
    super();
    const k = fontOf(font).kern;
    this.scale0 = capHeight / k.capHeight;
    const L = layout(font, text, lay);
    this.placed = L.glyphs;
    this.width = L.width * this.scale0;
    L.glyphs.forEach((p, i) => {
      const grp = new THREE.Group();
      grp.position.x = p.x * this.scale0;
      const geo = p.ch === ' ' ? new THREE.BufferGeometry() : buildGeometry(glyphCommands(font, p.ch), this.scale0, geoOpts);
      const mat = typeof material === 'function' ? material(i) : material;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = !!geoOpts.depth;
      mesh.receiveShadow = !!geoOpts.depth;
      grp.add(mesh);
      this.add(grp);
      this.glyphs.push(grp);
      this.meshes.push(mesh);
    });
  }

  /** Glyph advance centre (world, local x) — handy for per-glyph pivots. */
  centerX(i: number) { const p = this.placed[i]; return (p.x + p.adv / 2) * this.scale0; }
  advance(i: number) { return this.placed[i].adv * this.scale0; }

  /** Enable width morphing between this word's font and a compatible one. */
  enableMorph(other: FontId, lay: LayoutOpts = this.lay) {
    this.morph = { a: this.font, b: other, cache: new Map(), o: lay, w: -1 };
  }

  /** Morph width: 0 = this word's font, 1 = the other; rebuilds geometry
   *  (cached per 1/48 step) and re-lays out with kerning of the blend. */
  setWidth(t: number) {
    const m = this.morph;
    if (!m) return;
    const q = Math.round(Math.min(1, Math.max(0, t)) * 48) / 48;
    if (q === m.w) return;
    m.w = q;
    const La = layout(m.a, this.text, this.lay), Lb = layout(m.b, this.text, m.o);
    let geos = m.cache.get(q);
    if (!geos) {
      geos = this.placed.map((p) => p.ch === ' ' ? new THREE.BufferGeometry()
        : buildGeometry(lerpCommands(glyphCommands(m.a, p.ch), glyphCommands(m.b, p.ch), q), this.scale0, this.geoOpts));
      m.cache.set(q, geos);
    }
    geos.forEach((g, i) => { this.meshes[i].geometry = g; });
    this.placed.forEach((p, i) => {
      const x = La.glyphs[i].x + (Lb.glyphs[i].x - La.glyphs[i].x) * q;
      this.glyphs[i].userData.baseX = x * this.scale0;
      this.glyphs[i].position.x = x * this.scale0;
    });
    this.width = (La.width + (Lb.width - La.width) * q) * this.scale0;
  }

  /** Base x of glyph i (after any morph). */
  baseX(i: number) { return this.glyphs[i].userData.baseX ?? this.placed[i].x * this.scale0; }
}
