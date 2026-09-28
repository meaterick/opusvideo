// Screen-space anchors shared by consecutive shots, so matter carries across
// cuts exactly (docs/V2_SHOTS.md, "Scene continuity").  All in 1080p pixels.
import { layout } from './glyphs';
import { Rig } from './rig';

/** Shot 3's document line "When the hard parts": font, size and placement. */
export const DOC = { font: 'sans100-500' as const, px: 140, left: Rig.col(2), baseline: 700 };
/** Gap between a text baseline and the line under it. */
export const UNDERLINE_GAP = 26;

/** Pixel extent of the underline under "hard parts" in shot 3 (and where
 *  shot 2's straightened path ends up at its exit). */
export function underlineSpan(text: string, fromWord: number) {
  const L = layout(DOC.font, text);
  const s = DOC.px / 1000; // px per font unit (1000 upm)
  const words = text.split(' ');
  let startChar = 0;
  for (let i = 0; i < fromWord; i++) startChar += words[i].length + 1;
  const g0 = L.glyphs[startChar], gl = L.glyphs[L.glyphs.length - 1];
  return { x0: DOC.left + g0.x * s, x1: DOC.left + (gl.x + gl.adv) * s, y: DOC.baseline + UNDERLINE_GAP };
}

/** Shot 4 -> 5: the collapsed context window, a single vertical stroke. */
export const STROKE = { x: 1180, top: 150, bottom: 930 };
