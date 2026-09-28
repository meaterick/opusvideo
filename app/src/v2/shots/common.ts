// Helpers shared by V2 shots.
import type { Cues } from '../cues';
import type { GlyphWord } from '../glyphs';

/**
 * Per-character reveal times for words of a lyric line typed at their sung
 * onsets: each word's characters are stepped across min(word length, cap)
 * seconds (machine typing), and the space after a word appears with its
 * last character.  `from`/`to` pick a range of word indices.
 */
export function typeTimes(c: Cues, linePrefix: string, from = 0, to?: number, cap = 0.26) {
  const line = c.m.line(c.line(linePrefix));
  const words = line.words.slice(from, to);
  const times: number[] = [];
  words.forEach((w, k) => {
    const on = c.on(linePrefix, from + k), dur = Math.min(cap, Math.max(0.08, w.end - w.start));
    [...w.text].forEach((_, j) => times.push(on + (dur * j) / w.text.length));
    if (k < words.length - 1) times.push(on + dur); // the space
  });
  return { text: words.map((w) => w.text).join(' '), times };
}

/** Show glyphs of a word whose reveal time has passed. Returns the index of
 *  the last visible glyph (-1 if none). */
export function reveal(w: GlyphWord, t: number, times: number[]) {
  let last = -1;
  w.glyphs.forEach((g, i) => { g.visible = t >= times[i]; if (g.visible) last = i; });
  return last;
}

/** x (world, local to the word) just after glyph i, for placing a caret. */
export function caretAfter(w: GlyphWord, i: number) {
  return i < 0 ? 0 : w.baseX(i) + w.advance(i);
}
