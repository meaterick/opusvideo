#!/usr/bin/env bun
// Extract kerning pairs (GPOS pair adjustment, as shaped by fontkit) for the
// characters the video uses, into public/fonts/ttf/<font>.kern.json:
//   { "unitsPerEm": 1000, "capHeight": 720, "pairs": { "AV": -126, ... } }
// opentype.js reads the glyph outlines in the browser but misses class-based
// GPOS kerning; fontkit shapes it correctly, so pairs are precomputed here.
//   bun scripts/kerning.ts
import * as fontkit from 'fontkit';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(import.meta.dir, '../public/fonts/ttf');
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,:;!?-—()[]"\'/→×';

for (const file of readdirSync(DIR).filter((f) => f.endsWith('.ttf'))) {
  const f: any = fontkit.openSync(path.join(DIR, file));
  const pairs: Record<string, number> = {};
  const chars = [...CHARS].filter((c) => f.hasGlyphForCodePoint(c.codePointAt(0)!));
  let failed = 0;
  for (const a of chars) {
    for (const b of chars) {
      try {
        const r = f.layout(a + b);
        if (r.glyphs.length !== 2) continue;
        const k = r.positions[0].xAdvance - r.glyphs[0].advanceWidth;
        if (k !== 0) pairs[a + b] = k;
      } catch { failed++; } // a few glyphs in some static instances have malformed metrics
    }
  }
  if (failed) console.log(`  ${file}: ${failed} pairs could not be shaped (skipped)`);
  const out = { unitsPerEm: f.unitsPerEm, capHeight: f.capHeight, xHeight: f.xHeight, ascent: f.ascent, descent: f.descent, pairs };
  await Bun.write(path.join(DIR, file.replace('.ttf', '.kern.json')), JSON.stringify(out));
  console.log(`${file}: ${Object.keys(pairs).length} kerning pairs, capHeight ${f.capHeight}`);
}
